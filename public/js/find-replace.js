// @ts-check
/* Scratchpad find and replace. Exposes window.ScratchpadFind.
   The bar is an overlay tool for the note editor. It owns its keyboard
   surface — a capture-phase window listener answers Cmd/Ctrl+F and Escape
   before the global shortcut handler — and hides itself whenever the editor
   textarea hides, mirroring every edit-mode exit without app.js hooks.
   Bar state (open, case, regex, query) is runtime-only and never persisted. */
{
  ('use strict');

  /** @typedef {{ start: number, end: number }} MatchRange */
  /** @typedef {{ bar: HTMLElement, input: HTMLInputElement, count: HTMLElement, caseToggle: HTMLButtonElement, regexToggle: HTMLButtonElement, close: HTMLButtonElement, notice: HTMLElement, live: HTMLElement, replaceInput: HTMLInputElement, replaceBtn: HTMLButtonElement, replaceAllBtn: HTMLButtonElement }} FindEls */
  /** @typedef {{ editor: HTMLTextAreaElement, onToast?: (message: string) => void }} FindDeps */
  /** @typedef {{ init(deps: FindDeps): void, open(): void, close(returnFocus?: boolean): void, isOpen(): boolean, editorFocus(target: HTMLTextAreaElement): void }} FindApi */
  /** @typedef {{ reset?: boolean, present?: boolean }} RefreshOptions */

  /** @type {FindEls | null} */
  let els = null;
  /** @type {HTMLTextAreaElement | null} */
  let editor = null;
  /** @type {(() => void) | null} */
  let onToast = null;
  let barOpen = false;
  let caseSensitive = false;
  let regexMode = false;
  /** @type {MatchRange[]} */
  let matches = [];
  let matchIndex = 0;
  let invalid = false;

  /** @returns {FindEls | null} */
  function lookup() {
    const bar = document.getElementById('find-bar');
    const input = document.getElementById('find-input');
    const count = document.getElementById('find-count');
    const caseToggle = document.getElementById('find-case-toggle');
    const regexToggle = document.getElementById('find-regex-toggle');
    const close = document.getElementById('find-close');
    const notice = document.getElementById('find-notice');
    const live = document.getElementById('find-live');
    const replaceInput = document.getElementById('find-replace-input');
    const replaceBtn = document.getElementById('find-replace-btn');
    const replaceAllBtn = document.getElementById('find-replace-all-btn');
    if (
      ![bar, input, count, caseToggle, regexToggle, close, notice, live, replaceInput, replaceBtn, replaceAllBtn].every(
        Boolean,
      )
    ) {
      return null;
    }
    return {
      bar,
      input: /** @type {HTMLInputElement} */ (input),
      count,
      caseToggle: /** @type {HTMLButtonElement} */ (caseToggle),
      regexToggle: /** @type {HTMLButtonElement} */ (regexToggle),
      close: /** @type {HTMLButtonElement} */ (close),
      notice,
      live,
      replaceInput: /** @type {HTMLInputElement} */ (replaceInput),
      replaceBtn: /** @type {HTMLButtonElement} */ (replaceBtn),
      replaceAllBtn: /** @type {HTMLButtonElement} */ (replaceAllBtn),
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
    refresh({ reset: true, present: true });
  }

  function anyDialogOpen() {
    return document.querySelector('dialog[open]') !== null;
  }

  /**
   * Schedules caret focus for the editor, yielding to an open find bar so a
   * stale timer from an Edit click can never steal focus from the query.
   * @param {HTMLTextAreaElement} target
   */
  function editorFocus(target) {
    setTimeout(() => {
      if (!barOpen) target.focus();
    }, 0);
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
   * Literal, whole-string matches over a case-folded haystack when the
   * case chip is off. Non-overlapping, in document order.
   * @param {string} text
   * @param {string} query
   * @returns {MatchRange[]}
   */
  function literalMatches(text, query) {
    const found = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf(query, from);
      if (at === -1) return found;
      found.push({ start: at, end: at + query.length });
      from = at + query.length;
    }
  }

  /**
   * Global regex matches, or null when the pattern does not compile.
   * @param {string} text
   * @param {string} query
   * @returns {MatchRange[] | null}
   */
  function regexMatches(text, query) {
    let pattern;
    try {
      pattern = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } catch {
      return null;
    }
    const found = [];
    let match = pattern.exec(text);
    while (match !== null) {
      found.push({ start: match.index, end: match.index + match[0].length });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1; // zero-length guard
      match = pattern.exec(text);
    }
    return found;
  }

  function onBarKey(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) replaceCurrent();
    else cycle(event.shiftKey ? -1 : 1);
  }

  /**
   * Moves the index by step with wraparound and shows the new match. Does
   * not recompute — Enter never changes the text.
   * @param {number} step
   */
  function cycle(step) {
    if (!matches.length || invalid) return;
    matchIndex = (matchIndex + step + matches.length) % matches.length;
    announce();
    present();
  }

  /** Writes counter, notice, and the polite live region. */
  function announce() {
    if (!els) return;
    if (invalid) {
      els.count.hidden = true;
      els.notice.hidden = false;
      if (els.live.textContent !== 'Invalid pattern') els.live.textContent = 'Invalid pattern';
      return;
    }
    els.notice.hidden = true;
    if (!els.input.value) {
      els.count.hidden = true;
      if (els.live.textContent !== '') els.live.textContent = '';
      return;
    }
    const label = (matches.length ? matchIndex + 1 : 0) + ' of ' + matches.length;
    els.count.hidden = false;
    els.count.textContent = label;
    if (els.live.textContent !== label) els.live.textContent = label;
    const actionable = matches.length > 0 && !invalid;
    els.replaceBtn.disabled = !actionable;
    els.replaceAllBtn.disabled = !actionable;
  }

  /** Swaps the focused match for the replacement text and leaves the caret at its end. */
  function replaceCurrent() {
    if (!els || !editor || invalid || !matches.length) return;
    const match = matches[matchIndex];
    const replacement = regexMode
      ? editor.value
          .slice(match.start, match.end)
          .replace(new RegExp(els.input.value, caseSensitive ? '' : 'i'), els.replaceInput.value)
      : els.replaceInput.value;
    editor.setRangeText(replacement, match.start, match.end, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Rewrites every match in one value change, then toasts the count. */
  function replaceAllMatches() {
    if (!els || !editor || invalid || !matches.length) return;
    const replacement = els.replaceInput.value;
    const count = matches.length;
    if (regexMode) {
      editor.value = editor.value.replace(new RegExp(els.input.value, caseSensitive ? 'g' : 'gi'), replacement);
    } else {
      let value = editor.value;
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        value = value.slice(0, match.start) + replacement + value.slice(match.end);
      }
      editor.value = value;
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof onToast === 'function') {
      onToast('Replaced ' + count + (count === 1 ? ' occurrence' : ' occurrences'));
    }
  }

  /** Shows the focused match as the textarea's native selection. */
  function present() {
    if (!els || !editor || !matches.length) return;
    const match = matches[matchIndex];
    editor.setSelectionRange(match.start, match.end, 'forward');
    // Focus for a frame so the browser scrolls the caret into view, then
    // hand focus straight back to the query field.
    editor.focus();
    els.input.focus();
  }

  /**
   * Recomputes matches against the current text and re-announces. Present is
   * false when the editor itself changed — the user's caret is busy.
   * @param {RefreshOptions} [options]
   */
  function refresh(options) {
    if (!els || !editor) return;
    const opts = options || {};
    if (opts.reset) matchIndex = 0;
    const query = els.input.value;
    invalid = false;
    if (!query) {
      matches = [];
    } else if (regexMode) {
      const found = regexMatches(editor.value, query);
      if (found === null) {
        invalid = true;
        matches = [];
      } else {
        matches = found;
      }
    } else {
      const fold = (text) => (caseSensitive ? text : text.toLowerCase());
      matches = literalMatches(fold(editor.value), fold(query));
    }
    if (matchIndex >= matches.length) matchIndex = 0;
    announce();
    if (opts.present) present();
  }

  /**
   * @param {FindDeps} deps
   */
  function init(deps) {
    els = els || lookup();
    if (!els) return;
    editor = deps.editor || null;
    onToast = typeof deps.onToast === 'function' ? deps.onToast : null;
    if (!editor) return;

    els.close.addEventListener('click', () => close());
    window.addEventListener('keydown', onGlobalKey, true);
    els.bar.addEventListener('keydown', onBarKey);
    els.replaceBtn.addEventListener('click', replaceCurrent);
    els.replaceAllBtn.addEventListener('click', replaceAllMatches);

    els.input.addEventListener('input', () => refresh({ reset: true, present: true }));
    editor.addEventListener('input', () => {
      if (barOpen) refresh({});
    });

    els.caseToggle.addEventListener('click', () => {
      caseSensitive = !caseSensitive;
      els && els.caseToggle.setAttribute('aria-pressed', caseSensitive ? 'true' : 'false');
      refresh({ reset: true, present: true });
    });
    els.regexToggle.addEventListener('click', () => {
      regexMode = !regexMode;
      els && els.regexToggle.setAttribute('aria-pressed', regexMode ? 'true' : 'false');
      refresh({ reset: true, present: true });
    });

    // Leaving edit mode hides the textarea on every exit path; mirror it.
    new MutationObserver(() => {
      if (editor && editor.hidden) close(false);
    }).observe(editor, { attributeFilter: ['hidden'] });
  }

  /** @type {FindApi} */
  window.ScratchpadFind = { init, open, close, isOpen, editorFocus };
}
