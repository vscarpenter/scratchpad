// @ts-check
// ==text== highlights (docs/superpowers/specs/2026-10-08-home-desk-design.md).
const { test, expect } = require('@playwright/test');
const { seedRawNotes, makeShare, stubShare } = require('./helpers');

const USER_MARK = '#note-rendered mark:not(.search-hit)';

/** @param {string} value */
function parseColor(value) {
  const rgb = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  const srgb = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: srgb[4] === undefined ? 1 : +srgb[4] };
  throw new Error('Unparseable color: ' + value);
}

/** @param {{ r: number, g: number, b: number }} color */
function luminance({ r, g, b }) {
  const channel = (/** @type {number} */ c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Text on a highlight, with a translucent tint composited over the paper beneath. @param {{ fg: string, bg: string, paper: string }} sample */
function contrast(sample) {
  const fg = parseColor(sample.fg);
  const tint = parseColor(sample.bg);
  const paper = parseColor(sample.paper);
  const mix = (/** @type {'r' | 'g' | 'b'} */ k) => tint[k] * tint.a + paper[k] * (1 - tint.a);
  const bg = { r: mix('r'), g: mix('g'), b: mix('b') };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** @param {import('@playwright/test').Page} page @param {string} body */
async function openNote(page, body) {
  await seedRawNotes(page, [{ id: 'hl', title: 'Highlights', body }]);
  await expect(page.locator('#note-title-display')).toHaveText('Highlights');
}

test('==text== renders as a highlight', async ({ page }) => {
  await openNote(page, 'Ship the ==golden path== this week, and ==**bold** ideas== too.');
  await expect(page.locator(USER_MARK)).toHaveText(['golden path', 'bold ideas']);
  await expect(page.locator(USER_MARK + ' strong')).toHaveText('bold');
  await expect(page.locator('#note-rendered')).not.toContainText('==');
});

test('code and spaced equals never highlight', async ({ page }) => {
  const body =
    'In code `a ==b== c` stays literal, and a == b in prose too.\n\n```\n==fenced==\n```\n\nAlso == spaced ==.';
  await openNote(page, body);
  await expect(page.locator('#note-rendered')).toContainText('==b==');
  await expect(page.locator('#note-rendered')).toContainText('a == b');
  await expect(page.locator('#note-rendered mark')).toHaveCount(0);
});

test('raw mark HTML is sanitized like any other markup', async ({ page }) => {
  await openNote(page, 'Inline <mark onclick="window.__pwned = true" style="color:red">marked</mark> text.');
  const mark = page.locator(USER_MARK);
  await expect(mark).toHaveText('marked');
  await expect(mark).not.toHaveAttribute('onclick', /.*/);
  await expect(mark).not.toHaveAttribute('style', /.*/);
  await mark.click();
  expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined();
});

test('the toolbar chip wraps the selection in ==', async ({ page }) => {
  await openNote(page, 'Make this stand out.');
  await page.locator('#edit-btn').click();
  const editor = page.locator('#note-editor');
  await editor.evaluate((/** @type {HTMLTextAreaElement} */ field) => field.setSelectionRange(10, 15));
  await page.locator('#format-highlight').click();
  await expect(editor).toHaveValue('Make this ==stand== out.');
  expect(
    await editor.evaluate((/** @type {HTMLTextAreaElement} */ field) =>
      field.value.slice(field.selectionStart, field.selectionEnd),
    ),
  ).toBe('stand');
  await expect(page.locator('#dirty-indicator')).toBeVisible();
});

test('a search hit still marks inside a highlight', async ({ page }) => {
  await openNote(page, 'Ship the ==golden path== this week.');
  await page.locator('#search').fill('golden');
  await expect(page.locator(USER_MARK + ' mark.search-hit')).toHaveText('golden');
});

test('highlights read differently from search hits and clear AA in both themes', async ({ page }) => {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await openNote(page, 'Ship the ==golden path== this week.');
    await page.locator('#search').fill('ship');
    await expect(page.locator('#note-rendered mark.search-hit')).toHaveCount(1);
    const sample = await page.evaluate(() => {
      const mark = /** @type {HTMLElement} */ (document.querySelector('#note-rendered mark:not(.search-hit)'));
      const hit = /** @type {HTMLElement} */ (document.querySelector('#note-rendered mark.search-hit'));
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--paper)';
      document.body.append(probe);
      const paper = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const style = getComputedStyle(mark);
      return {
        fg: style.color,
        bg: style.backgroundColor,
        paper,
        hitBg: getComputedStyle(hit).backgroundColor,
        hitWeight: getComputedStyle(hit).fontWeight,
        weight: style.fontWeight,
      };
    });
    expect(sample.bg, `${scheme}: a highlight and a search hit need different fills`).not.toBe(sample.hitBg);
    expect(sample.weight).not.toBe(sample.hitWeight);
    expect(contrast(sample), `${scheme} highlight contrast`).toBeGreaterThanOrEqual(4.5);
  }
});

test('the share viewer renders highlights', async ({ page }) => {
  const payload = { v: 1, title: 'Shared', body: 'A ==shared highlight== here.', tags: [], updatedAt: 1 };
  const { envelope, key } = await makeShare(page, payload);
  await stubShare(page, envelope);
  await page.goto('/share.html?id=AbCdEf123456#k=' + key);
  await expect(page.locator('.share-body mark')).toHaveText('shared highlight');
  const tint = await page.locator('.share-body mark').evaluate((mark) => getComputedStyle(mark).backgroundColor);
  expect(tint).not.toBe('rgba(0, 0, 0, 0)');
});
