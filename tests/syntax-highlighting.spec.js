// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { seedRawNotes, gotoApp } = require('./helpers');

test('a fenced block with a known language gets token spans and no inline styles', async ({ page }) => {
  const body = '```js\nconst answer = 42; // why\n```\n\n```py\ndef f():\n    return "x"\n```';
  await seedRawNotes(page, [{ id: 'code', title: 'Code', body }]);
  await page.locator('.note-row[data-id="code"]').click();
  const js = page.locator('#note-rendered pre code.language-js');
  await expect(js.locator('.token.keyword')).toHaveText(['const']);
  await expect(js.locator('.token.number')).toHaveText(['42']);
  await expect(js.locator('.token.comment')).toHaveText(['// why']);
  await expect(page.locator('#note-rendered pre code.language-py .token.string')).toHaveText(['"x"']);
  await expect(page.locator('#note-rendered [style]')).toHaveCount(0);
  expect(await page.evaluate(() => window.Prism.manual)).toBe(true);
});

test('unknown languages and bare fences render escaped text without spans', async ({ page }) => {
  const body = '```brainfuck\n<b>+++</b>\n```\n\n```\nplain <i>x</i>\n```';
  await seedRawNotes(page, [{ id: 'plain', title: 'Plain', body }]);
  await page.locator('.note-row[data-id="plain"]').click();
  const blocks = page.locator('#note-rendered pre code');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toHaveClass(/language-brainfuck/);
  await expect(blocks.nth(0)).toHaveText('<b>+++</b>');
  await expect(blocks.nth(1)).toHaveText('plain <i>x</i>');
  await expect(page.locator('#note-rendered pre .token')).toHaveCount(0);
  await expect(page.locator('#note-rendered pre b, #note-rendered pre i')).toHaveCount(0);
});

test('the share viewer highlights code with the same bundle', async ({ page }) => {
  await gotoApp(page);
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadMarkdown && !!window.Prism);
  const result = await page.evaluate(() => {
    const body = document.getElementById('share-body');
    window.ScratchpadMarkdown.renderMarkdownInto(body, '```sql\nSELECT 1;\n```');
    const keyword = body.querySelector('.token.keyword');
    return {
      manual: window.Prism.manual,
      keyword: keyword && keyword.textContent,
      color: keyword && getComputedStyle(keyword).color,
    };
  });
  expect(result.manual).toBe(true);
  expect(result.keyword).toBe('SELECT');
  expect(result.color).not.toBe('');
});

test('the vendored bundle is small and names its version', async () => {
  const file = path.join(__dirname, '..', 'public', 'js', 'vendor', 'prism.min.js');
  expect(fs.statSync(file).size).toBeLessThan(40000);
  expect(fs.readFileSync(file, 'utf8').slice(0, 300)).toContain('PrismJS 1.30.0');
});
