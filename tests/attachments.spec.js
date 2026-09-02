// @ts-check
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, importJson, openBackupMenu } = require('./helpers');

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngFile = (name) => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG_1x1, 'base64') });

const V4_SCHEMA = [
  ['notes', 'id', ['updatedAt', 'deletedAt']],
  ['drafts', 'noteId', ['updatedAt']],
  ['revisions', 'id', ['noteId', 'updatedAt']],
  ['folders', 'id', []],
  ['shares', 'id', ['noteId', 'expiresAt']],
];

async function buildV4Database(page) {
  await page.goto('/share.html');
  await page.evaluate(
    (schema) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('scratchpad', 4);
        req.onupgradeneeded = () => {
          for (const [name, keyPath, indexes] of schema) {
            const store = req.result.createObjectStore(name, { keyPath });
            for (const index of indexes) store.createIndex(index, index);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const t = db.transaction('notes', 'readwrite');
          t.objectStore('notes').put({
            id: 'legacy',
            title: 'Survivor',
            body: 'from v4',
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          });
          t.oncomplete = () => {
            db.close();
            resolve(undefined);
          };
          t.onerror = () => reject(t.error);
        };
        req.onerror = () => reject(req.error);
      }),
    V4_SCHEMA,
  );
}

test('upgrading a v4 database to v5 keeps notes and adds the new stores', async ({ page }) => {
  await buildV4Database(page);
  await gotoApp(page);
  await expect(page.locator('.note-row[data-id="legacy"]')).toBeVisible();
  const shape = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('scratchpad');
        req.onsuccess = () => {
          const db = req.result;
          resolve({ version: db.version, stores: Array.from(db.objectStoreNames).sort() });
          db.close();
        };
      }),
  );
  expect(shape.version).toBe(5);
  expect(shape.stores).toEqual(['attachments', 'drafts', 'folders', 'notes', 'revisions', 'settings', 'shares']);
});

test('the attachments store round-trips bytes by note and dies with the note', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'x' }]);
  const result = await page.evaluate(async () => {
    const A = window.ScratchpadAttachments;
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await A.put({ id: 'att-1', noteId: 'host', name: 'a.png', type: 'image/png', size: 3, bytes, createdAt: 1 });
    const stored = await A.get('att-1');
    const forNote = await A.forNote('host');
    await window.ScratchpadDB.deleteNoteEverywhere('host');
    const blob = A.blobOf(stored);
    return { size: blob.size, type: blob.type, count: forNote.length, after: (await A.forNote('host')).length };
  });
  expect(result).toEqual({ size: 3, type: 'image/png', count: 1, after: 0 });
});

async function openForEditing(page, id) {
  await page.locator(`.note-row[data-id="${id}"]`).click();
  await page.locator('#edit-btn').click();
  await page.locator('#note-editor').focus();
}

test('attaching through the menu inserts markdown and renders a blob image', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'Intro' }]);
  await openForEditing(page, 'host');
  await page.evaluate(() => document.getElementById('note-editor').setSelectionRange(5, 5));
  await page.locator('#overflow-btn').click();
  await expect(page.locator('#attach-image-btn')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setInputFiles('#attach-image-input', pngFile('holiday photo.png'));
  await expect(page.locator('#note-editor')).toHaveValue(/^Intro\n!\[holiday photo\]\(attachment:[0-9a-f-]+\)\n$/);
  await expect(page.locator('#dirty-indicator')).toBeVisible();
  await page.locator('#save-btn').click();
  const img = page.locator('#note-rendered img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect(img).toHaveAttribute('alt', 'holiday photo');
  await expect(page.locator('#note-rendered [style]')).toHaveCount(0);
  const stored = await page.evaluate(() => window.ScratchpadAttachments.forNote('host'));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ noteId: 'host', type: 'image/png', name: 'holiday photo.png' });
});

test('non-images and oversized images are refused with a toast', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: '' }]);
  await openForEditing(page, 'host');
  await page.setInputFiles('#attach-image-input', {
    name: 'doc.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hi'),
  });
  await expect(page.locator('#toast-region')).toContainText('Only PNG, JPEG, GIF, and WebP');
  const huge = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 2000;
        canvas.height = 2000;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < 4000; i += 1) {
          ctx.fillStyle = `hsl(${(i * 37) % 360} 90% ${(i * 13) % 100}%)`;
          ctx.fillRect((i * 7) % 2000, (i * 13) % 2000, 60, 60);
        }
        canvas.toBlob(
          (blob) => blob.arrayBuffer().then((buf) => resolve(Array.from(new Uint8Array(buf)))),
          'image/png',
        );
      }),
  );
  test.skip(huge.length <= 4 * 1024 * 1024, 'could not synthesize a >4MB png in this browser');
  await page.setInputFiles('#attach-image-input', {
    name: 'big.png',
    mimeType: 'image/png',
    buffer: Buffer.from(huge),
  });
  await expect(page.locator('#toast-region')).toContainText('4MB or smaller');
  await expect(page.locator('#note-editor')).toHaveValue('');
});

test('wide images are downscaled to 2048px before storage', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: '' }]);
  await openForEditing(page, 'host');
  const wide = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 3000;
        canvas.height = 30;
        canvas.getContext('2d').fillRect(0, 0, 3000, 30);
        canvas.toBlob(
          (blob) => blob.arrayBuffer().then((buf) => resolve(Array.from(new Uint8Array(buf)))),
          'image/png',
        );
      }),
  );
  await page.setInputFiles('#attach-image-input', {
    name: 'wide.png',
    mimeType: 'image/png',
    buffer: Buffer.from(wide),
  });
  await expect(page.locator('#note-editor')).toHaveValue(/attachment:/);
  const size = await page.evaluate(async () => {
    const A = window.ScratchpadAttachments;
    const [record] = await A.forNote('host');
    const bitmap = await createImageBitmap(A.blobOf(record));
    return { width: bitmap.width, height: bitmap.height, type: record.type };
  });
  expect(size).toEqual({ width: 2048, height: 20, type: 'image/png' });
});

test('pasting and dropping image files attach them', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium builds a ClipboardEvent/DragEvent with readable files');
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: '' }]);
  await openForEditing(page, 'host');
  const outcome = await page.evaluate((png) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const editor = document.getElementById('note-editor');
    const make = (name) => new File([bytes], name, { type: 'image/png' });
    const paste = new DataTransfer();
    paste.items.add(make('pasted.png'));
    const pasteEvent = new ClipboardEvent('paste', { clipboardData: paste, bubbles: true, cancelable: true });
    editor.dispatchEvent(pasteEvent);
    const drop = new DataTransfer();
    drop.items.add(make('dropped.png'));
    const dropEvent = new DragEvent('drop', { dataTransfer: drop, bubbles: true, cancelable: true });
    editor.dispatchEvent(dropEvent);
    return { paste: pasteEvent.defaultPrevented, drop: dropEvent.defaultPrevented };
  }, PNG_1x1);
  expect(outcome).toEqual({ paste: true, drop: true });
  await expect(page.locator('#note-editor')).toHaveValue(
    /!\[pasted\]\(attachment:[^)]+\)\n!\[dropped\]\(attachment:[^)]+\)\n/,
  );
  expect(await page.evaluate(() => window.ScratchpadAttachments.forNote('host'))).toHaveLength(2);
});

test('a missing attachment and the share viewer show a placeholder', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: '![lost](attachment:nope) and ![](attachment:gone)' }]);
  await page.locator('.note-row[data-id="host"]').click();
  await expect(page.locator('#note-rendered .image-placeholder')).toHaveText([
    '(image not included: lost)',
    '(image not included)',
  ]);
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadMarkdown);
  const text = await page.evaluate(() => {
    const body = document.getElementById('share-body');
    window.ScratchpadMarkdown.renderMarkdownInto(body, '![pic](attachment:abc)');
    return body.querySelector('.image-placeholder').textContent;
  });
  expect(text).toBe('(image not included: pic)');
});
