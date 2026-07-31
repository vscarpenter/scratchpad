// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

function localDateKey(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

test.describe('Porcelain Chronicle shell', () => {
  test('renders five recent dates and opens or creates the chosen daily note', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const now = new Date();
    const today = localDateKey(now);
    await seedRawNotes(page, [{
      id: 'today-daily',
      title: 'Today',
      body: 'Today body.',
      dailyDate: today,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    }]);

    const rail = page.locator('#chronicle-rail');
    await expect(rail).toBeVisible();
    await expect(page.locator('#chronicle-days .chronicle-day')).toHaveCount(5);
    await expect(page.locator(`#chronicle-days [data-date="${today}"]`)).toHaveAttribute('aria-current', 'date');

    const prior = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const priorKey = localDateKey(prior);
    await page.locator(`#chronicle-days [data-date="${priorKey}"]`).click();

    await expect.poll(async () => page.evaluate(async (key) => {
      const notes = await window.ScratchpadDB.getAll();
      return notes.filter((note) => note.dailyDate === key).length;
    }, priorKey)).toBe(1);
    await expect(page.locator(`#chronicle-days [data-date="${priorKey}"]`)).toHaveAttribute('aria-current', 'date');
  });

  test('uses the selected note date for the document spine', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const createdAt = new Date(2026, 6, 29, 12, 0, 0).getTime();
    await seedRawNotes(page, [{
      id: 'dated-note',
      title: 'Dated note',
      body: 'A note with a stable local creation date.',
      createdAt,
      updatedAt: createdAt,
    }]);

    await expect(page.locator('#editor-date-spine')).toBeVisible();
    await expect(page.locator('#editor-date-number')).toHaveText('29');
    await expect(page.locator('#editor-date-day')).toHaveText('Wed');
    await expect(page.locator('#chronicle-list-date')).toContainText('July 29');
  });

  test('keeps all three desktop regions inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedRawNotes(page, Array.from({ length: 30 }, (_, index) => ({
      id: `chronicle-${index}`,
      title: `Chronicle note ${index}`,
      body: `Body ${index}`,
    })));

    const rail = await page.locator('#chronicle-rail').boundingBox();
    const sidebar = await page.locator('#sidebar').boundingBox();
    const main = await page.locator('#main').boundingBox();
    if (!rail || !sidebar || !main) throw new Error('Chronicle region missing');

    expect(rail.x + rail.width).toBeLessThanOrEqual(sidebar.x + 0.5);
    expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(main.x + 0.5);
    expect(main.x + main.width).toBeLessThanOrEqual(1280.5);
    expect(Math.max(rail.height, sidebar.height, main.height)).toBeLessThanOrEqual(720.5);
  });
});

test.describe('Porcelain Chronicle mobile', () => {
  test('hides the chronological rail and document spine in the one-pane flow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedRawNotes(page, [{ id: 'mobile-note', title: 'Mobile note', body: 'Mobile body.' }]);
    await expect(page.locator('#chronicle-rail')).toBeHidden();
    await page.locator('[data-id="mobile-note"]').click();
    await expect(page.locator('#editor-date-spine')).toBeHidden();
    await expect(page.locator('#note-title-display')).toHaveText('Mobile note');
  });
});
