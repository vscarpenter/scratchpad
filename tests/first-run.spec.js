// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('first-run redirect', () => {
  test('sends a brand-new visitor with no notes to the About page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/about\.html$/);
    const visited = await page.evaluate(() => localStorage.getItem('scratchpad-visited'));
    expect(visited).toBe('1');
  });

  test('does not redirect a returning visitor who already has notes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('scratchpad-visited', '1');
    });
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);
    await page.evaluate(async () => {
      await window.ScratchpadDB.bulkPut([{
        id: 'existing',
        title: 'Existing note',
        body: 'Already here.',
        tags: [],
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        lastDraftAt: null,
      }]);
    });

    await page.reload();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('does not redirect a visitor who has visited before but has zero notes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('scratchpad-visited', '1');
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/(index\.html)?$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });
});
