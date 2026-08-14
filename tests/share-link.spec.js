// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, openOverflowMenu } = require('./helpers');

/**
 * Creating and revoking public share links. Every case stubs /api/share so no
 * network and no AWS is involved -- but the request bodies are inspected for
 * real, because "the plaintext never leaves the browser" is the product claim
 * this feature has to keep.
 */

// WebKit routes requests from a service-worker-controlled page around
// page.route, so the stubbed POST would escape to the real static server and
// 501. Blocking the service worker keeps the stub authoritative in every
// browser. The service worker's own behavior is covered by the pwa specs.
test.use({ serviceWorkers: 'block' });

const SHARE_ID = 'AbCdEf123456';

async function stubCreate(page, options = {}) {
  const { status = 201, id = SHARE_ID, expiresAt = Date.now() + 7 * 86400000 } = options;
  const seen = [];
  await page.route('**/api/share', (routeCall) => {
    seen.push({
      method: routeCall.request().method(),
      body: routeCall.request().postData(),
      url: routeCall.request().url(),
      headers: routeCall.request().headers(),
    });
    if (status === 0) return routeCall.abort();
    routeCall.fulfill({
      status,
      contentType: 'application/json',
      body: status === 201
        ? JSON.stringify({ id, revokeToken: 'revoke-token-abc', expiresAt })
        : JSON.stringify({ error: 'nope' }),
    });
  });
  return seen;
}

async function stubRevoke(page, options = {}) {
  const { status = 204 } = options;
  const seen = [];
  await page.route('**/api/share/*', (routeCall) => {
    const req = routeCall.request();
    if (req.method() !== 'DELETE') return routeCall.continue();
    seen.push({ url: req.url(), token: req.headers()['x-revoke-token'] });
    if (status === 0) return routeCall.abort();
    routeCall.fulfill({ status, contentType: 'application/json', body: '' });
  });
  return seen;
}

async function openShareDialog(page) {
  await openOverflowMenu(page);
  await page.locator('#share-btn').click();
  await expect(page.locator('#share-dialog')).toBeVisible();
}

async function seedOneNote(page) {
  await seedRawNotes(page, [{
    id: 'note-1',
    title: 'Quarterly plan',
    body: 'Ship the thing by Friday.',
    tags: ['work'],
  }]);
  await page.locator('.note-row').first().click();
}

test.describe('creating a public share link', () => {
  test('shows the explainer the first time and creates a link', async ({ page }) => {
    const seen = await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);

    await expect(page.locator('#share-explainer')).toBeVisible();
    await expect(page.locator('#share-explainer')).toContainText('Anyone with the link');
    await expect(page.locator('#share-link-list li')).toHaveCount(0);

    await page.locator('#create-share-link').click();

    const field = page.locator('.share-link-url').first();
    await expect(field).toBeVisible();
    const url = await field.inputValue();
    expect(url).toMatch(/^https?:\/\/[^/]+\/s\/[A-Za-z0-9_-]{12}#k=[A-Za-z0-9_-]{43}$/);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
  });

  test('uploads only the encrypted envelope, never the plaintext', async ({ page }) => {
    const seen = await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await expect(page.locator('.share-link-url').first()).toBeVisible();

    expect(seen).toHaveLength(1);
    const body = JSON.parse(seen[0].body);
    expect(Object.keys(body).sort()).toEqual(['ciphertext', 'iv', 'v']);
    expect(body.v).toBe(1);
    expect(body).not.toHaveProperty('expiresAt');

    const raw = seen[0].body;
    expect(raw).not.toContain('Quarterly plan');
    expect(raw).not.toContain('Ship the thing');
    expect(raw).not.toContain('work');
    expect(raw).not.toContain('note-1');
    expect(atob(body.ciphertext)).not.toContain('Ship the thing');
  });

  // CloudFront's OAC signs the origin request with SigV4 and takes the payload
  // hash from this header. Without it, or with a stale one, the edge rejects
  // every upload -- so it is asserted against a hash computed here, not just
  // checked for presence.
  test('the POST carries an x-amz-content-sha256 matching its body', async ({ page }) => {
    const seen = await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await expect(page.locator('.share-link-url').first()).toBeVisible();

    const header = seen[0].headers['x-amz-content-sha256'];
    expect(header).toMatch(/^[0-9a-f]{64}$/);

    const expected = await page.evaluate((body) => window.ScratchpadCrypto.sha256Hex(body), seen[0].body);
    expect(header).toBe(expected);
  });

  test('the decryption key appears in no request', async ({ page }) => {
    const seen = await stubCreate(page);
    const urls = [];
    page.on('request', (req) => urls.push(req.url()));
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();

    const url = await page.locator('.share-link-url').first().inputValue();
    const key = url.split('#k=')[1];
    expect(key).toHaveLength(43);

    for (const requestUrl of urls) expect(requestUrl).not.toContain(key);
    expect(seen[0].body).not.toContain(key);
  });

  test('the explainer appears once and not again', async ({ page }) => {
    await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await expect(page.locator('#share-explainer')).toBeVisible();
    await page.locator('#create-share-link').click();
    await expect(page.locator('.share-link-url').first()).toBeVisible();

    await page.locator('#share-dialog [data-dialog-close]').first().click();
    await openShareDialog(page);
    await expect(page.locator('#share-explainer')).toBeHidden();
  });

  test('a server error shows an inline error and writes no local row', async ({ page }) => {
    await stubCreate(page, { status: 500 });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();

    await expect(page.locator('#share-link-error')).toBeVisible();
    await expect(page.locator('#share-link-error')).toContainText('not uploaded');
    await expect(page.locator('#share-link-list li')).toHaveCount(0);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
  });

  test('an oversized note reports the size, not a generic failure', async ({ page }) => {
    await stubCreate(page, { status: 413 });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();

    await expect(page.locator('#share-link-error')).toContainText('too large');
  });

  test('a network failure shows an offline error and writes no local row', async ({ page }) => {
    await stubCreate(page, { status: 0 });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();

    await expect(page.locator('#share-link-error')).toContainText('network');
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
  });

  test('sharing twice lists both links', async ({ page }) => {
    let counter = 0;
    await page.route('**/api/share', (routeCall) => {
      counter += 1;
      routeCall.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: String(counter).repeat(12).slice(0, 12),
          revokeToken: 'token-' + counter,
          expiresAt: Date.now() + 7 * 86400000,
        }),
      });
    });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await expect(page.locator('#share-link-list li')).toHaveCount(1);
    await page.locator('#create-share-link').click();
    await expect(page.locator('#share-link-list li')).toHaveCount(2);

    const urls = await page.locator('.share-link-url').evaluateAll((nodes) => nodes.map((n) => n.value));
    expect(urls[0]).not.toBe(urls[1]);
  });
});

test.describe('listing and revoking share links', () => {
  test('a live link shows its expiry and both actions', async ({ page }) => {
    await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();

    const row = page.locator('#share-link-list li').first();
    await expect(row.locator('.share-link-expiry')).toContainText('Expires');
    await expect(row.locator('.share-link-copy')).toBeVisible();
    await expect(row.locator('.share-link-revoke')).toBeVisible();
  });

  test('copy writes the full URL including the fragment', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__copied = text; } },
      });
    });
    await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await page.locator('.share-link-copy').first().click();

    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toMatch(/^https?:\/\/[^/]+\/s\/[A-Za-z0-9_-]{12}#k=[A-Za-z0-9_-]{43}$/);
  });

  test('stop sharing sends DELETE with the token and drops the row', async ({ page }) => {
    await stubCreate(page);
    const revokes = await stubRevoke(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await expect(page.locator('#share-link-list li')).toHaveCount(1);

    await page.locator('.share-link-revoke').first().click();
    await expect(page.locator('#share-link-list li')).toHaveCount(0);

    expect(revokes).toHaveLength(1);
    expect(revokes[0].url).toContain('/api/share/' + SHARE_ID);
    expect(revokes[0].token).toBe('revoke-token-abc');
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
  });

  test('a failed revoke keeps the row and says the link is still live', async ({ page }) => {
    await stubCreate(page);
    await stubRevoke(page, { status: 500 });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await page.locator('.share-link-revoke').first().click();

    await expect(page.locator('#share-link-error')).toContainText('still live');
    await expect(page.locator('#share-link-list li')).toHaveCount(1);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toHaveLength(1);
  });

  test('a 404 on revoke is treated as already gone', async ({ page }) => {
    await stubCreate(page);
    await stubRevoke(page, { status: 404 });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await page.locator('.share-link-revoke').first().click();

    await expect(page.locator('#share-link-list li')).toHaveCount(0);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
  });

  test('a shared note shows the share glyph in the note list, and loses it on revoke', async ({ page }) => {
    await stubCreate(page);
    await stubRevoke(page);
    await seedOneNote(page);
    await expect(page.locator('.note-row .note-share-icon')).toHaveCount(0);

    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await expect(page.locator('#share-link-list li')).toHaveCount(1);
    await expect(page.locator('.note-row .note-share-icon')).toHaveCount(1);

    await page.locator('.share-link-revoke').first().click();
    await expect(page.locator('.note-row .note-share-icon')).toHaveCount(0);
  });

  test('expired rows are pruned on start and never render', async ({ page }) => {
    await seedOneNote(page);
    await page.evaluate(() => window.ScratchpadDB.putShare({
      id: 'expiredaaaaa',
      noteId: 'note-1',
      key: 'k'.repeat(43),
      revokeToken: 'token',
      sharedAt: 1,
      expiresAt: 2,
      titleAtShare: 'Old',
    }));
    await page.reload();
    await page.locator('.note-row').first().click();
    await openShareDialog(page);

    await expect(page.locator('#share-link-list li')).toHaveCount(0);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
  });

  test('permanently deleting a note revokes its links but deletes it even if that fails', async ({ page }) => {
    await stubCreate(page);
    await stubRevoke(page, { status: 500 });
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#create-share-link').click();
    await expect(page.locator('#share-link-list li')).toHaveCount(1);
    await page.locator('#share-dialog [data-dialog-close]').first().click();

    await openOverflowMenu(page);
    await page.locator('#delete-btn').click();
    await page.locator('#confirm-delete').click();

    // The note left the active list even though the revoke call failed.
    await expect(page.locator('.note-row')).toHaveCount(0);
  });
});
