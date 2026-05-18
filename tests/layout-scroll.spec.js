// @ts-check
const { test, expect } = require('@playwright/test');
const { seedNotes } = require('./helpers');

test.describe('sidebar layout — scroll containment', () => {
  test('sidebar stays within viewport when there are many notes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedNotes(page, 60);

    await expect(page.locator('#note-count')).toHaveText('60');

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport not set');

    const sidebar = page.locator('#sidebar');
    const box = await sidebar.boundingBox();
    if (!box) throw new Error('sidebar has no bounding box');

    // Tripwire from CLAUDE.md: body height cap + grid-template-rows: 1fr +
    // sidebar min-height: 0 must keep the sidebar bounded by the viewport.
    expect(box.height).toBeLessThanOrEqual(viewport.height + 1);

    // And the note-list inside it must actually be scrollable.
    const noteList = page.locator('#note-list');
    const scrollMetrics = await noteList.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  });
});
