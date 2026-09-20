// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

/**
 * Raises a toast through the module so a test can pick a short duration.
 * @param {import('@playwright/test').Page} page
 * @param {string} message
 * @param {{ duration?: number, withAction?: boolean, tone?: string }} options
 */
async function raiseToast(page, message, options) {
  await page.evaluate(
    ({ text, opts }) => {
      const region = document.getElementById('toast-region');
      window.ScratchpadToast.show(region, text, {
        duration: opts.duration,
        tone: opts.tone,
        actionLabel: opts.withAction ? 'Undo' : undefined,
        action: opts.withAction ? () => {} : undefined,
      });
    },
    { text: message, opts: options },
  );
}

test.describe('toast burn-down bar', () => {
  test('only an auto-dismissing toast with an action draws the bar', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'With undo', { duration: 5000, withAction: true });
    await raiseToast(page, 'Plain', { duration: 5000 });
    await raiseToast(page, 'Broken', { tone: 'error', withAction: true });

    await expect(page.locator('.toast', { hasText: 'With undo' }).locator('.toast-burn')).toHaveCount(1);
    await expect(page.locator('.toast', { hasText: 'Plain' }).locator('.toast-burn')).toHaveCount(0);
    await expect(page.locator('.toast', { hasText: 'Broken' }).locator('.toast-burn')).toHaveCount(0);
  });

  test('the bar is hidden from assistive technology and timed to the toast', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'Timed', { duration: 4000, withAction: true });
    const toast = page.locator('.toast', { hasText: 'Timed' });
    await expect(toast.locator('.toast-burn')).toHaveAttribute('aria-hidden', 'true');
    expect(await toast.evaluate((node) => node.style.getPropertyValue('--toast-ms'))).toBe('4000ms');
  });

  test('reduced motion hides the bar', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);
    await raiseToast(page, 'Still', { duration: 5000, withAction: true });
    await expect(page.locator('.toast', { hasText: 'Still' }).locator('.toast-burn')).toBeHidden();
  });
});

test.describe('toast pausable clock', () => {
  test('a toast dismisses on its own when left alone', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'Brief', { duration: 400 });
    await expect(page.locator('.toast', { hasText: 'Brief' })).toBeVisible();
    await expect(page.locator('.toast', { hasText: 'Brief' })).toHaveCount(0);
  });

  test('hovering holds the toast and leaving lets it go', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'Hover me', { duration: 600, withAction: true });
    const toast = page.locator('.toast', { hasText: 'Hover me' });
    await toast.hover();
    await expect(toast).toHaveClass(/is-paused/);
    await page.waitForTimeout(1200);
    await expect(toast).toBeVisible();

    await page.mouse.move(2, 2);
    await expect(toast).not.toHaveClass(/is-paused/);
    await expect(toast).toHaveCount(0);
  });

  test('focus inside the toast holds it until focus leaves', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'Focus me', { duration: 600, withAction: true });
    const toast = page.locator('.toast', { hasText: 'Focus me' });
    await toast.getByRole('button', { name: 'Undo' }).focus();
    await expect(toast).toHaveClass(/is-paused/);
    await page.waitForTimeout(1200);
    await expect(toast).toBeVisible();

    await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).blur());
    await expect(toast).toHaveCount(0);
  });

  test('hover and focus together stay paused until both leave', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'Both', { duration: 600, withAction: true });
    const toast = page.locator('.toast', { hasText: 'Both' });
    await toast.hover();
    await toast.getByRole('button', { name: 'Undo' }).focus();
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1000);
    await expect(toast).toHaveClass(/is-paused/);
    await expect(toast).toBeVisible();
  });

  test('a persistent error toast never starts a clock', async ({ page }) => {
    await gotoApp(page);
    await raiseToast(page, 'Stays', { tone: 'error' });
    await page.waitForTimeout(900);
    await expect(page.locator('.toast', { hasText: 'Stays' })).toBeVisible();
    await page.locator('.toast', { hasText: 'Stays' }).getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('.toast', { hasText: 'Stays' })).toHaveCount(0);
  });
});
