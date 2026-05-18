// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('theme cycle', () => {
  test('cycles auto → light → dark → auto and persists across reload', async ({ page }) => {
    await gotoApp(page);

    const root = page.locator('html');
    const toggle = page.locator('#theme-toggle');
    const label = page.locator('#theme-label');

    await expect(label).toHaveText('auto');
    await expect(root).not.toHaveAttribute('data-theme', /.+/);

    await toggle.click();
    await expect(label).toHaveText('light');
    await expect(root).toHaveAttribute('data-theme', 'light');

    await toggle.click();
    await expect(label).toHaveText('dark');
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await toggle.click();
    await expect(label).toHaveText('auto');

    // Set dark then reload — the inline <head> bootstrap must apply before paint.
    await toggle.click(); // -> light
    await toggle.click(); // -> dark
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#theme-label')).toHaveText('dark');
  });
});
