// @ts-check
const { test, expect } = require('@playwright/test');
const { seedFolders, seedRawNotes } = require('./helpers');

function menuCases(page) {
  const noPreparation = async () => {};
  return [
    ['list', noPreparation, '#list-menu-btn', '#list-menu', '#main'],
    ['editor overflow', noPreparation, '#overflow-btn', '#overflow-menu', '#main'],
    ['backup', noPreparation, '#backup-chip', '#backup-menu', '#main'],
    [
      'folder action',
      async () => page.locator('#folder-switcher-btn').click(),
      '[data-folder-id="menu-folder"] .folder-switcher-menu-btn',
      '#folder-menu',
      '#folder-switcher-search',
    ],
  ];
}

async function verifyMenuCase(page, menuCase) {
  const [name, prepare, triggerSelector, menuSelector, outsideSelector] = menuCase;
  await test.step(name, async () => {
    await prepare();
    const trigger = page.locator(triggerSelector);
    const menu = page.locator(menuSelector);
    const items = menu.locator('[role="menuitem"]:visible, [role="menuitemcheckbox"]:visible');

    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(items.first()).toBeFocused();
    expect(await items.count()).toBeGreaterThan(1);

    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(menu).toBeVisible();
    await page.locator(outsideSelector).click();
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
}

test.describe('shared action-menu behavior', () => {
  test('all four menus share focus, keyboard, ARIA, and outside-click behavior', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'menu-note', title: 'Menu note', body: 'Body.' }]);
    await seedFolders(page, [{ id: 'menu-folder', name: 'Menu folder' }]);
    for (const menuCase of menuCases(page)) await verifyMenuCase(page, menuCase);
  });
});
