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

  test('sidebar action buttons all fit inside the sidebar', async ({ page }) => {
    await seedNotes(page, 3);
    const sidebar = await page.locator('#sidebar').boundingBox();
    if (!sidebar) throw new Error('sidebar has no bounding box');
    // Every action control must end inside the sidebar's right edge —
    // regression guard for the Today button overflowing the actions row
    // and clipping the About icon.
    for (const id of ['#new-note', '#today-note', '#command-palette-btn', '#open-about', '#theme-toggle']) {
      const box = await page.locator(id).boundingBox();
      if (!box) throw new Error(id + ' has no bounding box');
      expect(box.x + box.width, id + ' overflows sidebar').toBeLessThanOrEqual(sidebar.x + sidebar.width + 0.5);
    }
    // And the primary button must have room for one-line text.
    const newNote = await page.locator('#new-note').boundingBox();
    expect(newNote.width).toBeGreaterThanOrEqual(110);
  });

  test('sidebar header chrome stays within its 217px budget', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedNotes(page, 5);

    const head = await page.locator('.sidebar-head').boundingBox();
    if (!head) throw new Error('sidebar head has no bounding box');
    expect(head.height).toBeLessThanOrEqual(217);

    // The restored kicker carries the live note count and the privacy line.
    await expect(page.locator('.sidebar-kicker')).toBeVisible();
    await expect(page.locator('#note-count')).toHaveText('5');
    await expect(page.locator('.sidebar-kicker')).toContainText('local-only');
  });
});
