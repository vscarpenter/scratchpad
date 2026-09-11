// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

const DAILY_NOTES_FOLDER_ID = 'scratchpad-daily-notes';

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test.describe('quick capture spotlight', () => {
  test('opens without a title bar and previews the capture line', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+Shift+Space');
    await expect(page.locator('#quick-capture-input')).toBeVisible();
    // Spotlight bar: no title, the dialog names itself for AT instead.
    await expect(page.locator('#quick-capture-dialog h2')).toHaveCount(0);
    await expect(page.locator('#quick-capture-dialog')).toHaveAttribute('aria-label', 'Quick capture');
    // The foot shows exactly what will be appended: timestamp, then the text.
    await expect(page.locator('#quick-capture-preview')).toContainText(/\d{2}:\d{2}/);
    await page.locator('#quick-capture-input').fill('call the bank');
    await expect(page.locator('#quick-capture-preview')).toContainText('call the bank');
    await expect(page.locator('.quick-capture-destination')).toHaveText('Today’s note');
  });

  test('the destination flips to the draft while editing today’s note', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'day-1', title: 'Today', body: 'saved body', dailyDate: todayKey() }]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+Shift+Space');
    await expect(page.locator('#quick-capture-input')).toBeVisible();
    await expect(page.locator('.quick-capture-destination')).toHaveText('Today’s draft');
  });
});

test('captures into today note, creating it when needed', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill('capture');
  await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
  await page.locator('#quick-capture-input').fill('remember the milk');
  await page.locator('#quick-capture-submit').click();
  // The dialog closes before the async write; the toast marks completion.
  await expect(page.locator('.toast', { hasText: 'Captured to today’s note.' }).last()).toBeVisible();
  const note = await page.evaluate(async () => {
    const all = await window.ScratchpadDB.getAll();
    return all.find((n) => n.dailyDate);
  });
  expect(note.folderId).toBe(DAILY_NOTES_FOLDER_ID);
  expect(note.body).toMatch(/- \*\*\d{2}:\d{2}\*\* remember the milk\n$/);
  // Second capture appends to the same note.
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill('capture');
  await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
  await page.locator('#quick-capture-input').fill('second thought');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Captured to today’s note.' }).last()).toBeVisible();
  await page.waitForFunction(async () => {
    const all = await window.ScratchpadDB.getAll();
    const daily = all.find((n) => n.dailyDate);
    return daily && daily.body.includes('second thought');
  });
  const after = await page.evaluate(async () => {
    const all = await window.ScratchpadDB.getAll();
    return all.filter((n) => n.dailyDate);
  });
  expect(after.length).toBe(1);
  expect(after[0].body).toContain('remember the milk');
  expect(after[0].body).toMatch(/second thought\n$/);
});

test('capture while editing today note appends to the buffer, not the DB', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'day-1', title: 'Today', body: 'saved body', dailyDate: todayKey() }]);
  await page.locator('.note-row').first().click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill('unsaved edits');
  await page.locator('#command-palette-btn').click();
  await page.locator('#command-palette-input').fill('capture');
  await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
  await page.locator('#quick-capture-input').fill('buffered thought');
  await page.keyboard.press('Enter');
  await expect(page.locator('#note-editor')).toHaveValue(/buffered thought\n$/);
  const stored = await page.evaluate(() => window.ScratchpadDB.get('day-1'));
  expect(stored.body).toBe('saved body');
});
