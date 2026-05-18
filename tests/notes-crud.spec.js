// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

test.describe('notes — create, edit, persist', () => {
  test('creates a note and renders sanitized markdown', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Hello world', 'Body with **bold** text.');

    await expect(page.locator('#note-title-display')).toHaveText('Hello world');
    await expect(page.locator('#note-rendered strong')).toHaveText('bold');
    await expect(page.locator('#note-count')).toHaveText('1');
  });

  test('persists notes across reload (IndexedDB)', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Persisted', 'Survives reload.');

    await page.reload();
    await expect(page.locator('#note-count')).toHaveText('1');
    await page.locator('.note-row').first().click();
    await expect(page.locator('#note-title-display')).toHaveText('Persisted');
    await expect(page.locator('#note-rendered')).toContainText('Survives reload.');
  });

  test('pin toggle flips aria-pressed and persists', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Pin me', 'Pinned note body.');

    const pin = page.locator('#pin-toggle');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await page.locator('.note-row').first().click();
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('delete moves note to trash, then permanent delete clears it', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Doomed', 'Goodbye.');

    await page.locator('#overflow-btn').click();
    await page.locator('#delete-btn').click();
    await page.locator('#confirm-delete').click();

    await expect(page.locator('#note-count')).toHaveText('0');

    await page.locator('#trash-view').click();
    await expect(page.locator('.note-row')).toHaveCount(1);

    await page.locator('.note-row').first().click();
    await page.locator('#permanent-delete-btn').click();
    await page.locator('#confirm-permanent-delete').click();
    await expect(page.locator('.note-row')).toHaveCount(0);
  });
});
