// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

// U.S. daylight saving time ended on Sunday, November 1, 2026, so that local
// day ran 25 hours and "24 hours before midnight" lands at 1 a.m., not midnight.
test.use({ timezoneId: 'America/Chicago' });

test('a note from just after midnight on a 25-hour day still reads as yesterday', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T18:00:00Z'));
  const justAfterMidnight = new Date('2026-11-01T05:30:00Z').getTime();
  await seedRawNotes(page, [
    { id: 'dst', title: 'Late night idea', body: 'Body', createdAt: justAfterMidnight, updatedAt: justAfterMidnight },
  ]);
  await expect(page.locator('.note-row[data-id="dst"]')).toContainText('Yest');
});

test('a backup from late last night reads as yesterday the next morning', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T15:00:00Z'));
  const lastNight = new Date('2026-11-10T05:00:00Z').getTime();
  await page.addInitScript((ms) => localStorage.setItem('scratchpad:lastBackupAt', String(ms)), lastNight);
  await gotoApp(page);
  await expect(page.locator('#backup-chip-label')).toHaveText('Backed up yesterday');
});
