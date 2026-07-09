// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

async function selectEditorText(page, text) {
  await page.locator('#note-editor').evaluate((editor, selectedText) => {
    const start = editor.value.indexOf(selectedText);
    if (start === -1) throw new Error(`Text not found in editor: ${selectedText}`);
    editor.focus();
    editor.setSelectionRange(start, start + selectedText.length);
  }, text);
}

test.describe('notes — create, edit, persist', () => {
  test('creates a note and renders sanitized markdown', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Hello world', 'Body with **bold** text.');

    await expect(page.locator('#note-title-display')).toHaveText('Hello world');
    await expect(page.locator('#note-rendered strong')).toHaveText('bold');
    await expect(page.locator('#note-count')).toHaveText('1');
  });

  test('persists notes across reload (IndexedDB)', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Persisted', 'Survives reload.');

    await page.reload();
    await expect(page.locator('#note-count')).toHaveText('1');
    await page.locator('.note-row').first().click();
    await expect(page.locator('#note-title-display')).toHaveText('Persisted');
    await expect(page.locator('#note-rendered')).toContainText('Survives reload.');
  });

  test('pin toggle flips aria-pressed and persists', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Pin me', 'Pinned note body.');

    const pin = page.locator('#pin-toggle');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await page.locator('.note-row').first().click();
    await expect(page.locator('#pin-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('format toolbar applies markdown to selected editor text', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Formatting', 'alpha beta code link');

    await page.locator('#edit-btn').click();
    const editor = page.locator('#note-editor');
    const toolbar = page.getByRole('toolbar', { name: 'Markdown formatting' });
    const boldButton = toolbar.getByRole('button', { name: 'Bold', exact: true });
    const italicButton = toolbar.getByRole('button', { name: 'Italic', exact: true });
    const codeButton = toolbar.getByRole('button', { name: 'Code', exact: true });
    const linkButton = toolbar.getByRole('button', { name: 'Link', exact: true });
    await expect(toolbar).toBeVisible();
    await expect(boldButton).toBeEnabled();
    await expect(italicButton).toBeEnabled();
    await expect(codeButton).toBeEnabled();
    await expect(linkButton).toBeEnabled();

    await selectEditorText(page, 'alpha');
    await boldButton.click();
    await expect(editor).toHaveValue('**alpha** beta code link');

    await selectEditorText(page, 'beta');
    await italicButton.click();
    await expect(editor).toHaveValue('**alpha** *beta* code link');

    await selectEditorText(page, 'code');
    await codeButton.click();
    await expect(editor).toHaveValue('**alpha** *beta* `code` link');

    await selectEditorText(page, 'link');
    await linkButton.click();
    await expect(editor).toHaveValue('**alpha** *beta* `code` [link](https://example.com)');
    await expect(page.locator('#dirty-indicator')).toBeVisible();

    await page.locator('#save-btn').click();
    await expect(page.locator('#note-rendered strong')).toHaveText('alpha');
    await expect(page.locator('#note-rendered em')).toHaveText('beta');
    await expect(page.locator('#note-rendered code')).toHaveText('code');
    await expect(page.locator('#note-rendered a')).toHaveText('link');
    await expect(page.locator('#note-rendered a')).toHaveAttribute('href', 'https://example.com');
  });

  test('delete moves note to trash, then permanent delete clears it', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Doomed', 'Goodbye.');

    await page.locator('#overflow-btn').click();
    await page.locator('#delete-btn').click();
    await page.locator('#confirm-delete').click();

    await expect(page.locator('#note-count')).toHaveText('0');

    await page.locator('#trash-view').click();
    await expect(page.locator('.note-row')).toHaveCount(1);

    await page.locator('.note-row').first().click();
    await page.locator('#permanent-delete-btn').click();
    await page.locator('#confirm-permanent-delete').click();
    await expect(page.locator('.note-row')).toHaveCount(0);
  });
});
