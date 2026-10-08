// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

const LONG = Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1} fills the page.`).join('\n\n');

/** @param {import('@playwright/test').Page} page */
async function seedPair(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedRawNotes(page, [
    { id: 'short', title: 'Short note', body: 'A short note.', updatedAt: 1 },
    { id: 'long', title: 'Long note', body: LONG, updatedAt: 2 },
  ]);
}

/** @param {import('@playwright/test').Page} page @param {string} id */
function storedRead(page, id) {
  return page.evaluate((noteId) => {
    const place = JSON.parse(localStorage.getItem('scratchpad:place') || '{}');
    const entry = place[noteId];
    return entry && typeof entry.read === 'number' ? entry.read : 0;
  }, id);
}

/** @param {import('@playwright/test').Page} page @param {string} id */
async function openNote(page, id) {
  await page.locator(`.note-row[data-id="${id}"] .note-row-open`).click();
  await expect(page.locator('#editor-view')).toBeVisible();
}

test('returning to a note restores the reading scroll', async ({ page }) => {
  await seedPair(page);
  const card = page.locator('.editor-card');
  await card.evaluate((el) => {
    el.scrollTop = 700;
  });
  await expect.poll(() => storedRead(page, 'long')).toBeGreaterThan(400);
  await openNote(page, 'short');
  await openNote(page, 'long');
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeGreaterThan(400);
});

test('two notes keep different reading places', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const body = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of this note.`).join('\n\n');
  await seedRawNotes(page, [
    { id: 'a', title: 'Note A', body, updatedAt: 1 },
    { id: 'b', title: 'Note B', body, updatedAt: 2 },
  ]);
  const card = page.locator('.editor-card');
  await card.evaluate((el) => {
    el.scrollTop = 900;
  });
  await expect.poll(() => storedRead(page, 'b')).toBeGreaterThan(700);
  await openNote(page, 'a');
  await card.evaluate((el) => {
    el.scrollTop = 280;
  });
  await expect.poll(() => storedRead(page, 'a')).toBeGreaterThan(200);
  await openNote(page, 'b');
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeGreaterThan(700);
  await openNote(page, 'a');
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeLessThan(360);
});

test('a reload opens the note where you left it', async ({ page }) => {
  await seedPair(page);
  const card = page.locator('.editor-card');
  await card.evaluate((el) => {
    el.scrollTop = 640;
  });
  await expect.poll(() => storedRead(page, 'long')).toBeGreaterThan(400);
  await page.reload();
  await expect(page.locator('#note-title-display')).toHaveText('Long note');
  await expect.poll(() => card.evaluate((el) => el.scrollTop)).toBeGreaterThan(400);
});

async function rememberEditPlace(page, offset) {
  const editor = page.locator('#note-editor');
  await editor.evaluate((el, pos) => {
    const field = /** @type {HTMLTextAreaElement} */ (el);
    field.focus();
    field.setSelectionRange(pos, pos);
    field.scrollTop = 150;
  }, offset);
  // Firefox scrolls a focused caret into view on a later frame. Put the
  // scroll back after that, which is the position a reader can actually keep.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await editor.evaluate((el) => {
    const field = /** @type {HTMLTextAreaElement} */ (el);
    field.scrollTop = 150;
    field.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('selectionchange'));
  });
  return editor;
}

test('editing remembers the caret and the edit scroll', async ({ page }) => {
  await seedPair(page);
  await page.locator('#edit-btn').click();
  const offset = LONG.indexOf('Paragraph 40');
  const editor = await rememberEditPlace(page, offset);
  await expect.poll(() => editor.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect.poll(() => editor.evaluate((el) => el.scrollTop)).toBeLessThan(220);
  await page.locator('#save-btn').click();
  await expect(page.locator('#save-btn')).toBeHidden();
  await openNote(page, 'short');
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').evaluate((el) => {
    const field = /** @type {HTMLTextAreaElement} */ (el);
    field.setSelectionRange(0, 0);
    field.scrollTop = 0;
  });
  await page.locator('#save-btn').click();
  await openNote(page, 'long');
  await page.locator('#edit-btn').click();
  await expect.poll(() => editor.evaluate((el) => /** @type {HTMLTextAreaElement} */ (el).selectionStart)).toBe(offset);
  await expect.poll(() => editor.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect.poll(() => editor.evaluate((el) => el.scrollTop)).toBeLessThan(220);
});

test('the first edit still starts at the top', async ({ page }) => {
  await seedPair(page);
  await page.locator('.editor-card').evaluate((el) => {
    el.scrollTop = 600;
  });
  await expect.poll(() => storedRead(page, 'long')).toBeGreaterThan(400);
  await page.locator('#edit-btn').click();
  const editor = page.locator('#note-editor');
  await expect.poll(() => editor.evaluate((el) => /** @type {HTMLTextAreaElement} */ (el).selectionStart)).toBe(0);
  await expect.poll(() => editor.evaluate((el) => el.scrollTop)).toBe(0);
});

test('the place stays out of the note record', async ({ page }) => {
  await seedPair(page);
  await page.locator('.editor-card').evaluate((el) => {
    el.scrollTop = 520;
  });
  await expect.poll(() => storedRead(page, 'long')).toBeGreaterThan(400);
  const note = await page.evaluate(async () => window.ScratchpadDB.get('long'));
  expect(note && note.place).toBeUndefined();
  expect(JSON.stringify(note)).not.toContain('scratchpad:place');
});

test('a burst of scroll events coalesces into one stored write', async ({ page }) => {
  await seedPair(page);
  const writes = await page.evaluate(async () => {
    let count = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'scratchpad:place') count += 1;
      return original.call(this, key, value);
    };
    const card = document.querySelector('.editor-card');
    for (let step = 1; step <= 30; step += 1) {
      card.scrollTop = step * 20;
      card.dispatchEvent(new Event('scroll'));
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    Storage.prototype.setItem = original;
    return count;
  });
  expect(writes).toBe(1);
  await expect.poll(() => storedRead(page, 'long')).toBe(600);
});
