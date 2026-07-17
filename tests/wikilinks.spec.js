// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('wikilink rendering', () => {
  test('resolved, alias, and phantom links render correctly', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'target-1', title: 'Project Plan', body: 'the plan' },
      { id: 'source-1', title: 'Journal', body: 'See [[Project Plan]] and [[Project Plan|the plan]] and [[Missing Note]].', updatedAt: Date.now() + 1000 },
    ]);
    await page.locator('.note-row', { hasText: 'Journal' }).click();
    const rendered = page.locator('#note-rendered');
    const links = rendered.locator('a.wikilink');
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveText('Project Plan');
    await expect(links.nth(0)).toHaveAttribute('href', '#note:target-1');
    await expect(links.nth(1)).toHaveText('the plan');
    await expect(links.nth(1)).toHaveAttribute('href', '#note:target-1');
    await expect(links.nth(2)).toHaveClass(/is-phantom/);
    await expect(links.nth(2)).toHaveAttribute('href', '#new:Missing%20Note');
    // Wikilinks are same-page: no _blank/noopener from hardenLinks.
    await expect(links.nth(0)).not.toHaveAttribute('target', '_blank');
  });

  test('wikilinks inside code are not linkified; case-insensitive match; trashed target is phantom', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'target-2', title: 'Alpha', body: 'a' },
      { id: 'gone-1', title: 'Gone', body: 'g', deletedAt: Date.now() },
      { id: 'source-2', title: 'Refs', body: '`[[Alpha]]` then [[alpha]] then [[Gone]]', updatedAt: Date.now() + 1000 },
    ]);
    await page.locator('.note-row', { hasText: 'Refs' }).click();
    const rendered = page.locator('#note-rendered');
    await expect(rendered.locator('code', { hasText: '[[Alpha]]' })).toBeVisible();
    await expect(rendered.locator('a.wikilink')).toHaveCount(2);
    await expect(rendered.locator('a.wikilink').nth(0)).toHaveAttribute('href', '#note:target-2');
    await expect(rendered.locator('a.wikilink').nth(1)).toHaveClass(/is-phantom/);
  });
});
