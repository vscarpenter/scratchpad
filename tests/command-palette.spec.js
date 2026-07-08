// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('command palette', () => {
  test('opens from the keyboard and switches to a matching note', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-alpha', title: 'Alpha field notes', body: 'First note.' },
      { id: 'palette-beta', title: 'Beta launch plan', body: 'Second note.' },
    ]);

    await page.keyboard.press('Meta+Shift+P');
    await expect(page.locator('#command-palette-dialog')).toBeVisible();

    await page.locator('#command-palette-input').fill('beta launch');
    await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Beta launch plan');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('#note-title-display')).toHaveText('Beta launch plan');
  });

  test('runs a filtered command', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-existing', title: 'Existing note', body: 'Body.' },
    ]);

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('new note');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-count')).toHaveText('2');
  });
});
