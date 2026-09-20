// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, enterBulkMode } = require('./helpers');

// A phone-sized viewport puts the list full width, where a swipe belongs.
test.use({ viewport: { width: 390, height: 844 } });

/**
 * Dispatches a drag on a note row. Playwright has no swipe API, and synthetic
 * pointer events reach the module the same way real ones do, in all three
 * browsers. Eight moves over 160 ms read as a deliberate drag, not a flick
 * past the rail.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {{ dx?: number, dy?: number, pointerType?: string }} options
 */
async function drag(page, id, options) {
  await page.evaluate(
    async ({ noteId, dx, dy, pointerType }) => {
      const row = /** @type {HTMLElement} */ (document.querySelector(`.note-row[data-id="${noteId}"]`));
      const box = row.getBoundingClientRect();
      const x0 = box.left + box.width / 2;
      const y0 = box.top + box.height / 2;
      /** @param {string} type @param {number} x @param {number} y */
      const fire = (type, x, y) =>
        row.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 7,
            pointerType,
            isPrimary: true,
            clientX: x,
            clientY: y,
          }),
        );
      const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
      fire('pointerdown', x0, y0);
      for (let i = 1; i <= 8; i++) {
        await tick();
        fire('pointermove', x0 + (dx * i) / 8, y0 + (dy * i) / 8);
      }
      await tick();
      fire('pointerup', x0 + dx, y0 + dy);
    },
    { noteId: id, dx: 0, dy: 0, pointerType: 'touch', ...options },
  );
}

/** @param {import('@playwright/test').Page} page */
async function seedTwo(page) {
  await seedRawNotes(page, [
    { id: 'swipe-a', title: 'Swipe A', body: 'Body A.' },
    { id: 'swipe-b', title: 'Swipe B', body: 'Body B.', pinned: true },
  ]);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
function stored(page, id) {
  return page.evaluate((noteId) => window.ScratchpadDB.get(noteId), id);
}

test.describe('swipe release rules', () => {
  test('resolveRelease picks closed, open, or commit', async ({ page }) => {
    await seedTwo(page);
    const results = await page.evaluate(() => {
      const resolve = window.ScratchpadSwipeRow.resolveRelease;
      const base = { railWidth: 152, rowWidth: 370, velocity: 0 };
      return [
        resolve({ ...base, offset: 40 }),
        resolve({ ...base, offset: 80 }),
        resolve({ ...base, offset: 230 }),
        resolve({ ...base, offset: 30, velocity: 0.3 }),
        resolve({ ...base, offset: 170, velocity: 0.8 }),
        resolve({ ...base, offset: 120, velocity: -0.3 }),
      ];
    });
    expect(results).toEqual(['closed', 'open', 'commit', 'open', 'commit', 'closed']);
  });
});

test.describe('swipe left on a note row', () => {
  test('a drag past half the rail opens Archive and Trash', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -100 });
    const rail = page.locator('.swipe-rail.is-trailing');
    await expect(rail.getByRole('button')).toHaveText(['Archive', 'Trash']);
    await expect(page.locator('.note-row[data-id="swipe-a"]')).toHaveClass(/is-swipe-open/);
    // The side that is not in play stays out of the accessibility tree.
    await expect(page.locator('.swipe-rail').getByRole('button', { name: 'Pin' })).toHaveCount(0);
  });

  test('a short drag settles closed and leaves no rail behind', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -14 });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
    await expect(page.locator('.note-row[data-id="swipe-a"]')).not.toHaveClass(/is-swipe-open/);
  });

  test('tapping Trash moves the note to Trash', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -100 });
    await page.locator('.swipe-rail').getByRole('button', { name: 'Trash' }).click();
    await expect(page.locator('.note-row[data-id="swipe-a"]')).toHaveCount(0);
    expect((await stored(page, 'swipe-a')).deletedAt).toEqual(expect.any(Number));
  });

  test('a full swipe archives, and Undo brings the note back', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -280 });
    await expect(page.locator('.note-row[data-id="swipe-a"]')).toHaveCount(0);
    expect((await stored(page, 'swipe-a')).archivedAt).toEqual(expect.any(Number));
    // The list stays put: a swipe never jumps to the Archive view.
    await expect(page.locator('#active-notes-view')).toHaveClass(/is-active/);

    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.note-row[data-id="swipe-a"]')).toBeVisible();
    expect((await stored(page, 'swipe-a')).archivedAt).toBeNull();
  });
});

test.describe('swipe right on a note row', () => {
  test('a drag opens Pin, and tapping it pins the note', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: 60 });
    await page.locator('.swipe-rail.is-leading').getByRole('button', { name: 'Pin', exact: true }).click();
    await expect.poll(async () => (await stored(page, 'swipe-a')).pinned).toBe(true);
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
  });

  test('a full swipe on a pinned note unpins it and keeps the row', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-b', { dx: 280 });
    await expect.poll(async () => (await stored(page, 'swipe-b')).pinned).toBe(false);
    await expect(page.locator('.note-row[data-id="swipe-b"]')).toBeVisible();
  });
});

test.describe('swipe guards', () => {
  test('a vertical drag and a mouse drag open nothing', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -20, dy: 120 });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
    await drag(page, 'swipe-a', { dx: -120, pointerType: 'mouse' });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
  });

  test('bulk mode and search results do not swipe', async ({ page }) => {
    await seedTwo(page);
    await page.locator('#search').fill('Swipe A');
    await expect(page.locator('.note-row.is-search-result')).toHaveCount(1);
    await drag(page, 'swipe-a', { dx: -120 });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);

    await page.locator('#search').fill('');
    await expect(page.locator('.note-row')).toHaveCount(2);
    await enterBulkMode(page);
    await drag(page, 'swipe-a', { dx: -120 });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
  });

  test('Trash rows do not swipe', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'swipe-t', title: 'Gone', body: 'x', deletedAt: Date.now() }]);
    await page.locator('#trash-view').click();
    await drag(page, 'swipe-t', { dx: -120 });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
  });
});

test.describe('swipe and taps', () => {
  test('the click that ends a swipe does not open the note', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -100 });
    await page.evaluate(() => {
      /** @type {HTMLElement} */ (document.querySelector('.note-row[data-id="swipe-a"] .note-row-open')).click();
    });
    await expect(page.locator('#app-shell')).toHaveClass(/mobile-list/);
  });

  test('a tap on an open row closes it and opens nothing', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -100 });
    await expect(page.locator('.swipe-rail:not([hidden])')).toHaveCount(1);
    await page.waitForTimeout(500);
    // The open row sits 152px to the left, so click inside its visible part.
    await page.locator('.note-row[data-id="swipe-a"]').click({ position: { x: 250, y: 20 } });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);
    await expect(page.locator('#app-shell')).toHaveClass(/mobile-list/);
  });

  test('opening a second row closes the first', async ({ page }) => {
    await seedTwo(page);
    await drag(page, 'swipe-a', { dx: -100 });
    await drag(page, 'swipe-b', { dx: -100 });
    await expect(page.locator('.swipe-rail.is-trailing')).toHaveCount(1);
    await expect(page.locator('.note-row.is-swipe-open')).toHaveAttribute('data-id', 'swipe-b');
  });
});

test.describe('swipe in the Archive view', () => {
  test('offers Unarchive and Trash, and no Pin', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'swipe-z', title: 'Old', body: 'x', archivedAt: Date.now() }]);
    await page.locator('#archive-view').click();
    await drag(page, 'swipe-z', { dx: 120 });
    await expect(page.locator('.swipe-rail')).toHaveCount(0);

    await drag(page, 'swipe-z', { dx: -100 });
    await expect(page.locator('.swipe-rail.is-trailing').getByRole('button')).toHaveText(['Unarchive', 'Trash']);
    await page.locator('.swipe-rail').getByRole('button', { name: 'Unarchive' }).click();
    await expect.poll(async () => (await stored(page, 'swipe-z')).archivedAt).toBeNull();
  });
});

test.describe('swipe while an edit is unsaved', () => {
  // A wide viewport shows the list beside the editor, the one layout where a
  // swipe can happen mid-edit.
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the action waits and the draft survives', async ({ page }) => {
    await seedTwo(page);
    await page.locator('.note-row[data-id="swipe-b"]').click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('unsaved words');

    await drag(page, 'swipe-a', { dx: -100 });
    await page.locator('.swipe-rail').getByRole('button', { name: 'Trash' }).click();
    await expect(page.locator('.toast', { hasText: 'Save or discard your edits first.' })).toBeVisible();
    expect((await stored(page, 'swipe-a')).deletedAt).toBeNull();
    await expect(page.locator('#note-editor')).toHaveValue('unsaved words');
  });
});
