const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('Markdown import', () => {
  test('imports multiple Markdown files and reads Scratchpad frontmatter', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#import-file', [
      {
        name: 'frontmatter.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from([
          '---',
          'title: "Imported plan"',
          'tags: ["work", "private"]',
          'pinned: true',
          'createdAt: "2026-07-01T12:00:00.000Z"',
          'updatedAt: "2026-07-02T12:00:00.000Z"',
          '---',
          '',
          '# Imported plan',
          '',
          'Keep this local.',
        ].join('\n')),
      },
      {
        name: 'plain-note.markdown',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Plain note\n\nNo frontmatter required.'),
      },
    ]);

    await expect(page.locator('#import-preview-dialog')).toBeVisible();
    await expect(page.locator('#import-preview-counts')).toContainText('2');
    await page.locator('#confirm-import').click();

    const imported = await page.evaluate(async () =>
      (await window.ScratchpadDB.getAll())
        .map(({ title, body, tags, pinned }) => ({ title, body, tags, pinned }))
        .sort((a, b) => a.title.localeCompare(b.title))
    );
    expect(imported).toEqual([
      {
        title: 'Imported plan',
        body: '# Imported plan\n\nKeep this local.',
        tags: ['work', 'private'],
        pinned: true,
      },
      {
        title: 'Plain note',
        body: '# Plain note\n\nNo frontmatter required.',
        tags: [],
        pinned: false,
      },
    ]);
  });

  test('rejects mixed JSON and Markdown selections with recovery copy', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#import-file', [
      { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from('{"notes":[]}') },
      { name: 'note.md', mimeType: 'text/markdown', buffer: Buffer.from('# Note') },
    ]);
    await expect(page.locator('#toast-region')).toContainText('Choose JSON or Markdown files, not both.');
  });
});
