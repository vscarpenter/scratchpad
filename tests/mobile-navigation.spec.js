// @ts-check
const { test, expect, devices } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.use({ ...devices['iPhone 13'] });

test.describe('mobile navigation — list/editor view switching', () => {
  test('starts on the list, opens a note into the editor, and returns via Back', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'mobile-a', title: 'Mobile A', body: 'Body A.' },
      { id: 'mobile-b', title: 'Mobile B', body: 'Body B.' },
    ]);

    await expect(page.locator('#app-shell')).toHaveClass(/mobile-list/);
    await expect(page.locator('#app-shell')).not.toHaveClass(/mobile-editor/);
    await expect(page.locator('.note-row').first()).toBeVisible();

    await page.locator('[data-id="mobile-a"]').click();
    await expect(page.locator('#app-shell')).toHaveClass(/mobile-editor/);
    await expect(page.locator('#note-title-display')).toHaveText('Mobile A');

    await page.locator('#back-to-list').click();
    await expect(page.locator('#app-shell')).toHaveClass(/mobile-list/);
    await expect(page.locator('#app-shell')).not.toHaveClass(/mobile-editor/);
  });

  test('creating a note switches straight to the editor view', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#app-shell')).toHaveClass(/mobile-list/);

    await page.locator('#new-note').click();
    await expect(page.locator('#app-shell')).toHaveClass(/mobile-editor/);
    await expect(page.locator('#note-editor')).toBeVisible();
  });
});
