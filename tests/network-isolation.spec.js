// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

/**
 * Privacy guarantee: after page load, the app makes zero network calls,
 * and every request that DOES happen during the session stays same-origin.
 * No CDN scripts, no fonts, no analytics, no remote sync.
 */
test.describe('network isolation', () => {
  test('every request is same-origin (no third-party hosts)', async ({ page, baseURL }) => {
    const url = new URL(baseURL || 'http://127.0.0.1:8080');
    const allowedHost = url.host;

    /** @type {string[]} */
    const offOrigin = [];
    page.on('request', (req) => {
      const reqUrl = req.url();
      // data: and blob: URLs are local; skip them.
      if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) return;
      try {
        const host = new URL(reqUrl).host;
        if (host !== allowedHost) offOrigin.push(reqUrl);
      } catch {
        // Non-http(s) schemes — ignore.
      }
    });

    await gotoApp(page);
    await createAndSaveNote(page, 'Privacy', 'No remote calls allowed.');
    await page.reload();
    await page.locator('.note-row').first().click();

    expect(offOrigin, `unexpected off-origin requests: ${offOrigin.join(', ')}`).toEqual([]);
  });
});
