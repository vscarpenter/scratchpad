const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

test.describe('local data erasure', () => {
  test('requires ERASE and clears notes, drafts, revisions, and app preferences', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Private note', 'Remove this everywhere');
    await page.evaluate(() => {
      localStorage.setItem('theme-preview', 'dark');
      localStorage.setItem('scratchpad:lastBackupAt', String(Date.now()));
      localStorage.setItem('scratchpad:backupReminderSnoozedUntil', String(Date.now() + 1000));
    });

    await page.locator('#open-about').click();
    await page.locator('#erase-local-data-btn').click();
    await page.locator('#erase-confirmation').fill('erase');
    await page.locator('#confirm-erase-local-data').click();

    await expect(page.locator('#erase-confirmation')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#erase-confirmation-error')).toContainText('Type ERASE');
    await expect(page.locator('#erase-local-data-dialog')).toBeVisible();

    await page.locator('#erase-confirmation').fill('ERASE');
    await page.locator('#confirm-erase-local-data').click();
    await expect(page).toHaveURL(/\/about\.html$/);
    await expect.poll(() => page.evaluate(() => ({
      theme: localStorage.getItem('theme-preview'),
      backup: localStorage.getItem('scratchpad:lastBackupAt'),
      snooze: localStorage.getItem('scratchpad:backupReminderSnoozedUntil'),
      visited: localStorage.getItem('scratchpad-visited'),
    }))).toEqual({ theme: null, backup: null, snooze: null, visited: null });

    await gotoApp(page);
    const counts = await page.evaluate(async () => ({
      notes: (await window.ScratchpadDB.getAll()).length,
      drafts: (await window.ScratchpadDB.getAllDrafts()).length,
      revisions: (await window.ScratchpadDB.getAllRevisions()).length,
    }));
    expect(counts).toEqual({ notes: 0, drafts: 0, revisions: 0 });
  });

  test('erasing revokes every live share link before the tokens are destroyed', async ({ page }) => {
    const revokes = [];
    await page.route('**/api/share/*', (routeCall) => {
      const req = routeCall.request();
      if (req.method() !== 'DELETE') return routeCall.continue();
      revokes.push({ url: req.url(), token: req.headers()['x-revoke-token'] });
      routeCall.fulfill({ status: 204, contentType: 'application/json', body: '' });
    });

    await gotoApp(page);
    await page.evaluate(async () => {
      for (const id of ['ShareAaaaaa1', 'ShareBbbbbb2']) {
        await window.ScratchpadDB.putShare({
          id,
          noteId: 'note-' + id,
          key: 'k'.repeat(43),
          revokeToken: 'revoke-token-' + id,
          sharedAt: Date.now(),
          expiresAt: Date.now() + 7 * 86400000,
          titleAtShare: 'Shared',
        });
      }
    });

    await page.locator('#open-about').click();
    await page.locator('#erase-local-data-btn').click();
    await page.locator('#erase-confirmation').fill('ERASE');
    await page.locator('#confirm-erase-local-data').click();

    await expect(page).toHaveURL(/\/about\.html$/);
    expect(revokes.map((r) => r.token).sort()).toEqual([
      'revoke-token-ShareAaaaaa1',
      'revoke-token-ShareBbbbbb2',
    ]);
  });

  test('a failed revoke asks before erasing; declining keeps the tokens', async ({ page }) => {
    await page.route('**/api/share/*', (routeCall) => {
      if (routeCall.request().method() !== 'DELETE') return routeCall.continue();
      routeCall.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await gotoApp(page);
    await page.evaluate(async () => {
      await window.ScratchpadDB.putShare({
        id: 'ShareAaaaaa1',
        noteId: 'note-1',
        key: 'k'.repeat(43),
        revokeToken: 'revoke-token-x',
        sharedAt: Date.now(),
        expiresAt: Date.now() + 7 * 86400000,
        titleAtShare: 'Shared',
      });
    });

    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss();
    });

    await page.locator('#open-about').click();
    await page.locator('#erase-local-data-btn').click();
    await page.locator('#erase-confirmation').fill('ERASE');
    await page.locator('#confirm-erase-local-data').click();

    // Declining the warning aborts the erase: no redirect, tokens intact.
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('could not be revoked');
    await expect(page).not.toHaveURL(/about\.html/);
    expect(await page.evaluate(() => window.ScratchpadDB.getAllShares())).toHaveLength(1);
  });

  test('visiting about.html normally does not erase local preferences', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Untouched note', 'Should survive a normal about.html visit');
    await page.evaluate(() => {
      localStorage.setItem('theme-preview', 'dark');
    });

    await page.goto('/about.html');
    await expect(page.locator('body')).toBeVisible();

    const state = await page.evaluate(() => ({
      theme: localStorage.getItem('theme-preview'),
      visited: localStorage.getItem('scratchpad-visited'),
      eraseFlag: sessionStorage.getItem('scratchpad:eraseComplete'),
    }));
    expect(state.theme).toBe('dark');
    expect(state.visited).toBe('1');
    expect(state.eraseFlag).toBeNull();

    await gotoApp(page);
    const noteCount = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(noteCount).toBe(1);
  });
});
