// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, createAndSaveNote, seedFolders, importJson } = require('./helpers');

test.describe('folders DB layer', () => {
  test('putFolder/getAllFolders/removeFolder round-trip', async ({ page }) => {
    await gotoApp(page);
    const names = await page.evaluate(async () => {
      await window.ScratchpadDB.putFolder({
        id: 'f-1', name: 'Work', color: 'olive', sortOrder: 0,
        parentId: null, createdAt: 1, updatedAt: 1,
      });
      await window.ScratchpadDB.bulkPutFolders([
        { id: 'f-2', name: 'Ideas', color: null, sortOrder: 1, parentId: null, createdAt: 2, updatedAt: 2 },
      ]);
      const all = (await window.ScratchpadDB.getAllFolders()).map((f) => f.name).sort();
      await window.ScratchpadDB.removeFolder('f-1');
      const after = (await window.ScratchpadDB.getAllFolders()).map((f) => f.name);
      return { all, after };
    });
    expect(names.all).toEqual(['Ideas', 'Work']);
    expect(names.after).toEqual(['Ideas']);
  });

  test('upgrade to v3 preserves existing notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Kept', body: 'still here' }]);
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(count).toBe(1);
  });
});

test.describe('folder model', () => {
  test('eyebrow shows the note folder name', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Filed', body: 'x', folderId: 'f-work' }]);
    await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);
    await page.locator('.note-row', { hasText: 'Filed' }).click();
    await expect(page.locator('#note-eyebrow')).toContainText('Work');
  });

  test('orphan folderId heals to Notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-2', title: 'Orphan', body: 'x', folderId: 'gone' }]);
    await page.locator('.note-row', { hasText: 'Orphan' }).click();
    await expect(page.locator('#note-eyebrow')).toContainText('Notes');
  });
});

test.describe('sidebar accordion', () => {
  test('folders render as sections with counts, Notes last', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'n-1', title: 'In work', body: 'x', folderId: 'f-w' },
      { id: 'n-2', title: 'Loose', body: 'x' },
    ]);
    await seedFolders(page, [{ id: 'f-w', name: 'Work' }]);
    const heads = page.locator('.folder-head');
    await expect(heads).toHaveCount(2);
    await expect(heads.first()).toContainText('Work');
    await expect(heads.first().locator('.folder-count')).toHaveText('1');
    await expect(heads.last()).toContainText('Notes');
  });

  test('collapse persists across reload', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'In work', body: 'x', folderId: 'f-w' }]);
    await seedFolders(page, [{ id: 'f-w', name: 'Work' }]);
    const toggle = page.locator('.folder-head[data-folder-id="f-w"] .folder-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.note-row', { hasText: 'In work' })).toBeHidden();
    await page.reload();
    await expect(page.locator('.folder-head[data-folder-id="f-w"] .folder-toggle'))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('Recent toggle restores date buckets and persists', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Fresh', body: 'x' }]);
    await page.locator('#group-recent').click();
    await expect(page.locator('.note-section-head').first()).toHaveText('Today');
    await page.reload();
    await expect(page.locator('#group-recent')).toHaveClass(/is-active/);
  });

  test('pinned note sorts first inside its folder in folders mode', async ({ page }) => {
    const base = Date.now();
    await seedRawNotes(page, [
      { id: 'n-old-pinned', title: 'Old pinned', body: 'x', folderId: 'f-w', pinned: true, updatedAt: base - 60_000 },
      { id: 'n-new', title: 'Newer plain', body: 'x', folderId: 'f-w', updatedAt: base },
    ]);
    await seedFolders(page, [{ id: 'f-w', name: 'Work' }]);
    const rows = page.locator('.folder-section .note-row');
    await expect(rows.first()).toContainText('Old pinned');
  });
});
