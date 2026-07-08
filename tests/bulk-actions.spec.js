// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('bulk actions', () => {
  test('moves selected notes to Trash and restores them', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-a', title: 'Bulk A', body: 'Body A.' },
      { id: 'bulk-b', title: 'Bulk B', body: 'Body B.' },
      { id: 'bulk-c', title: 'Bulk C', body: 'Body C.' },
    ]);

    await page.locator('#bulk-toggle').click();
    await page.locator('[data-id="bulk-a"] input[type="checkbox"]').check();
    await page.locator('[data-id="bulk-b"] input[type="checkbox"]').check();
    await expect(page.locator('#bulk-selected-count')).toHaveText('2 selected');

    await page.locator('#bulk-move-trash').click();
    await expect(page.locator('.note-row')).toHaveCount(1);
    await expect(page.locator('#note-count')).toHaveText('1');

    await page.locator('#trash-view').click();
    await page.locator('#bulk-select-all').click();
    await expect(page.locator('#bulk-selected-count')).toHaveText('2 selected');
    await page.locator('#bulk-restore').click();

    await expect(page.locator('#note-count')).toHaveText('3');
    await page.locator('#active-notes-view').click();
    await expect(page.locator('.note-row')).toHaveCount(3);
  });

  test('adds a tag to selected active notes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bulk-tag-a', title: 'Tag A', body: 'Body A.' },
      { id: 'bulk-tag-b', title: 'Tag B', body: 'Body B.' },
    ]);

    await page.locator('#bulk-toggle').click();
    await page.locator('[data-id="bulk-tag-a"] input[type="checkbox"]').check();
    await page.locator('[data-id="bulk-tag-b"] input[type="checkbox"]').check();
    await page.locator('#bulk-add-tag').click();
    await page.locator('#bulk-tag-input').fill('review');
    await page.locator('#bulk-apply-tag').click();

    await expect(page.locator('#bulk-tag-dialog')).toBeHidden();
    await expect(page.locator('[data-id="bulk-tag-a"]')).toContainText('review');
    await expect(page.locator('[data-id="bulk-tag-b"]')).toContainText('review');
  });
});
