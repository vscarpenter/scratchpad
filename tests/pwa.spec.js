// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('PWA shell', () => {
  test('pre-caches all top-level static pages, including About', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit service-worker cache inspection is inconsistent in headless runs.');

    await gotoApp(page);
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.ready;
      return !!registration.active;
    });

    const cachedPaths = await page.evaluate(async () => {
      const keys = await caches.keys();
      const paths = new Set();
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        for (const request of requests) paths.add(new URL(request.url).pathname);
      }
      return Array.from(paths).sort();
    });

    expect(cachedPaths).toContain('/index.html');
    expect(cachedPaths).toContain('/about.html');
    expect(cachedPaths).toContain('/privacy.html');
    expect(cachedPaths).toContain('/terms.html');
  });
});
