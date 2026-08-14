// @ts-check
const { test, expect } = require('@playwright/test');
const {
  seedRawNotes,
  seedFolders,
  openOverflowMenu,
} = require('./helpers');

test.describe('Archive lifecycle', () => {
  test('separates active, archived, and trashed notes with Trash precedence', async ({ page }) => {
    const base = Date.now();
    await seedRawNotes(page, [
      { id: 'active', title: 'Active note', body: 'working' },
      {
        id: 'archive-old',
        title: 'Older archive',
        body: 'old',
        pinned: true,
        archivedAt: base - 60_000,
      },
      { id: 'archive-new', title: 'Newer archive', body: 'new', archivedAt: base },
      {
        id: 'archive-trash',
        title: 'Archived then trashed',
        body: 'gone',
        archivedAt: base - 120_000,
        deletedAt: base,
      },
    ]);

    await expect(page.locator('.note-row[data-id="active"]')).toBeVisible();
    await expect(page.locator('.note-row[data-id="archive-new"]')).toHaveCount(0);

    await page.locator('#archive-view').click();
    await expect(page.locator('.note-row')).toHaveCount(2);
    await expect(page.locator('.note-row').first()).toHaveAttribute('data-id', 'archive-new');
    await expect(page.locator('.note-row[data-id="archive-new"] .note-row-when')).toContainText('Archived');
    await expect(page.locator('.note-row[data-id="archive-old"] .note-row-open')).toHaveAttribute(
      'aria-label',
      /pinned when active/
    );
    await expect(page.locator('.note-row[data-id="archive-trash"]')).toHaveCount(0);

    await page.locator('#trash-view').click();
    await expect(page.locator('.note-row[data-id="archive-trash"]')).toBeVisible();
  });

  test('archives immediately, preserves metadata, and supports Undo', async ({ page }) => {
    const updatedAt = Date.now() - 86_400_000;
    await seedRawNotes(page, [{
      id: 'archive-me',
      title: 'Archive me',
      body: 'Keep everything',
      tags: ['project'],
      pinned: true,
      folderId: 'project-folder',
      updatedAt,
    }]);
    await seedFolders(page, [{ id: 'project-folder', name: 'Project Alpha' }]);

    await page.locator('.note-row[data-id="archive-me"]').click();
    await openOverflowMenu(page);
    await page.locator('#archive-note-btn').click();

    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-title-display')).toHaveText('Archive me');
    const archived = await page.evaluate(() => window.ScratchpadDB.get('archive-me'));
    expect(archived.archivedAt).toEqual(expect.any(Number));
    expect(archived.updatedAt).toBe(updatedAt);
    expect(archived.folderId).toBe('project-folder');
    expect(archived.pinned).toBe(true);

    const toast = page.locator('.toast', { hasText: 'Archived' }).last();
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
    await toast.getByRole('button', { name: 'Undo' }).click();

    await expect(page.locator('#active-notes-view')).toHaveClass(/is-active/);
    const active = await page.evaluate(() => window.ScratchpadDB.get('archive-me'));
    expect(active.archivedAt).toBeNull();
    expect(active.updatedAt).toBe(updatedAt);
  });

  test('restores a trashed Archived Note back to Archive', async ({ page }) => {
    const archivedAt = Date.now() - 60_000;
    await seedRawNotes(page, [{
      id: 'restore-archive',
      title: 'Restore to Archive',
      body: 'Body',
      archivedAt,
      deletedAt: Date.now(),
    }]);

    await page.locator('#trash-view').click();
    await page.locator('.note-row[data-id="restore-archive"]').click();
    await openOverflowMenu(page);
    await page.locator('#restore-btn').click();

    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-title-display')).toHaveText('Restore to Archive');
    const restored = await page.evaluate(() => window.ScratchpadDB.get('restore-archive'));
    expect(restored.deletedAt).toBeNull();
    expect(restored.archivedAt).toBe(archivedAt);
  });

  test('preserves a dirty editor while archiving and saves in Archive', async ({ page }) => {
    await seedRawNotes(page, [{
      id: 'dirty-archive',
      title: 'Dirty archive',
      body: 'Saved body',
    }]);

    await page.locator('.note-row[data-id="dirty-archive"]').click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved body remains');
    await openOverflowMenu(page);
    await page.locator('#archive-note-btn').click();

    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved body remains');
    await page.locator('#save-btn').click();

    await expect.poll(() => page.evaluate(async () => {
      const stored = await window.ScratchpadDB.get('dirty-archive');
      return {
        body: stored.body,
        archived: Number.isFinite(stored.archivedAt),
      };
    })).toEqual({ body: 'Unsaved body remains', archived: true });
  });

  test('offers Archive when no Active Notes remain', async ({ page }) => {
    await seedRawNotes(page, [{
      id: 'only-archived',
      title: 'Only archived',
      body: 'Still here',
      archivedAt: Date.now(),
    }]);

    await expect(page.locator('#empty-no-notes h3')).toHaveText('No active notes');
    await expect(page.locator('#empty-no-notes')).toContainText('Everything you have written is in Archive.');
    await page.locator('#empty-view-archive').click();
    await expect(page.locator('.note-row[data-id="only-archived"]')).toBeVisible();
  });

  test('duplicates an Archived Note into Active Notes', async ({ page }) => {
    await seedRawNotes(page, [{
      id: 'archived-source',
      title: 'Archived source',
      body: 'Copy this',
      tags: ['reference'],
      pinned: true,
      folderId: 'project-folder',
      archivedAt: Date.now(),
    }]);
    await seedFolders(page, [{ id: 'project-folder', name: 'Project Alpha' }]);

    await page.locator('#archive-view').click();
    await page.locator('.note-row[data-id="archived-source"]').click();
    await openOverflowMenu(page);
    await page.locator('#duplicate-overflow-btn').click();

    await expect(page.locator('#active-notes-view')).toHaveClass(/is-active/);
    const records = await page.evaluate(() => window.ScratchpadDB.getAll());
    const copy = records.find((note) => note.id !== 'archived-source');
    expect(copy.title).toBe('Archived source (copy)');
    expect(copy.archivedAt).toBeNull();
    expect(copy.folderId).toBe('project-folder');
    expect(copy.pinned).toBe(false);
  });

  test('Unarchive follows the note to Notes without changing its edit timestamp', async ({ page }) => {
    const updatedAt = Date.now() - 86_400_000;
    await seedRawNotes(page, [{
      id: 'unarchive-me',
      title: 'Unarchive me',
      body: 'Reference',
      pinned: true,
      updatedAt,
      archivedAt: Date.now(),
    }]);

    await page.locator('#archive-view').click();
    await page.locator('.note-row[data-id="unarchive-me"]').click();
    await openOverflowMenu(page);
    await expect(page.locator('#pin-toggle')).toHaveText('Unpin when active');
    await page.locator('#unarchive-note-btn').click();

    await expect(page.locator('#active-notes-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-title-display')).toHaveText('Unarchive me');
    const note = await page.evaluate(() => window.ScratchpadDB.get('unarchive-me'));
    expect(note.archivedAt).toBeNull();
    expect(note.updatedAt).toBe(updatedAt);
  });

  test('search remains scoped to the selected lifecycle while its query persists', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'search-active', title: 'Needle active', body: 'Working' },
      { id: 'search-archive', title: 'Needle archived', body: 'Reference', archivedAt: Date.now() },
    ]);

    await page.locator('#search').fill('needle');
    await expect(page.locator('.note-row[data-id="search-active"]')).toBeVisible();
    await expect(page.locator('.note-row[data-id="search-archive"]')).toHaveCount(0);
    await page.locator('#archive-view').click();
    await expect(page.locator('#search')).toHaveValue('needle');
    await expect(page.locator('.note-row[data-id="search-active"]')).toHaveCount(0);
    await expect(page.locator('.note-row[data-id="search-archive"]')).toBeVisible();
  });
});
