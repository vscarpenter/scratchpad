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

test.describe('task marker scanner', () => {
  test('matches rendered checkboxes and skips fenced code', async ({ page }) => {
    await gotoApp(page);
    const results = await page.evaluate(() => {
      const scan = (src) => window.ScratchpadMarkdown.findTaskMarkers(src);
      return {
        simple: scan('- [ ] a\n- [x] b'),
        nested: scan('- top\n  - [ ] nested'),
        quoted: scan('> - [ ] quoted'),
        ordered: scan('1. [x] ordered'),
        fenced: scan('```\n- [ ] not a task\n```\n- [ ] real'),
        tilde: scan('~~~\n- [ ] hidden\n~~~'),
        notTask: scan('- [link](https://x) text'),
      };
    });
    expect(results.simple.length).toBe(2);
    expect(results.simple[0].checked).toBe(false);
    expect(results.simple[1].checked).toBe(true);
    expect(results.nested.length).toBe(1);
    expect(results.quoted.length).toBe(1);
    expect(results.ordered.length).toBe(1);
    expect(results.fenced.length).toBe(1);
    expect(results.tilde.length).toBe(0);
    expect(results.notTask.length).toBe(0);
    // Offsets point at the state character: flipping it changes the marker.
    const src = '- [ ] a\n- [x] b';
    const offsets = results.simple.map((m) => m.offset);
    expect(src.charAt(offsets[0])).toBe(' ');
    expect(src.charAt(offsets[1])).toBe('x');
  });
});
