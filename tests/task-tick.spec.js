// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

const BODY = '- [ ] first\n- [x] second\n- [ ] third';

/** @param {import('@playwright/test').Page} page */
async function openTasks(page) {
  await seedRawNotes(page, [
    { id: 'tick-1', title: 'Todos', body: BODY },
    { id: 'tick-2', title: 'Elsewhere', body: 'plain' },
  ]);
  await page.locator('.note-row[data-id="tick-1"]').click();
  await expect(page.locator('#note-rendered .task-checkbox')).toHaveCount(3);
}

/**
 * @param {import('@playwright/test').Locator} box
 * @param {string} [pseudo]
 */
function animationName(box, pseudo) {
  return box.evaluate((node, which) => getComputedStyle(node, which || null).animationName, pseudo);
}

test.describe('task tick marks the toggled box', () => {
  test('checking a box marks that box and no other', async ({ page }) => {
    await openTasks(page);
    const boxes = page.locator('#note-rendered .task-checkbox');
    await boxes.first().click();
    await expect(boxes.first()).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#note-rendered .is-just-toggled')).toHaveCount(1);
    await expect(boxes.first()).toHaveClass(/is-just-toggled/);
  });

  test('a keyboard toggle marks the box too', async ({ page }) => {
    await openTasks(page);
    const boxes = page.locator('#note-rendered .task-checkbox');
    await boxes.nth(2).focus();
    await page.keyboard.press('Space');
    await expect(boxes.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(boxes.nth(2)).toHaveClass(/is-just-toggled/);
  });

  test('reopening the note animates nothing', async ({ page }) => {
    await openTasks(page);
    await page.locator('#note-rendered .task-checkbox').first().click();
    await expect(page.locator('#note-rendered .is-just-toggled')).toHaveCount(1);
    await page.locator('.note-row[data-id="tick-2"]').click();
    await page.locator('.note-row[data-id="tick-1"]').click();
    await expect(page.locator('#note-rendered .task-checkbox')).toHaveCount(3);
    await expect(page.locator('#note-rendered .is-just-toggled')).toHaveCount(0);
  });
});

test.describe('task tick motion', () => {
  test('the marked box pops and its tick draws', async ({ page }) => {
    await openTasks(page);
    const boxes = page.locator('#note-rendered .task-checkbox');
    await boxes.first().click();
    await expect(boxes.first()).toHaveClass(/is-just-toggled/);
    expect(await animationName(boxes.first())).toBe('task-pop');
    expect(await animationName(boxes.first(), '::after')).toBe('task-tick-draw');
    // The box that was already checked stays still.
    expect(await animationName(boxes.nth(1))).toBe('none');
    expect(await animationName(boxes.nth(1), '::after')).toBe('none');
  });

  test('unchecking pops the box without a tick', async ({ page }) => {
    await openTasks(page);
    const boxes = page.locator('#note-rendered .task-checkbox');
    await boxes.nth(1).click();
    await expect(boxes.nth(1)).toHaveAttribute('aria-checked', 'false');
    await expect(boxes.nth(1)).toHaveClass(/is-just-toggled/);
    expect(await animationName(boxes.nth(1))).toBe('task-pop');
  });

  test('reduced motion turns both animations off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTasks(page);
    const boxes = page.locator('#note-rendered .task-checkbox');
    await boxes.first().click();
    await expect(boxes.first()).toHaveClass(/is-just-toggled/);
    expect(await animationName(boxes.first())).toBe('none');
    expect(await animationName(boxes.first(), '::after')).toBe('none');
  });
});
