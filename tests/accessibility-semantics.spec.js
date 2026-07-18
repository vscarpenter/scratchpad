// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

test.describe('accessibility — interactive semantics', () => {
  test('keeps note selection and tag filtering as sibling controls', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'row-alpha', title: 'Alpha note', body: 'Alpha body.', tags: ['alpha'] },
      { id: 'row-beta', title: 'Beta note', body: 'Beta body.', tags: ['beta'] },
    ]);

    await expect(page.locator('.note-row button button')).toHaveCount(0);
    const alphaRow = page.locator('.note-row[data-id="row-alpha"]');
    const alphaOpen = alphaRow.getByRole('button', { name: 'Open Alpha note' });
    await expect(alphaOpen).not.toHaveAttribute('aria-current', 'true');

    await alphaOpen.focus();
    await alphaOpen.press('Enter');
    await expect(page.locator('#note-title-display')).toHaveText('Alpha note');
    await expect(alphaOpen).toHaveAttribute('aria-current', 'true');

    const alphaTag = alphaRow.getByRole('button', { name: 'Filter notes by tag alpha' });
    await alphaTag.focus();
    await alphaTag.press('Enter');
    await expect(page.locator('#active-filter-tag')).toHaveText('#alpha');
    await expect(page.locator('#note-title-display')).toHaveText('Alpha note');
    await expect(page.locator('.note-row')).toHaveCount(1);
  });

  test('renders Trash tags as text instead of misleading controls', async ({ page }) => {
    await seedRawNotes(page, [
      {
        id: 'row-trashed',
        title: 'Trashed note',
        body: 'Trash body.',
        tags: ['archive'],
        deletedAt: Date.now(),
      },
    ]);

    await page.locator('#trash-view').click();
    const row = page.locator('.note-row[data-id="row-trashed"]');
    await expect(row.getByRole('button', { name: 'Open Trashed note' })).toHaveCount(1);
    await expect(row.getByRole('button', { name: /tag archive/i })).toHaveCount(0);
    await expect(row.locator('.note-row-tag.is-static')).toHaveText('archive');
  });
});
