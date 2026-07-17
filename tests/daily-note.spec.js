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
