// @ts-check
/* Remembers the scroll and caret for each note in this browser. The place
   lives in localStorage, outside the note, so a backup stays a backup. */
'use strict';
{
  const KEY = 'scratchpad:place';
  const MAX_NOTES = 200;

  /** @typedef {{ read: number | null, edit: number | null, caret: number | null, at: number }} Place */
  /** @typedef {Window & typeof globalThis & { ScratchpadPlace?: { hold(id: string | null): void, restore(id: string, editing: boolean, freshEntry: boolean): void } }} PlaceWindow */

  /** @type {PlaceWindow} */
  const root = window;
  /** @type {string | null} */
  let heldId = null;
  let suspended = false;
  let epoch = 0;

  /** @returns {Record<string, Place>} */
  function readMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** @param {string | null} id @returns {Place | null} */
  function placeFor(id) {
    if (!id) return null;
    const place = readMap()[id];
    return place && typeof place === 'object' ? place : null;
  }

  /** @param {unknown} value @returns {value is number} */
  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  /** @param {string} id @param {Partial<Place>} patch */
  function remember(id, patch) {
    if (!id || suspended) return;
    const map = readMap();
    const prev = /** @type {Partial<Place>} */ (map[id] && typeof map[id] === 'object' ? map[id] : {});
    map[id] = {
      read: finite(prev.read) ? prev.read : null,
      edit: finite(prev.edit) ? prev.edit : null,
      caret: finite(prev.caret) ? prev.caret : null,
      at: Date.now(),
      ...patch,
    };
    const ids = Object.keys(map);
    if (ids.length > MAX_NOTES) {
      ids.sort((a, b) => (map[a].at || 0) - (map[b].at || 0));
      for (const stale of ids.slice(0, ids.length - MAX_NOTES)) delete map[stale];
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
      /* private mode can refuse the write */
    }
  }

  /* Scroll and selection events arrive many times a second, and each
     remember() rewrites the whole map, so they coalesce into one write per
     WRITE_DELAY_MS. hold() and pagehide flush from the live DOM instead, so
     a pending patch is dropped there rather than written late for the wrong
     note. */
  const WRITE_DELAY_MS = 250;
  /** @type {{ id: string, patch: Partial<Place>, timer: number } | null} */
  let pending = null;

  function cancelPending() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }

  /** @param {string} id @param {Partial<Place>} patch */
  function schedule(id, patch) {
    if (!id || suspended) return;
    if (pending && pending.id === id) {
      pending.patch = { ...pending.patch, ...patch };
      return;
    }
    cancelPending();
    const timer = window.setTimeout(() => {
      const due = pending;
      pending = null;
      if (due && !suspended && heldId === due.id) remember(due.id, due.patch);
    }, WRITE_DELAY_MS);
    pending = { id, patch, timer };
  }

  function card() {
    return document.querySelector('.editor-card');
  }

  function field() {
    const node = document.getElementById('note-editor');
    return node instanceof HTMLTextAreaElement ? node : null;
  }

  /** @param {string} id */
  function flush(id) {
    cancelPending();
    const scroller = card();
    const editor = field();
    if (!scroller || !editor) return;
    if (!editor.hidden) {
      const caret = editor.selectionStart == null ? 0 : editor.selectionStart;
      remember(id, { edit: editor.scrollTop, caret });
      return;
    }
    remember(id, { read: scroller.scrollTop });
  }

  /** @param {string | null} id */
  function hold(id) {
    if (!suspended && heldId) flush(heldId);
    cancelPending();
    epoch += 1;
    suspended = true;
    heldId = id || null;
  }

  function onReadScroll() {
    if (suspended || !heldId) return;
    const scroller = card();
    if (!scroller || scroller.classList.contains('is-editing')) return;
    schedule(heldId, { read: scroller.scrollTop });
  }

  function onEditScroll() {
    if (suspended || !heldId) return;
    const editor = field();
    if (!editor || editor.hidden) return;
    schedule(heldId, { edit: editor.scrollTop });
  }

  function onSelection() {
    if (suspended || !heldId) return;
    const editor = field();
    if (!editor || editor.hidden || document.activeElement !== editor) return;
    const caret = editor.selectionStart == null ? 0 : editor.selectionStart;
    schedule(heldId, { caret, edit: editor.scrollTop });
  }

  function onHide() {
    if (!suspended && heldId) flush(heldId);
  }

  /** @type {() => void} */
  let releaseScrollGuard = () => {};

  /** @param {HTMLTextAreaElement} editor @param {number} caret */
  function pinCaret(editor, caret) {
    const next = Math.min(Math.max(0, caret), editor.value.length);
    if (editor.selectionStart === next && editor.selectionEnd === next) return;
    editor.setSelectionRange(next, next);
  }

  /** @param {HTMLTextAreaElement} editor @param {number} top */
  function pinScroll(editor, top) {
    if (editor.scrollTop !== top) editor.scrollTop = top;
  }

  /* Firefox scrolls a focused caret into view after focus listeners return.
     Put a saved scroll back until that pass ends. A new edit has nothing
     saved, so the reader's own scroll is left alone. */
  /** @param {HTMLTextAreaElement} editor @param {number} top */
  function defendScroll(editor, top) {
    releaseScrollGuard();
    let locked = true;
    /** @type {number} */
    let frame = 0;
    const unlock = () => {
      if (!locked) return;
      locked = false;
      cancelAnimationFrame(frame);
      editor.removeEventListener('scroll', onScroll);
      editor.removeEventListener('pointerdown', unlock);
      editor.removeEventListener('keydown', unlock);
      editor.removeEventListener('wheel', unlock);
    };
    const onScroll = () => {
      if (!locked || editor.scrollTop === top) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (locked) pinScroll(editor, top);
      });
    };
    releaseScrollGuard = unlock;
    editor.addEventListener('scroll', onScroll);
    editor.addEventListener('pointerdown', unlock);
    editor.addEventListener('keydown', unlock);
    editor.addEventListener('wheel', unlock, { passive: true });
    window.setTimeout(unlock, 400);
  }

  /** @param {HTMLTextAreaElement} editor @param {Place | null} place */
  function applyEdit(editor, place) {
    const caret = place && finite(place.caret) ? place.caret : 0;
    const top = place && finite(place.edit) ? place.edit : 0;
    const saved = !!(place && (finite(place.edit) || finite(place.caret)));
    pinCaret(editor, caret);
    pinScroll(editor, top);
    editor.addEventListener(
      'focus',
      () => {
        pinCaret(editor, caret);
        pinScroll(editor, top);
        if (saved) defendScroll(editor, top);
      },
      { once: true },
    );
  }

  /** @param {Element} scroller @param {Place | null} place */
  function applyRead(scroller, place) {
    const top = place && finite(place.read) ? place.read : 0;
    scroller.scrollTop = top;
    // A later frame only repairs a browser reset back to the top. It must
    // not stamp out a scroll the reader made while the render was settling.
    if (top === 0) return;
    requestAnimationFrame(() => {
      if (suspended && scroller.scrollTop === 0) scroller.scrollTop = top;
    });
  }

  function releaseSoon() {
    const token = epoch;
    const id = heldId;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (token !== epoch) return;
        suspended = false;
        if (id && heldId === id) flush(id);
      });
    });
  }

  /** @param {string} id @param {boolean} editing @param {boolean} freshEntry */
  function restore(id, editing, freshEntry) {
    releaseScrollGuard();
    heldId = id || null;
    const place = placeFor(id);
    const scroller = card();
    const editor = field();
    if (editing && editor && freshEntry) applyEdit(editor, place);
    else if (!editing && scroller) applyRead(scroller, place);
    releaseSoon();
  }

  function boot() {
    const scroller = card();
    const editor = field();
    if (scroller) scroller.addEventListener('scroll', onReadScroll, { passive: true });
    if (editor) editor.addEventListener('scroll', onEditScroll, { passive: true });
    document.addEventListener('selectionchange', onSelection);
    window.addEventListener('pagehide', onHide);
  }

  boot();
  root.ScratchpadPlace = Object.freeze({ hold, restore });
}
