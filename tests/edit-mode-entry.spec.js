// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

const LONG_BODY = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of a long note.`).join('\n\n');

test.describe('entering edit mode', () => {
  test('Edit starts at the top of the note, not the end', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'long-a', title: 'Long note', body: LONG_BODY }]);
    await page.locator('[data-id="long-a"]').click();
    await page.locator('#edit-btn').click();

    const editor = page.locator('#note-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    const position = await editor.evaluate((el) => ({
      start: /** @type {HTMLTextAreaElement} */ (el).selectionStart,
      scrollTop: el.scrollTop,
    }));
    expect(position).toEqual({ start: 0, scrollTop: 0 });
  });

  test('Cmd/Ctrl+E opens the editor from view mode and focuses the body', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'short-a', title: 'Short note', body: 'A body.' }]);
    await page.locator('[data-id="short-a"]').click();
    await expect(page.locator('#note-editor')).toBeHidden();

    await page.keyboard.press('ControlOrMeta+e');
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-editor')).toBeFocused();
  });

  test('Cmd/Ctrl+E does nothing while a dialog is open', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'short-a', title: 'Short note', body: 'A body.' }]);
    await page.locator('[data-id="short-a"]').click();
    await page.keyboard.press('ControlOrMeta+Shift+P');
    await expect(page.locator('#command-palette-dialog')).toHaveAttribute('open', '');

    await page.keyboard.press('ControlOrMeta+e');
    await expect(page.locator('#command-palette-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#note-editor')).toBeHidden();
  });
});
