// @ts-check
const { expect } = require('@playwright/test');

async function gotoApp(page) {
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

async function createAndSaveNote(page, title, body) {
  await page.locator('#new-note').click();
  await expect(page.locator('#note-editor')).toBeVisible();
  await page.locator('#note-title-input').fill(title);
  await page.locator('#note-editor').fill(body);
  await page.locator('#save-btn').click();
  await expect(page.locator('#save-btn')).toBeHidden();
}

module.exports = { gotoApp, seedNotes, createAndSaveNote };
