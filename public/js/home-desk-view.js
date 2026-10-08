// @ts-check
/* Home's view: turns notes already in memory into the header, the quick-start
   meta lines, pinned cards, folder chips, and recent rows. Text helpers and
   DOM builders only; home-desk.js owns state, events, and focus. Every string
   lands through textContent. */
'use strict';
{
  /** @typedef {import('../../types/home-desk').DeskNote} DeskNote */
  /** @typedef {import('../../types/home-desk').DeskLookups} DeskLookups */
  /** @typedef {import('../../types/home-desk').DeskRefs} DeskRefs */
  /** @typedef {import('../../types/home-desk').DeskUi} DeskUi */
  /** @typedef {import('../../types/home-desk').DeskView} DeskView */
  /** @typedef {{ key: string, name: string, color: string | null }} Chip */
  /** @typedef {Window & typeof globalThis & { ScratchpadTemplates?: { commands(): Array<{ id: string }> }, ScratchpadMarkdown?: { wordCount(text: string): number }, ScratchpadHomeDeskView?: DeskView }} ViewWindow */

  /** @type {ViewWindow} */
  const root = window;
  const ALL = '*';
  const PIN_LIMIT = 3;
  const RECENT_LIMIT = 6;
  const CHIP_LIMIT = 6;
  const TAG_LIMIT = 12;
  const EXCERPT_MAX = 180;
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;

  // ---------- Text ----------

  /** @param {number} hour */
  function greetingFor(hour) {
    if (hour < 5) return 'Hello, night owl.';
    if (hour < 12) return 'Good morning.';
    if (hour < 17) return 'Good afternoon.';
    return 'Good evening.';
  }

  /** @param {number} count @param {string} noun */
  function plural(count, noun) {
    return count + ' ' + noun + (count === 1 ? '' : 's');
  }

  /** @param {number} ms @param {number} days */
  function dayStart(ms, days) {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days).getTime();
  }

  /** "12 minutes ago", "3 hours ago", "Yesterday", a weekday, then a date. @param {number} ms @param {number} nowMs */
  function whenLabel(ms, nowMs) {
    const elapsed = nowMs - ms;
    if (elapsed < MINUTE) return 'Just now';
    if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute') + ' ago';
    if (ms >= dayStart(nowMs, 0)) return plural(Math.floor(elapsed / HOUR), 'hour') + ' ago';
    if (ms >= dayStart(nowMs, 1)) return 'Yesterday';
    const date = new Date(ms);
    if (ms >= dayStart(nowMs, 6)) return date.toLocaleDateString([], { weekday: 'long' });
    const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  }

  /** One Markdown line as plain text, or '' for lines that carry no prose. @param {string} raw */
  function plainLine(raw) {
    const line = raw.trim();
    if (/^([-*_]\s*){3,}$/.test(line) || /^\|?\s*:?-{3,}/.test(line)) return '';
    return line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s?(\[![a-z]+\]\s*)?/i, '')
      .replace(/^(?:[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias || target)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*|__|==|~~|\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** The body's prose as plain lines, minus a leading copy of the title and any fenced code. CSS clamps it, so a list reads as a list. @param {string} body @param {string} title */
  function excerptOf(body, title) {
    const wanted = title.trim().toLowerCase();
    let text = '';
    let fenced = false;
    for (const raw of String(body || '').split(/\r?\n/)) {
      const fence = /^\s*(```|~~~)/.test(raw);
      if (fence) fenced = !fenced;
      if (fence || fenced) continue;
      const line = plainLine(raw);
      if (!line || (!text && line.toLowerCase() === wanted)) continue;
      text = text ? text + '\n' + line : line;
      if (text.length >= EXCERPT_MAX) break;
    }
    return text.length > EXCERPT_MAX ? text.slice(0, EXCERPT_MAX - 1).trimEnd() + '…' : text;
  }

  /** @param {DeskNote | null} today */
  function todayLabel(today) {
    if (!today) return 'Not started yet';
    const words = root.ScratchpadMarkdown ? root.ScratchpadMarkdown.wordCount(today.body || '') : 0;
    return words ? plural(words, 'word') + ' so far' : 'Started, still empty';
  }

  function templateLabel() {
    const templates = root.ScratchpadTemplates ? root.ScratchpadTemplates.commands() : [];
    const count = templates.filter((command) => command.id.startsWith('template-')).length;
    return count ? plural(count, 'template') + ' ready' : 'Uses a folder named Templates';
  }

  // ---------- DOM ----------

  /** @param {string} tag @param {string} className @param {string} [text] */
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  /** @param {DeskLookups} api @param {DeskNote} note */
  function folderKey(api, note) {
    return api.noteFolderId(note) || '';
  }

  /** @param {string} color */
  function folderDot(color) {
    const dot = node('span', 'folder-dot');
    dot.dataset.color = color;
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }

  /** @param {DeskLookups} api @param {DeskNote} note @param {number} nowMs */
  function metaLine(api, note, nowMs) {
    const key = folderKey(api, note);
    const folder = key ? api.folderById(key) : null;
    const meta = node('span', 'home-desk-meta');
    if (folder && folder.color) meta.append(folderDot(folder.color));
    const separator = node('span', 'home-desk-meta-sep', '·');
    separator.setAttribute('aria-hidden', 'true');
    meta.append(node('span', '', api.folderDisplayName(key || null)), separator);
    meta.append(node('span', 'home-desk-when', whenLabel(note.updatedAt || 0, nowMs)));
    return meta;
  }

  /** A pinned card or a recent row. Both open their note through home-desk.js. @param {DeskLookups} api @param {DeskRefs} refs @param {DeskNote} note @param {number} nowMs @param {'card' | 'row'} kind */
  function noteItem(api, refs, note, nowMs, kind) {
    const title = api.deriveTitle(note);
    const button = node('button', 'home-desk-' + kind);
    button.setAttribute('type', 'button');
    button.dataset.noteId = note.id;
    button.dataset.deskFocus = kind + ':' + note.id;
    if (kind === 'row') button.append(refs.noteIcon.content.cloneNode(true));
    button.append(node('span', 'home-desk-' + kind + '-title', title));
    const excerpt = excerptOf(note.body || '', title);
    if (excerpt) {
      const preview = node('span', 'home-desk-' + kind + '-excerpt', excerpt);
      preview.setAttribute('aria-hidden', 'true');
      button.append(preview);
    }
    button.append(metaLine(api, note, nowMs));
    const item = node('li', 'home-desk-item');
    item.append(button);
    return item;
  }

  /** Up to six folders, ordered by their latest edit; none when every note shares one folder. @param {DeskLookups} api @param {DeskNote[]} notes */
  function folderChips(api, notes) {
    /** @type {Chip[]} */
    const chips = [];
    for (const note of notes) {
      const key = folderKey(api, note);
      if (chips.some((chip) => chip.key === key)) continue;
      const folder = key ? api.folderById(key) : null;
      chips.push({ key, name: api.folderDisplayName(key || null), color: (folder && folder.color) || null });
      if (chips.length === CHIP_LIMIT) break;
    }
    return chips.length > 1 ? chips : [];
  }

  /** @param {Chip} chip @param {string} selected */
  function chipButton(chip, selected) {
    const button = node('button', 'home-desk-chip');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-pressed', String(chip.key === selected));
    button.dataset.folderKey = chip.key;
    button.dataset.deskFocus = 'chip:' + chip.key;
    if (chip.color) button.append(folderDot(chip.color));
    button.append(node('span', '', chip.name));
    return button;
  }

  /** @param {DeskRefs} refs @param {number} count @param {number} nowMs */
  function renderHeader(refs, count, nowMs) {
    const now = new Date(nowMs);
    refs.date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    refs.greeting.textContent = greetingFor(now.getHours());
    refs.sub.textContent =
      'Pick up where you left off, or start something new. ' + plural(count, 'note') + ', all in this browser.';
  }

  /** @param {DeskLookups} api @param {DeskRefs} refs @param {DeskNote[]} pinned @param {DeskUi} ui @param {number} nowMs */
  function renderPins(api, refs, pinned, ui, nowMs) {
    const shown = ui.pinsExpanded ? pinned : pinned.slice(0, PIN_LIMIT);
    refs.pins.replaceChildren(...shown.map((note) => noteItem(api, refs, note, nowMs, 'card')));
    refs.pins.hidden = pinned.length === 0;
    refs.pinsEmpty.hidden = pinned.length > 0;
    refs.pinsMore.hidden = pinned.length <= PIN_LIMIT;
    refs.pinsMore.textContent = ui.pinsExpanded ? 'Show fewer' : 'Show all ' + pinned.length;
    refs.pinsMore.setAttribute('aria-expanded', String(ui.pinsExpanded));
  }

  /** @param {DeskLookups} api @param {DeskRefs} refs @param {DeskNote[]} notes @param {DeskUi} ui @param {number} nowMs */
  function renderRecent(api, refs, notes, ui, nowMs) {
    const chips = folderChips(api, notes);
    if (ui.folderFilter !== ALL && !chips.some((chip) => chip.key === ui.folderFilter)) ui.folderFilter = ALL;
    const choices = chips.length ? [{ key: ALL, name: 'All', color: null }, ...chips] : [];
    refs.chips.hidden = chips.length === 0;
    refs.chips.replaceChildren(...choices.map((chip) => chipButton(chip, ui.folderFilter)));
    const shown = notes.filter((note) => ui.folderFilter === ALL || folderKey(api, note) === ui.folderFilter);
    refs.recent.replaceChildren(...shown.slice(0, RECENT_LIMIT).map((note) => noteItem(api, refs, note, nowMs, 'row')));
    refs.recent.classList.toggle('is-grid', ui.layout === 'grid');
    for (const button of refs.layout.querySelectorAll('[data-desk-layout]')) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-desk-layout') === ui.layout));
    }
  }

  /** The most used tags across active notes: most used first, then by name. @param {DeskNote[]} notes */
  function topTags(notes) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const note of notes) {
      for (const tag of note.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, TAG_LIMIT);
  }

  /** @param {string} tag @param {number} count */
  function tagButton(tag, count) {
    const button = node('button', 'home-desk-tag');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-label', 'Filter notes by tag ' + tag + ', ' + plural(count, 'note'));
    button.dataset.tag = tag;
    button.dataset.deskFocus = 'tag:' + tag;
    button.append(node('span', 'home-desk-tag-name', '#' + tag), node('span', 'home-desk-tag-count', String(count)));
    return button;
  }

  /** @param {DeskRefs} refs @param {DeskNote[]} notes */
  function renderTags(refs, notes) {
    const tags = topTags(notes);
    refs.tags.hidden = tags.length === 0;
    refs.tagList.replaceChildren(...tags.map(([tag, count]) => tagButton(tag, count)));
  }

  /** Renders Home from active notes, newest first. @param {DeskLookups} api @param {DeskRefs} refs @param {DeskNote[]} notes @param {DeskUi} ui @param {number} nowMs */
  function render(api, refs, notes, ui, nowMs) {
    const next = { ...ui };
    renderHeader(refs, notes.length, nowMs);
    refs.todayMeta.textContent = todayLabel(api.todayNote());
    refs.templateMeta.textContent = templateLabel();
    renderPins(
      api,
      refs,
      notes.filter((note) => note.pinned),
      next,
      nowMs,
    );
    renderRecent(api, refs, notes, next, nowMs);
    renderTags(refs, notes);
    return next;
  }

  root.ScratchpadHomeDeskView = Object.freeze({ ALL, render, greetingFor, whenLabel, excerptOf });
}
