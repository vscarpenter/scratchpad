const { expect } = require('@playwright/test');
const { seedRawNotes, openOverflowMenu } = require('./helpers');

const SHARE_ID = 'AbCdEf123456';
const OWNER = 'o'.repeat(43);

function mutableApi() {
  const api = { shares: new Map(), requests: [], controls: { fail: 0, loseResponse: false, delay: null } };
  api.install = (surface) => install(api, surface);
  return api;
}

async function write(api, request, id, data) {
  const { shares, controls } = api;
  if (controls.delay) await controls.delay;
  if (controls.fail) return { status: controls.fail, body: { error: 'Rejected' } };
  const row = shares.get(id);
  if (!row) return { status: 404, body: {} };
  if (request.headers()['x-share-owner-token'] !== OWNER) return { status: 403, body: {} };
  if (row.operationId === data.operationId) return { status: 200, body: row };
  if (row.revision !== data.expectedRevision) return { status: 409, body: {} };
  const next = { ...row, ...data, revision: row.revision + 1, publishedAt: Date.now() };
  shares.set(id, next);
  return { status: 200, body: next };
}
async function respond(api, request) {
  const { shares, requests } = api;
  const method = request.method();
  const id = new URL(request.url()).pathname.split('/').pop();
  const data = request.postDataJSON();
  requests.push({ method, url: request.url(), body: request.postData(), headers: request.headers() });
  if (method === 'POST') {
    const newId = shares.size ? 'b'.repeat(12) : SHARE_ID;
    const row = { ...data, expiresAt: Date.now() + 7 * 86400000, revision: 1, publishedAt: Date.now() };
    shares.set(newId, row);
    return { status: 201, body: { ...row, id: newId, revokeToken: OWNER } };
  }
  if (method === 'PUT') return write(api, request, id, data);
  if (method === 'DELETE') {
    shares.delete(id);
    return { status: 204, body: null };
  }
  return { status: shares.has(id) ? 200 : 404, body: shares.get(id) || {} };
}
async function install(api, surface) {
  const { controls } = api;
  await surface.route('**/s/*', (route) =>
    route.fulfill({ path: require('node:path').join(__dirname, '../share.html') }),
  );
  await surface.route('**/api/share**', async (route) => {
    const result = await respond(api, route.request());
    if (controls.loseResponse && route.request().method() === 'PUT') {
      controls.loseResponse = false;
      return route.abort();
    }
    await route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: result.body ? JSON.stringify(result.body) : '',
    });
  });
}

async function openSharing(page) {
  await openOverflowMenu(page);
  await page.locator('#share-btn').click();
  await expect(page.locator('#share-dialog')).toBeVisible();
}

async function createLinkedNote(page, api = mutableApi()) {
  await api.install(page.context());
  await seedRawNotes(page, [{ id: 'note-1', title: 'Agenda', body: 'First published version.' }]);
  await page.locator('.note-row').first().click();
  await openSharing(page);
  await page.locator('#create-share-link').click();
  await expect(page.locator('.share-link-url')).toBeVisible();
  return api;
}

async function editLinkedNote(page, body = 'Revised agenda.') {
  if (await page.locator('#share-dialog').isVisible())
    await page.locator('#share-dialog [data-dialog-close]').first().click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill(body);
  await page.locator('#save-btn').click();
  await expect(page.locator('#save-btn')).toBeHidden();
  await openSharing(page);
}

module.exports = { mutableApi, createLinkedNote, editLinkedNote, openSharing, SHARE_ID };
