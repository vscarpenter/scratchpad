// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

async function seedHub(page, extra) {
  await seedRawNotes(page, [
    { id: 'hub', title: 'Hub', body: 'hub body' },
    { id: 'alpha', title: 'Alpha', body: 'Talk to hub about it.' },
    { id: 'beta', title: 'Beta', body: 'see [[Hub]] linked' },
    { id: 'gamma', title: 'Gamma', body: 'inline `Hub` and\n```\nHub\n```' },
    { id: 'delta', title: 'Delta', body: 'Hubcap is different' },
    { id: 'trashed', title: 'Trashed', body: 'Hub here', deletedAt: Date.now() },
    ...(extra || []),
  ]);
  await page.locator('.note-row[data-id="hub"]').click();
}

test('lists plain-text mentions of the open note title with an excerpt', async ({ page }) => {
  await seedHub(page);
  const section = page.locator('#mentions-section');
  await expect(section).toBeVisible();
  await expect(page.locator('#mentions-summary')).toHaveText('Mentioned in 1 note');
  await section.locator('summary').click();
  await expect(section.locator('.mention-row')).toHaveCount(1);
  await expect(section.locator('.mention-row .backlink-btn')).toHaveText('Alpha');
  await expect(section.locator('.mention-excerpt')).toContainText('Talk to hub about it.');
  await expect(page.locator('#backlinks-summary')).toHaveText('Linked from 1 note');
});

test('linking a mention keeps the original casing as an alias and moves it to backlinks', async ({ page }) => {
  await seedHub(page);
  await page.locator('#mentions-section summary').click();
  await page.locator('.mention-link-btn').click();
  await expect(page.locator('#mentions-section')).toBeHidden();
  await expect(page.locator('#backlinks-summary')).toHaveText('Linked from 2 notes');
  const body = await page.evaluate(async () => (await window.ScratchpadDB.get('alpha')).body);
  expect(body).toBe('Talk to [[Hub|hub]] about it.');
});

test('short and untitled titles never produce mentions', async ({ page }) => {
  await seedRawNotes(page, [
    { id: 'ab', title: 'AB', body: 'two letters' },
    { id: 'mentions-ab', title: 'Other', body: 'AB is short' },
    { id: 'untitled', title: '', body: '' },
    { id: 'mentions-untitled', title: 'Third', body: 'An Untitled note is here' },
  ]);
  await page.locator('.note-row[data-id="ab"]').click();
  await expect(page.locator('#mentions-section')).toBeHidden();
  await page.locator('.note-row[data-id="untitled"]').click();
  await expect(page.locator('#mentions-section')).toBeHidden();
});

test('a mentioning note with an unsaved draft shows a disabled link', async ({ page }) => {
  await seedHub(page);
  await page.evaluate(() =>
    window.ScratchpadDB.putDraft({
      noteId: 'alpha',
      title: 'Alpha',
      body: 'Talk to hub later.',
      updatedAt: Date.now(),
    }),
  );
  await page.locator('.note-row[data-id="beta"]').click();
  await page.locator('.note-row[data-id="hub"]').click();
  await page.locator('#mentions-section summary').click();
  const link = page.locator('.mention-link-btn');
  await expect(link).toBeDisabled();
  await expect(link).toHaveText('Unsaved changes');
});

test('the section is hidden when nothing mentions the note', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'lonely', title: 'Lonely', body: 'no mentions' }]);
  await page.locator('.note-row').first().click();
  await expect(page.locator('#mentions-section')).toBeHidden();
});
