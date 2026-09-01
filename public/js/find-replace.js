// @ts-check
/* Scratchpad find and replace. Exposes window.ScratchpadFind.
   The bar is an overlay tool for the note editor. It owns its keyboard
   surface — a capture-phase window listener answers Cmd/Ctrl+F and Escape
   before the global shortcut handler — and hides itself whenever the editor
   textarea hides, mirroring every edit-mode exit without app.js hooks.
   Bar state (open, case, regex) is runtime-only and never persisted. */
{
  ('use strict');

  /** @typedef {{ bar: HTMLElement, input: HTMLInputElement, caseToggle: HTMLButtonElement, regexToggle: HTMLButtonElement, close: HTMLButtonElement }} FindEls */
  /** @typedef {{ editor: HTMLTextAreaElement, onDirty?: () => void }} FindDeps */
  /** @typedef {{ init(deps: FindDeps): void, open(): void, close(returnFocus?: boolean): void, isOpen(): boolean }} FindApi */

  /** @type {FindEls | null} */
  let els = null;
  /** @type {HTMLTextAreaElement | null} */
  let editor = null;
  /** @type {(() => void) | null} */
  let onDirty = null;
  let barOpen = false;
  let caseSensitive = false;
  let regexMode = false;

  /** @returns {FindEls | null} */
  function lookup() {
    const bar = document.getElementById('find-bar');
    const input = document.getElementById('find-input');
    const caseToggle = document.getElementById('find-case-toggle');
    const regexToggle = document.getElementById('find-regex-toggle');
    const close = document.getElementById('find-close');
    if (!bar || !input || !caseToggle || !regexToggle || !close) return null;
    return {
      bar,
      input: /** @type {HTMLInputElement} */ (input),
      caseToggle: /** @type {HTMLButtonElement} */ (caseToggle),
      regexToggle: /** @type {HTMLButtonElement} */ (regexToggle),
      close: /** @type {HTMLButtonElement} */ (close),
    };
  }

  function isOpen() {
    return barOpen;
  }

  /**
   * @param {boolean} [returnFocus]
   */
  function close(returnFocus) {
    if (!els || !barOpen) return;
    barOpen = false;
    els.bar.hidden = true;
    if (returnFocus !== false && editor && !editor.hidden) editor.focus();
  }

  function open() {
    if (!els || !editor || editor.hidden) return;
    barOpen = true;
    els.bar.hidden = false;
    els.input.focus();
  }

  function anyDialogOpen() {
    return document.querySelector('dialog[open]') !== null;
  }

  /**
   * Capture-phase listener: answers before the app's global shortcut handler.
   * Cmd/Ctrl+F opens the bar while editing; Escape closes it first. Both
   * stand down while a modal dialog is open so the dialog keeps priority.
   * @param {KeyboardEvent} event
   */
  function onGlobalKey(event) {
    if (anyDialogOpen() || !els || !editor) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && !event.shiftKey && (event.key === 'f' || event.key === 'F')) {
      if (editor.hidden) return; // browsing: let the browser's find run
      event.preventDefault();
      event.stopPropagation();
      open();
      return;
    }
    if (event.key === 'Escape' && barOpen) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  /**
   * @param {FindDeps} deps
   */
  function init(deps) {
    els = els || lookup();
    if (!els) return;
    editor = deps.editor || null;
    onDirty = typeof deps.onDirty === 'function' ? deps.onDirty : null;
    if (!editor) return;

    els.close.addEventListener('click', () => close());
    window.addEventListener('keydown', onGlobalKey, true);

    els.caseToggle.addEventListener('click', () => {
      caseSensitive = !caseSensitive;
      els && els.caseToggle.setAttribute('aria-pressed', caseSensitive ? 'true' : 'false');
    });
    els.regexToggle.addEventListener('click', () => {
      regexMode = !regexMode;
      els && els.regexToggle.setAttribute('aria-pressed', regexMode ? 'true' : 'false');
    });

    // Leaving edit mode hides the textarea on every exit path; mirror it.
    new MutationObserver(() => {
      if (editor && editor.hidden) close(false);
    }).observe(editor, { attributeFilter: ['hidden'] });
  }

  /** @type {FindApi} */
  window.ScratchpadFind = { init, open, close, isOpen };
}
