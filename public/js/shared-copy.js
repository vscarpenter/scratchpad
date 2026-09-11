// @ts-check
/* Save a shared note: the share viewer stashes the decrypted note for one same-tab
   navigation, and the app turns that stash into an ordinary note tagged "shared". */
{
  ('use strict');

  /** @typedef {{ v: 1, title: string, body: string, tags: string[] }} Stash */
  /** @typedef {{ id: string, title: string, body: string }} CopyNote */
  /** @typedef {{ title: number, body: number, tag: number, tags: number }} Limits */
  /**
   * @typedef {{
   *   notes(): CopyNote[],
   *   isTrashed(note: CopyNote): boolean,
   *   normalizeNote(note: object): CopyNote,
   *   normalizeTag(tag: string): string,
   *   putNoteRecord(note: CopyNote): Promise<unknown>,
   *   addNote(note: CopyNote): unknown,
   *   openNote(id: string): Promise<unknown>,
   *   uuid(): string,
   *   now(): number,
   *   toast(message: string, opts?: { tone: string }): void,
   *   limits: Limits,
   * }} Deps
   */

  const STASH_KEY = 'scratchpad:pendingSharedNote';
  const SHARED_TAG = 'shared';
  /** @type {Deps | null} */
  let deps = null;

  /** Viewer side. Throws when the browser refuses session storage. @param {{ title?: unknown, body?: unknown, tags?: unknown }} note */
  function stash(note) {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ v: 1, title: note.title, body: note.body, tags: note.tags }));
  }

  // Read and delete before any await, so a reload or a second call cannot replay it.
  /** @returns {string | null} */
  function takeStash() {
    const raw = sessionStorage.getItem(STASH_KEY);
    sessionStorage.removeItem(STASH_KEY);
    return raw;
  }

  /** @param {unknown} value @param {number} max @returns {value is string} */
  function isText(value, max) {
    return typeof value === 'string' && value.length <= max;
  }

  // The stash came from a remote share, so it has to meet the JSON import limits.
  /** @param {Deps} api @param {string} raw @returns {Stash | null} */
  function parseStash(api, raw) {
    /** @type {any} */
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!value || value.v !== 1 || !Array.isArray(value.tags)) return null;
    const { limits } = api;
    /** @type {unknown[]} */
    const tags = value.tags;
    if (!isText(value.title, limits.title) || !isText(value.body, limits.body) || tags.length > limits.tags)
      return null;
    const tagsFit = tags.every((tag) => typeof tag === 'string' && api.normalizeTag(tag).length <= limits.tag);
    return tagsFit ? { v: 1, title: value.title, body: value.body, tags: /** @type {string[]} */ (tags) } : null;
  }

  /** @param {Deps} api @param {Stash} note */
  function findSaved(api, note) {
    return api.notes().find((saved) => !api.isTrashed(saved) && saved.title === note.title && saved.body === note.body);
  }

  /** @param {Deps} api @param {Stash} note */
  async function createCopy(api, note) {
    const t = api.now();
    const copy = api.normalizeNote({
      id: api.uuid(),
      title: note.title,
      body: note.body,
      tags: [...note.tags, SHARED_TAG],
      pinned: false,
      folderId: null,
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
      deletedAt: null,
      lastDraftAt: null,
    });
    await api.putNoteRecord(copy);
    api.addNote(copy);
    await api.openNote(copy.id);
    api.toast('Saved to your Scratchpad.');
  }

  /** App side, called from the save-shared action URL after notes load. */
  async function saveStashed() {
    const raw = takeStash();
    if (raw === null || !deps) return;
    const api = deps;
    const note = parseStash(api, raw);
    if (!note) {
      api.toast("Couldn't save the shared note.", { tone: 'error' });
      return;
    }
    const saved = findSaved(api, note);
    if (saved) {
      await api.openNote(saved.id);
      api.toast('This note is already in your Scratchpad.', { tone: 'info' });
      return;
    }
    await createCopy(api, note);
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
  }

  /** @type {Window & typeof globalThis & { ScratchpadSharedCopy?: object }} */
  const root = window;
  root.ScratchpadSharedCopy = Object.freeze({ stash, init, saveStashed });
}
