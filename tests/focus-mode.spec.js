// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('focus mode — distraction-free writing', () => {
  test('palette toggle hides sidebar and editor chrome, and shows the exit button', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'focus-target', title: 'Hub note', body: 'hub body', tags: ['work'] },
      { id: 'focus-linker', title: 'Linker note', body: 'see [[Hub note]]' },
    ]);
    await page.locator('.note-row[data-id="focus-target"]').click();

    // Sanity check: the chrome we're about to hide is actually showing first.
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#note-breadcrumb')).toBeVisible();
    await expect(page.locator('#note-byline')).toBeVisible();
    await expect(page.locator('#tag-bar')).toBeVisible();
    await expect(page.locator('#backlinks-section')).toBeVisible();
    await expect(page.locator('#focus-exit-btn')).toBeHidden();

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('focus mode');
    await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Enter focus mode');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#focus-exit-btn')).toBeVisible();

    // Non-essential chrome is gone…
    await expect(page.locator('#note-breadcrumb')).toBeHidden();
    await expect(page.locator('#note-byline')).toBeHidden();
    await expect(page.locator('#tag-bar')).toBeHidden();
    await expect(page.locator('#backlinks-section')).toBeHidden();

    // …but the title, edit control, and rendered body stay.
    await expect(page.locator('#note-title-display')).toHaveText('Hub note');
    await expect(page.locator('#edit-btn')).toBeVisible();
    await expect(page.locator('#note-rendered')).toContainText('hub body');
  });

  test('running the palette command again exits focus mode and restores the sidebar', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'focus-toggle-back', title: 'Toggle back', body: 'body text' }]);
    await page.locator('.note-row[data-id="focus-toggle-back"]').click();

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('focus mode');
    await page.keyboard.press('Enter');
    await expect(page.locator('#sidebar')).toBeHidden();

    // The palette trigger button lives in the (now hidden) sidebar, so
    // reopen it from the keyboard instead of clicking the button.
    await page.keyboard.press('Control+Shift+P');
    await page.locator('#command-palette-input').fill('focus mode');
    await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Exit focus mode');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#note-breadcrumb')).toBeVisible();
    await expect(page.locator('#focus-exit-btn')).toBeHidden();
  });

  test('the floating exit button leaves focus mode', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'focus-exit-button', title: 'Exit via button', body: 'body text' }]);
    await page.locator('.note-row[data-id="focus-exit-button"]').click();

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('focus mode');
    await page.keyboard.press('Enter');
    await expect(page.locator('#sidebar')).toBeHidden();

    await page.locator('#focus-exit-btn').click();

    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#focus-exit-btn')).toBeHidden();
  });

  test('keyboard shortcut round-trips focus mode on and off', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'focus-keyboard', title: 'Keyboard note', body: 'body text' }]);
    await page.locator('.note-row[data-id="focus-keyboard"]').click();

    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#focus-exit-btn')).toBeVisible();

    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#focus-exit-btn')).toBeHidden();
  });

  test('editing and saving a note works normally in focus mode', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'focus-edit', title: 'Edit note', body: 'Original body.' }]);
    await page.locator('.note-row[data-id="focus-edit"]').click();

    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('#sidebar')).toBeHidden();

    await page.locator('#edit-btn').click();
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#editor-format')).toBeVisible();
    await expect(page.locator('#save-btn')).toBeVisible();

    await page.locator('#note-editor').fill('Updated body from focus mode.');
    await page.locator('#save-btn').click();

    await expect(page.locator('#save-btn')).toBeHidden();
    await expect(page.locator('#note-rendered')).toContainText('Updated body from focus mode.');

    // The save didn't disturb focus mode itself.
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeHidden();

    const saved = await page.evaluate(async () => window.ScratchpadDB.get('focus-edit'));
    expect(saved.body).toBe('Updated body from focus mode.');
  });

  test('reload always starts out of focus mode', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'focus-reload', title: 'Reload note', body: 'body text' }]);
    await page.locator('.note-row[data-id="focus-reload"]').click();

    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('#sidebar')).toBeHidden();

    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#focus-exit-btn')).toBeHidden();
  });
});
