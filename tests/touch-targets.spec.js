// @ts-check
const { test, expect, devices } = require('@playwright/test');
const { createAndSaveNote, gotoApp } = require('./helpers');

test.use({ ...devices['iPhone 13'] });

// Browsers report subpixel bounding boxes (e.g. 43.99998px for a 44px
// control in WebKit/Firefox); round to the nearest 0.1px so float noise
// cannot fail the 44px guideline check.
const px = (value) => (value == null ? 0 : Math.round(value * 10) / 10);

test.describe('accessibility — touch targets', () => {
  test('primary mobile controls expose at least 44px hit targets', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Tagged mobile note', 'Body.');

    await page.locator('#tag-add-empty').click();
    await page.locator('#tag-input').fill('mobile');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tag-pill-filter').first()).toBeVisible();

    const editorControls = [
      ['back to list', page.locator('#back-to-list')],
      ['edit', page.locator('#edit-btn')],
      ['tag filter pill', page.locator('.tag-pill-filter').first()],
      ['tag remove pill', page.locator('.tag-pill-remove').first()],
      ['tag input', page.locator('#tag-input')],
    ];

    for (const [name, locator] of editorControls) {
      await expect(locator, `${name} should be visible`).toBeVisible();
      const box = await locator.boundingBox();
      expect.soft(px(box && box.width), `${name} width`).toBeGreaterThanOrEqual(44);
      expect.soft(px(box && box.height), `${name} height`).toBeGreaterThanOrEqual(44);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#tag-add-plus')).toBeVisible();
    const plusBox = await page.locator('#tag-add-plus').boundingBox();
    expect.soft(px(plusBox && plusBox.width), 'add tag plus width').toBeGreaterThanOrEqual(44);
    expect.soft(px(plusBox && plusBox.height), 'add tag plus height').toBeGreaterThanOrEqual(44);

    // The floating format pill must keep 44px chips on coarse pointers.
    await page.locator('#edit-btn').click();
    await expect(page.locator('#editor-format')).toBeVisible();
    for (const id of ['#format-bold', '#format-h2', '#format-quote']) {
      const box = await page.locator(id).boundingBox();
      expect.soft(px(box && box.height), `${id} height`).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();

    await page.locator('#back-to-list').click();
    const listControls = [
      ['new note', page.locator('#new-note')],
      ['today note', page.locator('#today-note')],
      ['command palette', page.locator('#command-palette-btn')],
      ['active view', page.locator('#active-notes-view')],
      ['trash view', page.locator('#trash-view')],
      ['list menu trigger', page.locator('#list-menu-btn')],
      ['about button', page.locator('#open-about')],
      ['theme toggle', page.locator('#theme-toggle')],
    ];

    for (const [name, locator] of listControls) {
      await expect(locator, `${name} should be visible`).toBeVisible();
      const box = await locator.boundingBox();
      expect.soft(px(box && box.width), `${name} width`).toBeGreaterThanOrEqual(44);
      expect.soft(px(box && box.height), `${name} height`).toBeGreaterThanOrEqual(44);
    }

    const searchBox = await page.locator('.search-control').boundingBox();
    expect.soft(px(searchBox && searchBox.height), 'search field height').toBeGreaterThanOrEqual(44);

    // Tags, New folder, and Select live in the list overflow menu now;
    // its items must keep 44px hit targets on coarse pointers too.
    await page.locator('#list-menu-btn').click();
    for (const id of ['#manage-tags', '#new-folder-menu-btn', '#bulk-toggle']) {
      const box = await page.locator(id).boundingBox();
      expect.soft(px(box && box.height), `${id} height`).toBeGreaterThanOrEqual(44);
    }
  });
});
