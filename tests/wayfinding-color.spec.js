// @ts-check
// Executable form of the colorize pass in tasks/spec.md: Indigo marks where
// you are. The current nav item and the open note share the selection tint,
// today is an Indigo numeral, and folder glyphs take their chosen color.
const { test, expect } = require('@playwright/test');
const { enterBulkMode, seedFolders, seedRawNotes } = require('./helpers');

test.use({ timezoneId: 'America/Chicago' });

const OPEN = '.note-row[data-id="open"]';
const NOTES = [
  {
    id: 'open',
    title: 'Interview synthesis',
    body: 'A working page for the quarter.',
    tags: ['research', 'design', 'q4'],
  },
  { id: 'other', title: 'Grocery run', body: 'Coffee beans and lemons.' },
];
const WHITE = { r: 255, g: 255, b: 255, a: 1 };

/** @param {string} value */
function parseColor(value) {
  let m = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = value.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/);
  if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`Unparseable color: ${value}`);
}

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba */
/** @param {Rgba} fg @param {Rgba} bg @returns {Rgba} */
function composite(fg, bg) {
  const mix = (/** @type {number} */ top, /** @type {number} */ under) => top * fg.a + under * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/** @param {Rgba} color */
function luminance({ r, g, b }) {
  const f = (/** @type {number} */ c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Contrast of a node's color against every background stacked behind it. A
 * glyph drawn with stroke="currentColor" strokes in this same color.
 * @param {import('@playwright/test').Locator} locator
 */
async function contrastOf(locator) {
  const { color, layers } = await locator.evaluate((node) => {
    const stack = [];
    for (let el = /** @type {Element | null} */ (node); el; el = el.parentElement) {
      stack.push(getComputedStyle(el).backgroundColor);
    }
    return { color: getComputedStyle(node).color, layers: stack };
  });
  const backdrop = layers.reverse().reduce((base, value) => composite(parseColor(value), base), WHITE);
  const [hi, lo] = [luminance(parseColor(color)), luminance(backdrop)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A token resolved the way the browser computes a background. @param {import('@playwright/test').Page} page @param {string} name */
function resolve(page, name) {
  return page.evaluate((token) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${token})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, name);
}

/** @param {import('@playwright/test').Locator} locator */
const background = (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor);

/** @param {import('@playwright/test').Page} page */
async function openNote(page) {
  await seedRawNotes(page, NOTES);
  await page.locator(`${OPEN} .note-row-open`).click();
}

test('the current nav item and the open note share the selection tint', async ({ page }) => {
  await openNote(page);
  const tint = await resolve(page, '--accent-soft');
  await expect(page.locator('#nav-notes')).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => background(page.locator('#nav-notes'))).toBe(tint);
  await expect.poll(() => background(page.locator(OPEN))).toBe(tint);
  await page.locator('#nav-pinned').hover();
  const hover = await resolve(page, '--control-fill-hover');
  await expect.poll(() => background(page.locator('#nav-pinned'))).toBe(hover);
  await page.locator(`${OPEN} .note-row-open`).hover();
  await expect.poll(() => background(page.locator(OPEN))).toBe(tint);
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`text on the open note clears AA in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openNote(page);
    await expect.poll(() => background(page.locator(OPEN))).toBe(await resolve(page, '--accent-soft'));
    // A missing token would fall back to ink and still pass AA, so pin the tone.
    const excerpt = await page.locator(`${OPEN} .note-row-excerpt`).evaluate((node) => getComputedStyle(node).color);
    expect(excerpt).toBe(await resolve(page, '--accent-text-secondary'));
    for (const part of ['title', 'excerpt', 'when', 'tag', 'tag-more']) {
      const ratio = await contrastOf(page.locator(`${OPEN} .note-row-${part}`).first());
      expect(ratio, `${scheme} ${part} on the open note = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('bulk mode keeps the open note neutral until it is checked', async ({ page }) => {
  await openNote(page);
  await enterBulkMode(page);
  await expect.poll(() => background(page.locator(OPEN))).toBe(await resolve(page, '--control-fill'));
  await page.getByRole('checkbox', { name: 'Select Interview synthesis' }).check();
  await expect.poll(() => background(page.locator(OPEN))).toBe(await resolve(page, '--accent-soft'));
  for (const part of ['when', 'tag-more']) {
    const ratio = await contrastOf(page.locator(`${OPEN} .note-row-${part}`));
    expect(ratio, `checked row ${part} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  }
});

const TODAY = '#chronicle-days .chronicle-day.is-today';

/** @param {import('@playwright/test').Locator} locator */
const dayStyle = (locator) =>
  locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, weight: Number(style.fontWeight), line: style.textDecorationLine };
  });

test('today is an Indigo numeral without an underline', async ({ page }) => {
  await openNote(page);
  const accentText = await resolve(page, '--accent-text');
  const today = await dayStyle(page.locator(TODAY));
  expect(today.color).toBe(accentText);
  expect(today.weight).toBeGreaterThanOrEqual(600);
  expect(today.line).toBe('none');
  const plain = page.locator('#chronicle-days .chronicle-day:not(.is-today, .is-active, .is-outside)').first();
  expect((await dayStyle(plain)).color).not.toBe(accentText);
});

test("today keeps Indigo among the next month's leading days", async ({ page }) => {
  // Sunday, November 29, 2026 opens December's first row.
  await page.clock.setFixedTime(new Date('2026-11-29T18:00:00Z'));
  await openNote(page);
  await page.locator('#calendar-next').click();
  await expect(page.locator(TODAY)).toHaveClass(/is-outside/);
  expect((await dayStyle(page.locator(TODAY))).color).toBe(await resolve(page, '--accent-text'));
});

test('today keeps an underline in forced colors', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can emulate forced colors.');
  await page.emulateMedia({ forcedColors: 'active' });
  await openNote(page);
  expect((await dayStyle(page.locator(TODAY))).line).toBe('underline');
});

const FOLDERS = [
  { id: 'work', name: 'Work', color: 'accent' },
  { id: 'reading', name: 'Reading', color: 'olive' },
  { id: 'travel', name: 'Travel', color: 'sky' },
  { id: 'someday', name: 'Someday', color: 'gray' },
  { id: 'ideas', name: 'Ideas' },
];

/** @param {import('@playwright/test').Page} page @param {string} id */
const folder = (page, id) => page.locator(`.workspace-folder[data-folder-id="${id}"]`);

/** @param {import('@playwright/test').Locator} button */
const glyph = (button) =>
  button.locator('svg').evaluate((svg) => {
    const style = getComputedStyle(svg);
    return { stroke: style.color, fill: style.fill };
  });

/** @param {import('@playwright/test').Page} page */
async function seedColoredFolders(page) {
  await seedFolders(page, FOLDERS);
  await seedRawNotes(page, NOTES);
}

test('folder glyphs carry their chosen color, current or not', async ({ page }) => {
  await seedColoredFolders(page);
  await expect(folder(page, 'reading')).toHaveAttribute('data-color', 'olive');
  await expect(folder(page, 'ideas')).not.toHaveAttribute('data-color');
  expect((await glyph(folder(page, 'ideas'))).fill).toBe('none');
  const resting = await glyph(folder(page, 'reading'));
  expect(resting.fill).not.toBe('none');
  await folder(page, 'reading').click();
  await expect(folder(page, 'reading')).toHaveAttribute('aria-current', 'page');
  expect(await glyph(folder(page, 'reading'))).toEqual(resting);
});

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`folder glyph strokes clear 3:1 in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seedColoredFolders(page);
    for (const id of ['work', 'reading', 'travel', 'someday']) {
      const ratio = await contrastOf(folder(page, id).locator('svg'));
      expect(ratio, `${scheme} ${id} glyph = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
    await folder(page, 'reading').click();
    await expect(folder(page, 'reading')).toHaveAttribute('aria-current', 'page');
    const current = await contrastOf(folder(page, 'reading').locator('svg'));
    expect(current, `${scheme} current reading glyph = ${current.toFixed(2)}`).toBeGreaterThanOrEqual(3);
  });
}

test('folder glyphs drop their fill in forced colors', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can emulate forced colors.');
  await page.emulateMedia({ forcedColors: 'active' });
  await seedColoredFolders(page);
  expect((await glyph(folder(page, 'reading'))).fill).toBe('none');
});
