// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, createAndSaveNote } = require('./helpers');

test.describe('markdown rendering — XSS guard', () => {
  test('strips <script> tags and inline event handlers', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

    await gotoApp(page);

    const hostile = [
      '# Heading',
      '',
      '<script>window.__PWNED = "via-script"</script>',
      '',
      '<img src=x onerror="window.__PWNED = \'via-onerror\'">',
      '',
      '[click me](javascript:window.__PWNED = "via-href")',
    ].join('\n');

    await createAndSaveNote(page, 'XSS attempt', hostile);

    const rendered = page.locator('#note-rendered');
    await expect(rendered.locator('script')).toHaveCount(0);
    await expect(rendered.locator('[onerror]')).toHaveCount(0);

    const hrefs = await rendered.locator('a').evaluateAll((els) =>
      els.map((a) => a.getAttribute('href') || '')
    );
    for (const href of hrefs) {
      expect(href.toLowerCase().startsWith('javascript:')).toBe(false);
    }

    const pwned = await page.evaluate(() => /** @type {any} */ (window).__PWNED);
    expect(pwned).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('external links open in new tabs with rel="noopener noreferrer"', async ({ page }) => {
    await gotoApp(page);
    await createAndSaveNote(page, 'Links', 'See [example](https://example.com).');

    const link = page.locator('#note-rendered a');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('rel', /noreferrer/);
  });
});
