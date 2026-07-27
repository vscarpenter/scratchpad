// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

test.describe('duplicate note', () => {
  test('duplicates a note via the overflow menu', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'overflow-source', title: 'Meeting notes', body: 'Agenda items.', tags: ['work', 'planning'], folderId: 'f-work' },
    ]);
    await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);

    await page.locator('.note-row[data-id="overflow-source"]').click();
    await expect(page.locator('#note-eyebrow')).toContainText('Work');

    await page.locator('#overflow-btn').click();
    await page.locator('#duplicate-overflow-btn').click();

    await expect(page.locator('.toast', { hasText: 'Note duplicated.' }).last()).toBeVisible();
    await expect(page.locator('#note-count')).toHaveText('2');

    // The new copy is selected and rendered, carrying over body/tags/folder.
    await expect(page.locator('#note-title-display')).toHaveText('Meeting notes (copy)');
    await expect(page.locator('#note-rendered')).toContainText('Agenda items.');
    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by work' })).toBeVisible();
    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by planning' })).toBeVisible();
    await expect(page.locator('#note-eyebrow')).toContainText('Work');
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-checked', 'false');
  });

  test('duplicates a note via the command palette', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-source', title: 'Palette source', body: 'Body text.', tags: ['alpha'] },
    ]);
    await page.locator('.note-row[data-id="palette-source"]').click();

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('duplicate note');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('#note-count')).toHaveText('2');
    await expect(page.locator('#note-title-display')).toHaveText('Palette source (copy)');
    await expect(page.locator('#note-rendered')).toContainText('Body text.');
  });

  test('leaves the original note unchanged after duplicating', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'unchanged-source', title: 'Original title', body: 'Original body.', tags: ['keep'] },
    ]);
    await page.locator('.note-row[data-id="unchanged-source"]').click();

    await page.locator('#overflow-btn').click();
    await page.locator('#duplicate-overflow-btn').click();
    await expect(page.locator('#note-title-display')).toHaveText('Original title (copy)');

    const original = await page.evaluate(async () => window.ScratchpadDB.get('unchanged-source'));
    expect(original.title).toBe('Original title');
    expect(original.body).toBe('Original body.');
    expect(original.tags).toEqual(['keep']);

    // Selecting the original back in the UI confirms it rendered unchanged too.
    await page.locator('.note-row[data-id="unchanged-source"]').click();
    await expect(page.locator('#note-title-display')).toHaveText('Original title');
    await expect(page.locator('#note-rendered')).toContainText('Original body.');
  });

  test('duplicating a pinned note yields an unpinned copy', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'pinned-source', title: 'Pinned original', body: 'Pinned body.', pinned: true },
    ]);
    await page.locator('.note-row[data-id="pinned-source"]').click();
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-checked', 'true');

    await page.locator('#overflow-btn').click();
    await page.locator('#duplicate-overflow-btn').click();

    await expect(page.locator('#note-title-display')).toHaveText('Pinned original (copy)');
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-checked', 'false');

    // The original note is still pinned; only the copy starts unpinned.
    const original = await page.evaluate(async () => window.ScratchpadDB.get('pinned-source'));
    expect(original.pinned).toBe(true);
  });

  test('hides the duplicate action for trashed notes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'trashed-source', title: 'Trashed note', body: 'Gone.', deletedAt: Date.now() },
    ]);
    await page.locator('#trash-view').click();
    await page.locator('.note-row[data-id="trashed-source"]').click();

    // The overflow menu stays available in Trash (it hosts Restore and
    // Delete forever now), but the duplicate action must not appear.
    await page.locator('#overflow-btn').click();
    await expect(page.locator('#overflow-menu')).toBeVisible();
    await expect(page.locator('#duplicate-overflow-btn')).toBeHidden();
    await page.keyboard.press('Escape');

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('duplicate note');
    await expect(
      page.locator('#command-palette-list [role="option"]', { hasText: 'Duplicate note' })
    ).toHaveCount(0);
  });
});
