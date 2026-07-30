// @ts-check
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, importJson, openBackupMenu } = require('./helpers');

async function downloadBuffer(download) {
  return fs.readFileSync(await download.path());
}

test.describe('Archive portability', () => {
  test('native JSON backup is schema v4 and preserves archived provenance', async ({ page }) => {
    const archivedAt = Date.now() - 60_000;
    await seedRawNotes(page, [
      { id: 'json-active-v4', title: 'Active', body: 'Current' },
      { id: 'json-archive-v4', title: 'Archived', body: 'Reference', archivedAt },
      {
        id: 'json-trash-archive-v4',
        title: 'Archived trash',
        body: 'Recoverable',
        archivedAt,
        deletedAt: Date.now(),
      },
    ]);

    await openBackupMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    const payload = JSON.parse((await downloadBuffer(await downloadPromise)).toString('utf8'));

    expect(payload.schemaVersion).toBe(4);
    expect(payload.notes.map((note) => note.id).sort()).toEqual(['json-active-v4', 'json-archive-v4']);
    expect(payload.notes.find((note) => note.id === 'json-archive-v4').archivedAt).toBe(archivedAt);
    expect(payload.trashedNotes[0].archivedAt).toBe(archivedAt);
  });

  test('Markdown ZIP places archived notes under archive and emits archivedAt frontmatter', async ({ page }) => {
    const archivedAt = Date.parse('2026-07-01T12:00:00.000Z');
    await seedRawNotes(page, [
      { id: 'md-active', title: 'Working Plan', body: 'Active body' },
      { id: 'md-archive', title: 'Old Plan', body: 'Archived body', archivedAt },
    ]);

    await openBackupMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-markdown-btn').click();
    const storedText = (await downloadBuffer(await downloadPromise)).toString('utf8');

    expect(storedText).toContain('working-plan.md');
    expect(storedText).toContain('archive/old-plan.md');
    expect(storedText).toContain('archivedAt: "2026-07-01T12:00:00.000Z"');
  });

  test('Markdown import honors valid archivedAt frontmatter', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#import-file', {
      name: 'archived-note.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from([
        '---',
        'title: "Imported archive"',
        'archivedAt: "2026-07-01T12:00:00.000Z"',
        '---',
        '',
        'Imported body',
      ].join('\n')),
    });
    await page.locator('#confirm-import').click();

    const note = await page.evaluate(async () =>
      (await window.ScratchpadDB.getAll()).find((item) => item.title === 'Imported archive')
    );
    expect(note.archivedAt).toBe(Date.parse('2026-07-01T12:00:00.000Z'));
    await page.locator('#archive-view').click();
    await expect(page.locator('.note-row', { hasText: 'Imported archive' })).toBeVisible();
  });

  test('v3 backups default notes to Active even if an archive field is present', async ({ page }) => {
    await gotoApp(page);
    await importJson(page, {
      app: 'scratchpad',
      version: 'legacy',
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      notes: [{
        id: 'legacy-v3',
        title: 'Legacy active',
        body: 'Body',
        archivedAt: Date.now(),
      }],
      trashedNotes: [],
      revisions: [],
      folders: [],
    });
    await page.locator('#confirm-import').click();

    const note = await page.evaluate(() => window.ScratchpadDB.get('legacy-v3'));
    expect(note.archivedAt).toBeNull();
    await expect(page.locator('.note-row[data-id="legacy-v3"]')).toBeVisible();
  });

  test('import as duplicates preserves Archive state from schema v4', async ({ page }) => {
    const archivedAt = Date.now();
    await seedRawNotes(page, [{ id: 'duplicate-archive-id', title: 'Existing', body: 'Active' }]);
    await importJson(page, {
      app: 'scratchpad',
      version: 'current',
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      notes: [{
        id: 'duplicate-archive-id',
        title: 'Imported archived copy',
        body: 'Archived',
        archivedAt,
      }],
      trashedNotes: [],
      revisions: [],
      folders: [],
    });
    await page.locator('#confirm-import').click();

    const imported = await page.evaluate(async () =>
      (await window.ScratchpadDB.getAll()).find((note) => note.title === 'Imported archived copy')
    );
    expect(imported.id).not.toBe('duplicate-archive-id');
    expect(imported.archivedAt).toBe(archivedAt);
  });
});
