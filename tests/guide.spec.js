// @ts-check
const { test, expect } = require('@playwright/test');

const SECTION_IDS = [
  'first-five-minutes', 'markdown', 'task-lists', 'daily-notes', 'linking',
  'organizing', 'backups', 'privacy-controls', 'offline', 'shortcuts',
];

test.describe('user guide page', () => {
  test('loads with title and all ten sections', async ({ page }) => {
    await page.goto('/guide.html');
    await expect(page.locator('h1')).toContainText('How to use Scratchpad');
    for (const id of SECTION_IDS) {
      await expect(page.locator('#' + id), id).toBeVisible();
    }
  });

  test('TOC anchor navigates to its section', async ({ page }) => {
    await page.goto('/guide.html');
    await page.locator('.guide-toc a[href="#task-lists"]').click();
    expect(new URL(page.url()).hash).toBe('#task-lists');
    // Inkwell sets html { scroll-behavior: smooth }, so the jump animates —
    // poll until the section heading lands in the viewport.
    await page.waitForFunction(() => {
      const el = document.getElementById('task-lists');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    });
  });

  test('every static page footer links to the guide', async ({ page }) => {
    // index.html has no .footer-nav — the app's entry point is the About
    // dialog link, covered by its own test below.
    for (const path of ['/about.html', '/privacy.html', '/terms.html', '/guide.html']) {
      await page.goto(path);
      await expect(page.locator('.footer-nav a[href="guide.html"]'), path).toBeAttached();
    }
  });

  test('about page links to the guide prominently', async ({ page }) => {
    await page.goto('/about.html');
    await expect(page.locator('a[href="guide.html"]', { hasText: /user guide/i }).first()).toBeVisible();
  });

  test('command palette opens the guide in a new tab', async ({ page, context }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/');
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('guide');
    const popupPromise = context.waitForEvent('page');
    await page.locator('.command-palette-item', { hasText: 'Open user guide' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe('/guide.html');
  });

  test('About dialog links to the guide', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/');
    await page.locator('#open-about').click();
    const link = page.locator('#about-dialog a[href="guide.html"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('guide.html makes no cross-origin requests and ships in the offline shell', async ({ page }) => {
    const external = [];
    page.on('request', (req) => {
      if (new URL(req.url()).origin !== 'http://127.0.0.1:8080') external.push(req.url());
    });
    await page.goto('/guide.html', { waitUntil: 'networkidle' });
    expect(external).toEqual([]);
    // The service worker's app shell must include the guide so it works offline.
    const swSource = await page.evaluate(() =>
      fetch('/public/service-worker.js').then((r) => r.text()));
    expect(swSource).toContain("'/guide.html'");
  });

  test('theme toggle cycles and persists across reload', async ({ page }) => {
    await page.goto('/guide.html');
    const toggle = page.locator('#theme-toggle');
    await toggle.click(); // auto -> light
    await toggle.click(); // light -> dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
