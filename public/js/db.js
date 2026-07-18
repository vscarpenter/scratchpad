/* Scratchpad: IndexedDB layer. Exposes window.ScratchpadDB with promise-based CRUD. */
(function () {
  'use strict';

  const DB_NAME = 'scratchpad';
  const DB_VERSION = 2;
  const STORES = {
    notes: 'notes',
    drafts: 'drafts',
    revisions: 'revisions',
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORES.notes)) {
          const store = db.createObjectStore(STORES.notes, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        const notes = req.transaction.objectStore(STORES.notes);
        if (!notes.indexNames.contains('deletedAt')) notes.createIndex('deletedAt', 'deletedAt');
        if (!db.objectStoreNames.contains(STORES.drafts)) {
          const drafts = db.createObjectStore(STORES.drafts, { keyPath: 'noteId' });
          drafts.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains(STORES.revisions)) {
          const revisions = db.createObjectStore(STORES.revisions, { keyPath: 'id' });
          revisions.createIndex('noteId', 'noteId');
          revisions.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return open().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll() {
    const store = await tx(STORES.notes, 'readonly');
    return reqToPromise(store.getAll());
  }

  async function get(id) {
    const store = await tx(STORES.notes, 'readonly');
    return reqToPromise(store.get(id));
  }

  async function put(note) {
    const store = await tx(STORES.notes, 'readwrite');
    return reqToPromise(store.put(note));
  }

  async function remove(id) {
    const store = await tx(STORES.notes, 'readwrite');
    return reqToPromise(store.delete(id));
  }

  async function clear() {
    const store = await tx(STORES.notes, 'readwrite');
    return reqToPromise(store.clear());
  }

  async function bulkPut(notes) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORES.notes, 'readwrite');
      const store = t.objectStore(STORES.notes);
      for (const note of notes) store.put(note);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function getDraft(noteId) {
    const store = await tx(STORES.drafts, 'readonly');
    return reqToPromise(store.get(noteId));
  }

  async function putDraft(draft) {
    const store = await tx(STORES.drafts, 'readwrite');
    return reqToPromise(store.put(draft));
  }

  async function removeDraft(noteId) {
    const store = await tx(STORES.drafts, 'readwrite');
    return reqToPromise(store.delete(noteId));
  }

  async function getAllDrafts() {
    const store = await tx(STORES.drafts, 'readonly');
    return reqToPromise(store.getAll());
  }

  async function getRevisions(noteId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORES.revisions, 'readonly');
      const index = t.objectStore(STORES.revisions).index('noteId');
      const req = index.getAll(noteId);
      req.onsuccess = () => {
        const rows = (req.result || []).sort((a, b) => b.savedAt - a.savedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function putRevision(revision) {
    const store = await tx(STORES.revisions, 'readwrite');
    return reqToPromise(store.put(revision));
  }

  async function pruneRevisions(noteId, keep) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORES.revisions, 'readwrite');
      const store = t.objectStore(STORES.revisions);
      const index = store.index('noteId');
      const req = index.getAll(noteId);
      req.onsuccess = () => {
        const rows = (req.result || []).sort((a, b) => b.savedAt - a.savedAt);
        for (const rev of rows.slice(keep)) store.delete(rev.id);
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function getAllRevisions() {
    const store = await tx(STORES.revisions, 'readonly');
    return reqToPromise(store.getAll());
  }

  async function bulkPutRevisions(revisions) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORES.revisions, 'readwrite');
      const store = t.objectStore(STORES.revisions);
      for (const revision of revisions) store.put(revision);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function importRecords(notes, revisions, revisionLimit) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let failure = null;
      let t;
      try {
        t = db.transaction([STORES.notes, STORES.revisions], 'readwrite');
      } catch (error) {
        reject(error);
        return;
      }
      const abortWith = (error) => {
        if (!failure) failure = error;
        try {
          t.abort();
        } catch (abortError) {
          reject(failure || abortError);
        }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => {
        if (!failure && t.error) failure = t.error;
      };
      t.onabort = () => reject(failure || t.error || new Error('IndexedDB import aborted'));

      try {
        const noteStore = t.objectStore(STORES.notes);
        const revisionStore = t.objectStore(STORES.revisions);
        for (const note of notes) noteStore.put(note);
        for (const revision of revisions) revisionStore.put(revision);

        const keep = Math.max(0, Number.isFinite(revisionLimit) ? revisionLimit : 0);
        const noteIds = new Set(revisions.map((revision) => revision.noteId));
        for (const noteId of noteIds) {
          const request = revisionStore.index('noteId').getAll(noteId);
          request.onsuccess = () => {
            try {
              const rows = (request.result || []).sort((a, b) => b.savedAt - a.savedAt);
              for (const revision of rows.slice(keep)) revisionStore.delete(revision.id);
            } catch (error) {
              abortWith(error);
            }
          };
        }
      } catch (error) {
        abortWith(error);
      }
    });
  }

  async function deleteNoteEverywhere(noteId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction([STORES.notes, STORES.drafts, STORES.revisions], 'readwrite');
      t.objectStore(STORES.notes).delete(noteId);
      t.objectStore(STORES.drafts).delete(noteId);
      const revisions = t.objectStore(STORES.revisions);
      const req = revisions.index('noteId').getAll(noteId);
      req.onsuccess = () => {
        for (const rev of req.result || []) revisions.delete(rev.id);
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function clearAllStores() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction([STORES.notes, STORES.drafts, STORES.revisions], 'readwrite');
      t.objectStore(STORES.notes).clear();
      t.objectStore(STORES.drafts).clear();
      t.objectStore(STORES.revisions).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  window.ScratchpadDB = {
    getAll,
    get,
    put,
    remove,
    clear,
    bulkPut,
    getDraft,
    putDraft,
    removeDraft,
    getAllDrafts,
    getRevisions,
    putRevision,
    pruneRevisions,
    getAllRevisions,
    bulkPutRevisions,
    importRecords,
    deleteNoteEverywhere,
    clearAllStores,
  };
})();
