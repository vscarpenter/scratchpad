// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('find bar lifecycle', () => {
  test('opens the find bar with Control+F only while editing', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-alpha', title: 'Find me once', body: 'alpha beta gamma' }]);

    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeHidden();

    await page.locator('.note-row[data-id="find-alpha"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeVisible();
    await expect(page.locator('#find-input')).toBeFocused();
  });

  test('Escape closes the bar and returns focus to the editor', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-escape', title: 'Escape hatch', body: 'needle in the note' }]);

    await page.locator('.note-row[data-id="find-escape"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-input')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#find-bar')).toBeHidden();
    await expect(page.locator('#note-editor')).toBeFocused();
  });
});

test.describe('find bar and edit mode', () => {
  test('leaving edit mode hides an open bar', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-leave', title: 'Stay or leave', body: 'still here' }]);

    await page.locator('.note-row[data-id="find-leave"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeVisible();

    // Save exits edit mode; the bar must not linger over view mode.
    await page.keyboard.press('Control+S');
    await expect(page.locator('#find-bar')).toBeHidden();
  });
});

test.describe('find bar in the command palette', () => {
  test('lists Find in note only while editing and opens from the palette', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-palette', title: 'Palette target', body: 'body text' }]);

    await page.keyboard.press('Control+Shift+P');
    await page.locator('#command-palette-input').fill('find in note');
    await expect(page.locator('#command-palette-list [role="option"]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.locator('.note-row[data-id="find-palette"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+Shift+P');
    await page.locator('#command-palette-input').fill('find in note');
    await expect(page.locator('#command-palette-list [role="option"]')).toHaveCount(1);
    await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Find in note');

    await page.keyboard.press('Enter');
    await expect(page.locator('#find-bar')).toBeVisible();
    await expect(page.locator('#find-input')).toBeFocused();
  });
});
