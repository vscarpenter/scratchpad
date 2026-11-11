// @ts-check
/* Narrow-screen pane switching. Below 1100px the shell shows either the note
   list or the editor, never both, so a switch hides the pane that held
   keyboard focus. sync() sets the shell classes from state. focusPane() then
   moves focus into the pane that appeared: the note title on the way in, the
   note's own row (or New note) on the way back. */
'use strict';
{
  const NARROW = '(max-width: 1099px)';

  function isNarrow() {
    return window.matchMedia(NARROW).matches;
  }

  // An open note is one step deeper than the list, so it owns a history
  // entry. The OS Back gesture then returns to the list and not out of the app.
  let unwinding = false;

  function noteInHistory() {
    return !!history.state && history.state.scratchpadPane === 'editor';
  }

  /** @param {boolean} noteOpen */
  function syncHistory(noteOpen) {
    if (noteOpen && !noteInHistory()) {
      history.pushState({ scratchpadPane: 'editor' }, '');
    } else if (!noteOpen && noteInHistory() && !unwinding) {
      // The list came back some other way; drop the note's entry once.
      unwinding = true;
      history.back();
    }
  }

  window.addEventListener('popstate', () => {
    unwinding = false;
    const shell = document.getElementById('app-shell');
    if (!isNarrow() || !shell || !shell.classList.contains('mobile-editor') || noteInHistory()) return;
    // The Back button already knows how to leave a note, unsaved edits included.
    document.getElementById('back-to-list')?.click();
  });

  /**
   * @param {HTMLElement} shell
   * @param {{ mobileView: string, selectedId: string | null }} state
   */
  function sync(shell, state) {
    if (!isNarrow()) {
      shell.classList.remove('mobile-list', 'mobile-editor');
      return;
    }
    const stage = state.mobileView === 'home' || (state.mobileView === 'editor' && !!state.selectedId);
    shell.classList.toggle('mobile-editor', stage);
    shell.classList.toggle('mobile-list', !stage);
    syncHistory(state.mobileView === 'editor' && !!state.selectedId);
  }

  /**
   * @param {{ shell: HTMLElement, titleDisplay: HTMLElement, noteList: HTMLElement, newNote: HTMLElement }} els
   * @param {{ selectedId: string | null }} state
   */
  function focusPane(els, state) {
    if (!isNarrow()) return;
    if (els.shell.classList.contains('mobile-editor')) {
      els.titleDisplay.focus();
      return;
    }
    const selector = '.note-row[data-id="' + CSS.escape(state.selectedId || '') + '"] .note-row-open';
    /** @type {HTMLElement | null} */
    const row = state.selectedId ? els.noteList.querySelector(selector) : null;
    (row || els.newNote).focus();
  }

  /** @type {Window & typeof globalThis & { ScratchpadMobileView?: object }} */
  const root = window;
  root.ScratchpadMobileView = Object.freeze({ isNarrow, sync, focusPane });
}
