// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('bulk actions', () => {
  test('moves selected notes to Trash and restores them', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-a', title: 'Bulk A', body: 'Body A.' },
      { id: 'bulk-b', title: 'Bulk B', body: 'Body B.' },
      { id: 'bulk-c', title: 'Bulk C', body: 'Body C.' },
    ]);

    await page.locator('#bulk-toggle').click();
    await page.locator('[data-id="bulk-a"] input[type="checkbox"]').check();
    await page.locator('[data-id="bulk-b"] input[type="checkbox"]').check();
    await expect(page.locator('#bulk-selected-count')).toHaveText('2 selected');

    await page.locator('#bulk-move-trash').click();
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-count')).toHaveText('1');

    await page.locator('#trash-view').click();
    await page.locator('#bulk-select-all').click();
    await expect(page.locator('#bulk-selected-count')).toHaveText('2 selected');
    await page.locator('#bulk-restore').click();

    await expect(page.locator('#note-count')).toHaveText('3');
    await page.locator('#active-notes-view').click();
    await expect(page.locator('.note-row')).toHaveCount(3);
  });

  test('adds a tag to selected active notes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-tag-a', title: 'Tag A', body: 'Body A.' },
      { id: 'bulk-tag-b', title: 'Tag B', body: 'Body B.' },
    ]);

    await page.locator('#bulk-toggle').click();
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

    await page.locator('#bulk-toggle').click();
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

    await page.locator('#bulk-toggle').click();
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

  test('permanently deletes selected trashed notes after confirming the native dialog', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'delete-forever-a', title: 'Gone A', body: 'Body A.', deletedAt: Date.now() },
      { id: 'delete-forever-b', title: 'Gone B', body: 'Body B.', deletedAt: Date.now() },
    ]);

    await page.locator('#trash-view').click();
    await page.locator('#bulk-toggle').click();
    await page.locator('[data-id="delete-forever-a"] input[type="checkbox"]').check();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#bulk-delete-forever').click();

    await expect(page.locator('.note-row')).toHaveCount(1);
    const remaining = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).map((n) => n.id));
    expect(remaining).toEqual(['delete-forever-b']);
  });

  test('cancelling the native confirm leaves selected trashed notes untouched', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'keep-forever-a', title: 'Stay A', body: 'Body A.', deletedAt: Date.now() },
    ]);

    await page.locator('#trash-view').click();
    await page.locator('#bulk-toggle').click();
    await page.locator('[data-id="keep-forever-a"] input[type="checkbox"]').check();

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#bulk-delete-forever').click();

    await expect(page.locator('.note-row')).toHaveCount(1);
    const remaining = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).map((n) => n.id));
    expect(remaining).toEqual(['keep-forever-a']);
  });
});
