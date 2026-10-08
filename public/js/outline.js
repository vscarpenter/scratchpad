// @ts-check
/* Heading outline from ATX headings outside code fences. It shows once a
   note has two. Wide windows dock it. Narrower windows use a button.
   Buttons, not links, so a jump doesn't fight the wikilink hash. */
'use strict';
{
  const HEADING = /^( {0,3}(?:>\s*)*)(#{1,6})[ \t]+(.*)$/;
  // A Setext underline (=== or ---) directly under a paragraph; the same
  // forms marked renders as h1 and h2, so Edit keeps the reading outline.
  const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
  // Lines that start a block of their own and so cannot be a paragraph line.
  const BLOCK_START = /^\s*(?:#{1,6}[ \t]|>|[-*+][ \t]|\d+[.)][ \t]|```|~~~|\|)/;
  const MIN_HEADINGS = 2;
  const DOCK_QUERY = '(min-width: 1400px)';

  /** @typedef {{ level: number, label: string, offset: number }} Heading */
  /** @typedef {Window & typeof globalThis & { ScratchpadMarkdown?: { scanOutsideFences(src: string, cb: (line: string, offset: number) => void): void }, ScratchpadOutline?: { sync(): void, extractHeadings(src: string): Heading[] } }} OutlineWindow */

  /** @type {OutlineWindow} */
  const root = window;
  /** @type {HTMLButtonElement | null} */
  let button = null;
  /** @type {HTMLElement | null} */
  let nav = null;
  /** @type {HTMLOListElement | null} */
  let list = null;
  /** @type {HTMLTextAreaElement | null} */
  let editor = null;
  /** @type {HTMLElement | null} */
  let rendered = null;
  /** @type {HTMLElement | null} */
  let card = null;
  /** @type {HTMLElement | null} */
  let view = null;
  /** @type {MediaQueryList | null} */
  let dockQuery = null;
  /** @type {IntersectionObserver | null} */
  let spy = null;
  /** @type {Heading[]} */
  let headings = [];
  let popoverOpen = false;

  /** @param {string} raw */
  function plainHeading(raw) {
    let text = raw.replace(/\s+#+\s*$/, '').trim();
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => (alias || target).trim());
    text = text.replace(/`([^`]*)`/g, '$1');
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');
    text = text.replace(/~~(.*?)~~/g, '$1');
    return text.replace(/\s+/g, ' ').trim();
  }

  /** @typedef {{ offset: number, text: string }} Paragraph */

  /** A paragraph line that a Setext underline may turn into a heading. @param {string} line @param {number} offset @param {Paragraph | null} open */
  function extendParagraph(line, offset, open) {
    if (!line.trim() || BLOCK_START.test(line)) return null;
    const text = line.trim();
    if (open) return { offset: open.offset, text: open.text + ' ' + text };
    return { offset: offset + (line.length - line.trimStart().length), text };
  }

  /** @param {string} src @returns {Heading[]} */
  function extractHeadings(src) {
    /** @type {Heading[]} */
    const found = [];
    const scan = root.ScratchpadMarkdown && root.ScratchpadMarkdown.scanOutsideFences;
    if (!scan) return found;
    /** @type {Paragraph | null} */
    let open = null;
    scan(src || '', (line, offset) => {
      const match = HEADING.exec(line);
      if (match) {
        open = null;
        const label = plainHeading(match[3]);
        if (label) found.push({ level: match[2].length, label, offset: offset + match[1].length });
        return;
      }
      const underline = open ? SETEXT.exec(line) : null;
      if (underline && open) {
        const label = plainHeading(open.text);
        if (label) found.push({ level: underline[1][0] === '=' ? 1 : 2, label, offset: open.offset });
        open = null;
        return;
      }
      open = extendParagraph(line, offset, open);
    });
    return found;
  }

  /** @returns {Heading[]} */
  function renderedHeadings() {
    /** @type {Heading[]} */
    const found = [];
    if (!rendered) return found;
    for (const node of rendered.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) {
        node.removeAttribute('id');
        continue;
      }
      node.id = 'note-heading-' + found.length;
      found.push({ level: Number(node.tagName.slice(1)), label, offset: found.length });
    }
    return found;
  }

  /** @param {Heading} heading @param {number} index */
  function itemButton(heading, index) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'outline-link is-h' + heading.level;
    item.textContent = heading.label;
    item.title = heading.label;
    item.addEventListener('click', () => jump(index));
    return item;
  }

  function paint() {
    if (!list) return;
    list.replaceChildren(...headings.map((heading, index) => itemButton(heading, index)));
  }

  /** @param {number} index */
  function mark(index) {
    if (!list) return;
    const items = list.querySelectorAll('button');
    for (let i = 0; i < items.length; i += 1) {
      if (i === index) items[i].setAttribute('aria-current', 'true');
      else items[i].removeAttribute('aria-current');
    }
  }

  function docked() {
    return !!(dockQuery && dockQuery.matches);
  }

  function quiet() {
    return document.body.classList.contains('focus-mode') && window.matchMedia('(min-width: 768px)').matches;
  }

  function editing() {
    return !!(editor && !editor.hidden);
  }

  function showNav() {
    if (!nav || !button) return;
    const usable = headings.length >= MIN_HEADINGS && !quiet() && !(view && view.hidden);
    const wide = docked();
    if (!usable) popoverOpen = false;
    const popped = usable && popoverOpen && !wide;
    button.hidden = !usable || wide;
    button.classList.toggle('is-active', popped);
    button.setAttribute('aria-expanded', popped ? 'true' : 'false');
    nav.classList.toggle('is-open', popped);
    nav.hidden = !usable || (!wide && !popoverOpen);
  }

  function disconnectSpy() {
    if (spy) spy.disconnect();
    spy = null;
  }

  function watchRead() {
    disconnectSpy();
    if (!card || !rendered || editing() || typeof IntersectionObserver !== 'function') return;
    const targets = [...rendered.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((node) =>
      node.id.startsWith('note-heading-'),
    );
    if (!targets.length) return;
    spy = new IntersectionObserver(
      (entries) => {
        let best = /** @type {IntersectionObserverEntry | null} */ (null);
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!best || entry.intersectionRatio >= best.intersectionRatio) best = entry;
        }
        if (!best || !/^note-heading-\d+$/.test(best.target.id)) return;
        mark(Number(best.target.id.slice('note-heading-'.length)));
      },
      { root: card, rootMargin: '0px 0px -65% 0px', threshold: [0, 0.25, 1] },
    );
    for (const node of targets) spy.observe(node);
  }

  /** @param {HTMLTextAreaElement} field @param {number} offset */
  function scrollField(field, offset) {
    const lineHeight = parseFloat(getComputedStyle(field).lineHeight) || 24;
    const lines = field.value.slice(0, offset).split('\n').length - 1;
    const next = lines * lineHeight - field.clientHeight / 3;
    field.scrollTop = next > 0 ? next : 0;
  }

  /** @param {HTMLTextAreaElement} field @param {number} offset */
  function placeCaret(field, offset) {
    const apply = () => {
      field.setSelectionRange(offset, offset);
      scrollField(field, offset);
    };
    field.focus();
    apply();
    requestAnimationFrame(apply);
  }

  /** @param {number} index */
  function revealHeading(index) {
    const node = document.getElementById('note-heading-' + index);
    if (node) node.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  /** @param {number} index */
  function jump(index) {
    const heading = headings[index];
    if (!heading || !editor) return;
    if (editing()) placeCaret(editor, heading.offset);
    else revealHeading(index);
    mark(index);
    if (docked()) return;
    popoverOpen = false;
    showNav();
    if (button) button.focus();
  }

  function currentEdit() {
    if (!editing() || !editor) return;
    const caret = editor.selectionStart == null ? 0 : editor.selectionStart;
    let index = -1;
    for (let i = 0; i < headings.length; i += 1) {
      if (headings[i].offset <= caret) index = i;
    }
    mark(index);
  }

  function sync() {
    if (!view || !editor) return;
    if (view.hidden) {
      headings = [];
      paint();
      showNav();
      disconnectSpy();
      return;
    }
    headings = editing() ? extractHeadings(editor.value) : renderedHeadings();
    paint();
    showNav();
    if (editing()) {
      disconnectSpy();
      currentEdit();
      return;
    }
    watchRead();
  }

  function togglePopover() {
    popoverOpen = !popoverOpen;
    showNav();
  }

  /** @param {Event} event */
  function closeIfOutside(event) {
    if (!popoverOpen || docked()) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (nav && nav.contains(target)) return;
    if (button && button.contains(target)) return;
    popoverOpen = false;
    showNav();
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (event.key !== 'Escape' || !popoverOpen || docked()) return;
    event.preventDefault();
    event.stopPropagation();
    popoverOpen = false;
    showNav();
    if (button) button.focus();
  }

  function boot() {
    const outlineButton = document.getElementById('outline-btn');
    const outlineNav = document.getElementById('note-outline');
    const outlineList = outlineNav && outlineNav.querySelector('ol');
    const noteEditor = document.getElementById('note-editor');
    const noteRendered = document.getElementById('note-rendered');
    const editorCard = document.querySelector('.editor-card');
    const editorView = document.getElementById('editor-view');
    if (!(outlineButton instanceof HTMLButtonElement) || !(outlineNav instanceof HTMLElement)) return;
    if (!(outlineList instanceof HTMLOListElement) || !(noteEditor instanceof HTMLTextAreaElement)) return;
    if (!(noteRendered instanceof HTMLElement) || !(editorCard instanceof HTMLElement)) return;
    if (!(editorView instanceof HTMLElement)) return;
    button = outlineButton;
    nav = outlineNav;
    list = outlineList;
    editor = noteEditor;
    rendered = noteRendered;
    card = editorCard;
    view = editorView;
    dockQuery = window.matchMedia(DOCK_QUERY);
    button.addEventListener('click', togglePopover);
    document.addEventListener('click', closeIfOutside);
    document.addEventListener('keydown', onKey, true);
    dockQuery.addEventListener('change', sync);
    const classWatch = new MutationObserver(sync);
    classWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    editor.addEventListener('input', sync);
    editor.addEventListener('keyup', currentEdit);
    editor.addEventListener('click', currentEdit);
  }

  boot();
  root.ScratchpadOutline = Object.freeze({ sync, extractHeadings });
}
