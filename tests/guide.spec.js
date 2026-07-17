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
