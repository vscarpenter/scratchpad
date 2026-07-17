// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('task list rendering', () => {
  test('renders GFM task items as span checkboxes, never inputs', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'tasks-1', title: 'Todos', body: '- [ ] first\n- [x] second' },
    ]);
    await page.locator('.note-row').first().click();
    const rendered = page.locator('#note-rendered');
    await expect(rendered.locator('.task-checkbox')).toHaveCount(2);
    await expect(rendered.locator('.task-checkbox').first()).toHaveAttribute('aria-checked', 'false');
    await expect(rendered.locator('.task-checkbox').nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(rendered.locator('input')).toHaveCount(0);
    await expect(rendered.locator('.task-checkbox').first()).toHaveAttribute('role', 'checkbox');
    await expect(rendered.locator('.task-checkbox').first()).toHaveAttribute('tabindex', '0');
  });
});
