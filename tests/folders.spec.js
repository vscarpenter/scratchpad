// @ts-check
const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  seedRawNotes,
  seedFolders,
  importJson,
  enterBulkMode,
  openListMenu,
  openBackupMenu,
} = require('./helpers');

const DAILY_NOTES_FOLDER_ID = 'scratchpad-daily-notes';

function folderRow(page, id) {
  return page.locator(`#folder-switcher-list .folder-switcher-row[data-folder-id="${id}"]`);
}

async function openFolderSwitcher(page) {
  await page.locator('#folder-switcher-btn').click();
  await expect(page.locator('#folder-switcher')).toBeVisible();
}

async function selectFolder(page, id) {
  await openFolderSwitcher(page);
  await folderRow(page, id).locator('.folder-switcher-option').click();
}

async function openFolderActions(page, id) {
  await openFolderSwitcher(page);
  await folderRow(page, id).locator('.folder-switcher-menu-btn').click();
  await expect(page.locator('#folder-menu')).toBeVisible();
}

function localMonthKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function localDateKey(year, month, day) {
  return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

test.describe('folder storage', () => {
  test('putFolder/getAllFolders/removeFolder round-trip', async ({ page }) => {
    await gotoApp(page);
    const names = await page.evaluate(async () => {
      await window.ScratchpadDB.putFolder({
        id: 'f-1',
        name: 'Work',
        color: 'olive',
        sortOrder: 0,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
      });
      await window.ScratchpadDB.bulkPutFolders([
        { id: 'f-2', name: 'Ideas', color: null, sortOrder: 1, parentId: null, createdAt: 2, updatedAt: 2 },
      ]);
      const all = (await window.ScratchpadDB.getAllFolders()).map((folder) => folder.name).sort();
      await window.ScratchpadDB.removeFolder('f-1');
      const after = (await window.ScratchpadDB.getAllFolders()).map((folder) => folder.name).sort();
      return { all, after };
    });
    expect(names.all).toEqual(['Daily Notes', 'Ideas', 'Work']);
    expect(names.after).toEqual(['Daily Notes', 'Ideas']);
  });

  test('orphan folderId heals to Notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-2', title: 'Orphan', body: 'x', folderId: 'gone' }]);
    await page.locator('.note-row', { hasText: 'Orphan' }).click();
    await expect(page.locator('#note-eyebrow')).toContainText('Notes');
  });
});

test.describe('folder switcher', () => {
  test('Home is the default; picker lists each folder with a visible count', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'work-note', title: 'In work', body: 'x', folderId: 'f-work' },
      { id: 'loose-note', title: 'Loose', body: 'x' },
    ]);
    await seedFolders(page, [{ id: 'f-work', name: 'Work', color: 'sky' }]);

    await expect(page.locator('#home-view')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.note-row')).toHaveCount(2);
    await openFolderSwitcher(page);
    await expect(folderRow(page, DAILY_NOTES_FOLDER_ID)).toContainText('0');
    await expect(folderRow(page, 'f-work')).toContainText('Work');
    await expect(folderRow(page, 'f-work')).toContainText('1');
    await expect(folderRow(page, '__notes__')).toContainText('Notes');
    await expect(folderRow(page, '__notes__')).toContainText('1');
  });

  test('selecting a folder persists, scopes the list, and Home restores the library', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'work-note', title: 'Work only', body: 'x', folderId: 'f-work' },
      { id: 'other-note', title: 'Elsewhere', body: 'x' },
    ]);
    await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);

    await selectFolder(page, 'f-work');
    await expect(page.locator('#folder-switcher-label')).toHaveText('Work');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Work only');
    await page.reload();
    await expect(page.locator('#folder-switcher-label')).toHaveText('Work');
    await expect(page.locator('.note-row')).toContainText('Work only');
    await page.locator('#home-view').click();
    await expect(page.locator('.note-row')).toHaveCount(2);
  });

  test('picker search finds a folder and global note search still ignores the current folder', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'work-note', title: 'Work only', body: 'x', folderId: 'f-work' },
      { id: 'idea-note', title: 'Idea outside', body: 'x', folderId: 'f-ideas' },
    ]);
    await seedFolders(page, [
      { id: 'f-work', name: 'Work' },
      { id: 'f-ideas', name: 'Ideas' },
    ]);

    await openFolderSwitcher(page);
    await page.locator('#folder-switcher-search').fill('idea');
    await expect(folderRow(page, 'f-ideas')).toBeVisible();
    await expect(folderRow(page, 'f-work')).toHaveCount(0);
    await folderRow(page, 'f-ideas').locator('.folder-switcher-option').click();
    await expect(page.locator('.note-row')).toContainText('Idea outside');
    await page.locator('#search').fill('Work only');
    await expect(page.locator('.note-row')).toContainText('Work only');
  });

  test('Daily Notes opens month groups and keeps disclosure choices', async ({ page }) => {
    const today = new Date();
    const current = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
    const currentKey = localMonthKey(current);
    const previousKey = localMonthKey(previous);
    await seedRawNotes(page, [
      {
        id: 'current-day',
        title: 'Current day',
        body: 'x',
        dailyDate: localDateKey(current.getFullYear(), current.getMonth(), 2),
      },
      {
        id: 'previous-day',
        title: 'Previous day',
        body: 'x',
        dailyDate: localDateKey(previous.getFullYear(), previous.getMonth(), 2),
      },
    ]);

    await selectFolder(page, DAILY_NOTES_FOLDER_ID);
    const currentGroup = page.locator(`.daily-month-group[data-month="${currentKey}"]`);
    const previousGroup = page.locator(`.daily-month-group[data-month="${previousKey}"]`);
    await expect(currentGroup.locator('.daily-month-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(previousGroup.locator('.daily-month-toggle')).toHaveAttribute('aria-expanded', 'false');
    await previousGroup.locator('.daily-month-toggle').click();
    await page.reload();
    await expect(page.locator(`.daily-month-group[data-month="${previousKey}"] .daily-month-toggle`)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

test.describe('folder capture and management', () => {
  test('new folder selects itself and New note files an ordinary note there', async ({ page }) => {
    await gotoApp(page);
    await openFolderSwitcher(page);
    await page.locator('#folder-switcher-new').click();
    await page.locator('#folder-name-input').fill('Projects');
    await page.locator('input[name="folder-color"][value="sky"]').check();
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-switcher-label')).toHaveText('Projects');
    await page.locator('#new-note').click();
    await page.locator('#note-title-input').fill('Born here');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-eyebrow')).toContainText('Projects');
  });

  test('list menu can create a folder and validation remains inline', async ({ page }) => {
    await gotoApp(page);
    await openListMenu(page);
    await page.locator('#new-folder-menu-btn').click();
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toHaveText('Folder name is required.');
    await page.locator('#folder-name-input').fill('Work');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-switcher-label')).toHaveText('Work');
  });

  test('picker action menu edits an ordinary folder and protects Daily Notes', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await openFolderActions(page, 'f-1');
    await page.locator('#folder-menu [data-action="rename"]').click();
    await page.locator('#folder-name-input').fill('Career');
    await page.locator('#folder-dialog-save').click();
    await openFolderActions(page, DAILY_NOTES_FOLDER_ID);
    await expect(page.locator('#folder-menu [data-action="rename"]')).toBeHidden();
    await expect(page.locator('#folder-menu [data-action="new-note"]')).toBeHidden();
    await expect(page.locator('#folder-menu [data-action="delete"]')).toBeHidden();
  });

  test('deleting the current folder returns to Home and keeps its notes in Notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Keep me', body: 'x', folderId: 'f-1' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Doomed' }]);
    await selectFolder(page, 'f-1');
    await openFolderActions(page, 'f-1');
    await page.locator('#folder-menu [data-action="delete"]').click();
    await page.locator('#folder-delete-keep').click();
    await expect(page.locator('#home-view')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.note-row')).toContainText('Keep me');
    const note = await page.evaluate(() => window.ScratchpadDB.get('n-1'));
    expect(note.folderId).toBeNull();
  });

  test('move menu preserves updatedAt and the picker count updates', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Mover', body: 'x' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    const before = await page.evaluate(async () => (await window.ScratchpadDB.get('n-1')).updatedAt);
    await page.locator('.note-row', { hasText: 'Mover' }).click();
    await page.locator('#overflow-btn').click();
    await page.locator('#move-note-overflow').click();
    await page.locator('#move-folder-list button', { hasText: 'Work' }).click();
    const after = await page.evaluate(async () => (await window.ScratchpadDB.get('n-1')).updatedAt);
    expect(after).toBe(before);
    await openFolderSwitcher(page);
    await expect(folderRow(page, 'f-1')).toContainText('1');
  });

  test('bulk move remains available from Home', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'n-1', title: 'One', body: 'x' },
      { id: 'n-2', title: 'Two', body: 'x' },
    ]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await enterBulkMode(page);
    await page.locator('.note-row', { hasText: 'One' }).locator('input[type="checkbox"]').check();
    await page.locator('.note-row', { hasText: 'Two' }).locator('input[type="checkbox"]').check();
    await page.locator('#bulk-move-folder').click();
    await page.locator('#move-folder-list button', { hasText: 'Work' }).click();
    const folders = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).map((note) => note.folderId));
    expect(folders).toContain('f-1');
  });
});

test.describe('drag-to-file', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'HTML5 DataTransfer is only reliable in Chromium');

  test('dragging a note opens the picker and dropping files it', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Dragged', body: 'x' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await page.locator('.note-row[data-id="n-1"]').dispatchEvent('dragstart', { dataTransfer });
    await expect(page.locator('#folder-switcher')).toBeVisible();
    await folderRow(page, 'f-1').dispatchEvent('dragover', { dataTransfer });
    await folderRow(page, 'f-1').dispatchEvent('drop', { dataTransfer });
    const note = await page.evaluate(() => window.ScratchpadDB.get('n-1'));
    expect(note.folderId).toBe('f-1');
  });
});

const V2_BACKUP = {
  app: 'scratchpad',
  version: 'test',
  schemaVersion: 2,
  exportedAt: new Date().toISOString(),
  notes: [
    { id: 'n-v2', title: 'Legacy', body: 'x', tags: [], pinned: false, createdAt: 1, updatedAt: 1, deletedAt: null },
  ],
  trashedNotes: [],
  revisions: [],
};

test.describe('backups with folders', () => {
  test('v2 backup still imports notes into Notes', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, V2_BACKUP);
    await page.locator('#confirm-import').click();
    await selectFolder(page, '__notes__');
    await expect(page.locator('.note-row', { hasText: 'Legacy' })).toBeVisible();
  });

  test('exportAll payload remains schemaVersion 4 with folders', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    const download = page.waitForEvent('download');
    await openBackupMenu(page);
    await page.locator('#export-btn').click();
    const file = await download;
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(data.schemaVersion).toBe(4);
    expect(data.folders.map((folder) => folder.name).sort()).toEqual(['Daily Notes', 'Work']);
  });
});

test.describe('folder switcher on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('picker and its actions stay within the viewport', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await openFolderSwitcher(page);
    const pickerBox = await page.locator('#folder-switcher').boundingBox();
    const viewport = page.viewportSize();
    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width);
    await folderRow(page, 'f-1').locator('.folder-switcher-menu-btn').click();
    const menuBox = await page.locator('#folder-menu').boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
  });
});
