// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, importJson, seedRawNotes } = require('./helpers');

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

  test('keeps the import confirmation disabled while IndexedDB writes are pending', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, { notes: [validNote] });
    await expect(page.locator('#import-preview-dialog')).toBeVisible();

    await page.evaluate(() => {
      const db = /** @type {any} */ (window.ScratchpadDB);
      const originalBulkPut = db.bulkPut.bind(db);
      /** @type {undefined | (() => void)} */
      let release;
      db.bulkPut = (notes) => new Promise((resolve, reject) => {
        release = () => originalBulkPut(notes).then(resolve, reject);
      });
      /** @type {any} */ (window).__releaseImportBulkPut = () => release && release();
    });

    await page.locator('#confirm-import').click();
    await expect(page.locator('#confirm-import')).toBeDisabled();

    await page.evaluate(() => /** @type {any} */ (window).__releaseImportBulkPut());
    await expect(page.locator('#import-preview-dialog')).toBeHidden();
    await expect(page.locator('.note-row')).toHaveCount(1);
  });
});
