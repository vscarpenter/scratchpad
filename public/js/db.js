/* Scratchpad: IndexedDB layer. Exposes window.ScratchpadDB with promise-based CRUD. */
(function () {
  'use strict';

  const DB_NAME = 'scratchpad';
  const DB_VERSION = 1;
  const STORE = 'notes';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    return dbPromise;
  }

  function tx(mode) {
    return open().then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll() {
    const store = await tx('readonly');
    return reqToPromise(store.getAll());
  }

  async function get(id) {
    const store = await tx('readonly');
    return reqToPromise(store.get(id));
  }

  async function put(note) {
    const store = await tx('readwrite');
    return reqToPromise(store.put(note));
  }

  async function remove(id) {
    const store = await tx('readwrite');
    return reqToPromise(store.delete(id));
  }

  async function clear() {
    const store = await tx('readwrite');
    return reqToPromise(store.clear());
  }

  async function bulkPut(notes) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const store = t.objectStore(STORE);
      for (const note of notes) store.put(note);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  window.ScratchpadDB = { getAll, get, put, remove, clear, bulkPut };
})();
