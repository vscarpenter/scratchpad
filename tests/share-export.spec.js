// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes } = require('./helpers');

async function downloadBuffer(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test.describe('sharing and portable exports', () => {
  test('copies the complete note through the device clipboard handoff', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__scratchpadCopiedText = text;
          },
        },
      });
    });
    await seedRawNotes(page, [
      { id: 'share-copy', title: 'Share title', body: 'Body with **Markdown**.' },
    ]);

    await page.locator('#share-btn').click();
    await expect(page.locator('#share-dialog')).toBeVisible();
    await page.locator('#share-copy').click();

    await expect(page.locator('#share-status')).toHaveText('Copied to clipboard.');
    await expect.poll(() => page.evaluate(() => window.__scratchpadCopiedText)).toBe(
      'Share title\n\nBody with **Markdown**.'
    );
  });

  test('hands a long note to the email client as a safe truncated mailto URL', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'External-protocol navigation details require Chromium CDP events.');
    await seedRawNotes(page, [
      { id: 'share-email', title: 'Email title', body: 'x'.repeat(2400) },
    ]);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const navigation = new Promise((resolve) => {
      cdp.once('Page.frameScheduledNavigation', resolve);
    });

    await page.locator('#share-btn').click();
    await expect(page.locator('#share-mailto-warning')).toBeVisible();
    await page.locator('#share-email').click();

    const event = await navigation;
    const mailto = new URL(event.url);
    expect(mailto.protocol).toBe('mailto:');
    expect(mailto.searchParams.get('subject')).toBe('Email title');
    const body = mailto.searchParams.get('body');
    expect(body).toContain('Email title\n\n');
    expect(body).toContain('[note continues - open Scratchpad to see the rest]');
    expect(body.length).toBeLessThan(2400);
  });

  test('exports full-fidelity JSON with active notes, Trash, and revision history', async ({ page }) => {
    const now = Date.now();
    await seedRawNotes(page, [
      { id: 'json-active', title: 'Active export', body: 'Current body.', tags: ['backup'], pinned: true },
      { id: 'json-trash', title: 'Trashed export', body: 'Deleted body.', deletedAt: now },
    ]);
    await page.evaluate(async (savedAt) => {
      await window.ScratchpadDB.putRevision({
        id: 'json-revision',
        noteId: 'json-active',
        title: 'Active export',
        body: 'Previous body.',
        tags: ['backup'],
        pinned: true,
        createdAt: savedAt - 1000,
        updatedAt: savedAt - 1000,
        savedAt,
        deletedAt: null,
      });
    }, now);

    await page.locator('#open-about').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    const download = await downloadPromise;
    const payload = JSON.parse((await downloadBuffer(download)).toString('utf8'));

    expect(download.suggestedFilename()).toMatch(/^scratchpad-.*\.json$/);
    expect(payload).toMatchObject({ app: 'scratchpad', schemaVersion: 3 });
    expect(payload.notes.map((note) => note.id)).toEqual(['json-active']);
    expect(payload.trashedNotes.map((note) => note.id)).toEqual(['json-trash']);
    expect(payload.revisions.map((revision) => revision.id)).toEqual(['json-revision']);
  });

  test('exports active notes as readable, uniquely named Markdown files in a ZIP', async ({ page }) => {
    const now = Date.now();
    await seedRawNotes(page, [
      {
        id: 'zip-one',
        title: 'Project Plan',
        body: '# First body',
        tags: ['alpha'],
        pinned: true,
        dailyDate: '2026-07-18',
      },
      { id: 'zip-two', title: 'Project Plan', body: 'Second body', tags: ['beta'] },
      { id: 'zip-trash', title: 'Do not export', body: 'Trash body', deletedAt: now },
    ]);

    await page.locator('#overflow-btn').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-overflow-btn').click();
    const download = await downloadPromise;
    const zip = await downloadBuffer(download);
    const storedText = zip.toString('utf8');

    expect(download.suggestedFilename()).toMatch(/^scratchpad-markdown-.*\.zip$/);
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(storedText).toContain('project-plan.md');
    expect(storedText).toContain('project-plan-2.md');
    expect(storedText).toContain('title: "Project Plan"');
    expect(storedText).toContain('tags: ["alpha"]');
    expect(storedText).toContain('dailyDate: "2026-07-18"');
    expect(storedText).toContain('# First body');
    expect(storedText).not.toContain('Do not export');
    expect(storedText).not.toContain('Trash body');
  });

  test('reports that there is nothing to export when only Trash has notes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'zip-only-trash', title: 'Only trash', body: 'Deleted.', deletedAt: Date.now() },
    ]);
    let downloaded = false;
    page.on('download', () => { downloaded = true; });

    await page.locator('#open-about').click();
    await page.locator('#export-markdown-btn').click();

    await expect(page.locator('.toast')).toContainText('No active notes to export.');
    expect(downloaded).toBe(false);
  });
});
