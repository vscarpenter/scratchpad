// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('first run', () => {
  test('lands a brand-new visitor in the app instead of the About page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(index\.html)?$/);
    await expect(page.locator('#app-shell')).toBeVisible();
    const visited = await page.evaluate(() => localStorage.getItem('scratchpad-visited'));
    expect(visited).toBe('1');
  });

  test('first run seeds the three starter notes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);
    await expect(page.locator('.note-row', { hasText: 'Welcome to Scratchpad' })).toBeVisible();

    const summary = await page.evaluate(async () => {
      const notes = await window.ScratchpadDB.getAll();
      const folders = await window.ScratchpadDB.getAllFolders();
      const d = new Date();
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const daily = notes.find((n) => n.dailyDate === key);
      return {
        count: notes.length,
        titles: notes.map((n) => n.title),
        pinned: notes.filter((n) => n.pinned).map((n) => n.title),
        dailyToday: notes.filter((n) => n.dailyDate === key).length,
        dailyFolder: folders.find((folder) => folder.id === 'scratchpad-daily-notes'),
        dailyFolderId: daily && daily.folderId,
      };
    });
    expect(summary.count).toBe(3);
    expect(summary.titles).toContain('Welcome to Scratchpad');
    expect(summary.titles).toContain('Markdown Guide');
    expect(summary.pinned).toEqual(['Welcome to Scratchpad']);
    expect(summary.dailyToday).toBe(1);
    expect(summary.dailyFolder.name).toBe('Daily Notes');
    expect(summary.dailyFolderId).toBe('scratchpad-daily-notes');
  });

  test('opens the pinned Welcome note so the first screen has something in it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.locator('#note-title-display')).toHaveText('Welcome to Scratchpad');
    await expect(page.locator('#note-rendered')).toBeVisible();
    // The blank-canvas empty state must not be what a first-time visitor meets.
    await expect(page.locator('#empty-no-notes')).toBeHidden();
  });

  test('the first checklist item is unticked, so the first tick is a real edit that persists', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#note-title-display')).toHaveText('Welcome to Scratchpad');

    const firstBox = page.locator('#note-rendered .task-checkbox').first();
    await expect(firstBox).toHaveAttribute('aria-checked', 'false');
    await firstBox.click();
    await expect(firstBox).toHaveAttribute('aria-checked', 'true');

    // Survives a reload: the tick wrote back to the note body in IndexedDB.
    await page.reload();
    await expect(page.locator('#note-title-display')).toHaveText('Welcome to Scratchpad');
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
  });

  test('seeded Welcome resolves its Markdown Guide link and keeps the phantom', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#note-title-display')).toHaveText('Welcome to Scratchpad');

    const rendered = page.locator('#note-rendered');
    // Real link to an existing note (not phantom):
    const guideLink = rendered.locator('a.wikilink:not(.is-phantom)', { hasText: 'Markdown Guide' });
    await expect(guideLink.first()).toBeVisible();
    // The one intentional phantom:
    await expect(rendered.locator('a.wikilink.is-phantom', { hasText: 'My First Note' })).toBeVisible();
  });

  test('does not reseed a returning visitor who already has notes', async ({ page }) => {
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
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(count).toBe(1);
  });

  test('does not seed a returning visitor who has zero notes', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('scratchpad-visited', '1'); });
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(count).toBe(0);
    // This visitor has used Scratchpad before; the empty state is theirs, not a newcomer's.
    await expect(page.locator('#empty-no-notes')).toBeVisible();
  });
});
