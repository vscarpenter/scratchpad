// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

async function seedOperatorNotes(page) {
  await seedRawNotes(page, [
    { id: 'plan-work', title: 'Launch plan', body: 'Alpha milestone.', tags: ['work', 'draft'], folderId: 'f-work' },
    { id: 'plan-daily', title: 'Daily plan', body: 'Alpha checklist.', tags: ['work'], folderId: 'f-daily' },
    { id: 'loose-idea', title: 'Loose idea', body: 'Alpha thought at 10:30 sharp.', tags: ['idea'] },
    { id: 'cafe-menu', title: 'Café menu', body: 'Beta list.', tags: ['café'] },
    { id: 'old-work', title: 'Old work', body: 'Alpha archive.', tags: ['work'], archivedAt: Date.now() - 1000 },
  ]);
  await seedFolders(page, [
    { id: 'f-work', name: 'Work' },
    { id: 'f-daily', name: 'Daily Notes' },
  ]);
}

function rowIds(page) {
  return page.locator('.note-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-id')));
}

async function expectRows(page, ids) {
  await expect.poll(() => rowIds(page)).toEqual(ids);
}

test('tag: lists notes carrying that tag, newest first', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:work');
  await expectRows(page, ['plan-daily', 'plan-work']);
  await expect(page.locator('#search-results-count')).toHaveText('2 results');
  await expect(page.locator('.note-row mark.search-hit')).toHaveCount(0);
});

test('repeated operators require every value', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:work tag:draft');
  await expectRows(page, ['plan-work']);
});

test('title: matches part of the title and ranks the remaining words', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('title:plan alpha');
  await expect(page.locator('.note-row')).toHaveCount(2);
  await expect(page.locator('.note-row mark.search-hit').first()).toHaveText('Alpha');
  await page.locator('#search').fill('title:idea');
  await expectRows(page, ['loose-idea']);
});

test('folder: reaches a folder other than the open one and notes for unfiled', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#folder-switcher-btn').click();
  await page.locator('.folder-switcher-row[data-folder-id="f-work"] .folder-switcher-option').click();
  await page.locator('#search').fill('folder:daily');
  await expectRows(page, ['plan-daily']);
  await page.locator('#search').fill('folder:notes');
  await expectRows(page, ['cafe-menu', 'loose-idea', 'plan-daily']);
});

test('operators compose with the tag chip', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('.note-row-tag[data-tag="work"]').first().click();
  await page.locator('#search').fill('folder:work');
  await expectRows(page, ['plan-work']);
});

test('operators stay inside the archive view', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#archive-view').click();
  await page.locator('#search').fill('tag:work');
  await expect(page.locator('#search-results-count')).toHaveText('1 result');
  await expectRows(page, ['old-work']);
});

test('unknown prefixes stay literal text', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('10:30');
  await expectRows(page, ['loose-idea']);
});

test('a bare operator shows every note in scope', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('tag:');
  await expect(page.locator('#search-results-count')).toHaveText('4 results');
});

test('operator values ignore case and diacritics', async ({ page }) => {
  await seedOperatorNotes(page);
  await page.locator('#search').fill('Tag:CAFE');
  await expectRows(page, ['cafe-menu']);
  await page.locator('#search').fill('FOLDER:Daily');
  await expectRows(page, ['plan-daily']);
});
