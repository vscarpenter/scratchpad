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

  test('rejects passphrases under 12 characters and mismatched confirmations', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Passphrase validation', 'Body');
    await page.locator('#open-about').click();
    await page.locator('#export-encrypted-btn').click();

    await page.locator('#backup-passphrase').fill('short');
    await page.locator('#backup-passphrase-confirm').fill('short');
    await page.locator('#confirm-encrypted-export').click();
    await expect(page.locator('#backup-passphrase-error')).toContainText('at least 12 characters');
    await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();

    await page.locator('#backup-passphrase').fill('long enough passphrase');
    await page.locator('#backup-passphrase-confirm').fill('does not match');
    await page.locator('#confirm-encrypted-export').click();
    await expect(page.locator('#backup-passphrase-confirm')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();
  });

  test('rejects a corrupted or malformed encrypted backup envelope', async ({ page }) => {
    await gotoApp(page);
    const corrupted = {
      format: 'scratchpad-encrypted-backup',
      version: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1, salt: 'AAAA' },
      cipher: { name: 'AES-GCM', iv: 'AAAA' },
      ciphertext: 'AAAA',
    };
    await page.setInputFiles('#import-file', {
      name: 'corrupted.scratchpad',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(corrupted)),
    });
    await expect(page.locator('#backup-passphrase-dialog')).toBeVisible();
    await page.locator('#backup-passphrase').fill('any passphrase at all');
    await page.locator('#confirm-encrypted-import').click();
    await expect(page.locator('#backup-passphrase-error')).toContainText('passphrase or file is invalid');
  });
});
