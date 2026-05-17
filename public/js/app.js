/* Scratchpad app: state, rendering, events. Depends on marked, DOMPurify, ScratchpadDB. */
(function () {
  'use strict';

  const DB = window.ScratchpadDB;
  const REVISION_LIMIT = 10;
  const DRAFT_DEBOUNCE_MS = 350;

  const state = {
    notes: [],
    selectedId: null,
    editing: false,
    dirty: false,
    search: '',
    tagFilter: null,
    view: 'active',
    mobileView: 'list', // 'list' | 'editor' - only meaningful on narrow viewports
    promptedDrafts: new Set(),
    pendingTagDelete: null,
    importPreview: null,
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
    activeNotesView: $('active-notes-view'),
    trashView: $('trash-view'),
    manageTags: $('manage-tags'),
    newNote: $('new-note'),
    emptyNewNote: $('empty-new-note'),
    noteList: $('note-list'),
    noteCount: $('note-count'),
    backToList: $('back-to-list'),
    breadcrumb: $('note-breadcrumb'),
    titleDisplay: $('note-title-display'),
    titleInput: $('note-title-input'),
    noteEyebrow: $('note-eyebrow'),
    noteByline: $('note-byline'),
    editorDocHead: $('editor-doc-head'),
    editorCard: document.querySelector('.editor-card'),
    pinToggle: $('pin-toggle'),
    pinIcon: $('pin-icon'),
    editBtn: $('edit-btn'),
    saveBtn: $('save-btn'),
    historyBtn: $('history-btn'),
    restoreBtn: $('restore-btn'),
    permanentDeleteBtn: $('permanent-delete-btn'),
    deleteBtn: $('delete-btn'),
    overflowBtn: $('overflow-btn'),
    overflowMenu: $('overflow-menu'),
    exportOverflowBtn: $('export-overflow-btn'),
    discardOverflowBtn: $('discard-overflow-btn'),
    dirtyIndicator: $('dirty-indicator'),
    tagBar: $('tag-bar'),
    tagPills: $('tag-pills'),
    tagInput: $('tag-input'),
    tagAddEmpty: $('tag-add-empty'),
    tagAddPlus: $('tag-add-plus'),
    rendered: $('note-rendered'),
    editor: $('note-editor'),
    editorEmptyState: $('editor-empty-state'),
    editorView: $('editor-view'),
    emptyNoNotes: $('empty-no-notes'),
    emptyNoResults: $('empty-no-results'),
    emptyPickOne: $('empty-pick-one'),
    emptyTrash: $('empty-trash'),
    clearSearchBtn: $('clear-search-btn'),
    emptyImportNotes: $('empty-import-notes'),
    deleteDialog: $('delete-dialog'),
    confirmDelete: $('confirm-delete'),
    permanentDeleteDialog: $('permanent-delete-dialog'),
    confirmPermanentDelete: $('confirm-permanent-delete'),
    emptyTrashDialog: $('empty-trash-dialog'),
    confirmEmptyTrash: $('confirm-empty-trash'),
    discardDialog: $('discard-dialog'),
    confirmDiscard: $('confirm-discard'),
    draftDialog: $('draft-dialog'),
    draftDialogCopy: $('draft-dialog-copy'),
    restoreDraft: $('restore-draft'),
    discardDraft: $('discard-draft'),
    historyDialog: $('history-dialog'),
    historyList: $('history-list'),
    aboutDialog: $('about-dialog'),
    openAbout: $('open-about'),
    exportBtn: $('export-btn'),
    exportMarkdownBtn: $('export-markdown-btn'),
    importBtn: $('import-btn'),
    importFile: $('import-file'),
    importPreviewDialog: $('import-preview-dialog'),
    importPreviewCounts: $('import-preview-counts'),
    confirmImport: $('confirm-import'),
    tagManagerDialog: $('tag-manager-dialog'),
    tagManagerList: $('tag-manager-list'),
    tagDeleteDialog: $('tag-delete-dialog'),
    tagDeleteCopy: $('tag-delete-copy'),
    confirmTagDelete: $('confirm-tag-delete'),
    pinTemplate: $('tpl-pin-icon'),
    shareBtn: $('share-btn'),
    shareDialog: $('share-dialog'),
    shareCopy: $('share-copy'),
    shareEmail: $('share-email'),
    shareStatus: $('share-status'),
    shareMailtoWarning: $('share-mailto-warning'),
  };

  // mailto: URLs above ~2000 chars get truncated by many mail clients;
  // measure the encoded body since newlines and punctuation balloon when
  // percent-encoded.
  const MAILTO_ENCODED_LIMIT = 1800;

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
      for (const [k, v] of Object.entries(options.attrs)) {
        if (v === false || v == null) continue;
        node.setAttribute(k, v === true ? '' : v);
      }
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
    const d = new Date(ms || now());
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatFullTimestamp(ms) {
    return new Date(ms || now()).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // Sidebar row date format: today → "2:08p", yesterday → "Yest",
  // last 7 days → "Thu", this year → "May 15", older → "May '24".
  function formatRelativeDay(ms) {
    const d = new Date(ms || now());
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    if (ms >= todayStart) {
      let hour = d.getHours();
      const period = hour >= 12 ? 'p' : 'a';
      if (hour === 0) hour = 12;
      else if (hour > 12) hour -= 12;
      return hour + ':' + String(d.getMinutes()).padStart(2, '0') + period;
    }
    if (ms >= yesterdayStart) return 'Yest';
    if (ms >= weekStart) {
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    }
    if (d.getFullYear() === today.getFullYear()) {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString([], { month: 'short' }) + " '" + String(d.getFullYear()).slice(-2);
  }

  function wordCount(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function formatReadTime(words) {
    const seconds = Math.ceil((words / 200) * 60);
    if (seconds < 60) return seconds + 's';
    return Math.ceil(seconds / 60) + 'm';
  }

  // Buckets active-view notes for the sidebar: Pinned, Today, Yesterday,
  // This week, Earlier. Sort within buckets is already done by caller.
  function bucketizeNotes(notes) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    const pinned = [];
    const todayBucket = [];
    const yesterdayBucket = [];
    const thisWeek = [];
    const earlier = [];

    for (const note of notes) {
      if (note.pinned && !isTrashed(note)) {
        pinned.push(note);
        continue;
      }
      const ts = isTrashed(note) ? note.deletedAt : note.updatedAt;
      if (ts >= todayStart) todayBucket.push(note);
      else if (ts >= yesterdayStart) yesterdayBucket.push(note);
      else if (ts >= weekStart) thisWeek.push(note);
      else earlier.push(note);
    }
    return [
      { label: 'Pinned', notes: pinned, isPinnedSection: true },
      { label: 'Today', notes: todayBucket },
      { label: 'Yesterday', notes: yesterdayBucket },
      { label: 'This week', notes: thisWeek },
      { label: 'Earlier', notes: earlier },
    ];
  }

  // Post-render decorator: tag first paragraph as a lede and short
  // single-paragraph blockquotes as pullquotes. Selectors stay simple
  // because the JS does the picking.
  function decorateRendered(root) {
    const firstP = root.querySelector(':scope > p');
    if (firstP && firstP.textContent.length > 60) firstP.classList.add('is-lede');

    for (const bq of root.querySelectorAll('blockquote')) {
      const ps = bq.querySelectorAll('p');
      if (ps.length === 1 && ps[0].textContent.length < 200) {
        bq.classList.add('is-pullquote');
      }
    }
  }

  function truncate(text, n) {
    if (!text) return '';
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > n ? text.slice(0, n - 1) + '…' : text;
  }

  function noteExcerpt(note) {
    const title = deriveTitle(note).toLowerCase();
    const lines = (note.body || '').split(/\r?\n/);
    for (const raw of lines) {
      let line = raw.trim();
      if (!line) continue;
      line = line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_~#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!line || line.toLowerCase() === title) continue;
      return truncate(line, 112);
    }
    return '';
  }

  function normalizeTag(t) {
    return (t || '').toLowerCase().trim().replace(/\s+/g, '-');
  }

  function finiteTime(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalizeNote(n) {
    const t = now();
    return {
      id: typeof n.id === 'string' && n.id ? n.id : uuid(),
      title: typeof n.title === 'string' ? n.title : '',
      body: typeof n.body === 'string' ? n.body : '',
      tags: Array.isArray(n.tags) ? Array.from(new Set(n.tags.map(normalizeTag).filter(Boolean))) : [],
      pinned: !!n.pinned,
      createdAt: finiteTime(n.createdAt, t),
      updatedAt: finiteTime(n.updatedAt, t),
      deletedAt: Number.isFinite(n.deletedAt) ? n.deletedAt : null,
      lastDraftAt: Number.isFinite(n.lastDraftAt) ? n.lastDraftAt : null,
    };
  }

  function normalizeRevision(rev, noteId) {
    if (!rev || typeof rev !== 'object') return null;
    const t = now();
    return {
      id: typeof rev.id === 'string' && rev.id ? rev.id : uuid(),
      noteId: noteId || rev.noteId,
      title: typeof rev.title === 'string' ? rev.title : '',
      body: typeof rev.body === 'string' ? rev.body : '',
      tags: Array.isArray(rev.tags) ? Array.from(new Set(rev.tags.map(normalizeTag).filter(Boolean))) : [],
      pinned: !!rev.pinned,
      createdAt: finiteTime(rev.createdAt, t),
      updatedAt: finiteTime(rev.updatedAt, t),
      savedAt: finiteTime(rev.savedAt, finiteTime(rev.updatedAt, t)),
      deletedAt: Number.isFinite(rev.deletedAt) ? rev.deletedAt : null,
    };
  }

  function getNote(id) {
    return state.notes.find((n) => n.id === id) || null;
  }

  function isTrashed(note) {
    return !!(note && Number.isFinite(note.deletedAt));
  }

  function activeNotes() {
    return state.notes.filter((n) => !isTrashed(n));
  }

  function trashedNotes() {
    return state.notes.filter(isTrashed);
  }

  function currentBaseNotes() {
    return state.view === 'trash' ? trashedNotes() : activeNotes();
  }

  function selectedNoteIsInView() {
    const note = getNote(state.selectedId);
    return !!note && (state.view === 'trash' ? isTrashed(note) : !isTrashed(note));
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
    for (const a of frag.querySelectorAll('a[href]')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
    for (const pre of frag.querySelectorAll('pre')) pre.classList.add('code-block');
    container.appendChild(frag);
    decorateRendered(container);
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
    return currentBaseNotes().filter((n) => {
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

  function renderViewSwitch() {
    els.activeNotesView.classList.toggle('is-active', state.view === 'active');
    els.trashView.classList.toggle('is-active', state.view === 'trash');
  }

  function renderSidebar() {
    const filtered = filteredNotes();
    const sorted = sortNotes(filtered);
    const children = [];

    if (state.view === 'trash') {
      if (trashedNotes().length) {
        children.push(el('div', {
          class: 'trash-tools',
          children: [
            el('button', {
              class: 'btn btn-danger btn-sm',
              text: 'Empty Trash',
              attrs: { type: 'button' },
              on: { click: () => openDialog(els.emptyTrashDialog) },
            }),
          ],
        }));
      }
      if (sorted.length) children.push(renderSection('Trash', sorted));
    } else {
      const buckets = bucketizeNotes(sorted);
      for (const bucket of buckets) {
        if (!bucket.notes.length) continue;
        children.push(renderSection(bucket.label, bucket.notes, bucket.isPinnedSection));
      }
    }

    if (!children.length || (state.view === 'trash' && !sorted.length)) {
      children.push(renderSidebarEmptyState());
    }
    els.noteList.replaceChildren(...children);
    renderViewSwitch();
  }

  function renderSidebarEmptyState() {
    const hasActiveNotes = activeNotes().length > 0;
    const hasTrash = trashedNotes().length > 0;
    const searching = !!state.search.trim() || !!state.tagFilter;

    if (state.view === 'trash' && !hasTrash) {
      return el('div', {
        class: 'sidebar-empty',
        children: [
          el('p', { class: 'sidebar-empty-title', text: 'Trash is empty' }),
          el('p', { class: 'sidebar-empty-copy', text: 'Deleted notes will appear here.' }),
        ],
      });
    }

    if (hasActiveNotes && searching) {
      return el('div', {
        class: 'sidebar-empty',
        children: [
          el('p', { class: 'sidebar-empty-title', text: 'No matches' }),
          el('p', { class: 'sidebar-empty-copy', text: 'Try a different search or clear the active filters.' }),
          el('button', {
            class: 'btn btn-secondary btn-sm',
            text: 'Clear filters',
            attrs: { type: 'button' },
            on: { click: clearAllFilters },
          }),
        ],
      });
    }

    return el('div', {
      class: 'sidebar-empty',
      children: [
        el('p', { class: 'sidebar-empty-title', text: 'No notes yet' }),
        el('p', { class: 'sidebar-empty-copy', text: 'Create a note or import a backup to begin.' }),
        el('div', {
          class: 'sidebar-empty-actions',
          children: [
            el('button', {
              class: 'btn btn-primary btn-sm',
              text: 'New note',
              attrs: { type: 'button' },
              on: { click: createNote },
            }),
            el('button', {
              class: 'btn btn-secondary btn-sm',
              text: 'Import',
              attrs: { type: 'button' },
              on: { click: () => els.importFile.click() },
            }),
          ],
        }),
      ],
    });
  }

  function renderSection(label, notes, isPinnedSection) {
    const headingClass = 'eyebrow note-section-head' + (isPinnedSection ? ' is-pinned' : '');
    const heading = el('div', { class: headingClass, text: label });
    const rows = notes.map(renderRow);
    return el('div', { class: 'note-section', children: [heading, ...rows] });
  }

  function renderRow(note) {
    const trashed = isTrashed(note);
    const pinned = !!(note.pinned && !trashed);
    const time = trashed ? note.deletedAt : note.updatedAt;
    const excerpt = noteExcerpt(note);

    const children = [
      el('span', { class: 'note-row-title', text: truncate(deriveTitle(note), 64) }),
    ];

    if (pinned) {
      const pinCorner = el('span', {
        class: 'note-row-pin-corner',
        attrs: { 'aria-label': 'Pinned' },
      });
      pinCorner.appendChild(clonePinIcon());
      children.push(pinCorner);
    } else {
      children.push(el('span', { class: 'note-row-when', text: formatRelativeDay(time) }));
    }

    if (excerpt) {
      children.push(el('span', { class: 'note-row-excerpt', text: excerpt }));
    }

    if (pinned) {
      children.push(el('span', { class: 'note-row-when', text: formatRelativeDay(time) }));
    }

    if (note.tags && note.tags.length) {
      const tagButtons = note.tags.slice(0, 4).map((t) =>
        el('button', {
          class: 'note-row-tag',
          text: t,
          attrs: { type: 'button', 'data-tag': t },
        })
      );
      children.push(el('span', { class: 'note-row-tags', children: tagButtons }));
    }

    return el('button', {
      class: 'note-row' +
        (note.id === state.selectedId ? ' is-active' : '') +
        (trashed ? ' is-trashed' : '') +
        (pinned ? ' is-pinned' : ''),
      attrs: { type: 'button', 'data-id': note.id },
      children,
      on: {
        click: (e) => {
          const tagBtn = e.target.closest('.note-row-tag');
          if (tagBtn && state.view !== 'trash') {
            e.stopPropagation();
            setTagFilter(tagBtn.dataset.tag);
            return;
          }
          selectNote(note.id);
        },
      },
    });
  }

  // -------- Editor rendering --------
  function showEmpty(which) {
    els.editorView.hidden = true;
    els.emptyNoNotes.hidden = which !== 'no-notes';
    els.emptyNoResults.hidden = which !== 'no-results';
    els.emptyPickOne.hidden = which !== 'pick-one';
    els.emptyTrash.hidden = which !== 'trash';
  }

  function hideAllEmpties() {
    els.emptyNoNotes.hidden = true;
    els.emptyNoResults.hidden = true;
    els.emptyPickOne.hidden = true;
    els.emptyTrash.hidden = true;
  }

  let lastRenderedNoteId = null;
  let lastEditorMode = false;

  function renderEditor() {
    const note = getNote(state.selectedId);
    if (!note) {
      els.editorView.hidden = true;
      els.editorCard.classList.remove('is-editing');
      lastRenderedNoteId = null;
      lastEditorMode = false;
      return;
    }

    const trashed = isTrashed(note);
    if (trashed) state.editing = false;
    hideAllEmpties();
    els.editorView.hidden = false;
    els.titleInput.disabled = trashed;
    els.tagBar.classList.toggle('is-readonly', trashed);

    const noteChanged = lastRenderedNoteId !== note.id;
    if (noteChanged) {
      els.tagInput.value = '';
      els.tagInput.hidden = true;
      closeOverflowMenu();
    }
    lastRenderedNoteId = note.id;

    const preserveDraftInputs = state.editing && state.dirty && !trashed;
    if (!preserveDraftInputs && document.activeElement !== els.titleInput) {
      els.titleInput.value = note.title || '';
    }
    els.titleInput.placeholder = deriveTitle({ ...note, title: '' }) || 'Untitled note';

    const showInput = state.editing && !trashed;
    els.editorCard.classList.toggle('is-editing', showInput);
    if (showInput && (!lastEditorMode || noteChanged)) {
      els.editorCard.scrollTop = 0;
    }
    lastEditorMode = showInput;

    els.titleDisplay.hidden = showInput;
    els.titleInput.hidden = !showInput;
    els.titleDisplay.textContent = deriveTitle(note);

    renderBreadcrumb(note);
    renderEyebrow(note);
    renderByline(note);
    renderPinButton(note);
    renderTagBar(note, !trashed);

    els.pinToggle.hidden = trashed;
    els.shareBtn.hidden = trashed;
    els.deleteBtn.hidden = trashed;
    els.restoreBtn.hidden = !trashed;
    els.permanentDeleteBtn.hidden = !trashed;
    els.overflowBtn.hidden = trashed;
    els.discardOverflowBtn.hidden = !(state.editing && state.dirty);

    const bodyEmpty = !(note.body || '').trim();
    const showEmptyState = bodyEmpty && !state.editing && !trashed;
    els.editorEmptyState.hidden = !showEmptyState;
    els.editorDocHead.hidden = showEmptyState;
    els.tagBar.hidden = showEmptyState;

    if (state.editing && !trashed) {
      els.editor.hidden = false;
      els.rendered.hidden = true;
      if (!preserveDraftInputs && document.activeElement !== els.editor) {
        els.editor.value = note.body || '';
      }
      els.editBtn.hidden = true;
      els.saveBtn.hidden = false;
    } else {
      els.editor.hidden = true;
      if (showEmptyState) {
        els.rendered.hidden = true;
      } else if (bodyEmpty) {
        els.rendered.hidden = false;
        renderEmptyBody(els.rendered);
      } else {
        els.rendered.hidden = false;
        renderMarkdownInto(els.rendered, note.body || '');
      }
      els.editBtn.hidden = trashed;
      els.saveBtn.hidden = true;
    }

    els.dirtyIndicator.hidden = !state.dirty || trashed;
  }

  function renderBreadcrumb(note) {
    const trashed = isTrashed(note);
    const pinned = note.pinned && !trashed;
    let primary;
    let secondary;
    if (trashed) {
      primary = 'trash';
      secondary = truncate(deriveTitle(note), 32);
    } else if (pinned) {
      primary = 'notes';
      secondary = 'pinned';
    } else {
      primary = 'notes';
      secondary = (note.title || '').trim() || (note.body || '').trim() ? 'note' : 'draft';
    }
    els.breadcrumb.replaceChildren(
      document.createTextNode(primary),
      el('span', { class: 'crumb-sep', text: '/' }),
      document.createTextNode(secondary),
    );
  }

  function renderEyebrow(note) {
    const trashed = isTrashed(note);
    const pinned = note.pinned && !trashed;
    let label;
    if (trashed) label = 'Note · trashed';
    else if (pinned) label = 'Note · pinned';
    else label = 'Note · draft';
    els.noteEyebrow.textContent = label;
  }

  function renderByline(note) {
    const words = wordCount(note.body || '');
    const created = formatBylineDate(note.createdAt);
    const updated = formatBylineDate(note.updatedAt);
    const wordLabel = words + ' word' + (words === 1 ? '' : 's');
    const parts = [
      'Created ' + created,
      'Updated ' + updated,
      wordLabel,
      formatReadTime(words) + ' read',
    ];
    els.noteByline.textContent = parts.join(' · ');
  }

  function formatBylineDate(ms) {
    const d = new Date(ms || now());
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameYear = d.getFullYear() === today.getFullYear();
    return d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderPinButton(note) {
    els.pinToggle.setAttribute('aria-pressed', note.pinned ? 'true' : 'false');
    els.pinToggle.classList.toggle('is-active', !!note.pinned);
    els.pinToggle.title = note.pinned ? 'Unpin note' : 'Pin note';
    els.pinToggle.setAttribute('aria-label', note.pinned ? 'Unpin note' : 'Pin note');
  }

  function renderTagPills(note, canEdit) {
    const items = (note.tags || []).map((tag) => {
      const filterBtn = el('button', {
        class: 'tag-pill-filter',
        text: '#' + tag,
        attrs: { type: 'button', title: 'Filter by #' + tag, 'aria-label': 'Filter by ' + tag },
        on: { click: () => setTagFilter(tag) },
      });
      const children = [filterBtn];
      if (canEdit) {
        children.push(el('button', {
          class: 'tag-pill-remove',
          text: '×',
          attrs: { type: 'button', title: 'Remove tag', 'aria-label': 'Remove tag ' + tag },
          on: { click: () => removeTag(tag) },
        }));
      }
      const pill = el('span', { class: 'badge badge-accent tag-pill', children });
      return el('li', { class: 'tag-pill-item', children: [pill] });
    });
    els.tagPills.replaceChildren(...items);
  }

  // Collapsible tag bar state: empty (just a "+ Add tag" pill), pills with
  // a "+" affordance, or an open input. Preserves input focus during renders.
  function renderTagBar(note, canEdit) {
    renderTagPills(note, canEdit);
    const tags = note.tags || [];
    const inputOpen = !els.tagInput.hidden;

    if (!canEdit) {
      els.tagAddEmpty.hidden = true;
      els.tagAddPlus.hidden = true;
      els.tagInput.hidden = true;
      els.tagInput.disabled = true;
      return;
    }
    els.tagInput.disabled = false;

    if (inputOpen) {
      els.tagAddEmpty.hidden = true;
      els.tagAddPlus.hidden = true;
      return;
    }

    if (tags.length === 0) {
      els.tagAddEmpty.hidden = false;
      els.tagAddPlus.hidden = true;
    } else {
      els.tagAddEmpty.hidden = true;
      els.tagAddPlus.hidden = false;
    }
  }

  function openTagInput() {
    els.tagAddEmpty.hidden = true;
    els.tagAddPlus.hidden = true;
    els.tagInput.hidden = false;
    setTimeout(() => els.tagInput.focus(), 0);
  }

  function collapseTagInput() {
    els.tagInput.hidden = true;
    const note = getNote(state.selectedId);
    if (note && !isTrashed(note)) renderTagBar(note, true);
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
    state.notes = all.map(normalizeNote);
    ensureSelectionForView();
    renderAll();
    await maybePromptDraftForSelected();
  }

  function ensureSelectionForView() {
    const visible = filteredNotes();
    if (selectedNoteIsInView() && (!state.search || visible.some((n) => n.id === state.selectedId))) return;
    const pinned = sortNotes(visible.filter((n) => n.pinned && !isTrashed(n)));
    const others = sortNotes(visible.filter((n) => !n.pinned || isTrashed(n)));
    const next = pinned.concat(others)[0] || currentBaseNotes()[0] || null;
    state.selectedId = next ? next.id : null;
  }

  function updateNoteCount() {
    if (!els.noteCount) return;
    els.noteCount.textContent = String(activeNotes().length);
  }

  // -------- Overflow menu (#6) --------
  function openOverflowMenu() {
    if (!els.overflowMenu.hidden) return;
    els.overflowMenu.hidden = false;
    els.overflowBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOverflowOutsideClick, true);
    document.addEventListener('keydown', onOverflowKey, true);
  }

  function closeOverflowMenu() {
    if (els.overflowMenu.hidden) return;
    els.overflowMenu.hidden = true;
    els.overflowBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOverflowOutsideClick, true);
    document.removeEventListener('keydown', onOverflowKey, true);
  }

  function toggleOverflowMenu() {
    if (els.overflowMenu.hidden) openOverflowMenu();
    else closeOverflowMenu();
  }

  function onOverflowOutsideClick(e) {
    if (els.overflowMenu.contains(e.target) || els.overflowBtn.contains(e.target)) return;
    closeOverflowMenu();
  }

  function onOverflowKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverflowMenu();
      els.overflowBtn.focus();
    }
  }

  function renderAll() {
    ensureSelectionForView();
    renderSidebar();
    renderActiveFilter();
    updateNoteCount();

    const base = currentBaseNotes();
    if (state.view === 'trash' && base.length === 0) {
      showEmpty('trash');
    } else if (state.view === 'active' && activeNotes().length === 0) {
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

  async function setView(view) {
    if (view === state.view) return;
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
      await discardCurrentDraft();
    }
    state.view = view;
    state.editing = false;
    state.dirty = false;
    state.selectedId = null;
    renderAll();
    await maybePromptDraftForSelected();
  }

  async function createNote() {
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
      await discardCurrentDraft();
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
      deletedAt: null,
      lastDraftAt: null,
    };
    state.view = 'active';
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
      await discardCurrentDraft();
    }
    state.selectedId = id;
    state.editing = false;
    state.dirty = false;
    state.mobileView = 'editor';
    renderAll();
    await maybePromptDraftForSelected();
  }

  async function saveCurrent() {
    if (!state.editing) return;
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    const nextTitle = els.titleInput.value.trim();
    const nextBody = els.editor.value;
    const changed = (note.title || '') !== nextTitle || (note.body || '') !== nextBody;
    if (changed) await storeRevision(note);
    note.title = nextTitle;
    note.body = nextBody;
    note.updatedAt = now();
    note.lastDraftAt = null;
    await DB.put(note);
    await DB.removeDraft(note.id);
    state.editing = false;
    state.dirty = false;
    renderAll();
  }

  async function storeRevision(note) {
    const snapshot = normalizeRevision({
      id: uuid(),
      noteId: note.id,
      title: note.title || '',
      body: note.body || '',
      tags: [...(note.tags || [])],
      pinned: !!note.pinned,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      savedAt: now(),
      deletedAt: note.deletedAt,
    }, note.id);
    await DB.putRevision(snapshot);
    await DB.pruneRevisions(note.id, REVISION_LIMIT);
  }

  async function moveCurrentToTrash() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
      await discardCurrentDraft();
    }
    const t = now();
    note.deletedAt = t;
    note.updatedAt = t;
    note.lastDraftAt = null;
    await DB.put(note);
    await DB.removeDraft(note.id);
    state.editing = false;
    state.dirty = false;
    state.selectedId = null;
    state.mobileView = 'list';
    renderAll();
  }

  async function restoreCurrentFromTrash() {
    const note = getNote(state.selectedId);
    if (!note || !isTrashed(note)) return;
    note.deletedAt = null;
    note.updatedAt = now();
    await DB.put(note);
    state.view = 'active';
    state.selectedId = note.id;
    renderAll();
  }

  async function permanentlyDeleteCurrent() {
    const id = state.selectedId;
    if (!id) return;
    await DB.deleteNoteEverywhere(id);
    state.notes = state.notes.filter((n) => n.id !== id);
    state.selectedId = null;
    state.editing = false;
    state.dirty = false;
    renderAll();
  }

  async function emptyTrash() {
    const notes = trashedNotes();
    await Promise.all(notes.map((note) => DB.deleteNoteEverywhere(note.id)));
    state.notes = state.notes.filter((n) => !isTrashed(n));
    state.selectedId = null;
    state.editing = false;
    state.dirty = false;
    renderAll();
  }

  async function togglePin() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
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
    if (!note || isTrashed(note)) return;
    note.tags = Array.from(new Set([...(note.tags || []), ...parts]));
    note.updatedAt = now();
    await DB.put(note);
    els.tagInput.value = '';
    renderAll();
  }

  async function removeTag(tag) {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    note.tags = (note.tags || []).filter((t) => t !== tag);
    note.updatedAt = now();
    await DB.put(note);
    renderAll();
  }

  function setTagFilter(tag) {
    state.tagFilter = tag ? normalizeTag(tag) : null;
    state.view = 'active';
    renderAll();
  }

  function clearAllFilters() {
    state.tagFilter = null;
    state.search = '';
    els.search.value = '';
    renderAll();
  }

  // -------- Drafts --------
  async function persistDraftNow() {
    if (!state.editing || !state.selectedId) return;
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    const updatedAt = now();
    await DB.putDraft({
      noteId: note.id,
      title: els.titleInput.value.trim(),
      body: els.editor.value,
      updatedAt,
    });
    note.lastDraftAt = updatedAt;
    await DB.put(note);
  }

  const persistDraftDebounced = debounce(persistDraftNow, DRAFT_DEBOUNCE_MS);

  async function discardCurrentDraft() {
    const note = getNote(state.selectedId);
    if (!note) return;
    note.lastDraftAt = null;
    await DB.removeDraft(note.id);
    await DB.put(note);
  }

  async function maybePromptDraftForSelected() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note) || state.editing || state.promptedDrafts.has(note.id)) return;
    const draft = await DB.getDraft(note.id);
    if (!draft || !Number.isFinite(draft.updatedAt) || draft.updatedAt <= note.updatedAt) return;
    state.promptedDrafts.add(note.id);
    els.draftDialogCopy.textContent =
      'Scratchpad found unsaved edits from ' + formatFullTimestamp(draft.updatedAt) + ' that are newer than the saved note.';
    openDialog(els.draftDialog);
    const decision = await waitForDraftDecision();
    if (decision === 'restore') {
      state.view = 'active';
      state.selectedId = note.id;
      state.editing = true;
      state.dirty = true;
      renderEditor();
      els.titleInput.value = draft.title || '';
      els.editor.value = draft.body || '';
      els.dirtyIndicator.hidden = false;
      setTimeout(() => els.editor.focus(), 0);
    } else if (decision === 'discard') {
      note.lastDraftAt = null;
      await DB.removeDraft(note.id);
      await DB.put(note);
      renderAll();
    } else {
      state.promptedDrafts.delete(note.id);
    }
  }

  function waitForDraftDecision() {
    return new Promise((resolve) => {
      let decided = null;
      const onRestore = () => {
        decided = 'restore';
        closeDialog(els.draftDialog);
      };
      const onDiscard = () => {
        decided = 'discard';
        closeDialog(els.draftDialog);
      };
      const onClose = () => {
        els.restoreDraft.removeEventListener('click', onRestore);
        els.discardDraft.removeEventListener('click', onDiscard);
        resolve(decided);
      };
      els.restoreDraft.addEventListener('click', onRestore, { once: true });
      els.discardDraft.addEventListener('click', onDiscard, { once: true });
      els.draftDialog.addEventListener('close', onClose, { once: true });
    });
  }

  function markDirty() {
    if (!state.editing) return;
    const wasDirty = state.dirty;
    state.dirty = true;
    els.dirtyIndicator.hidden = false;
    if (wasDirty) persistDraftDebounced();
    else persistDraftNow();
  }

  async function handleTitleInput() {
    if (state.editing) {
      markDirty();
      return;
    }
    state.dirty = true;
    els.dirtyIndicator.hidden = false;
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

  // -------- Share --------
  function buildShareText(note) {
    const title = (note.title || '').trim();
    const body = note.body || '';
    return title ? title + '\n\n' + body : body;
  }

  function showShareStatus(message) {
    if (!message) {
      els.shareStatus.hidden = true;
      els.shareStatus.textContent = '';
      return;
    }
    els.shareStatus.hidden = false;
    els.shareStatus.textContent = message;
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  async function copyShare() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    const text = buildShareText(note);
    let ok = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        ok = false;
      }
    }
    if (!ok) ok = fallbackCopy(text);
    showShareStatus(ok ? 'Copied to clipboard.' : 'Copy failed - try selecting the note text manually.');
    if (ok) setTimeout(() => showShareStatus(''), 2000);
  }

  function emailShare() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    const subject = (note.title || '').trim() || 'Note from Scratchpad';
    let body = buildShareText(note);
    if (encodeURIComponent(body).length > MAILTO_ENCODED_LIMIT) {
      while (body.length && encodeURIComponent(body).length > MAILTO_ENCODED_LIMIT - 60) {
        body = body.slice(0, -50);
      }
      body += '\n\n[note continues - open Scratchpad to see the rest]';
    }
    const href = 'mailto:?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
    window.location.href = href;
  }

  function openShareDialog() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    showShareStatus('');
    const encodedLen = encodeURIComponent(buildShareText(note)).length;
    els.shareMailtoWarning.hidden = encodedLen <= MAILTO_ENCODED_LIMIT;
    openDialog(els.shareDialog);
  }

  // -------- Revision history --------
  async function openHistoryDialog() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    const revisions = await DB.getRevisions(note.id);
    if (!revisions.length) {
      els.historyList.replaceChildren(el('p', { class: 'muted-copy', text: 'No saved revisions yet.' }));
      openDialog(els.historyDialog);
      return;
    }
    const rows = revisions.map((rev) => renderRevisionRow(rev));
    els.historyList.replaceChildren(...rows);
    openDialog(els.historyDialog);
  }

  function renderRevisionRow(rev) {
    const title = el('div', { class: 'history-title', text: deriveTitle(rev) });
    const meta = el('div', { class: 'history-meta', text: 'Saved ' + formatFullTimestamp(rev.savedAt) });
    const preview = el('pre', { class: 'history-preview', text: buildShareText(rev) || '(empty note)' });
    const details = el('details', {
      class: 'history-details',
      children: [el('summary', { text: 'Preview revision' }), preview],
    });
    const restore = el('button', {
      class: 'btn btn-secondary btn-sm',
      text: 'Restore',
      attrs: { type: 'button' },
      on: { click: () => restoreRevision(rev) },
    });
    return el('div', { class: 'history-row', children: [title, meta, details, restore] });
  }

  async function restoreRevision(rev) {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    await storeRevision(note);
    note.title = rev.title || '';
    note.body = rev.body || '';
    note.updatedAt = now();
    note.lastDraftAt = null;
    await DB.put(note);
    await DB.removeDraft(note.id);
    state.editing = false;
    state.dirty = false;
    closeDialog(els.historyDialog);
    renderAll();
  }

  // -------- Export / Import --------
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { attrs: { href: url } });
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  async function exportAll() {
    const notes = (await DB.getAll()).map(normalizeNote);
    const revisions = (await DB.getAllRevisions()).map((rev) => normalizeRevision(rev, rev.noteId)).filter(Boolean);
    const payload = {
      app: 'scratchpad',
      version: window.SCRATCHPAD_VERSION || 'unknown',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      notes: notes.filter((n) => !isTrashed(n)),
      trashedNotes: notes.filter(isTrashed),
      revisions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `scratchpad-${exportStamp()}.json`);
  }

  async function exportMarkdownZip() {
    const notes = activeNotes();
    if (!notes.length) {
      alert('There are no active notes to export.');
      return;
    }
    const used = new Map();
    const files = notes.map((note) => {
      const base = slugify(deriveTitle(note)) || 'untitled-note';
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      const name = count ? `${base}-${count + 1}.md` : `${base}.md`;
      return { name, content: noteToMarkdown(note) };
    });
    const blob = new Blob([createZip(files)], { type: 'application/zip' });
    downloadBlob(blob, `scratchpad-markdown-${exportStamp()}.zip`);
  }

  function noteToMarkdown(note) {
    const lines = [
      '---',
      'title: ' + JSON.stringify(deriveTitle(note)),
      'tags: [' + (note.tags || []).map((tag) => JSON.stringify(tag)).join(', ') + ']',
      'pinned: ' + (!!note.pinned ? 'true' : 'false'),
      'createdAt: ' + JSON.stringify(new Date(note.createdAt).toISOString()),
      'updatedAt: ' + JSON.stringify(new Date(note.updatedAt).toISOString()),
      '---',
      '',
      note.body || '',
    ];
    return lines.join('\n');
  }

  function slugify(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
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
    const preview = buildImportPreview(data);
    if (!preview.notes.length) {
      alert('Import found no valid notes.');
      return;
    }
    state.importPreview = preview;
    renderImportPreview(preview);
    closeDialog(els.aboutDialog);
    openDialog(els.importPreviewDialog);
  }

  function buildImportPreview(data) {
    if (!data || typeof data !== 'object') {
      return { notes: [], revisions: [], invalid: 0, newCount: 0, conflicts: 0 };
    }
    const rawNotes = Array.isArray(data)
      ? data
      : []
        .concat(Array.isArray(data.notes) ? data.notes : [])
        .concat(Array.isArray(data.trashedNotes) ? data.trashedNotes : []);
    const existingIds = new Set(state.notes.map((n) => n.id));
    const notes = [];
    let invalid = 0;
    for (const raw of rawNotes) {
      if (!raw || typeof raw !== 'object' || (typeof raw.title !== 'string' && typeof raw.body !== 'string')) {
        invalid += 1;
        continue;
      }
      notes.push(normalizeNote(raw));
    }
    const revisions = Array.isArray(data.revisions)
      ? data.revisions.map((rev) => normalizeRevision(rev, rev.noteId)).filter((rev) => rev && rev.noteId)
      : [];
    const conflicts = notes.filter((note) => existingIds.has(note.id)).length;
    return {
      notes,
      revisions,
      invalid,
      newCount: notes.length - conflicts,
      conflicts,
    };
  }

  function renderImportPreview(preview) {
    const rows = [
      ['New notes', preview.newCount],
      ['Conflicts', preview.conflicts],
      ['Invalid entries', preview.invalid],
      ['Revision snapshots', preview.revisions.length],
    ].map(([label, value]) => [
      el('dt', { text: label }),
      el('dd', { text: String(value) }),
    ]).flat();
    els.importPreviewCounts.replaceChildren(...rows);
    const duplicate = document.querySelector('input[name="import-conflict-mode"][value="duplicate"]');
    if (duplicate) duplicate.checked = true;
  }

  async function confirmImport() {
    const preview = state.importPreview;
    if (!preview) return;
    const selected = document.querySelector('input[name="import-conflict-mode"]:checked');
    const mode = selected ? selected.value : 'duplicate';
    const existingIds = new Set(state.notes.map((n) => n.id));
    const idMap = new Map();
    const notesToImport = [];
    for (const note of preview.notes) {
      const conflict = existingIds.has(note.id);
      if (conflict && mode === 'skip') continue;
      if (conflict && mode === 'duplicate') {
        const newId = uuid();
        idMap.set(note.id, newId);
        notesToImport.push({ ...note, id: newId });
      } else {
        idMap.set(note.id, note.id);
        notesToImport.push(note);
      }
    }
    const revisionsToImport = preview.revisions
      .filter((rev) => idMap.has(rev.noteId))
      .map((rev) => ({ ...rev, id: uuid(), noteId: idMap.get(rev.noteId) }));
    if (notesToImport.length) await DB.bulkPut(notesToImport);
    if (revisionsToImport.length) await DB.bulkPutRevisions(revisionsToImport);
    for (const noteId of new Set(revisionsToImport.map((rev) => rev.noteId))) {
      await DB.pruneRevisions(noteId, REVISION_LIMIT);
    }
    state.importPreview = null;
    closeDialog(els.importPreviewDialog);
    await loadAll();
  }

  // Tiny ZIP writer using stored files only. Keeps Markdown export dependency-free.
  function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = zipLocalHeader(name, data, crc);
      localParts.push(local, data);
      centralParts.push(zipCentralHeader(name, data, crc, offset));
      offset += local.length + data.length;
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = zipEnd(files.length, centralSize, offset);
    return concatBytes([...localParts, ...centralParts, end]);
  }

  function zipLocalHeader(name, data, crc) {
    const bytes = new Uint8Array(30 + name.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    bytes.set(name, 30);
    return bytes;
  }

  function zipCentralHeader(name, data, crc, offset) {
    const bytes = new Uint8Array(46 + name.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, data.length, true);
    view.setUint32(24, data.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
    bytes.set(name, 46);
    return bytes;
  }

  function zipEnd(count, centralSize, centralOffset) {
    const bytes = new Uint8Array(22);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    return bytes;
  }

  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // -------- Tag management --------
  function tagStats() {
    const map = new Map();
    for (const note of activeNotes()) {
      for (const tag of note.tags || []) map.set(tag, (map.get(tag) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function openTagManager() {
    renderTagManager();
    openDialog(els.tagManagerDialog);
  }

  function renderTagManager() {
    const stats = tagStats();
    if (!stats.length) {
      els.tagManagerList.replaceChildren(el('p', { class: 'muted-copy', text: 'No active tags yet.' }));
      return;
    }
    const rows = stats.map(([tag, count]) => renderTagManagerRow(tag, count));
    els.tagManagerList.replaceChildren(...rows);
  }

  function renderTagManagerRow(tag, count) {
    const input = el('input', {
      class: 'input tag-rename-input',
      attrs: { type: 'text', value: tag, 'aria-label': 'Rename ' + tag },
    });
    const countNode = el('span', { class: 'tag-count', text: count + (count === 1 ? ' note' : ' notes') });
    const rename = el('button', {
      class: 'btn btn-secondary btn-sm',
      text: 'Rename',
      attrs: { type: 'button' },
      on: { click: () => renameTag(tag, input.value) },
    });
    const filter = el('button', {
      class: 'btn btn-secondary btn-sm',
      text: 'Filter',
      attrs: { type: 'button' },
      on: {
        click: () => {
          closeDialog(els.tagManagerDialog);
          setTagFilter(tag);
        },
      },
    });
    const del = el('button', {
      class: 'btn btn-danger btn-sm',
      text: 'Delete',
      attrs: { type: 'button' },
      on: { click: () => openTagDelete(tag, count) },
    });
    return el('div', { class: 'tag-manager-row', children: [input, countNode, rename, filter, del] });
  }

  async function renameTag(oldTag, rawNewTag) {
    const newTag = normalizeTag(rawNewTag);
    if (!newTag || newTag === oldTag) return;
    const changed = [];
    for (const note of activeNotes()) {
      if (!(note.tags || []).includes(oldTag)) continue;
      note.tags = Array.from(new Set(note.tags.map((tag) => tag === oldTag ? newTag : tag)));
      note.updatedAt = now();
      changed.push(DB.put(note));
    }
    await Promise.all(changed);
    if (state.tagFilter === oldTag) state.tagFilter = newTag;
    renderAll();
    renderTagManager();
  }

  function openTagDelete(tag, count) {
    state.pendingTagDelete = tag;
    els.tagDeleteCopy.textContent = 'This removes #' + tag + ' from ' + count + (count === 1 ? ' active note.' : ' active notes.');
    openDialog(els.tagDeleteDialog);
  }

  async function deletePendingTag() {
    const tag = state.pendingTagDelete;
    if (!tag) return;
    const changed = [];
    for (const note of activeNotes()) {
      if (!(note.tags || []).includes(tag)) continue;
      note.tags = note.tags.filter((t) => t !== tag);
      note.updatedAt = now();
      changed.push(DB.put(note));
    }
    await Promise.all(changed);
    if (state.tagFilter === tag) state.tagFilter = null;
    state.pendingTagDelete = null;
    closeDialog(els.tagDeleteDialog);
    renderAll();
    renderTagManager();
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

  // -------- PWA --------
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const version = encodeURIComponent(window.SCRATCHPAD_VERSION || 'dev');
    navigator.serviceWorker.register('service-worker.js?v=' + version).catch((e) => {
      console.warn('Service worker registration failed', e);
    });
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
    els.activeNotesView.addEventListener('click', () => setView('active'));
    els.trashView.addEventListener('click', () => setView('trash'));
    els.manageTags.addEventListener('click', openTagManager);

    els.newNote.addEventListener('click', createNote);
    els.emptyNewNote.addEventListener('click', createNote);
    els.emptyImportNotes.addEventListener('click', () => els.importFile.click());

    els.titleInput.addEventListener('input', handleTitleInput);
    els.titleInput.addEventListener('blur', async () => {
      const note = getNote(state.selectedId);
      if (!note || isTrashed(note)) return;
      const v = els.titleInput.value.trim();
      if (state.editing) {
        persistDraftDebounced();
        return;
      }
      if ((note.title || '') === v) {
        state.dirty = false;
        els.dirtyIndicator.hidden = true;
        return;
      }
      note.title = v;
      note.updatedAt = now();
      await DB.put(note);
      state.dirty = false;
      renderSidebar();
      els.dirtyIndicator.hidden = true;
    });

    els.pinToggle.addEventListener('click', togglePin);

    els.editBtn.addEventListener('click', () => {
      const note = getNote(state.selectedId);
      if (!note || isTrashed(note)) return;
      state.editing = true;
      state.dirty = false;
      renderEditor();
      setTimeout(() => els.editor.focus(), 0);
    });
    els.saveBtn.addEventListener('click', saveCurrent);
    els.historyBtn.addEventListener('click', openHistoryDialog);

    els.editor.addEventListener('input', markDirty);

    els.shareBtn.addEventListener('click', openShareDialog);
    els.shareCopy.addEventListener('click', copyShare);
    els.shareEmail.addEventListener('click', emailShare);

    els.deleteBtn.addEventListener('click', () => openDialog(els.deleteDialog));
    els.confirmDelete.addEventListener('click', async () => {
      closeDialog(els.deleteDialog);
      await moveCurrentToTrash();
    });
    els.restoreBtn.addEventListener('click', restoreCurrentFromTrash);
    els.permanentDeleteBtn.addEventListener('click', () => openDialog(els.permanentDeleteDialog));
    els.confirmPermanentDelete.addEventListener('click', async () => {
      closeDialog(els.permanentDeleteDialog);
      await permanentlyDeleteCurrent();
    });
    els.confirmEmptyTrash.addEventListener('click', async () => {
      closeDialog(els.emptyTrashDialog);
      await emptyTrash();
    });

    els.backToList.addEventListener('click', async () => {
      if (state.editing && state.dirty) {
        const ok = await confirmDiscard();
        if (!ok) return;
        await discardCurrentDraft();
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
        els.tagInput.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        els.tagInput.value = '';
        collapseTagInput();
      }
    });
    els.tagInput.addEventListener('blur', () => {
      if (els.tagInput.value.trim()) addTagFromInput();
      setTimeout(() => {
        if (document.activeElement !== els.tagInput) collapseTagInput();
      }, 0);
    });
    els.tagAddEmpty.addEventListener('click', openTagInput);
    els.tagAddPlus.addEventListener('click', openTagInput);

    els.overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleOverflowMenu();
    });
    els.overflowMenu.addEventListener('click', (e) => {
      if (e.target.closest('[role="menuitem"]')) closeOverflowMenu();
    });
    els.exportOverflowBtn.addEventListener('click', () => {
      closeOverflowMenu();
      exportMarkdownZip();
    });
    els.discardOverflowBtn.addEventListener('click', async () => {
      closeOverflowMenu();
      if (!state.editing) return;
      if (state.dirty) {
        const ok = await confirmDiscard();
        if (!ok) return;
        await discardCurrentDraft();
      }
      state.editing = false;
      state.dirty = false;
      renderEditor();
    });

    els.openAbout.addEventListener('click', () => openDialog(els.aboutDialog));
    els.exportBtn.addEventListener('click', exportAll);
    els.exportMarkdownBtn.addEventListener('click', exportMarkdownZip);
    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', async () => {
      const file = els.importFile.files && els.importFile.files[0];
      if (file) await importFromFile(file);
      els.importFile.value = '';
    });
    els.confirmImport.addEventListener('click', confirmImport);
    els.confirmTagDelete.addEventListener('click', deletePendingTag);

    window.addEventListener('keydown', onGlobalKey);
    window.addEventListener('resize', debounce(syncMobileView, 100));

    bindDialogClosers();
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
          confirmDiscard().then(async (ok) => {
            if (ok) {
              await discardCurrentDraft();
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
      registerServiceWorker();
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
