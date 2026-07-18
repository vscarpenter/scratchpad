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

  test('keeps unsaved edits bound to their note while filtering the sidebar', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'dirty-alpha', title: 'Alpha source', body: 'Alpha saved body.', tags: [] },
      { id: 'clean-beta', title: 'Beta target', body: 'Beta saved body.', tags: [] },
    ]);

    await page.locator('.note-row[data-id="dirty-alpha"]').click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-title-input').fill('Alpha unsaved title');
    await page.locator('#note-editor').fill('Alpha unsaved body.');

    await page.locator('#search').fill('Beta target');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Beta target');
    await expect(page.locator('.note-row.is-active')).toHaveCount(0);
    await expect(page.locator('#note-title-input')).toHaveValue('Alpha unsaved title');
    await expect(page.locator('#note-editor')).toHaveValue('Alpha unsaved body.');

    await page.waitForTimeout(500);
    const drafts = await page.evaluate(async () => window.ScratchpadDB.getAllDrafts());
    expect(drafts).toHaveLength(1);
    expect(drafts[0].noteId).toBe('dirty-alpha');
    expect(drafts[0].body).toBe('Alpha unsaved body.');

    await page.locator('#search').fill('');
    await expect(page.locator('.note-row[data-id="dirty-alpha"]')).toHaveClass(/is-active/);
    await expect(page.locator('#note-editor')).toHaveValue('Alpha unsaved body.');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();

    const saved = await page.evaluate(async () => Object.fromEntries(
      (await window.ScratchpadDB.getAll()).map(({ id, title, body }) => [id, { title, body }])
    ));
    expect(saved['dirty-alpha']).toEqual({
      title: 'Alpha unsaved title',
      body: 'Alpha unsaved body.',
    });
    expect(saved['clean-beta']).toEqual({
      title: 'Beta target',
      body: 'Beta saved body.',
    });
  });
});
