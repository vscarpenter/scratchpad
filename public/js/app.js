/* Scratchpad app: state, rendering, events. Depends on marked, DOMPurify, ScratchpadDB. */
(function () {
  'use strict';

  const DB = window.ScratchpadDB;

  const state = {
    notes: [],
    selectedId: null,
    editing: false,
    dirty: false,
    search: '',
    tagFilter: null,
    mobileView: 'list', // 'list' | 'editor' — only meaningful on narrow viewports
  };

  // -------- Element refs --------
  const $ = (id) => document.getElementById(id);
  const els = {
    shell: $('app-shell'),
    sidebar: $('sidebar'),
    main: $('main'),
    search: $('search'),
    activeFilter: $('active-filter'),
    activeFilterTag: $('active-filter-tag'),
    clearFilter: $('clear-filter'),
    newNote: $('new-note'),
    emptyNewNote: $('empty-new-note'),
    noteList: $('note-list'),
    backToList: $('back-to-list'),
    titleInput: $('note-title-input'),
    pinToggle: $('pin-toggle'),
    pinIcon: $('pin-icon'),
    editBtn: $('edit-btn'),
    saveBtn: $('save-btn'),
    deleteBtn: $('delete-btn'),
    dirtyIndicator: $('dirty-indicator'),
    tagPills: $('tag-pills'),
    tagInput: $('tag-input'),
    rendered: $('note-rendered'),
    editor: $('note-editor'),
    editorView: $('editor-view'),
    emptyNoNotes: $('empty-no-notes'),
    emptyNoResults: $('empty-no-results'),
    emptyPickOne: $('empty-pick-one'),
    clearSearchBtn: $('clear-search-btn'),
    deleteDialog: $('delete-dialog'),
    confirmDelete: $('confirm-delete'),
    discardDialog: $('discard-dialog'),
    confirmDiscard: $('confirm-discard'),
    aboutDialog: $('about-dialog'),
    openAbout: $('open-about'),
    exportBtn: $('export-btn'),
    importBtn: $('import-btn'),
    importFile: $('import-file'),
    pinTemplate: $('tpl-pin-icon'),
  };

  // -------- Utilities --------
  const uuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  const now = () => Date.now();

  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function el(tag, options) {
    const node = document.createElement(tag);
    if (!options) return node;
    if (options.class) node.className = options.class;
    if (options.text != null) node.textContent = options.text;
    if (options.attrs) {
      for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
    }
    if (options.on) {
      for (const [evt, handler] of Object.entries(options.on)) node.addEventListener(evt, handler);
    }
    if (options.children) {
      for (const child of options.children) if (child) node.appendChild(child);
    }
    return node;
  }

  function clonePinIcon() {
    return els.pinTemplate.content.cloneNode(true);
  }

  function deriveTitle(note) {
    if (note.title && note.title.trim()) return note.title.trim();
    const body = (note.body || '').trim();
    if (!body) return 'Untitled note';
    const lines = body.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      return heading ? heading[1].trim() : line;
    }
    return 'Untitled note';
  }

  function formatTimestamp(ms) {
    const d = new Date(ms);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function truncate(text, n) {
    if (!text) return '';
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > n ? text.slice(0, n - 1) + '…' : text;
  }

  function normalizeTag(t) {
    return (t || '').toLowerCase().trim().replace(/\s+/g, '-');
  }

  function getNote(id) {
    return state.notes.find((n) => n.id === id) || null;
  }

  // -------- Markdown rendering (sanitized) --------
  if (window.marked && typeof window.marked.setOptions === 'function') {
    window.marked.setOptions({ breaks: false, gfm: true });
  }

  function renderMarkdownInto(container, src) {
    container.replaceChildren();
    const raw = window.marked.parse(src || '');
    const frag = window.DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['target', 'rel'],
      RETURN_DOM_FRAGMENT: true,
    });
    // Post-process before insertion.
    for (const a of frag.querySelectorAll('a[href]')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
    for (const pre of frag.querySelectorAll('pre')) pre.classList.add('code-block');
    container.appendChild(frag);
  }

  function renderEmptyBody(container) {
    container.replaceChildren(
      el('p', {
        class: 'rendered-empty',
        children: [
          document.createTextNode('This note is empty. Press '),
          el('em', { text: 'Edit' }),
          document.createTextNode(' to start writing.'),
        ],
      })
    );
  }

  // -------- Sidebar rendering --------
  function filteredNotes() {
    const q = state.search.trim().toLowerCase();
    const tag = state.tagFilter;
    return state.notes.filter((n) => {
      if (tag && !(n.tags || []).includes(tag)) return false;
      if (!q) return true;
      const hay = [
        n.title || '',
        n.body || '',
        (n.tags || []).join(' '),
      ].join('\n').toLowerCase();
      return hay.includes(q);
    });
  }

  function sortNotes(list) {
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function renderSidebar() {
    const filtered = filteredNotes();
    const pinned = sortNotes(filtered.filter((n) => n.pinned));
    const others = sortNotes(filtered.filter((n) => !n.pinned));

    const children = [];
    if (pinned.length) children.push(renderSection('Pinned', pinned));
    if (others.length) children.push(renderSection('Notes', others));
    els.noteList.replaceChildren(...children);
  }

  function renderSection(label, notes) {
    const heading = el('div', { class: 'eyebrow note-section-head', text: label });
    const rows = notes.map(renderRow);
    return el('div', { class: 'note-section', children: [heading, ...rows] });
  }

  function renderRow(note) {
    const title = el('div', { class: 'note-row-title', text: truncate(deriveTitle(note), 64) });

    const metaChildren = [el('span', { class: 'note-row-time', text: formatTimestamp(note.updatedAt) })];
    if (note.pinned) {
      const pin = el('span', { class: 'note-row-pin', attrs: { 'aria-label': 'Pinned' } });
      pin.appendChild(clonePinIcon());
      metaChildren.push(pin);
    }
    const meta = el('div', { class: 'note-row-meta', children: metaChildren });

    const children = [title, meta];

    if (note.tags && note.tags.length) {
      const tagPills = note.tags.slice(0, 4).map((t) =>
        el('button', {
          class: 'badge badge-accent tag-pill-link',
          text: '#' + t,
          attrs: { type: 'button', 'data-tag': t },
        })
      );
      children.push(el('div', { class: 'note-row-tags', children: tagPills }));
    }

    const row = el('button', {
      class: 'note-row' + (note.id === state.selectedId ? ' is-active' : ''),
      attrs: { type: 'button', 'data-id': note.id },
      children,
      on: {
        click: (e) => {
          const tagBtn = e.target.closest('.tag-pill-link');
          if (tagBtn) {
            e.stopPropagation();
            setTagFilter(tagBtn.dataset.tag);
            return;
          }
          selectNote(note.id);
        },
      },
    });
    return row;
  }

  // -------- Editor rendering --------
  function showEmpty(which) {
    els.editorView.hidden = true;
    els.emptyNoNotes.hidden = which !== 'no-notes';
    els.emptyNoResults.hidden = which !== 'no-results';
    els.emptyPickOne.hidden = which !== 'pick-one';
  }

  function hideAllEmpties() {
    els.emptyNoNotes.hidden = true;
    els.emptyNoResults.hidden = true;
    els.emptyPickOne.hidden = true;
  }

  function renderEditor() {
    const note = getNote(state.selectedId);
    if (!note) {
      els.editorView.hidden = true;
      return;
    }

    hideAllEmpties();
    els.editorView.hidden = false;

    if (document.activeElement !== els.titleInput) {
      els.titleInput.value = note.title || '';
    }
    els.titleInput.placeholder = deriveTitle({ ...note, title: '' }) || 'Untitled note';

    renderPinButton(note);
    renderTagPills(note);

    if (state.editing) {
      els.editor.hidden = false;
      els.rendered.hidden = true;
      if (document.activeElement !== els.editor) {
        els.editor.value = note.body || '';
      }
      els.editBtn.hidden = true;
      els.saveBtn.hidden = false;
    } else {
      els.editor.hidden = true;
      els.rendered.hidden = false;
      if ((note.body || '').trim()) {
        renderMarkdownInto(els.rendered, note.body || '');
      } else {
        renderEmptyBody(els.rendered);
      }
      els.editBtn.hidden = false;
      els.saveBtn.hidden = true;
    }

    els.dirtyIndicator.hidden = !state.dirty;
  }

  function renderPinButton(note) {
    els.pinToggle.setAttribute('aria-pressed', note.pinned ? 'true' : 'false');
    els.pinToggle.classList.toggle('is-active', !!note.pinned);
    els.pinToggle.title = note.pinned ? 'Unpin note' : 'Pin note';
    els.pinToggle.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
  }

  function renderTagPills(note) {
    const items = (note.tags || []).map((tag) => {
      const filterBtn = el('button', {
        class: 'tag-pill-filter',
        text: '#' + tag,
        attrs: { type: 'button', title: 'Filter by #' + tag, 'aria-label': 'Filter by ' + tag },
        on: { click: () => setTagFilter(tag) },
      });
      const remove = el('button', {
        class: 'tag-pill-remove',
        text: '×',
        attrs: { type: 'button', title: 'Remove tag', 'aria-label': 'Remove tag ' + tag },
        on: { click: () => removeTag(tag) },
      });
      const pill = el('span', { class: 'badge badge-accent tag-pill', children: [filterBtn, remove] });
      return el('li', { class: 'tag-pill-item', children: [pill] });
    });
    els.tagPills.replaceChildren(...items);
  }

  // -------- Active filter chip --------
  function renderActiveFilter() {
    if (state.tagFilter) {
      els.activeFilter.hidden = false;
      els.activeFilterTag.textContent = '#' + state.tagFilter;
    } else {
      els.activeFilter.hidden = true;
      els.activeFilterTag.textContent = '';
    }
  }

  // -------- State mutations --------
  async function loadAll() {
    const all = await DB.getAll();
    state.notes = all;
    if (!state.selectedId && all.length) {
      const sorted = sortNotes(all.filter((n) => n.pinned)).concat(sortNotes(all.filter((n) => !n.pinned)));
      state.selectedId = sorted[0].id;
    }
    renderAll();
  }

  function renderAll() {
    renderSidebar();
    renderActiveFilter();

    if (state.notes.length === 0) {
      showEmpty('no-notes');
    } else if (filteredNotes().length === 0) {
      showEmpty('no-results');
    } else if (state.selectedId && getNote(state.selectedId)) {
      renderEditor();
    } else {
      showEmpty('pick-one');
    }
    syncMobileView();
  }

  async function createNote() {
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
    }
    const t = now();
    const note = {
      id: uuid(),
      title: '',
      body: '',
      tags: [],
      pinned: false,
      createdAt: t,
      updatedAt: t,
    };
    state.notes.push(note);
    state.selectedId = note.id;
    state.editing = true;
    state.dirty = false;
    await DB.put(note);
    renderAll();
    state.mobileView = 'editor';
    syncMobileView();
    setTimeout(() => els.editor.focus(), 0);
  }

  async function selectNote(id) {
    if (state.selectedId === id && !state.editing) return;
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
    }
    state.selectedId = id;
    state.editing = false;
    state.dirty = false;
    state.mobileView = 'editor';
    renderAll();
  }

  async function saveCurrent() {
    if (!state.editing) return;
    const note = getNote(state.selectedId);
    if (!note) return;
    note.title = els.titleInput.value.trim();
    note.body = els.editor.value;
    note.updatedAt = now();
    await DB.put(note);
    state.editing = false;
    state.dirty = false;
    renderAll();
  }

  async function deleteCurrent() {
    const id = state.selectedId;
    if (!id) return;
    await DB.remove(id);
    state.notes = state.notes.filter((n) => n.id !== id);
    state.selectedId = state.notes.length ? state.notes[0].id : null;
    state.editing = false;
    state.dirty = false;
    state.mobileView = 'list';
    renderAll();
  }

  async function togglePin() {
    const note = getNote(state.selectedId);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updatedAt = now();
    await DB.put(note);
    renderAll();
  }

  async function addTagFromInput() {
    const raw = els.tagInput.value;
    if (!raw) return;
    const parts = raw.split(',').map(normalizeTag).filter(Boolean);
    if (!parts.length) {
      els.tagInput.value = '';
      return;
    }
    const note = getNote(state.selectedId);
    if (!note) return;
    note.tags = Array.from(new Set([...(note.tags || []), ...parts]));
    note.updatedAt = now();
    await DB.put(note);
    els.tagInput.value = '';
    renderAll();
  }

  async function removeTag(tag) {
    const note = getNote(state.selectedId);
    if (!note) return;
    note.tags = (note.tags || []).filter((t) => t !== tag);
    note.updatedAt = now();
    await DB.put(note);
    renderAll();
  }

  function setTagFilter(tag) {
    state.tagFilter = tag ? normalizeTag(tag) : null;
    renderAll();
  }

  function clearAllFilters() {
    state.tagFilter = null;
    state.search = '';
    els.search.value = '';
    renderAll();
  }

  // -------- Dialogs --------
  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function bindDialogClosers() {
    for (const btn of document.querySelectorAll('[data-dialog-close]')) {
      btn.addEventListener('click', () => {
        const dlg = btn.closest('dialog');
        if (dlg) closeDialog(dlg);
      });
    }
  }

  function confirmDiscard() {
    return new Promise((resolve) => {
      openDialog(els.discardDialog);
      let decided = false;
      const onConfirm = () => {
        decided = true;
        closeDialog(els.discardDialog);
        resolve(true);
      };
      const onClose = () => {
        if (decided) return;
        els.confirmDiscard.removeEventListener('click', onConfirm);
        resolve(false);
      };
      els.confirmDiscard.addEventListener('click', onConfirm, { once: true });
      els.discardDialog.addEventListener('close', onClose, { once: true });
    });
  }

  // -------- Export / Import --------
  async function exportAll() {
    const notes = await DB.getAll();
    const payload = {
      app: 'scratchpad',
      version: 1,
      exportedAt: now(),
      notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { attrs: { href: url } });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `scratchpad-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFromFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      alert('Import failed: file is not valid JSON.');
      return;
    }
    const notes = Array.isArray(data) ? data : data.notes;
    if (!Array.isArray(notes)) {
      alert('Import failed: no notes array found.');
      return;
    }
    const cleaned = notes
      .filter((n) => n && typeof n === 'object')
      .map((n) => ({
        id: typeof n.id === 'string' && n.id ? n.id : uuid(),
        title: typeof n.title === 'string' ? n.title : '',
        body: typeof n.body === 'string' ? n.body : '',
        tags: Array.isArray(n.tags) ? n.tags.map(normalizeTag).filter(Boolean) : [],
        pinned: !!n.pinned,
        createdAt: Number.isFinite(n.createdAt) ? n.createdAt : now(),
        updatedAt: Number.isFinite(n.updatedAt) ? n.updatedAt : now(),
      }));
    if (!cleaned.length) {
      alert('Import found no valid notes.');
      return;
    }
    await DB.bulkPut(cleaned);
    await loadAll();
    closeDialog(els.aboutDialog);
  }

  // -------- Mobile view sync --------
  function isNarrow() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function syncMobileView() {
    if (!isNarrow()) {
      els.shell.classList.remove('mobile-list', 'mobile-editor');
      return;
    }
    els.shell.classList.toggle('mobile-editor', state.mobileView === 'editor' && !!state.selectedId);
    els.shell.classList.toggle('mobile-list', state.mobileView === 'list' || !state.selectedId);
  }

  // -------- Event wiring --------
  function bindEvents() {
    const onSearch = debounce(() => {
      state.search = els.search.value;
      renderAll();
    }, 150);
    els.search.addEventListener('input', onSearch);

    els.clearFilter.addEventListener('click', () => setTagFilter(null));
    els.clearSearchBtn.addEventListener('click', clearAllFilters);

    els.newNote.addEventListener('click', createNote);
    els.emptyNewNote.addEventListener('click', createNote);

    els.titleInput.addEventListener('input', markDirty);
    els.titleInput.addEventListener('blur', async () => {
      const note = getNote(state.selectedId);
      if (!note) return;
      const v = els.titleInput.value.trim();
      if ((note.title || '') === v) return;
      note.title = v;
      note.updatedAt = now();
      await DB.put(note);
      if (!state.editing) state.dirty = false;
      renderSidebar();
      els.dirtyIndicator.hidden = !state.dirty;
    });

    els.pinToggle.addEventListener('click', togglePin);

    els.editBtn.addEventListener('click', () => {
      state.editing = true;
      state.dirty = false;
      renderEditor();
      setTimeout(() => els.editor.focus(), 0);
    });
    els.saveBtn.addEventListener('click', saveCurrent);

    els.editor.addEventListener('input', markDirty);

    els.deleteBtn.addEventListener('click', () => openDialog(els.deleteDialog));
    els.confirmDelete.addEventListener('click', async () => {
      closeDialog(els.deleteDialog);
      await deleteCurrent();
    });

    els.backToList.addEventListener('click', async () => {
      if (state.editing && state.dirty) {
        const ok = await confirmDiscard();
        if (!ok) return;
        state.editing = false;
        state.dirty = false;
      }
      state.mobileView = 'list';
      syncMobileView();
    });

    els.tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTagFromInput();
      }
    });
    els.tagInput.addEventListener('blur', () => {
      if (els.tagInput.value.trim()) addTagFromInput();
    });

    els.openAbout.addEventListener('click', () => openDialog(els.aboutDialog));
    els.exportBtn.addEventListener('click', exportAll);
    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', async () => {
      const file = els.importFile.files && els.importFile.files[0];
      if (file) await importFromFile(file);
      els.importFile.value = '';
    });

    window.addEventListener('keydown', onGlobalKey);
    window.addEventListener('resize', debounce(syncMobileView, 100));

    bindDialogClosers();
  }

  function markDirty() {
    state.dirty = true;
    els.dirtyIndicator.hidden = false;
  }

  function isTypingTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
  }

  function onGlobalKey(e) {
    const meta = e.metaKey || e.ctrlKey;

    if (meta && (e.key === 's' || e.key === 'S')) {
      if (state.editing) {
        e.preventDefault();
        saveCurrent();
      }
      return;
    }

    if (meta && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      createNote();
      return;
    }

    if (meta && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      els.search.focus();
      els.search.select();
      return;
    }

    if (e.key === '/' && !isTypingTarget(e.target)) {
      e.preventDefault();
      els.search.focus();
      els.search.select();
      return;
    }

    if (e.key === 'Escape') {
      if (document.activeElement === els.search) {
        if (state.search || state.tagFilter) {
          e.preventDefault();
          clearAllFilters();
        } else {
          els.search.blur();
        }
        return;
      }
      if (state.editing) {
        e.preventDefault();
        if (state.dirty) {
          confirmDiscard().then((ok) => {
            if (ok) {
              state.editing = false;
              state.dirty = false;
              renderEditor();
            }
          });
        } else {
          state.editing = false;
          renderEditor();
        }
      }
    }
  }

  // -------- Boot --------
  async function init() {
    bindEvents();
    try {
      await loadAll();
    } catch (e) {
      console.error('Failed to load notes', e);
      alert('Scratchpad failed to open its database. Storage may be blocked.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
