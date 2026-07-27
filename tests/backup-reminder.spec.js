// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, openBackupMenu } = require('./helpers');

const DAY_MS = 24 * 60 * 60 * 1000;

async function setLastBackup(page, msAgo) {
  await page.evaluate((ago) => {
    if (ago == null) localStorage.removeItem('scratchpad:lastBackupAt');
    else localStorage.setItem('scratchpad:lastBackupAt', String(Date.now() - ago));
  }, msAgo);
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
}

test.describe('backup status chip', () => {
  test('shows the missing state when no backup was ever recorded', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'backup-note', title: 'Important local note', body: 'Needs backup.' },
    ]);
    await setLastBackup(page, null);

    const chip = page.locator('#backup-chip');
    await expect(chip).toHaveAttribute('data-backup-state', 'missing');
    await expect(chip).toContainText('Never backed up. Export now.');
  });

  test('shows healthy and aging states from the stored backup time', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'aging-note', title: 'Aging note', body: 'Body.' },
    ]);

    await setLastBackup(page, 3 * DAY_MS);
    const chip = page.locator('#backup-chip');
    await expect(chip).toHaveAttribute('data-backup-state', 'healthy');
    await expect(chip).toContainText('Backed up 3 days ago');

    await setLastBackup(page, 12 * DAY_MS);
    await expect(chip).toHaveAttribute('data-backup-state', 'aging');
    await expect(chip).toContainText('Last backup 12 days ago');
  });

  test('exporting from the chip menu records the backup and updates the chip immediately', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'backup-export-note', title: 'Export me', body: 'Backup body.' },
    ]);
    await setLastBackup(page, null);
    await expect(page.locator('#backup-chip')).toHaveAttribute('data-backup-state', 'missing');

    await openBackupMenu(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    await downloadPromise;

    const lastBackupAt = await page.evaluate(() => Number(localStorage.getItem('scratchpad:lastBackupAt')));
    expect(lastBackupAt).toBeGreaterThan(Date.now() - 60_000);

    // No reload: the chip re-renders right after the export succeeds.
    await expect(page.locator('#backup-chip')).toHaveAttribute('data-backup-state', 'healthy');
    await expect(page.locator('#backup-chip')).toContainText('Backed up today');
  });

  test('the chip menu opens with the keyboard and returns focus on Escape', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'kbd-note', title: 'Keyboard note', body: 'Body.' },
    ]);

    await page.locator('#backup-chip').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#backup-menu')).toBeVisible();
    await expect(page.locator('#export-btn')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#export-encrypted-btn')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#backup-menu')).toBeHidden();
    await expect(page.locator('#backup-chip')).toBeFocused();
  });
});
