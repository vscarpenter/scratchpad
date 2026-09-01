// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('find bar lifecycle', () => {
  test('opens the find bar with Control+F only while editing', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-alpha', title: 'Find me once', body: 'alpha beta gamma' }]);

    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeHidden();

    await page.locator('.note-row[data-id="find-alpha"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeVisible();
    await expect(page.locator('#find-input')).toBeFocused();
  });

  test('Escape closes the bar and returns focus to the editor', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-escape', title: 'Escape hatch', body: 'needle in the note' }]);

    await page.locator('.note-row[data-id="find-escape"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-input')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#find-bar')).toBeHidden();
    await expect(page.locator('#note-editor')).toBeFocused();
  });
});

test.describe('find bar and edit mode', () => {
  test('leaving edit mode hides an open bar', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-leave', title: 'Stay or leave', body: 'still here' }]);

    await page.locator('.note-row[data-id="find-leave"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeVisible();

    // Save exits edit mode; the bar must not linger over view mode.
    await page.keyboard.press('Control+S');
    await expect(page.locator('#find-bar')).toBeHidden();
  });
});

test.describe('find bar matching', () => {
  test('counts matches and presents the current one as a native selection', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-count', title: 'Counter note', body: 'alpha beta alpha' }]);

    await page.locator('.note-row[data-id="find-count"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('alpha');

    await expect(page.locator('#find-count')).toHaveText('1 of 2');
    await expect(page.locator('#find-live')).toHaveText('1 of 2');
    const range = await page.evaluate(() => {
      const editor = document.getElementById('note-editor');
      return { start: editor.selectionStart, end: editor.selectionEnd };
    });
    expect(range).toEqual({ start: 0, end: 5 });
  });

  test('Enter and Shift+Enter cycle with wraparound', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-cycle', title: 'Cycle note', body: 'alpha beta alpha alpha' }]);

    await page.locator('.note-row[data-id="find-cycle"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('alpha');

    await page.keyboard.press('Enter');
    await expect(page.locator('#find-count')).toHaveText('2 of 3');
    await page.keyboard.press('Enter');
    await expect(page.locator('#find-count')).toHaveText('3 of 3');
    await page.keyboard.press('Enter');
    await expect(page.locator('#find-count')).toHaveText('1 of 3');
    await page.keyboard.press('Shift+Enter');
    await expect(page.locator('#find-count')).toHaveText('3 of 3');
  });
});

test.describe('find bar toggles', () => {
  test('the case chip makes matching case-sensitive and resets to the top', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-case', title: 'Case note', body: 'beta Beta beta' }]);

    await page.locator('.note-row[data-id="find-case"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('Beta');
    await expect(page.locator('#find-count')).toHaveText('1 of 3');

    await page.locator('#find-case-toggle').click();
    await expect(page.locator('#find-case-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#find-count')).toHaveText('1 of 1');
  });

  test('the regex chip matches patterns and invalid patterns show a quiet notice', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-regex', title: 'Regex note', body: 'alpha beta gamma' }]);

    await page.locator('.note-row[data-id="find-regex"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-regex-toggle').click();
    await page.locator('#find-input').fill('alp.a');
    await expect(page.locator('#find-count')).toHaveText('1 of 1');

    await page.locator('#find-input').fill('[');
    await expect(page.locator('#find-notice')).toBeVisible();
    await expect(page.locator('#find-notice')).toHaveText('Invalid pattern');
    await expect(page.locator('#find-count')).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(page.locator('#find-notice')).toBeVisible();
  });
});

test.describe('find bar counters track the note', () => {
  test('the counter updates when the note text changes', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-track', title: 'Track note', body: 'alpha beta' }]);

    await page.locator('.note-row[data-id="find-track"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('alpha');
    await expect(page.locator('#find-count')).toHaveText('1 of 1');

    // Type another match directly in the editor; the counter must follow.
    await page.locator('#note-editor').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' alpha');
    await expect(page.locator('#find-count')).toHaveText('1 of 2');
  });

  test('zero matches read as 0 of 0 and the counter hides for an empty query', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-zero', title: 'Zero note', body: 'alpha beta' }]);

    await page.locator('.note-row[data-id="find-zero"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('zzz');
    await expect(page.locator('#find-count')).toHaveText('0 of 0');

    await page.locator('#find-input').fill('');
    await expect(page.locator('#find-count')).toBeHidden();
  });
});

test.describe('find bar replacement', () => {
  test('replaces the focused match with cmd+enter, steps forward, and dirties the note', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-rep', title: 'Replace note', body: 'alpha beta alpha' }]);

    await page.locator('.note-row[data-id="find-rep"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('alpha');
    await page.locator('#find-replace-input').fill('REPL');

    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('#find-count')).toHaveText('1 of 1');
    const after = await page.evaluate(() => ({
      value: document.getElementById('note-editor').value,
      caret: document.getElementById('note-editor').selectionStart,
    }));
    expect(after.value).toBe('REPL beta alpha');
    expect(after.caret).toBe(4);
    await expect(page.locator('#dirty-indicator')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('#find-count')).toHaveText('0 of 0');
    await page.keyboard.press('Control+S');
    await expect(page.locator('#note-rendered')).toContainText('REPL beta REPL');
  });
});

test.describe('find bar replace all', () => {
  test('replace all rewrites every match, toasts the count, and disables at zero', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-all', title: 'All note', body: 'alpha beta alpha alpha' }]);

    await page.locator('.note-row[data-id="find-all"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('alpha');
    await page.locator('#find-replace-input').fill('X');
    await page.locator('#find-replace-all-btn').click();

    await expect(page.locator('#note-editor')).toHaveValue('X beta X X');
    await expect(page.locator('.toast')).toContainText('Replaced 3 occurrences');
    await expect(page.locator('#find-count')).toHaveText('0 of 0');

    await page.locator('#find-input').fill('zzz');
    await expect(page.locator('#find-replace-all-btn')).toBeDisabled();
  });
});

test.describe('find bar replace modes', () => {
  test('regex capture references work and literal mode inserts them verbatim', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-cap', title: 'Capture note', body: 'user@example host' }]);

    await page.locator('.note-row[data-id="find-cap"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-regex-toggle').click();
    await page.locator('#find-input').fill('(\\w+)@example');
    await page.locator('#find-replace-input').fill('$1');
    await page.locator('#find-replace-all-btn').click();
    await expect(page.locator('#note-editor')).toHaveValue('user host');

    await page.locator('#find-regex-toggle').click();
    await page.locator('#find-input').fill('host');
    await page.locator('#find-replace-input').fill('$1');
    await page.locator('#find-replace-all-btn').click();
    await expect(page.locator('#note-editor')).toHaveValue('user $1');
  });

  test('an empty replacement deletes matches', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-del', title: 'Delete note', body: 'alpha beta' }]);

    await page.locator('.note-row[data-id="find-del"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await page.locator('#find-input').fill('alpha');
    await page.locator('#find-replace-all-btn').click();
    await expect(page.locator('#note-editor')).toHaveValue(' beta');
  });
});

test.describe('find bar accessibility', () => {
  test('exposes toolbar semantics, labeled controls, and pressed toggles', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-a11y', title: 'A11y note', body: 'alpha beta' }]);

    await page.locator('.note-row[data-id="find-a11y"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toHaveAttribute('role', 'toolbar');
    await expect(page.locator('#find-bar')).toHaveAccessibleName('Find in note');
    await expect(page.locator('#find-input')).toHaveAccessibleName('Find in note');
    await expect(page.locator('#find-replace-input')).toHaveAccessibleName('Replace with');
    await expect(page.locator('#find-close')).toHaveAccessibleName('Close find bar');
    await expect(page.locator('#find-case-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#find-case-toggle').click();
    await expect(page.locator('#find-case-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('find bar on narrow viewports', () => {
  test('keeps 44px targets and 16px inputs without horizontal overflow at 390px', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-mobile', title: 'Mobile note', body: 'alpha beta alpha' }]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.note-row[data-id="find-mobile"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeVisible();

    const px = (v) => Math.round(v || 0);
    for (const name of ['#find-input', '#find-case-toggle', '#find-regex-toggle', '#find-close']) {
      const box = await page.locator(name).boundingBox();
      expect.soft(px(box && box.height), `${name} height`).toBeGreaterThanOrEqual(44);
    }
    const font = await page.locator('#find-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(font).toBeGreaterThanOrEqual(16);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });

  test('stays available in focus mode', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-focus', title: 'Focus note', body: 'alpha beta alpha' }]);

    await page.locator('.note-row[data-id="find-focus"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+Shift+F');
    await page.keyboard.press('Control+F');
    await expect(page.locator('#find-bar')).toBeVisible();
    await page.locator('#find-input').fill('alpha');
    await expect(page.locator('#find-count')).toHaveText('1 of 2');
  });
});

test.describe('find bar in the command palette', () => {
  test('lists Find in note only while editing and opens from the palette', async ({ page }) => {
    await gotoApp(page);
    await seedRawNotes(page, [{ id: 'find-palette', title: 'Palette target', body: 'body text' }]);

    await page.keyboard.press('Control+Shift+P');
    await page.locator('#command-palette-input').fill('find in note');
    await expect(page.locator('#command-palette-list [role="option"]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.locator('.note-row[data-id="find-palette"]').click();
    await page.locator('#edit-btn').click();
    await page.keyboard.press('Control+Shift+P');
    await page.locator('#command-palette-input').fill('find in note');
    await expect(page.locator('#command-palette-list [role="option"]')).toHaveCount(1);
    await expect(page.locator('#command-palette-list [role="option"]').first()).toContainText('Find in note');

    await page.keyboard.press('Enter');
    await expect(page.locator('#find-bar')).toBeVisible();
    await expect(page.locator('#find-input')).toBeFocused();
  });
});
