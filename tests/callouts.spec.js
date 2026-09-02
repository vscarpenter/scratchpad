// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, gotoApp } = require('./helpers');

const KINDS = ['note', 'tip', 'important', 'warning', 'caution'];

test('each marker renders a labeled callout with its default title', async ({ page }) => {
  const body = KINDS.map((kind) => '> [!' + kind.toUpperCase() + ']\n> Body for ' + kind).join('\n\n');
  await seedRawNotes(page, [{ id: 'kinds', title: 'Kinds', body }]);
  await page.locator('.note-row[data-id="kinds"]').click();
  for (const kind of KINDS) {
    const callout = page.locator('#note-rendered blockquote.callout.callout-' + kind);
    await expect(callout).toHaveCount(1);
    await expect(callout.locator('.callout-title')).toHaveText(kind.charAt(0).toUpperCase() + kind.slice(1));
    await expect(callout).toContainText('Body for ' + kind);
    await expect(callout).not.toHaveClass(/is-pullquote/);
  }
  await expect(page.locator('#note-rendered [style]')).toHaveCount(0);
});

test('custom titles, inline markdown, and task checkboxes work inside a callout', async ({ page }) => {
  const body = '> [!TIP] Read this **first**\n> Some *emphasis* and a [[Other]] link\n> - [ ] a task';
  await seedRawNotes(page, [{ id: 'tip', title: 'Tip', body }]);
  await page.locator('.note-row[data-id="tip"]').click();
  const callout = page.locator('#note-rendered blockquote.callout-tip');
  await expect(callout.locator('.callout-title')).toHaveText('Read this **first**');
  await expect(callout.locator('em')).toHaveText('emphasis');
  await expect(callout.locator('a.wikilink')).toHaveCount(1);
  await expect(callout.locator('.task-checkbox')).toHaveCount(1);
  await expect(callout).not.toContainText('[!TIP]');
});

test('unknown or misplaced markers stay literal in an ordinary quote', async ({ page }) => {
  const body = '> [!DANGER] nope\n\n> text first [!NOTE]\n\n> short quote';
  await seedRawNotes(page, [{ id: 'plain', title: 'Plain', body }]);
  await page.locator('.note-row[data-id="plain"]').click();
  await expect(page.locator('#note-rendered blockquote.callout')).toHaveCount(0);
  await expect(page.locator('#note-rendered blockquote').nth(0)).toContainText('[!DANGER] nope');
  await expect(page.locator('#note-rendered blockquote').nth(1)).toContainText('text first [!NOTE]');
  await expect(page.locator('#note-rendered blockquote.is-pullquote')).toHaveCount(3);
});

test('the share viewer styles callouts, quotes, and code blocks', async ({ page }) => {
  await gotoApp(page);
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadMarkdown);
  const styles = await page.evaluate(() => {
    const body = document.getElementById('share-body');
    body.hidden = false;
    window.ScratchpadMarkdown.renderMarkdownInto(body, '> [!WARNING] Heads up\n> careful\n\n> plain\n\n```\ncode\n```');
    const pick = (selector) => {
      const style = getComputedStyle(body.querySelector(selector));
      return { border: style.borderLeftWidth, background: style.backgroundColor, italic: style.fontStyle };
    };
    return { callout: pick('.callout'), quote: pick('blockquote:not(.callout)'), pre: pick('pre') };
  });
  expect(parseFloat(styles.callout.border)).toBeGreaterThanOrEqual(3);
  expect(styles.callout.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.callout.italic).toBe('normal');
  expect(styles.quote.italic).toBe('italic');
  expect(styles.pre.background).not.toBe('rgba(0, 0, 0, 0)');
});
