// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test('a forced light theme pins native UI to light on a dark system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('theme-preview', 'light'));
  await gotoApp(page);
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(scheme).toBe('light');
});
