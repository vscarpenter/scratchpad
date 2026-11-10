// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

async function resolveColor(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

async function openFindBar(page) {
  await seedRawNotes(page, [{ id: 'find', title: 'Find keys', body: 'alpha beta alpha gamma alpha' }]);
  await page.locator('.note-row[data-id="find"]').click();
  await page.locator('#edit-btn').click();
  await page.keyboard.press('Control+F');
  await expect(page.locator('#find-input')).toBeFocused();
}

test('Enter on a find bar toggle presses the toggle', async ({ page }) => {
  await openFindBar(page);
  const toggle = page.locator('#find-regex-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('the find input ignores an IME-confirming Enter', async ({ page }) => {
  await openFindBar(page);
  const input = page.locator('#find-input');
  await input.fill('alpha');
  const count = page.locator('#find-count');
  await expect(count).toBeVisible();
  const before = await count.textContent();
  await input.evaluate((node) => {
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }),
    );
  });
  await expect(count).toHaveText(before || '');
  await page.keyboard.press('Enter');
  await expect(count).not.toHaveText(before || '');
});

test('calendar days leave modified arrow keys to the browser', async ({ page }) => {
  await gotoApp(page);
  const allowed = await page.evaluate(() => {
    const day = /** @type {HTMLButtonElement} */ (document.querySelector('#calendar-body button[data-date]'));
    day.focus();
    return day.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }),
    );
  });
  expect(allowed).toBe(true);
});

test('the rail focus ring uses the solid accent', async ({ page }) => {
  await gotoApp(page);
  await page.keyboard.press('Tab');
  const item = page.locator('.workspace-item').first();
  await item.focus();
  const outline = await item.evaluate((node) => getComputedStyle(node).outlineColor);
  expect(outline).toBe(await resolveColor(page, '--accent'));
});

test('a menu item that opens a dialog hands focus back to the menu trigger', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'menu', title: 'Menu focus', body: 'Body' }]);
  await page.locator('.note-row[data-id="menu"]').click();
  await page.locator('#overflow-btn').click();
  await page.locator('#history-btn').click();
  await expect(page.locator('#history-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#history-dialog')).toBeHidden();
  await expect(page.locator('#overflow-btn')).toBeFocused();
});

test('a list menu item returns focus to the list menu button', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'menu', title: 'Menu focus', body: 'Body' }]);
  await page.locator('#list-menu-btn').click();
  await page.locator('#manage-tags').click();
  await expect(page.locator('#tag-manager-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#list-menu-btn')).toBeFocused();
});
