// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

const TASKS = '- [ ] buy milk\n- [x] file taxes';

test('an unchecked task checkbox draws a border', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'tasks', title: 'Tasks', body: TASKS }]);
  await page.locator('.note-row[data-id="tasks"]').click();
  const border = await page
    .locator('#note-rendered .task-checkbox')
    .first()
    .evaluate((box) => {
      const style = getComputedStyle(box);
      return style.borderTopStyle + ' ' + style.borderTopWidth;
    });
  expect(border).toBe('solid 1px');
});

test('each task checkbox is named after its task', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'tasks', title: 'Tasks', body: TASKS }]);
  await page.locator('.note-row[data-id="tasks"]').click();
  const boxes = page.locator('#note-rendered .task-checkbox');
  await expect(boxes.nth(0)).toHaveAttribute('aria-label', 'buy milk');
  await expect(boxes.nth(1)).toHaveAttribute('aria-label', 'file taxes');
  await expect(page.getByRole('checkbox', { name: 'buy milk' })).toHaveCount(1);
});

test('the Markdown editor has an accessible name', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('#note-editor')).toHaveAttribute('aria-label', 'Note body');
});

test('a long unbroken token wraps inside the rendered note', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const token = 'https://example.test/' + 'a'.repeat(400);
  await seedRawNotes(page, [{ id: 'long', title: 'Long link', body: 'See ' + token + ' for details.' }]);
  await page.locator('.note-row[data-id="long"]').click();
  const rendered = page.locator('#note-rendered');
  await expect(rendered).toBeVisible();
  const overflow = await rendered.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
