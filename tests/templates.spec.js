// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

async function seedTemplates(page, withFolder) {
  await seedRawNotes(page, [
    { id: 'tpl-meeting', title: 'Meeting', body: '## Agenda\n\n- item', tags: ['meeting'], folderId: 'f-tpl' },
    { id: 'tpl-weekly', title: 'Weekly', body: 'Wins\n\nLosses', tags: ['review'], folderId: 'f-tpl' },
    { id: 'tpl-old', title: 'Old', body: 'x', folderId: 'f-tpl', archivedAt: Date.now() - 1000 },
    { id: 'work-note', title: 'Work note', body: 'w', folderId: 'f-work' },
  ]);
  const folders = [{ id: 'f-work', name: 'Work' }];
  if (withFolder) folders.push({ id: 'f-tpl', name: 'templates' });
  await seedFolders(page, folders);
}

async function openFolder(page, id) {
  await page.locator('#folder-switcher-btn').click();
  await page.locator(`.folder-switcher-row[data-folder-id="${id}"] .folder-switcher-option`).click();
}

async function runPalette(page, query) {
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill(query);
  await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText(/template/i);
  await page.keyboard.press('Enter');
  await expect(page.locator('#command-palette-dialog')).toBeHidden();
}

test('templates are listed by title and create a filed note with body and tags', async ({ page }) => {
  await seedTemplates(page, true);
  await openFolder(page, 'f-work');
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill('template');
  const options = page.locator('#command-palette-list [role="option"]');
  await expect(options).toContainText([/Meeting/, /Weekly/]);
  await expect(options.filter({ hasText: /template: Old/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await runPalette(page, 'template meeting');
  await expect(page.locator('#note-title-display')).toHaveText('Agenda');
  const created = await page.evaluate(async () => {
    const notes = await window.ScratchpadDB.getAll();
    return notes.filter((n) => !['tpl-meeting', 'tpl-weekly', 'tpl-old', 'work-note'].includes(n.id));
  });
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ title: '', body: '## Agenda\n\n- item', tags: ['meeting'], folderId: 'f-work' });
});

test('a note created while viewing the templates folder is unfiled', async ({ page }) => {
  await seedTemplates(page, true);
  await openFolder(page, 'f-tpl');
  await runPalette(page, 'template weekly');
  const created = await page.evaluate(async () => {
    const notes = await window.ScratchpadDB.getAll();
    return notes.find((n) => n.body === 'Wins\n\nLosses' && n.id !== 'tpl-weekly');
  });
  expect(created.folderId).toBeNull();
  expect(created.tags).toEqual(['review']);
});

test('without a templates folder the palette offers guidance and creates nothing', async ({ page }) => {
  await seedTemplates(page, false);
  await runPalette(page, 'template');
  await expect(page.locator('#toast-region')).toContainText('folder named “Templates”');
  const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
  expect(count).toBe(4);
});
