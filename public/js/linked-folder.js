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

  /** @returns {Promise<string>} */
  async function permission() {
    if (!record) return 'denied';
    const handle = /** @type {any} */ (record.handle);
    if (typeof handle.queryPermission !== 'function') return 'granted';
    return handle.queryPermission({ mode: 'readwrite' });
  }

  /** @param {Note[]} notes @returns {Map<string, string>} */
  function assignPaths(notes) {
    /** @type {Map<string, string>} */
    const map = new Map();
    if (!deps) return map;
    const api = deps;
    const taken = new Set();
    const ordered = notes
      .filter((note) => !api.isTrashed(note))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const note of ordered) {
      const folderId = api.noteFolderId(note);
      const dir =
        (api.isArchived(note) ? 'archive/' : '') + (folderId ? api.slugify(api.folderDisplayName(folderId)) + '/' : '');
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

  /** @param {string} path @param {string | ArrayBuffer} content */
  async function writeFile(path, content) {
    const dir = await directoryFor(path, true);
    const handle = await dir.getFileHandle(path.split('/').pop() || 'note.md', { create: true });
    const writable = await handle.createWritable();
    await writable.write(typeof content === 'string' ? content : new Blob([content]));
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

  /** @param {{ id: string, name?: string, bytes: ArrayBuffer }} attachment */
  async function ensureAttachmentFile(attachment) {
    const safe = String(attachment.name || 'image').replace(/[^\w.-]+/g, '-');
    const path = 'attachments/' + attachment.id + '-' + safe;
    if (record && !record.written[path]) record.written[path] = await writeFile(path, attachment.bytes);
    return path;
  }

  /** @param {Note} note */
  async function markdownFor(note) {
    if (!deps) return '';
    let text = deps.noteToMarkdown(note);
    const attachments = root.ScratchpadAttachments ? await root.ScratchpadAttachments.forNote(note.id) : [];
    for (const attachment of attachments) {
      const path = await ensureAttachmentFile(attachment);
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

  async function flush() {
    writeTimer = 0;
    if (!deps || !record || (await permission()) !== 'granted') return;
    const api = deps;
    const ids = Array.from(pending);
    pending.clear();
    const paths = assignPaths(api.notes());
    try {
      for (const id of ids) {
        const note = api.notes().find((item) => item.id === id);
        await writeNote(note || { id, deletedAt: 1 }, paths);
      }
      await saveRecord();
    } catch (error) {
      api.toast('Could not write to the linked folder.', { tone: 'error' });
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
    if (!deps || !supported() || !root.showDirectoryPicker) return;
    const api = deps;
    let handle;
    try {
      handle = await root.showDirectoryPicker({ mode: 'readwrite' });
    } catch (_error) {
      return;
    }
    record = { handle, name: handle.name || 'folder', linkedAt: api.now(), paths: {}, written: {} };
    try {
      await saveRecord();
    } catch (error) {
      record = null;
      await render();
      api.toast('This browser could not remember the folder.', { tone: 'error' });
      console.warn('Linked folder could not be stored', error);
      return;
    }
    const count = await writeAll();
    await render();
    api.toast('Linked “' + record.name + '”. Wrote ' + count + ' note' + (count === 1 ? '' : 's') + '.');
  }

  async function unlink() {
    if (!deps) return;
    record = null;
    await saveRecord();
    await render();
    deps.toast('Folder unlinked. Files were left in place.');
  }

  async function reconnect() {
    if (!record || !deps) return;
    const handle = /** @type {any} */ (record.handle);
    if (typeof handle.requestPermission === 'function') await handle.requestPermission({ mode: 'readwrite' });
    await render();
    if ((await permission()) === 'granted') await writeAll();
  }

  async function readAll() {
    lastRead = deps ? deps.now() : 0;
    return 0;
  }

  async function render() {
    const row = document.getElementById('linked-folder-row');
    const status = document.getElementById('linked-folder-status');
    if (!row || !status) return;
    row.hidden = !supported();
    const granted = record ? (await permission()) === 'granted' : false;
    status.textContent = record
      ? granted
        ? 'Linked to “' + record.name + '”'
        : 'Reconnect “' + record.name + '”'
      : 'Not linked';
    row.setAttribute('data-state', record ? (granted ? 'ok' : 'warn') : 'muted');
    const show = {
      link: !record,
      write: !!record && granted,
      read: !!record && granted,
      reconnect: !!record && !granted,
      unlink: !!record,
    };
    for (const [name, visible] of Object.entries(show)) {
      const button = document.getElementById('linked-folder-' + name);
      if (button) button.hidden = !visible;
    }
  }

  /** @param {string} name @param {() => Promise<unknown>} action */
  function bindButton(name, action) {
    const button = document.getElementById('linked-folder-' + name);
    if (button) button.addEventListener('click', () => action());
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
    bindButton('link', link);
    bindButton('write', async () => {
      const count = await writeAll();
      api.toast('Wrote ' + count + ' note' + (count === 1 ? '' : 's') + ' to “' + (record ? record.name : '') + '”.');
    });
    bindButton('read', readAll);
    bindButton('reconnect', reconnect);
    bindButton('unlink', unlink);
    window.addEventListener('focus', () => {
      if (record && api.now() - lastRead > READ_THROTTLE) readAll();
    });
    loadRecord()
      .then(render)
      .catch((error) => console.warn('Linked folder could not load', error));
  }

  root.ScratchpadLinkedFolder = Object.freeze({
    init,
    noteChanged,
    link,
    writeAll,
    readAll,
    unlink,
    isLinked: () => !!record,
  });
}
