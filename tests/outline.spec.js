// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

const LONG = [
  '# First heading',
  '',
  ...Array.from({ length: 40 }, (_, i) => `Paragraph ${i} sits between the headings.`),
  '',
  '## Second heading',
  '',
  'A short section.',
  '',
  '# Third heading',
  '',
  'The end of the note.',
].join('\n');

const FENCED = ['# Kept', '', '```md', '# Hidden in code', '```', '', '## Also kept', ''].join('\n');

/** @param {import('@playwright/test').Page} page */
async function openLong(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await seedRawNotes(page, [{ id: 'long', title: 'Long note', body: LONG }]);
}

test('a wide window docks the outline and jumps to the heading', async ({ page }) => {
  await openLong(page, 1600);
  await expect(page.locator('#outline-btn')).toBeHidden();
  const nav = page.locator('#note-outline');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button')).toHaveCount(3);
  await nav.getByRole('button', { name: 'Third heading', exact: true }).click();
  await expect(page.locator('#note-rendered h1', { hasText: 'Third heading' })).toBeInViewport();
  await expect(nav.getByRole('button', { name: 'Third heading', exact: true })).toHaveAttribute('aria-current', 'true');
});

test('a phone keeps the outline behind a button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedRawNotes(page, [{ id: 'long', title: 'Long note', body: LONG }]);
  await page.locator('.note-row[data-id="long"] .note-row-open').click();
  const nav = page.locator('#note-outline');
  await expect(nav).toBeHidden();
  await page.locator('#outline-btn').click();
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'First heading', exact: true }).click();
  await expect(nav).toBeHidden();
  await expect(page.locator('#note-rendered h1', { hasText: 'First heading' })).toBeInViewport();
});

test('headings inside a code fence stay out of the outline', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedRawNotes(page, [{ id: 'fenced', title: 'Fenced', body: FENCED }]);
  const nav = page.locator('#note-outline');
  await expect(nav.getByRole('button', { name: 'Kept', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Also kept', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Hidden in code' })).toHaveCount(0);
});

test('one heading does not grow an outline', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedRawNotes(page, [{ id: 'one', title: 'One', body: '# Only one\n\nNothing else.' }]);
  await expect(page.locator('#note-outline')).toBeAttached();
  await expect(page.locator('#note-outline')).toBeHidden();
  await expect(page.locator('#outline-btn')).toBeAttached();
  await expect(page.locator('#outline-btn')).toBeHidden();
});

test('focus mode hides the docked outline', async ({ page }) => {
  await openLong(page, 1600);
  await expect(page.locator('#note-outline')).toBeVisible();
  await page.locator('#focus-mode-btn').click();
  await expect(page.locator('#note-outline')).toBeHidden();
  await expect(page.locator('#outline-btn')).toBeHidden();
  await page.locator('#focus-exit-btn').click();
  await expect(page.locator('#note-outline')).toBeVisible();
});

test('editing jumps the caret to the heading', async ({ page }) => {
  await openLong(page, 1600);
  await page.locator('#edit-btn').click();
  await page.locator('#note-outline').getByRole('button', { name: 'Third heading', exact: true }).click();
  const offset = LONG.indexOf('# Third heading');
  const editor = page.locator('#note-editor');
  await expect.poll(() => editor.evaluate((el) => /** @type {HTMLTextAreaElement} */ (el).selectionStart)).toBe(offset);
  await expect.poll(() => editor.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});
