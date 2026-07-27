// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

const DAILY_NOTES_FOLDER_ID = 'scratchpad-daily-notes';

test.describe('dailyDate field', () => {
  test('survives an edit-and-save round trip', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'daily-1', title: 'My day', body: 'original', dailyDate: '2026-07-16' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('edited body');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();
    const stored = await page.evaluate(() => window.ScratchpadDB.get('daily-1'));
    expect(stored.dailyDate).toBe('2026-07-16');
    expect(stored.body).toBe('edited body');
  });

  test('normalizeNote keeps dailyDate across reload and save', async ({ page }) => {
    await gotoApp(page);
    const parsed = await page.evaluate(() => {
      return window.ScratchpadDB.put({
        id: 'roundtrip-1', title: 'T', body: 'B', tags: [], pinned: false,
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
        lastDraftAt: null, dailyDate: '2026-01-02',
      }).then(() => window.ScratchpadDB.get('roundtrip-1'));
    });
    expect(parsed.dailyDate).toBe('2026-01-02');
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    // After reload, loadAll() ran the note through normalizeNote; an
    // edit-and-save writes that normalized shape back to the DB.
    await page.locator('.note-row', { hasText: 'T' }).click();
    await page.locator('#edit-btn').click();
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();
    const after = await page.evaluate(() => window.ScratchpadDB.get('roundtrip-1'));
    expect(after.dailyDate).toBe('2026-01-02');
  });
});

test.describe('daily note', () => {
  test('palette command creates today note with defaults, reuses on repeat', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('today');
    await page.locator('.command-palette-item', { hasText: "Open today's note" }).click();
    await expect(page.locator('#note-rendered')).toBeVisible();
    const first = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      const folders = await window.ScratchpadDB.getAllFolders();
      return {
        note: all.find((n) => n.dailyDate),
        folder: folders.find((f) => f.id === 'scratchpad-daily-notes'),
      };
    });
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    expect(first.folder.name).toBe('Daily Notes');
    expect(first.note.dailyDate).toBe(key);
    expect(first.note.folderId).toBe(DAILY_NOTES_FOLDER_ID);
    expect(first.note.tags).toContain('daily');
    expect(first.note.body).toBe('## Tasks\n\n## Notes\n');
    // Second invocation reuses the same note.
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('today');
    await page.locator('.command-palette-item', { hasText: "Open today's note" }).click();
    const count = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.filter((n) => n.dailyDate).length;
    });
    expect(count).toBe(1);
  });

  test('Daily template note seeds the body; renamed daily note still found', async ({ page }) => {
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await seedRawNotes(page, [
      { id: 'tpl-1', title: 'Daily template', body: '## Agenda\n\n## Log\n' },
      { id: 'day-old', title: 'Renamed by hand', body: 'existing', dailyDate: key },
    ]);
    // Existing daily note wins even though its title was renamed.
    await page.locator('#today-note').click();
    await expect(page.locator('#note-title-display')).toHaveText('Renamed by hand');
    // Erase it, then creation should use the template body.
    await page.evaluate(() => window.ScratchpadDB.remove('day-old'));
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.locator('#today-note').click();
    const created = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(created.body).toBe('## Agenda\n\n## Log\n');
    expect(created.folderId).toBe(DAILY_NOTES_FOLDER_ID);
  });

  test('migrates existing active and trashed daily notes without changing recency', async ({ page }) => {
    const originalUpdatedAt = Date.now() - 60_000;
    await seedRawNotes(page, [
      {
        id: 'day-filed-elsewhere',
        title: 'Filed elsewhere',
        body: 'daily',
        dailyDate: '2026-06-01',
        folderId: 'f-work',
        updatedAt: originalUpdatedAt,
      },
      {
        id: 'day-in-trash',
        title: 'Deleted day',
        body: 'daily trash',
        dailyDate: '2026-06-02',
        folderId: 'f-work',
        updatedAt: originalUpdatedAt,
        deletedAt: Date.now(),
      },
      {
        id: 'ordinary-work',
        title: 'Ordinary',
        body: 'not daily',
        folderId: 'f-work',
        updatedAt: originalUpdatedAt,
      },
    ]);
    await page.evaluate(async () => {
      await window.ScratchpadDB.putFolder({
        id: 'f-work', name: 'Work', color: null, sortOrder: 1,
        parentId: null, createdAt: 1, updatedAt: 1,
      });
    });
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();

    const records = await page.evaluate(async () =>
      Object.fromEntries((await window.ScratchpadDB.getAll()).map((note) => [note.id, note]))
    );
    expect(records['day-filed-elsewhere'].folderId).toBe(DAILY_NOTES_FOLDER_ID);
    expect(records['day-filed-elsewhere'].updatedAt).toBe(originalUpdatedAt);
    expect(records['day-in-trash'].folderId).toBe(DAILY_NOTES_FOLDER_ID);
    expect(records['ordinary-work'].folderId).toBe('f-work');
  });

  test('daily notes cannot be moved and duplicate into ordinary Notes', async ({ page }) => {
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await seedRawNotes(page, [
      { id: 'day-managed', title: 'Managed day', body: 'daily', dailyDate: key },
    ]);

    const row = page.locator('.note-row[data-id="day-managed"]');
    await expect(row).not.toHaveAttribute('draggable', 'true');
    await row.click();
    await page.locator('#overflow-btn').click();
    await expect(page.locator('#move-note-overflow')).toBeHidden();
    await page.locator('#duplicate-overflow-btn').click();

    const records = await page.evaluate(async () => await window.ScratchpadDB.getAll());
    const original = records.find((note) => note.id === 'day-managed');
    const copy = records.find((note) => note.id !== 'day-managed');
    expect(original.folderId).toBe(DAILY_NOTES_FOLDER_ID);
    expect(copy.dailyDate).toBeNull();
    expect(copy.folderId).toBeNull();
  });
});

test.describe('quick capture', () => {
  test('captures into today note, creating it when needed', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('capture');
    await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
    await page.locator('#quick-capture-input').fill('remember the milk');
    await page.locator('#quick-capture-submit').click();
    // The dialog closes before the async write; the toast marks completion.
    await expect(page.locator('.toast', { hasText: "Captured to today's note." }).last()).toBeVisible();
    const note = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(note.folderId).toBe(DAILY_NOTES_FOLDER_ID);
    expect(note.body).toMatch(/- \*\*\d{2}:\d{2}\*\* remember the milk\n$/);
    // Second capture appends to the same note.
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('capture');
    await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
    await page.locator('#quick-capture-input').fill('second thought');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast', { hasText: "Captured to today's note." }).last()).toBeVisible();
    await page.waitForFunction(async () => {
      const all = await window.ScratchpadDB.getAll();
      const daily = all.find((n) => n.dailyDate);
      return daily && daily.body.includes('second thought');
    });
    const after = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.filter((n) => n.dailyDate);
    });
    expect(after.length).toBe(1);
    expect(after[0].body).toContain('remember the milk');
    expect(after[0].body).toMatch(/second thought\n$/);
  });

  test('capture while editing today note appends to the buffer, not the DB', async ({ page }) => {
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await seedRawNotes(page, [
      { id: 'day-1', title: 'Today', body: 'saved body', dailyDate: key },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('unsaved edits');
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('capture');
    await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
    await page.locator('#quick-capture-input').fill('buffered thought');
    await page.keyboard.press('Enter');
    await expect(page.locator('#note-editor')).toHaveValue(/buffered thought\n$/);
    const stored = await page.evaluate(() => window.ScratchpadDB.get('day-1'));
    expect(stored.body).toBe('saved body');
  });
});

test.describe('action URLs', () => {
  test('/?action=today opens today note and cleans the URL', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/?action=today');
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.locator('#note-rendered')).toBeVisible();
    const note = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(note).toBeTruthy();
    expect(new URL(page.url()).search).toBe('');
  });

  test('/?action=capture opens the capture dialog', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/?action=capture');
    await expect(page.locator('#quick-capture-input')).toBeVisible();
  });

  test('/?action=new starts a new note in edit mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/?action=new');
    await expect(page.locator('#note-editor')).toBeVisible();
  });
});
