// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('documented keyboard shortcuts', () => {
  test('creates and saves a note with Control+N and Control+S', async ({ page }) => {
    await gotoApp(page);

    await page.keyboard.press('Control+N');
    await expect(page.locator('#note-editor')).toBeVisible();
    await page.locator('#note-title-input').fill('Keyboard note');
    await page.locator('#note-editor').fill('Saved from the keyboard.');
    await page.keyboard.press('Control+S');

    await expect(page.locator('#save-btn')).toBeHidden();
    await expect(page.locator('#note-title-display')).toHaveText('Keyboard note');
    await expect(page.locator('#note-rendered')).toContainText('Saved from the keyboard.');
  });

  test('opens today and the command palette from their shortcuts', async ({ page }) => {
    await gotoApp(page);

    await page.keyboard.press('Control+Shift+D');
    await expect(page.locator('#note-title-display')).toHaveText(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}$/);

    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('#command-palette-dialog')).toBeVisible();
    await expect(page.locator('#command-palette-input')).toBeFocused();
  });

  test('focuses search with Control+K or slash and Escape clears active filters', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'shortcut-filtered', title: 'Filtered note', body: 'Body.', tags: ['focus'] },
      { id: 'shortcut-other', title: 'Other note', body: 'Body.', tags: [] },
    ]);

    await page.keyboard.press('Control+K');
    await expect(page.locator('#search')).toBeFocused();
    await page.locator('#search').fill('Filtered');
    await expect(page.locator('.note-row')).toHaveCount(1);

    await page.locator('.note-row[data-id="shortcut-filtered"]')
      .getByRole('button', { name: 'Filter notes by tag focus' }).click();
    await page.locator('#search').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#active-filter')).toBeHidden();
    await expect(page.locator('.note-row')).toHaveCount(2);

    await page.locator('#note-rendered').click();
    await page.keyboard.press('/');
    await expect(page.locator('#search')).toBeFocused();
  });

  test('Escape exits clean edits and confirms before discarding dirty edits', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'escape-note', title: 'Escape note', body: 'Saved body.' },
    ]);

    await page.locator('#edit-btn').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#note-editor')).toBeHidden();

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved body.');
    await page.keyboard.press('Escape');
    await expect(page.locator('#discard-dialog')).toBeVisible();
    await page.locator('#discard-dialog').getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.locator('#discard-dialog')).toBeHidden();
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved body.');

    await page.locator('#note-editor').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#discard-dialog')).toBeVisible();
    await page.locator('#confirm-discard').click();
    await expect(page.locator('#note-editor')).toBeHidden();
    await expect(page.locator('#note-rendered')).toContainText('Saved body.');
  });
});
