// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

const SAFE_ACTIONS = [
  ['folder-delete-dialog', 'Cancel'],
  ['delete-dialog', 'Cancel'],
  ['permanent-delete-dialog', 'Cancel'],
  ['empty-trash-dialog', 'Cancel'],
  ['discard-dialog', 'Keep editing'],
  ['erase-shares-dialog', 'Cancel'],
  ['tag-delete-dialog', 'Cancel'],
];

test('destructive confirms open with the safe action focused', async ({ page }) => {
  await gotoApp(page);
  for (const [id, label] of SAFE_ACTIONS) {
    const focused = await page.evaluate((dialogId) => {
      const dialog = /** @type {HTMLDialogElement} */ (document.getElementById(dialogId));
      dialog.showModal();
      const text = document.activeElement ? document.activeElement.textContent : '';
      dialog.close();
      return (text || '').trim();
    }, id);
    expect(focused, id).toBe(label);
  }
});

test('deleting a note from the menu lands on Cancel', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'one', title: 'First note', body: 'Body' }]);
  await page.locator('.note-row[data-id="one"]').click();
  await page.locator('#overflow-btn').click();
  await page.locator('#delete-btn').click();
  await expect(page.locator('#delete-dialog')).toBeVisible();
  await expect(page.locator('#delete-dialog [data-dialog-close]', { hasText: 'Cancel' })).toBeFocused();
});

test('quick capture has a visible control that closes it', async ({ page }) => {
  await gotoApp(page);
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.locator('#quick-capture-input')).toBeFocused();
  const close = page.locator('#quick-capture-dialog').getByRole('button', { name: 'Esc to close' });
  await expect(close).toBeVisible();
  await close.click();
  await expect(page.locator('#quick-capture-dialog')).toBeHidden();
});

test('an open modal contains scroll gestures', async ({ page }) => {
  await gotoApp(page);
  const styles = await page.evaluate(() => {
    const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('settings-dialog'));
    dialog.showModal();
    const backdrop = getComputedStyle(dialog, '::backdrop');
    return [getComputedStyle(dialog).overscrollBehaviorY, backdrop.overscrollBehaviorY, backdrop.overflowY];
  });
  expect(styles).toEqual(['contain', 'contain', 'hidden']);
});
