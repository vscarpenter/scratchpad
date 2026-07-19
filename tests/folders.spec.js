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

test.describe('folder crud', () => {
  test('create via + New folder with color', async ({ page }) => {
    await gotoApp(page);
    await page.locator('.new-folder-row').click();
    await page.locator('#folder-name-input').fill('Projects');
    await page.locator('input[name="folder-color"][value="sky"]').check();
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('.folder-head', { hasText: 'Projects' })).toBeVisible();
    await expect(page.locator('.folder-head .folder-dot[data-color="sky"]')).toBeVisible();
  });

  test('validation: empty, reserved, duplicate', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.new-folder-row').click();
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toHaveText('Folder name is required.');
    await page.locator('#folder-name-input').fill('notes');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toContainText('reserved');
    await page.locator('#folder-name-input').fill('work');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toContainText('already exists');
  });

  test('rename via folder menu', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.folder-head[data-folder-id="f-1"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="rename"]').click();
    await page.locator('#folder-name-input').fill('Career');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('.folder-head', { hasText: 'Career' })).toBeVisible();
  });

  test('command palette creates folders', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('new folder');
    await page.keyboard.press('Enter');
    await page.locator('#folder-name-input').fill('FromPalette');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('.folder-head', { hasText: 'FromPalette' })).toBeVisible();
  });
});

test.describe('folder delete and reorder', () => {
  test('delete keeping notes moves them to Notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Keep me', body: 'x', folderId: 'f-1' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Doomed' }]);
    await page.locator('.folder-head[data-folder-id="f-1"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="delete"]').click();
    await page.locator('#folder-delete-keep').click();
    await expect(page.locator('.folder-head', { hasText: 'Doomed' })).toBeHidden();
    const notesSection = page.locator('.folder-section').last();
    await expect(notesSection.locator('.note-row', { hasText: 'Keep me' })).toBeVisible();
  });

  test('delete trashing notes sends them to Trash', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Trash me', body: 'x', folderId: 'f-1' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Doomed' }]);
    await page.locator('.folder-head[data-folder-id="f-1"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="delete"]').click();
    await page.locator('#folder-delete-trash').click();
    await page.locator('#trash-view').click();
    await expect(page.locator('.note-row', { hasText: 'Trash me' })).toBeVisible();
  });

  test('move down reorders folders and persists', async ({ page }) => {
    await seedFolders(page, [
      { id: 'f-a', name: 'Alpha', sortOrder: 0 },
      { id: 'f-b', name: 'Beta', sortOrder: 1 },
    ]);
    await page.locator('.folder-head[data-folder-id="f-a"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="move-down"]').click();
    const heads = page.locator('.folder-head .folder-name');
    await expect(heads.nth(0)).toHaveText('Beta');
    await expect(heads.nth(1)).toHaveText('Alpha');
    await page.reload();
    await expect(page.locator('.folder-head .folder-name').first()).toHaveText('Beta');
  });
});

test.describe('move to folder', () => {
  test('editor overflow move; updatedAt unchanged', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Mover', body: 'x' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    const before = await page.evaluate(async () => (await window.ScratchpadDB.get('n-1')).updatedAt);
    await page.locator('.note-row', { hasText: 'Mover' }).click();
    await page.locator('#overflow-btn').click();
    await page.locator('#move-note-overflow').click();
    await page.locator('#move-folder-list button', { hasText: 'Work' }).click();
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-count')).toHaveText('1');
    const after = await page.evaluate(async () => (await window.ScratchpadDB.get('n-1')).updatedAt);
    expect(after).toBe(before);
  });

  test('bulk move', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'n-1', title: 'One', body: 'x' },
      { id: 'n-2', title: 'Two', body: 'x' },
    ]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('#bulk-toggle').click();
    await page.locator('.note-row', { hasText: 'One' }).locator('input[type="checkbox"]').check();
    await page.locator('.note-row', { hasText: 'Two' }).locator('input[type="checkbox"]').check();
    await page.locator('#bulk-move-folder').click();
    await page.locator('#move-folder-list button', { hasText: 'Work' }).click();
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-count')).toHaveText('2');
  });

  test('new note here lands in the folder', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.folder-head[data-folder-id="f-1"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="new-note"]').click();
    await page.locator('#note-title-input').fill('Born here');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-eyebrow')).toContainText('Work');
  });

  test('palette move command files the selected note', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Palette mover', body: 'x' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.note-row', { hasText: 'Palette mover' }).click();
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('move note');
    await page.keyboard.press('Enter');
    await page.locator('#move-folder-list button', { hasText: 'Work' }).click();
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-count')).toHaveText('1');
  });
});

test.describe('drag and drop', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'HTML5 DnD simulation is only reliable in Chromium');

  test('drag note onto folder header moves it', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Dragged', body: 'x' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.note-row', { hasText: 'Dragged' })
      .dragTo(page.locator('.folder-head[data-folder-id="f-1"]'));
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-count')).toHaveText('1');
  });

  test('drag onto collapsed folder moves without expanding', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Dragged', body: 'x' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.folder-head[data-folder-id="f-1"] .folder-toggle').click();
    await page.locator('.note-row', { hasText: 'Dragged' })
      .dragTo(page.locator('.folder-head[data-folder-id="f-1"]'));
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-count')).toHaveText('1');
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-toggle'))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('drag folder header reorders folders', async ({ page }) => {
    await seedFolders(page, [
      { id: 'f-a', name: 'Alpha', sortOrder: 0 },
      { id: 'f-b', name: 'Beta', sortOrder: 1 },
    ]);
    await page.locator('.folder-head[data-folder-id="f-b"]')
      .dragTo(page.locator('.folder-head[data-folder-id="f-a"]'));
    await expect(page.locator('.folder-head .folder-name').first()).toHaveText('Beta');
  });
});

test.describe('trash retention', () => {
  test('notes older than 30 days purge on load; younger survive', async ({ page }) => {
    const now = Date.now();
    await seedRawNotes(page, [
      { id: 'n-old', title: 'Expired', body: 'x', deletedAt: now - 31 * 24 * 60 * 60 * 1000 },
      { id: 'n-young', title: 'Recent trash', body: 'x', deletedAt: now - 29 * 24 * 60 * 60 * 1000 },
    ]);
    await page.reload();
    await page.locator('#trash-view').click();
    await expect(page.locator('.note-row', { hasText: 'Recent trash' })).toBeVisible();
    await expect(page.locator('.note-row', { hasText: 'Expired' })).toHaveCount(0);
    const gone = await page.evaluate(async () => ({
      note: await window.ScratchpadDB.get('n-old'),
      revs: await window.ScratchpadDB.getRevisions('n-old'),
    }));
    expect(gone.note).toBeFalsy();
    expect(gone.revs).toEqual([]);
  });

  test('trash view shows the retention notice', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-t', title: 'In trash', body: 'x', deletedAt: Date.now() }]);
    await page.locator('#trash-view').click();
    await expect(page.locator('.trash-retention-note'))
      .toHaveText('Notes in Trash are deleted forever after 30 days.');
  });
});

test.describe('backups with folders', () => {
  test('v3 export payload carries folders; round-trip restores them', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Filed', body: 'x', folderId: 'f-1' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work', color: 'olive' }]);
    const payload = await page.evaluate(async () => {
      const notes = await window.ScratchpadDB.getAll();
      const folders = await window.ScratchpadDB.getAllFolders();
      return {
        app: 'scratchpad', version: 'test', schemaVersion: 3, exportedAt: new Date().toISOString(),
        notes: notes.filter((n) => !n.deletedAt), trashedNotes: [], revisions: [], folders,
      };
    });
    await page.evaluate(() => window.ScratchpadDB.clearAllStores());
    await page.reload();
    await importJson(page, payload);
    await page.locator('#confirm-import').click();
    await expect(page.locator('.folder-head', { hasText: 'Work' })).toBeVisible();
    await expect(page.locator('.folder-head[data-folder-id] .folder-count').first()).toHaveText('1');
  });

  test('v2 backup still imports; notes land in Notes', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, {
      app: 'scratchpad', version: 'test', schemaVersion: 2, exportedAt: new Date().toISOString(),
      notes: [{ id: 'n-v2', title: 'Legacy', body: 'x', tags: [], pinned: false, createdAt: 1, updatedAt: 1, deletedAt: null }],
      trashedNotes: [], revisions: [],
    });
    await page.locator('#confirm-import').click();
    const notesSection = page.locator('.folder-section').last();
    await expect(notesSection.locator('.note-row', { hasText: 'Legacy' })).toBeVisible();
  });

  test('imported folder with clashing name gets a numeric suffix', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-mine', name: 'Work' }]);
    await importJson(page, {
      app: 'scratchpad', version: 'test', schemaVersion: 3, exportedAt: new Date().toISOString(),
      notes: [{ id: 'n-x', title: 'Rider', body: 'x', tags: [], pinned: false, createdAt: 1, updatedAt: 1, deletedAt: null, folderId: 'f-theirs' }],
      trashedNotes: [], revisions: [],
      folders: [{ id: 'f-theirs', name: 'Work', color: null, sortOrder: 0, parentId: null, createdAt: 1, updatedAt: 1 }],
    });
    await page.locator('#confirm-import').click();
    await expect(page.locator('.folder-head', { hasText: 'Work 2' })).toBeVisible();
  });

  test('exportAll payload is schemaVersion 3 with folders', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    const download = page.waitForEvent('download');
    await page.locator('#open-about').click();
    await page.locator('#export-btn').click();
    const file = await download;
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(data.schemaVersion).toBe(3);
    expect(data.folders.map((f) => f.name)).toEqual(['Work']);
  });
});
