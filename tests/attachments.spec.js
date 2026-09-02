// @ts-check
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, importJson, openBackupMenu } = require('./helpers');

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngFile = (name) => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG_1x1, 'base64') });

const V4_SCHEMA = [
  ['notes', 'id', ['updatedAt', 'deletedAt']],
  ['drafts', 'noteId', ['updatedAt']],
  ['revisions', 'id', ['noteId', 'updatedAt']],
  ['folders', 'id', []],
  ['shares', 'id', ['noteId', 'expiresAt']],
];

async function buildV4Database(page) {
  await page.goto('/share.html');
  await page.evaluate(
    (schema) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('scratchpad', 4);
        req.onupgradeneeded = () => {
          for (const [name, keyPath, indexes] of schema) {
            const store = req.result.createObjectStore(name, { keyPath });
            for (const index of indexes) store.createIndex(index, index);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const t = db.transaction('notes', 'readwrite');
          t.objectStore('notes').put({
            id: 'legacy',
            title: 'Survivor',
            body: 'from v4',
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          });
          t.oncomplete = () => {
            db.close();
            resolve(undefined);
          };
          t.onerror = () => reject(t.error);
        };
        req.onerror = () => reject(req.error);
      }),
    V4_SCHEMA,
  );
}

test('upgrading a v4 database to v5 keeps notes and adds the new stores', async ({ page }) => {
  await buildV4Database(page);
  await gotoApp(page);
  await expect(page.locator('.note-row[data-id="legacy"]')).toBeVisible();
  const shape = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('scratchpad');
        req.onsuccess = () => {
          const db = req.result;
          resolve({ version: db.version, stores: Array.from(db.objectStoreNames).sort() });
          db.close();
        };
      }),
  );
  expect(shape.version).toBe(5);
  expect(shape.stores).toEqual(['attachments', 'drafts', 'folders', 'notes', 'revisions', 'settings', 'shares']);
});

test('the attachments store round-trips bytes by note and dies with the note', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'x' }]);
  const result = await page.evaluate(async () => {
    const A = window.ScratchpadAttachments;
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await A.put({ id: 'att-1', noteId: 'host', name: 'a.png', type: 'image/png', size: 3, bytes, createdAt: 1 });
    const stored = await A.get('att-1');
    const forNote = await A.forNote('host');
    await window.ScratchpadDB.deleteNoteEverywhere('host');
    const blob = A.blobOf(stored);
    return { size: blob.size, type: blob.type, count: forNote.length, after: (await A.forNote('host')).length };
  });
  expect(result).toEqual({ size: 3, type: 'image/png', count: 1, after: 0 });
});
