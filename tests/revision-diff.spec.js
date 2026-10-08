// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

/**
 * Seeds one note plus stored revisions for it, newest first in the dialog.
 * @param {import('@playwright/test').Page} page
 * @param {object} note
 * @param {object[]} revisions
 */
async function seedHistory(page, note, revisions) {
  await seedRawNotes(page, [{ id: 'diff-note', ...note }]);
  await page.evaluate(async (revs) => {
    const base = Date.now();
    for (const [index, rev] of revs.entries()) {
      await window.ScratchpadDB.putRevision({
        id: 'rev-' + index,
        noteId: 'diff-note',
        title: rev.title || '',
        body: rev.body || '',
        tags: Array.isArray(rev.tags) ? rev.tags : [],
        pinned: !!rev.pinned,
        createdAt: base - 10000,
        updatedAt: base - 5000 - index * 1000,
        savedAt: base - 5000 - index * 1000,
        deletedAt: null,
      });
    }
  }, revisions);
  await page.locator('.note-row[data-id="diff-note"]').click();
}

/** @param {import('@playwright/test').Page} page */
async function openCompare(page, rowIndex = 0) {
  await page.locator('#overflow-btn').click();
  await page.locator('#history-btn').click();
  const row = page.locator('#history-list .history-row').nth(rowIndex);
  await row.locator('summary', { hasText: 'Compare with current' }).click();
  return row;
}

/** @param {import('@playwright/test').Locator} row @param {string} kind */
function lineTexts(row, kind) {
  return row.locator('.history-diff-line.' + kind + ' .history-diff-text').allTextContents();
}

test('Compare with current shows removed, added, and context lines', async ({ page }) => {
  await seedHistory(page, { title: 'Alpha', body: 'line one\nline 2\nline three' }, [
    { title: 'Alpha', body: 'line one\nline two' },
  ]);
  const row = await openCompare(page);
  await expect(row.locator('.history-diff')).toBeVisible();
  expect(await lineTexts(row, 'is-removed')).toEqual(['line 2', 'line three']);
  expect(await lineTexts(row, 'is-added')).toEqual(['line two']);
  expect(await lineTexts(row, 'is-same')).toEqual(['Alpha', '', 'line one']);
  await expect(row.locator('del.history-diff-line')).toHaveCount(2);
  await expect(row.locator('ins.history-diff-line')).toHaveCount(1);
  await expect(row.locator('.history-diff-glyph[aria-hidden="true"]')).toHaveCount(6);
});

test('a title change marks only the changed word on the first line', async ({ page }) => {
  await seedHistory(page, { title: 'Beta plan', body: 'Body text.' }, [{ title: 'Alpha plan', body: 'Body text.' }]);
  const row = await openCompare(page);
  expect(await lineTexts(row, 'is-removed')).toEqual(['Beta plan']);
  expect(await lineTexts(row, 'is-added')).toEqual(['Alpha plan']);
  await expect(row.locator('.is-removed .history-diff-word')).toHaveText(['Beta']);
  await expect(row.locator('.is-added .history-diff-word')).toHaveText(['Alpha']);
});

test('a one-word paragraph edit marks the word, not the line', async ({ page }) => {
  await seedHistory(page, { title: 'Plan', body: 'The quick brown fox jumps over the lazy dog.' }, [
    { title: 'Plan', body: 'The quick red fox jumps over the lazy dog.' },
  ]);
  const row = await openCompare(page);
  await expect(row.locator('.is-removed .history-diff-word')).toHaveText(['brown']);
  await expect(row.locator('.is-added .history-diff-word')).toHaveText(['red']);
  expect(await lineTexts(row, 'is-added')).toEqual(['The quick red fox jumps over the lazy dog.']);
});

test('long unchanged runs collapse to a counted gap', async ({ page }) => {
  const lines = Array.from({ length: 30 }, (_, index) => 'line ' + (index + 1));
  const current = lines.join('\n');
  const revised = lines.map((line, index) => (index === 14 ? 'line fifteen' : line)).join('\n');
  await seedHistory(page, { title: '', body: current }, [{ title: '', body: revised }]);
  const row = await openCompare(page);
  await expect(row.locator('.history-diff-gap')).toHaveText(['12 unchanged lines', '13 unchanged lines']);
  expect(await lineTexts(row, 'is-same')).toEqual(['line 13', 'line 14', 'line 16', 'line 17']);
  expect(await lineTexts(row, 'is-removed')).toEqual(['line 15']);
  expect(await lineTexts(row, 'is-added')).toEqual(['line fifteen']);
});

test('a revision equal to the current note says so', async ({ page }) => {
  await seedHistory(page, { title: 'Same', body: 'Nothing changed.', tags: ['a'] }, [
    { title: 'Same', body: 'Nothing changed.', tags: ['a'] },
  ]);
  const row = await openCompare(page);
  await expect(row.locator('.history-diff-same')).toHaveText('Same as the current note.');
  await expect(row.locator('.history-diff-line')).toHaveCount(0);
  await expect(row.locator('.history-diff-meta')).toHaveCount(0);
});

test('tag and pin differences show on the metadata line', async ({ page }) => {
  await seedHistory(page, { title: 'Meta', body: 'Body.', tags: ['keep', 'new'], pinned: false }, [
    { title: 'Meta', body: 'Body.', tags: ['keep', 'old'], pinned: true },
  ]);
  const row = await openCompare(page);
  await expect(row.locator('.history-diff-meta')).toHaveText(['Tags: +old, −new', 'Pinned']);
  await expect(row.locator('.history-diff-same')).toHaveText('Same as the current note.');
});

test('the comparison uses the saved note, not the dirty editor', async ({ page }) => {
  await seedHistory(page, { title: 'Dirty', body: 'Saved body.' }, [{ title: 'Dirty', body: 'Older body.' }]);
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill('Unsaved body.');
  const row = await openCompare(page);
  await expect(row.locator('.history-diff-meta')).toHaveText(['Compared with the last saved version.']);
  expect(await lineTexts(row, 'is-removed')).toEqual(['Saved body.']);
  expect(await lineTexts(row, 'is-added')).toEqual(['Older body.']);
});

test('an oversized comparison falls back to coarse blocks and says so', async ({ page }) => {
  const count = 2100;
  const current = Array.from({ length: count }, (_, index) => 'now ' + index).join('\n');
  const revised = Array.from({ length: count }, (_, index) => 'then ' + index).join('\n');
  await seedHistory(page, { title: '', body: current }, [{ title: '', body: revised }]);
  const row = await openCompare(page);
  await expect(row.locator('.history-diff-meta')).toHaveText(['Large change: the differing block is shown whole.']);
  await expect(row.locator('.history-diff-line.is-removed')).toHaveCount(count);
  await expect(row.locator('.history-diff-line.is-added')).toHaveCount(count);
  await expect(row.locator('.history-diff-gap')).toHaveCount(0);
  await row.locator('summary', { hasText: 'Preview revision' }).click();
  await expect(row.locator('.history-preview')).toContainText('then 2099');
});

test('diffLines and diffWords are stable on empty and identical inputs', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'api-note', title: 'API', body: 'x' }]);
  const result = await page.evaluate(() => {
    const api = window.ScratchpadRevisionDiff;
    return {
      empty: api.diffLines('', ''),
      identical: api.diffLines('a\nb', 'a\nb'),
      words: api.diffWords('one two', 'one two'),
      crlf: api.diffLines('a\r\nb', 'a\nb'),
      snapshot: [api.snapshotText({ title: ' T ', body: 'b' }), api.snapshotText({ title: '', body: 'b' })],
    };
  });
  expect(result.empty).toEqual({ coarse: false, hunks: [{ kind: 'same', lines: [''] }] });
  expect(result.identical).toEqual({ coarse: false, hunks: [{ kind: 'same', lines: ['a', 'b'] }] });
  expect(result.words).toEqual({ coarse: false, tokens: [{ kind: 'same', text: 'one two' }] });
  expect(result.crlf).toEqual({ coarse: false, hunks: [{ kind: 'same', lines: ['a', 'b'] }] });
  expect(result.snapshot).toEqual(['T\n\nb', 'b']);
});
