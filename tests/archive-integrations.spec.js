// @ts-check
const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  seedRawNotes,
  seedFolders,
  enterBulkMode,
  openListMenu,
  openOverflowMenu,
  openTagManagerViaMenu,
} = require('./helpers');

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

test.describe('Archive integrations', () => {
  test('bulk Archive stays in Notes, exits selection mode, and supports Undo', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-archive-a', title: 'Archive A', body: 'A' },
      { id: 'bulk-archive-b', title: 'Archive B', body: 'B' },
    ]);

    await enterBulkMode(page);
    await page.locator('#bulk-select-all').click();
    await page.locator('#bulk-archive').click();

    await expect(page.locator('#active-notes-view')).toHaveClass(/is-active/);
    await expect(page.locator('.note-row')).toHaveCount(0);
    await openListMenu(page);
    await expect(page.locator('#bulk-toggle')).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');

    const toast = page.locator('.toast', { hasText: 'Archived 2 notes.' }).last();
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.note-row')).toHaveCount(2);
  });

  test('bulk Unarchive stays in Archive and returns notes to Notes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-unarchive-a', title: 'Unarchive A', body: 'A', archivedAt: Date.now() },
      { id: 'bulk-unarchive-b', title: 'Unarchive B', body: 'B', archivedAt: Date.now() - 1 },
    ]);

    await page.locator('#archive-view').click();
    await enterBulkMode(page);
    await page.locator('#bulk-select-all').click();
    await page.locator('#bulk-unarchive').click();

    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('.note-row')).toHaveCount(0);
    await page.locator('#active-notes-view').click();
    await expect(page.locator('.note-row')).toHaveCount(2);
  });

  test('Archive folder grouping is browse-only and omits empty folders', async ({ page }) => {
    await seedRawNotes(page, [
      {
        id: 'filed-archive',
        title: 'Filed archive',
        body: 'Filed',
        folderId: 'folder-used',
        archivedAt: Date.now(),
      },
    ]);
    await seedFolders(page, [
      { id: 'folder-used', name: 'Used folder' },
      { id: 'folder-empty', name: 'Empty folder' },
    ]);

    await page.locator('#archive-view').click();
    await expect(page.locator('.folder-head[data-folder-id="folder-used"]')).toBeVisible();
    await expect(page.locator('.folder-head[data-folder-id="folder-empty"]')).toHaveCount(0);
    await expect(page.locator('.folder-menu-btn')).toHaveCount(0);
    await expect(page.locator('.new-folder-row')).toHaveCount(0);
    await openListMenu(page);
    await expect(page.locator('#new-folder-menu-btn')).toBeHidden();
  });

  test('palette exposes Archive commands and labels archived note results', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-active', title: 'Palette active', body: 'Work' },
      { id: 'palette-archive', title: 'Palette archived', body: 'Reference', archivedAt: Date.now() },
    ]);

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('view archive');
    await expect(page.locator('.command-palette-item').first()).toContainText('View Archive');
    await page.keyboard.press('Enter');
    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('palette archived');
    await expect(page.locator('.command-palette-item').first()).toContainText('Open note in Archive');
    await page.keyboard.press('Enter');
    await expect(page.locator('#note-title-display')).toHaveText('Palette archived');

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('unarchive note');
    await expect(page.locator('.command-palette-item').first()).toContainText('Unarchive note');
  });

  test('folder deletion counts and preserves lifecycle for active and archived members', async ({ page }) => {
    const archivedAt = Date.now();
    await seedRawNotes(page, [
      { id: 'folder-active', title: 'Folder active', body: 'A', folderId: 'mixed-folder' },
      {
        id: 'folder-archive',
        title: 'Folder archived',
        body: 'B',
        folderId: 'mixed-folder',
        archivedAt,
      },
    ]);
    await seedFolders(page, [{ id: 'mixed-folder', name: 'Mixed folder' }]);

    await page.locator('.folder-head[data-folder-id="mixed-folder"] .folder-menu-btn').click();
    await page.locator('#folder-menu [data-action="delete"]').click();
    await expect(page.locator('#folder-delete-copy')).toContainText('1 active and 1 archived');
    await page.locator('#folder-delete-keep').click();

    const records = await page.evaluate(async () =>
      Object.fromEntries((await window.ScratchpadDB.getAll()).map((note) => [note.id, note]))
    );
    expect(records['folder-active'].folderId).toBeNull();
    expect(records['folder-archive'].folderId).toBeNull();
    expect(records['folder-archive'].archivedAt).toBe(archivedAt);
  });

  test('tag management spans Notes and Archive and routes Archive-only filters', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'tag-active', title: 'Tag active', body: 'A', tags: ['roadmap'] },
      {
        id: 'tag-archive',
        title: 'Tag archived',
        body: 'B',
        tags: ['roadmap', 'reference'],
        archivedAt: Date.now(),
      },
    ]);

    await openTagManagerViaMenu(page);
    const roadmap = page.locator('.tag-manager-row', {
      has: page.locator('input[value="roadmap"]'),
    });
    await expect(roadmap).toContainText('1 active · 1 archived');
    await roadmap.locator('input').fill('plan');
    await roadmap.getByRole('button', { name: 'Rename' }).click();

    await expect.poll(() => page.evaluate(async () =>
      (await window.ScratchpadDB.getAll()).map((note) => note.tags).flat().filter((tag) => tag === 'plan').length
    )).toBe(2);

    const reference = page.locator('.tag-manager-row', {
      has: page.locator('input[value="reference"]'),
    });
    await reference.getByRole('button', { name: 'Filter' }).click();
    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('.note-row[data-id="tag-archive"]')).toBeVisible();
  });

  test('today and quick capture reuse an archived Daily Note while archived templates stay dormant', async ({ page }) => {
    const key = todayKey();
    await seedRawNotes(page, [
      {
        id: 'archived-today',
        title: 'Archived today',
        body: 'Existing day',
        dailyDate: key,
        archivedAt: Date.now() - 1000,
      },
      {
        id: 'archived-template',
        title: 'Daily template',
        body: 'ARCHIVED TEMPLATE CONTENT',
        archivedAt: Date.now(),
      },
    ]);

    await page.locator('#today-note').click();
    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-title-display')).toHaveText('Archived today');

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('quick capture');
    await page.keyboard.press('Enter');
    await page.locator('#quick-capture-input').fill('captured while archived');
    await page.locator('#quick-capture-submit').click();
    await expect(page.locator('.toast', { hasText: "Captured to today's note." }).last()).toBeVisible();

    const daily = await page.evaluate(async (dailyKey) => {
      const all = await window.ScratchpadDB.getAll();
      return all.filter((note) => note.dailyDate === dailyKey);
    }, key);
    expect(daily).toHaveLength(1);
    expect(daily[0].archivedAt).toEqual(expect.any(Number));
    expect(daily[0].body).toContain('captured while archived');
  });

  test('wikilinks navigate to Archive and autocomplete identifies archived targets', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'link-source', title: 'Link source', body: 'See [[Old plan]].' },
      { id: 'old-plan', title: 'Old plan', body: 'Archived target', archivedAt: Date.now() },
    ]);

    await page.locator('.note-row[data-id="link-source"]').click();
    await page.locator('#note-rendered a.wikilink').click();
    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-title-display')).toHaveText('Old plan');

    await openOverflowMenu(page);
    await page.locator('#duplicate-overflow-btn').click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('[[');
    await expect(page.locator('#wikilink-suggest')).toContainText('Archived');
  });

  test('a lifecycle-only cross-tab update preserves a dirty editor and saves into Archive', async ({ context, page }) => {
    await seedRawNotes(page, [
      { id: 'archive-shared', title: 'Archive shared', body: 'Original body' },
    ]);
    const other = await context.newPage();
    await gotoApp(other);

    await page.locator('.note-row[data-id="archive-shared"]').click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved body survives');

    await other.locator('.note-row[data-id="archive-shared"]').click();
    await openOverflowMenu(other);
    await other.locator('#archive-note-btn').click();

    await expect(page.locator('#archive-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved body survives');
    await expect(page.locator('.toast')).toContainText('archived in another tab');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-conflict-dialog')).toBeHidden();

    await expect.poll(() => page.evaluate(async () => {
      const note = await window.ScratchpadDB.get('archive-shared');
      return { body: note.body, archived: Number.isFinite(note.archivedAt) };
    })).toEqual({ body: 'Unsaved body survives', archived: true });
  });
});
