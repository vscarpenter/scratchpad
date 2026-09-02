// @ts-check
/* Paste as Markdown: converts text/html clipboard payloads before they enter the note editor. */
{
  ('use strict');

  /** @typedef {{ convert(html: string): string }} Converter */

  /** @type {Window & typeof globalThis & { ScratchpadHtmlToMarkdown?: Converter, ScratchpadPaste?: { bind(editor: HTMLTextAreaElement): void } }} */
  const root = window;

  /** @param {string} text */
  function collapse(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** @param {DataTransfer} data @returns {string | null} */
  function markdownFor(data) {
    if (data.files && data.files.length) return null;
    const html = data.getData('text/html');
    const converter = root.ScratchpadHtmlToMarkdown;
    if (!html || !converter) return null;
    const markdown = converter.convert(html);
    if (!markdown || collapse(markdown) === collapse(data.getData('text/plain'))) return null;
    return markdown;
  }

  /** @param {HTMLTextAreaElement} editor @param {string} text */
  function insert(editor, text) {
    editor.focus();
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (_error) {
      inserted = false;
    }
    if (inserted) return;
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** @param {ClipboardEvent} event @param {HTMLTextAreaElement} editor */
  function onPaste(event, editor) {
    const data = event.clipboardData;
    if (!data) return;
    let markdown = null;
    try {
      markdown = markdownFor(data);
    } catch (_error) {
      return;
    }
    if (markdown === null) return;
    event.preventDefault();
    insert(editor, markdown);
  }

  /** @param {HTMLTextAreaElement} editor */
  function bind(editor) {
    editor.addEventListener('paste', (event) => onPaste(event, editor));
  }

  root.ScratchpadPaste = Object.freeze({ bind });
}
