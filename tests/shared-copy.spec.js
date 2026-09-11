// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, seedFolders } = require('./helpers');

const STASH_KEY = 'scratchpad:pendingSharedNote';

// Stands in for the share viewer: stash on the current same-origin page, then
// land on the action URL in the same tab, exactly as the viewer does.
async function saveStash(page, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  await page.evaluate(([key, text]) => sessionStorage.setItem(key, text), [STASH_KEY, raw]);
  await page.goto('/?action=save-shared');
  await expect(page.locator('#app-shell')).toBeVisible();
}

function storedNotes(page) {
  return page.evaluate(() => window.ScratchpadDB.getAll());
}

test('a stashed shared note is saved as a tagged, unfiled copy and opened', async ({ page }) => {
  await gotoApp(page);
  await saveStash(page, {
    v: 1,
    title: 'Trip plan',
    body: '# Day one\n\nPack light.',
    tags: ['travel', 'Ideas', 'shared'],
  });
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  await expect(page.locator('#note-title-display')).toHaveText('Trip plan');
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate((stashKey) => sessionStorage.getItem(stashKey), STASH_KEY)).toBeNull();
  const copies = (await storedNotes(page)).filter((note) => note.title === 'Trip plan');
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({
    body: '# Day one\n\nPack light.',
    tags: ['travel', 'ideas', 'shared'],
    folderId: null,
    pinned: false,
    deletedAt: null,
  });
});

test('saving the same shared note twice opens the first copy', async ({ page }) => {
  await gotoApp(page);
  const stash = { v: 1, title: 'Twice', body: 'Same words.', tags: [] };
  await saveStash(page, stash);
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  await saveStash(page, stash);
  await expect(page.locator('#toast-region')).toContainText('This note is already in your Scratchpad.');
  await expect(page.locator('#note-title-display')).toHaveText('Twice');
  expect((await storedNotes(page)).filter((note) => note.title === 'Twice')).toHaveLength(1);
});

test('a matching note in Trash does not count as already saved', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'gone', title: 'Gone', body: 'Old words.', deletedAt: Date.now() - 1000 }]);
  await saveStash(page, { v: 1, title: 'Gone', body: 'Old words.', tags: [] });
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  const live = (await storedNotes(page)).filter((note) => !note.deletedAt);
  expect(live).toHaveLength(1);
  expect(live[0].id).not.toBe('gone');
});

test('an archived match counts as already saved', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'kept', title: 'Kept', body: 'Filed away.', archivedAt: Date.now() - 1000 }]);
  await saveStash(page, { v: 1, title: 'Kept', body: 'Filed away.', tags: [] });
  await expect(page.locator('#toast-region')).toContainText('This note is already in your Scratchpad.');
  expect(await storedNotes(page)).toHaveLength(1);
});

test('a restored folder view switches to Home so the list shows the copy', async ({ page }) => {
  await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);
  await page.evaluate(() => localStorage.setItem('scratchpad:folderView', 'f-work'));
  await saveStash(page, { v: 1, title: 'Unfiled copy', body: 'Lands at Home.', tags: [] });
  await expect(page.locator('#toast-region')).toContainText('Saved to your Scratchpad.');
  await expect(page.locator('.note-row', { hasText: 'Unfiled copy' })).toBeVisible();
});

test('a first visit saves the copy alongside the starter notes', async ({ page }) => {
  await page.goto('/share.html');
  await saveStash(page, { v: 1, title: 'First contact', body: 'Hello from a friend.', tags: [] });
  await expect(page.locator('#note-title-display')).toHaveText('First contact');
  await expect(page.locator('.note-row', { hasText: 'Welcome to Scratchpad' })).toBeVisible();
});

test('a damaged or oversized stash is refused and creates nothing', async ({ page }) => {
  await gotoApp(page);
  const refused = [
    '{not json',
    JSON.stringify({ v: 2, title: 't', body: 'b', tags: [] }),
    JSON.stringify({ v: 1, title: 'x'.repeat(241), body: 'b', tags: [] }),
    JSON.stringify({ v: 1, title: 't', body: 'b', tags: Array.from({ length: 21 }, (_, i) => 'tag' + i) }),
  ];
  for (const raw of refused) {
    await saveStash(page, raw);
    await expect(page.locator('#toast-region')).toContainText("Couldn't save the shared note.");
    expect(await storedNotes(page)).toHaveLength(0);
  }
});

test('the save action with nothing stashed creates nothing and says nothing', async ({ page }) => {
  await gotoApp(page);
  await page.goto('/?action=save-shared');
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  expect(await storedNotes(page)).toHaveLength(0);
  await expect(page.locator('#toast-region .toast')).toHaveCount(0);
});

test('a hostile shared title renders as text in the app', async ({ page }) => {
  await gotoApp(page);
  await saveStash(page, { v: 1, title: '<img src=x onerror="window.__pwned=true">', body: 'b', tags: [] });
  await expect(page.locator('#note-title-display')).toContainText('<img');
  await expect(page.locator('#note-title-display img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});
