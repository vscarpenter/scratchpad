// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * The viewer renders markdown that came from outside this browser -- the only
 * place in the product that does. Sanitization here is load-bearing, not
 * defense in depth.
 *
 * Every case stubs /api/share/* so no network and no AWS is involved, but the
 * payload is encrypted with the app's own crypto so real decryption runs.
 */

async function makeShare(page, payload) {
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadCrypto);
  return page.evaluate(async (p) => {
    const C = window.ScratchpadCrypto;
    const key = await C.generateShareKey();
    return { envelope: await C.encryptShare(p, key), key: await C.exportShareKey(key) };
  }, payload);
}

async function stubShare(page, envelope, options = {}) {
  const { expiresAt = Date.now() + 86400000, status = 200 } = options;
  await page.route('**/api/share/*', (routeCall) =>
    routeCall.fulfill({
      status,
      contentType: 'application/json',
      body: status === 200 ? JSON.stringify({ ...envelope, expiresAt }) : JSON.stringify({ error: 'nope' }),
    }),
  );
}

const ANY_KEY = 'A'.repeat(43);

test.describe('share viewer', () => {
  test('renders a decrypted note', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1,
      title: 'Shared note',
      body: '# Hello\n\nSome **bold** text.',
      tags: ['ideas'],
      updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-title')).toHaveText('Shared note');
    await expect(page.locator('.share-body h1')).toHaveText('Hello');
    await expect(page.locator('.share-body strong')).toHaveText('bold');
    await expect(page.locator('.share-tag')).toHaveText('ideas');
    await expect(page.locator('#share-expiry')).toContainText('Expires');
    await expect(page.locator('#share-expired')).toBeHidden();
  });

  test('sanitizes hostile markdown', async ({ page }) => {
    const hostile = [
      '<img src=x onerror="window.__pwned = true">',
      '<script>window.__pwned = true;<\/script>',
      '[click](javascript:window.__pwned=true)',
      '<iframe src="https://example.com"></iframe>',
      '<a href="#" onclick="window.__pwned=true">x</a>',
    ].join('\n\n');
    const { envelope, key } = await makeShare(page, { v: 1, title: 'x', body: hostile, tags: [], updatedAt: 1 });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-body')).toBeVisible();
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(page.locator('.share-body script')).toHaveCount(0);
    await expect(page.locator('.share-body iframe')).toHaveCount(0);
    const html = await page.locator('.share-body').innerHTML();
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });

  test('escapes the title rather than parsing it as markup', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1,
      title: '<img src=x onerror="window.__pwned=true">',
      body: 'b',
      tags: [],
      updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-title')).toContainText('<img');
    await expect(page.locator('.share-title img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('escapes tags rather than parsing them as markup', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1,
      title: 't',
      body: 'b',
      tags: ['<img src=x onerror="window.__pwned=true">'],
      updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-tag')).toContainText('<img');
    await expect(page.locator('.share-tag img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('opens external links in a new tab with noopener', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1,
      title: 't',
      body: '[out](https://example.com)',
      tags: [],
      updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    const link = page.locator('.share-body a');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('shows the expired state on 410', async ({ page }) => {
    await stubShare(page, null, { status: 410 });
    await page.goto('/share.html?id=AbCdEf123456#k=' + ANY_KEY);
    await expect(page.locator('#share-expired')).toBeVisible();
    await expect(page.locator('#share-expired')).toContainText('expired');
    await expect(page.locator('#share-doc')).toBeHidden();
  });

  test('shows the expired state when the payload is already past expiry', async ({ page }) => {
    const { envelope, key } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    await stubShare(page, envelope, { expiresAt: Date.now() - 1000 });
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);
    await expect(page.locator('#share-expired')).toBeVisible();
  });

  test('shows the not-found state on 404', async ({ page }) => {
    await stubShare(page, null, { status: 404 });
    await page.goto('/share.html?id=AbCdEf123456#k=' + ANY_KEY);
    await expect(page.locator('#share-missing')).toBeVisible();
  });

  test('shows the bad-key state when the fragment is missing or malformed', async ({ page }) => {
    const { envelope } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    await stubShare(page, envelope);

    await page.goto('/share.html?id=AbCdEf123456');
    await expect(page.locator('#share-badkey')).toBeVisible();

    await page.goto('/share.html?id=AbCdEf123456#k=not-a-real-key');
    await expect(page.locator('#share-badkey')).toBeVisible();
  });

  test('shows the bad-key state when the key does not decrypt the payload', async ({ page }) => {
    const { envelope } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    const { key: otherKey } = await makeShare(page, { v: 1, title: 'other', body: 'x', tags: [], updatedAt: 1 });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + otherKey);
    await expect(page.locator('#share-badkey')).toBeVisible();
  });

  test('shows the network-failure state when the fetch fails', async ({ page }) => {
    await page.route('**/api/share/*', (routeCall) => routeCall.abort());
    await page.goto('/share.html?id=AbCdEf123456#k=' + ANY_KEY);
    await expect(page.locator('#share-offline')).toBeVisible();
  });

  test('never puts the key in a network request', async ({ page }) => {
    const { envelope, key } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    const urls = [];
    page.on('request', (req) => urls.push(req.url()));
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);
    await expect(page.locator('.share-title')).toHaveText('t');

    expect(urls.filter((u) => u.includes('/api/share')).length).toBe(1);
    for (const url of urls) expect(url).not.toContain(key);
  });

  test('the viewer opens no IndexedDB connection', async ({ page }) => {
    await page.addInitScript(() => {
      window.__idbOpened = false;
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => {
        window.__idbOpened = true;
        return original(...args);
      };
    });
    const { envelope, key } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);
    await expect(page.locator('.share-title')).toHaveText('t');
    expect(await page.evaluate(() => window.__idbOpened)).toBe(false);
  });

  // share.html is served at BOTH /share.html and /s/<id>. A relative asset path
  // resolves against /s/ at the second one, so every script 404s and the viewer
  // hangs on "Decrypting..." forever. This shipped once; the ?id= form used by
  // the other tests hides it, because relative paths resolve fine there.
  test('every asset path is root-absolute so /s/<id> resolves them', async ({ page }) => {
    await page.goto('/share.html');
    const relative = await page.evaluate(() =>
      [...document.querySelectorAll('script[src], link[href], a[href], img[src]')]
        .map((el) => el.getAttribute('src') || el.getAttribute('href'))
        .filter((value) => value && !/^(?:\/|https?:|#|data:|mailto:)/.test(value)),
    );
    expect(relative, `relative paths break when served at /s/<id>: ${relative.join(', ')}`).toEqual([]);
  });

  test('renders when served from an /s/<id> path, not just ?id=', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1,
      title: 'From a share path',
      body: 'Served at /s/<id>.',
      tags: [],
      updatedAt: 1,
    });
    await stubShare(page, envelope);

    // The local static server has no CloudFront Function, so stand in for the
    // rewrite: serve share.html's bytes at the /s/<id> URL and let the browser
    // resolve its subresources from that path exactly as production does.
    const html = await (await page.request.get('/share.html')).text();
    await page.route('**/s/AbCdEf123456', (routeCall) =>
      routeCall.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
    );

    const failed = [];
    page.on('requestfailed', (req) => failed.push(req.url()));
    page.on('response', (res) => {
      if (res.status() === 404) failed.push(res.url());
    });

    await page.goto('/s/AbCdEf123456#k=' + key);
    await expect(page.locator('.share-title')).toHaveText('From a share path');
    expect(failed, `subresources failed to load: ${failed.join(', ')}`).toEqual([]);
  });

  test('is marked noindex so share links are never crawled', async ({ page }) => {
    await page.goto('/share.html');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('the theme toggle works and does not throw', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/share.html');
    await expect(page.locator('#theme-label')).toHaveText('auto');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('#theme-label')).toHaveText('light');
    expect(errors).toEqual([]);
  });
});

test.describe('share page footer', () => {
  test('carries the site strip with root-absolute links', async ({ page }) => {
    await page.goto('/share.html');
    const foot = page.locator('.shell-foot');
    await expect(foot).toBeVisible();
    // Root-absolute on purpose: share.html also serves at /s/<id>, where a
    // relative href would resolve into the router's catch-all.
    for (const target of ['/guide.html', '/about.html', '/privacy.html', '/terms.html']) {
      await expect(foot.locator(`a[href="${target}"]`)).toBeVisible();
    }
    await expect(foot.locator('#shell-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    await expect(foot.locator('#shell-build-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(foot.locator('a[href="https://vinny.dev"]')).toHaveAttribute('rel', /noopener/);
  });

  test('the header theme toggle renders on one line', async ({ page }) => {
    // The app shell's glyph-stack grid rule must stay scoped to the shell;
    // unscoped it turns this text button into two stacked grid rows.
    await page.goto('/share.html');
    const clipped = await page.locator('#theme-toggle').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped, 'theme toggle stacked into grid rows').toBe(false);
  });
});
