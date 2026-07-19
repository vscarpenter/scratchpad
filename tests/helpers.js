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
      deletedAt: Number.isFinite(note.deletedAt) ? note.deletedAt : null,
      lastDraftAt: Number.isFinite(note.lastDraftAt) ? note.lastDraftAt : null,
      dailyDate: typeof note.dailyDate === 'string' ? note.dailyDate : null,
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

module.exports = { gotoApp, seedNotes, seedRawNotes, createAndSaveNote, importJson, seedFolders };
