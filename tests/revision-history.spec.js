// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('revision history — pruning', () => {
  test('keeps only the 10 most recent revisions per note', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'prune-note', title: 'Prune me', body: 'Body v0' },
    ]);

    await page.locator('.note-row').first().click();
    for (let i = 1; i <= 11; i += 1) {
      await page.locator('#edit-btn').click();
      await page.locator('#note-editor').fill('Body v' + i);
      await page.locator('#save-btn').click();
      await expect(page.locator('#save-btn')).toBeHidden();
    }

    const revisionCount = await page.evaluate(async () =>
      (await window.ScratchpadDB.getRevisions('prune-note')).length
    );
    expect(revisionCount).toBe(10);

    // The oldest snapshot (the pre-edit empty body) should have been pruned;
    // the most recent snapshot before the final save should remain.
    const bodies = await page.evaluate(async () =>
      (await window.ScratchpadDB.getRevisions('prune-note')).map((r) => r.body)
    );
    expect(bodies).not.toContain('Body v0');
    expect(bodies).toContain('Body v10');
  });

  test('restoring a revision snapshots the pre-restore content first', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'restore-note', title: 'Restore me', body: 'Original body' },
    ]);
    await page.locator('.note-row').first().click();

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Edited body');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-rendered')).toContainText('Edited body');

    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await page.locator('#history-list .history-row button', { hasText: 'Restore' }).first().click();
    await expect(page.locator('#note-rendered')).toContainText('Original body');

    // The pre-restore ("Edited body") state should now itself be a revision.
    const bodies = await page.evaluate(async () =>
      (await window.ScratchpadDB.getRevisions('restore-note')).map((r) => r.body)
    );
    expect(bodies).toContain('Edited body');
  });
});
