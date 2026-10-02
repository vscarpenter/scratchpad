// @ts-check
// Atomic metadata patches never recreate a deleted management record. Keep this
// separate from the legacy DB wrapper so its structure ratchet only decreases.
{
  /** @typedef {import('../../types/sharing').Share} Share */
  /** @type {Window & { ScratchpadDB?: any }} */
  const root = window;
  const db = root.ScratchpadDB;

  /** @param {string} id @returns {Promise<Share | undefined>} */
  async function getShare(id) {
    const store = await db.tx('shares', 'readonly');
    return db.reqToPromise(store.get(id));
  }

  /** @param {string} id @param {Partial<Share>} changes @param {string} [operationId] */
  async function patchShare(id, changes, operationId) {
    const store = await db.tx('shares', 'readwrite');
    const done = db.transactionDone(store.transaction);
    let changed = false;
    const request = store.get(id);
    request.onsuccess = () => {
      /** @type {Share | undefined} */
      const current = request.result;
      if (!current || (operationId && current.pendingUpdate?.operationId !== operationId)) return;
      store.put({ ...current, ...changes });
      changed = true;
    };
    await done;
    return changed;
  }

  Object.assign(db, { getShare, patchShare });
}
