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

  test(`at ${width}px a linked folder keeps its actions on one line with Unlink at the end`, async ({ page }) => {
    await openSettingsWithPicker(page, width);
    await page.locator('#linked-folder-link').click();
    const write = page.locator('#linked-folder-write');
    const linked = await write.waitFor({ timeout: 4000 }).then(
      () => true,
      () => false,
    );
    test.skip(!linked, 'this browser cannot link a directory here');
    const [writeBox, read, unlink, value] = await Promise.all(
      ['#linked-folder-write', '#linked-folder-read', '#linked-folder-unlink', '#linked-folder-status'].map((id) =>
        page.locator(id).evaluate((el) => el.getBoundingClientRect().toJSON()),
      ),
    );
    expect(Math.abs(read.top - writeBox.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(unlink.top - writeBox.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(unlink.right - value.right)).toBeLessThanOrEqual(2);
  });
}

test('the Settings dialog never scrolls sideways at 320px', async ({ page }) => {
  await openSettingsWithPicker(page, 320);
  const overflow = await page.locator('#settings-dialog').evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Storage protection stays one line once it reads Persistent', async ({ page }) => {
  await page.addInitScript(() => {
    // Replace navigator.storage whole, as storage-protection.spec.js does: patching
    // StorageManager.prototype left WebKit reporting Unavailable.
    const storage = {
      estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }),
      persisted: async () => true,
      persist: async () => true,
    };
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
  });
  await gotoApp(page);
  await openSettings(page);
  await expect(page.locator('#diagnostic-storage-protection')).toHaveText('Persistent');
  const [protection, backup] = await Promise.all(
    ['#diagnostic-storage-protection', '#diagnostic-last-backup'].map((id) =>
      page.locator(id).evaluate((el) => el.closest('.data-status-row')?.getBoundingClientRect().height),
    ),
  );
  expect(Math.abs(Number(protection) - Number(backup))).toBeLessThanOrEqual(1);
});
