// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('first-run redirect', () => {
  test('sends a brand-new visitor with no notes to the About page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/about\.html$/);
    const visited = await page.evaluate(() => localStorage.getItem('scratchpad-visited'));
    expect(visited).toBe('1');
  });

  test('does not redirect a returning visitor who already has notes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('scratchpad-visited', '1');
    });
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);
    await page.evaluate(async () => {
      await window.ScratchpadDB.bulkPut([{
        id: 'existing',
        title: 'Existing note',
        body: 'Already here.',
        tags: [],
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        lastDraftAt: null,
      }]);
    });

    await page.reload();
    await expect(page).toHaveURL(/\/(index\.html)?$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('does not redirect a visitor who has visited before but has zero notes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('scratchpad-visited', '1');
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/(index\.html)?$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });

  test('first run seeds the three starter notes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/about\.html$/);

    // Return to the app: flag is set now, so no second redirect.
    await page.goto('/index.html');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);

    const summary = await page.evaluate(async () => {
      const notes = await window.ScratchpadDB.getAll();
      const d = new Date();
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return {
        count: notes.length,
        titles: notes.map((n) => n.title),
        pinned: notes.filter((n) => n.pinned).map((n) => n.title),
        dailyToday: notes.filter((n) => n.dailyDate === key).length,
      };
    });
    expect(summary.count).toBe(3);
    expect(summary.titles).toContain('Welcome to Scratchpad');
    expect(summary.titles).toContain('Markdown Guide');
    expect(summary.pinned).toEqual(['Welcome to Scratchpad']);
    expect(summary.dailyToday).toBe(1);
  });

  test('seeded Welcome resolves its Markdown Guide link and keeps the phantom', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/about\.html$/);
    await page.goto('/index.html');
    await expect(page.locator('#app-shell')).toBeVisible();

    await page.locator('.note-row', { hasText: 'Welcome to Scratchpad' }).click();
    const rendered = page.locator('#note-rendered');
    // Real link to an existing note (not phantom):
    const guideLink = rendered.locator('a.wikilink:not(.is-phantom)', { hasText: 'Markdown Guide' });
    await expect(guideLink.first()).toBeVisible();
    // The one intentional phantom:
    await expect(rendered.locator('a.wikilink.is-phantom', { hasText: 'My First Note' })).toBeVisible();
  });

  test('does not seed a returning visitor who has zero notes', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('scratchpad-visited', '1'); });
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(count).toBe(0);
  });
});
