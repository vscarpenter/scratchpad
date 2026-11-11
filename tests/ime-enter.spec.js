// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, openCommandPalette } = require('./helpers');

// An IME confirms a conversion candidate with Enter. That keydown reports
// isComposing, or keyCode 229 in Safari, which fires it after compositionend.
const CONFIRMING_ENTER = [
  { name: 'isComposing', init: { isComposing: true } },
  { name: 'keyCode 229', init: { keyCode: 229 } },
];

async function pressConfirmingEnter(locator, init) {
  await locator.evaluate((node, extra) => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...extra }));
  }, init);
  // A wrongly accepted Enter closes its dialog a tick later, so give it room
  // to happen before asserting that nothing did.
  await locator.page().waitForTimeout(250);
}

for (const { name, init } of CONFIRMING_ENTER) {
  test(`quick capture ignores an IME-confirming Enter (${name})`, async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+Shift+Space');
    const input = page.locator('#quick-capture-input');
    await input.fill('ぎんこう');
    await pressConfirmingEnter(input, init);
    await expect(page.locator('#quick-capture-dialog')).toBeVisible();
    await expect(input).toHaveValue('ぎんこう');
  });

  test(`command palette ignores an IME-confirming Enter (${name})`, async ({ page }) => {
    await gotoApp(page);
    await openCommandPalette(page);
    const input = page.locator('#command-palette-input');
    await input.fill('capture');
    await pressConfirmingEnter(input, init);
    await expect(page.locator('#command-palette-dialog')).toBeVisible();
    await expect(page.locator('#quick-capture-dialog')).toBeHidden();
  });
}

test('a plain Enter still submits quick capture', async ({ page }) => {
  await gotoApp(page);
  await page.keyboard.press('Control+Shift+Space');
  await page.locator('#quick-capture-input').fill('remember the milk');
  await page.keyboard.press('Enter');
  await expect(page.locator('#quick-capture-dialog')).toBeHidden();
});
