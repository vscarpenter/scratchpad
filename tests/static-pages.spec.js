// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = [
  { path: '/about.html', heading: /Your thoughts[\s\S]*Your browser[\s\S]*Your business/i },
  { path: '/guide.html', heading: /How to use Scratchpad/i },
  { path: '/privacy.html', heading: /Your notes stay on/i },
  { path: '/terms.html', heading: /Plain-language terms/i },
];

test.describe('shared static-page behavior', () => {
  for (const pageInfo of PAGES) {
    test(`${pageInfo.path} loads metadata, navigation, and persistent theme controls`, async ({ page }) => {
      await page.goto(pageInfo.path);
      await page.evaluate(() => localStorage.setItem('theme-preview', 'auto'));
      await page.reload();

      await expect(page.locator('h1')).toContainText(pageInfo.heading);
      await expect(page.locator('#app-version')).not.toHaveText('—');
      await expect(page.locator('#app-build-date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
      await expect(page.locator('.footer-nav a[href="about.html"]')).toBeAttached();
      await expect(page.locator('.footer-nav a[href="guide.html"]')).toBeAttached();
      await expect(page.locator('.footer-nav a[href="privacy.html"]')).toBeAttached();
      await expect(page.locator('.footer-nav a[href="terms.html"]')).toBeAttached();

      await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('#theme-label')).toHaveText('light');
    });
  }

  test('the theme control is a compact icon button on every content page', async ({ page }) => {
    // The pill nav renders the toggle as a small circular icon control; the
    // cycling state text stays for AT via the visually hidden #theme-label.
    for (const pageInfo of PAGES) {
      await page.goto(pageInfo.path);
      const toggle = page.locator('#theme-toggle');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', /theme/i);
      const box = await toggle.boundingBox();
      expect(box.width, `${pageInfo.path} theme toggle width`).toBeLessThan(48);
      expect(Math.abs(box.width - box.height), `${pageInfo.path} toggle squareness`).toBeLessThanOrEqual(2);
    }
  });

  test('the About call to action returns a visited user to the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/about.html');

    await page.locator('a.btn-primary[href="index.html"]').first().click();
    await expect(page).toHaveURL(/\/index\.html$/);
    await expect(page.locator('#app-shell')).toBeVisible();
  });
});

test.describe('site navigation', () => {
  for (const pageInfo of PAGES) {
    test(`${pageInfo.path} marks itself current in the pill nav`, async ({ page }) => {
      await page.goto(pageInfo.path);
      const nav = page.locator('.site-nav');
      await expect(nav).toBeVisible();
      await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', pageInfo.path.slice(1));
      await expect(nav.locator('a.site-nav-cta[href="index.html"]')).toHaveText('Open app');
      await expect(nav.locator('.site-nav-brand')).toBeVisible();
    });
  }

  test('the pill nav does not overflow a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/guide.html');
    await expect(page.locator('.site-nav')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, 'horizontal page overflow at 390px').toBe(false);
  });
});

// The About mockup is read as a picture of Scratchpad, so its sample note must
// not claim features the app doesn't have.
test('the About mockup claims no sync or pricing', async ({ page }) => {
  await page.goto('/about.html');
  const text = await page.locator('main').evaluate((main) => main.textContent || '');
  expect(text).not.toMatch(/\bsync\b/i);
  expect(text).not.toMatch(/\bpricing\b/i);
});

// Findings from the content-page design audit (2026-11-11).
/** @param {import('@playwright/test').Locator} heading */
const lineCount = (heading) =>
  heading.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set(
      [...range.getClientRects()].filter((rect) => rect.width > 1).map((rect) => Math.round(rect.top)),
    );
    return tops.size;
  });

for (const width of [1440, 768, 390, 320]) {
  test(`the About headline fits two lines at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/about.html');
    const heading = page.locator('h1');
    expect(await lineCount(heading)).toBeLessThanOrEqual(2);
    const clipped = await heading.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, `headline wider than its column at ${width}px`).toBe(false);
  });
}

test('no headline styles one phrase differently from the rest', async ({ page }) => {
  for (const pageInfo of PAGES) {
    await page.goto(pageInfo.path);
    await expect(page.locator('h1 em, h2 em'), `${pageInfo.path} accent phrase`).toHaveCount(0);
  }
});

test('the document pages open on the headline with no label above it', async ({ page }) => {
  for (const path of ['/guide.html', '/privacy.html', '/terms.html']) {
    await page.goto(path);
    await expect(page.locator('.privacy-card .eyebrow'), `${path} eyebrow`).toHaveCount(0);
  }
});

test('the pill nav and the primary buttons are flat', async ({ page }) => {
  for (const pageInfo of PAGES) {
    await page.goto(pageInfo.path);
    await expect(page.locator('.site-nav'), `${pageInfo.path} nav`).toHaveCSS('box-shadow', 'none');
    for (const button of await page.locator('.btn-primary').all()) {
      await expect(button, `${pageInfo.path} primary button`).toHaveCSS('box-shadow', 'none');
    }
  }
});

test('the About steps carry no index numbers and sit flat on the page', async ({ page }) => {
  await page.goto('/about.html');
  const steps = page.locator('ol.about-steps > li');
  await expect(steps).toHaveCount(3);
  await expect(page.locator('.about-step-num')).toHaveCount(0);
  await expect(steps.first()).toHaveCSS('box-shadow', 'none');
});

test('About running text is 16px or larger and nothing drops under 13px', async ({ page }) => {
  await page.goto('/about.html');
  const bodies = '.about-step-body, .about-feature-body, .about-promise-body, .about-kbd-action';
  const bodySizes = await page
    .locator(bodies)
    .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(bodySizes.length).toBeGreaterThan(0);
  expect(Math.min(...bodySizes)).toBeGreaterThanOrEqual(16);

  const smallest = await page.locator('main').evaluate((main) => {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let min = Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !(node.textContent || '').trim() || parent.closest('svg')) continue;
      min = Math.min(min, parseFloat(getComputedStyle(parent).fontSize));
    }
    return min;
  });
  expect(smallest).toBeGreaterThanOrEqual(13);
});
