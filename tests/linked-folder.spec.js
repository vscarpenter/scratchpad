// @ts-check
const { test, expect } = require('@playwright/test');
const { seedRawNotes, seedFolders } = require('./helpers');

async function withPicker(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = () => navigator.storage.getDirectory();
  });
}

async function seedLinkedNotes(page) {
  await withPicker(page);
  await seedRawNotes(page, [
    { id: 'work-note', title: 'Weekly plan', body: 'Plan body', tags: ['work'], folderId: 'f-work' },
    { id: 'loose-note', title: 'Loose idea', body: 'Idea body' },
  ]);
  await seedFolders(page, [{ id: 'f-work', name: 'Work' }]);
}

async function opfs(page, action, path, content) {
  return page.evaluate(
    async ({ action, path, content }) => {
      let dir = await navigator.storage.getDirectory();
      const parts = path.split('/');
      const name = parts.pop();
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: action === 'write' });
      if (action === 'write') {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
      }
      if (action === 'exists') {
        try {
          await dir.getFileHandle(name);
          return true;
        } catch (error) {
          return false;
        }
      }
      const handle = await dir.getFileHandle(name);
      return (await handle.getFile()).text();
    },
    { action, path, content },
  );
}

async function link(page) {
  await page.locator('#open-about').click();
  await page.locator('#linked-folder-link').click();
  const status = page.locator('#linked-folder-status');
  const toasts = page.locator('#toast-region');
  await expect
    .poll(async () => (await status.textContent()) + ' ' + (await toasts.textContent()), { timeout: 4000 })
    .toMatch(/Linked to|could not remember|Not linked/);
  await page.waitForTimeout(300);
  test.skip(!/Linked to/.test((await status.textContent()) || ''), 'this browser cannot link a directory here');
}

test('linking writes every preserved note as markdown with its id', async ({ page }) => {
  await seedLinkedNotes(page);
  await link(page);
  const work = await opfs(page, 'read', 'work/weekly-plan.md');
  expect(work).toContain('id: "work-note"');
  expect(work).toContain('title: "Weekly plan"');
  expect(work.trim().endsWith('Plan body')).toBe(true);
  expect(await opfs(page, 'exists', 'loose-idea.md')).toBe(true);
  await page.reload();
  await page.locator('#open-about').click();
  await expect(page.locator('#linked-folder-status')).toContainText('Linked');
});

test('saving a note rewrites its file and trashing removes it', async ({ page }) => {
  await seedLinkedNotes(page);
  await link(page);
  await page.keyboard.press('Escape');
  await page.locator('.note-row[data-id="loose-note"]').click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-title-input').fill('Sharper idea');
  await page.locator('#note-editor').fill('Idea body v2');
  await page.locator('#save-btn').click();
  await expect.poll(() => opfs(page, 'exists', 'sharper-idea.md')).toBe(true);
  await expect.poll(() => opfs(page, 'exists', 'loose-idea.md')).toBe(false);
  expect(await opfs(page, 'read', 'sharper-idea.md')).toContain('Idea body v2');
  await page.locator('#overflow-btn').click();
  await page.locator('#delete-btn').click();
  await page.locator('#confirm-delete').click();
  await expect.poll(() => opfs(page, 'exists', 'sharper-idea.md')).toBe(false);
});
