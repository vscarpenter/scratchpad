// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('draft autosave around Save', () => {
  test('a draft write pending at save time does not come back as unsaved edits', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#new-note').click();
    await page.locator('#note-title-input').fill('Race note');
    // Two inputs: the first persists a draft at once, the second arms the
    // 350ms debounce that must not outlive the save.
    await page.locator('#note-editor').fill('first');
    await page.locator('#note-editor').fill('first and second');

    // Make the save's draft removal slow to resolve, the way a busy machine
    // does, so the armed debounce fires while the save is still in flight.
    await page.evaluate(() => {
      const db = window.ScratchpadDB;
      const original = db.removeDraft.bind(db);
      db.removeDraft = async (id) => {
        const removal = original(id);
        await new Promise((resolve) => setTimeout(resolve, 700));
        return removal;
      };
    });

    await page.locator('#save-btn').click();
    await expect(page.locator('#edit-btn')).toBeVisible();
    // Give any late draft write time to land before looking.
    await page.waitForTimeout(500);

    const noteId = await page.evaluate(async () => (await window.ScratchpadDB.getAll())[0].id);
    const draft = await page.evaluate((id) => window.ScratchpadDB.getDraft(id), noteId);
    expect(draft, 'no draft may survive a completed save').toBeFalsy();

    // Opening the note again is when a surviving draft would prompt.
    await page.reload();
    await page.locator('.note-row').first().click();
    await expect(page.locator('#note-title-display')).toHaveText('Race note');
    await expect(page.locator('#draft-dialog')).not.toHaveAttribute('open', '');
  });
});
