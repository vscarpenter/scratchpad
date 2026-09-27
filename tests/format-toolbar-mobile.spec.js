// @ts-check
const { test, expect, devices } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

// 375px is the narrowest common phone width and the one that clipped the pill.
test.use({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 } });

const LONG_BODY = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long note.`).join('\n\n');

test.describe('formatting toolbar on a phone', () => {
  test('keeps every chip on screen and sits above the field instead of over it', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'long-a', title: 'Long note', body: LONG_BODY }]);
    await page.locator('[data-id="long-a"]').click();
    await page.locator('#edit-btn').click();

    const toolbar = page.locator('#editor-format');
    await expect(toolbar).toBeVisible();
    const width = page.viewportSize()?.width ?? 0;

    for (const chip of await toolbar.locator('.fmt-chip').all()) {
      const box = await chip.boundingBox();
      if (!box) throw new Error('chip has no box');
      expect(box.x, 'chip starts on screen').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'chip ends on screen').toBeLessThanOrEqual(width + 0.5);
    }

    const pill = await toolbar.boundingBox();
    const field = await page.locator('#note-editor').boundingBox();
    if (!pill || !field) throw new Error('toolbar or field has no box');
    expect(pill.y + pill.height, 'toolbar bottom sits above the field').toBeLessThanOrEqual(field.y + 0.5);
  });
});
