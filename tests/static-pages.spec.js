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

  test('the theme control is a compact icon button on every content page', async ({ page }) => {
    // The pill nav renders the toggle as a small circular icon control; the
    // cycling state text stays for AT via the visually hidden #theme-label.
    for (const pageInfo of PAGES) {
      await page.goto(pageInfo.path);
      const toggle = page.locator('#theme-toggle');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', /theme/i);
      const box = await toggle.boundingBox();
      expect(box.width, `${pageInfo.path} theme toggle width`).toBeLessThan(48);
      expect(Math.abs(box.width - box.height), `${pageInfo.path} toggle squareness`).toBeLessThanOrEqual(2);
    }
  });

  test('the About call to action returns a visited user to the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/about.html');

    await page.locator('a.btn-primary[href="index.html"]').first().click();
    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });
});

test.describe('site navigation', () => {
  for (const pageInfo of PAGES) {
    test(`${pageInfo.path} marks itself current in the pill nav`, async ({ page }) => {
      await page.goto(pageInfo.path);
      const nav = page.locator('.site-nav');
      await expect(nav).toBeVisible();
      await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', pageInfo.path.slice(1));
      await expect(nav.locator('a.site-nav-cta[href="index.html"]')).toHaveText('Open app');
      await expect(nav.locator('.site-nav-brand')).toBeVisible();
    });
  }

  test('the pill nav does not overflow a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/guide.html');
    await expect(page.locator('.site-nav')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, 'horizontal page overflow at 390px').toBe(false);
  });
});
