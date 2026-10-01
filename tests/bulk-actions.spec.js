// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, enterBulkMode, holdToConfirm, switchView } = require('./helpers');

test.describe('bulk actions', () => {
  test('moves selected notes to Trash and restores them', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-a', title: 'Bulk A', body: 'Body A.' },
      { id: 'bulk-b', title: 'Bulk B', body: 'Body B.' },
      { id: 'bulk-c', title: 'Bulk C', body: 'Body C.' },
    ]);

    await enterBulkMode(page);
    await page.locator('[data-id="bulk-a"] input[type="checkbox"]').check();
    await page.locator('[data-id="bulk-b"] input[type="checkbox"]').check();
    await expect(page.locator('#bulk-selected-count')).toHaveText('2 selected');

    await page.locator('#bulk-move-trash').click();
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-count')).toHaveText('1');

    await switchView(page, 'trash');
    await enterBulkMode(page);
    await page.locator('#bulk-select-all').click();
    await expect(page.locator('#bulk-selected-count')).toHaveText('2 selected');
    await page.locator('#bulk-restore').click();

    await expect(page.locator('#note-count')).toHaveText('3');
    await switchView(page, 'active');
    await expect(page.locator('.note-row')).toHaveCount(3);
  });

  test('adds a tag to selected active notes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-tag-a', title: 'Tag A', body: 'Body A.' },
      { id: 'bulk-tag-b', title: 'Tag B', body: 'Body B.' },
    ]);

    await enterBulkMode(page);
    await page.locator('[data-id="bulk-tag-a"] input[type="checkbox"]').check();
    await page.locator('[data-id="bulk-tag-b"] input[type="checkbox"]').check();
    await page.locator('#bulk-add-tag').click();
    await page.locator('#bulk-tag-input').fill('review');
    await page.locator('#bulk-apply-tag').click();

    await expect(page.locator('#bulk-tag-dialog')).toBeHidden();
    await expect(page.locator('[data-id="bulk-tag-a"]')).toContainText('review');
    await expect(page.locator('[data-id="bulk-tag-b"]')).toContainText('review');
  });

  test('selects all visible notes and clears the selection', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'select-a', title: 'Select A', body: 'Body A.' },
      { id: 'select-b', title: 'Select B', body: 'Body B.' },
      { id: 'select-c', title: 'Select C', body: 'Body C.' },
    ]);

    await enterBulkMode(page);
    await page.locator('#bulk-select-all').click();
    await expect(page.locator('#bulk-selected-count')).toHaveText('3 selected');
    for (const id of ['select-a', 'select-b', 'select-c']) {
      await expect(page.locator(`[data-id="${id}"] input[type="checkbox"]`)).toBeChecked();
    }

    await page.locator('#bulk-clear').click();
    await expect(page.locator('#bulk-selected-count')).toHaveText('0 selected');
    for (const id of ['select-a', 'select-b', 'select-c']) {
      await expect(page.locator(`[data-id="${id}"] input[type="checkbox"]`)).not.toBeChecked();
    }
  });

  test('exports only the selected notes as JSON', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'export-a', title: 'Export A', body: 'Keep me.' },
      { id: 'export-b', title: 'Export B', body: 'Leave me out.' },
    ]);

    await enterBulkMode(page);
    await page.locator('[data-id="export-a"] input[type="checkbox"]').check();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#bulk-export-json').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^scratchpad-selected-.*\.json$/);

    const path = await download.path();
    const fs = require('fs');
    const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
    expect(payload.notes.map((n) => n.id)).toEqual(['export-a']);
  });

  test('delete forever opens the hold-to-confirm dialog and names the count', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'delete-forever-a', title: 'Gone A', body: 'Body A.', deletedAt: Date.now() },
      { id: 'delete-forever-b', title: 'Gone B', body: 'Body B.', deletedAt: Date.now() },
    ]);

    await switchView(page, 'trash');
    await enterBulkMode(page);
    await page.locator('[data-id="delete-forever-a"] input[type="checkbox"]').check();
    await page.locator('[data-id="delete-forever-b"] input[type="checkbox"]').check();
    await page.locator('#bulk-delete-forever').click();

    const dialog = page.locator('#permanent-delete-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2')).toContainText('2 notes');

    // A plain click is not a hold, so nothing happens yet.
    await page.locator('#confirm-permanent-delete').click();
    await expect(page.locator('.note-row')).toHaveCount(2);

    await holdToConfirm(page, '#confirm-permanent-delete');
    await expect(page.locator('.note-row')).toHaveCount(0);
    const remaining = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).map((n) => n.id));
    expect(remaining).toEqual([]);
  });

  test('cancelling the hold dialog leaves selected trashed notes untouched', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'keep-forever-a', title: 'Stay A', body: 'Body A.', deletedAt: Date.now() }]);

    await switchView(page, 'trash');
    await enterBulkMode(page);
    await page.locator('[data-id="keep-forever-a"] input[type="checkbox"]').check();
    await page.locator('#bulk-delete-forever').click();

    const dialog = page.locator('#permanent-delete-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.dialog-foot [data-dialog-close]').click();
    await expect(dialog).toBeHidden();

    await expect(page.locator('.note-row')).toHaveCount(1);
    const remaining = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).map((n) => n.id));
    expect(remaining).toEqual(['keep-forever-a']);
  });
});
