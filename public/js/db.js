/* Scratchpad: IndexedDB layer. Exposes window.ScratchpadDB with promise-based CRUD. */
(function () {
  'use strict';

  const DB_NAME = 'scratchpad';
  const DB_VERSION = 4;
  const STORES = {
    notes: 'notes',
    drafts: 'drafts',
    revisions: 'revisions',
    folders: 'folders',
    shares: 'shares',
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      // A failed open must not latch: reset the cache so the next call can
      // retry once the transient condition (another tab holding an old
      // version, a permission prompt) has cleared.
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        dbPromise = null;
        reject(error);
      };
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
        if (!db.objectStoreNames.contains(STORES.folders)) {
          db.createObjectStore(STORES.folders, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.shares)) {
          const shares = db.createObjectStore(STORES.shares, { keyPath: 'id' });
          shares.createIndex('noteId', 'noteId');
          shares.createIndex('expiresAt', 'expiresAt');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Yield to a future version bump: without this handler an open tab
        // blocks another tab's upgrade forever, and that tab latches
        // onblocked. The next call here reopens at the new version.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        if (settled) {
          // Late success after onblocked already rejected: nobody holds this
          // promise anymore, so just release the connection.
          db.close();
          return;
        }
        settled = true;
        resolve(db);
      };
      req.onerror = () => fail(req.error);
      req.onblocked = () => fail(new Error('IndexedDB open blocked'));
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

  // A request error bubbles to the transaction while transaction.error is
  // still null -- the real error is only assigned by the later abort steps.
  // Latch it in onerror and reject from onabort so callers see the cause
  // (QuotaExceededError, most importantly) instead of null.
  function transactionDone(t) {
    return new Promise((resolve, reject) => {
      let failure = null;
      t.oncomplete = () => resolve();
      t.onerror = () => {
        if (!failure && t.error) failure = t.error;
      };
      t.onabort = () => reject(failure || t.error || new Error('IndexedDB transaction aborted'));
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

  // Compare-and-put in one transaction: the write commits only when the
  // stored record's updatedAt still matches what the caller read, and never
  // resurrects a record another tab deleted. Returns whether it wrote.
  async function putIfUnchanged(note, expectedUpdatedAt) {
    const db = await open();
    const t = db.transaction(STORES.notes, 'readwrite');
    const store = t.objectStore(STORES.notes);
    let committed = false;
    const req = store.get(note.id);
    req.onsuccess = () => {
      const current = req.result;
      if (current && current.updatedAt === expectedUpdatedAt) {
        store.put(note);
        committed = true;
      }
    };
    await transactionDone(t);
    return committed;
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
    const t = db.transaction(STORES.notes, 'readwrite');
    const store = t.objectStore(STORES.notes);
    for (const note of notes) store.put(note);
    return transactionDone(t);
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

  async function getAllFolders() {
    const store = await tx(STORES.folders, 'readonly');
    return reqToPromise(store.getAll());
  }

  async function putFolder(folder) {
    const store = await tx(STORES.folders, 'readwrite');
    return reqToPromise(store.put(folder));
  }

  async function removeFolder(id) {
    const store = await tx(STORES.folders, 'readwrite');
    return reqToPromise(store.delete(id));
  }

  async function bulkPutFolders(folders) {
    const db = await open();
    const t = db.transaction(STORES.folders, 'readwrite');
    const store = t.objectStore(STORES.folders);
    for (const folder of folders) store.put(folder);
    return transactionDone(t);
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
    const t = db.transaction(STORES.revisions, 'readwrite');
    const store = t.objectStore(STORES.revisions);
    const index = store.index('noteId');
    const req = index.getAll(noteId);
    req.onsuccess = () => {
      const rows = (req.result || []).sort((a, b) => b.savedAt - a.savedAt);
      for (const rev of rows.slice(keep)) store.delete(rev.id);
    };
    return transactionDone(t);
  }

  async function getAllRevisions() {
    const store = await tx(STORES.revisions, 'readonly');
    return reqToPromise(store.getAll());
  }

  async function bulkPutRevisions(revisions) {
    const db = await open();
    const t = db.transaction(STORES.revisions, 'readwrite');
    const store = t.objectStore(STORES.revisions);
    for (const revision of revisions) store.put(revision);
    return transactionDone(t);
  }

  async function importRecords(notes, revisions, revisionLimit, folders) {
    folders = Array.isArray(folders) ? folders : [];
    const db = await open();
    return new Promise((resolve, reject) => {
      let failure = null;
      let t;
      try {
        t = db.transaction([STORES.notes, STORES.revisions, STORES.folders], 'readwrite');
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
        const folderStore = t.objectStore(STORES.folders);
        for (const folder of folders) folderStore.put(folder);

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
    const t = db.transaction([STORES.notes, STORES.drafts, STORES.revisions, STORES.shares], 'readwrite');
    t.objectStore(STORES.notes).delete(noteId);
    t.objectStore(STORES.drafts).delete(noteId);
    const revisions = t.objectStore(STORES.revisions);
    const req = revisions.index('noteId').getAll(noteId);
    req.onsuccess = () => {
      for (const rev of req.result || []) revisions.delete(rev.id);
    };
    // Local rows only. Revoking the shares themselves is a network call the
    // caller makes first; a deletion must not be blocked by a failed revoke.
    const shares = t.objectStore(STORES.shares);
    const shareReq = shares.index('noteId').getAll(noteId);
    shareReq.onsuccess = () => {
      for (const share of shareReq.result || []) shares.delete(share.id);
    };
    return transactionDone(t);
  }

  // -------- Shares --------
  // One row per live share link. Holds the only copy of that share's decryption
  // key and revoke token: without the row the link can never be redisplayed or
  // revoked, only waited out.

  async function getSharesForNote(noteId) {
    const store = await tx(STORES.shares, 'readonly');
    return reqToPromise(store.index('noteId').getAll(noteId));
  }

  async function getAllShares() {
    const store = await tx(STORES.shares, 'readonly');
    return reqToPromise(store.getAll());
  }

  async function putShare(share) {
    const store = await tx(STORES.shares, 'readwrite');
    return reqToPromise(store.put(share));
  }

  async function removeShare(id) {
    const store = await tx(STORES.shares, 'readwrite');
    return reqToPromise(store.delete(id));
  }

  async function removeSharesForNote(noteId) {
    const db = await open();
    const t = db.transaction(STORES.shares, 'readwrite');
    const store = t.objectStore(STORES.shares);
    const req = store.index('noteId').getAll(noteId);
    req.onsuccess = () => {
      for (const share of req.result || []) store.delete(share.id);
    };
    return transactionDone(t);
  }

  async function pruneExpiredShares(now) {
    const db = await open();
    const t = db.transaction(STORES.shares, 'readwrite');
    const store = t.objectStore(STORES.shares);
    // Upper bound is exclusive: a share expiring exactly now is not yet dead.
    const req = store.index('expiresAt').getAll(IDBKeyRange.upperBound(now, true));
    let removed = [];
    req.onsuccess = () => {
      removed = req.result || [];
      for (const share of removed) store.delete(share.id);
    };
    await transactionDone(t);
    return removed;
  }

  async function clearAllStores() {
    const db = await open();
    const t = db.transaction(
      [STORES.notes, STORES.drafts, STORES.revisions, STORES.folders, STORES.shares],
      'readwrite'
    );
    t.objectStore(STORES.notes).clear();
    t.objectStore(STORES.drafts).clear();
    t.objectStore(STORES.revisions).clear();
    t.objectStore(STORES.folders).clear();
    t.objectStore(STORES.shares).clear();
    return transactionDone(t);
  }

  window.ScratchpadDB = {
    getAll,
    get,
    put,
    putIfUnchanged,
    remove,
    clear,
    bulkPut,
    getDraft,
    putDraft,
    removeDraft,
    getAllDrafts,
    getAllFolders,
    putFolder,
    removeFolder,
    bulkPutFolders,
    getRevisions,
    putRevision,
    pruneRevisions,
    getAllRevisions,
    bulkPutRevisions,
    importRecords,
    deleteNoteEverywhere,
    clearAllStores,
    getSharesForNote,
    getAllShares,
    putShare,
    removeShare,
    removeSharesForNote,
    pruneExpiredShares,
  };
})();
