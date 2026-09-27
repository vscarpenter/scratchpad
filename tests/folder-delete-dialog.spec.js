// @ts-check
const { test, expect, devices } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

test.use({ ...devices['iPhone 13'] });

async function openDeleteDialog(page) {
  await page.locator('#folder-switcher-btn').click();
  await expect(page.locator('#folder-switcher')).toBeVisible();
  await page
    .locator('#folder-switcher-list .folder-switcher-row[data-folder-id="f-1"] .folder-switcher-menu-btn')
    .click();
  await expect(page.locator('#folder-menu')).toBeVisible();
  // The menu can extend past a phone viewport, so reach Delete by keyboard.
  await page.keyboard.press('End');
  await expect(page.locator('#folder-menu [data-action="delete"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#folder-delete-dialog')).toBeVisible();
}

test.describe('folder-delete dialog on a phone', () => {
  test('keeps every action inside the dialog and marks Keep as the primary choice', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Keep me', body: 'x', folderId: 'f-1' }]);
    await seedFolders(page, [{ id: 'f-1', name: 'A folder with a long name' }]);
    await openDeleteDialog(page);

    const dialog = page.locator('#folder-delete-dialog');
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    const frame = await dialog.boundingBox();
    if (!frame) throw new Error('dialog has no box');
    for (const button of await dialog.locator('.dialog-foot .btn:visible').all()) {
      const box = await button.boundingBox();
      if (!box) throw new Error('button has no box');
      expect(box.x, 'button starts inside the dialog').toBeGreaterThanOrEqual(frame.x);
      expect(box.x + box.width, 'button ends inside the dialog').toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    }

    await expect(page.locator('#folder-delete-keep')).toHaveClass(/btn-primary/);
    await expect(page.locator('#folder-delete-keep')).toHaveText('Keep the notes');
    await expect(page.locator('#folder-delete-trash')).toHaveClass(/btn-danger/);
    await expect(page.locator('#folder-delete-trash')).toHaveText('Move to Trash');
  });
});
