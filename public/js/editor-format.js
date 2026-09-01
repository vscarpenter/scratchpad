// @ts-check
/* Markdown formatting chips for the note editor. Exposes
   window.ScratchpadFormat.apply(editor, format). Pure DOM/text mutation in the
   dialogs.js style: wraps or prefixes the textarea's selection, lands the
   caret where the inserted markup expects it, and dispatches the same input
   event a typed keystroke would — so drafts, autosave, and the dirty flow in
   app.js treat chip edits exactly like keyboard edits. */
{
  ('use strict');

  /** @typedef {{ apply(editor: HTMLTextAreaElement, format: string): void }} FormatApi */

  /**
   * Wraps the selection (or a fallback placeholder) and reports the inner
   * range the caret should select afterward — matching what a typed edit
   * would leave behind.
   * @param {number} start
   * @param {number} end
   * @param {string} selected
   * @param {string} fallback
   * @param {string} prefix
   * @param {string} suffix
   */
  function wrapRange(start, end, selected, fallback, prefix, suffix) {
    const text = selected || fallback;
    const innerStart = start + prefix.length;
    const innerEnd = innerStart + text.length;
    return { replacement: prefix + text + suffix, nextStart: innerStart, nextEnd: innerEnd };
  }

  /**
   * Builds the replacement plan for one chip, or null when the format is
   * unknown. Prefix formats select the text after the marker; link selects
   * the label (or the URL when text was already selected).
   * @param {string} format
   * @param {number} start
   * @param {string} selected
   */
  function build(format, start, selected) {
    switch (format) {
      case 'bold':
        return wrapRange(start, start, selected, 'bold text', '**', '**');
      case 'italic':
        return wrapRange(start, start, selected, 'italic text', '*', '*');
      case 'code':
        return wrapRange(start, start, selected, 'code', '`', '`');
      case 'link': {
        const text = selected || 'link text';
        const url = 'https://example.com';
        const replacement = '[' + text + '](' + url + ')';
        const nextStart = selected ? start + text.length + 3 : start + 1;
        const nextEnd = selected ? nextStart + url.length : nextStart + text.length;
        return { replacement, nextStart, nextEnd };
      }
      case 'h2': {
        const text = selected || 'Heading';
        return { replacement: '## ' + text, nextStart: start + 3, nextEnd: start + 3 + text.length };
      }
      case 'list': {
        const text = selected || 'List item';
        return { replacement: '- ' + text, nextStart: start + 2, nextEnd: start + 2 + text.length };
      }
      case 'quote': {
        const text = selected || 'Quote';
        return { replacement: '> ' + text, nextStart: start + 2, nextEnd: start + 2 + text.length };
      }
      default:
        return null;
    }
  }

  /**
   * @param {HTMLTextAreaElement} editor
   * @param {string} format
   */
  function apply(editor, format) {
    if (editor.hidden) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const plan = build(format, start, editor.value.slice(start, end));
    if (!plan) return;
    editor.setRangeText(plan.replacement, start, end, 'end');
    editor.focus();
    editor.setSelectionRange(plan.nextStart, plan.nextEnd);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** @type {FormatApi} */
  window.ScratchpadFormat = { apply };
}
