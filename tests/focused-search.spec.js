// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

test('rejects body subsequence false positives and flattens direct results', async ({ page }) => {
  await seedRawNotes(page, [
    {
      id: 'phrase-hit',
      title: 'Vacation Photo Prompt',
      body: 'Please create a separate “Rubber Stamp” travel field notes poster.',
      tags: ['prompt'],
    },
    {
      id: 'term-hit',
      title: 'Packing details',
      body: 'Use a rubber texture on the cover. Add the stamp detail after review.',
      tags: [],
    },
    {
      id: 'subsequence-only',
      title: 'Welcome to Scratchpad',
      body: 'No account, no setup, no save button to hunt for. This is an ordinary note and it is already open. Everything stays in this browser unless you deliberately share it.',
      tags: ['getting-started', 'welcome'],
      pinned: true,
    },
  ]);

  await page.locator('#search').fill('rubber stamp');

  await expect(page.locator('.note-row')).toHaveCount(2);
  await expect(page.locator('.note-row[data-id="subsequence-only"]')).toHaveCount(0);
  await expect(page.locator('#search-results-count')).toHaveText('2 results');
  await expect(page.locator('#search-results-scope')).toHaveText('Notes · all folders');
  await expect(page.locator('.note-section-head')).toHaveCount(0);
  await expect(page.locator('#list-header')).toBeHidden();
  await expect(page.locator('#today-note')).toBeHidden();
  await expect(page.locator('#new-note')).toBeVisible();
});

test('ranks title, tag, and body matches before using recency', async ({ page }) => {
  const base = Date.now();
  await seedRawNotes(page, [
    { id: 'body-new', title: 'Newest note', body: 'Alpha appears in the body.', tags: [], updatedAt: base },
    { id: 'tag-mid', title: 'Tagged note', body: 'Plain body.', tags: ['alpha'], updatedAt: base - 1000 },
    { id: 'title-old', title: 'Alpha plan', body: 'Plain body.', tags: [], updatedAt: base - 2000 },
    { id: 'body-old', title: 'Older body note', body: 'Another alpha body.', tags: [], updatedAt: base - 3000 },
  ]);

  await page.locator('#search').fill('alpha');

  await expect(page.locator('#search-results-summary')).toBeVisible();
  await expect(page.locator('.note-row')).toHaveCount(4);
  const resultIds = await page.locator('.note-row').evaluateAll((rows) => rows.map((row) => row.dataset.id));
  expect(resultIds).toEqual(['title-old', 'tag-mid', 'body-new', 'body-old']);
});

test('uses labeled title and tag typo matches only as a fallback', async ({ page }) => {
  await seedRawNotes(page, [
    { id: 'fuzzy-title', title: 'Project archive', body: 'Planning notes.', tags: [] },
    { id: 'body-only', title: 'Meeting notes', body: 'The project archive is ready.', tags: [] },
  ]);

  await page.locator('#search').fill('projet');

  await expect(page.locator('.note-row')).toHaveCount(1);
  await expect(page.locator('.note-row')).toHaveAttribute('data-id', 'fuzzy-title');
  await expect(page.locator('.note-row')).toHaveAttribute('data-search-kind', 'close');
  await expect(page.locator('#search-results-count')).toHaveText('1 close match');
  await expect(page.locator('#search-results-note')).toContainText('title or tag');
});

test('never mixes fuzzy suggestions into direct results', async ({ page }) => {
  await seedRawNotes(page, [
    { id: 'direct-body', title: 'Terminology note', body: 'The spelling projet is intentional.', tags: [] },
    { id: 'fuzzy-title', title: 'Project archive', body: 'Planning notes.', tags: [] },
  ]);

  await page.locator('#search').fill('projet');

  await expect(page.locator('.note-row')).toHaveCount(1);
  await expect(page.locator('.note-row')).toHaveAttribute('data-id', 'direct-body');
  await expect(page.locator('.note-row')).toHaveAttribute('data-search-kind', 'direct');
  await expect(page.locator('#search-results-note')).toHaveCount(0);
});

test('centers the excerpt on the match and announces the result scope', async ({ page }) => {
  await seedRawNotes(page, [
    {
      id: 'late-hit',
      title: 'Vacation Photo Prompt',
      body: 'Opening material that should not become the search preview because it says nothing useful.\n\n## Poster\nPlease create a separate “Rubber Stamp” travel field notes poster for each photo.',
      tags: ['prompt'],
    },
  ]);

  await page.locator('#search').fill('rubber stamp');

  await expect(page.locator('.note-row-excerpt')).toContainText('Rubber Stamp');
  await expect(page.locator('.note-row-excerpt')).not.toContainText('Opening material');
  await expect(page.locator('.note-row-excerpt mark.search-hit')).toHaveText('Rubber Stamp');
  await expect(page.locator('#search-status')).toHaveText('1 result in Notes across all folders.');
});

test('makes no results actionable and specific to the query', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'only-note', title: 'Packing list', body: 'Camera and notebook.', tags: [] }]);

  await page.locator('#search').fill('rubber stamp');

  await expect(page.locator('#search-results-count')).toHaveText('0 results');
  await expect(page.locator('.search-empty')).toContainText('No notes match “rubber stamp”');
  await expect(page.locator('.search-empty')).toContainText('titles, text, and tags');
  await page.locator('#search-results-clear').click();
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('.note-row')).toHaveCount(1);
});

test('traverses and opens results from the keyboard', async ({ page }) => {
  await seedRawNotes(page, [
    { id: 'alpha-title', title: 'Alpha title', body: 'Plain body.', tags: [] },
    { id: 'alpha-body', title: 'Body result', body: 'Alpha body.', tags: [] },
  ]);
  const search = page.locator('#search');
  const resultButtons = page.locator('.note-row-open');

  await search.fill('alpha');
  await search.press('ArrowDown');
  await expect(resultButtons.nth(0)).toBeFocused();
  await resultButtons.nth(0).press('ArrowDown');
  await expect(resultButtons.nth(1)).toBeFocused();
  await resultButtons.nth(1).press('ArrowUp');
  await expect(resultButtons.nth(0)).toBeFocused();
  await resultButtons.nth(0).press('ArrowUp');
  await expect(search).toBeFocused();

  await search.press('Enter');
  await expect(page.locator('#note-title-display')).toHaveText('Alpha title');
  await resultButtons.nth(0).focus();
  await resultButtons.nth(0).press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
});

test('states that search ignores the selected folder', async ({ page }) => {
  await seedRawNotes(page, [
    { id: 'work-note', title: 'Work note', body: 'Plain body.', folderId: 'f-work' },
    { id: 'idea-note', title: 'Idea note', body: 'Needle outside.', folderId: 'f-ideas' },
  ]);
  await seedFolders(page, [
    { id: 'f-work', name: 'Work' },
    { id: 'f-ideas', name: 'Ideas' },
  ]);
  await page.locator('#folder-switcher-btn').click();
  await page.locator('.folder-switcher-row[data-folder-id="f-work"] .folder-switcher-option').click();

  await page.locator('#search').fill('needle');

  await expect(page.locator('.note-row')).toHaveAttribute('data-id', 'idea-note');
  await expect(page.locator('#search-results-scope')).toHaveText('Notes · all folders');
});

test('keeps the focused result mode inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedRawNotes(page, [
    {
      id: 'mobile-hit',
      title: 'Vacation Photo Prompt With A Deliberately Long Title',
      body: 'Please create a separate Rubber Stamp travel field notes poster with a longer surrounding sentence.',
      tags: ['prompt', 'travel'],
    },
  ]);

  await page.locator('#search').fill('rubber stamp');

  await expect(page.locator('#search-results-summary')).toBeVisible();
  await expect(page.locator('.note-row[data-id="mobile-hit"]')).toBeVisible();
  const metrics = await page.locator('#sidebar').evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    inputSize: Number.parseFloat(getComputedStyle(document.querySelector('#search')).fontSize),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.inputSize).toBeGreaterThanOrEqual(16);
});
