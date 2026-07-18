// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, importJson, seedRawNotes } = require('./helpers');
const { stat } = require('node:fs/promises');

const validNote = {
  id: 'import-valid',
  title: 'Imported valid note',
  body: 'This note should be imported.',
  tags: ['imported'],
  pinned: false,
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
  deletedAt: null,
};

test.describe('import — validation and conflicts', () => {
  test('opens the system file chooser from the About import action', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#open-about').click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#import-btn').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'about-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([
        { id: 'about-imported', title: 'About import', body: 'Imported from About.' },
      ])),
    });

    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await page.locator('#confirm-import').click();
    await expect(page.locator('.note-row[data-id="about-imported"]')).toBeVisible();
  });

  test('previews rejected notes and revisions without importing invalid entries', async ({ page }) => {
    await gotoApp(page);

    await importJson(page, {
      notes: [
        validNote,
        'not a note',
        { id: 'huge-body', title: 'Huge body', body: 'x'.repeat(200001) },
        { id: 'bad-tag', title: 'Bad tag', body: 'Body', tags: ['x'.repeat(80)] },
      ],
      revisions: [
        { id: 'valid-rev', noteId: 'import-valid', title: 'Old', body: 'Previous body', savedAt: 1710000000000 },
        { id: 'bad-rev', noteId: '', title: 'Bad revision', body: 'Missing note id' },
      ],
    });

    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await expect(page.locator('#import-preview-counts')).toContainText('New notes');
    await expect(page.locator('#import-preview-counts')).toContainText('Rejected entries');
    await expect(page.locator('#import-preview-counts')).toContainText('Rejected revisions');
    await expect(page.locator('#import-preview-counts dd').nth(0)).toHaveText('1');
    await expect(page.locator('#import-preview-counts dd').nth(2)).toHaveText('3');
    await expect(page.locator('#import-preview-counts dd').nth(4)).toHaveText('1');

    await page.locator('#confirm-import').click();
    await expect(page.locator('#import-preview-dialog')).toBeHidden();
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-title-display')).toHaveText('Imported valid note');
  });

  test('replaces matching ids only when the replace conflict mode is selected', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'same-id', title: 'Existing note', body: 'Old body', tags: [] },
    ]);

    await importJson(page, {
      notes: [
        { id: 'same-id', title: 'Imported replacement', body: 'New body', tags: ['new'] },
      ],
    });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await page.locator('input[name="import-conflict-mode"][value="replace"]').check();
    await page.locator('#confirm-import').click();

    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-title-display')).toHaveText('Imported replacement');
    await expect(page.locator('#note-rendered')).toContainText('New body');
  });

  test('skips matching ids when the skip conflict mode is selected', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'skip-id', title: 'Existing note', body: 'Untouched body', tags: [] },
    ]);

    await importJson(page, {
      notes: [
        { id: 'skip-id', title: 'Should not import', body: 'New body', tags: ['new'] },
      ],
    });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await page.locator('input[name="import-conflict-mode"][value="skip"]').check();
    await page.locator('#confirm-import').click();

    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-title-display')).toHaveText('Existing note');
    await expect(page.locator('#note-rendered')).toContainText('Untouched body');
  });

  test('imports trashedNotes from a backup file into Trash', async ({ page }) => {
    await gotoApp(page);

    await importJson(page, {
      notes: [validNote],
      trashedNotes: [
        { id: 'was-trashed', title: 'Previously trashed', body: 'Trash body', tags: [], deletedAt: 1710000000000 },
      ],
    });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await page.locator('#confirm-import').click();
    await expect(page.locator('#import-preview-dialog')).toBeHidden();

    await expect(page.locator('.note-row')).toHaveCount(1);
    await page.locator('#trash-view').click();
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-title-display')).toHaveText('Previously trashed');
  });

  test('rejects entries that share an id within the same import file', async ({ page }) => {
    await gotoApp(page);

    await importJson(page, {
      notes: [
        { id: 'dup-in-file', title: 'First copy', body: 'Body one' },
        { id: 'dup-in-file', title: 'Second copy', body: 'Body two' },
      ],
    });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await expect(page.locator('#import-preview-counts dd').nth(0)).toHaveText('1');
    await expect(page.locator('#import-preview-counts dd').nth(2)).toHaveText('1');
    await expect(page.locator('#import-preview-errors')).toContainText('duplicate id in import file');
  });

  test('rejects choosing more than one JSON file at a time', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#import-file', [
      { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ notes: [validNote] })) },
      { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ notes: [validNote] })) },
    ]);

    await expect(page.locator('.toast.is-error')).toContainText('Choose one JSON or encrypted backup at a time');
    await expect(page.locator('#import-preview-dialog')).toBeHidden();
  });

  test('round-trips a native backup larger than the generic import limits', async ({ page }) => {
    test.slow();
    await gotoApp(page);
    const oversizedBody = 'x'.repeat(2 * 1024 * 1024 + 1);
    const oversizedTitle = 'T'.repeat(241);
    const oversizedTags = Array.from({ length: 21 }, (_, index) =>
      index === 20 ? 'tag-' + 'z'.repeat(49) : `tag-${index}`
    );
    await page.evaluate(async ({ body, title, tags }) => {
      const timestamp = Date.now();
      await window.ScratchpadDB.put({
        id: 'native-large-note',
        title,
        body,
        tags,
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        lastDraftAt: null,
      });
      await window.ScratchpadDB.putRevision({
        id: 'native-large-revision',
        noteId: 'native-large-note',
        title,
        body: body.slice(0, 200001),
        tags,
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        savedAt: timestamp,
        deletedAt: null,
      });
    }, { body: oversizedBody, title: oversizedTitle, tags: oversizedTags });

    await page.locator('#open-about').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    const path = await (await downloadPromise).path();
    expect((await stat(path)).size).toBeGreaterThan(2 * 1024 * 1024);

    await page.evaluate(() => window.ScratchpadDB.clearAllStores());
    await page.reload();
    await page.setInputFiles('#import-file', path);
    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await expect(page.locator('#import-preview-counts dd').nth(2)).toHaveText('0');
    await expect(page.locator('#import-preview-counts dd').nth(4)).toHaveText('0');
    await page.locator('#confirm-import').click();
    await expect(page.locator('#import-preview-dialog')).toBeHidden();

    const restored = await page.evaluate(async () => ({
      notes: await window.ScratchpadDB.getAll(),
      revisions: await window.ScratchpadDB.getAllRevisions(),
    }));
    expect(restored.notes).toHaveLength(1);
    expect(restored.notes[0].title).toHaveLength(241);
    expect(restored.notes[0].body).toHaveLength(2 * 1024 * 1024 + 1);
    expect(restored.notes[0].tags).toHaveLength(21);
    expect(restored.revisions).toHaveLength(1);
    expect(restored.revisions[0].body).toHaveLength(200001);
  });

  test('does not truncate native backups at the generic record-count limits', async ({ page }) => {
    test.slow();
    await gotoApp(page);
    const notes = Array.from({ length: 1001 }, (_, index) => ({
      id: `native-note-${index}`,
      title: `Native note ${index}`,
      body: '',
    }));
    const revisions = Array.from({ length: 5001 }, (_, index) => ({
      id: `native-revision-${index}`,
      noteId: `native-note-${index % notes.length}`,
      title: '',
      body: `Revision ${index}`,
      savedAt: 1710000000000 + index,
    }));
    await importJson(page, {
      app: 'scratchpad',
      schemaVersion: 2,
      notes,
      trashedNotes: [],
      revisions,
    });

    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    const counts = page.locator('#import-preview-counts dd');
    await expect(counts.nth(0)).toHaveText('1001');
    await expect(counts.nth(2)).toHaveText('0');
    await expect(counts.nth(3)).toHaveText('5001');
    await expect(counts.nth(4)).toHaveText('0');
  });

  test('keeps the generic JSON size limit for non-backup imports', async ({ page }) => {
    await gotoApp(page);
    const oversized = { notes: [{ ...validNote, body: 'x'.repeat(3 * 1024 * 1024) }] };
    await page.setInputFiles('#import-file', {
      name: 'oversized-generic.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(oversized)),
    });

    await expect(page.locator('.toast.is-error')).toContainText('must be 2 MB or smaller');
    await expect(page.locator('#import-preview-dialog')).toBeHidden();
  });

  test('keeps the import confirmation disabled while IndexedDB writes are pending', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, { notes: [validNote] });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();

    await page.evaluate(() => {
      const db = /** @type {any} */ (window.ScratchpadDB);
      const originalImportRecords = db.importRecords.bind(db);
      /** @type {undefined | (() => void)} */
      let release;
      db.importRecords = (notes, revisions, revisionLimit) => new Promise((resolve, reject) => {
        release = () => originalImportRecords(notes, revisions, revisionLimit).then(resolve, reject);
      });
      /** @type {any} */ (window).__releaseImportRecords = () => release && release();
    });

    await page.locator('#confirm-import').click();
    await expect(page.locator('#confirm-import')).toBeDisabled();

    await page.evaluate(() => /** @type {any} */ (window).__releaseImportRecords());
    await expect(page.locator('#import-preview-dialog')).toBeHidden();
    await expect(page.locator('.note-row')).toHaveCount(1);
  });

  test('rolls back note writes when a revision write fails', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, { notes: [{ ...validNote, id: 'atomic-import-note' }] });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();

    await page.evaluate(() => {
      const db = /** @type {any} */ (window.ScratchpadDB);
      const originalImportRecords = db.importRecords.bind(db);
      db.importRecords = (notes, _revisions, revisionLimit) => originalImportRecords(notes, [{
        id: 'uncloneable-revision',
        noteId: notes[0].id,
        title: 'Cannot clone',
        body: () => 'functions cannot be stored in IndexedDB',
        savedAt: Date.now(),
      }], revisionLimit);
    });

    await page.locator('#confirm-import').click();
    await expect(page.locator('.toast.is-error')).toContainText('No notes were changed');
    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await expect(page.locator('#confirm-import')).toBeEnabled();
    const stored = await page.evaluate(async () => ({
      notes: await window.ScratchpadDB.getAll(),
      revisions: await window.ScratchpadDB.getAllRevisions(),
    }));
    expect(stored.notes).toEqual([]);
    expect(stored.revisions).toEqual([]);
  });
});
