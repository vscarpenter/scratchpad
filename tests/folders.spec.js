// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, createAndSaveNote } = require('./helpers');

test.describe('folders DB layer', () => {
  test('putFolder/getAllFolders/removeFolder round-trip', async ({ page }) => {
    await gotoApp(page);
    const names = await page.evaluate(async () => {
      await window.ScratchpadDB.putFolder({
        id: 'f-1', name: 'Work', color: 'olive', sortOrder: 0,
        parentId: null, createdAt: 1, updatedAt: 1,
      });
      await window.ScratchpadDB.bulkPutFolders([
        { id: 'f-2', name: 'Ideas', color: null, sortOrder: 1, parentId: null, createdAt: 2, updatedAt: 2 },
      ]);
      const all = (await window.ScratchpadDB.getAllFolders()).map((f) => f.name).sort();
      await window.ScratchpadDB.removeFolder('f-1');
      const after = (await window.ScratchpadDB.getAllFolders()).map((f) => f.name);
      return { all, after };
    });
    expect(names.all).toEqual(['Ideas', 'Work']);
    expect(names.after).toEqual(['Ideas']);
  });

  test('upgrade to v3 preserves existing notes', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'n-1', title: 'Kept', body: 'still here' }]);
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(count).toBe(1);
  });
});
