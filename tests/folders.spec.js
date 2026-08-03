// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, createAndSaveNote, seedFolders, importJson, enterBulkMode, openListMenu, openBackupMenu } = require('./helpers');

const DAILY_NOTES_FOLDER_ID = 'scratchpad-daily-notes';

function localMonthKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function localDateKey(year, month, day) {
  return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function dailyMonthFixtures() {
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
  return {
    currentKey: localMonthKey(current),
    previousKey: localMonthKey(previous),
    currentNewer: localDateKey(current.getFullYear(), current.getMonth(), 2),
    currentOlder: localDateKey(current.getFullYear(), current.getMonth(), 1),
    previousNewer: localDateKey(previous.getFullYear(), previous.getMonth(), 28),
    previousOlder: localDateKey(previous.getFullYear(), previous.getMonth(), 3),
  };
}

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
      const after = (await window.ScratchpadDB.getAllFolders()).map((f) => f.name).sort();
      return { all, after };
    });
    expect(names.all).toEqual(['Daily Notes', 'Ideas', 'Work']);
    expect(names.after).toEqual(['Daily Notes', 'Ideas']);
  });

  test('upgrade to v3 preserves existing notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Kept', body: 'still here' }]);
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    const dailyFolder = await page.evaluate(async () =>
      (await window.ScratchpadDB.getAllFolders()).find((folder) => folder.id === 'scratchpad-daily-notes')
    );
    expect(count).toBe(1);
    expect(dailyFolder.name).toBe('Daily Notes');
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
    await seedFolders(page, [{ id: 'f-w', name: 'Work', sortOrder: 1 }]);
    const heads = page.locator('.folder-head');
    await expect(heads).toHaveCount(3);
    await expect(heads.first()).toContainText('Daily Notes');
    await expect(heads.first().locator('.folder-count')).toHaveText('0');
    await expect(page.locator('.folder-head[data-folder-id="f-w"] .folder-count')).toHaveText('1');
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

  test('groups Daily Notes by month with newest days first and older months collapsed', async ({ page }) => {
    const dates = dailyMonthFixtures();
    await seedRawNotes(page, [
      { id: 'current-old', title: 'Current older', body: 'x', dailyDate: dates.currentOlder },
      { id: 'previous-old', title: 'Previous older', body: 'x', dailyDate: dates.previousOlder },
      { id: 'current-new', title: 'Current newer', body: 'x', dailyDate: dates.currentNewer },
      { id: 'previous-new', title: 'Previous newer', body: 'x', dailyDate: dates.previousNewer },
    ]);

    const groups = page.locator('.daily-month-group');
    await expect(groups).toHaveCount(2);
    await expect(groups.first()).toHaveAttribute('data-month', dates.currentKey);
    await expect(groups.last()).toHaveAttribute('data-month', dates.previousKey);

    const current = page.locator(`.daily-month-group[data-month="${dates.currentKey}"]`);
    const previous = page.locator(`.daily-month-group[data-month="${dates.previousKey}"]`);
    await expect(current.locator('.daily-month-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(current.locator('.daily-month-count')).toHaveText('2');
    await expect(current.locator('.note-row').nth(0)).toHaveAttribute('data-id', 'current-new');
    await expect(current.locator('.note-row').nth(1)).toHaveAttribute('data-id', 'current-old');
    await expect(previous.locator('.daily-month-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(previous.locator('.daily-month-notes')).toBeHidden();
  });

  test('persists explicit Daily Notes month disclosure choices across reload', async ({ page }) => {
    const dates = dailyMonthFixtures();
    await seedRawNotes(page, [
      { id: 'current-day', title: 'Current day', body: 'x', dailyDate: dates.currentNewer },
      { id: 'previous-day', title: 'Previous day', body: 'x', dailyDate: dates.previousNewer },
    ]);

    const currentToggle = page.locator(`.daily-month-group[data-month="${dates.currentKey}"] .daily-month-toggle`);
    const previousToggle = page.locator(`.daily-month-group[data-month="${dates.previousKey}"] .daily-month-toggle`);
    await currentToggle.click();
    await previousToggle.click();
    await expect(currentToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(previousToggle).toHaveAttribute('aria-expanded', 'true');

    await page.reload();
    await expect(page.locator(`.daily-month-group[data-month="${dates.currentKey}"] .daily-month-toggle`))
      .toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`.daily-month-group[data-month="${dates.previousKey}"] .daily-month-toggle`))
      .toHaveAttribute('aria-expanded', 'true');
  });

  test('groups archived Daily Notes by month while Recent and search stay flat', async ({ page }) => {
    const dates = dailyMonthFixtures();
    await seedRawNotes(page, [
      { id: 'active-day', title: 'Active daily unique', body: 'x', dailyDate: dates.currentNewer },
      {
        id: 'archived-day',
        title: 'Archived daily unique',
        body: 'x',
        dailyDate: dates.previousNewer,
        archivedAt: Date.now(),
      },
    ]);

    await page.locator('#archive-view').click();
    await expect(page.locator(`.daily-month-group[data-month="${dates.previousKey}"]`)).toHaveCount(1);

    await page.locator('#active-notes-view').click();
    await page.locator('#group-recent').click();
    await expect(page.locator('.daily-month-group')).toHaveCount(0);
    await expect(page.locator('.note-row[data-id="active-day"]')).toBeVisible();

    await page.locator('#group-folders').click();
    await page.locator('#search').fill('Active daily unique');
    await expect(page.locator('.daily-month-group')).toHaveCount(0);
    await expect(page.locator('.note-row[data-id="active-day"]')).toBeVisible();
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

  test('create via the list overflow menu', async ({ page }) => {
    await gotoApp(page);
    await openListMenu(page);
    await page.locator('#new-folder-menu-btn').click();
    await expect(page.locator('#folder-dialog')).toBeVisible();
    await page.locator('#folder-name-input').fill('Menu made');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('.folder-head', { hasText: 'Menu made' })).toBeVisible();
  });

  test('validation: empty, reserved, duplicate', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.new-folder-row').click();
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toHaveText('Folder name is required.');
    await page.locator('#folder-name-input').fill('notes');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toContainText('reserved');
    await page.locator('#folder-name-input').fill('daily notes');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toContainText('reserved');
    await page.locator('#folder-name-input').fill('work');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toContainText('already exists');
  });

  test('folder menu opens as a compact popover anchored to its trigger', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    const trigger = page.locator('.folder-head[data-folder-id="f-1"] .folder-menu-btn');
    await trigger.click();
    const menu = page.locator('#folder-menu');
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    const triggerBox = await trigger.boundingBox();
    const viewport = page.viewportSize();
    // Anchored under its trigger, content-sized — not stretched to the viewport edge.
    expect(Math.abs(menuBox.x - triggerBox.x)).toBeLessThanOrEqual(1);
    expect(menuBox.y).toBeGreaterThan(triggerBox.y + triggerBox.height);
    expect(menuBox.width).toBeLessThan(320);
    expect(menuBox.x + menuBox.width).toBeLessThan(viewport.width - 40);
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

  test('managed Daily Notes folder keeps only reorder actions', async ({ page }) => {
    await gotoApp(page);
    await page.locator(`.folder-head[data-folder-id="${DAILY_NOTES_FOLDER_ID}"] .folder-menu-btn`).click();
    await expect(page.locator('#folder-menu [data-action="rename"]')).toBeHidden();
    await expect(page.locator('#folder-menu [data-action="new-note"]')).toBeHidden();
    await expect(page.locator('#folder-menu [data-action="delete"]')).toBeHidden();
    await expect(page.locator('#folder-menu [data-action="move-up"]')).toBeVisible();
    await expect(page.locator('#folder-menu [data-action="move-down"]')).toBeVisible();
  });

  test('adopts an existing Daily Notes folder and preserves its membership', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(async () => {
      await window.ScratchpadDB.clearAllStores();
      await window.ScratchpadDB.putFolder({
        id: 'legacy-daily-folder', name: 'daily notes', color: 'olive', sortOrder: 3,
        parentId: null, createdAt: 10, updatedAt: 20,
      });
      await window.ScratchpadDB.bulkPut([
        {
          id: 'legacy-daily', title: 'Legacy day', body: 'daily', tags: [],
          pinned: false, folderId: null, dailyDate: '2026-05-01',
          createdAt: 1, updatedAt: 2, deletedAt: null, lastDraftAt: null,
        },
        {
          id: 'legacy-member', title: 'Existing member', body: 'keep filed', tags: [],
          pinned: false, folderId: 'legacy-daily-folder', dailyDate: null,
          createdAt: 1, updatedAt: 2, deletedAt: null, lastDraftAt: null,
        },
      ]);
    });
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();

    const state = await page.evaluate(async () => ({
      folders: await window.ScratchpadDB.getAllFolders(),
      notes: await window.ScratchpadDB.getAll(),
    }));
    expect(state.folders.find((folder) => folder.id === DAILY_NOTES_FOLDER_ID)).toMatchObject({
      name: 'Daily Notes',
      color: 'olive',
      sortOrder: 3,
      createdAt: 10,
    });
    expect(state.folders.some((folder) => folder.id === 'legacy-daily-folder')).toBe(false);
    expect(state.notes.find((note) => note.id === 'legacy-daily').folderId).toBe(DAILY_NOTES_FOLDER_ID);
    expect(state.notes.find((note) => note.id === 'legacy-member').folderId).toBe(DAILY_NOTES_FOLDER_ID);
  });

  test('managed folder does not consume one of the 100 user folder slots', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(async () => {
      const base = Date.now();
      const folders = Array.from({ length: 99 }, (_, index) => ({
        id: `quota-${index}`,
        name: `Quota ${index}`,
        color: null,
        sortOrder: index + 1,
        parentId: null,
        createdAt: base + index,
        updatedAt: base + index,
      }));
      await window.ScratchpadDB.bulkPutFolders(folders);
    });
    await page.reload();
    await page.locator('.new-folder-row').click();
    await page.locator('#folder-name-input').fill('One hundred');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('.folder-head', { hasText: 'One hundred' })).toBeVisible();

    await page.locator('.new-folder-row').click();
    await page.locator('#folder-name-input').fill('One too many');
    await page.locator('#folder-dialog-save').click();
    await expect(page.locator('#folder-name-error')).toHaveText('Folder limit reached (100).');
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
      { id: 'f-a', name: 'Alpha', sortOrder: 1 },
      { id: 'f-b', name: 'Beta', sortOrder: 2 },
    ]);
    await page.locator('.folder-head[data-folder-id="f-a"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="move-down"]').click();
    const heads = page.locator(
      `.folder-head[data-folder-id]:not([data-folder-id="${DAILY_NOTES_FOLDER_ID}"]):not([data-folder-id=""]) .folder-name`
    );
    await expect(heads.nth(0)).toHaveText('Beta');
    await expect(heads.nth(1)).toHaveText('Alpha');
    await page.reload();
    await expect(page.locator(
      `.folder-head[data-folder-id]:not([data-folder-id="${DAILY_NOTES_FOLDER_ID}"]):not([data-folder-id=""]) .folder-name`
    ).first()).toHaveText('Beta');
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
    await expect(page.locator('#move-folder-list button', { hasText: 'Daily Notes' })).toHaveCount(0);
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
    await enterBulkMode(page);
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
    await expect(page.locator('.folder-head[data-folder-id="f-1"] .folder-count')).toHaveText('1');
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

  test('v2 daily notes reconcile into the managed folder after import', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, {
      app: 'scratchpad', version: 'test', schemaVersion: 2, exportedAt: new Date().toISOString(),
      notes: [{
        id: 'n-v2-daily', title: 'Legacy daily', body: 'x', tags: ['daily'],
        pinned: false, createdAt: 1, updatedAt: 1, deletedAt: null,
        dailyDate: '2026-06-03',
      }],
      trashedNotes: [], revisions: [],
    });
    await page.locator('#confirm-import').click();
    await expect(page.locator(`.folder-head[data-folder-id="${DAILY_NOTES_FOLDER_ID}"] .folder-count`)).toHaveText('1');
    const note = await page.evaluate(() => window.ScratchpadDB.get('n-v2-daily'));
    expect(note.folderId).toBe(DAILY_NOTES_FOLDER_ID);
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

  test('exportAll payload is schemaVersion 4 with folders', async ({ page }) => {
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
    expect(data.folders.map((f) => f.name).sort()).toEqual(['Daily Notes', 'Work']);
  });
});

test.describe('folder menu on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('menu stays within the viewport when the trigger sits near the right edge', async ({ page }) => {
    await seedFolders(page, [{ id: 'f-1', name: 'Work' }]);
    await page.locator('.folder-head[data-folder-id="f-1"] .folder-menu-btn').click();
    const menu = page.locator('#folder-menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });
});
