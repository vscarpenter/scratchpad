// @ts-check
// ? opens the keyboard shortcuts sheet
// (docs/superpowers/specs/2026-10-08-note-navigation-design.md).
const { test, expect } = require('@playwright/test');
const { seedRawNotes, openCommandPalette } = require('./helpers');

/** @param {import('@playwright/test').Page} page */
async function seed(page) {
  await seedRawNotes(page, [{ id: 'note', title: 'Note', body: 'Body' }]);
  await expect(page.locator('#note-title-display')).toHaveText('Note');
}

test('? opens the shortcuts sheet with the About list', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('?');
  const sheet = page.locator('#shortcuts-dialog');
  await expect(sheet).toHaveAttribute('open', '');
  const aboutRows = await page.locator('#about-dialog .shortcut-list li').allTextContents();
  expect(aboutRows.length).toBeGreaterThan(10);
  await expect(sheet.locator('.shortcut-list li')).toHaveText(aboutRows);
  await expect(sheet).toContainText('Quick capture');
  await expect(sheet).toContainText('Find and replace');
  await expect(sheet).toContainText('Show these shortcuts');
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveAttribute('open', '');
});

test('typing ? in a field does not open the sheet', async ({ page }) => {
  await seed(page);
  await page.locator('#search').focus();
  await page.keyboard.press('?');
  await expect(page.locator('#search')).toHaveValue('?');
  await page.locator('#search').fill('');
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').focus();
  await page.keyboard.press('?');
  await expect(page.locator('#note-editor')).toHaveValue(/\?/);
  await expect(page.locator('#shortcuts-dialog')).not.toHaveAttribute('open', '');
});

test('the palette opens the shortcuts sheet', async ({ page }) => {
  await seed(page);
  await openCommandPalette(page);
  await page.locator('#command-palette-input').fill('keyboard shortcuts');
  await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Keyboard shortcuts');
  await page.keyboard.press('Enter');
  await expect(page.locator('#shortcuts-dialog')).toHaveAttribute('open', '');
});
