// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

/**
 * The shares store holds the only copy of a share's decryption key and revoke
 * token. Losing a row means the link can never be redisplayed or revoked, so
 * its lifecycle gets direct coverage.
 */

function share(overrides) {
  return {
    id: 'AbCdEf123456',
    noteId: 'note-1',
    key: 'k'.repeat(43),
    revokeToken: 'token-1',
    sharedAt: 1000,
    expiresAt: 9999999999999,
    titleAtShare: 'As shared',
    ...overrides,
  };
}

async function putShares(page, shares) {
  return page.evaluate(async (rows) => {
    for (const row of rows) await window.ScratchpadDB.putShare(row);
  }, shares);
}

test.describe('shares store', () => {
  test('roundtrips a share by noteId', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [share({})]);
    const rows = await page.evaluate(() => window.ScratchpadDB.getSharesForNote('note-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'AbCdEf123456',
      noteId: 'note-1',
      key: 'k'.repeat(43),
      revokeToken: 'token-1',
      titleAtShare: 'As shared',
    });
  });

  test('returns every live share for one note and none for another', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [
      share({ id: 'aaaaaaaaaaaa' }),
      share({ id: 'bbbbbbbbbbbb', sharedAt: 2000 }),
      share({ id: 'cccccccccccc', noteId: 'note-2' }),
    ]);
    const forNote1 = await page.evaluate(() => window.ScratchpadDB.getSharesForNote('note-1'));
    const forNote3 = await page.evaluate(() => window.ScratchpadDB.getSharesForNote('note-3'));
    expect(forNote1.map((r) => r.id).sort()).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(forNote3).toEqual([]);
  });

  test('getAllShares returns every row', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [share({ id: 'aaaaaaaaaaaa' }), share({ id: 'cccccccccccc', noteId: 'note-2' })]);
    const all = await page.evaluate(() => window.ScratchpadDB.getAllShares());
    expect(all).toHaveLength(2);
  });

  test('removeShare removes only its own row', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [share({ id: 'aaaaaaaaaaaa' }), share({ id: 'bbbbbbbbbbbb' })]);
    await page.evaluate(() => window.ScratchpadDB.removeShare('aaaaaaaaaaaa'));
    const rows = await page.evaluate(() => window.ScratchpadDB.getSharesForNote('note-1'));
    expect(rows.map((r) => r.id)).toEqual(['bbbbbbbbbbbb']);
  });

  test('pruneExpiredShares removes expired rows and returns them, leaving live rows', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [
      share({ id: 'aaaaaaaaaaaa', expiresAt: 500 }),
      share({ id: 'bbbbbbbbbbbb', expiresAt: 900 }),
      share({ id: 'cccccccccccc', expiresAt: 5000 }),
    ]);
    const removed = await page.evaluate(() => window.ScratchpadDB.pruneExpiredShares(1000));
    expect(removed.map((r) => r.id).sort()).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);

    const remaining = await page.evaluate(() => window.ScratchpadDB.getAllShares());
    expect(remaining.map((r) => r.id)).toEqual(['cccccccccccc']);
  });

  test('pruneExpiredShares is a no-op when nothing has expired', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [share({ id: 'cccccccccccc', expiresAt: 5000 })]);
    const removed = await page.evaluate(() => window.ScratchpadDB.pruneExpiredShares(1000));
    expect(removed).toEqual([]);
    const remaining = await page.evaluate(() => window.ScratchpadDB.getAllShares());
    expect(remaining).toHaveLength(1);
  });

  test('deleting a note everywhere also clears its shares', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'note-1', title: 'One', body: 'a' },
      { id: 'note-2', title: 'Two', body: 'b' },
    ]);
    await putShares(page, [
      share({ id: 'aaaaaaaaaaaa', noteId: 'note-1' }),
      share({ id: 'cccccccccccc', noteId: 'note-2' }),
    ]);
    await page.evaluate(() => window.ScratchpadDB.deleteNoteEverywhere('note-1'));

    const all = await page.evaluate(() => window.ScratchpadDB.getAllShares());
    expect(all.map((r) => r.id)).toEqual(['cccccccccccc']);
  });

  test('clearAllStores empties the shares store', async ({ page }) => {
    await gotoApp(page);
    await putShares(page, [share({ id: 'aaaaaaaaaaaa' }), share({ id: 'cccccccccccc', noteId: 'note-2' })]);
    await page.evaluate(() => window.ScratchpadDB.clearAllStores());
    const all = await page.evaluate(() => window.ScratchpadDB.getAllShares());
    expect(all).toEqual([]);
  });

  test('upgrading a v3 database to v4 preserves existing notes', async ({ page }) => {
    // Build a v3 database by hand, then let the app open it at v4. share.html
    // is the staging ground because it is same-origin but opens no IndexedDB
    // connection of its own, so nothing races the hand-built upgrade.
    await page.goto('/share.html');
    await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('scratchpad', 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('updatedAt', 'updatedAt');
        notes.createIndex('deletedAt', 'deletedAt');
        const drafts = db.createObjectStore('drafts', { keyPath: 'noteId' });
        drafts.createIndex('updatedAt', 'updatedAt');
        const revisions = db.createObjectStore('revisions', { keyPath: 'id' });
        revisions.createIndex('noteId', 'noteId');
        revisions.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('folders', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const t = db.transaction('notes', 'readwrite');
        t.objectStore('notes').put({
          id: 'legacy-note', title: 'Survivor', body: 'from v3',
          tags: [], createdAt: 1, updatedAt: 1,
        });
        t.oncomplete = () => { db.close(); resolve(undefined); };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    }));

    await gotoApp(page);
    const notes = await page.evaluate(() => window.ScratchpadDB.getAll());
    expect(notes.find((n) => n.id === 'legacy-note')).toMatchObject({ title: 'Survivor', body: 'from v3' });

    // The new store exists and is usable on the upgraded database.
    await putShares(page, [share({ noteId: 'legacy-note' })]);
    const rows = await page.evaluate(() => window.ScratchpadDB.getSharesForNote('legacy-note'));
    expect(rows).toHaveLength(1);
  });
});
