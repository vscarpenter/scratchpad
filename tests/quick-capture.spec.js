// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

test.describe('quick capture spotlight', () => {
  test('opens without a title bar and previews the capture line', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+Shift+Space');
    await expect(page.locator('#quick-capture-input')).toBeVisible();
    // Spotlight bar: no title, the dialog names itself for AT instead.
    await expect(page.locator('#quick-capture-dialog h2')).toHaveCount(0);
    await expect(page.locator('#quick-capture-dialog')).toHaveAttribute('aria-label', 'Quick capture');
    // The foot shows exactly what will be appended: timestamp, then the text.
    await expect(page.locator('#quick-capture-preview')).toContainText(/\d{2}:\d{2}/);
    await page.locator('#quick-capture-input').fill('call the bank');
    await expect(page.locator('#quick-capture-preview')).toContainText('call the bank');
    await expect(page.locator('.quick-capture-destination')).toHaveText('Today’s note');
  });

  test('the destination flips to the draft while editing today’s note', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'day-1', title: 'Today', body: 'saved body', dailyDate: todayKey() }]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+Shift+Space');
    await expect(page.locator('#quick-capture-input')).toBeVisible();
    await expect(page.locator('.quick-capture-destination')).toHaveText('Today’s draft');
  });
});
