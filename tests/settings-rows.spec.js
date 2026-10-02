// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, openSettings } = require('./helpers');

/* Every Settings status row uses one grid: the status line, then the hint,
   then the actions. A wrapping flex line used to break wherever the next item
   stopped fitting, which stranded Unlink and dropped buttons under the status
   dot on phones. */

// The OPFS root stands in for the folder picker, which also shows the Linked folder row everywhere.
async function openSettingsWithPicker(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    window.showDirectoryPicker = () => navigator.storage.getDirectory();
  });
  await gotoApp(page);
  await openSettings(page);
}

// For each visible row: do its buttons sit below the status line, under the label, and below the hint?
async function rowGeometry(page) {
  return page.locator('#settings-dialog .data-status-row:visible').evaluateAll((rows) =>
    rows.map((row) => {
      const box = (selector) => row.querySelector(selector)?.getBoundingClientRect();
      const term = box('.data-status-term');
      const value = box('.data-status-value');
      const hint = box('.data-status-hint');
      const buttons = [...row.querySelectorAll('button')]
        .filter((b) => !b.hidden)
        .map((b) => b.getBoundingClientRect());
      return {
        term: row.querySelector('.data-status-term')?.textContent,
        belowStatus: buttons.every((b) => b.top >= Math.max(term.bottom, value.bottom) - 1),
        underLabel: buttons.every((b) => b.left >= term.left - 1),
        belowHint: !hint || buttons.every((b) => b.top >= hint.bottom - 1),
      };
    }),
  );
}

for (const width of [1280, 390]) {
  test(`at ${width}px every row puts its actions on their own line under the label`, async ({ page }) => {
    await openSettingsWithPicker(page, width);
    await expect(page.locator('#diagnostic-offline-cache')).not.toHaveText('Checking...');
    const rows = await rowGeometry(page);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row, String(row.term)).toEqual({ ...row, belowStatus: true, underLabel: true, belowHint: true });
    }
  });
}

// Links a folder at this width and returns the boxes of its actions and status value.
async function linkedActionBoxes(page, width) {
  await openSettingsWithPicker(page, width);
  await page.locator('#linked-folder-link').click();
  const linked = await page
    .locator('#linked-folder-write')
    .waitFor({ timeout: 4000 })
    .then(
      () => true,
      () => false,
    );
  test.skip(!linked, 'this browser cannot link a directory here');
  const [write, read, unlink, value] = await Promise.all(
    ['#linked-folder-write', '#linked-folder-read', '#linked-folder-unlink', '#linked-folder-status'].map((id) =>
      page.locator(id).evaluate((el) => el.getBoundingClientRect().toJSON()),
    ),
  );
  return { write, read, unlink, value };
}

/* Unlink may wrap below Write now and Read now on a narrow screen; how narrow
   depends on the platform's fonts (Linux wraps at 390px, macOS does not). It
   must still sit at the far end, never stranded under the label. */
for (const width of [1280, 390]) {
  test(`at ${width}px a linked folder keeps Write now and Read now together, with Unlink at the far end`, async ({
    page,
  }) => {
    const { write, read, unlink, value } = await linkedActionBoxes(page, width);
    expect(Math.abs(read.top - write.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(unlink.right - value.right)).toBeLessThanOrEqual(2);
  });
}

test('at 320px Unlink wraps to its own line and still sits at the far end', async ({ page }) => {
  const { write, unlink, value } = await linkedActionBoxes(page, 320);
  expect(unlink.top).toBeGreaterThan(write.top + 2);
  expect(Math.abs(unlink.right - value.right)).toBeLessThanOrEqual(2);
});

test('at 1280px a linked folder fits all its actions on one line', async ({ page }) => {
  const { write, unlink } = await linkedActionBoxes(page, 1280);
  expect(Math.abs(unlink.top - write.top)).toBeLessThanOrEqual(2);
});

test('the Settings dialog never scrolls sideways at 320px', async ({ page }) => {
  await openSettingsWithPicker(page, 320);
  const overflow = await page.locator('#settings-dialog').evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Persistent and Unavailable both hide Protect local data, so its actions line is empty.
for (const state of ['Persistent', 'Unavailable']) {
  test(`Storage protection stays one line when it reads ${state}`, async ({ page }) => {
    await page.addInitScript((protectionState) => {
      // Replace navigator.storage whole, as storage-protection.spec.js does: patching
      // StorageManager.prototype left WebKit reporting Unavailable.
      const storage =
        protectionState === 'Persistent'
          ? {
              estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }),
              persisted: async () => true,
              persist: async () => true,
            }
          : undefined;
      Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
    }, state);
    await gotoApp(page);
    await openSettings(page);
    await expect(page.locator('#diagnostic-storage-protection')).toHaveText(state);
    await expect(page.locator('#protect-storage-btn')).toBeHidden();
    const [protection, backup] = await Promise.all(
      ['#diagnostic-storage-protection', '#diagnostic-last-backup'].map((id) =>
        page.locator(id).evaluate((el) => el.closest('.data-status-row')?.getBoundingClientRect().height),
      ),
    );
    expect(Math.abs(Number(protection) - Number(backup))).toBeLessThanOrEqual(1);
  });
}
