// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('backup reminders', () => {
  test('shows a reminder when notes exist and no recent backup is recorded', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'backup-note', title: 'Important local note', body: 'Needs backup.' },
    ]);
    await page.evaluate(() => {
      localStorage.removeItem('scratchpad:lastBackupAt');
      localStorage.removeItem('scratchpad:backupReminderSnoozedUntil');
    });

    await page.locator('#open-about').click();
    await expect(page.locator('#backup-reminder')).toBeVisible();
    await expect(page.locator('#backup-reminder')).toContainText('No backup recorded');

    await page.locator('#backup-reminder-snooze').click();
    await expect(page.locator('#backup-reminder')).toBeHidden();
    const snoozedUntil = await page.evaluate(() => Number(localStorage.getItem('scratchpad:backupReminderSnoozedUntil')));
    expect(snoozedUntil).toBeGreaterThan(Date.now());
  });

  test('records backup time after exporting JSON', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'backup-export-note', title: 'Export me', body: 'Backup body.' },
    ]);
    await page.locator('#open-about').click();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#backup-reminder-export').click();
    await downloadPromise;

    const lastBackupAt = await page.evaluate(() => Number(localStorage.getItem('scratchpad:lastBackupAt')));
    expect(lastBackupAt).toBeGreaterThan(Date.now() - 60_000);
  });
});
