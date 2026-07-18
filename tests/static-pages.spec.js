// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = [
  { path: '/about.html', heading: /Your thoughts[\s\S]*Your browser[\s\S]*Your business/i },
  { path: '/guide.html', heading: /How to use Scratchpad/i },
  { path: '/privacy.html', heading: /Your notes stay on/i },
  { path: '/terms.html', heading: /Plain-language terms/i },
];

test.describe('shared static-page behavior', () => {
  for (const pageInfo of PAGES) {
    test(`${pageInfo.path} loads metadata, navigation, and persistent theme controls`, async ({ page }) => {
      await page.goto(pageInfo.path);
      await page.evaluate(() => localStorage.setItem('theme-preview', 'auto'));
      await page.reload();

      await expect(page.locator('h1')).toContainText(pageInfo.heading);
      await expect(page.locator('#app-version')).not.toHaveText('—');
      await expect(page.locator('#app-build-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
      await expect(page.locator('.footer-nav a[href="about.html"]')).toBeAttached();
      await expect(page.locator('.footer-nav a[href="guide.html"]')).toBeAttached();
      await expect(page.locator('.footer-nav a[href="privacy.html"]')).toBeAttached();
      await expect(page.locator('.footer-nav a[href="terms.html"]')).toBeAttached();

      await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('#theme-label')).toHaveText('light');
    });
  }

  test('the About call to action returns a visited user to the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/about.html');

    await page.locator('a.btn-primary[href="index.html"]').first().click();
    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });
});
