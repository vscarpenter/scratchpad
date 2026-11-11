// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

const CONTENT_PAGES = ['/about.html', '/guide.html', '/privacy.html', '/terms.html'];

// Safari only tabs to links with Option held, unless the user changes a setting.
const tabKey = (browserName) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

for (const url of CONTENT_PAGES) {
  test(`${url} starts with a skip link to its main content`, async ({ page, browserName }) => {
    await page.goto(url);
    await page.keyboard.press(tabKey(browserName));
    const link = page.locator('.skip-link');
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });
}

test('the app skip link moves focus to the note without touching the URL', async ({ page, browserName }) => {
  await seedRawNotes(page, [{ id: 'one', title: 'First note', body: 'Body' }]);
  const url = page.url();
  await page.keyboard.press(tabKey(browserName));
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(page.url()).toBe(url);
});

test('the share viewer skip link keeps the key in the URL fragment', async ({ page, browserName }) => {
  await page.goto('/share.html#k=not-a-real-key');
  await page.keyboard.press(tabKey(browserName));
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('#k=not-a-real-key');
});

test('every menu has an accessible name', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('#list-menu')).toHaveAttribute('aria-labelledby', 'list-menu-btn');
  await expect(page.locator('#backup-menu')).toHaveAttribute('aria-labelledby', 'backup-chip');
  await expect(page.locator('#overflow-menu')).toHaveAttribute('aria-labelledby', 'overflow-btn');
  await expect(page.locator('#folder-menu')).toHaveAttribute('aria-label', 'Folder actions');
});

test('accessible names start with the visible label', async ({ page }) => {
  await gotoApp(page);
  // No aria-label, so the visible text "Today’s note" is the whole name.
  await expect(page.locator('#today-note')).not.toHaveAttribute('aria-label', /.*/);
  await expect(page.locator('#calendar-today')).toHaveAttribute('aria-label', /^Today\b/);
  await expect(page.locator('#format-h2')).toHaveAttribute('aria-label', /^H2\b/);
});

test('the pin marker uses the contrast-safe warning color', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'pin', title: 'Pinned', body: 'Body', pinned: true }]);
  const colors = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--warning-dark)';
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    const pin = document.querySelector('.note-row-pin-corner');
    return [pin ? getComputedStyle(pin).color : 'missing', expected];
  });
  expect(colors[0]).toBe(colors[1]);
});

test('forced colors keep focus and selection visible', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can emulate forced colors.');
  await page.emulateMedia({ forcedColors: 'active' });
  await seedRawNotes(page, [{ id: 'one', title: 'First note', body: 'Body' }]);
  await page.locator('.note-row[data-id="one"]').click();
  await page.locator('#search').focus();
  const outline = (selector) =>
    page.evaluate((s) => {
      const node = document.querySelector(s);
      return node ? getComputedStyle(node).outlineStyle : 'missing';
    }, selector);
  expect(await outline('.search-control')).toBe('solid');
  expect(await outline('.note-row.is-active')).toBe('solid');
});
