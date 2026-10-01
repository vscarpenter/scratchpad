// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, openSettings } = require('./helpers');

/* Settings > Check for updates compares the running version with the deployed
   version.js. registration.update() alone missed most releases: it re-fetches
   the worker at its current ?v= URL, and that file rarely changes. */

// A stand-in registration that records register() URLs and can start with a waiting worker.
async function stubServiceWorker(page, { waiting = false } = {}) {
  await page.addInitScript((startWaiting) => {
    window.__registered = [];
    const worker = { state: 'installed', postMessage() {}, addEventListener() {} };
    const registration = {
      waiting: startWaiting ? worker : null,
      installing: null,
      active: worker,
      addEventListener() {},
      update: async () => {},
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: worker,
        register: async (url) => {
          window.__registered.push(url);
          return registration;
        },
        getRegistration: async () => registration,
        addEventListener() {},
      },
    });
  }, waiting);
}

// Stands in for a release that shipped after this page loaded the real version.js.
async function deployVersion(page, version) {
  await page.route('**/public/js/version.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `window.SCRATCHPAD_VERSION = '${version}';` }),
  );
}

test('Check for updates says so when the deployed version matches', async ({ page }) => {
  await stubServiceWorker(page);
  await gotoApp(page);
  const current = await page.evaluate(() => window.SCRATCHPAD_VERSION);
  await openSettings(page);
  await page.locator('#check-updates-btn').click();
  await expect(page.locator('#toast-region')).toContainText(`Scratchpad ${current} is the latest version.`);
  expect(await page.evaluate(() => window.__registered)).toEqual([`/service-worker.js?v=${current}`]);
});

test('Check for updates installs the newer release when version.js has moved on', async ({ page }) => {
  await stubServiceWorker(page);
  await gotoApp(page);
  await deployVersion(page, '9.9.9');
  await openSettings(page);
  await page.locator('#check-updates-btn').click();
  await expect(page.locator('#toast-region')).toContainText('Scratchpad 9.9.9 is downloading.');
  expect(await page.evaluate(() => window.__registered)).toContain('/service-worker.js?v=9.9.9');
});

test('Check for updates brings back an update the user put off', async ({ page }) => {
  await stubServiceWorker(page, { waiting: true });
  await gotoApp(page);
  await page.locator('#pwa-update-later').click();
  await expect(page.locator('#pwa-update-notice')).toBeHidden();
  await deployVersion(page, '9.9.9');
  await openSettings(page);
  await page.locator('#check-updates-btn').click();
  await expect(page.locator('#pwa-update-notice')).toBeVisible();
});

test('the service worker leaves no-store requests to the network', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit service-worker cache inspection is inconsistent in headless runs.');
  await gotoApp(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cachedAfterProbe = await page.evaluate(async () => {
    const drop = async (path) => {
      for (const key of await caches.keys()) await (await caches.open(key)).delete(path);
    };
    await drop('/public/js/version.js');
    await drop('/public/js/toast.js');
    await fetch('/public/js/version.js', { cache: 'no-store' });
    // Barrier: the worker writes its cache in request order, so once toast.js
    // lands, any write of version.js has already landed.
    await fetch('/public/js/toast.js');
    for (let i = 0; i < 100 && !(await caches.match('/public/js/toast.js')); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return !!(await caches.match('/public/js/version.js'));
  });
  expect(cachedAfterProbe).toBe(false);
});
