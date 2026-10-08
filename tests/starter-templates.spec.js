// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedFolders, openCommandPalette } = require('./helpers');

const TEMPLATE_TITLES = ['Decision record', 'Meeting notes', 'Project brief', 'Reading notes'];

// A brand-new visitor: no visited flag and no notes, so the first run seeds and
// opens the pinned Welcome note.
async function firstRun(page) {
  await page.goto('/');
  await expect(page.locator('#note-title-display')).toHaveText('Welcome to Scratchpad');
  await page.waitForFunction(() => !!window.ScratchpadDB);
}

// A returning visitor with no notes who opens to Home, so nothing is seeded.
async function returningVisit(page) {
  await page.addInitScript(() => localStorage.setItem('scratchpad:openTo', 'home'));
  await gotoApp(page);
}

// The Templates folder (matched the way the app matches it) and the notes filed in it.
async function readStarters(page) {
  return page.evaluate(async () => {
    const folders = await window.ScratchpadDB.getAllFolders();
    const notes = await window.ScratchpadDB.getAll();
    const matches = folders.filter((folder) => folder.name.trim().toLowerCase() === 'templates');
    const filed = matches.length ? notes.filter((n) => n.folderId === matches[0].id) : [];
    return {
      folderCount: matches.length,
      folderId: matches.length ? matches[0].id : null,
      titles: filed.map((n) => n.title).sort(),
      total: notes.length,
    };
  });
}

// Runs the palette's only template command when no templates exist yet.
async function runAddStarters(page) {
  await openCommandPalette(page);
  await page.locator('#command-palette-input').fill('template');
  // Exact matches rank first; "template" also fuzzy-matches other commands.
  await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Add starter templates');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast-region')).toContainText('Added 4 starter templates');
}

test('first run seeds a Templates folder with four starter notes filed in it', async ({ page }) => {
  await firstRun(page);
  const seeded = await readStarters(page);
  expect(seeded.folderCount).toBe(1);
  expect(seeded.titles).toEqual(TEMPLATE_TITLES);
  expect(seeded.total).toBe(7);
});

test('without a Templates folder, Add starter templates creates the folder and four notes', async ({ page }) => {
  await returningVisit(page);
  await runAddStarters(page);
  const seeded = await readStarters(page);
  expect(seeded.folderCount).toBe(1);
  expect(seeded.titles).toEqual(TEMPLATE_TITLES);
  expect(seeded.total).toBe(4);
});

test('an existing empty Templates folder is reused rather than duplicated', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('scratchpad:openTo', 'home'));
  await seedFolders(page, [{ id: 'f-tpl', name: 'templates' }]);
  await runAddStarters(page);
  const seeded = await readStarters(page);
  expect(seeded.folderCount).toBe(1);
  expect(seeded.folderId).toBe('f-tpl');
  expect(seeded.titles).toEqual(TEMPLATE_TITLES);
});

test('after adding, the palette lists the templates and Home counts them', async ({ page }) => {
  await returningVisit(page);
  await runAddStarters(page);
  await page.reload();
  await expect(page.locator('#home-desk-template-meta')).toHaveText('4 templates ready');
  await openCommandPalette(page);
  await page.locator('#command-palette-input').fill('template');
  const options = page.locator('#command-palette-list [role="option"]');
  await expect(options).toContainText(TEMPLATE_TITLES.map((title) => new RegExp('template: ' + title)));
  await expect(options.filter({ hasText: 'Add starter templates' })).toHaveCount(0);
});

test('the palette lists the starter templates and creates an unfiled note from one', async ({ page }) => {
  await firstRun(page);
  await openCommandPalette(page);
  await page.locator('#command-palette-input').fill('template');
  const options = page.locator('#command-palette-list [role="option"]');
  await expect(options).toContainText(TEMPLATE_TITLES.map((title) => new RegExp('template: ' + title)));
  await page.locator('#command-palette-input').fill('template meeting');
  await page.keyboard.press('Enter');
  await expect(page.locator('#command-palette-dialog')).toBeHidden();
  await expect(page.locator('#note-title-display')).toHaveText('Meeting notes');
  await expect(page.locator('#toast-region')).toContainText('New note from “Meeting notes”');
  const created = await page.evaluate(async () => {
    const notes = await window.ScratchpadDB.getAll();
    return notes.filter((n) => n.title === '' && n.body.startsWith('# Meeting notes'));
  });
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ tags: ['meeting'], folderId: null, pinned: false });
});

test('Home counts the starter templates on a return visit', async ({ page }) => {
  await firstRun(page);
  await page.reload();
  await expect(page.locator('#home-desk-template-meta')).toHaveText('4 templates ready');
});

test('the welcome checklist points at the starter templates', async ({ page }) => {
  await firstRun(page);
  const line = page.locator('#note-rendered li', { hasText: /type "template"/i });
  await expect(line).toContainText('Meeting notes');
  await expect(line.locator('.task-checkbox')).toHaveAttribute('aria-checked', 'false');
});
