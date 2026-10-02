// @ts-check
/* Command bar: the sidebar search field doubles as the command launcher.
   An empty, focused field suggests the everyday commands; a leading ">"
   filters every command instead of notes. Plain text still searches notes
   exactly as before, and the full palette (Cmd/Ctrl+Shift+P) stays one
   click away from the panel's footer. */
{
  ('use strict');

  /** @typedef {{ id: string, label: string, meta?: string, keywords?: string, run: () => unknown }} Command */
  /** @typedef {{ input: HTMLInputElement, commands: () => Command[], matches: (haystack: string, query: string) => boolean }} AttachOptions */
  /** @typedef {{ input: HTMLInputElement, panel: HTMLElement, heading: HTMLElement, list: HTMLElement, commands: () => Command[], matches: (haystack: string, query: string) => boolean, items: Command[], index: number, pressedElsewhereAt: number }} Bar */

  const PREFIX = '>';
  // A focus this soon after a press elsewhere is the app handing focus back
  // (e.g. after "Clear search"), not the person asking for suggestions.
  const HANDOFF_MS = 800;
  const MAX_RESULTS = 8;
  const SUGGESTED = ['new-note', 'today-note', 'quick-capture', 'monthly-review', 'open-settings'];
  const SHORTCUTS = /** @type {Record<string, string>} */ ({
    'new-note': '⌘N',
    'today-note': '⌘⇧D',
    'quick-capture': '⌘⇧Space',
  });

  /** @param {string} value */
  function isCommandMode(value) {
    return value.trimStart().startsWith(PREFIX);
  }

  /** The text the note list should filter by; command mode filters nothing. @param {string} value */
  function noteQuery(value) {
    return isCommandMode(value) ? '' : value;
  }

  /** @param {string} value */
  function wantsPanel(value) {
    return value === '' || isCommandMode(value);
  }

  /** @param {Bar} bar */
  function launchable(bar) {
    return bar.commands().filter((item) => !item.id.startsWith('note-') && item.id !== 'search-notes');
  }

  /** @param {Bar} bar */
  function pickItems(bar) {
    const all = launchable(bar);
    const value = bar.input.value;
    if (!isCommandMode(value)) {
      return SUGGESTED.map((id) => all.find((item) => item.id === id)).filter((item) => !!item);
    }
    const query = value.trimStart().slice(PREFIX.length).trim();
    if (!query) return all.slice(0, MAX_RESULTS);
    const matched = all.filter((item) => bar.matches(haystack(item), query));
    // Same ranking as the full palette: a verbatim match outranks a fuzzy one.
    const needle = query.toLowerCase();
    const rank = (/** @type {Command} */ item) =>
      item.label.toLowerCase().includes(needle) ? 0 : haystack(item).toLowerCase().includes(needle) ? 1 : 2;
    return matched.sort((left, right) => rank(left) - rank(right)).slice(0, MAX_RESULTS);
  }

  /** @param {Command} item */
  function haystack(item) {
    return [item.label, item.meta || '', item.keywords || ''].join(' ');
  }

  /** @param {string} tag @param {string} className @param {string} text */
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  /** @param {Bar} bar @param {Command} item @param {number} index */
  function renderOption(bar, item, index) {
    const option = element('div', 'command-bar-item', '');
    option.id = 'command-bar-option-' + index;
    option.setAttribute('role', 'option');
    option.append(element('span', 'command-bar-label', item.label));
    const hint = SHORTCUTS[item.id];
    if (hint) option.append(element('kbd', 'command-bar-kbd', hint));
    option.addEventListener('click', () => runAt(bar, index));
    option.addEventListener('mouseenter', () => setIndex(bar, index));
    return option;
  }

  /** @param {Bar} bar */
  function render(bar) {
    bar.items = pickItems(bar);
    bar.index = bar.items.length ? Math.min(Math.max(bar.index, 0), bar.items.length - 1) : -1;
    bar.heading.textContent = isCommandMode(bar.input.value) ? 'Commands' : 'Suggested';
    const rows = bar.items.map((item, index) => renderOption(bar, item, index));
    if (!rows.length) rows.push(element('p', 'command-bar-empty', 'No matching commands.'));
    bar.list.replaceChildren(...rows);
    setIndex(bar, bar.index);
  }

  /** @param {Bar} bar @param {number} index */
  function setIndex(bar, index) {
    bar.index = bar.items.length ? Math.max(0, Math.min(index, bar.items.length - 1)) : -1;
    const options = Array.from(bar.list.querySelectorAll('[role="option"]'));
    options.forEach((option, i) => {
      option.classList.toggle('is-active', i === bar.index);
      option.setAttribute('aria-selected', i === bar.index ? 'true' : 'false');
    });
    const active = options[bar.index];
    if (active) bar.input.setAttribute('aria-activedescendant', active.id);
    else bar.input.removeAttribute('aria-activedescendant');
  }

  /** @param {Bar} bar */
  function open(bar) {
    bar.index = 0;
    render(bar);
    bar.panel.hidden = false;
    bar.input.setAttribute('aria-expanded', 'true');
  }

  /** @param {Bar} bar */
  function close(bar) {
    if (bar.panel.hidden) return;
    bar.panel.hidden = true;
    bar.input.setAttribute('aria-expanded', 'false');
    bar.input.removeAttribute('aria-activedescendant');
    if (isCommandMode(bar.input.value)) bar.input.value = '';
  }

  /** @param {Bar} bar @param {number} index */
  function runAt(bar, index) {
    const item = bar.items[index];
    if (!item) return;
    close(bar);
    bar.input.value = '';
    bar.input.blur();
    item.run();
  }

  /** @param {Bar} bar @param {KeyboardEvent} event */
  function onKeyDown(bar, event) {
    if (bar.panel.hidden) return;
    const moves = /** @type {Record<string, number>} */ ({ ArrowDown: 1, ArrowUp: -1 });
    if (event.key in moves) setIndex(bar, bar.index + moves[event.key]);
    else if (event.key === 'Enter') runAt(bar, bar.index);
    else if (event.key === 'Escape') close(bar);
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /** Typing back to an empty field returns to the list; only ">" reopens. @param {Bar} bar */
  function onInput(bar) {
    if (!isCommandMode(bar.input.value)) close(bar);
    else if (bar.panel.hidden) open(bar);
    else render(bar);
  }

  /** @param {Bar} bar @param {FocusEvent} event */
  function onFocusOut(bar, event) {
    const next = /** @type {Node | null} */ (event.relatedTarget);
    if (next && bar.panel.contains(next)) return;
    close(bar);
  }

  /** @param {Bar} bar */
  function bind(bar) {
    bar.input.addEventListener('keydown', (event) => onKeyDown(bar, event), true);
    bar.input.addEventListener('input', () => onInput(bar));
    bar.input.addEventListener('focus', () => {
      const handoff = performance.now() - bar.pressedElsewhereAt < HANDOFF_MS;
      if (!handoff && wantsPanel(bar.input.value)) open(bar);
    });
    document.addEventListener(
      'pointerdown',
      (event) => {
        const target = /** @type {Node | null} */ (event.target);
        const inside = !!target && (bar.input.contains(target) || bar.panel.contains(target));
        bar.pressedElsewhereAt = inside ? -Infinity : performance.now();
      },
      true,
    );
    bar.input.addEventListener('focusout', (event) => onFocusOut(bar, event));
    bar.panel.addEventListener('focusout', (event) => onFocusOut(bar, event));
    // Keep focus in the field while a row is pressed, so the click lands.
    bar.panel.addEventListener('mousedown', (event) => event.preventDefault());
    bar.panel.addEventListener('click', (event) => {
      const target = /** @type {Element | null} */ (event.target);
      if (target && target.closest('#command-palette-btn')) close(bar);
    });
  }

  /** @param {AttachOptions} options */
  function attach(options) {
    const panel = document.getElementById('command-bar');
    const heading = document.getElementById('command-bar-heading');
    const list = document.getElementById('command-bar-list');
    if (!panel || !heading || !list) return;
    /** @type {Bar} */
    const bar = { ...options, panel, heading, list, items: [], index: -1, pressedElsewhereAt: -Infinity };
    bind(bar);
  }

  /** @type {Window & typeof globalThis & { ScratchpadCommandBar?: { attach: typeof attach, noteQuery: typeof noteQuery } }} */
  const root = window;
  root.ScratchpadCommandBar = Object.freeze({ attach, noteQuery });
}
