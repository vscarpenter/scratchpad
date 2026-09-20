// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, enterBulkMode, seedShareRow, stubRevoke, holdToConfirm } = require('./helpers');

/**
 * Trashing or destroying a shared note revokes its public links first. These
 * cases moved out of share-link.spec.js unchanged. Every one stubs /api/share,
 * so no network and no AWS is involved.
 */

// Same reason as share-link.spec.js: WebKit routes requests from a page that a
// service worker controls around page.route, so the stub would be skipped.
test.use({ serviceWorkers: 'block' });

const SHARE_ID = 'AbCdEf123456';

test("bulk move to trash revokes the selected notes' links first", async ({ page }) => {
  const revokes = await stubRevoke(page);
  await seedRawNotes(page, [
    { id: 'bulk-share-a', title: 'Bulk share A', body: 'A.' },
    { id: 'bulk-share-b', title: 'Bulk share B', body: 'B.' },
  ]);
  await seedShareRow(page, 'bulk-share-a', SHARE_ID);

  await enterBulkMode(page);
  await page.locator('[data-id="bulk-share-a"] input[type="checkbox"]').check();
  await page.locator('[data-id="bulk-share-b"] input[type="checkbox"]').check();
  await page.locator('#bulk-move-trash').click();
  await expect(page.locator('.note-row')).toHaveCount(0);

  expect(revokes).toHaveLength(1);
  expect(revokes[0].url).toContain('/api/share/' + SHARE_ID);
  expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
});

test('bulk move to trash keeps the row and warns when the revoke fails', async ({ page }) => {
  await stubRevoke(page, { status: 500 });
  await seedRawNotes(page, [{ id: 'bulk-share-a', title: 'Bulk share A', body: 'A.' }]);
  await seedShareRow(page, 'bulk-share-a', SHARE_ID);

  await enterBulkMode(page);
  await page.locator('[data-id="bulk-share-a"] input[type="checkbox"]').check();
  await page.locator('#bulk-move-trash').click();
  await expect(page.locator('.note-row')).toHaveCount(0);

  // The revoke token survives for a retry after restoring the note.
  await expect(page.locator('.toast.is-error')).toContainText('could not be revoked');
  expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toHaveLength(1);
});

test('Empty Trash revokes lingering links before destroying their tokens', async ({ page }) => {
  const revokes = await stubRevoke(page);
  await seedRawNotes(page, [{ id: 'trashed-shared', title: 'Trashed shared', body: 'T.', deletedAt: Date.now() }]);
  await seedShareRow(page, 'trashed-shared', SHARE_ID);

  await page.locator('#trash-view').click();
  await page.locator('.trash-tools button').click();
  await holdToConfirm(page, '#confirm-empty-trash');
  await expect(page.locator('.note-row')).toHaveCount(0);

  expect(revokes).toHaveLength(1);
  expect(revokes[0].token).toBe('revoke-token-' + SHARE_ID);
  expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
});

test('bulk delete forever revokes before the rows are destroyed', async ({ page }) => {
  const revokes = await stubRevoke(page);
  await seedRawNotes(page, [{ id: 'trashed-shared', title: 'Trashed shared', body: 'T.', deletedAt: Date.now() }]);
  await seedShareRow(page, 'trashed-shared', SHARE_ID);

  await page.locator('#trash-view').click();
  await enterBulkMode(page);
  await page.locator('[data-id="trashed-shared"] input[type="checkbox"]').check();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#bulk-delete-forever').click();
  await expect(page.locator('.note-row')).toHaveCount(0);

  expect(revokes).toHaveLength(1);
  expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
});
