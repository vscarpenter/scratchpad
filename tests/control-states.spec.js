// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote, openBackupMenu } = require('./helpers');

test('hovering a toast action keeps an accent color', async ({ page }) => {
  await gotoApp(page);
  const expected = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-d)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    window.ScratchpadToast.show(document.getElementById('toast-region'), 'Archived.', {
      actionLabel: 'Undo',
      action() {},
      duration: 60000,
    });
    return color;
  });
  const action = page.locator('.toast-action');
  await action.hover();
  await expect(action).toHaveCSS('color', expected);
});

test('the hold-to-confirm fill still takes the full hold under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  const duration = await page.evaluate(() => {
    const button = /** @type {HTMLElement} */ (document.getElementById('confirm-empty-trash'));
    /** @type {HTMLDialogElement} */ (button.closest('dialog')).showModal();
    button.classList.add('is-holding');
    return getComputedStyle(button, '::before').transitionDuration;
  });
  expect(duration).toBe('1s');
});

test('the passphrase field asks for a new password on export and the saved one on unlock', async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await createAndSaveNote(page, 'Encrypted note', 'Body');
  await openBackupMenu(page);
  await page.locator('#export-encrypted-btn').click();
  const field = page.locator('#backup-passphrase');
  await expect(field).toHaveAttribute('autocomplete', 'new-password');
  await field.fill('correct horse battery staple');
  await page.locator('#backup-passphrase-confirm').fill('correct horse battery staple');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#confirm-encrypted-export').click();
  const path = await (await downloadPromise).path();

  await page.setInputFiles('#import-file', path);
  await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();
  await expect(field).toHaveAttribute('autocomplete', 'current-password');
});
