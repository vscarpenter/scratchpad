// @ts-check
// The note's ⋯ menu acts on the open note: Download as Markdown and Print
// (docs/superpowers/specs/2026-10-08-note-navigation-design.md).
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders, openOverflowMenu } = require('./helpers');

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** @param {import('@playwright/test').Page} page @param {string} id */
async function openNote(page, id) {
  await page.locator(`.note-row[data-id="${id}"] .note-row-open`).click();
  await expect(page.locator('#editor-view')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function downloadFromNoteMenu(page) {
  await openOverflowMenu(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-overflow-btn').click()]);
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
}

test('Download as Markdown saves only the open note', async ({ page }) => {
  await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);
  await seedRawNotes(page, [
    { id: 'plan', title: 'Q4 plan', body: 'Ship the ==golden path==.', tags: ['planning'], folderId: 'f-work' },
    { id: 'other', title: 'Other note', body: 'Do not include me.' },
  ]);
  await openNote(page, 'plan');
  await openOverflowMenu(page);
  await expect(page.locator('#export-overflow-btn')).toHaveText('Download as Markdown');
  await page.keyboard.press('Escape');
  const file = await downloadFromNoteMenu(page);
  const text = file.bytes.toString('utf8');
  expect(file.name).toBe('q4-plan.md');
  expect(text).toContain('title: "Q4 plan"');
  expect(text).toContain('tags: ["planning"]');
  expect(text).toContain('Ship the ==golden path==.');
  expect(text).not.toContain('Do not include me.');
});

test('a note with an image downloads as a ZIP holding it and the image', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Trip photos', body: 'Intro' }]);
  await openNote(page, 'host');
  await page.locator('#edit-btn').click();
  await page.setInputFiles('#attach-image-input', {
    name: 'beach.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_1x1, 'base64'),
  });
  await expect(page.locator('#note-editor')).toHaveValue(/attachment:/);
  await page.locator('#save-btn').click();
  await expect(page.locator('#save-btn')).toBeHidden();
  const file = await downloadFromNoteMenu(page);
  const zip = file.bytes.toString('latin1');
  const id = await page.evaluate(async () => (await window.ScratchpadAttachments.forNote('host'))[0].id);
  expect(file.name).toBe('trip-photos.zip');
  expect(file.bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  expect(zip).toContain('trip-photos.md');
  expect(zip).toContain('attachments/' + id + '-beach.png');
  expect(zip).toContain('](attachments/' + id + '-beach.png)');
});

test('a single-note download is not a backup', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'solo', title: 'Solo', body: 'Body' }]);
  await openNote(page, 'solo');
  const before = await page.locator('#backup-chip-label').textContent();
  await downloadFromNoteMenu(page);
  await expect(page.locator('#toast-region')).toContainText('Downloaded solo.md.');
  expect(await page.evaluate(() => localStorage.getItem('scratchpad:lastBackupAt'))).toBeNull();
  await expect(page.locator('#backup-chip-label')).toHaveText(before || '');
});

test('Print or save as PDF hands the open note to the browser print', async ({ page }) => {
  await page.addInitScript(() => {
    /** @type {any} */ (window).__printCalls = 0;
    window.print = () => {
      /** @type {any} */ (window).__printCalls += 1;
    };
  });
  await seedRawNotes(page, [{ id: 'printable', title: 'Printable', body: 'Body' }]);
  await openNote(page, 'printable');
  await openOverflowMenu(page);
  await page.locator('#print-overflow-btn').click();
  await expect(page.locator('#overflow-menu')).toBeHidden();
  expect(await page.evaluate(() => /** @type {any} */ (window).__printCalls)).toBe(1);
});

test('a note in Trash offers neither download nor print', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'gone', title: 'Gone', body: 'Body', deletedAt: Date.now() - 1000 }]);
  await page.locator('#view-menu-btn').click();
  await page.locator('#trash-view').click();
  await openNote(page, 'gone');
  await openOverflowMenu(page);
  await expect(page.locator('#export-overflow-btn')).toBeHidden();
  await expect(page.locator('#print-overflow-btn')).toBeHidden();
});
