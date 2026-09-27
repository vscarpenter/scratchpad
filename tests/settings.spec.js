// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, openSettings } = require('./helpers');

test.describe('settings dialog', () => {
  test('the gear opens Settings with appearance, data, and erase sections', async ({ page }) => {
    await gotoApp(page);
    // Open from the keyboard: WebKit does not focus a button on click, and the
    // focus-return check at the end is a keyboard user's guarantee.
    const gear = page.locator('#open-settings');
    await gear.focus();
    await page.keyboard.press('Enter');

    const dialog = page.locator('#settings-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.locator('#theme-choice')).toBeVisible();
    await expect(dialog.locator('#diagnostics-panel')).toBeVisible();
    await expect(dialog.locator('#erase-local-data-btn')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
    await expect(gear).toBeFocused();
  });

  test('About keeps its text and shortcuts but loses the data rows and the header theme icon', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('.brand-actions #theme-toggle')).toHaveCount(0);

    await page.locator('#open-about').click();
    await expect(page.locator('#about-dialog')).toHaveAttribute('open', '');
    await expect(page.locator('#about-dialog #diagnostics-panel')).toHaveCount(0);
    await expect(page.locator('#about-dialog .shortcut-list')).toBeVisible();
  });

  test('the command palette opens Settings', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('ControlOrMeta+Shift+P');
    await page.locator('#command-palette-input').fill('settings');
    const option = page.locator('#command-palette-list [role="option"]', { hasText: 'Open settings' });
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.locator('#settings-dialog')).toHaveAttribute('open', '');
  });
});
