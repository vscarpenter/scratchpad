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

// The two rows people mix up: one holds the app, the other holds the notes.
test('the Offline cache row says it holds the app, not your notes', async ({ page }) => {
  await gotoApp(page);
  await openSettings(page);
  const hint = page.locator('#offline-cache-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(
    'A copy of the app itself, so Scratchpad opens with no connection. Your notes are not in it; they stay in this browser.',
  );
});

test('the Linked folder row says it mirrors notes as files both ways', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium has the File System Access API that shows this row.');
  await gotoApp(page);
  await openSettings(page);
  const hint = page.locator('#linked-folder-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(
    'Saves every note as a Markdown file in a folder you pick, and reads your edits back when you return to this tab.',
  );
});
