// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, openCommandPalette } = require('./helpers');

/* Feature modules wrap their code in a block. Without a script-level 'use strict'
   directive, sloppy-mode block functions also land on window, so a module's own
   open() replaced window.open and "Open user guide" silently did nothing. */

test('feature modules leave the browser built-ins alone', async ({ page }) => {
  await gotoApp(page);
  const replaced = await page.evaluate(() =>
    ['open', 'close', 'print', 'stop', 'focus', 'blur', 'find', 'scroll', 'alert', 'confirm'].filter(
      (name) => typeof window[name] === 'function' && !String(window[name]).includes('[native code]'),
    ),
  );
  expect(replaced).toEqual([]);
});

test('feature modules keep their internal functions out of the global scope', async ({ page }) => {
  await gotoApp(page);
  const leaked = await page.evaluate(() =>
    ['renderOption', 'handleInputKey', 'highlightTerms', 'refresh', 'anyDialogOpen', 'wantsPanel'].filter(
      (name) => name in window,
    ),
  );
  expect(leaked).toEqual([]);
});

test('Open user guide asks the browser for a new tab', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    /** @type {unknown[][]} */
    const calls = [];
    Object.assign(window, { __openCalls: calls });
    window.open = (...args) => {
      calls.push(args);
      return null;
    };
  });
  await openCommandPalette(page);
  await page.locator('#command-palette-input').fill('guide');
  await page.locator('.command-palette-item', { hasText: 'Open user guide' }).click();
  const calls = await page.evaluate(() => /** @type {any} */ (window).__openCalls);
  expect(calls).toEqual([['guide.html', '_blank', 'noopener']]);
});
