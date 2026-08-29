// @ts-check
/* Focused search-result DOM, highlighting, announcements, and keyboard flow. */
{
  ('use strict');

  /** @typedef {'direct' | 'close'} SearchKind */
  /** @typedef {{ kind: SearchKind, count: number, view: string, query: string, hasTagFilter: boolean, onClear: () => void }} ChromeOptions */
  /** @typedef {{ summary: HTMLElement, note: HTMLElement | null, empty: HTMLElement | null, status: string }} SearchChrome */
  /** @typedef {{ input: HTMLInputElement, list: HTMLElement, isSearching: () => boolean, hasActiveFilters: () => boolean, sync: () => void, clear: () => void }} KeyboardOptions */
  /** @typedef {{ highlightText(text: string, queryOrTerms: string | string[]): Node[], highlightElement(root: HTMLElement | null, query: string): void, createChrome(options: ChromeOptions): SearchChrome, bindKeyboard(options: KeyboardOptions): void }} SearchViewApi */

  /** @param {string} text */
  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** @param {string | string[]} queryOrTerms */
  function highlightTerms(queryOrTerms) {
    const values = Array.isArray(queryOrTerms)
      ? queryOrTerms
      : [
          String(queryOrTerms || '').trim(),
          ...String(queryOrTerms || '')
            .trim()
            .split(/\s+/),
        ];
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort(
      (left, right) => right.length - left.length,
    );
  }

  /** @param {string} text @param {string | string[]} queryOrTerms */
  function highlightText(text, queryOrTerms) {
    const source = String(text || '');
    const terms = highlightTerms(queryOrTerms);
    if (!terms.length) return [document.createTextNode(source)];
    const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'giu');
    const nodes = [];
    let start = 0;
    for (const match of source.matchAll(pattern)) {
      const index = match.index || 0;
      if (index > start) nodes.push(document.createTextNode(source.slice(start, index)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = match[0];
      nodes.push(mark);
      start = index + match[0].length;
    }
    if (start < source.length) nodes.push(document.createTextNode(source.slice(start)));
    return nodes.length ? nodes : [document.createTextNode(source)];
  }

  /** @param {HTMLElement | null} root @param {string} query */
  function highlightElement(root, query) {
    const terms = highlightTerms(query);
    if (!root || !terms.length) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, textarea, mark')) return NodeFilter.FILTER_REJECT;
        const lower = String(node.nodeValue || '').toLocaleLowerCase();
        return terms.some((term) => lower.includes(term.toLocaleLowerCase()))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    /** @type {Text[]} */
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(/** @type {Text} */ (walker.currentNode));
    replaceTextNodes(textNodes, terms);
  }

  /** @param {Text[]} textNodes @param {string[]} terms */
  function replaceTextNodes(textNodes, terms) {
    for (const textNode of textNodes) {
      const fragment = document.createDocumentFragment();
      for (const node of highlightText(textNode.nodeValue || '', terms)) fragment.appendChild(node);
      textNode.replaceWith(fragment);
    }
  }

  /** @param {string} tag @param {{ className?: string, id?: string, text?: string }} [options] */
  function element(tag, options) {
    const node = document.createElement(tag);
    if (!options) return node;
    if (options.className) node.className = options.className;
    if (options.id) node.id = options.id;
    if (options.text != null) node.textContent = options.text;
    return node;
  }

  /** @param {string} view */
  function viewLabel(view) {
    if (view === 'archive') return 'Archive';
    if (view === 'trash') return 'Trash';
    return 'Notes';
  }

  /** @param {SearchKind} kind @param {number} count */
  function countLabel(kind, count) {
    if (kind === 'close') return count + (count === 1 ? ' close match' : ' close matches');
    return count + (count === 1 ? ' result' : ' results');
  }

  /** @param {ChromeOptions} options */
  function createSummary(options) {
    const summary = element('div', { className: 'search-results-summary', id: 'search-results-summary' });
    const meta = element('div', { className: 'search-results-meta' });
    meta.append(
      element('strong', { id: 'search-results-count', text: countLabel(options.kind, options.count) }),
      element('span', { id: 'search-results-scope', text: viewLabel(options.view) + ' · all folders' }),
    );
    const clear = element('button', { className: 'search-results-clear', id: 'search-results-clear', text: 'Clear' });
    clear.setAttribute('type', 'button');
    clear.addEventListener('click', options.onClear);
    summary.append(meta, clear);
    return summary;
  }

  /** @param {ChromeOptions} options */
  function createEmpty(options) {
    const empty = element('div', { className: 'sidebar-empty search-empty' });
    empty.append(
      element('p', { className: 'sidebar-empty-title', text: 'No notes match “' + options.query + '”' }),
      element('p', {
        className: 'sidebar-empty-copy',
        text: 'Search checks titles, text, and tags in ' + viewLabel(options.view) + ' across all folders.',
      }),
    );
    const clear = element('button', {
      className: 'btn btn-secondary btn-sm',
      text: options.hasTagFilter ? 'Clear search & filters' : 'Clear search',
    });
    clear.setAttribute('type', 'button');
    clear.addEventListener('click', options.onClear);
    empty.appendChild(clear);
    return empty;
  }

  /** @param {ChromeOptions} options */
  function createChrome(options) {
    const hasCloseMatches = options.kind === 'close' && options.count > 0;
    const note = hasCloseMatches
      ? element('p', {
          className: 'search-results-note',
          id: 'search-results-note',
          text: 'Showing close title or tag matches.',
        })
      : null;
    return {
      summary: createSummary(options),
      note,
      empty: options.count ? null : createEmpty(options),
      status: countLabel(options.kind, options.count) + ' in ' + viewLabel(options.view) + ' across all folders.',
    };
  }

  /** @param {HTMLElement} list */
  function resultButtons(list) {
    return /** @type {HTMLButtonElement[]} */ (
      Array.from(list.querySelectorAll('.note-row.is-search-result .note-row-open'))
    );
  }

  /** @param {KeyboardEvent} event @param {KeyboardOptions} options */
  function handleInputKey(event, options) {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    if (event.key === 'Escape') {
      if (!options.hasActiveFilters() && !options.input.value) return;
      event.preventDefault();
      event.stopPropagation();
      options.clear();
      return;
    }
    options.sync();
    const buttons = resultButtons(options.list);
    if (!buttons.length) return;
    event.preventDefault();
    if (event.key === 'Enter') buttons[0].click();
    else (event.key === 'ArrowUp' ? buttons[buttons.length - 1] : buttons[0]).focus();
  }

  /** @param {KeyboardEvent} event @param {KeyboardOptions} options */
  function handleListKey(event, options) {
    if (!options.isSearching()) return;
    const target = /** @type {Element | null} */ (event.target);
    const button = target && target.closest('.note-row-open');
    if (!button) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      options.clear();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    focusAdjacentResult(event.key, /** @type {HTMLButtonElement} */ (button), options);
  }

  /** @param {string} key @param {HTMLButtonElement} button @param {KeyboardOptions} options */
  function focusAdjacentResult(key, button, options) {
    const buttons = resultButtons(options.list);
    const index = buttons.indexOf(button);
    const next = key === 'ArrowDown' ? buttons[index + 1] : buttons[index - 1];
    if (next) next.focus();
    else options.input.focus();
  }

  /** @param {KeyboardOptions} options */
  function bindKeyboard(options) {
    options.input.addEventListener('keydown', (event) => handleInputKey(event, options));
    options.list.addEventListener('keydown', (event) => handleListKey(event, options));
  }

  /** @type {Window & typeof globalThis & { ScratchpadSearchView?: SearchViewApi }} */
  const root = window;
  root.ScratchpadSearchView = Object.freeze({ highlightText, highlightElement, createChrome, bindKeyboard });
}
