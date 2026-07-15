const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

test.describe('encrypted backups', () => {
  test('exports and restores a passphrase-protected backup locally', async ({ page }) => {
    test.slow();
    await gotoApp(page);
    await createAndSaveNote(page, 'Encrypted note', 'Only the owner should read this.');

    await page.locator('#open-about').click();
    await page.locator('#export-encrypted-btn').click();
    await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();
    await page.locator('#backup-passphrase').fill('correct horse battery staple');
    await page.locator('#backup-passphrase-confirm').fill('correct horse battery staple');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#confirm-encrypted-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^scratchpad-encrypted-.*\.scratchpad$/);
    const path = await download.path();

    await page.evaluate(() => window.ScratchpadDB.clearAllStores());
    await page.reload();
    await page.setInputFiles('#import-file', path);
    await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();
    await page.locator('#backup-passphrase').fill('correct horse battery staple');
    await page.locator('#confirm-encrypted-import').click();

    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await page.locator('#confirm-import').click();
    await expect(page.locator('#note-rendered')).toContainText('Only the owner should read this.');
  });

  test('keeps the encrypted file selected after a wrong passphrase', async ({ page }) => {
    test.slow();
    await gotoApp(page);
    await createAndSaveNote(page, 'Wrong passphrase test', 'Secret');
    await page.locator('#open-about').click();
    await page.locator('#export-encrypted-btn').click();
    await page.locator('#backup-passphrase').fill('correct horse battery staple');
    await page.locator('#backup-passphrase-confirm').fill('correct horse battery staple');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#confirm-encrypted-export').click();
    const path = await (await downloadPromise).path();

    await page.setInputFiles('#import-file', path);
    await page.locator('#backup-passphrase').fill('this passphrase is wrong');
    await page.locator('#confirm-encrypted-import').click();
    await expect(page.locator('#backup-passphrase-error')).toContainText('passphrase or file is invalid');
    await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();
  });
});
