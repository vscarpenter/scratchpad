const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

test.describe('cross-tab note conflicts', () => {
  test('offers conflict choices instead of silently overwriting another tab', async ({ context, page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Shared note', 'Original body');

    const other = await context.newPage();
    await gotoApp(other);

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Draft from first tab');

    await other.locator('#edit-btn').click();
    await other.locator('#note-editor').fill('Saved from second tab');
    await other.locator('#save-btn').click();

    await expect(page.locator('#note-editor')).toHaveValue('Draft from first tab');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-conflict-dialog')).toBeVisible();
    await expect(page.locator('#save-conflict-copy')).toContainText('changed in another tab');

    await page.locator('#conflict-save-copy').click();
    await expect(page.locator('#save-conflict-dialog')).toBeHidden();

    const bodies = await page.evaluate(async () =>
      (await window.ScratchpadDB.getAll()).map((note) => note.body).sort()
    );
    expect(bodies).toEqual(['Draft from first tab', 'Saved from second tab']);
  });

  test('can keep this tab while preserving the other version in history', async ({ context, page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Conflict history', 'Base body');

    const other = await context.newPage();
    await gotoApp(other);
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Keep first tab');
    await other.locator('#edit-btn').click();
    await other.locator('#note-editor').fill('Keep in history');
    await other.locator('#save-btn').click();

    await page.locator('#save-btn').click();
    await page.locator('#conflict-keep-mine').click();
    await expect(page.locator('#note-rendered')).toContainText('Keep first tab');

    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await expect(page.locator('#history-list')).toContainText('Keep in history');
  });
});
