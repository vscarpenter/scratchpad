# Image Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship image attachments
(`docs/superpowers/specs/2026-09-01-image-attachments-design.md`) as v4.0.0.

**Architecture:** `public/js/db.js` moves its schema to a declarative table
and exports three transaction primitives; `public/js/attachments.js`
(`window.ScratchpadAttachments`) owns the store access, object-URL cache,
ingest (paste, drop, menu), downscaling, and backup encoding;
`public/js/markdown.js` gains an `image` renderer, an attachment resolver,
and a DOMPurify hook that admits `blob:` on `img[src]`; `public/js/paste.js`
hands image files to the module and exports `insert`; app.js wires the
resolver, warms the cache on render, and passes attachments through backup,
import, and the Markdown ZIP.

**Spec:** `docs/superpowers/specs/2026-09-01-image-attachments-design.md`

## Global Constraints

- db.js allowance is 418 as the ratchet counts (417 by `wc -l`): the
  schema table must shrink the file by at least what the new helpers add.
- app.js ceiling 6204 (6202 today): this plan nets +1 by collapsing
  `isNativeBackup`, the backup folder chain, the import broadcast loop, and
  the `monthlyReviewMonth` spread.
- Format-sweep: db.js, zip.js, paste.js, markdown.js are Biome-formatted
  before commit (db.js and zip.js are line-neutral under Biome).
- No inline `<script>` edits. CSP edits are in the two cloudfront files
  only and are not published by this plan.
- Tests top-level, under 40 lines each; Chromium-only where the browser
  cannot construct the event, with a visible reason.

---

### Task 1: Schema 5, store primitives, and the attachments store

**Files:**
- Modify: `public/js/db.js` (`STORES`, `onupgradeneeded`, `deleteNoteEverywhere`,
  `clearAllStores`, `importRecords`, exports)
- Create: `public/js/attachments.js` (store half; ingest and backup halves
  come in Tasks 2 and 3)
- Modify: `index.html`, `public/service-worker.js`, `jsconfig.json`
- Test: `tests/attachments.spec.js` (create)

- [ ] **Step 1: Failing tests:**

```js
// @ts-check
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, createAndSaveNote, importJson, openBackupMenu } = require('./helpers');

const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngFile = (name) => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG_1x1, 'base64') });

async function buildV4Database(page) {
  await page.goto('/share.html');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('scratchpad', 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('updatedAt', 'updatedAt');
      notes.createIndex('deletedAt', 'deletedAt');
      db.createObjectStore('drafts', { keyPath: 'noteId' }).createIndex('updatedAt', 'updatedAt');
      const revisions = db.createObjectStore('revisions', { keyPath: 'id' });
      revisions.createIndex('noteId', 'noteId');
      revisions.createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('folders', { keyPath: 'id' });
      const shares = db.createObjectStore('shares', { keyPath: 'id' });
      shares.createIndex('noteId', 'noteId');
      shares.createIndex('expiresAt', 'expiresAt');
    };
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction('notes', 'readwrite');
      t.objectStore('notes').put({ id: 'legacy', title: 'Survivor', body: 'from v4', tags: [], createdAt: 1, updatedAt: 1 });
      t.oncomplete = () => { db.close(); resolve(undefined); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  }));
}

test('upgrading a v4 database to v5 keeps notes and adds the new stores', async ({ page }) => {
  await buildV4Database(page);
  await gotoApp(page);
  await expect(page.locator('.note-row[data-id="legacy"]')).toBeVisible();
  const shape = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('scratchpad');
    req.onsuccess = () => {
      const db = req.result;
      resolve({ version: db.version, stores: Array.from(db.objectStoreNames).sort() });
      db.close();
    };
  }));
  expect(shape.version).toBe(5);
  expect(shape.stores).toEqual(['attachments', 'drafts', 'folders', 'notes', 'revisions', 'settings', 'shares']);
});

test('the attachments store round-trips a blob by note and dies with the note', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'x' }]);
  const result = await page.evaluate(async () => {
    const A = window.ScratchpadAttachments;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await A.put({ id: 'att-1', noteId: 'host', name: 'a.png', type: 'image/png', size: 3, blob, createdAt: 1 });
    const stored = await A.get('att-1');
    const forNote = await A.forNote('host');
    await window.ScratchpadDB.deleteNoteEverywhere('host');
    return { size: stored.blob.size, type: stored.type, count: forNote.length, after: (await A.forNote('host')).length };
  });
  expect(result).toEqual({ size: 3, type: 'image/png', count: 1, after: 0 });
});
```

- [ ] **Step 2: Run** `SCRATCHPAD_TEST_PORT=8091 npx playwright test tests/attachments.spec.js --reporter=line`
  — expect FAIL (version 4, no module).

- [ ] **Step 3: db.js.** Replace `STORES` and the upgrade handler:

```js
  const STORES = {
    notes: 'notes',
    drafts: 'drafts',
    revisions: 'revisions',
    folders: 'folders',
    shares: 'shares',
    attachments: 'attachments',
    settings: 'settings',
  };
  // [store, keyPath, indexes]. Presence checks keep the upgrade idempotent
  // from any earlier version, so there are no per-version branches.
  const SCHEMA = [
    [STORES.notes, 'id', ['updatedAt', 'deletedAt']],
    [STORES.drafts, 'noteId', ['updatedAt']],
    [STORES.revisions, 'id', ['noteId', 'updatedAt']],
    [STORES.folders, 'id', []],
    [STORES.shares, 'id', ['noteId', 'expiresAt']],
    [STORES.attachments, 'id', ['noteId']],
    [STORES.settings, 'key', []],
  ];
```

```js
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, keyPath, indexes] of SCHEMA) {
          const store = db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath });
          for (const index of indexes) if (!store.indexNames.contains(index)) store.createIndex(index, index);
        }
      };
```

`DB_VERSION = 5`. In `deleteNoteEverywhere` add `STORES.attachments` to the
transaction list and delete by index like shares. In `clearAllStores`
transact over `Object.values(STORES)` and clear each in a loop.
`importRecords(notes, revisions, revisionLimit, folders, attachments)`: add
the attachments store to the transaction and `for (const a of attachments || []) attachmentStore.put(a)`.
Export `tx`, `reqToPromise`, `transactionDone`.

- [ ] **Step 4: attachments.js store half** (the file grows in later tasks):

```js
// @ts-check
/* Image attachments: blob store access, object-URL cache, ingest, and backup encoding. */
{
  ('use strict');

  /** @typedef {{ id: string, noteId: string, name: string, type: string, size: number, blob: Blob, createdAt: number }} AttachmentRecord */
  /** @typedef {{ tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore>, reqToPromise(request: IDBRequest): Promise<any>, transactionDone(t: IDBTransaction): Promise<void>, deleteNoteEverywhere(id: string): Promise<void> }} DbApi */

  const STORE = 'attachments';

  /** @type {Window & typeof globalThis & { ScratchpadDB?: DbApi, ScratchpadAttachments?: object }} */
  const root = window;

  function db() {
    if (!root.ScratchpadDB) throw new Error('ScratchpadDB is not loaded');
    return root.ScratchpadDB;
  }

  /** @param {string} id @returns {Promise<AttachmentRecord | undefined>} */
  async function get(id) {
    const store = await db().tx(STORE, 'readonly');
    return db().reqToPromise(store.get(id));
  }

  /** @param {string} noteId @returns {Promise<AttachmentRecord[]>} */
  async function forNote(noteId) {
    const store = await db().tx(STORE, 'readonly');
    return db().reqToPromise(store.index('noteId').getAll(noteId));
  }

  /** @returns {Promise<AttachmentRecord[]>} */
  async function all() {
    const store = await db().tx(STORE, 'readonly');
    return db().reqToPromise(store.getAll());
  }

  /** @param {AttachmentRecord} record */
  async function put(record) {
    const store = await db().tx(STORE, 'readwrite');
    store.put(record);
    return db().transactionDone(store.transaction);
  }

  root.ScratchpadAttachments = Object.freeze({ get, forNote, all, put });
}
```

Register the script after `templates.js`, in `APP_SHELL`, and in jsconfig.

- [ ] **Step 5: Run** the spec plus `share-store`, `import`,
  `archive-portability`, `data-erasure`, `reliability` specs on all browsers;
  `npm run check:structure` (db.js at or under 418). Commit
  `feat(db): schema 5 with attachments and settings stores`.

---

### Task 2: Rendering and ingest

**Files:**
- Modify: `public/js/markdown.js` (resolver, image renderer, DOMPurify hook),
  `public/js/paste.js` (export `insert`; image files branch),
  `public/js/attachments.js` (cache, warm, attach, bind), `public/js/app.js`
  (warm call, resolver + init at boot), `index.html` (menu item, file
  input), `public/css/app.css` (`.image-placeholder`)
- Test: append to `tests/attachments.spec.js`

- [ ] **Step 1: Failing tests:**

```js
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
  await page.setInputFiles('#attach-image-input', { name: 'doc.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.locator('#toast-region')).toContainText('Only PNG, JPEG, GIF, and WebP');
  const huge = await page.evaluate(() =>
    new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 2000;
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < 4000; i += 1) {
        ctx.fillStyle = `hsl(${(i * 37) % 360} 90% ${(i * 13) % 100}%)`;
        ctx.fillRect((i * 7) % 2000, (i * 13) % 2000, 60, 60);
      }
      canvas.toBlob((blob) => blob.arrayBuffer().then((buf) => resolve(Array.from(new Uint8Array(buf)))), 'image/png');
    }),
  );
  test.skip(huge.length <= 4 * 1024 * 1024, 'could not synthesize a >4MB png in this browser');
  await page.setInputFiles('#attach-image-input', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.from(huge) });
  await expect(page.locator('#toast-region')).toContainText('4MB or smaller');
  await expect(page.locator('#note-editor')).toHaveValue('');
});

test('wide images are downscaled to 2048px before storage', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: '' }]);
  await openForEditing(page, 'host');
  const wide = await page.evaluate(() =>
    new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 30;
      canvas.getContext('2d').fillRect(0, 0, 3000, 30);
      canvas.toBlob((blob) => blob.arrayBuffer().then((buf) => resolve(Array.from(new Uint8Array(buf)))), 'image/png');
    }),
  );
  await page.setInputFiles('#attach-image-input', { name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(wide) });
  await expect(page.locator('#note-editor')).toHaveValue(/attachment:/);
  const size = await page.evaluate(async () => {
    const [record] = await window.ScratchpadAttachments.forNote('host');
    const bitmap = await createImageBitmap(record.blob);
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
  await expect(page.locator('#note-editor')).toHaveValue(/!\[pasted\]\(attachment:[^)]+\)\n!\[dropped\]\(attachment:[^)]+\)\n/);
  expect(await page.evaluate(() => window.ScratchpadAttachments.forNote('host'))).toHaveLength(2);
});

test('a missing attachment and the share viewer show a placeholder', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: '![lost](attachment:nope) and ![](attachment:gone)' }]);
  await page.locator('.note-row[data-id="host"]').click();
  await expect(page.locator('#note-rendered .image-placeholder')).toHaveText(['(image not included: lost)', '(image not included)']);
  await page.goto('/share.html');
  await page.waitForFunction(() => !!window.ScratchpadMarkdown);
  const text = await page.evaluate(() => {
    const body = document.getElementById('share-body');
    window.ScratchpadMarkdown.renderMarkdownInto(body, '![pic](attachment:abc)');
    return body.querySelector('.image-placeholder').textContent;
  });
  expect(text).toBe('(image not included: pic)');
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: markdown.js.** Add a resolver setter and the image renderer
  beside the wikilink resolver, register `image: renderImage` in the
  renderer object, and install the DOMPurify hook next to `SANITIZE_CONFIG`:

```js
  let attachmentResolver = null;
  function setAttachmentResolver(fn) {
    attachmentResolver = typeof fn === 'function' ? fn : null;
  }

  const ATTACHMENT_PREFIX = 'attachment:';

  function renderImage(token) {
    const href = String(token.href || '');
    if (!href.startsWith(ATTACHMENT_PREFIX)) return false;
    const url = attachmentResolver ? attachmentResolver(href.slice(ATTACHMENT_PREFIX.length)) : null;
    const alt = escapeHtml(token.text || '');
    if (url) return '<img src="' + escapeHtml(url) + '" alt="' + alt + '">';
    return '<span class="image-placeholder">(image not included' + (alt ? ': ' + alt : '') + ')</span>';
  }
```

```js
  // blob: URLs are same-origin object URLs minted by attachments.js; they are
  // admitted on img[src] only, never on links.
  if (window.DOMPurify && typeof window.DOMPurify.addHook === 'function') {
    window.DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      const prefix = 'blob:' + window.location.origin + '/';
      if (node.nodeName === 'IMG' && data.attrName === 'src' && data.attrValue.startsWith(prefix)) data.forceKeepAttr = true;
    });
  }
```

Export `setAttachmentResolver`.

- [ ] **Step 4: paste.js.** Export `insert`. In `onPaste`, before
  `markdownFor`, add:

```js
    const images = data.files ? Array.from(data.files).filter((file) => file.type.startsWith('image/')) : [];
    if (images.length && root.ScratchpadAttachments) {
      event.preventDefault();
      root.ScratchpadAttachments.attachFiles(editor, images);
      return;
    }
```

- [ ] **Step 5: attachments.js ingest half:**

```js
  /** @typedef {{ noteId(): string | null, editing(): boolean, uuid(): string, now(): number, rerender(): void, toast(message: string, options?: object): void, insert(editor: HTMLTextAreaElement, text: string): void, editor: HTMLTextAreaElement }} Deps */
  const TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const MAX_BYTES = 4 * 1024 * 1024;
  const MAX_EDGE = 2048;
  const PREFIX = 'attachment:';
  /** @type {Deps | null} */
  let deps = null;
  /** @type {Map<string, string>} */
  const urls = new Map();
  /** @type {string | null} */
  let warmedNoteId = null;

  function revokeAll() {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    warmedNoteId = null;
  }

  /** @param {string} id */
  function resolve(id) {
    return urls.get(id) || null;
  }

  /** @param {string | null} noteId */
  async function warm(noteId) {
    const button = document.getElementById('attach-image-btn');
    if (button) button.hidden = !(deps && deps.editing());
    if (!noteId) return revokeAll();
    if (warmedNoteId === noteId) return;
    revokeAll();
    warmedNoteId = noteId;
    const records = await forNote(noteId);
    if (warmedNoteId !== noteId || !records.length) return;
    for (const record of records) urls.set(record.id, URL.createObjectURL(record.blob));
    if (deps) deps.rerender();
  }

  /** @param {string} name */
  function baseName(name) {
    return String(name || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[[\]]/g, '') || 'image';
  }

  /** @param {File} file @returns {Promise<Blob>} */
  async function fitted(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = file.type === 'image/gif' ? 'image/png' : file.type;
    const blob = await new Promise((done) => canvas.toBlob(done, type, 0.9));
    if (!blob) throw new Error('encode');
    return blob;
  }

  /** @param {unknown} error */
  function isQuotaError(error) {
    return !!error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError';
  }

  /** @param {HTMLTextAreaElement} editor @param {File} file @param {Deps} api */
  async function attach(editor, file, api) {
    const noteId = api.noteId();
    if (!noteId) return;
    if (!TYPES.has(file.type)) return api.toast('Only PNG, JPEG, GIF, and WebP images can be attached.', { tone: 'error' });
    let blob;
    try {
      blob = await fitted(file);
    } catch (_error) {
      return api.toast('That image could not be read.', { tone: 'error' });
    }
    if (blob.size > MAX_BYTES) return api.toast('Images must be 4MB or smaller.', { tone: 'error' });
    const record = { id: api.uuid(), noteId, name: file.name || 'image', type: blob.type, size: blob.size, blob, createdAt: api.now() };
    try {
      await put(record);
    } catch (error) {
      const message = isQuotaError(error) ? 'Not enough storage space for this image.' : 'Could not store this image.';
      return api.toast(message, { tone: 'error' });
    }
    if (warmedNoteId === noteId) urls.set(record.id, URL.createObjectURL(blob));
    const before = editor.value.slice(0, editor.selectionStart);
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    api.insert(editor, lead + '![' + baseName(record.name) + '](' + PREFIX + record.id + ')\n');
  }

  /** @param {HTMLTextAreaElement} editor @param {ArrayLike<File>} files */
  async function attachFiles(editor, files) {
    if (!deps) return;
    for (const file of Array.from(files)) await attach(editor, file, deps);
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
    const editor = api.editor;
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('attach-image-input'));
    const button = document.getElementById('attach-image-btn');
    editor.addEventListener('dragover', (event) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
    });
    editor.addEventListener('drop', (event) => {
      const files = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (!images.length) return;
      event.preventDefault();
      attachFiles(editor, images);
    });
    if (button && input) button.addEventListener('click', () => input.click());
    if (input) {
      input.addEventListener('change', () => {
        attachFiles(editor, input.files || []).then(() => {
          input.value = '';
        });
      });
    }
  }
```

Export `init, warm, resolve, attachFiles` too.

- [ ] **Step 6: app.js.** After the mentions render line in `renderEditor`:
  `if (window.ScratchpadAttachments) window.ScratchpadAttachments.warm(note ? note.id : null);`.
  At boot after the templates init:

```js
    if (window.ScratchpadAttachments) {
      Markdown.setAttachmentResolver((id) => window.ScratchpadAttachments.resolve(id));
      window.ScratchpadAttachments.init({
        noteId: () => state.selectedId, editing: () => state.editing, uuid, now, rerender: renderEditor, toast,
        insert: window.ScratchpadPaste.insert, editor: els.editor,
      });
    }
```

`index.html`: `<button id="attach-image-btn" role="menuitem" type="button" hidden>Attach image…</button>`
after `#duplicate-overflow-btn`; `<input id="attach-image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden />`
next to `#import-file`. `app.css` after the callout rules:
`.note-rendered .image-placeholder, .share-body .image-placeholder { color: var(--text-muted); font-style: italic; }`.

- [ ] **Step 7: Run** the attachments spec plus sanitization, network-isolation,
  paste-as-markdown, notes-crud, menu-controller specs; checks; commit
  `feat(editor): image attachments stored locally and rendered from blob urls`.

---

### Task 3: Backup, import, Markdown ZIP, and the CSP edit

**Files:**
- Modify: `public/js/attachments.js` (backup half), `public/js/zip.js`
  (`bytes` entries), `public/js/app.js` (`buildBackupPayload`, selected
  export, `isNativeBackup`, `buildImportPreview`, `confirmImport`,
  `exportMarkdownZip`, `noteToMarkdown`), `cloudfront/security-headers-function.js`,
  `cloudfront/response-headers-policy.json`
- Modify: `tests/archive-portability.spec.js`, `tests/folders.spec.js`,
  `tests/share-export.spec.js` where they assert `schemaVersion` 4 as the
  current version (fixtures for older versions stay)
- Test: append to `tests/attachments.spec.js`

- [ ] **Step 1: Failing tests:**

```js
async function attachOne(page, id, name) {
  await openForEditing(page, id);
  await page.setInputFiles('#attach-image-input', pngFile(name));
  await expect(page.locator('#note-editor')).toHaveValue(/attachment:/);
  await page.locator('#save-btn').click();
  await expect(page.locator('#save-btn')).toBeHidden();
}

async function downloadJson(page, buttonId) {
  await openBackupMenu(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#' + buttonId).click()]);
  return fs.readFileSync(await download.path(), 'utf8');
}

test('backups embed attachments as base64 under schema 5 and re-import them', async ({ page, context }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'Intro' }]);
  await attachOne(page, 'host', 'pic.png');
  const payload = JSON.parse(await downloadJson(page, 'export-btn'));
  expect(payload.schemaVersion).toBe(5);
  expect(payload.attachments).toHaveLength(1);
  expect(payload.attachments[0]).toMatchObject({ noteId: 'host', type: 'image/png', name: 'pic.png' });
  expect(Buffer.from(payload.attachments[0].data, 'base64').length).toBeGreaterThan(20);
  const fresh = await context.newPage();
  await gotoApp(fresh);
  await importJson(fresh, payload);
  await fresh.locator('#confirm-import').click();
  await expect(fresh.locator('.note-row[data-id="host"]')).toBeVisible();
  await fresh.locator('.note-row[data-id="host"]').click();
  await expect(fresh.locator('#note-rendered img')).toHaveAttribute('src', /^blob:/);
});

test('importing a backup as duplicates gives the copy its own attachment ids', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'Intro' }]);
  await attachOne(page, 'host', 'pic.png');
  const payload = JSON.parse(await downloadJson(page, 'export-btn'));
  await importJson(page, payload);
  await page.locator('#confirm-import').click();
  await expect(page.locator('.note-row')).toHaveCount(2);
  const state = await page.evaluate(async () => {
    const notes = await window.ScratchpadDB.getAll();
    const attachments = await window.ScratchpadAttachments.all();
    return { notes: notes.map((n) => ({ id: n.id, body: n.body })), attachments: attachments.map((a) => ({ id: a.id, noteId: a.noteId })) };
  });
  expect(state.attachments).toHaveLength(2);
  const copy = state.notes.find((n) => n.id !== 'host');
  const copyAttachment = state.attachments.find((a) => a.noteId === copy.id);
  expect(copy.body).toContain('attachment:' + copyAttachment.id);
  expect(copyAttachment.id).not.toBe(state.attachments.find((a) => a.noteId === 'host').id);
});

test('the markdown zip carries attachment files and relative links', async ({ page }) => {
  await seedRawNotes(page, [{ id: 'host', title: 'Host', body: 'Intro' }]);
  await attachOne(page, 'host', 'pic.png');
  await openBackupMenu(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-markdown-btn').click()]);
  const zip = fs.readFileSync(await download.path()).toString('latin1');
  const id = await page.evaluate(async () => (await window.ScratchpadAttachments.forNote('host'))[0].id);
  expect(zip).toContain('attachments/' + id + '-pic.png');
  expect(zip).toContain('](attachments/' + id + '-pic.png)');
  expect(zip).not.toContain('attachment:' + id);
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: attachments.js backup half:**

```js
  /** @typedef {{ id: string, noteId: string, name: string, type: string, size: number, createdAt: number, data: string }} AttachmentEntry */

  /** @param {Blob} blob */
  async function toBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    return btoa(binary);
  }

  /** @param {string} data @param {string} type */
  function fromBase64(data, type) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  /** @param {Set<string> | null} noteIds @returns {Promise<AttachmentEntry[]>} */
  async function serialize(noteIds) {
    const records = (await all()).filter((record) => !noteIds || noteIds.has(record.noteId));
    return Promise.all(
      records.map(async (record) => ({
        id: record.id, noteId: record.noteId, name: record.name, type: record.type, size: record.size,
        createdAt: record.createdAt, data: await toBase64(record.blob),
      })),
    );
  }

  /** @param {unknown} raw @returns {AttachmentEntry[]} */
  function parseBackup(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.noteId === 'string' && TYPES.has(entry.type) && typeof entry.data === 'string');
  }

  /** @param {AttachmentEntry[]} entries @param {Map<string, string>} idMap @param {() => string} uuid */
  function forImport(entries, idMap, uuid) {
    /** @type {Map<string, string>} */
    const renamed = new Map();
    const records = [];
    for (const entry of entries) {
      const noteId = idMap.get(entry.noteId);
      if (!noteId) continue;
      const id = noteId === entry.noteId ? entry.id : uuid();
      if (id !== entry.id) renamed.set(entry.id, id);
      records.push({ id, noteId, name: entry.name, type: entry.type, size: entry.size, createdAt: entry.createdAt, blob: fromBase64(entry.data, entry.type) });
    }
    /** @param {string} body */
    const rewrite = (body) => body.replace(/attachment:([0-9a-f-]+)/gi, (match, id) => (renamed.has(id) ? 'attachment:' + renamed.get(id) : match));
    return { records, rewrite };
  }

  /** @param {Set<string>} noteIds */
  async function forZip(noteIds) {
    const records = (await all()).filter((record) => noteIds.has(record.noteId));
    const paths = new Map();
    const files = [];
    for (const record of records) {
      const safe = String(record.name || 'image').replace(/[^\w.-]+/g, '-');
      const path = 'attachments/' + record.id + '-' + safe;
      paths.set(record.id, path);
      files.push({ name: path, bytes: new Uint8Array(await record.blob.arrayBuffer()) });
    }
    /** @param {string} body */
    const rewrite = (body) => body.replace(/attachment:([0-9a-f-]+)/gi, (match, id) => (paths.has(id) ? paths.get(id) : match));
    return { files, rewrite };
  }
```

Export `serialize, parseBackup, forImport, forZip`.

- [ ] **Step 4: zip.js.** `const data = file.bytes ? file.bytes : encoder.encode(file.content);`.
- [ ] **Step 5: app.js.**
  - `buildBackupPayload`: `schemaVersion: 5`, add
    `attachments: window.ScratchpadAttachments ? await window.ScratchpadAttachments.serialize(null) : [],`;
    collapse the folders chain to two lines.
  - Selected export (`schemaVersion: 4` near line 3167): `5`, add
    `attachments: window.ScratchpadAttachments ? await window.ScratchpadAttachments.serialize(selectedIds) : [],`.
  - `isNativeBackup`: accept 2–5 in four lines.
  - `buildImportPreview`: `attachments: []` in `empty`, and in the result
    `attachments: window.ScratchpadAttachments ? window.ScratchpadAttachments.parseBackup(data.attachments) : []`.
  - `confirmImport`: after `revisionsToImport`, add
    `const attachments = window.ScratchpadAttachments.forImport(preview.attachments || [], idMap, uuid);`
    and `for (const note of notesToImport) note.body = attachments.rewrite(note.body || '');`;
    pass `attachments.records` as the fifth `importRecords` argument;
    collapse the broadcast loop to one line.
  - `exportMarkdownZip`: `const bundle = await window.ScratchpadAttachments.forZip(new Set(notes.map((n) => n.id)));`,
    `content: bundle.rewrite(noteToMarkdown(note))`, and `files.push(...bundle.files)`
    before `createZip`; collapse the `monthlyReviewMonth` spread in `noteToMarkdown`.
- [ ] **Step 6: CSP.** `img-src 'self' blob: data:` in both cloudfront
  files; `bash cloudfront/recompute-csp-hashes.sh` still reports `[OK]`.
- [ ] **Step 7: Tests asserting the current schema:** change the literal
  `4` to `5` in `tests/archive-portability.spec.js:30`,
  `tests/folders.spec.js` ("exportAll payload remains schemaVersion"), and
  `tests/share-export.spec.js` where they read the live export; leave
  version fixtures alone.
- [ ] **Step 8: Run** attachments, import, archive-portability, folders,
  share-export, encrypted-backup, backup-reminder specs on all browsers;
  checks; commit `feat(backup): attachments travel in backups and the markdown zip`.

---

### Task 4: Docs, version, release

- [ ] Guide: new `<h2 id="images">Images</h2>` section after `#find-replace`
  with TOC anchor and `SECTION_IDS` entry in `tests/guide.spec.js`: paste,
  drop, or Attach image…; PNG/JPEG/GIF/WebP; 4MB after downscaling to
  2048px; stored only in this browser; included in backups and the ZIP;
  not included in shares. README feature bullet; `tests/README.md`.
  Commit `docs(guide): images`.
- [ ] Bump to 4.0.0; verify, suite, CSP hash script, dry run; commit
  `chore(release): v4.0.0 image attachments`; `tasks/todo.md` records that
  the deploy requires the CSP publish first.
