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
      try {
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: action === 'write' });
      } catch (error) {
        if (action === 'exists') return false;
        throw error;
      }
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

test('reading applies an external edit, keeps a conflict loser as a revision, and adopts new files', async ({
  page,
}) => {
  await seedLinkedNotes(page);
  await link(page);
  const original = await opfs(page, 'read', 'loose-idea.md');
  await opfs(page, 'write', 'loose-idea.md', original.replace('Idea body', 'Edited outside'));
  await opfs(page, 'write', 'fresh-thought.md', '---\ntitle: "Fresh thought"\ntags: ["new"]\n---\n\nTyped elsewhere');
  await page.locator('#linked-folder-read').click();
  await expect(page.locator('#toast-region')).toContainText(/Read 2/);
  const notes = await page.evaluate(() => window.ScratchpadDB.getAll());
  expect(notes.find((n) => n.id === 'loose-note').body).toBe('Edited outside');
  const fresh = notes.find((n) => n.title === 'Fresh thought');
  expect(fresh).toMatchObject({ body: 'Typed elsewhere', tags: ['new'], folderId: null });
  await expect.poll(() => opfs(page, 'read', 'fresh-thought.md')).toContain('id: "' + fresh.id + '"');
  await page.keyboard.press('Escape');
  await page.locator('.note-row[data-id="loose-note"]').click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').fill('Edited inside');
  await page.locator('#save-btn').click();
  await expect.poll(() => opfs(page, 'read', 'loose-idea.md')).toContain('Edited inside');
  await opfs(page, 'write', 'loose-idea.md', original.replace('Idea body', 'Edited outside again'));
  await page.locator('#open-about').click();
  await page.locator('#linked-folder-read').click();
  await expect
    .poll(() => page.evaluate(() => window.ScratchpadDB.get('loose-note').then((n) => n.body)))
    .toBe('Edited outside again');
  expect((await page.evaluate(() => window.ScratchpadDB.getRevisions('loose-note'))).length).toBeGreaterThanOrEqual(2);
});

test('attachments are written as files and read back as references', async ({ page }) => {
  await seedLinkedNotes(page);
  await link(page);
  await page.keyboard.press('Escape');
  await page.locator('.note-row[data-id="loose-note"]').click();
  await page.locator('#edit-btn').click();
  await page.setInputFiles('#attach-image-input', {
    name: 'pic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('#note-editor')).toHaveValue(/attachment:/);
  await page.locator('#save-btn').click();
  const id = await page.evaluate(async () => (await window.ScratchpadAttachments.forNote('loose-note'))[0].id);
  await expect.poll(() => opfs(page, 'exists', 'attachments/' + id + '-pic.png')).toBe(true);
  await expect.poll(() => opfs(page, 'read', 'loose-idea.md')).toContain('](attachments/' + id + '-pic.png)');
  const file = await opfs(page, 'read', 'loose-idea.md');
  await opfs(page, 'write', 'loose-idea.md', file + '\n\nMore text');
  await page.locator('#open-about').click();
  await page.locator('#linked-folder-read').click();
  await expect(page.locator('#toast-region')).toContainText(/Read 1/);
  const body = (await page.evaluate(() => window.ScratchpadDB.get('loose-note'))).body;
  expect(body).toContain('attachment:' + id);
  expect(body).toContain('More text');
});

test('unlink forgets the folder but leaves files, and the row hides without the api', async ({ page }) => {
  await seedLinkedNotes(page);
  await link(page);
  await page.locator('#linked-folder-unlink').click();
  await expect(page.locator('#linked-folder-status')).toHaveText('Not linked');
  expect(await opfs(page, 'exists', 'loose-idea.md')).toBe(true);
  await page.addInitScript(() => {
    delete window.showDirectoryPicker;
  });
  await page.reload();
  await page.locator('#open-about').click();
  await expect(page.locator('#linked-folder-row')).toBeHidden();
});
