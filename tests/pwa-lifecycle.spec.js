const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('PWA update and recovery', () => {
  test('shows a waiting update and activates it only after confirmation', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pwaMessages = [];
      const waiting = {
        state: 'installed',
        postMessage(message) { window.__pwaMessages.push(message); },
        addEventListener() {},
      };
      const registration = {
        waiting,
        installing: null,
        active: waiting,
        addEventListener() {},
        update: async () => { window.__pwaUpdated = true; },
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          controller: {},
          register: async () => registration,
          getRegistration: async () => registration,
          addEventListener() {},
        },
      });
    });
    await gotoApp(page);

    await expect(page.locator('#pwa-update-notice')).toBeVisible();
    await page.locator('#pwa-update-later').click();
    await expect(page.locator('#pwa-update-notice')).toBeHidden();

    await page.evaluate(() => window.ScratchpadPWA.showWaitingUpdate());
    await page.locator('#pwa-update-reload').click();
    expect(await page.evaluate(() => window.__pwaMessages)).toContainEqual({ type: 'SKIP_WAITING' });
  });

  test('checks for updates and refreshes the offline app shell', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pwaMessages = [];
      const active = {
        postMessage(message, ports) {
          window.__pwaMessages.push(message);
          if (ports && ports[0]) ports[0].postMessage({ ok: true });
        },
      };
      const registration = {
        waiting: null,
        installing: null,
        active,
        addEventListener() {},
        update: async () => { window.__pwaUpdated = true; },
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          controller: active,
          register: async () => registration,
          getRegistration: async () => registration,
          addEventListener() {},
        },
      });
    });
    await gotoApp(page);
    await page.locator('#open-about').click();

    await page.locator('#check-updates-btn').click();
    expect(await page.evaluate(() => window.__pwaUpdated)).toBe(true);
    await expect(page.locator('#toast-region')).toContainText('Checked for updates.');

    await page.locator('#refresh-offline-copy-btn').click();
    expect(await page.evaluate(() => window.__pwaMessages)).toContainEqual({ type: 'REFRESH_CACHE' });
    await expect(page.locator('#toast-region')).toContainText('Offline copy refreshed.');
  });
});
