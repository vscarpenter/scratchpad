const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

async function stubStorage(page, { persisted, granted }) {
  await page.addInitScript(({ initial, result }) => {
    const storage = {
      estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }),
      persisted: async () => initial,
      persist: async () => result,
    };
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
  }, { initial: persisted, result: granted });
}

test.describe('persistent storage protection', () => {
  test('requests protection from a user action and reports the granted state', async ({ page }) => {
    await stubStorage(page, { persisted: false, granted: true });
    await gotoApp(page);

    await page.locator('#open-about').click();
    await expect(page.locator('#diagnostic-storage-protection')).toHaveText('Best effort');
    await page.locator('#protect-storage-btn').click();

    await expect(page.locator('#diagnostic-storage-protection')).toHaveText('Persistent');
    await expect(page.locator('#protect-storage-btn')).toBeHidden();
    await expect(page.locator('#toast-region')).toContainText('Local data protection is on.');
  });

  test('keeps backup guidance visible when the browser declines persistence', async ({ page }) => {
    await stubStorage(page, { persisted: false, granted: false });
    await gotoApp(page);

    await page.locator('#open-about').click();
    await page.locator('#protect-storage-btn').click();

    await expect(page.locator('#diagnostic-storage-protection')).toHaveText('Best effort');
    await expect(page.locator('#protect-storage-btn')).toBeVisible();
    await expect(page.locator('#toast-region')).toContainText('Keep exporting backups');
  });

  test('reports unavailable without blocking the app', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    });
    await gotoApp(page);

    await page.locator('#open-about').click();
    await expect(page.locator('#diagnostic-storage-protection')).toHaveText('Unavailable');
    await expect(page.locator('#protect-storage-btn')).toBeHidden();
  });
});
