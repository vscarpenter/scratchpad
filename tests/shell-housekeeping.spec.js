// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const SHELLS = ['index.html', 'about.html', 'guide.html', 'privacy.html', 'terms.html', 'share.html'];

test('every shell links the Inkwell stylesheets directly, with no @import chain', () => {
  for (const shell of SHELLS) {
    const html = fs.readFileSync(path.join(ROOT, shell), 'utf8');
    const sheets = Array.from(html.matchAll(/rel="stylesheet" href="\/?public\/css\/([\w.-]+)"/g), (m) => m[1]);
    expect(sheets, shell).toEqual(['inkwell-tokens.css', 'inkwell-components.css', 'app.css']);
  }
});

test('the manifest has a stable id and a splash color from the palette', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'));
  const tokens = fs.readFileSync(path.join(ROOT, 'public', 'css', 'inkwell-tokens.css'), 'utf8');
  const washBase = /--wash-base:\s*(#[0-9a-f]{6})/i.exec(tokens);
  expect(manifest.id).toBe('/');
  expect(manifest.background_color.toLowerCase()).toBe(washBase && washBase[1].toLowerCase());
});

test('a dismissed toast leaves as soon as its exit transition ends', async ({ page }) => {
  await gotoApp(page);
  const removed = await page.evaluate(async () => {
    const region = document.getElementById('toast-region');
    const toast = window.ScratchpadToast.show(region, 'Could not save.', { tone: 'error' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    toast.querySelector('.toast-dismiss').click();
    toast.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity', bubbles: true }));
    return !toast.isConnected;
  });
  expect(removed).toBe(true);
});

test('a theme change in another tab applies here', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    localStorage.setItem('theme-preview', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme-preview', newValue: 'dark' }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => {
    localStorage.setItem('theme-preview', 'auto');
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme-preview', newValue: 'auto' }));
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});
