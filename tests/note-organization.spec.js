// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('note organization and empty states', () => {
  test('adds, normalizes, filters, removes, and persists inline tags', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'tag-target', title: 'Tag target', body: 'Tagged body.' },
      { id: 'tag-other', title: 'Other note', body: 'Other body.' },
    ]);

    await page.locator('.note-row[data-id="tag-target"]').getByRole('button', { name: 'Open Tag target' }).click();
    await page.locator('#tag-add-empty').click();
    await page.locator('#tag-input').fill(' Project Alpha, Urgent ');
    await page.locator('#tag-input').press('Enter');

    const tagPills = page.locator('#tag-pills');
    await expect(tagPills.getByRole('button', { name: 'Filter by project-alpha' })).toBeVisible();
    await expect(tagPills.getByRole('button', { name: 'Filter by urgent' })).toBeVisible();

    await tagPills.getByRole('button', { name: 'Filter by project-alpha' }).click();
    await expect(page.locator('#active-filter-tag')).toHaveText('#project-alpha');
    await expect(page.locator('.note-row')).toHaveCount(1);

    await page.locator('#clear-filter').click();
    await expect(page.locator('#active-filter')).toBeHidden();
    await expect(page.locator('.note-row')).toHaveCount(2);

    await tagPills.getByRole('button', { name: 'Remove tag project-alpha' }).click();
    await expect(tagPills.getByRole('button', { name: 'Filter by project-alpha' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () =>
      (await window.ScratchpadDB.get('tag-target')).tags
    )).toEqual(['urgent']);
    await page.reload();
    await page.locator('.note-row[data-id="tag-target"]').getByRole('button', { name: 'Open Tag target' }).click();

    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by project-alpha' })).toHaveCount(0);
    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by urgent' })).toBeVisible();
    const tags = await page.evaluate(async () =>
      (await window.ScratchpadDB.get('tag-target')).tags
    );
    expect(tags).toEqual(['urgent']);
  });

  test('composes tag and text filters, then clears every filter from the no-results state', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'filter-launch', title: 'Launch plan', body: 'Ship the release.', tags: ['project'] },
      { id: 'filter-archive', title: 'Archive plan', body: 'Store the records.', tags: ['project'] },
      { id: 'filter-personal', title: 'Personal list', body: 'Buy groceries.', tags: ['personal'] },
    ]);

    await page.locator('.note-row[data-id="filter-launch"]')
      .getByRole('button', { name: 'Open Launch plan' }).click();
    await page.locator('#tag-pills').getByRole('button', { name: 'Filter by project' }).click();
    await page.locator('#search').fill('archive');
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('.note-row')).toContainText('Archive plan');

    await page.locator('#search').fill('no possible match');
    await expect(page.locator('#empty-no-results')).toBeVisible();
    await expect(page.locator('.sidebar-empty-title')).toHaveText('No matches');

    await page.locator('#clear-search-btn').click();
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#active-filter')).toBeHidden();
    await expect(page.locator('.note-row')).toHaveCount(3);
  });

  test('moves a pinned note into the Pinned section and persists the ordering', async ({ page }) => {
    const base = Date.now();
    await seedRawNotes(page, [
      { id: 'sort-old', title: 'Older note', body: 'Old.', updatedAt: base - 60_000 },
      { id: 'sort-new', title: 'Newer note', body: 'New.', updatedAt: base },
    ]);

    // The global Pinned section is a Recent-mode feature; in the default
    // Folders grouping a pinned note floats to the top of its own folder.
    await page.locator('#group-recent').click();
    await page.locator('.note-row[data-id="sort-old"]').getByRole('button', { name: 'Open Older note' }).click();
    await page.locator('#pin-toggle').click();

    await expect(page.locator('.note-section').first().locator('.note-section-head')).toHaveText('Pinned');
    await expect(page.locator('.note-row').first()).toHaveAttribute('data-id', 'sort-old');
    await expect.poll(() => page.evaluate(async () =>
      (await window.ScratchpadDB.get('sort-old')).pinned
    )).toBe(true);

    await page.reload();
    await expect(page.locator('.note-row').first()).toHaveAttribute('data-id', 'sort-old');
    await page.locator('.note-row[data-id="sort-old"]').getByRole('button', { name: 'Open Older note' }).click();
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('restores one trashed note and empties the rest only after confirmation', async ({ page }) => {
    const deletedAt = Date.now();
    await seedRawNotes(page, [
      { id: 'trash-keep', title: 'Restore me', body: 'Return.', deletedAt },
      { id: 'trash-delete', title: 'Delete me', body: 'Remove.', deletedAt: deletedAt + 1 },
    ]);

    await page.locator('#trash-view').click();
    await page.locator('.note-row[data-id="trash-keep"]').getByRole('button', { name: 'Open Restore me' }).click();
    await page.locator('#restore-btn').click();
    await expect(page.locator('#active-notes-view')).toHaveClass(/is-active/);
    await expect(page.locator('#note-title-display')).toHaveText('Restore me');

    await page.locator('#trash-view').click();
    await page.getByRole('button', { name: 'Empty Trash' }).click();
    await expect(page.locator('#empty-trash-dialog')).toBeVisible();
    await page.locator('#empty-trash-dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.note-row[data-id="trash-delete"]')).toBeVisible();

    await page.getByRole('button', { name: 'Empty Trash' }).click();
    await page.locator('#confirm-empty-trash').click();
    await expect(page.locator('.sidebar-empty-title')).toHaveText('Trash is empty');

    const notes = await page.evaluate(async () => await window.ScratchpadDB.getAll());
    expect(notes.map((note) => note.id)).toEqual(['trash-keep']);
    expect(notes[0].deletedAt).toBeNull();
  });

  test('creates a note from the empty-state action', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#empty-no-notes')).toBeVisible();

    await page.locator('#empty-new-note').click();
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-count')).toHaveText('1');
  });

  test('imports a backup from the empty-state file chooser', async ({ page }) => {
    await gotoApp(page);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#empty-import-notes').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'empty-state-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([
        { id: 'empty-imported', title: 'Imported from empty state', body: 'Recovered.' },
      ])),
    });

    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await page.locator('#confirm-import').click();
    await expect(page.locator('.note-row[data-id="empty-imported"]')).toBeVisible();
  });

  test('keeps or discards unsaved edits from the overflow action', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'discard-note', title: 'Discard source', body: 'Saved body.' },
    ]);
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved body.');

    await page.locator('#overflow-btn').click();
    await page.locator('#discard-overflow-btn').click();
    await expect(page.locator('#discard-dialog')).toBeVisible();
    await page.locator('#discard-dialog').getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved body.');

    await page.locator('#overflow-btn').click();
    await page.locator('#discard-overflow-btn').click();
    await page.locator('#confirm-discard').click();
    await expect(page.locator('#note-editor')).toBeHidden();
    await expect(page.locator('#note-rendered')).toContainText('Saved body.');
  });
});
