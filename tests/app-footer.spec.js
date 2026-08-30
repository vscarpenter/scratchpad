// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('app shell footer', () => {
  test('shows site links, version, deploy date, and vinny.dev in a non-scrolling strip', async ({ page }) => {
    await gotoApp(page);
    const foot = page.locator('.shell-foot');
    await expect(foot).toBeVisible();
    for (const target of ['guide.html', 'about.html', 'privacy.html', 'terms.html']) {
      await expect(foot.locator(`a[href="${target}"]`)).toBeVisible();
    }
    await expect(foot.locator('#shell-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    await expect(foot.locator('#shell-build-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(foot.locator('a[href="https://vinny.dev"]')).toHaveAttribute('rel', /noopener/);
    const box = await foot.boundingBox();
    expect(box.height, 'footer stays a slim strip').toBeLessThanOrEqual(42);
    expect(box.height, 'footer holds its 40px height').toBeGreaterThanOrEqual(38);
    // The strip must not push the shell into window scroll.
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
    expect(scrolls, 'window must not scroll').toBe(false);
  });
});
