// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('app shell footer', () => {
  test('shows version, deploy date, and vinny.dev in a slim non-scrolling strip', async ({ page }) => {
    await gotoApp(page);
    const foot = page.locator('.shell-foot');
    await expect(foot).toBeVisible();
    await expect(foot.locator('#shell-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    await expect(foot.locator('#shell-build-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(foot.locator('a[href="https://vinny.dev"]')).toHaveAttribute('rel', /noopener/);
    const box = await foot.boundingBox();
    expect(box.height, 'footer stays a slim strip').toBeLessThanOrEqual(22);
    // The strip must not push the shell into window scroll.
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
    expect(scrolls, 'window must not scroll').toBe(false);
  });
});
