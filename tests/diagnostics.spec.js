// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('local diagnostics', () => {
  test('reports note, trash, revision, draft, and storage health', async ({ page }) => {
    const deletedAt = Date.now() - 1000;
    await seedRawNotes(page, [
      { id: 'diag-active-a', title: 'Active A', body: 'Body A.' },
      { id: 'diag-active-b', title: 'Active B', body: 'Body B.' },
      { id: 'diag-trash', title: 'Trashed', body: 'Trash body.', deletedAt },
    ]);
    await page.evaluate(async () => {
      await window.ScratchpadDB.putRevision({
        id: 'diag-rev',
        noteId: 'diag-active-a',
        title: 'Active A old',
        body: 'Old body.',
        tags: [],
        pinned: false,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 9000,
        savedAt: Date.now() - 8000,
        deletedAt: null,
      });
      await window.ScratchpadDB.putDraft({
        noteId: 'diag-active-b',
        title: 'Active B draft',
        body: 'Draft body.',
        updatedAt: Date.now(),
      });
    });

    await page.locator('#open-about').click();
    await expect(page.locator('#diagnostic-active-notes')).toHaveText('2');
    await expect(page.locator('#diagnostic-trashed-notes')).toHaveText('1');
    await expect(page.locator('#diagnostic-revisions')).toHaveText('1');
    await expect(page.locator('#diagnostic-drafts')).toHaveText('1');
    await expect(page.locator('#diagnostic-storage')).not.toHaveText('Checking...');
    await expect(page.locator('#diagnostic-last-backup')).not.toHaveText('Checking...');
  });
});
