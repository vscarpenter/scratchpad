// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

const APP_CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'app.css'), 'utf8');

/** @param {string} selector */
function ruleBody(selector) {
  const start = APP_CSS.indexOf('\n' + selector + ' {');
  return start < 0 ? '' : APP_CSS.slice(start, APP_CSS.indexOf('}', start));
}

test.describe('phone history', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the browser Back action returns from a note to the list', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'one', title: 'First note', body: 'Body' }]);
    await page.locator('.note-row[data-id="one"] .note-row-open').click();
    await expect(page.locator('#main')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#main')).toBeHidden();
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('the in-app Back button leaves no stale history entry behind', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'one', title: 'First note', body: 'Body' }]);
    await page.locator('.note-row[data-id="one"] .note-row-open').click();
    await expect.poll(() => page.evaluate(() => history.state && history.state.scratchpadPane)).toBe('editor');
    await page.locator('#back-to-list').click();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect.poll(() => page.evaluate(() => history.state && history.state.scratchpadPane)).not.toBe('editor');
    await expect(page.locator('#sidebar')).toBeVisible();
  });
});

test('a wide screen adds no history entry when a note opens', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'one', title: 'First note', body: 'Body' }]);
  const before = await page.evaluate(() => history.length);
  await page.locator('.note-row[data-id="one"]').click();
  await expect(page.locator('#note-rendered')).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('the main scrollers contain overscroll', async ({ page }) => {
  await gotoApp(page);
  for (const selector of ['.note-list', '.editor-card', '.home-desk']) {
    const value = await page.evaluate((s) => {
      const node = document.querySelector(s);
      return node ? getComputedStyle(node).overscrollBehaviorY : 'missing';
    }, selector);
    expect(value, selector).toBe('contain');
  }
});

test('edge-anchored UI is padded by the safe-area insets', () => {
  expect(ruleBody('.app-shell')).toContain('env(safe-area-inset-bottom');
  expect(ruleBody('.app-shell')).toContain('env(safe-area-inset-left');
  for (const selector of ['.toast-region', '.pwa-update-notice', '.status-chip.is-floating', '.focus-exit-btn']) {
    expect(ruleBody(selector), selector).toContain('env(safe-area-inset-bottom');
  }
  expect(ruleBody('.navigation-dialog')).toContain('env(safe-area-inset-left');
});
