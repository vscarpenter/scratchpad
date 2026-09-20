// @ts-check
const { expect } = require('@playwright/test');

async function gotoApp(page) {
  await page.addInitScript(() => {
    localStorage.setItem('scratchpad-visited', '1');
  });
  await page.goto('/');
  await expect(page.locator('#app-shell')).toBeVisible();
  await page.waitForFunction(() => !!window.ScratchpadDB);
}

async function seedNotes(page, count) {
  await gotoApp(page);
  await page.evaluate(async (n) => {
    const base = Date.now();
    const notes = [];
    for (let i = 0; i < n; i++) {
      notes.push({
        id: `seed-${i}`,
        title: `Seeded note ${i}`,
        body: `Body for seeded note ${i}`,
        tags: [],
        pinned: false,
        createdAt: base - (n - i) * 1000,
        updatedAt: base - (n - i) * 1000,
        deletedAt: null,
        lastDraftAt: null,
      });
    }
    await window.ScratchpadDB.bulkPut(notes);
  }, count);
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
}

async function seedRawNotes(page, notes) {
  await gotoApp(page);
  await page.evaluate(async (rawNotes) => {
    const base = Date.now();
    const notes = rawNotes.map((note, index) => ({
      id: note.id || `raw-${index}`,
      title: note.title || '',
      body: note.body || '',
      tags: Array.isArray(note.tags) ? note.tags : [],
      pinned: !!note.pinned,
      createdAt: Number.isFinite(note.createdAt) ? note.createdAt : base - (rawNotes.length - index) * 1000,
      updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : base - (rawNotes.length - index) * 1000,
      archivedAt: Number.isFinite(note.archivedAt) ? note.archivedAt : null,
      deletedAt: Number.isFinite(note.deletedAt) ? note.deletedAt : null,
      lastDraftAt: Number.isFinite(note.lastDraftAt) ? note.lastDraftAt : null,
      dailyDate: typeof note.dailyDate === 'string' ? note.dailyDate : null,
      monthlyReviewMonth: typeof note.monthlyReviewMonth === 'string' ? note.monthlyReviewMonth : null,
      folderId: typeof note.folderId === 'string' ? note.folderId : null,
    }));
    await window.ScratchpadDB.bulkPut(notes);
  }, notes);
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
}

async function createAndSaveNote(page, title, body) {
  await page.locator('#new-note').click();
  await expect(page.locator('#note-editor')).toBeVisible();
  await page.locator('#note-title-input').fill(title);
  await page.locator('#note-editor').fill(body);
  await page.locator('#save-btn').click();
  await expect(page.locator('#save-btn')).toBeHidden();
}

async function importJson(page, payload, filename = 'scratchpad-import.json') {
  await page.setInputFiles('#import-file', {
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

async function seedFolders(page, folders) {
  await gotoApp(page);
  await page.evaluate(async (rows) => {
    const base = Date.now();
    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      await window.ScratchpadDB.putFolder({
        id: f.id || `folder-${i}`,
        name: f.name,
        color: f.color || null,
        sortOrder: Number.isFinite(f.sortOrder) ? f.sortOrder : i,
        parentId: null,
        createdAt: base - 1000,
        updatedAt: base - 1000,
      });
    }
  }, folders);
  await page.reload();
  await expect(page.locator('#app-shell')).toBeVisible();
}

async function openListMenu(page) {
  await page.locator('#list-menu-btn').click();
  await expect(page.locator('#list-menu')).toBeVisible();
}

async function enterBulkMode(page) {
  await openListMenu(page);
  await page.locator('#bulk-toggle').click();
  await expect(page.locator('#list-menu')).toBeHidden();
}

async function openOverflowMenu(page) {
  await page.locator('#overflow-btn').click();
  await expect(page.locator('#overflow-menu')).toBeVisible();
}

async function openBackupMenu(page) {
  await page.locator('#backup-chip').click();
  await expect(page.locator('#backup-menu')).toBeVisible();
}

async function openTagManagerViaMenu(page) {
  await openListMenu(page);
  await page.locator('#manage-tags').click();
  await expect(page.locator('#tag-manager-dialog')).toBeVisible();
}

// Encrypts a payload with the app's own crypto, so share tests run real
// decryption against a stubbed API.
async function makeShare(page, payload) {
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadCrypto);
  return page.evaluate(async (p) => {
    const C = window.ScratchpadCrypto;
    const key = await C.generateShareKey();
    return { envelope: await C.encryptShare(p, key), key: await C.exportShareKey(key) };
  }, payload);
}

async function stubShare(page, envelope, options = {}) {
  const { expiresAt = Date.now() + 86400000, status = 200 } = options;
  await page.route('**/api/share/*', (routeCall) =>
    routeCall.fulfill({
      status,
      contentType: 'application/json',
      body: status === 200 ? JSON.stringify({ ...envelope, expiresAt }) : JSON.stringify({ error: 'nope' }),
    }),
  );
}

// Records DELETE /api/share/<id> calls and answers them with `status`.
async function stubRevoke(page, options = {}) {
  const { status = 204 } = options;
  const seen = [];
  await page.route('**/api/share/*', (routeCall) => {
    const req = routeCall.request();
    if (req.method() !== 'DELETE') return routeCall.continue();
    seen.push({ url: req.url(), token: req.headers()['x-revoke-token'] });
    if (status === 0) return routeCall.abort();
    routeCall.fulfill({ status, contentType: 'application/json', body: '' });
  });
  return seen;
}

// Seeds a live share row directly, the state a note is in after a link was
// created in some earlier session.
async function seedShareRow(page, noteId, shareId) {
  await page.evaluate(
    ({ noteId, shareId }) =>
      window.ScratchpadDB.putShare({
        id: shareId,
        noteId,
        key: 'k'.repeat(43),
        revokeToken: 'revoke-token-' + shareId,
        sharedAt: Date.now(),
        expiresAt: Date.now() + 7 * 86400000,
        titleAtShare: 'Shared',
      }),
    { noteId, shareId },
  );
}

module.exports = {
  gotoApp,
  seedNotes,
  seedRawNotes,
  createAndSaveNote,
  importJson,
  seedFolders,
  openListMenu,
  enterBulkMode,
  openOverflowMenu,
  openBackupMenu,
  openTagManagerViaMenu,
  makeShare,
  stubShare,
  stubRevoke,
  seedShareRow,
};
