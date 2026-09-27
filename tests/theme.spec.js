// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, openSettings } = require('./helpers');

test.describe('theme choice', () => {
  test('Light and Dark set the attribute, Auto clears it, and the choice survives reload', async ({ page }) => {
    await gotoApp(page);
    await openSettings(page);

    const root = page.locator('html');
    const choice = (name) => page.locator('#theme-choice [data-theme-choice="' + name + '"]');

    await expect(choice('auto')).toHaveAttribute('aria-pressed', 'true');
    await expect(root).not.toHaveAttribute('data-theme', /.+/);

    await choice('light').click();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(choice('light')).toHaveAttribute('aria-pressed', 'true');
    await expect(choice('auto')).toHaveAttribute('aria-pressed', 'false');

    await choice('dark').click();
    await expect(root).toHaveAttribute('data-theme', 'dark');

    // The inline <head> bootstrap applies the stored choice before paint.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openSettings(page);
    await expect(choice('dark')).toHaveAttribute('aria-pressed', 'true');

    await choice('auto').click();
    await expect(root).not.toHaveAttribute('data-theme', /.+/);
    await expect(choice('auto')).toHaveAttribute('aria-pressed', 'true');
  });
});
