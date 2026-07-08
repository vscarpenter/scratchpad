// @ts-check
const { test, expect } = require('@playwright/test');
const { createAndSaveNote, gotoApp, seedRawNotes } = require('./helpers');

test.describe('reliability — drafts, history, and failed writes', () => {
  test('keeps the editor open and reports an error when saving fails', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Stable note', 'Saved body.');

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Changed but not saved.');
    await page.evaluate(() => {
      /** @type {any} */ (window.ScratchpadDB).put = async () => {
        throw new Error('simulated write failure');
      };
    });

    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeVisible();
    await expect(page.locator('#note-editor')).toHaveValue('Changed but not saved.');
    await expect(page.locator('.toast.is-error')).toContainText('Save failed');
  });

  test('offers to restore a newer draft after reload', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Draft source', 'Saved body.');

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved draft body.');
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.locator('#draft-dialog')).toBeVisible();
    await page.locator('#restore-draft').click();
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved draft body.');
    await expect(page.locator('#dirty-indicator')).toBeVisible();
  });

  test('restores a saved revision from history', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Revisioned', 'Version one.');

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Version two.');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-rendered')).toContainText('Version two.');

    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await expect(page.locator('#history-dialog')).toBeVisible();
    await page.locator('#history-list .history-row button', { hasText: 'Restore' }).first().click();
    await expect(page.locator('#history-dialog')).toBeHidden();
    await expect(page.locator('#note-rendered')).toContainText('Version one.');
  });

  test('renames and filters tags through the tag manager', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'tagged', title: 'Tagged note', body: 'Tagged body.', tags: ['old-tag'] },
      { id: 'untagged', title: 'Plain note', body: 'Plain body.', tags: [] },
    ]);

    await page.locator('#manage-tags').click();
    await expect(page.locator('#tag-manager-dialog')).toBeVisible();
    await page.locator('#tag-manager-list .tag-rename-input').fill('new-tag');
    await page.locator('#tag-manager-list button', { hasText: 'Rename' }).click();
    await expect(page.locator('#tag-manager-list .tag-rename-input')).toHaveValue('new-tag');

    await page.locator('#tag-manager-list button', { hasText: 'Filter' }).click();
    await expect(page.locator('#tag-manager-dialog')).toBeHidden();
    await expect(page.locator('#active-filter-tag')).toHaveText('#new-tag');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-title-display')).toHaveText('Tagged note');
  });
});
