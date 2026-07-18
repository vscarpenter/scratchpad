// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('command palette', () => {
  test('opens from the keyboard and switches to a matching note', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-alpha', title: 'Alpha field notes', body: 'First note.' },
      { id: 'palette-beta', title: 'Beta launch plan', body: 'Second note.' },
    ]);

    await page.keyboard.press('Meta+Shift+P');
    await expect(page.locator('#command-palette-dialog')).toBeVisible();

    await page.locator('#command-palette-input').fill('beta launch');
    await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Beta launch plan');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('#note-title-display')).toHaveText('Beta launch plan');
  });

  test('runs a filtered command', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-existing', title: 'Existing note', body: 'Body.' },
    ]);

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('new note');
    await page.keyboard.press('Enter');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-count')).toHaveText('2');
  });

  test('navigates results with the arrow keys and clamps at the ends', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'nav-alpha', title: 'Zqx alpha', body: 'Body.' },
      { id: 'nav-beta', title: 'Zqx beta', body: 'Body.' },
      { id: 'nav-gamma', title: 'Zqx gamma', body: 'Body.' },
    ]);

    await page.locator('#command-palette-btn').click();
    const input = page.locator('#command-palette-input');
    await input.fill('zqx');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(input).toBeFocused();
    await expect(page.locator('#command-palette-list [role="option"]')).toHaveCount(3);
    await expect(page.locator('#command-palette-list [role="option"]').first()).toHaveClass(/is-active/);
    const firstOptionId = await page.locator('#command-palette-list [role="option"]').first().getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', firstOptionId);
    await expect(page.locator('#command-palette-list button[role="option"]')).toHaveCount(0);

    // Clamp at the top: ArrowUp from the first item stays on the first item.
    await input.press('ArrowUp');
    await expect(page.locator('#command-palette-list [role="option"]').first()).toHaveClass(/is-active/);

    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await expect(page.locator('#command-palette-list [role="option"]').nth(2)).toHaveClass(/is-active/);
    const lastOptionId = await page.locator('#command-palette-list [role="option"]').nth(2).getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', lastOptionId);
    await expect(input).toBeFocused();

    // Clamp at the bottom: one more ArrowDown keeps the last item active.
    await input.press('ArrowDown');
    await expect(page.locator('#command-palette-list [role="option"]').nth(2)).toHaveClass(/is-active/);

    // Notes are ordered most-recently-updated first, so the seeded list
    // (alpha oldest → gamma newest) appears as gamma, beta, alpha.
    await page.locator('#command-palette-input').press('Enter');
    await expect(page.locator('#note-title-display')).toHaveText('Zqx alpha');
  });

  test('shows an empty state when no command or note matches the query', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-only', title: 'Only note', body: 'Body.' },
    ]);

    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('zzz-no-such-thing-zzz');

    await expect(page.locator('#command-palette-empty')).toBeVisible();
    await expect(page.locator('#command-palette-list [role="option"]')).toHaveCount(0);
    await expect(page.locator('#command-palette-input')).not.toHaveAttribute('aria-activedescendant', /.+/);
    await expect(page.locator('#command-palette-status')).toHaveText('No commands or notes found.');
  });

  test('Escape closes only the palette while a note has unsaved edits', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'palette-dirty', title: 'Dirty note', body: 'Saved body.' },
    ]);
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('Unsaved body.');

    await page.locator('#command-palette-btn').click();
    const input = page.locator('#command-palette-input');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await input.press('Escape');

    await expect(page.locator('#command-palette-dialog')).toBeHidden();
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-editor')).toHaveValue('Unsaved body.');
    await expect(page.locator('#discard-dialog')).toBeHidden();
  });
});
