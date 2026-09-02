// @ts-check
/* Unlinked mentions: plain-text occurrences of the open note's title in other notes. */
{
  ('use strict');

  /** @typedef {{ id: string, title?: string, body?: string, updatedAt?: number, archivedAt?: number | null, deletedAt?: number | null }} MentionNote */
  /** @typedef {{ note: MentionNote, excerpt: string, original: string }} Mention */
  /** @typedef {{ line: string, offset: number, index: number, original: string }} Hit */
  /** @typedef {{ notes(): MentionNote[], editing(): boolean, deriveTitle(note: MentionNote): string, isTrashed(note: MentionNote): boolean, isArchived(note: MentionNote): boolean, openNote(id: string): void, mutateNoteBody(id: string, transform: (body: string) => string): Promise<unknown>, getDrafts(): Promise<Array<{ noteId: string }>>, rerender(): void, toast(message: string): void }} Deps */

  const MIN_TITLE = 3;
  const MAX_ROWS = 50;
  /** @type {Deps | null} */
  let deps = null;
  let renderToken = 0;

  /** @type {Window & typeof globalThis & { ScratchpadMarkdown?: { scanOutsideFences(src: string, cb: (line: string, offset: number) => void): void }, ScratchpadMentions?: object }} */
  const root = window;

  /** @param {string} text */
  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** @param {string} line */
  function maskLine(line) {
    return line.replace(/\[\[[^\]\n]*\]\]|`[^`\n]*`/g, (match) => ' '.repeat(match.length));
  }

  /** @param {string} title */
  function eligible(title) {
    const clean = (title || '').trim();
    return clean.length >= MIN_TITLE && clean !== 'Untitled note';
  }

  /** @param {string} body @param {string} title @returns {Hit | null} */
  function firstMention(body, title) {
    const scan = root.ScratchpadMarkdown && root.ScratchpadMarkdown.scanOutsideFences;
    if (!scan || !eligible(title)) return null;
    const pattern = new RegExp('(^|[^\\p{L}\\p{N}])(' + escapeRegExp(title.trim()) + ')(?![\\p{L}\\p{N}])', 'iu');
    /** @type {Hit | null} */
    let found = null;
    scan(body || '', (line, offset) => {
      if (found) return;
      const match = pattern.exec(maskLine(line));
      if (match) found = { line, offset, index: match.index + match[1].length, original: match[2] };
    });
    return found;
  }

  /** @param {Hit} hit */
  function excerptFor(hit) {
    const start = Math.max(0, hit.index - 40);
    const end = Math.min(hit.line.length, hit.index + hit.original.length + 60);
    return (start > 0 ? '…' : '') + hit.line.slice(start, end).trim() + (end < hit.line.length ? '…' : '');
  }

  /** @param {MentionNote} note */
  function noteTime(note) {
    return note.deletedAt || note.archivedAt || note.updatedAt || 0;
  }

  /** @param {MentionNote[]} notes @param {string} title @param {string} excludeId @returns {Mention[]} */
  function findMentions(notes, title, excludeId) {
    /** @type {Mention[]} */
    const mentions = [];
    for (const note of notes) {
      if (note.id === excludeId || note.deletedAt) continue;
      const hit = firstMention(note.body || '', title);
      if (hit) mentions.push({ note, excerpt: excerptFor(hit), original: hit.original });
    }
    return mentions.sort((left, right) => noteTime(right.note) - noteTime(left.note)).slice(0, MAX_ROWS);
  }

  /** @param {string} body @param {string} title */
  function linkFirstMention(body, title) {
    const hit = firstMention(body, title);
    if (!hit) return body;
    const clean = title.trim();
    const link = hit.original === clean ? '[[' + clean + ']]' : '[[' + clean + '|' + hit.original + ']]';
    const at = hit.offset + hit.index;
    return body.slice(0, at) + link + body.slice(at + hit.original.length);
  }

  /** @param {string} tag @param {{ className?: string, text?: string, disabled?: boolean, title?: string, onClick?: () => void }} options */
  function element(tag, options) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.title) node.setAttribute('title', options.title);
    if (node instanceof HTMLButtonElement) {
      node.type = 'button';
      node.disabled = !!options.disabled;
    }
    if (options.onClick) node.addEventListener('click', options.onClick);
    return node;
  }

  /** @param {Mention} mention @param {string} title @param {boolean} hasDraft @param {Deps} api */
  function row(mention, title, hasDraft, api) {
    const li = element('li', { className: 'mention-row' });
    const label = api.deriveTitle(mention.note) + (api.isArchived(mention.note) ? ' · Archived' : '');
    li.append(
      element('button', { className: 'backlink-btn', text: label, onClick: () => api.openNote(mention.note.id) }),
      element('span', { className: 'mention-excerpt', text: mention.excerpt }),
      element('button', {
        className: 'mention-link-btn',
        text: hasDraft ? 'Unsaved changes' : 'Link',
        disabled: hasDraft,
        title: hasDraft
          ? 'This note has unsaved changes; save or discard them first.'
          : 'Turn this mention into a link',
        onClick: () => linkMention(mention, title, api),
      }),
    );
    return li;
  }

  /** @param {Mention} mention @param {string} title @param {Deps} api */
  async function linkMention(mention, title, api) {
    const result = await api.mutateNoteBody(mention.note.id, (body) => linkFirstMention(body, title));
    if (!result) return;
    api.toast('Linked in ' + api.deriveTitle(mention.note));
    api.rerender();
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
  }

  /** @param {MentionNote | null} note */
  async function render(note) {
    const section = document.getElementById('mentions-section');
    const summary = document.getElementById('mentions-summary');
    const list = document.getElementById('mentions-list');
    if (!deps || !section || !summary || !list) return;
    const api = deps;
    const token = (renderToken += 1);
    const show = !!note && !api.isTrashed(note) && !api.editing();
    const title = show && note ? api.deriveTitle(note) : '';
    const mentions = show && note ? findMentions(api.notes(), title, note.id) : [];
    section.hidden = !mentions.length;
    if (!mentions.length) {
      list.replaceChildren();
      return;
    }
    const drafts = new Set((await api.getDrafts()).map((draft) => draft.noteId));
    if (token !== renderToken) return;
    summary.textContent = 'Mentioned in ' + mentions.length + ' note' + (mentions.length === 1 ? '' : 's');
    list.replaceChildren(...mentions.map((mention) => row(mention, title, drafts.has(mention.note.id), api)));
  }

  root.ScratchpadMentions = Object.freeze({ findMentions, linkFirstMention, init, render });
}
