// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('typography — Indigo on Paper headings and matched read/edit metrics', () => {
  test('title and rendered headings use the platform serif stack, code stays mono', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'serif-note', title: 'Serif title', body: '## Section\n\nBody paragraph.\n\nUses a `code span` too.' },
    ]);

    const title = page.locator('#note-title-display');
    expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Iowan Old Style|Palatino|Georgia/);
    expect(await title.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');

    const h2 = page.locator('#note-rendered h2');
    expect(await h2.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Iowan Old Style|Palatino|Georgia/);
    expect(await h2.evaluate((el) => getComputedStyle(el).fontSize)).toBe('19px');
    expect(await h2.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');

    const code = page.locator('#note-rendered code').first();
    expect(await code.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/ui-monospace|SF Mono|Menlo|monospace/);
  });

  test('the title input inherits the display title font, so Edit does not jump', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'input-note', title: 'Same face', body: 'Body.' }]);

    // No line-height in this probe: Firefox clamps single-line inputs to a
    // UA minimum that CSS cannot lower, and a one-line input has no line
    // breaks to move anyway.
    const probe = (el) => {
      const cs = getComputedStyle(el);
      return [cs.fontFamily, cs.fontSize, cs.letterSpacing].join('|');
    };
    const displayFont = await page.locator('#note-title-display').evaluate(probe);
    await page.locator('#edit-btn').click();
    const inputFont = await page.locator('#note-title-input').evaluate(probe);
    expect(inputFont).toBe(displayFont);
  });

  test('rendered body and the editing textarea share font metrics and measure', async ({ page }) => {
    await seedRawNotes(page, [
      {
        id: 'measure-note',
        title: 'Measure',
        body: 'A paragraph long enough to wrap across several lines once the measure caps the writing surface, proving read and edit share one width.',
      },
    ]);

    // Probe the first paragraph: at over 60 characters it carries the
    // auto-lede decoration, which must not drift from the shared metrics.
    const rendered = await page.locator('#note-rendered p').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { font: [cs.fontFamily, cs.fontSize, cs.lineHeight].join('|'), width: el.clientWidth };
    });

    await page.locator('#edit-btn').click();
    const editor = await page.locator('#note-editor').evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        font: [cs.fontFamily, cs.fontSize, cs.lineHeight].join('|'),
        width: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      };
    });

    // Same family, size, and line height: toggling Edit moves no line breaks.
    expect(editor.font).toBe(rendered.font);
    expect(Math.abs(editor.width - rendered.width)).toBeLessThanOrEqual(2);
  });
});
