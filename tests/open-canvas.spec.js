// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

test.use({ timezoneId: 'America/Chicago' });

const NOTES = [
  { id: 'writing', title: 'A writing day', body: '## First thoughts\n\nA quiet paragraph for reading and editing.' },
  { id: 'pin', title: 'Keep nearby', body: 'A pinned reference.', pinned: true },
  { id: 'archived', title: 'Old draft', body: 'Kept safely.', archivedAt: 1000 },
  { id: 'trashed', title: 'Removed draft', body: 'Recoverable.', deletedAt: Date.now() },
];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T18:00:00Z'));
});

test('persistent navigation scopes notes and opens existing folders', async ({ page }) => {
  await seedFolders(page, [{ id: 'work', name: 'Work' }]);
  await seedRawNotes(page, [...NOTES, { id: 'work-note', title: 'Work draft', body: 'Work.', folderId: 'work' }]);
  await expect(page.locator('#workspace-navigation')).toBeVisible();
  await page.locator('#nav-pinned').click();
  await expect(page.locator('.note-row')).toHaveCount(1);
  await expect(page.locator('.note-row')).toContainText('Keep nearby');
  await expect(page.locator('#nav-pinned')).toHaveAttribute('aria-current', 'page');
  await page.locator('.workspace-folder[data-folder-id="work"]').click();
  await expect(page.locator('.note-row')).toHaveCount(1);
  await expect(page.locator('.note-row')).toContainText('Work draft');
  await page.locator('#nav-archive').click();
  await expect(page.locator('.note-row')).toContainText('Old draft');
  await page.locator('#nav-trash').click();
  await expect(page.locator('.note-row')).toContainText('Removed draft');
  await page.locator('#nav-notes').click();
  await expect(page.locator('.note-row')).toHaveCount(3);
});

test('navigation protects an unsaved Markdown draft', async ({ page }) => {
  await seedRawNotes(page, NOTES);
  await page.locator('[data-id="writing"] .note-row-open').click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill('An unsaved thought.');
  await page.locator('#nav-pinned').click();
  await expect(page.locator('#discard-dialog')).toBeVisible();
  await page.locator('#discard-dialog .btn-secondary').click();
  await expect(page.locator('#note-editor')).toHaveValue('An unsaved thought.');
  await page.locator('#nav-pinned').click();
  await page.locator('#confirm-discard').click();
  await expect(page.locator('.note-row')).toHaveCount(1);
  await expect(page.locator('#note-editor')).toBeHidden();
});

test('entering Edit keeps the first user selection intact', async ({ page }) => {
  await seedRawNotes(page, NOTES);
  await page.evaluate(() => {
    document.getElementById('edit-btn').click();
    document.querySelector('textarea').select();
  });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const selected = await page.locator('#note-editor').evaluate((node) => ({
    selected: node.selectionEnd - node.selectionStart,
    length: node.value.length,
  }));
  expect(selected.selected).toBe(selected.length);
});

test('month browsing crosses years and opens each daily note only once', async ({ page }) => {
  await seedRawNotes(page, NOTES);
  await expect(page.locator('#chronicle-month')).toHaveText('November 2026');
  await page.locator('#calendar-next').click();
  await page.locator('#calendar-next').click();
  await expect(page.locator('#chronicle-month')).toHaveText('January 2027');
  const day = page.locator('#chronicle-days [data-date="2027-01-05"]');
  await page.locator('#nav-pinned').click();
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#nav-daily')).toHaveAttribute('aria-current', 'page');
  await day.click();
  expect(
    await page.evaluate(
      async () => (await window.ScratchpadDB.getAll()).filter((n) => n.dailyDate === '2027-01-05').length,
    ),
  ).toBe(1);
  await page.locator('#calendar-today').click();
  await expect(page.locator('#chronicle-month')).toHaveText('November 2026');
  await expect(page.locator('#chronicle-days [aria-current="date"]')).toHaveAttribute('data-date', '2026-11-10');
});

test('calendar keyboard focus moves across weeks and months without creating notes', async ({ page }) => {
  await seedRawNotes(page, NOTES);
  const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
  await page.locator('#chronicle-days [data-date="2026-11-10"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#chronicle-days [data-date="2026-11-11"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await expect(page.locator('#chronicle-days [data-date="2026-11-21"]')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(page.locator('#chronicle-days [data-date="2026-12-21"]')).toBeFocused();
  expect(await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length)).toBe(count);
});

for (const width of [375, 768, 1024, 1280, 1710]) {
  test(`keeps a usable open writing canvas at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedRawNotes(page, NOTES);
    await page.locator('[data-id="writing"] .note-row-open').click();
    const metrics = await page.locator('#note-rendered').evaluate((node) => {
      const card = getComputedStyle(document.querySelector('.editor-card'));
      const prose = getComputedStyle(node);
      return {
        width: node.clientWidth,
        font: prose.fontFamily,
        size: parseFloat(prose.fontSize),
        shadow: card.boxShadow,
        radius: card.borderRadius,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(metrics.width).toBeGreaterThanOrEqual(width < 768 ? 300 : 460);
    expect(metrics.font).toMatch(/Iowan Old Style|Palatino|Georgia/);
    expect(metrics.size).toBe(width < 768 ? 18 : 20);
    expect(metrics.shadow).toBe('none');
    expect(metrics.radius).toBe('0px');
    expect(metrics.overflow).toBe(false);
    if (width >= 768) await expect(page.locator('#workspace-navigation')).toBeVisible();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('## Saved\n\nA thought worth keeping.');
    await page.locator('#save-btn').click();
    await expect(page.locator('#note-rendered')).toContainText('A thought worth keeping.');
    if (width < 1100) {
      await page.locator('#back-to-list').click();
      await expect(page.locator('#sidebar')).toBeVisible();
      await expect(page.locator('#main')).toBeHidden();
    }
  });
}

test('phone navigation is modal, dismisses with Escape, and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedRawNotes(page, NOTES);
  const trigger = page.locator('#navigation-toggle');
  await expect(page.locator('#calendar-body')).toBeHidden();
  await trigger.click();
  await expect(page.locator('#navigation-dialog')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#navigation-dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('#nav-pinned').click();
  await expect(page.locator('#navigation-dialog')).toBeHidden();
  await expect(page.locator('.note-row')).toHaveCount(1);
});

for (const width of [375, 768]) {
  test(`Home and unsaved editor controls remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await seedRawNotes(page, NOTES);
    if (width < 768) await page.locator('#navigation-toggle').click();
    await page.locator('#nav-home').click();
    await expect(page.locator('#home-desk')).toBeVisible();
    await page.locator('#home-back-to-list').click();
    await page.locator('[data-id="writing"] .note-row-open').click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('A thought still in progress.');
    for (const selector of ['#save-btn', '#overflow-btn']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    if (width < 768) {
      await page.locator('#editor-navigation-toggle').click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#discard-dialog')).toBeHidden();
      await expect(page.locator('#note-editor')).toHaveValue('A thought still in progress.');
    }
  });
}

test('calendar keyboard clamps month ends and includes leap day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2028-01-31T18:00:00Z'));
  await seedRawNotes(page, [{ id: 'leap', title: 'Winter', body: 'Notes.', dailyDate: '2028-01-31' }]);
  await page.locator('#chronicle-days [data-date="2028-01-31"]').focus();
  await page.keyboard.press('PageDown');
  await expect(page.locator('#chronicle-month')).toHaveText('February 2028');
  await expect(page.locator('#chronicle-days [data-date="2028-02-29"]')).toBeFocused();
  await expect(page.locator('#chronicle-days [tabindex="0"]')).toHaveCount(1);
});

test('navigation and calendar interactions stay entirely local', async ({ page }) => {
  await seedRawNotes(page, NOTES);
  await page.waitForLoadState('networkidle');
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.locator('#nav-pinned').click();
  await page.locator('#calendar-next').click();
  await page.locator('#chronicle-days button[data-date]').first().click();
  await page.locator('#nav-notes').click();
  await page.locator('#nav-home').click();
  await expect(page.locator('#home-desk')).toBeVisible();
  expect(requests).toEqual([]);
});
