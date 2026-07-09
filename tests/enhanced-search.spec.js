// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('enhanced search', () => {
  test('searches title, body, and tags together', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'search-title', title: 'Needle title xqz', body: 'Plain body.', tags: ['planning'] },
      { id: 'search-body', title: 'Plain title', body: 'Body contains needle vqx.', tags: ['writing'] },
      { id: 'search-tag', title: 'Tagged note', body: 'No keyword.', tags: ['needle-zqv'] },
    ]);

    await page.locator('#search').fill('needle');
    await expect(page.locator('.note-row')).toHaveCount(3);
    await expect(page.locator('.note-row')).toContainText(['Tagged note', 'Plain title', 'Needle title xqz']);

    await page.locator('#search').fill('xqz');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Needle title xqz');

    await page.locator('#search').fill('vqx');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Plain title');

    await page.locator('#search').fill('zqv');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Tagged note');
  });

  test('supports fuzzy matching and highlights direct matches', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'search-fuzzy', title: 'Project archive', body: 'The launch timeline has a blocker.', tags: [] },
      { id: 'search-other', title: 'Meeting notes', body: 'No relevant body.', tags: [] },
    ]);

    await page.locator('#search').fill('prar');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Project archive');

    await page.locator('#search').fill('launch');
    await expect(page.locator('.note-row mark.search-hit')).toContainText('launch');
    await expect(page.locator('#note-rendered mark.search-hit')).toContainText('launch');
  });
});
