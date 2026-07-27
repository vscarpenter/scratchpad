// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

const STATIC_PAGES = [
  { path: '/about.html', heading: /Your thoughts[\s\S]*Your browser[\s\S]*Your business/i },
  { path: '/guide.html', heading: /How to use Scratchpad/i },
  { path: '/privacy.html', heading: /Your notes stay on/i },
  { path: '/terms.html', heading: /Plain-language terms/i },
];

test.describe('print stylesheet — app shell', () => {
  test('printing an open note hides chrome but keeps the title and body', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Printable note', 'Body text that should survive print.');

    await page.emulateMedia({ media: 'print' });

    // Chrome: sidebar and the editor header (back/breadcrumb/pin/share/
    // edit/save/overflow) must not print.
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('.editor-head')).toBeHidden();
    await expect(page.locator('#edit-btn')).toBeHidden();
    await expect(page.locator('#share-btn')).toBeHidden();
    await expect(page.locator('#pin-toggle')).toBeHidden();
    await expect(page.locator('#overflow-btn')).toBeHidden();

    // Content: the note's title and rendered markdown body must print.
    await expect(page.locator('#note-title-display')).toBeVisible();
    await expect(page.locator('#note-title-display')).toHaveText('Printable note');
    await expect(page.locator('#note-rendered')).toBeVisible();
    await expect(page.locator('#note-rendered')).toContainText('Body text that should survive print.');
  });

  test('backlinks, toasts, and the tag-add controls do not print', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Chrome check', 'Checking hidden chrome elements.');

    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('#backlinks-section')).toBeHidden();
    await expect(page.locator('#toast-region')).toBeHidden();
    await expect(page.locator('#tag-add-empty')).toBeHidden();
    await expect(page.locator('#tag-add-plus')).toBeHidden();
  });

  test('screen media is restored after print emulation (no screen regression)', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Back to screen', 'Should render normally again.');

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#sidebar')).toBeHidden();

    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('.editor-head')).toBeVisible();
    await expect(page.locator('#edit-btn')).toBeVisible();
  });

  for (const pageInfo of STATIC_PAGES) {
    test(`${pageInfo.path} still renders its content under print emulation`, async ({ page }) => {
      await page.goto(pageInfo.path);
      await page.emulateMedia({ media: 'print' });

      await expect(page.locator('h1')).toContainText(pageInfo.heading);
      await expect(page.locator('h1')).toBeVisible();
    });
  }
});
