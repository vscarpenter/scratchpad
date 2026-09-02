// @ts-check
/* Image attachments: blob store access, object-URL cache, ingest, and backup encoding. */
{
  ('use strict');

  /** @typedef {{ id: string, noteId: string, name: string, type: string, size: number, bytes: ArrayBuffer, createdAt: number }} AttachmentRecord */
  /** @typedef {{ tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore>, reqToPromise(request: IDBRequest): Promise<any>, transactionDone(t: IDBTransaction): Promise<void> }} DbApi */

  /** @typedef {{ noteId(): string | null, editing(): boolean, uuid(): string, now(): number, rerender(): void, toast(message: string, options?: object): void, insert(editor: HTMLTextAreaElement, text: string): void, editor: HTMLTextAreaElement }} Deps */

  const STORE = 'attachments';
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
  function blobOf(record) {
    return new Blob([record.bytes], { type: record.type });
  }

  /** @param {AttachmentRecord} record */
  async function put(record) {
    const store = await db().tx(STORE, 'readwrite');
    store.put(record);
    return db().transactionDone(store.transaction);
  }

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
    for (const record of records) urls.set(record.id, URL.createObjectURL(blobOf(record)));
    if (deps) deps.rerender();
  }

  /** @param {string} name */
  function baseName(name) {
    return (
      String(name || 'image')
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[[\]]/g, '') || 'image'
    );
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
    /** @type {Blob | null} */
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
    if (!TYPES.has(file.type))
      return api.toast('Only PNG, JPEG, GIF, and WebP images can be attached.', { tone: 'error' });
    let blob;
    try {
      blob = await fitted(file);
    } catch (_error) {
      return api.toast('That image could not be read.', { tone: 'error' });
    }
    if (blob.size > MAX_BYTES) return api.toast('Images must be 4MB or smaller.', { tone: 'error' });
    const bytes = await blob.arrayBuffer();
    const record = {
      id: api.uuid(),
      noteId,
      name: file.name || 'image',
      type: blob.type,
      size: blob.size,
      bytes,
      createdAt: api.now(),
    };
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

  /** @param {HTMLTextAreaElement} editor */
  function bindDrop(editor) {
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
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
    bindDrop(api.editor);
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('attach-image-input'));
    const button = document.getElementById('attach-image-btn');
    if (button && input) button.addEventListener('click', () => input.click());
    if (input) {
      input.addEventListener('change', () => {
        attachFiles(api.editor, input.files || []).then(() => {
          input.value = '';
        });
      });
    }
  }

  root.ScratchpadAttachments = Object.freeze({ get, forNote, all, put, blobOf, init, warm, resolve, attachFiles });
}
