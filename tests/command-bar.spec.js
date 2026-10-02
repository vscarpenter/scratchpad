// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, switchView } = require('./helpers');

const panel = '#command-bar';
const options = '#command-bar-list [role="option"]';

async function seedTwo(page) {
  await seedRawNotes(page, [
    { id: 'bar-alpha', title: 'Alpha field notes', body: 'First note.' },
    { id: 'bar-beta', title: 'Beta launch plan', body: 'Second note.' },
  ]);
}

test('command bar: an empty focused search suggests commands and Enter runs the first', async ({ page }) => {
  await seedTwo(page);
  const search = page.locator('#search');
  await search.focus();
  await expect(page.locator(panel)).toBeVisible();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#command-bar-heading')).toHaveText('Suggested');
  await expect(page.locator(options).first()).toContainText('New note');
  await expect(page.locator(options).first()).toHaveClass(/is-active/);
  const activeId = await page.locator(options).first().getAttribute('id');
  await expect(search).toHaveAttribute('aria-activedescendant', activeId || '');

  await search.press('Enter');
  await expect(page.locator(panel)).toBeHidden();
  await expect(page.locator('#note-editor')).toBeVisible();
  await expect(page.locator('#note-count')).toHaveText('3');
});

test('command bar: arrow keys move through suggestions without leaving the field', async ({ page }) => {
  await seedTwo(page);
  const search = page.locator('#search');
  await search.focus();
  await search.press('ArrowDown');
  await expect(page.locator(options).nth(1)).toHaveClass(/is-active/);
  await expect(search).toBeFocused();
  await search.press('ArrowUp');
  await search.press('ArrowUp');
  await expect(page.locator(options).first()).toHaveClass(/is-active/);
});

test('command bar: a leading > filters commands and leaves the note list alone', async ({ page }) => {
  await seedTwo(page);
  const search = page.locator('#search');
  await search.fill('>trash');
  await expect(page.locator('#command-bar-heading')).toHaveText('Commands');
  await expect(page.locator(options).first()).toContainText('View Trash');
  await expect(page.locator('.note-row')).toHaveCount(2);
  await expect(page.locator('#search-results-summary')).toHaveCount(0);

  await search.press('Enter');
  await expect(page.locator('#trash-view')).toHaveClass(/is-active/);
  await expect(page.locator('#view-menu-label')).toHaveText('Trash');
  await expect(search).toHaveValue('');
});

test('command bar: plain text searches notes and hides the panel', async ({ page }) => {
  await seedTwo(page);
  const search = page.locator('#search');
  await search.focus();
  await expect(page.locator(panel)).toBeVisible();
  await search.fill('beta');
  await expect(page.locator(panel)).toBeHidden();
  await expect(page.locator('#search-results-summary')).toBeVisible();
  await expect(page.locator('.note-row')).toHaveCount(1);
});

test('command bar: Escape closes the panel, then a second Escape leaves the field', async ({ page }) => {
  await seedTwo(page);
  const search = page.locator('#search');
  await search.fill('>exp');
  await search.press('Escape');
  await expect(page.locator(panel)).toBeHidden();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(search).not.toBeFocused();
});

test('command bar: the panel footer opens the full command palette', async ({ page }) => {
  await seedTwo(page);
  await page.locator('#search').focus();
  await page.locator('#command-palette-btn').click();
  await expect(page.locator('#command-palette-dialog')).toBeVisible();
  await expect(page.locator('#command-palette-input')).toBeFocused();
  await expect(page.locator(panel)).toBeHidden();
});

test('command bar: blurring the field closes the panel', async ({ page }) => {
  await seedTwo(page);
  await page.locator('#search').focus();
  await expect(page.locator(panel)).toBeVisible();
  await page.locator('#note-title-display').click();
  await expect(page.locator(panel)).toBeHidden();
  await expect(page.locator('#search')).toHaveAttribute('aria-expanded', 'false');
});

test('view menu: switches views and names the current one', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'view-one', title: 'View note', body: 'Body.' }]);
  const trigger = page.locator('#view-menu-btn');
  await expect(page.locator('#view-menu-label')).toHaveText('Notes');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(page.locator('#view-menu')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#active-notes-view')).toHaveAttribute('aria-checked', 'true');

  await page.locator('#archive-view').click();
  await expect(page.locator('#view-menu')).toBeHidden();
  await expect(page.locator('#view-menu-label')).toHaveText('Archive');
  await expect(page.locator('#archive-view')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#active-notes-view')).toHaveAttribute('aria-checked', 'false');

  await switchView(page, 'active');
  await expect(page.locator('#view-menu-label')).toHaveText('Notes');
});

test('view menu: opens from the keyboard and closes on Escape', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'view-two', title: 'View note', body: 'Body.' }]);
  await page.locator('#view-menu-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#view-menu')).toBeHidden();
  await expect(page.locator('#view-menu-btn')).toBeFocused();
});

test('rail: today tile labels today and opens today’s note', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRawNotes(page, [{ id: 'rail-one', title: 'Rail note', body: 'Body.' }]);
  const tile = page.locator('#chronicle-days .chronicle-day.is-today');
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText('Today');
  await expect(page.locator('#chronicle-today')).toHaveCount(0);
  await tile.click();
  await expect
    .poll(async () => page.evaluate(async () => (await window.ScratchpadDB.getAll()).some((n) => n.dailyDate)))
    .toBe(true);
});
