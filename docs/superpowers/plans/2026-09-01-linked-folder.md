# Linked Folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the linked plain-text folder
(`docs/superpowers/specs/2026-09-01-linked-folder-design.md`) as v4.1.0.

**Architecture:** `public/js/linked-folder.js` (`window.ScratchpadLinkedFolder`)
owns the settings record (directory handle, path map, written-time map),
permission checks, the Your data row, write scheduling, the directory
walk, and conflict handling. It receives app.js helpers at init and is
notified from `putNoteRecord`. `noteToMarkdown` gains an `id` line and
`parseMarkdownNote` honors an `id`, which also makes ZIP round-trips keep
identities. Tests stub `showDirectoryPicker` with the origin-private file
system so the real code runs against a real directory.

**Spec:** `docs/superpowers/specs/2026-09-01-linked-folder-design.md`

## Global Constraints

- Copy never uses the word "sync". Controls: Link a folder…, Write now,
  Read now, Reconnect, Unlink.
- app.js ceiling 6204 (6202 today): the init block, the write hook, and
  the `id` frontmatter line are offset by compressing the three existing
  module init blocks.
- Module under 400 lines, functions under 40, nesting at most 3; if the
  reader pushes it past 400, split the walk-and-apply half into
  `public/js/folder-reader.js`.
- Files are only ever removed for a trashed note or a moved/renamed path
  that Scratchpad itself wrote.

---

### Task 1: Link, write, and the Your data row

**Files:**
- Create: `public/js/linked-folder.js`
- Modify: `public/js/app.js` (`putNoteRecord`, `noteToMarkdown`,
  `parseMarkdownNote`, boot init, compress three init blocks), `index.html`
  (row markup after the offline-cache row; script tag), `public/service-worker.js`,
  `jsconfig.json`
- Test: `tests/linked-folder.spec.js` (create)

**Interfaces:**
- Consumes: `DB.tx/reqToPromise/transactionDone` for the `settings` store;
  app.js `notes, folders, noteToMarkdown, parseMarkdownNote, storeRevision,
  putNoteRecord, normalizeNote, deriveTitle, slugify, noteFolderId,
  folderDisplayName, isArchived, isTrashed, uuid, now, toast, reload`;
  `ScratchpadAttachments.forNote` and `forZip`-style path rewriting.
- Produces: `ScratchpadLinkedFolder.init(deps)`, `noteChanged(note)`,
  `link()`, `writeAll()`, `readAll()`, `unlink()`, `isLinked()`.

- [ ] **Step 1: Failing tests** (`tests/linked-folder.spec.js`):

```js
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
  await page.locator('#about-btn').click();
  await page.locator('#linked-folder-link').click();
  const status = page.locator('#linked-folder-status');
  await expect(status).toContainText(/Linked|could not/);
  const text = await status.textContent();
  test.skip(!/Linked/.test(text || ''), 'this browser cannot persist a directory handle');
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
  await page.locator('#about-btn').click();
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
  expect(await opfs(page, 'exists', 'loose-idea.md')).toBe(false);
  expect(await opfs(page, 'read', 'sharper-idea.md')).toContain('Idea body v2');
  await page.locator('#overflow-btn').click();
  await page.locator('#delete-btn').click();
  await expect.poll(() => opfs(page, 'exists', 'sharper-idea.md')).toBe(false);
});
```

- [ ] **Step 2: Run** — expect FAIL (no `#linked-folder-link`).
- [ ] **Step 3: Markup.** After the offline-cache `data-status-row` add:

```html
          <div id="linked-folder-row" class="data-status-row" hidden>
            <span class="status-dot" aria-hidden="true"></span>
            <span class="data-status-term">Linked folder</span>
            <span id="linked-folder-status" class="data-status-value">Not linked</span>
            <button id="linked-folder-link" class="btn btn-secondary btn-sm" type="button">Link a folder…</button>
            <button id="linked-folder-write" class="btn btn-secondary btn-sm" type="button" hidden>Write now</button>
            <button id="linked-folder-read" class="btn btn-secondary btn-sm" type="button" hidden>Read now</button>
            <button id="linked-folder-reconnect" class="btn btn-secondary btn-sm" type="button" hidden>Reconnect</button>
            <button id="linked-folder-unlink" class="btn btn-ghost btn-sm" type="button" hidden>Unlink</button>
          </div>
```

- [ ] **Step 4: Module.** Settings access, permission, paths, and writes:

```js
// @ts-check
/* Linked folder: mirrors notes as Markdown files in a user-chosen directory and reads edits back. */
{
  ('use strict');

  /** @typedef {{ id: string, title?: string, body?: string, tags?: string[], folderId?: string | null, archivedAt?: number | null, deletedAt?: number | null, updatedAt?: number, createdAt?: number }} Note */
  /** @typedef {{ handle: FileSystemDirectoryHandle, name: string, linkedAt: number, paths: Record<string, string>, written: Record<string, number> }} LinkRecord */
  /** @typedef {{ notes(): Note[], folders(): Array<{ id: string, name: string }>, noteToMarkdown(note: Note): string, parseMarkdownNote(text: string): Note, storeRevision(note: Note): Promise<unknown>, putNoteRecord(note: Note): Promise<unknown>, deriveTitle(note: Note): string, slugify(text: string): string, noteFolderId(note: Note): string | null, folderDisplayName(id: string | null): string, isArchived(note: Note): boolean, isTrashed(note: Note): boolean, uuid(): string, now(): number, toast(message: string, options?: object): void, reload(): Promise<unknown> }} Deps */

  const KEY = 'linked-folder';
  const WRITE_DELAY = 800;
  const READ_THROTTLE = 10000;
  /** @type {Deps | null} */
  let deps = null;
  /** @type {LinkRecord | null} */
  let record = null;
  /** @type {Set<string>} */
  const pending = new Set();
  let writeTimer = 0;
  let lastRead = 0;

  /** @type {Window & typeof globalThis & { ScratchpadDB?: any, ScratchpadAttachments?: any, ScratchpadLinkedFolder?: object, showDirectoryPicker?: (options?: object) => Promise<FileSystemDirectoryHandle> }} */
  const root = window;

  const supported = () => typeof root.showDirectoryPicker === 'function';

  async function loadRecord() {
    const store = await root.ScratchpadDB.tx('settings', 'readonly');
    const row = await root.ScratchpadDB.reqToPromise(store.get(KEY));
    record = row && row.value ? row.value : null;
  }

  async function saveRecord() {
    const store = await root.ScratchpadDB.tx('settings', 'readwrite');
    if (record) store.put({ key: KEY, value: record });
    else store.delete(KEY);
    return root.ScratchpadDB.transactionDone(store.transaction);
  }

  /** @returns {Promise<'granted' | 'prompt' | 'denied'>} */
  async function permission() {
    if (!record) return 'denied';
    const handle = /** @type {any} */ (record.handle);
    if (typeof handle.queryPermission !== 'function') return 'granted';
    return handle.queryPermission({ mode: 'readwrite' });
  }

  /** @param {Note[]} notes */
  function assignPaths(notes) {
    if (!deps) return new Map();
    const api = deps;
    const taken = new Set();
    /** @type {Map<string, string>} */
    const map = new Map();
    const ordered = notes.filter((note) => !api.isTrashed(note)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const note of ordered) {
      const folderId = api.noteFolderId(note);
      const dir = (api.isArchived(note) ? 'archive/' : '') + (folderId ? api.slugify(api.folderDisplayName(folderId)) + '/' : '');
      const base = dir + (api.slugify(api.deriveTitle(note)) || 'untitled-note');
      let path = base + '.md';
      for (let n = 2; taken.has(path); n += 1) path = base + '-' + n + '.md';
      taken.add(path);
      map.set(note.id, path);
    }
    return map;
  }

  /** @param {string} path @param {boolean} create */
  async function directoryFor(path, create) {
    if (!record) throw new Error('not linked');
    let dir = record.handle;
    const parts = path.split('/');
    parts.pop();
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  /** @param {string} path @param {string | Uint8Array} content */
  async function writeFile(path, content) {
    const dir = await directoryFor(path, true);
    const handle = await dir.getFileHandle(path.split('/').pop() || 'note.md', { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return (await handle.getFile()).lastModified;
  }

  /** @param {string} path */
  async function removeFile(path) {
    try {
      const dir = await directoryFor(path, false);
      await dir.removeEntry(path.split('/').pop() || '');
    } catch (_error) {
      /* already gone */
    }
  }

  /** @param {Note} note @returns {Promise<string>} markdown with attachment references rewritten */
  async function markdownFor(note) {
    if (!deps) return '';
    let text = deps.noteToMarkdown(note);
    const attachments = root.ScratchpadAttachments ? await root.ScratchpadAttachments.forNote(note.id) : [];
    for (const attachment of attachments) {
      const safe = String(attachment.name || 'image').replace(/[^\w.-]+/g, '-');
      const path = 'attachments/' + attachment.id + '-' + safe;
      if (!record || !record.written[path]) record && (record.written[path] = await writeFile(path, new Uint8Array(attachment.bytes)));
      text = text.split('attachment:' + attachment.id).join(path);
    }
    return text;
  }

  /** @param {Note} note @param {Map<string, string>} paths */
  async function writeNote(note, paths) {
    if (!record || !deps) return;
    const previous = record.paths[note.id];
    const path = paths.get(note.id);
    if (!path) {
      if (previous) await removeFile(previous);
      delete record.paths[note.id];
      return;
    }
    record.written[path] = await writeFile(path, await markdownFor(note));
    if (previous && previous !== path) await removeFile(previous);
    record.paths[note.id] = path;
  }
```

Scheduling, actions, and the row:

```js
  async function flush() {
    writeTimer = 0;
    if (!deps || !record || (await permission()) !== 'granted') return;
    const ids = Array.from(pending);
    pending.clear();
    const paths = assignPaths(deps.notes());
    try {
      for (const id of ids) {
        const note = deps.notes().find((item) => item.id === id);
        if (note) await writeNote(note, paths);
        else if (record.paths[id]) await writeNote({ id, deletedAt: 1 }, paths);
      }
      await saveRecord();
    } catch (error) {
      deps.toast('Could not write to the linked folder.', { tone: 'error' });
      console.warn('Linked folder write failed', error);
    }
  }

  /** @param {Note} note */
  function noteChanged(note) {
    if (!record) return;
    pending.add(note.id);
    if (!writeTimer) writeTimer = window.setTimeout(flush, WRITE_DELAY);
  }

  async function writeAll() {
    if (!deps || !record) return 0;
    for (const note of deps.notes()) pending.add(note.id);
    for (const id of Object.keys(record.paths)) pending.add(id);
    await flush();
    return Object.keys(record.paths).length;
  }

  async function link() {
    if (!deps || !supported()) return;
    let handle;
    try {
      handle = await root.showDirectoryPicker({ mode: 'readwrite' });
    } catch (_error) {
      return;
    }
    record = { handle, name: handle.name || 'folder', linkedAt: deps.now(), paths: {}, written: {} };
    try {
      await saveRecord();
    } catch (error) {
      record = null;
      render();
      deps.toast('This browser could not remember the folder.', { tone: 'error' });
      return;
    }
    const count = await writeAll();
    render();
    deps.toast('Linked “' + record.name + '”. Wrote ' + count + ' note' + (count === 1 ? '' : 's') + '.');
  }

  async function unlink() {
    if (!deps) return;
    record = null;
    await saveRecord();
    render();
    deps.toast('Folder unlinked. Files were left in place.');
  }

  async function reconnect() {
    if (!record || !deps) return;
    const handle = /** @type {any} */ (record.handle);
    if (typeof handle.requestPermission === 'function') await handle.requestPermission({ mode: 'readwrite' });
    render();
    if ((await permission()) === 'granted') await writeAll();
  }

  async function render() {
    const row = document.getElementById('linked-folder-row');
    const status = document.getElementById('linked-folder-status');
    if (!row || !status) return;
    row.hidden = !supported();
    const granted = record ? (await permission()) === 'granted' : false;
    status.textContent = record ? (granted ? 'Linked to “' + record.name + '”' : 'Reconnect “' + record.name + '”') : 'Not linked';
    row.setAttribute('data-state', record && granted ? 'ok' : record ? 'warn' : '');
    const show = { link: !record, write: !!record && granted, read: !!record && granted, reconnect: !!record && !granted, unlink: !!record };
    for (const [name, visible] of Object.entries(show)) {
      const button = document.getElementById('linked-folder-' + name);
      if (button) button.hidden = !visible;
    }
  }
```

`init(api)` stores deps, calls `loadRecord().then(render)`, binds the five
buttons (`link`, `writeAll` with a toast, `readAll`, `reconnect`, `unlink`),
and adds a `focus` listener that calls `readAll` when
`now() - lastRead > READ_THROTTLE`. Export
`init, noteChanged, link, writeAll, readAll, unlink, isLinked`.

- [ ] **Step 5: app.js.** In `putNoteRecord` after `DB.put` add
  `if (window.ScratchpadLinkedFolder) window.ScratchpadLinkedFolder.noteChanged(note);`.
  In `noteToMarkdown` add `'id: ' + JSON.stringify(note.id),` as the first
  frontmatter line after `'---'`. In `parseMarkdownNote` use
  `id: typeof metadata.id === 'string' && metadata.id ? metadata.id : uuid(),`.
  Compress the mentions, templates, and attachments init blocks to two or
  three lines each and add:

```js
    if (window.ScratchpadLinkedFolder) window.ScratchpadLinkedFolder.init({
      notes: () => state.notes, folders: () => state.folders, noteToMarkdown, parseMarkdownNote, storeRevision, putNoteRecord,
      deriveTitle, slugify, noteFolderId, folderDisplayName, isArchived, isTrashed, uuid, now, toast, reload: loadAll,
    });
```

Register the script after `attachments.js`, `APP_SHELL`, jsconfig.

- [ ] **Step 6: Run** the spec plus `markdown-import`, `share-export`,
  `diagnostics`, `data-erasure` specs; checks; commit
  `feat(data): link a local folder and write notes as markdown files`.

---

### Task 2: Reading the folder back

- [ ] **Step 1: Failing tests** (append):

```js
test('reading applies an external edit, keeps a conflict loser as a revision, and adopts new files', async ({ page }) => {
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
  await page.locator('#about-btn').click();
  await page.locator('#linked-folder-read').click();
  await expect.poll(() => page.evaluate(() => window.ScratchpadDB.get('loose-note').then((n) => n.body))).toBe('Edited outside again');
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
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('#note-editor')).toHaveValue(/attachment:/);
  await page.locator('#save-btn').click();
  const id = await page.evaluate(async () => (await window.ScratchpadAttachments.forNote('loose-note'))[0].id);
  await expect.poll(() => opfs(page, 'exists', 'attachments/' + id + '-pic.png')).toBe(true);
  await expect.poll(() => opfs(page, 'read', 'loose-idea.md')).toContain('](attachments/' + id + '-pic.png)');
  await page.locator('#about-btn').click();
  await page.locator('#linked-folder-read').click();
  await expect(page.locator('#toast-region')).toContainText(/Read/);
  expect((await page.evaluate(() => window.ScratchpadDB.get('loose-note'))).body).toContain('attachment:' + id);
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
  await page.locator('#about-btn').click();
  await expect(page.locator('#linked-folder-row')).toBeHidden();
});
```

- [ ] **Step 2: Reader.** `readAll()` walks the handle recursively (skipping
  `attachments`), and for each `.md` file whose `lastModified` is greater
  than `record.written[path]`: parse with `deps.parseMarkdownNote`, rewrite
  `](attachments/<id>-…)` back to `attachment:<id>`, then
  `applyFile(path, parsed, mtime)`: existing note by id → if the note's
  `updatedAt` is newer than `record.written[path]` and older than `mtime`
  the file wins and the note is stored as a revision first; if the note is
  newer than the file the note wins and the file is rewritten; otherwise
  the file's title, tags, and body replace the note's through
  `putNoteRecord`. Unknown or missing id → new note in the folder whose
  display name matches the directory, unfiled otherwise, archived under
  `archive/`. Update `record.written[path]`, save, `reload()`, toast
  `Read N changed file(s) from “<name>”.` (`Read 0 …` when nothing changed).
- [ ] **Step 3: Run** the spec on all browsers; commit
  `feat(data): read edits back from the linked folder`.

### Task 3: Docs, version, release

- [ ] Guide `<h2 id="linked-folder">Linked folder</h2>` after `#backups`
  with TOC anchor and `SECTION_IDS`; README bullet; `tests/README.md`.
  Commit `docs(guide): linked folder`.
- [ ] Bump to 4.1.0; verify, suite, CSP hash script, dry run; commit
  `chore(release): v4.1.0 linked folder`; final `tasks/todo.md` handoff.
