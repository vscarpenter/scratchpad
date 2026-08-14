// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote, importJson, openBackupMenu, openOverflowMenu } = require('./helpers');

/**
 * Privacy guarantee: after page load, the app makes zero network calls, and the
 * single exception -- creating a public share link -- is same-origin, explicit,
 * and carries no plaintext.
 *
 * These tests assert ZERO requests during normal use, not merely same-origin
 * ones. The weaker check would pass even if the app started phoning its own
 * origin on every keystroke.
 */

// Record requests only after the page and its subresources have settled, so the
// document, CSS, JS, and service worker registration are out of scope. What is
// in scope is everything the app chooses to do afterwards.
async function recordRequestsAfterLoad(page) {
  const requests = [];
  let recording = false;
  page.on('request', (req) => {
    if (!recording) return;
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    requests.push({ url, method: req.method(), body: req.postData() });
  });
  await page.waitForLoadState('networkidle');
  recording = true;
  return requests;
}

function describeRequests(requests) {
  return requests.map((r) => `${r.method} ${r.url}`).join(', ');
}

test.describe('network isolation', () => {
  test('normal note use makes zero network requests', async ({ page }) => {
    await gotoApp(page);
    const requests = await recordRequestsAfterLoad(page);

    await createAndSaveNote(page, 'Privacy', 'No remote calls allowed.');
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Typing must not phone home.');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();

    expect(requests, `unexpected requests: ${describeRequests(requests)}`).toEqual([]);
  });

  test('every request in a session stays same-origin', async ({ page, baseURL }) => {
    const allowedHost = new URL(baseURL || 'http://127.0.0.1:8080').host;
    const offOrigin = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      try {
        if (new URL(url).host !== allowedHost) offOrigin.push(url);
      } catch {
        // Non-http(s) schemes -- ignore.
      }
    });

    await gotoApp(page);
    await createAndSaveNote(page, 'Privacy', 'No remote calls allowed.');
    await page.reload();
    await page.locator('.note-row').first().click();

    expect(offOrigin, `unexpected off-origin requests: ${offOrigin.join(', ')}`).toEqual([]);
  });

  test('export and import flows make zero network requests', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Export me', 'Nothing leaves this browser.');
    const requests = await recordRequestsAfterLoad(page);

    const downloadPromise = page.waitForEvent('download');
    await openBackupMenu(page);
    await page.locator('#export-btn').click();
    await downloadPromise;

    await importJson(page, {
      notes: [{ id: 'net-import', title: 'Imported', body: 'Body', tags: [], createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null }],
    });
    await page.locator('#confirm-import').click();
    await expect(page.locator('#import-preview-dialog')).toBeHidden();

    expect(requests, `unexpected requests: ${describeRequests(requests)}`).toEqual([]);
  });

  test('the on-device share actions make zero network requests', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => {} },
      });
    });
    await gotoApp(page);
    await createAndSaveNote(page, 'Local share', 'Copy and email stay on this device.');
    const requests = await recordRequestsAfterLoad(page);

    await openOverflowMenu(page);
    await page.locator('#share-btn').click();
    await expect(page.locator('#share-dialog')).toBeVisible();
    await page.locator('#share-copy').click();

    expect(requests, `unexpected requests: ${describeRequests(requests)}`).toEqual([]);
  });

  // These two stub /api/share. WebKit routes requests from a
  // service-worker-controlled page around page.route, so the stub has to be made
  // authoritative by blocking the worker. The zero-request tests above keep the
  // service worker ACTIVE on purpose -- that is the stronger assertion, since it
  // proves the worker does not phone home either.
  test.describe('with the share API stubbed', () => {
    test.use({ serviceWorkers: 'block' });

    test('creating a public link makes exactly one same-origin POST and nothing else', async ({ page, baseURL }) => {
      await page.route('**/api/share', (routeCall) => routeCall.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'AbCdEf123456',
          revokeToken: 'revoke-token-abc',
          expiresAt: Date.now() + 7 * 86400000,
        }),
      }));

      await gotoApp(page);
      await createAndSaveNote(page, 'Deliberate', 'This one the user chose to publish.');
      const requests = await recordRequestsAfterLoad(page);

      await openOverflowMenu(page);
      await page.locator('#share-btn').click();
      await page.locator('#create-share-link').click();
      await expect(page.locator('.share-link-url').first()).toBeVisible();

      expect(requests, `unexpected requests: ${describeRequests(requests)}`).toHaveLength(1);
      expect(requests[0].method).toBe('POST');

      const allowedHost = new URL(baseURL || 'http://127.0.0.1:8080').host;
      const requestUrl = new URL(requests[0].url);
      expect(requestUrl.host).toBe(allowedHost);
      expect(requestUrl.pathname).toBe('/api/share');
    });

    test('no request in the whole session carries the note plaintext', async ({ page }) => {
      await page.route('**/api/share', (routeCall) => routeCall.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'AbCdEf123456',
          revokeToken: 'revoke-token-abc',
          expiresAt: Date.now() + 7 * 86400000,
        }),
      }));

      const secret = 'CANARY-PHRASE-9137';
      const seen = [];
      page.on('request', (req) => seen.push(req.url() + ' ' + (req.postData() || '')));

      await gotoApp(page);
      await createAndSaveNote(page, 'Canary note', secret);
      await openOverflowMenu(page);
      await page.locator('#share-btn').click();
      await page.locator('#create-share-link').click();
      await expect(page.locator('.share-link-url').first()).toBeVisible();

      for (const entry of seen) expect(entry).not.toContain(secret);
    });
  });
});
