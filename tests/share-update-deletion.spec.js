const { test, expect } = require('@playwright/test');
const { createLinkedNote, SHARE_ID } = require('./share-update-fixtures');
const { seedRawNotes, switchView, openOverflowMenu, enterBulkMode, holdToConfirm } = require('./helpers');

test.use({ serviceWorkers: 'block' });

async function publishingTrashedNote(page, failed = false) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
  const api = await createLinkedNote(page);
  // A note can enter Trash while an earlier publication is still running. Start
  // at the shared manager boundary, then exercise the actual destructive UI.
  await seedRawNotes(page, [{ id: 'note-1', title: 'Agenda', body: 'Revised', deletedAt: Date.now() }]);
  await switchView(page, 'trash');
  await page.locator('.note-row').first().click();
  let release;
  api.controls.delay = new Promise((resolve) => {
    release = resolve;
  });
  if (failed) api.controls.fail = 503;
  await page.evaluate(async (id) => {
    const share = await window.ScratchpadDB.getShare(id);
    const note = await window.ScratchpadDB.get(share.noteId);
    window.__publication = window.ScratchpadShareManager.publish(note, share).catch(() => {});
  }, SHARE_ID);
  await expect.poll(() => api.requests.map((request) => request.method)).toEqual(['POST', 'PUT']);
  return { api, release };
}

async function destroy(page, action) {
  if (action === 'empty-trash') {
    await page.locator('.trash-tools button').click();
    await holdToConfirm(page, '#confirm-empty-trash');
  } else if (action === 'bulk-delete') {
    await enterBulkMode(page);
    await page.locator('.note-row input[type="checkbox"]').check();
    await page.locator('#bulk-delete-forever').click();
    await holdToConfirm(page, '#confirm-permanent-delete');
  } else {
    await openOverflowMenu(page);
    await page.locator('#permanent-delete-btn').click();
    await holdToConfirm(page, '#confirm-permanent-delete');
  }
}

for (const action of ['permanent-delete', 'empty-trash', 'bulk-delete']) {
  test(`without Web Locks ${action} waits for publication before revoking and destroying the token`, async ({
    page,
  }) => {
    const { api, release } = await publishingTrashedNote(page);
    await destroy(page, action);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toHaveLength(1);
    expect(api.requests.map((request) => request.method)).toEqual(['POST', 'PUT']);
    release();
    await expect(page.locator('.note-row')).toHaveCount(0);
    await page.evaluate(() => window.__publication);
    expect(api.requests.map((request) => request.method)).toEqual(['POST', 'PUT', 'DELETE']);
    expect(api.shares.has(SHARE_ID)).toBe(false);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
  });
}

test('a failed publication still releases the fallback queue for revocation', async ({ page }) => {
  const { api, release } = await publishingTrashedNote(page, true);
  await destroy(page, 'permanent-delete');
  release();
  await expect(page.locator('.note-row')).toHaveCount(0);
  expect(api.requests.map((request) => request.method)).toEqual(['POST', 'PUT', 'DELETE']);
  expect(api.shares.has(SHARE_ID)).toBe(false);
});
