// @ts-check
/* Home: what the document stage shows when no note is open on a wide screen.
   This controller decides when Home owns the stage, wires its controls, and
   hands focus to the note a control opens; home-desk-view.js draws it. It also
   owns stage switching, so the editor, Home, and the four empty states share
   one show() and never overlap. Everything here reads notes already in
   memory; nothing is fetched. */
'use strict';
{
  /** @typedef {import('../../types/home-desk').DeskDeps} DeskDeps */
  /** @typedef {import('../../types/home-desk').DeskRefs} DeskRefs */
  /** @typedef {import('../../types/home-desk').DeskUi} DeskUi */
  /** @typedef {import('../../types/home-desk').DeskView} DeskView */
  /** @typedef {Window & typeof globalThis & { ScratchpadHomeDeskView?: DeskView, ScratchpadSettings?: { readOpenTo(): string }, ScratchpadMobileView?: { isNarrow(): boolean }, ScratchpadHomeDesk?: object }} DeskWindow */

  /** @type {DeskWindow} */
  const root = window;
  const STAGES = /** @type {const} */ ([
    ['editor', 'editor-view'],
    ['desk', 'home-desk'],
    ['no-notes', 'empty-no-notes'],
    ['no-results', 'empty-no-results'],
    ['archive', 'empty-archive'],
    ['trash', 'empty-trash'],
  ]);
  const LAYOUT_KEY = 'scratchpad:deskLayout';

  /** @type {DeskDeps | null} */
  let deps = null;
  /** @type {DeskRefs | null} */
  let refs = null;
  let open = false;
  /** @type {DeskUi} */
  let ui = { pinsExpanded: false, folderFilter: '*', layout: 'list' };

  function view() {
    const module = root.ScratchpadHomeDeskView;
    if (!module) throw new Error('home-desk-view.js must load before home-desk.js');
    return module;
  }

  function isNarrow() {
    return !!root.ScratchpadMobileView && root.ScratchpadMobileView.isNarrow();
  }

  // ---------- Stage ----------

  /** Shows one stage section and hides the rest; 'desk' also renders Home. @param {string} which */
  function show(which) {
    for (const [key, id] of STAGES) {
      const section = document.getElementById(id);
      if (section) section.hidden = key !== which;
    }
    if (which === 'desk' && deps && refs) draw(deps, refs);
  }

  /** Whether Home owns the stage now. Anything that selects a note, or a view, search, or tag that would, ends it. */
  function holds() {
    if (!deps) return false;
    const api = deps;
    const state = api.state;
    open =
      open &&
      !state.selectedId &&
      state.view === 'active' &&
      !state.search.trim() &&
      !state.tagFilter &&
      state.notes.some((note) => !api.isArchived(note) && !api.isTrashed(note));
    return open;
  }

  /** The Home button. In Archive and on phones it keeps its old job: reset the folder scope. */
  async function goHome() {
    if (!deps) return;
    const api = deps;
    const state = api.state;
    if (isNarrow() || state.view !== 'active') {
      api.setFolderView(null);
      return;
    }
    if (state.editing && state.dirty) {
      if (!(await api.confirmDiscard())) return;
      await api.discardDraft();
    }
    Object.assign(state, { editing: false, dirty: false, selectedId: null });
    open = true;
    api.setFolderView(null, false);
    api.clearFilters();
    if (refs && document.activeElement === document.body) refs.greeting.focus();
  }

  function commands() {
    return [
      {
        id: 'go-home',
        label: 'Go to Home',
        meta: 'Pinned notes, recent notes, and quick starts',
        keywords: 'home desk start dashboard overview pinned recent',
        run: goHome,
      },
    ];
  }

  // ---------- Drawing and focus ----------

  /** @param {DeskDeps} api @param {DeskRefs} target */
  function draw(api, target) {
    const focusKey = deskFocusKey(target.root);
    const notes = api.state.notes
      .filter((note) => !api.isArchived(note) && !api.isTrashed(note))
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    ui = view().render(api, target, notes, ui, api.now());
    restoreFocus(target.root, focusKey);
  }

  /** @param {HTMLElement} container */
  function deskFocusKey(container) {
    const active = document.activeElement;
    return active instanceof HTMLElement && container.contains(active) ? active.dataset.deskFocus || null : null;
  }

  /** A redraw replaces the focused chip or card; put focus back on its successor. @param {HTMLElement} container @param {string | null} key */
  function restoreFocus(container, key) {
    if (!key || container.contains(document.activeElement)) return;
    const target = container.querySelector('[data-desk-focus="' + CSS.escape(key) + '"]');
    if (target instanceof HTMLElement) target.focus();
  }

  /** The clicked control is gone or hidden once a note opens, so focus lands on the note itself, unless a
   *  dialog (a draft prompt) or the editor already holds it. Firefox can leave focus on a hidden button. */
  function focusOpenNote() {
    const active = document.activeElement;
    if (active && active !== document.body && active.closest('dialog[open], #editor-view')) return;
    for (const id of ['note-title-display', 'note-title-input', 'edit-btn']) {
      const target = document.getElementById(id);
      if (target && target.offsetParent !== null) {
        target.focus();
        return;
      }
    }
  }

  /** @param {() => unknown} action */
  async function runThenFocus(action) {
    try {
      await action();
    } finally {
      focusOpenNote();
    }
  }

  // ---------- Wiring ----------

  /** @returns {'list' | 'grid'} */
  function readLayout() {
    try {
      return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  }

  /** @param {string} next */
  function saveLayout(next) {
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      /* Private mode: the choice lasts for this page. */
    }
  }

  /** @param {string} id @returns {HTMLElement} */
  function byId(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error('Home is missing #' + id);
    return element;
  }

  /** @returns {DeskRefs} */
  function collectRefs() {
    const noteIcon = byId('tpl-desk-note-icon');
    if (!(noteIcon instanceof HTMLTemplateElement)) throw new Error('#tpl-desk-note-icon must be a template');
    /** @param {string} name */
    const part = (name) => byId('home-desk-' + name);
    return {
      root: byId('home-desk'),
      date: part('date'),
      greeting: part('greeting'),
      sub: part('sub'),
      newNote: part('new'),
      today: part('today'),
      todayMeta: part('today-meta'),
      capture: part('capture'),
      template: part('template'),
      templateMeta: part('template-meta'),
      pins: part('pins'),
      pinsEmpty: part('pins-empty'),
      pinsMore: part('pins-more'),
      layout: part('layout'),
      chips: part('chips'),
      recent: part('recent'),
      tags: part('tags'),
      tagList: part('tag-list'),
      manageTags: part('manage-tags'),
      noteIcon,
    };
  }

  /** @param {Event} event @param {string} selector */
  function closestButton(event, selector) {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    return target instanceof HTMLElement ? target : null;
  }

  /** @param {DeskDeps} api @param {DeskRefs} target */
  function bindControls(api, target) {
    target.newNote.addEventListener('click', () => runThenFocus(() => api.createNote()));
    target.today.addEventListener('click', () => runThenFocus(() => api.openToday()));
    target.capture.addEventListener('click', () => api.openCapture());
    target.template.addEventListener('click', () => api.openPalette('template'));
    target.pinsMore.addEventListener('click', () => {
      ui = { ...ui, pinsExpanded: !ui.pinsExpanded };
      draw(api, target);
    });
    const openNote = (/** @type {Event} */ event) => {
      const button = closestButton(event, '[data-note-id]');
      if (button) runThenFocus(() => api.openNote(button.dataset.noteId || ''));
    };
    target.pins.addEventListener('click', openNote);
    target.recent.addEventListener('click', openNote);
    target.tagList.addEventListener('click', (event) => {
      const button = closestButton(event, '[data-tag]');
      if (button) runThenFocus(() => api.setTagFilter(button.dataset.tag || ''));
    });
    target.manageTags.addEventListener('click', () => api.openTagManager());
    target.chips.addEventListener('click', (event) => {
      const button = closestButton(event, '[data-folder-key]');
      if (!button) return;
      ui = { ...ui, folderFilter: button.dataset.folderKey || '' };
      draw(api, target);
    });
    target.layout.addEventListener('click', (event) => {
      const button = closestButton(event, '[data-desk-layout]');
      if (!button) return;
      ui = { ...ui, layout: button.dataset.deskLayout === 'grid' ? 'grid' : 'list' };
      saveLayout(ui.layout);
      draw(api, target);
    });
  }

  /** Wires Home to app state and decides the launch stage: Home, unless this is the first visit, a phone, or Open to says Top note. @param {DeskDeps} api */
  function init(api) {
    deps = api;
    refs = collectRefs();
    ui = { pinsExpanded: false, folderFilter: view().ALL, layout: readLayout() };
    const openTo = root.ScratchpadSettings ? root.ScratchpadSettings.readOpenTo() : 'home';
    open = !api.seeded && !isNarrow() && openTo === 'home';
    bindControls(api, refs);
  }

  root.ScratchpadHomeDesk = Object.freeze({ init, holds, show, goHome, commands });
}
