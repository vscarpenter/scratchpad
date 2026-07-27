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

test.describe('revision history — restore', () => {
  test('restoring an older (non-latest) revision applies its title and body, and the pre-restore state becomes the newest revision', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'multi-rev-note', title: 'Multi v0', body: 'Body v0' },
    ]);
    await page.locator('.note-row').first().click();

    for (const n of [1, 2, 3]) {
      await page.locator('#edit-btn').click();
      await page.locator('#note-title-input').fill('Multi v' + n);
      await page.locator('#note-editor').fill('Body v' + n);
      await page.locator('#save-btn').click();
      await expect(page.locator('#save-btn')).toBeHidden();
    }
    await expect(page.locator('#note-title-display')).toHaveText('Multi v3');

    // getRevisions() sorts newest-first, so the last row in the History
    // dialog is the oldest snapshot (title/body "v0").
    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await expect(page.locator('#history-list .history-row')).toHaveCount(3);
    await page.locator('#history-list .history-row button', { hasText: 'Restore' }).last().click();

    await expect(page.locator('#note-title-display')).toHaveText('Multi v0');
    await expect(page.locator('#note-rendered')).toContainText('Body v0');

    const revisions = await page.evaluate(async () =>
      window.ScratchpadDB.getRevisions('multi-rev-note')
    );
    expect(revisions).toHaveLength(4);
    // Newest-first: the pre-restore ("v3") state must be the newest entry.
    expect(revisions[0].title).toBe('Multi v3');
    expect(revisions[0].body).toBe('Body v3');
  });

  test('restoring a revision reapplies its tags and pinned state, not just title/body', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'tag-pin-note', title: 'Tag pin note', body: 'Original body', tags: ['keep'], pinned: false },
    ]);
    await page.locator('.note-row').first().click();

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Edited body');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-rendered')).toContainText('Edited body');

    await page.locator('#tag-add-plus').click();
    await page.locator('#tag-input').fill('added');
    await page.locator('#tag-input').press('Enter');
    await page.locator('#pin-toggle').click();
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by added' })).toBeVisible();

    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await page.locator('#history-list .history-row button', { hasText: 'Restore' }).first().click();

    await expect(page.locator('#note-rendered')).toContainText('Original body');
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by keep' })).toBeVisible();
    await expect(page.locator('#tag-pills').getByRole('button', { name: 'Filter by added' })).toHaveCount(0);

    const stored = await page.evaluate(async () => window.ScratchpadDB.get('tag-pin-note'));
    expect(stored.tags).toEqual(['keep']);
    expect(stored.pinned).toBe(false);
  });

  test('restoring while the editor has unsaved changes confirms before discarding them', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'dirty-guard-note', title: 'Dirty guard', body: 'Original body' },
    ]);
    await page.locator('.note-row').first().click();

    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Edited body');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-rendered')).toContainText('Edited body');

    // Leave dirty, unsaved edits in the editor before opening History.
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved dirty body');

    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await page.locator('#history-list .history-row button', { hasText: 'Restore' }).first().click();

    // Restoring must not silently clobber the unsaved draft.
    await expect(page.locator('#discard-dialog')).toBeVisible();
    await expect(page.locator('#history-dialog')).toBeHidden();
    await page.locator('#discard-dialog').getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved dirty body');

    // Trying again and confirming the discard lets the restore proceed.
    await page.locator('#overflow-btn').click();
    await page.locator('#history-btn').click();
    await page.locator('#history-list .history-row button', { hasText: 'Restore' }).first().click();
    await page.locator('#confirm-discard').click();

    await expect(page.locator('#note-editor')).toBeHidden();
    await expect(page.locator('#note-rendered')).toContainText('Original body');

    // The unsaved draft text must never have reached storage; the saved
    // ("Edited body") state before the restore should be the newest revision.
    const revisions = await page.evaluate(async () =>
      window.ScratchpadDB.getRevisions('dirty-guard-note')
    );
    expect(revisions.some((r) => r.body === 'Unsaved dirty body')).toBe(false);
    expect(revisions[0].body).toBe('Edited body');
  });
});
