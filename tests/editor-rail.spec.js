// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('editor rail — fixed top rail and floating format pill', () => {
  for (const width of [1000, 1920]) {
    test(`rail keeps one line and stable slots at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedRawNotes(page, [
        { id: 'rail-note', title: 'A reasonably long note title to stress the breadcrumb pill', body: 'Body text.' },
      ]);

      // Let the one-shot panel-rise entrance animation settle before measuring.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

      const head = page.locator('.editor-head');
      const readBox = await head.boundingBox();
      const readOverflow = await page.locator('#overflow-btn').boundingBox();

      await page.locator('#edit-btn').click();
      await expect(page.locator('#save-btn')).toBeVisible();

      const editBox = await head.boundingBox();
      const editOverflow = await page.locator('#overflow-btn').boundingBox();

      // Entering edit mode must not grow the rail or move its slots.
      expect(Math.abs(editBox.height - readBox.height)).toBeLessThanOrEqual(1);
      expect(editBox.height).toBeLessThanOrEqual(72);
      expect(Math.abs(editOverflow.x - readOverflow.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(editOverflow.y - readOverflow.y)).toBeLessThanOrEqual(1);
    });
  }

  test('format pill floats over the textarea only in edit mode', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'pill-note', title: 'Pill', body: 'First line stays readable.' },
    ]);

    await expect(page.locator('#editor-format')).toBeHidden();
    await page.locator('#edit-btn').click();

    const pill = page.locator('#editor-format');
    await expect(pill).toBeVisible();
    // The pill left the top rail for good.
    expect(await page.locator('.editor-head #editor-format').count()).toBe(0);

    // The textarea clears the pill: top padding keeps line one readable.
    const paddingTop = await page.locator('#note-editor')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
    expect(paddingTop).toBeGreaterThanOrEqual(26);
    const pillBox = await pill.boundingBox();
    const editorBox = await page.locator('#note-editor').boundingBox();
    expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(editorBox.y + paddingTop + 1);
  });

  test('H2, List, and Quote chips insert markdown', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'fmt-note', title: 'Fmt', body: 'seed' }]);

    await page.locator('#edit-btn').click();
    const editor = page.locator('#note-editor');

    await editor.fill('');
    await editor.click();
    await page.locator('#format-h2').click();
    await expect(editor).toHaveValue(/## Heading/);

    await editor.fill('');
    await editor.click();
    await page.locator('#format-list').click();
    await expect(editor).toHaveValue(/- List item/);

    await editor.fill('');
    await editor.click();
    await page.locator('#format-quote').click();
    await expect(editor).toHaveValue(/> Quote/);
  });
});
