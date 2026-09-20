// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, openOverflowMenu, holdToConfirm } = require('./helpers');

const CONFIRM = '#confirm-permanent-delete';

/** @param {import('@playwright/test').Page} page */
async function openPermanentDelete(page) {
  await seedRawNotes(page, [{ id: 'hold-1', title: 'Doomed', body: 'x', deletedAt: Date.now() }]);
  await page.locator('#trash-view').click();
  await page.locator('.note-row[data-id="hold-1"]').click();
  await openOverflowMenu(page);
  await page.locator('#permanent-delete-btn').click();
  await expect(page.locator('#permanent-delete-dialog')).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
function noteExists(page) {
  return page.evaluate(() => window.ScratchpadDB.get('hold-1').then((note) => !!note));
}

/**
 * Presses the button and keeps it down for `ms`. The caller lets go.
 * @param {import('@playwright/test').Page} page
 * @param {number} ms
 */
async function pressFor(page, ms) {
  await page.locator(CONFIRM).hover();
  await page.mouse.down();
  await page.waitForTimeout(ms);
}

test.describe('hold to confirm with a pointer', () => {
  test('a plain click deletes nothing and says to keep holding', async ({ page }) => {
    await openPermanentDelete(page);
    await expect(page.locator(CONFIRM)).toHaveText('Hold to delete forever');
    await page.locator(CONFIRM).click();
    await expect(page.locator('#permanent-delete-dialog')).toBeVisible();
    await expect(page.locator('#permanent-delete-dialog [aria-live]')).toHaveText('Keep holding to confirm.');
    expect(await noteExists(page)).toBe(true);
  });

  test('holding for the full second deletes the note', async ({ page }) => {
    await openPermanentDelete(page);
    await holdToConfirm(page, CONFIRM);
    await expect(page.locator('#permanent-delete-dialog')).toBeHidden();
    await expect.poll(() => noteExists(page)).toBe(false);
  });

  test('letting go early deletes nothing', async ({ page }) => {
    await openPermanentDelete(page);
    await pressFor(page, 400);
    await page.mouse.up();
    await page.waitForTimeout(900);
    await expect(page.locator('#permanent-delete-dialog')).toBeVisible();
    expect(await noteExists(page)).toBe(true);
  });

  test('sliding off the button cancels the hold', async ({ page }) => {
    await openPermanentDelete(page);
    await pressFor(page, 300);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1000);
    await page.mouse.up();
    await expect(page.locator(CONFIRM)).not.toHaveClass(/is-holding/);
    expect(await noteExists(page)).toBe(true);
  });
});

test.describe('hold to confirm with a keyboard or assistive technology', () => {
  for (const key of ['Enter', 'Space']) {
    test(`holding ${key} confirms`, async ({ page }) => {
      await openPermanentDelete(page);
      await page.locator(CONFIRM).focus();
      await page.keyboard.down(key);
      await page.waitForTimeout(1150);
      await page.keyboard.up(key);
      await expect(page.locator('#permanent-delete-dialog')).toBeHidden();
      await expect.poll(() => noteExists(page)).toBe(false);
    });
  }

  test('a tap of Enter deletes nothing', async ({ page }) => {
    await openPermanentDelete(page);
    await page.locator(CONFIRM).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    await expect(page.locator('#permanent-delete-dialog')).toBeVisible();
    expect(await noteExists(page)).toBe(true);
  });

  test('an activation with no press confirms at once', async ({ page }) => {
    await openPermanentDelete(page);
    // VoiceOver, Voice Control, and Switch Control send a click with no press.
    await page.evaluate((selector) => /** @type {HTMLElement} */ (document.querySelector(selector)).click(), CONFIRM);
    await expect(page.locator('#permanent-delete-dialog')).toBeHidden();
    await expect.poll(() => noteExists(page)).toBe(false);
  });

  test('Escape during a hold closes the dialog and keeps the note', async ({ page }) => {
    await openPermanentDelete(page);
    await pressFor(page, 300);
    await page.keyboard.press('Escape');
    await expect(page.locator('#permanent-delete-dialog')).toBeHidden();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    expect(await noteExists(page)).toBe(true);
  });
});

test.describe('hold to confirm feedback and Empty Trash', () => {
  test('the button fills while held and resets on release', async ({ page }) => {
    await openPermanentDelete(page);
    const button = page.locator(CONFIRM);
    expect(await button.evaluate((node) => node.style.getPropertyValue('--hold-ms'))).toBe('1000ms');
    await pressFor(page, 200);
    await expect(button).toHaveClass(/is-holding/);
    await page.mouse.up();
    await expect(button).not.toHaveClass(/is-holding/);
  });

  test('Empty Trash needs the same hold', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'hold-1', title: 'Doomed', body: 'x', deletedAt: Date.now() }]);
    await page.locator('#trash-view').click();
    await page.locator('.trash-tools button').click();
    await expect(page.locator('#confirm-empty-trash')).toHaveText('Hold to empty Trash');

    await page.locator('#confirm-empty-trash').click();
    await expect(page.locator('#empty-trash-dialog')).toBeVisible();
    expect(await noteExists(page)).toBe(true);

    await holdToConfirm(page, '#confirm-empty-trash');
    await expect(page.locator('#empty-trash-dialog')).toBeHidden();
    await expect.poll(() => noteExists(page)).toBe(false);
  });
});
