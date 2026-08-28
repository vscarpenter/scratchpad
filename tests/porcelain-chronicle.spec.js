// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

function localDateKey(date) {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

async function shellStyles(page) {
  return page.evaluate(() => {
    const styles = (selector) => getComputedStyle(document.querySelector(selector));
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const token = (name) => {
      probe.style.background = `var(${name})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const surface = (selector) => {
      const style = styles(selector);
      return {
        background: style.backgroundColor,
        radius: style.borderRadius,
        shadow: style.boxShadow,
        filter: style.backdropFilter || style.webkitBackdropFilter || 'none',
      };
    };
    const result = {
      shell: { gap: styles('#app-shell').gap, padding: styles('#app-shell').padding },
      sidebar: surface('#sidebar'),
      main: surface('#main'),
      editor: surface('.editor-card'),
      rail: surface('#chronicle-rail'),
      tokens: {
        list: token('--surface-list'),
        stage: token('--surface-document-stage'),
        document: token('--surface-document'),
        rail: token('--surface-rail'),
      },
    };
    probe.remove();
    return result;
  });
}

test.describe('Porcelain Chronicle shell', () => {
  test('renders five recent dates and opens or creates the chosen daily note', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const now = new Date();
    const today = localDateKey(now);
    await seedRawNotes(page, [
      {
        id: 'today-daily',
        title: 'Today',
        body: 'Today body.',
        dailyDate: today,
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
      },
    ]);

    const rail = page.locator('#chronicle-rail');
    await expect(rail).toBeVisible();
    await expect(page.locator('#chronicle-days .chronicle-day')).toHaveCount(5);
    await expect(page.locator(`#chronicle-days [data-date="${today}"]`)).toHaveAttribute('aria-current', 'date');

    const prior = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const priorKey = localDateKey(prior);
    await page.locator(`#chronicle-days [data-date="${priorKey}"]`).click();

    await expect
      .poll(async () =>
        page.evaluate(async (key) => {
          const notes = await window.ScratchpadDB.getAll();
          return notes.filter((note) => note.dailyDate === key).length;
        }, priorKey),
      )
      .toBe(1);
    await expect(page.locator(`#chronicle-days [data-date="${priorKey}"]`)).toHaveAttribute('aria-current', 'date');
  });

  test('uses the selected note date for the document spine', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const createdAt = new Date(2026, 6, 29, 12, 0, 0).getTime();
    await seedRawNotes(page, [
      {
        id: 'dated-note',
        title: 'Dated note',
        body: 'A note with a stable local creation date.',
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    await expect(page.locator('#editor-date-spine')).toBeVisible();
    await expect(page.locator('#editor-date-number')).toHaveText('29');
    await expect(page.locator('#editor-date-day')).toHaveText('Wed');
    await expect(page.locator('#chronicle-list-date')).toContainText('July 29');
  });

  test('keeps all three desktop regions inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedRawNotes(
      page,
      Array.from({ length: 30 }, (_, index) => ({
        id: `chronicle-${index}`,
        title: `Chronicle note ${index}`,
        body: `Body ${index}`,
      })),
    );

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

for (const width of [390, 768, 1440]) {
  test(`keeps the application shell flat at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedRawNotes(page, [{ id: `flat-${width}`, title: 'Flat shell', body: 'Document surface.' }]);
    const styles = await shellStyles(page);

    expect(styles.shell).toEqual({ gap: '0px', padding: '0px' });
    expect(styles.sidebar).toMatchObject({
      background: styles.tokens.list,
      radius: '0px',
      shadow: 'none',
      filter: 'none',
    });
    expect(styles.main).toMatchObject({
      background: styles.tokens.stage,
      radius: '0px',
      shadow: 'none',
      filter: 'none',
    });
    if (width >= 768) {
      expect(styles.editor.background).toBe(styles.tokens.document);
      expect(styles.editor.shadow).not.toBe('none');
    }
    if (width >= 900) expect(styles.rail.background).toBe(styles.tokens.rail);
  });
}

test('keeps intentional glass scoped to dialogs', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium exposes backdrop-filter through computed style.');
  await seedRawNotes(page, [{ id: 'dialog-glass', title: 'Dialog glass', body: 'Body.' }]);
  const filters = await page.evaluate(() => {
    const read = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return style.backdropFilter || style.webkitBackdropFilter || 'none';
    };
    return { shell: read('#main'), dialog: read('#about-dialog') };
  });
  expect(filters.shell).toBe('none');
  expect(filters.dialog).not.toBe('none');
});
