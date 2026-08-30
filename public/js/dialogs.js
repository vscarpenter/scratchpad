// @ts-check
/* Chronicle dialog helpers: pure builders for dialog content that app.js
   renders. No state and no network — everything works on the values and the
   document passed in through the DOM globals. */
{
  ('use strict');

  /** @typedef {{ newCount: number, conflicts: number, invalid: number, invalidFolders: number, invalidRevisions: number, revisions: unknown[], folders: unknown[] }} ImportPreview */

  /**
   * @param {string} tag
   * @param {string} text
   */
  function textEl(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  /**
   * One stat card per count, in the order the import tests pin: new,
   * conflicts, rejected entries, revision snapshots, rejected revisions,
   * folders. Each card is a div wrapping the dt/dd pair.
   * @param {ImportPreview} preview
   */
  function importPreviewRows(preview) {
    const rows = [
      ['New notes', preview.newCount],
      ['Conflicts', preview.conflicts],
      ['Rejected entries', preview.invalid + preview.invalidFolders],
      ['Revision snapshots', preview.revisions.length],
      ['Rejected revisions', preview.invalidRevisions],
      ['Folders', preview.folders.length],
    ];
    return rows.map(([label, value]) => {
      const card = document.createElement('div');
      card.append(textEl('dt', String(label)), textEl('dd', String(value)));
      return card;
    });
  }

  /**
   * @param {string[]} rejected
   */
  function importRejectedContent(rejected) {
    const shown = rejected.slice(0, 5);
    const items = shown.map((message) => textEl('li', message));
    if (rejected.length > shown.length) {
      const extra = rejected.length - shown.length;
      items.push(textEl('li', `${extra} more rejected entr${extra === 1 ? 'y' : 'ies'}.`));
    }
    const list = document.createElement('ul');
    list.append(...items);
    return [textEl('p', 'Skipped invalid import content'), list];
  }

  /**
   * The primary button states the outcome for the selected conflict mode.
   * Folders and revisions ride along silently, so an import that writes no
   * notes keeps the generic label.
   * @param {ImportPreview | null | undefined} preview
   * @param {string} mode
   */
  function importOutcomeLabel(preview, mode) {
    if (!preview) return 'Import';
    const count = mode === 'skip' ? preview.newCount : preview.newCount + preview.conflicts;
    if (count < 1) return 'Import';
    return count === 1 ? 'Import 1 note' : `Import ${count} notes`;
  }

  /** @type {Window & typeof globalThis & { ScratchpadDialogs?: object }} */
  const root = window;
  root.ScratchpadDialogs = Object.freeze({ importPreviewRows, importRejectedContent, importOutcomeLabel });
}
