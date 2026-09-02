// @ts-check
/* Image attachments: blob store access, object-URL cache, ingest, and backup encoding. */
{
  ('use strict');

  /** @typedef {{ id: string, noteId: string, name: string, type: string, size: number, bytes: ArrayBuffer, createdAt: number }} AttachmentRecord */
  /** @typedef {{ tx(store: string, mode: IDBTransactionMode): Promise<IDBObjectStore>, reqToPromise(request: IDBRequest): Promise<any>, transactionDone(t: IDBTransaction): Promise<void> }} DbApi */

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
  function blobOf(record) {
    return new Blob([record.bytes], { type: record.type });
  }

  /** @param {AttachmentRecord} record */
  async function put(record) {
    const store = await db().tx(STORE, 'readwrite');
    store.put(record);
    return db().transactionDone(store.transaction);
  }

  root.ScratchpadAttachments = Object.freeze({ get, forNote, all, put, blobOf });
}
