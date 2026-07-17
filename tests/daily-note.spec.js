// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('dailyDate field', () => {
  test('survives an edit-and-save round trip', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'daily-1', title: 'My day', body: 'original', dailyDate: '2026-07-16' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('edited body');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();
    const stored = await page.evaluate(() => window.ScratchpadDB.get('daily-1'));
    expect(stored.dailyDate).toBe('2026-07-16');
    expect(stored.body).toBe('edited body');
  });

  test('normalizeNote keeps dailyDate across reload and save', async ({ page }) => {
    await gotoApp(page);
    const parsed = await page.evaluate(() => {
      return window.ScratchpadDB.put({
        id: 'roundtrip-1', title: 'T', body: 'B', tags: [], pinned: false,
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
        lastDraftAt: null, dailyDate: '2026-01-02',
      }).then(() => window.ScratchpadDB.get('roundtrip-1'));
    });
    expect(parsed.dailyDate).toBe('2026-01-02');
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    // After reload, loadAll() ran the note through normalizeNote; an
    // edit-and-save writes that normalized shape back to the DB.
    await page.locator('.note-row', { hasText: 'T' }).click();
    await page.locator('#edit-btn').click();
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();
    const after = await page.evaluate(() => window.ScratchpadDB.get('roundtrip-1'));
    expect(after.dailyDate).toBe('2026-01-02');
  });
});

test.describe('daily note', () => {
  test('palette command creates today note with defaults, reuses on repeat', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('today');
    await page.locator('.command-palette-item', { hasText: "Open today's note" }).click();
    await expect(page.locator('#note-rendered')).toBeVisible();
    const first = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    expect(first.dailyDate).toBe(key);
    expect(first.tags).toContain('daily');
    expect(first.body).toBe('## Tasks\n\n## Notes\n');
    // Second invocation reuses the same note.
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('today');
    await page.locator('.command-palette-item', { hasText: "Open today's note" }).click();
    const count = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.filter((n) => n.dailyDate).length;
    });
    expect(count).toBe(1);
  });

  test('Daily template note seeds the body; renamed daily note still found', async ({ page }) => {
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await seedRawNotes(page, [
      { id: 'tpl-1', title: 'Daily template', body: '## Agenda\n\n## Log\n' },
      { id: 'day-old', title: 'Renamed by hand', body: 'existing', dailyDate: key },
    ]);
    // Existing daily note wins even though its title was renamed.
    await page.locator('#today-note').click();
    await expect(page.locator('#note-title-display')).toHaveText('Renamed by hand');
    // Erase it, then creation should use the template body.
    await page.evaluate(() => window.ScratchpadDB.remove('day-old'));
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.locator('#today-note').click();
    const created = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(created.body).toBe('## Agenda\n\n## Log\n');
  });
});
