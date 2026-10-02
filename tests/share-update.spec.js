const { test, expect } = require('@playwright/test');
const { mutableApi, createLinkedNote, editLinkedNote, openSharing, SHARE_ID } = require('./share-update-fixtures');

test.use({ serviceWorkers: 'block' });

test('local editing and opening Share upload nothing; deliberate update preserves URL and expiry', async ({ page }) => {
  const api = await createLinkedNote(page);
  const url = await page.locator('.share-link-url').inputValue();
  const expiry = api.shares.get(SHARE_ID).expiresAt;
  await editLinkedNote(page, 'PRIVATE-EDIT-8234');
  expect(api.requests).toHaveLength(1);
  await expect(page.locator('.share-link-status')).toContainText("haven't been shared");
  await page.locator('.share-link-update').click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  expect(await page.locator('.share-link-url').inputValue()).toBe(url);
  expect(api.shares.get(SHARE_ID).expiresAt).toBe(expiry);
  expect(api.requests.map((request) => request.method)).toEqual(['POST', 'PUT']);
  const key = url.split('#k=')[1];
  const update = api.requests[1];
  expect(JSON.stringify(update)).not.toContain(key);
  expect(JSON.stringify(update)).not.toContain('PRIVATE-EDIT-8234');
  expect(api.shares.get(SHARE_ID).iv).not.toBe(JSON.parse(api.requests[0].body).iv);
  const [row] = await page.evaluate(() => window.ScratchpadDB.getAllShares());
  expect(row.revision).toBe(2);
  expect(update.body).not.toContain(row.publishedContentHash);
});

test('a recipient reloads the same URL to see the replacement and publication time', async ({ page }) => {
  await createLinkedNote(page);
  const url = await page.locator('.share-link-url').inputValue();
  const viewer = await page.context().newPage();
  await viewer.goto(url);
  await expect(viewer.locator('#share-body')).toContainText('First published version');
  await editLinkedNote(page);
  await page.locator('.share-link-update').click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  await expect(viewer.locator('#share-body')).toContainText('First published version');
  await viewer.reload();
  await expect(viewer.locator('#share-body')).toContainText('Revised agenda');
  await expect(viewer.locator('#share-published')).toContainText('Last shared');
  await expect(viewer.locator('#share-update-hint')).toContainText('Reload');
});

test('updating one link leaves the other link untouched', async ({ page }) => {
  const api = await createLinkedNote(page);
  await page.locator('#create-share-link').click();
  await expect(page.locator('.share-link-url')).toHaveCount(2);
  const original = api.shares.get(SHARE_ID).ciphertext;
  await editLinkedNote(page);
  await page.locator('.share-link-update').first().click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  expect(api.shares.get(SHARE_ID).ciphertext).toBe(original);
  expect(api.shares.get('b'.repeat(12)).revision).toBe(2);
});

test('unsaved drafts block an update without publishing the older saved version', async ({ page }) => {
  const api = await createLinkedNote(page);
  await page.locator('#share-dialog [data-dialog-close]').first().click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill('Unfinished private draft');
  await openSharing(page);
  await page.locator('.share-link-update').click();
  await expect(page.locator('#share-link-error')).toContainText('Save your changes');
  expect(api.requests).toHaveLength(1);
});

test('a lost response retains the encrypted operation and retry acknowledges it once', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  api.controls.loseResponse = true;
  await page.locator('.share-link-update').click();
  await expect(page.locator('#share-link-error')).toContainText('not confirmed');
  await expect(page.locator('.share-link-update')).toHaveText('Retry update');
  await page.reload();
  await page.locator('.note-row').first().click();
  await openSharing(page);
  await page.locator('.share-link-update').click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  expect(api.requests[1].body).toBe(api.requests[2].body);
  expect(api.shares.get(SHARE_ID).revision).toBe(2);
});

test('conflicts require explicitly reviewing the remote version before another publication', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  api.shares.get(SHARE_ID).revision = 2;
  await page.locator('.share-link-update').click();
  await expect(page.locator('#share-link-error')).toContainText('another tab');
  expect(api.requests.map((request) => request.method)).toEqual(['POST', 'PUT']);
  await page.locator('.share-link-review').click();
  await expect(page.locator('.share-review')).toContainText('First published version');
  await page.locator('.share-review-publish').click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  expect(api.requests.map((request) => request.method)).toEqual(['POST', 'PUT', 'GET', 'PUT']);
  expect(api.shares.get(SHARE_ID).revision).toBe(3);
});

for (const [status, message] of [
  [403, 'permission'],
  [410, 'expired'],
  [413, 'too large'],
  [503, 'not available'],
]) {
  test(`update rejection ${status} leaves the published content and local revision unchanged`, async ({ page }) => {
    const api = await createLinkedNote(page);
    await editLinkedNote(page);
    const original = api.shares.get(SHARE_ID).ciphertext;
    api.controls.fail = status;
    await page.locator('.share-link-update').click();
    await expect(page.locator('#share-link-error')).toContainText(message);
    expect(api.shares.get(SHARE_ID).ciphertext).toBe(original);
    const [row] = await page.evaluate(() => window.ScratchpadDB.getAllShares());
    expect(row.revision).toBe(1);
  });
}

test('late responses cannot recreate an erased management row', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  let release;
  api.controls.delay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('.share-link-update').click();
  await expect.poll(() => api.requests.length).toBe(2);
  await page.evaluate((id) => window.ScratchpadDB.removeShare(id), SHARE_ID);
  release();
  await expect(page.locator('#share-link-error')).toContainText('local record');
  expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toEqual([]);
});

test('a note changed during upload still shows its newer saved changes as unpublished', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  let release;
  api.controls.delay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('.share-link-update').click();
  await expect.poll(() => api.requests.length).toBe(2);
  const other = await page.context().newPage();
  await other.goto('/');
  await other.locator('.note-row').first().click();
  await other.locator('#edit-btn').click();
  await other.locator('#note-editor').fill('Newer saved changes');
  await other.locator('#save-btn').click();
  await expect(other.locator('#save-btn')).toBeHidden();
  release();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  await expect(page.locator('.share-link-status')).toContainText("haven't been shared");
});

test('recipient copies remain independent after the sender publishes again', async ({ page }) => {
  const api = await createLinkedNote(page);
  const url = await page.locator('.share-link-url').inputValue();
  const recipient = await page
    .context()
    .browser()
    .newContext({ baseURL: new URL(url).origin, serviceWorkers: 'block' });
  try {
    await api.install(recipient);
    const viewer = await recipient.newPage();
    await viewer.goto(url);
    await viewer.locator('#share-save').click();
    await expect(viewer.locator('#note-rendered')).toContainText('First published version');
    await editLinkedNote(page);
    await page.locator('.share-link-update').click();
    await expect(page.locator('#toast-region')).toContainText('Shared link updated');
    await viewer.reload();
    await viewer.locator('.note-row').filter({ hasText: 'Agenda' }).click();
    await expect(viewer.locator('#note-rendered')).toContainText('First published version');
  } finally {
    await recipient.close();
  }
});

test('failed local confirmation keeps a safe retry instead of claiming success', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  await page.evaluate(() => {
    const patch = window.ScratchpadDB.patchShare;
    let failed = false;
    window.ScratchpadDB.patchShare = (id, changes, operationId) => {
      if (changes.revision && !failed) {
        failed = true;
        throw new Error('quota');
      }
      return patch(id, changes, operationId);
    };
  });
  await page.locator('.share-link-update').click();
  await expect(page.locator('#share-link-error')).toContainText('confirmation could not be saved');
  await expect(page.locator('.share-link-update')).toHaveText('Retry update');
  await page.locator('.share-link-update').click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  expect(api.shares.get(SHARE_ID).revision).toBe(2);
});

test('legacy rows do not claim to be current and can explicitly publish revision one', async ({ page }) => {
  await createLinkedNote(page);
  await page.evaluate(async () => {
    const [row] = await window.ScratchpadDB.getAllShares();
    delete row.publishedContentHash;
    delete row.revision;
    delete row.publishedAt;
    await window.ScratchpadDB.putShare(row);
  });
  await page.reload();
  await page.locator('.note-row').first().click();
  await openSharing(page);
  await expect(page.locator('.share-link-status')).toContainText('current saved version');
  await page.locator('.share-link-update').click();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
});

test('two tabs serialize their requests and require review of a stale local publication', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  const other = await page.context().newPage();
  await other.goto('/');
  await other.locator('.note-row').first().click();
  await openSharing(other);
  let release;
  api.controls.delay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('.share-link-update').click();
  await expect.poll(() => api.requests.length).toBe(2);
  await other.locator('.share-link-update').click();
  release();
  await expect(page.locator('#toast-region')).toContainText('Shared link updated');
  await expect(other.locator('#share-link-error')).toContainText('another tab');
  expect(api.requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
});

test("a queued tab must explicitly retry another tab's unconfirmed publication", async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  const other = await page.context().newPage();
  await other.goto('/');
  await other.locator('.note-row').first().click();
  await openSharing(other);
  let release;
  api.controls.delay = new Promise((resolve) => {
    release = resolve;
  });
  api.controls.loseResponse = true;
  await page.locator('.share-link-update').click();
  await expect.poll(() => api.requests.length).toBe(2);
  await other.locator('.share-link-update').click();
  release();
  await expect(page.locator('#share-link-error')).toContainText('not confirmed');
  await expect(other.locator('#share-link-error')).toContainText('another tab');
  expect(api.requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
  await expect(other.locator('.share-link-update')).toHaveText('Retry update');
  await other.locator('.share-link-update').click();
  await expect(other.locator('#toast-region')).toContainText('Shared link updated');
  expect(api.shares.get(SHARE_ID).revision).toBe(2);
});

test('review rejects an altered expiry without advancing local publication state', async ({ page }) => {
  const api = await createLinkedNote(page);
  await editLinkedNote(page);
  api.shares.get(SHARE_ID).revision = 2;
  await page.locator('.share-link-update').click();
  await expect(page.locator('.share-link-review')).toBeVisible();
  api.shares.get(SHARE_ID).expiresAt += 86400000;
  await page.locator('.share-link-review').click();
  await expect(page.locator('#share-link-error')).toContainText('confirm');
  await expect(page.locator('.share-review')).toHaveCount(0);
  const [share] = await page.evaluate(() => window.ScratchpadDB.getAllShares());
  expect(share.revision).toBe(1);
  expect(share.publicationState).toBe('conflict');
});
