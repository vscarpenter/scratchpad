// @ts-check
/* Narrow-screen pane switching. Below 768px the shell shows either the note
   list or the editor, never both, so a switch hides the pane that held
   keyboard focus. sync() sets the shell classes from state. focusPane() then
   moves focus into the pane that appeared: the note title on the way in, the
   note's own row (or New note) on the way back. */
'use strict';
{
  const NARROW = '(max-width: 767px)';

  function isNarrow() {
    return window.matchMedia(NARROW).matches;
  }

  /**
   * @param {HTMLElement} shell
   * @param {{ mobileView: string, selectedId: string | null }} state
   */
  function sync(shell, state) {
    if (!isNarrow()) {
      shell.classList.remove('mobile-list', 'mobile-editor');
      return;
    }
    shell.classList.toggle('mobile-editor', state.mobileView === 'editor' && !!state.selectedId);
    shell.classList.toggle('mobile-list', state.mobileView === 'list' || !state.selectedId);
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
