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

test.describe('task toggling', () => {
  test('click toggles the marker and persists across reload', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'toggle-1', title: 'Todos', body: '- [ ] first\n- [x] second' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#note-rendered .task-checkbox').first().click();
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.locator('.note-row').first().click();
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
    const stored = await page.evaluate(() => window.ScratchpadDB.get('toggle-1'));
    expect(stored.body).toBe('- [x] first\n- [x] second');
  });

  test('rapid toggles coalesce into a single revision', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'toggle-2', title: 'Todos', body: '- [ ] only' },
    ]);
    await page.locator('.note-row').first().click();
    const box = page.locator('#note-rendered .task-checkbox').first();
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    const revisions = await page.evaluate(() => window.ScratchpadDB.getRevisions('toggle-2'));
    expect(revisions.length).toBe(1);
  });

  test('count mismatch renders checkboxes inert', async ({ page }) => {
    // A 4-space-indented line at DOCUMENT START (no list before it) is an
    // indented code block to marked — no checkbox rendered — but the line
    // scanner counts it: 1 rendered vs 2 scanned -> every checkbox goes
    // inert rather than guess the mapping. (Order matters: after a list,
    // marked would parse the indented line as a nested task item.)
    await seedRawNotes(page, [
      { id: 'toggle-3', title: 'Odd', body: '    - [ ] looks like code\n\n- [ ] real' },
    ]);
    await page.locator('.note-row').first().click();
    const box = page.locator('#note-rendered .task-checkbox').first();
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await box.click({ force: true });
    const stored = await page.evaluate(() => window.ScratchpadDB.get('toggle-3'));
    expect(stored.body).toContain('- [ ] real');
  });

  test('keyboard Space toggles', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'toggle-4', title: 'Todos', body: '- [ ] kb' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#note-rendered .task-checkbox').first().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
  });
});
