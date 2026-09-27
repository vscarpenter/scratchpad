// @ts-check
const { test, expect } = require('@playwright/test');

// The seeded first run, three notes, is what every new user sees. The
// ceilings below are the measured layout after the sidebar tightened; before
// it the first row sat at 412px on desktop and 427px on a phone.
async function firstRun(page) {
  await page.goto('/');
  await page.locator('#app-shell').waitFor();
  await page.waitForFunction(() => !!window.ScratchpadDB);
  await expect(page.locator('.note-row').first()).toBeVisible();
}

async function firstRowTop(page) {
  const box = await page.locator('.note-row').first().boundingBox();
  if (!box) throw new Error('no note row');
  return box.y;
}

test.describe('sidebar height', () => {
  test('desktop: the first note starts high enough to read without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await firstRun(page);
    expect(await firstRowTop(page)).toBeLessThanOrEqual(335);
    await expect(page.locator('#today-note')).toBeVisible();
  });

  test('phone: the first note starts high enough to read without scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await firstRun(page);
    expect(await firstRowTop(page)).toBeLessThanOrEqual(350);
    await expect(page.locator('#today-note')).toBeVisible();
  });

  test('the Today row still opens today’s note', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await firstRun(page);
    await page.locator('#today-note').click();
    const opened = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      const daily = all.find((n) => n.dailyDate);
      const title = document.getElementById('note-title-display')?.textContent || '';
      return { hasDaily: !!daily, title, dailyTitle: daily ? daily.title : '' };
    });
    expect(opened.hasDaily).toBe(true);
    expect(opened.title).toBe(opened.dailyTitle);
  });
});
