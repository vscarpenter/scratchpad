// @ts-check
// The note header's breadcrumb navigates: Home › folder › title
// (docs/superpowers/specs/2026-10-08-note-navigation-design.md).
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders, switchView } = require('./helpers');

const NOTES = [
  { id: 'plan', title: 'Q4 plan', body: 'Body', folderId: 'f-work' },
  { id: 'loose', title: 'Loose note', body: 'Body' },
  { id: 'day', title: 'Thursday', body: 'Body', dailyDate: '2026-10-08', folderId: 'scratchpad-daily-notes' },
  { id: 'old', title: 'Old plan', body: 'Body', folderId: 'f-work', archivedAt: Date.now() - 1000 },
];

/** @param {import('@playwright/test').Page} page */
async function seed(page) {
  await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);
  await seedRawNotes(page, NOTES);
}

/** @param {import('@playwright/test').Page} page @param {string} id */
async function openNote(page, id) {
  await page.locator(`.note-row[data-id="${id}"] .note-row-open`).click();
  await expect(page.locator('#editor-view')).toBeVisible();
}

test('the folder crumb shows that folder and Home opens Home', async ({ page }) => {
  await seed(page);
  await openNote(page, 'plan');
  const crumb = page.locator('#note-breadcrumb');
  // innerText applies text-transform, so this pins the title as written.
  await expect(crumb.locator('.crumb-current')).toHaveText('Q4 plan', { useInnerText: true });
  await crumb.getByRole('button', { name: 'Work' }).click();
  await expect(page.locator('#folder-switcher-label')).toHaveText('Work');
  await expect(page.locator('#note-title-display')).toHaveText('Q4 plan');
  await crumb.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('#home-desk')).toBeVisible();
  await expect(page.locator('#home-view')).toHaveAttribute('aria-pressed', 'true');
});

test('daily and unfiled notes route to Daily Notes and Notes', async ({ page }) => {
  await seed(page);
  await openNote(page, 'day');
  await page.locator('#note-breadcrumb').getByRole('button', { name: 'Daily Notes' }).click();
  await expect(page.locator('#folder-switcher-label')).toHaveText('Daily Notes');
  await page.locator('#home-view').click();
  await openNote(page, 'loose');
  await page.locator('#note-breadcrumb').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('#folder-switcher-label')).toHaveText('Notes');
  await expect(page.locator('.note-row[data-id="plan"]')).toHaveCount(0);
});

test('archived notes keep a plain label', async ({ page }) => {
  await seed(page);
  await switchView(page, 'archive');
  await openNote(page, 'old');
  await expect(page.locator('#note-breadcrumb')).toContainText('archive');
  await expect(page.locator('#note-breadcrumb button')).toHaveCount(0);
});

test('phones hide the Home crumb', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await openNote(page, 'plan');
  await expect(page.locator('#note-breadcrumb').getByRole('button', { name: 'Work' })).toBeVisible();
  await expect(page.locator('#note-breadcrumb').getByRole('button', { name: 'Home' })).toBeHidden();
});
