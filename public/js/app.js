/* Scratchpad app: state, rendering, events. Depends on marked, DOMPurify, ScratchpadDB. */
(function () {
  'use strict';

  const DB = window.ScratchpadDB;
  const Markdown = window.ScratchpadMarkdown;
  const Zip = window.ScratchpadZip;
  const REVISION_LIMIT = 10;
  const DRAFT_DEBOUNCE_MS = 350;
  const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
  const IMPORT_MAX_NOTES = 1000;
  const IMPORT_MAX_REVISIONS = 5000;
  const NOTE_TITLE_MAX = 240;
  const NOTE_BODY_MAX = 200000;
  const NOTE_TAG_MAX = 48;
  const NOTE_TAGS_MAX = 20;
  const SEARCH_SCOPES = new Set(['all', 'title', 'body', 'tags']);
  const FOLDER_NAME_MAX = 60;
  const FOLDERS_MAX = 100;
  const IMPORT_MAX_FOLDERS = 100;
  const FOLDER_COLORS = new Set(['accent', 'olive', 'sky', 'gray']);
  const RESERVED_FOLDER_NAME = 'notes';
  const GROUPING_KEY = 'scratchpad:notesGrouping';
  const COLLAPSED_FOLDERS_KEY = 'scratchpad:collapsedFolders';
  const VIRTUAL_FOLDER_KEY = '__notes__';
  const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const LAST_BACKUP_KEY = 'scratchpad:lastBackupAt';
  const BACKUP_SNOOZE_KEY = 'scratchpad:backupReminderSnoozedUntil';
  const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
  const BACKUP_SNOOZE_MS = 24 * 60 * 60 * 1000;
  const ENCRYPTED_BACKUP_FORMAT = 'scratchpad-encrypted-backup';
  const ENCRYPTED_BACKUP_VERSION = 1;
  const ENCRYPTED_BACKUP_ITERATIONS = 600000;
  const CROSS_TAB_CHANNEL = 'scratchpad-notes';
  const TAB_ID = uuidLike();

  function uuidLike() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  const state = {
    notes: [],
    folders: [],
    selectedId: null,
    editing: false,
    dirty: false,
    search: '',
    searchScope: 'all',
    tagFilter: null,
    view: 'active',
    grouping: readGrouping(),
    mobileView: 'list', // 'list' | 'editor' - only meaningful on narrow viewports
    promptedDrafts: new Set(),
    pendingTagDelete: null,
    importPreview: null,
    encryptedImport: null,
    backupPassphraseMode: null,
    saveConflict: null,
    externalChanges: new Set(),
    serviceWorkerRegistration: null,
    waitingWorker: null,
    reloadForUpdate: false,
    bulkMode: false,
    bulkSelectedIds: new Set(),
    folderDialogId: null,
    folderMenuTargetId: null,
    folderDeleteId: null,
    commandItems: [],
    commandIndex: 0,
    busy: new Set(),
  };

  // -------- Element refs --------
  const $ = (id) => document.getElementById(id);
  const els = {
    shell: $('app-shell'),
    sidebar: $('sidebar'),
    main: $('main'),
    search: $('search'),
    searchScope: $('search-scope'),
    activeFilter: $('active-filter'),
    activeFilterTag: $('active-filter-tag'),
    clearFilter: $('clear-filter'),
    activeNotesView: $('active-notes-view'),
    trashView: $('trash-view'),
    groupToggle: $('group-toggle'),
    groupFolders: $('group-folders'),
    groupRecent: $('group-recent'),
    manageTags: $('manage-tags'),
    newNote: $('new-note'),
    todayNote: $('today-note'),
    bulkToggle: $('bulk-toggle'),
    commandPaletteBtn: $('command-palette-btn'),
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
    backlinksSection: $('backlinks-section'),
    backlinksSummary: $('backlinks-summary'),
    backlinksList: $('backlinks-list'),
    editor: $('note-editor'),
    wikilinkSuggest: $('wikilink-suggest'),
    formatToolbar: $('editor-format'),
    editorEmptyState: $('editor-empty-state'),
    editorView: $('editor-view'),
    emptyNoNotes: $('empty-no-notes'),
    emptyNoResults: $('empty-no-results'),
    emptyPickOne: $('empty-pick-one'),
    emptyTrash: $('empty-trash'),
    clearSearchBtn: $('clear-search-btn'),
    emptyImportNotes: $('empty-import-notes'),
    folderMenu: $('folder-menu'),
    folderDialog: $('folder-dialog'),
    folderDialogTitle: $('folder-dialog-title'),
    folderNameInput: $('folder-name-input'),
    folderNameError: $('folder-name-error'),
    folderDialogSave: $('folder-dialog-save'),
    folderDeleteDialog: $('folder-delete-dialog'),
    folderDeleteCopy: $('folder-delete-copy'),
    folderDeleteKeep: $('folder-delete-keep'),
    folderDeleteTrash: $('folder-delete-trash'),
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
    exportEncryptedBtn: $('export-encrypted-btn'),
    exportMarkdownBtn: $('export-markdown-btn'),
    importBtn: $('import-btn'),
    importFile: $('import-file'),
    backupReminder: $('backup-reminder'),
    backupReminderCopy: $('backup-reminder-copy'),
    backupReminderExport: $('backup-reminder-export'),
    backupReminderSnooze: $('backup-reminder-snooze'),
    diagnosticActiveNotes: $('diagnostic-active-notes'),
    diagnosticTrashedNotes: $('diagnostic-trashed-notes'),
    diagnosticRevisions: $('diagnostic-revisions'),
    diagnosticDrafts: $('diagnostic-drafts'),
    diagnosticStorage: $('diagnostic-storage'),
    diagnosticStorageProtection: $('diagnostic-storage-protection'),
    diagnosticLastBackup: $('diagnostic-last-backup'),
    diagnosticOfflineCache: $('diagnostic-offline-cache'),
    protectStorageBtn: $('protect-storage-btn'),
    checkUpdatesBtn: $('check-updates-btn'),
    refreshOfflineCopyBtn: $('refresh-offline-copy-btn'),
    backupPassphraseDialog: $('backup-passphrase-dialog'),
    backupPassphraseTitle: $('backup-passphrase-title'),
    backupPassphraseCopy: $('backup-passphrase-copy'),
    backupPassphrase: $('backup-passphrase'),
    backupPassphraseConfirmWrap: $('backup-passphrase-confirm-wrap'),
    backupPassphraseConfirm: $('backup-passphrase-confirm'),
    backupPassphraseShow: $('backup-passphrase-show'),
    backupPassphraseError: $('backup-passphrase-error'),
    confirmEncryptedExport: $('confirm-encrypted-export'),
    confirmEncryptedImport: $('confirm-encrypted-import'),
    saveConflictDialog: $('save-conflict-dialog'),
    saveConflictCopy: $('save-conflict-copy'),
    conflictUseSaved: $('conflict-use-saved'),
    conflictSaveCopy: $('conflict-save-copy'),
    conflictKeepMine: $('conflict-keep-mine'),
    eraseLocalDataBtn: $('erase-local-data-btn'),
    eraseLocalDataDialog: $('erase-local-data-dialog'),
    eraseConfirmation: $('erase-confirmation'),
    eraseConfirmationError: $('erase-confirmation-error'),
    confirmEraseLocalData: $('confirm-erase-local-data'),
    pwaUpdateNotice: $('pwa-update-notice'),
    pwaUpdateLater: $('pwa-update-later'),
    pwaUpdateReload: $('pwa-update-reload'),
    importPreviewDialog: $('import-preview-dialog'),
    importPreviewCounts: $('import-preview-counts'),
    importPreviewErrors: $('import-preview-errors'),
    confirmImport: $('confirm-import'),
    tagManagerDialog: $('tag-manager-dialog'),
    tagManagerList: $('tag-manager-list'),
    tagDeleteDialog: $('tag-delete-dialog'),
    tagDeleteCopy: $('tag-delete-copy'),
    confirmTagDelete: $('confirm-tag-delete'),
    commandPaletteDialog: $('command-palette-dialog'),
    commandPaletteInput: $('command-palette-input'),
    commandPaletteList: $('command-palette-list'),
    commandPaletteEmpty: $('command-palette-empty'),
    commandPaletteStatus: $('command-palette-status'),
    bulkTagDialog: $('bulk-tag-dialog'),
    bulkTagInput: $('bulk-tag-input'),
    bulkApplyTag: $('bulk-apply-tag'),
    pinTemplate: $('tpl-pin-icon'),
    linkRenameDialog: $('link-rename-dialog'),
    linkRenameCopy: $('link-rename-copy'),
    confirmLinkRename: $('confirm-link-rename'),
    quickCaptureDialog: $('quick-capture-dialog'),
    quickCaptureInput: $('quick-capture-input'),
    shareBtn: $('share-btn'),
    shareDialog: $('share-dialog'),
    shareCopy: $('share-copy'),
    shareEmail: $('share-email'),
    shareStatus: $('share-status'),
    shareMailtoWarning: $('share-mailto-warning'),
    toastRegion: $('toast-region'),
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

  let crossTabChannel = null;

  function nextUpdatedAt(note) {
    return Math.max(now(), (Number(note && note.updatedAt) || 0) + 1);
  }

  function broadcastChange(message) {
    if (!crossTabChannel) return;
    try {
      crossTabChannel.postMessage({ ...message, source: TAB_ID });
    } catch (e) {
      console.warn('Cross-tab notification failed', e);
    }
  }

  async function putNoteRecord(note, changeType) {
    await DB.put(note);
    broadcastChange({ type: changeType || 'note-changed', noteId: note.id, updatedAt: note.updatedAt });
  }

  async function bulkPutNoteRecords(notes, changeType) {
    await DB.bulkPut(notes);
    for (const note of notes) {
      broadcastChange({ type: changeType || 'note-changed', noteId: note.id, updatedAt: note.updatedAt });
    }
  }

  async function deleteNoteRecord(noteId) {
    await DB.deleteNoteEverywhere(noteId);
    broadcastChange({ type: 'note-deleted', noteId });
  }

  async function refreshNoteFromDatabase(noteId, deleted) {
    const index = state.notes.findIndex((note) => note.id === noteId);
    if (deleted) {
      if (index >= 0) state.notes.splice(index, 1);
      if (state.selectedId === noteId) {
        state.selectedId = null;
        state.editing = false;
        state.dirty = false;
      }
      renderAll();
      return;
    }
    const stored = await DB.get(noteId);
    if (!stored) return;
    const note = normalizeNote(stored);
    if (index >= 0) state.notes[index] = note;
    else state.notes.push(note);
    renderAll();
  }

  function initCrossTabSync() {
    if (typeof BroadcastChannel !== 'function') return;
    crossTabChannel = new BroadcastChannel(CROSS_TAB_CHANNEL);
    crossTabChannel.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.source === TAB_ID) return;
      if (message.type === 'reset') {
        state.notes = [];
        state.selectedId = null;
        state.editing = false;
        state.dirty = false;
        state.externalChanges.clear();
        renderAll();
        toast('Local data was erased in another tab.', { tone: 'info' });
        return;
      }
      if (message.type === 'folders-changed') {
        loadFolders().then(renderAll).catch((e) => console.warn('Cross-tab folder refresh failed', e));
        return;
      }
      if (!message.noteId) return;
      if (state.selectedId === message.noteId && state.editing && state.dirty) {
        state.externalChanges.add(message.noteId);
        return;
      }
      refreshNoteFromDatabase(message.noteId, message.type === 'note-deleted').catch((e) => {
        console.warn('Cross-tab refresh failed', e);
      });
    });
  }

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

  // Transient action feedback. The region is an aria-live="polite" status, so
  // appending a toast announces it. Callers must not fire a toast while a modal
  // <dialog> is open (a native dialog's top layer would cover it) — close the
  // dialog first. tone: 'success' | 'info' | 'error'. Errors persist with a
  // dismiss button; everything else auto-dismisses.
  function toast(message, opts) {
    if (!els.toastRegion) return;
    opts = opts || {};
    const tone = opts.tone || 'success';
    const persist = opts.persist != null ? opts.persist : tone === 'error';
    const duration = opts.duration || 2600;

    const node = el('div', {
      class: 'toast is-' + tone,
      children: [el('span', { class: 'toast-dot', attrs: { 'aria-hidden': 'true' } })],
    });
    node.appendChild(document.createTextNode(message));

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      node.classList.remove('is-visible');
      setTimeout(() => node.remove(), 220);
    };

    if (persist) {
      node.appendChild(el('button', {
        class: 'toast-dismiss',
        text: '×',
        attrs: { type: 'button', 'aria-label': 'Dismiss' },
        on: { click: remove },
      }));
    }

    els.toastRegion.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-visible'));
    if (!persist) setTimeout(remove, duration);
    return node;
  }

  function setControlsBusy(controls, busy) {
    for (const control of controls || []) {
      if (!control) continue;
      control.disabled = busy;
      if (busy) control.setAttribute('aria-busy', 'true');
      else control.removeAttribute('aria-busy');
    }
  }

  async function withBusy(key, controls, errorMessage, work) {
    if (state.busy.has(key)) return undefined;
    state.busy.add(key);
    setControlsBusy(controls, true);
    try {
      return await work();
    } catch (e) {
      console.error(errorMessage, e);
      toast(errorMessage, { tone: 'error', persist: true });
      return undefined;
    } finally {
      setControlsBusy(controls, false);
      state.busy.delete(key);
    }
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

  function normalizeSearchText(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fuzzyIncludes(haystack, query) {
    if (!query) return true;
    let pos = 0;
    for (const ch of query) {
      pos = haystack.indexOf(ch, pos);
      if (pos === -1) return false;
      pos += 1;
    }
    return true;
  }

  function matchesQuery(text, query) {
    const q = normalizeSearchText(query);
    if (!q) return true;
    const hay = normalizeSearchText(text);
    return hay.includes(q) || fuzzyIncludes(hay, q);
  }

  function noteSearchText(note, scope) {
    if (scope === 'title') return note.title || deriveTitle(note);
    if (scope === 'body') return note.body || '';
    if (scope === 'tags') return (note.tags || []).join(' ');
    return [
      note.title || deriveTitle(note),
      note.body || '',
      (note.tags || []).join(' '),
    ].join('\n');
  }

  function scopeIncludes(field) {
    return state.searchScope === 'all' || state.searchScope === field;
  }

  function highlightTextNodes(text, query) {
    const source = String(text || '');
    const q = String(query || '').trim();
    if (!q) return [document.createTextNode(source)];
    const lower = source.toLowerCase();
    const needle = q.toLowerCase();
    const nodes = [];
    let start = 0;
    let index = lower.indexOf(needle, start);
    while (index !== -1) {
      if (index > start) nodes.push(document.createTextNode(source.slice(start, index)));
      nodes.push(el('mark', { class: 'search-hit', text: source.slice(index, index + q.length) }));
      start = index + q.length;
      index = lower.indexOf(needle, start);
    }
    if (start < source.length) nodes.push(document.createTextNode(source.slice(start)));
    return nodes.length ? nodes : [document.createTextNode(source)];
  }

  function highlightedChildren(text, field) {
    if (!state.search.trim() || !scopeIncludes(field)) return [document.createTextNode(text || '')];
    return highlightTextNodes(text || '', state.search);
  }

  function highlightElementText(root, query) {
    const q = String(query || '').trim();
    if (!root || !q) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, textarea, mark')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.toLowerCase().includes(q.toLowerCase())
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const textNode of textNodes) {
      const fragment = document.createDocumentFragment();
      for (const node of highlightTextNodes(textNode.nodeValue || '', q)) fragment.appendChild(node);
      textNode.replaceWith(fragment);
    }
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
      folderId: typeof n.folderId === 'string' && n.folderId ? n.folderId : null,
      createdAt: finiteTime(n.createdAt, t),
      updatedAt: finiteTime(n.updatedAt, t),
      deletedAt: Number.isFinite(n.deletedAt) ? n.deletedAt : null,
      lastDraftAt: Number.isFinite(n.lastDraftAt) ? n.lastDraftAt : null,
      dailyDate: typeof n.dailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.dailyDate) ? n.dailyDate : null,
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

  // -------- Folders --------
  function normalizeFolderName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, FOLDER_NAME_MAX);
  }

  function normalizeFolder(f, index) {
    if (!f || typeof f !== 'object') return null;
    const t = now();
    const name = normalizeFolderName(f.name);
    if (!name || name.toLowerCase() === RESERVED_FOLDER_NAME) return null;
    return {
      id: typeof f.id === 'string' && f.id ? f.id : uuid(),
      name,
      color: FOLDER_COLORS.has(f.color) ? f.color : null,
      sortOrder: Number.isFinite(f.sortOrder) ? f.sortOrder : (index || 0),
      parentId: null,
      createdAt: finiteTime(f.createdAt, t),
      updatedAt: finiteTime(f.updatedAt, t),
    };
  }

  function sortedFolders() {
    return [...state.folders].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.createdAt - b.createdAt));
  }

  function folderById(id) {
    return state.folders.find((f) => f.id === id) || null;
  }

  // Orphaned folderIds (deleted folder, corrupt import) heal to the virtual
  // "Notes" folder here rather than via a data migration.
  function noteFolderId(note) {
    return note && note.folderId && folderById(note.folderId) ? note.folderId : null;
  }

  function folderDisplayName(folderId) {
    const folder = folderId ? folderById(folderId) : null;
    return folder ? folder.name : 'Notes';
  }

  async function loadFolders() {
    const rows = await DB.getAllFolders();
    state.folders = rows.map((f, i) => normalizeFolder(f, i)).filter(Boolean);
  }

  function readGrouping() {
    try {
      return localStorage.getItem(GROUPING_KEY) === 'recent' ? 'recent' : 'folders';
    } catch (e) {
      return 'folders';
    }
  }

  function setGrouping(mode) {
    state.grouping = mode === 'recent' ? 'recent' : 'folders';
    try {
      localStorage.setItem(GROUPING_KEY, state.grouping);
    } catch (e) { /* private mode / quota */ }
    renderAll();
  }

  function collapsedFolderKeys() {
    try {
      const raw = JSON.parse(localStorage.getItem(COLLAPSED_FOLDERS_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : []);
    } catch (e) {
      return new Set();
    }
  }

  function writeCollapsedFolderKeys(keys) {
    const valid = new Set(state.folders.map((f) => f.id));
    valid.add(VIRTUAL_FOLDER_KEY);
    const pruned = [...keys].filter((k) => valid.has(k));
    try {
      localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify(pruned));
    } catch (e) { /* private mode / quota */ }
  }

  function toggleFolderCollapsed(key) {
    const keys = collapsedFolderKeys();
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    writeCollapsedFolderKeys(keys);
    renderSidebar();
  }

  function folderNameError(name, excludeId) {
    if (!name) return 'Folder name is required.';
    if (name.toLowerCase() === RESERVED_FOLDER_NAME) return '"Notes" is reserved for the built-in folder.';
    const clash = state.folders.some((f) => f.id !== excludeId && f.name.toLowerCase() === name.toLowerCase());
    if (clash) return 'A folder with that name already exists.';
    if (!excludeId && state.folders.length >= FOLDERS_MAX) return 'Folder limit reached (100).';
    return null;
  }

  function openFolderDialog(folderId) {
    state.folderDialogId = folderId || null;
    const folder = folderId ? folderById(folderId) : null;
    els.folderDialogTitle.textContent = folder ? 'Edit folder' : 'New folder';
    els.folderNameInput.value = folder ? folder.name : '';
    els.folderNameInput.removeAttribute('aria-invalid');
    els.folderNameError.hidden = true;
    els.folderNameError.textContent = '';
    const color = folder && folder.color ? folder.color : '';
    const radio = document.querySelector('input[name="folder-color"][value="' + color + '"]');
    if (radio) radio.checked = true;
    openDialog(els.folderDialog);
    els.folderNameInput.focus();
  }

  async function saveFolderDialog() {
    const name = normalizeFolderName(els.folderNameInput.value);
    const error = folderNameError(name, state.folderDialogId);
    if (error) {
      els.folderNameError.textContent = error;
      els.folderNameError.hidden = false;
      els.folderNameInput.setAttribute('aria-invalid', 'true');
      els.folderNameInput.focus();
      return;
    }
    const selected = document.querySelector('input[name="folder-color"]:checked');
    const color = selected && FOLDER_COLORS.has(selected.value) ? selected.value : null;
    const existing = state.folderDialogId ? folderById(state.folderDialogId) : null;
    const t = now();
    const folder = existing
      ? { ...existing, name, color, updatedAt: t }
      : normalizeFolder({ name, color, sortOrder: state.folders.length, createdAt: t, updatedAt: t }, state.folders.length);
    await DB.putFolder(folder);
    broadcastChange({ type: 'folders-changed' });
    await loadFolders();
    state.folderDialogId = null;
    closeDialog(els.folderDialog);
    renderAll();
    toast(existing ? 'Folder updated.' : 'Folder created.');
  }

  // -------- Folder menu (mirrors the editor overflow menu semantics) --------
  function folderMenuItems() {
    return Array.from(els.folderMenu.querySelectorAll('[role="menuitem"]'))
      .filter((item) => !item.hidden);
  }

  function focusFolderMenuItem(index) {
    const items = folderMenuItems();
    if (!items.length) return;
    const i = (index + items.length) % items.length;
    items[i].focus();
  }

  function openFolderMenu(folderId, trigger) {
    closeFolderMenu();
    state.folderMenuTargetId = folderId;
    const rect = trigger.getBoundingClientRect();
    els.folderMenu.style.top = Math.round(rect.bottom + 4) + 'px';
    els.folderMenu.style.left = Math.round(rect.left) + 'px';
    els.folderMenu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onFolderMenuOutsideClick, true);
    document.addEventListener('keydown', onFolderMenuKey, true);
    setTimeout(() => focusFolderMenuItem(0), 0);
  }

  function closeFolderMenu() {
    if (els.folderMenu.hidden) return;
    els.folderMenu.hidden = true;
    state.folderMenuTargetId = null;
    document.removeEventListener('click', onFolderMenuOutsideClick, true);
    document.removeEventListener('keydown', onFolderMenuKey, true);
    const open = document.querySelector('.folder-menu-btn[aria-expanded="true"]');
    if (open) open.setAttribute('aria-expanded', 'false');
  }

  function onFolderMenuOutsideClick(e) {
    if (els.folderMenu.contains(e.target)) return;
    closeFolderMenu();
  }

  function onFolderMenuKey(e) {
    const items = folderMenuItems();
    const current = items.indexOf(document.activeElement);
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        closeFolderMenu();
        break;
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        focusFolderMenuItem(current < 0 ? 0 : current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        focusFolderMenuItem(current < 0 ? items.length - 1 : current - 1);
        break;
      case 'Home':
        e.preventDefault();
        e.stopPropagation();
        focusFolderMenuItem(0);
        break;
      case 'End':
        e.preventDefault();
        e.stopPropagation();
        focusFolderMenuItem(items.length - 1);
        break;
      case 'Tab':
        closeFolderMenu();
        break;
      default:
        break;
    }
  }

  function openFolderDeleteDialog(folderId) {
    const folder = folderById(folderId);
    if (!folder) return;
    state.folderDeleteId = folderId;
    const count = activeNotes().filter((n) => noteFolderId(n) === folderId).length;
    els.folderDeleteCopy.textContent = count
      ? '"' + folder.name + '" contains ' + count + ' note' + (count === 1 ? '' : 's') +
        '. Keep them in Notes, or move them to Trash (recoverable for 30 days)?'
      : '"' + folder.name + '" is empty. Delete it?';
    els.folderDeleteTrash.hidden = count === 0;
    els.folderDeleteKeep.textContent = count ? 'Keep notes (move to Notes)' : 'Delete folder';
    openDialog(els.folderDeleteDialog);
  }

  async function applyFolderDelete(mode) {
    const folderId = state.folderDeleteId;
    const folder = folderById(folderId);
    if (!folder) return;
    const members = activeNotes().filter((n) => noteFolderId(n) === folderId);
    const t = now();
    const updated = members.map((note) => mode === 'trash'
      ? { ...note, folderId: null, deletedAt: t, updatedAt: t, lastDraftAt: null }
      : { ...note, folderId: null });
    if (updated.length) {
      await bulkPutNoteRecords(updated);
      if (mode === 'trash') await Promise.all(updated.map((note) => DB.removeDraft(note.id)));
      const nextById = new Map(updated.map((note) => [note.id, note]));
      for (const note of state.notes) {
        const nextNote = nextById.get(note.id);
        if (nextNote) Object.assign(note, nextNote);
      }
      if (mode === 'trash' && state.selectedId && nextById.has(state.selectedId)) {
        state.selectedId = null;
        state.editing = false;
        state.dirty = false;
      }
    }
    await DB.removeFolder(folderId);
    broadcastChange({ type: 'folders-changed' });
    await loadFolders();
    const keys = collapsedFolderKeys();
    keys.delete(folderId);
    writeCollapsedFolderKeys(keys);
    state.folderDeleteId = null;
    closeDialog(els.folderDeleteDialog);
    renderAll();
    toast(mode === 'trash' && updated.length
      ? 'Folder deleted. ' + updated.length + ' note' + (updated.length === 1 ? '' : 's') + ' moved to Trash.'
      : 'Folder deleted.');
  }

  async function moveFolder(folderId, delta) {
    const ordered = sortedFolders();
    const index = ordered.findIndex((f) => f.id === folderId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    const t = now();
    const renumbered = next.map((f, i) => ({ ...f, sortOrder: i, updatedAt: t }));
    await DB.bulkPutFolders(renumbered);
    broadcastChange({ type: 'folders-changed' });
    await loadFolders();
    renderAll();
  }

  async function runFolderMenuAction(action) {
    const folderId = state.folderMenuTargetId;
    closeFolderMenu();
    if (!folderId) return;
    if (action === 'rename') openFolderDialog(folderId);
    else if (action === 'new-note') await createNote(folderId);
    else if (action === 'move-up') await moveFolder(folderId, -1);
    else if (action === 'move-down') await moveFolder(folderId, 1);
    else if (action === 'delete') openFolderDeleteDialog(folderId);
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

  // -------- Sidebar rendering --------
  function filteredNotes() {
    const q = state.search.trim();
    const tag = state.tagFilter;
    return currentBaseNotes().filter((n) => {
      if (tag && !(n.tags || []).includes(tag)) return false;
      if (!q) return true;
      return matchesQuery(noteSearchText(n, state.searchScope), q);
    });
  }

  function sortNotes(list) {
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function renderViewSwitch() {
    els.activeNotesView.classList.toggle('is-active', state.view === 'active');
    els.trashView.classList.toggle('is-active', state.view === 'trash');
    if (!els.groupToggle) return;
    els.groupToggle.hidden = state.view === 'trash';
    els.groupFolders.classList.toggle('is-active', state.grouping === 'folders');
    els.groupFolders.setAttribute('aria-pressed', state.grouping === 'folders' ? 'true' : 'false');
    els.groupRecent.classList.toggle('is-active', state.grouping === 'recent');
    els.groupRecent.setAttribute('aria-pressed', state.grouping === 'recent' ? 'true' : 'false');
  }

  function renderSearchScope() {
    if (!els.searchScope) return;
    els.searchScope.value = state.searchScope;
  }

  function renderBulkToggle() {
    if (!els.bulkToggle) return;
    els.bulkToggle.classList.toggle('is-active', state.bulkMode);
    els.bulkToggle.setAttribute('aria-pressed', state.bulkMode ? 'true' : 'false');
    els.bulkToggle.textContent = state.bulkMode ? 'Done' : 'Select';
  }

  function pruneBulkSelection() {
    const valid = new Set(currentBaseNotes().map((note) => note.id));
    for (const id of [...state.bulkSelectedIds]) {
      if (!valid.has(id)) state.bulkSelectedIds.delete(id);
    }
  }

  function renderSidebar() {
    const filtered = filteredNotes();
    const sorted = sortNotes(filtered);
    const children = [];
    pruneBulkSelection();

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
      if (state.bulkMode && sorted.length) children.push(renderBulkToolbar(sorted));
      if (sorted.length) children.push(renderSection('Trash', sorted));
    } else {
      if (state.bulkMode && sorted.length) children.push(renderBulkToolbar(sorted));
      const flat = !!(state.search.trim() || state.tagFilter);
      if (state.grouping === 'folders' && !flat) {
        renderFolderSections(children, sorted);
      } else {
        const buckets = bucketizeNotes(sorted);
        for (const bucket of buckets) {
          if (!bucket.notes.length) continue;
          children.push(renderSection(bucket.label, bucket.notes, bucket.isPinnedSection));
        }
      }
    }

    if (!children.length || (state.view === 'trash' && !sorted.length)) {
      children.push(renderSidebarEmptyState());
    }
    els.noteList.replaceChildren(...children);
    renderViewSwitch();
    renderSearchScope();
    renderBulkToggle();
  }

  function selectedBulkNotes() {
    const selected = state.bulkSelectedIds;
    return currentBaseNotes().filter((note) => selected.has(note.id));
  }

  function renderBulkToolbar(visibleNotes) {
    const selected = selectedBulkNotes();
    const selectedCount = selected.length;
    const selectionLabel = selectedCount + ' selected';
    const actions = [
      el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Select all',
        attrs: { id: 'bulk-select-all', type: 'button' },
        on: { click: () => bulkSelectAll(visibleNotes) },
      }),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Clear',
        attrs: { id: 'bulk-clear', type: 'button', disabled: selectedCount === 0 },
        on: { click: bulkClear },
      }),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Export JSON',
        attrs: { id: 'bulk-export-json', type: 'button', disabled: selectedCount === 0 },
        on: { click: bulkExportJson },
      }),
    ];

    if (state.view === 'trash') {
      actions.push(
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: 'Restore',
          attrs: { id: 'bulk-restore', type: 'button', disabled: selectedCount === 0 },
          on: { click: bulkRestore },
        }),
        el('button', {
          class: 'btn btn-danger btn-sm',
          text: 'Delete forever',
          attrs: { id: 'bulk-delete-forever', type: 'button', disabled: selectedCount === 0 },
          on: { click: bulkDeleteForever },
        })
      );
    } else {
      actions.push(
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: 'Add tag',
          attrs: { id: 'bulk-add-tag', type: 'button', disabled: selectedCount === 0 },
          on: { click: openBulkTagDialog },
        }),
        el('button', {
          class: 'btn btn-danger btn-sm',
          text: 'Move to Trash',
          attrs: { id: 'bulk-move-trash', type: 'button', disabled: selectedCount === 0 },
          on: { click: bulkMoveToTrash },
        })
      );
    }

    return el('div', {
      class: 'bulk-toolbar',
      attrs: { id: 'bulk-toolbar' },
      children: [
        el('span', { class: 'bulk-count', text: selectionLabel, attrs: { id: 'bulk-selected-count' } }),
        el('div', { class: 'bulk-actions', children: actions }),
      ],
    });
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

  function notesForFolder(notes, folderId) {
    return notes
      .filter((note) => noteFolderId(note) === folderId)
      .sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
  }

  function renderFolderSections(children, notes) {
    for (const folder of sortedFolders()) {
      children.push(renderFolderSection(folder, notesForFolder(notes, folder.id)));
    }
    children.push(renderFolderSection(null, notesForFolder(notes, null)));
    children.push(el('button', {
      class: 'new-folder-row',
      attrs: { type: 'button' },
      children: [
        el('span', { class: 'new-folder-plus', attrs: { 'aria-hidden': 'true' }, text: '+' }),
        el('span', { text: 'New folder' }),
      ],
      on: { click: () => openFolderDialog(null) },
    }));
  }

  function folderMenuIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    for (const cx of [6, 12, 18]) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', '12');
      c.setAttribute('r', '1.6');
      svg.appendChild(c);
    }
    return svg;
  }

  function renderFolderSection(folder, notes) {
    const key = folder ? folder.id : VIRTUAL_FOLDER_KEY;
    const collapsed = collapsedFolderKeys().has(key);
    const name = folder ? folder.name : 'Notes';
    const toggleChildren = [
      el('span', { class: 'folder-chevron', attrs: { 'aria-hidden': 'true' } }),
    ];
    if (folder && folder.color) {
      toggleChildren.push(el('span', { class: 'folder-dot', attrs: { 'data-color': folder.color, 'aria-hidden': 'true' } }));
    }
    toggleChildren.push(el('span', { class: 'folder-name', text: name }));
    toggleChildren.push(el('span', { class: 'folder-count', text: String(notes.length), attrs: { 'aria-hidden': 'true' } }));
    const toggle = el('button', {
      class: 'folder-toggle',
      attrs: {
        type: 'button',
        'aria-expanded': collapsed ? 'false' : 'true',
        'aria-label': (collapsed ? 'Expand ' : 'Collapse ') + name + ' (' + notes.length + ' note' + (notes.length === 1 ? '' : 's') + ')',
      },
      children: toggleChildren,
      on: { click: () => toggleFolderCollapsed(key) },
    });
    const headChildren = [toggle];
    if (folder) {
      headChildren.push(el('button', {
        class: 'icon-btn folder-menu-btn',
        attrs: {
          type: 'button',
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          'aria-label': 'Folder actions for ' + name,
          title: 'Folder actions',
        },
        children: [folderMenuIcon()],
        on: { click: (e) => openFolderMenu(folder.id, e.currentTarget) },
      }));
    }
    const head = el('div', {
      class: 'folder-head' + (collapsed ? ' is-collapsed' : ''),
      attrs: { 'data-folder-id': folder ? folder.id : '' },
      children: headChildren,
    });
    const rows = collapsed ? [] : notes.map(renderRow);
    return el('div', { class: 'note-section folder-section', children: [head, ...rows] });
  }

  function renderSection(label, notes, isPinnedSection) {
    const headingClass = 'eyebrow note-section-head' + (isPinnedSection ? ' is-pinned' : '');
    const heading = el('div', { class: headingClass, text: label });
    const rows = notes.map(renderRow);
    return el('div', { class: 'note-section', children: [heading, ...rows] });
  }

  function renderRow(note) {
    if (state.bulkMode) return renderBulkRow(note);
    const trashed = isTrashed(note);
    const pinned = !!(note.pinned && !trashed);
    const time = trashed ? note.deletedAt : note.updatedAt;
    const excerpt = noteExcerpt(note);
    const title = deriveTitle(note);

    const children = [
      el('span', {
        class: 'note-row-title',
        attrs: { 'aria-hidden': 'true' },
        children: highlightedChildren(truncate(title, 64), 'title'),
      }),
    ];

    if (pinned) {
      const pinCorner = el('span', {
        class: 'note-row-pin-corner',
        attrs: { 'aria-hidden': 'true' },
      });
      pinCorner.appendChild(clonePinIcon());
      children.push(pinCorner);
    } else {
      children.push(el('span', {
        class: 'note-row-when',
        text: formatRelativeDay(time),
        attrs: { 'aria-hidden': 'true' },
      }));
    }

    if (excerpt) {
      children.push(el('span', {
        class: 'note-row-excerpt',
        attrs: { 'aria-hidden': 'true' },
        children: highlightedChildren(excerpt, 'body'),
      }));
    }

    if (pinned) {
      children.push(el('span', {
        class: 'note-row-when',
        text: formatRelativeDay(time),
        attrs: { 'aria-hidden': 'true' },
      }));
    }

    if (note.tags && note.tags.length) {
      const tagNodes = note.tags.slice(0, 4).map((tag) => trashed
        ? el('span', {
          class: 'note-row-tag is-static',
          text: tag,
        })
        : el('button', {
          class: 'note-row-tag',
          attrs: {
            type: 'button',
            'data-tag': tag,
            'aria-label': 'Filter notes by tag ' + tag,
          },
          children: highlightedChildren(tag, 'tags'),
          on: { click: () => setTagFilter(tag) },
        }));
      children.push(el('span', {
        class: 'note-row-tags',
        attrs: trashed
          ? { 'aria-hidden': 'true' }
          : { role: 'group', 'aria-label': 'Tags for ' + title },
        children: tagNodes,
      }));
    }

    const openButton = el('button', {
      class: 'note-row-open',
      attrs: {
        type: 'button',
        'aria-label': 'Open ' + title,
        'aria-current': note.id === state.selectedId ? 'true' : null,
      },
      on: { click: () => selectNote(note.id) },
    });

    return el('div', {
      class: 'note-row' +
        (note.id === state.selectedId ? ' is-active' : '') +
        (trashed ? ' is-trashed' : '') +
        (pinned ? ' is-pinned' : ''),
      attrs: { 'data-id': note.id },
      children: [openButton, ...children],
    });
  }

  function renderBulkRow(note) {
    const trashed = isTrashed(note);
    const pinned = !!(note.pinned && !trashed);
    const time = trashed ? note.deletedAt : note.updatedAt;
    const excerpt = noteExcerpt(note);
    const selected = state.bulkSelectedIds.has(note.id);
    const checkbox = el('input', {
      attrs: {
        type: 'checkbox',
        checked: selected,
        'aria-label': 'Select ' + deriveTitle(note),
      },
      on: {
        change: (e) => toggleBulkNote(note.id, e.currentTarget.checked),
      },
    });
    const children = [
      el('span', { class: 'note-row-check', children: [checkbox] }),
      el('span', { class: 'note-row-title', children: highlightedChildren(truncate(deriveTitle(note), 64), 'title') }),
      el('span', { class: 'note-row-when', text: formatRelativeDay(time) }),
    ];
    if (excerpt) children.push(el('span', { class: 'note-row-excerpt', children: highlightedChildren(excerpt, 'body') }));
    if (note.tags && note.tags.length) {
      const tagNodes = note.tags.slice(0, 4).map((t) =>
        el('span', {
          class: 'note-row-tag',
          attrs: { 'data-tag': t },
          children: highlightedChildren(t, 'tags'),
        })
      );
      children.push(el('span', { class: 'note-row-tags', children: tagNodes }));
    }
    return el('label', {
      class: 'note-row is-bulk' +
        (note.id === state.selectedId ? ' is-active' : '') +
        (trashed ? ' is-trashed' : '') +
        (pinned ? ' is-pinned' : '') +
        (selected ? ' is-selected' : ''),
      attrs: { 'data-id': note.id },
      children,
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
      els.backlinksSection.hidden = true;
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
    els.formatToolbar.hidden = !showInput;
    if (showInput && (!lastEditorMode || noteChanged)) {
      els.editorCard.scrollTop = 0;
    }
    lastEditorMode = showInput;

    els.titleDisplay.hidden = showInput;
    els.titleInput.hidden = !showInput;
    els.titleDisplay.replaceChildren(...highlightedChildren(deriveTitle(note), 'title'));

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
        Markdown.renderEmptyBody(els.rendered);
      } else {
        els.rendered.hidden = false;
        Markdown.renderMarkdownInto(els.rendered, note.body || '');
        syncTaskCheckboxes(note);
        if (scopeIncludes('body')) highlightElementText(els.rendered, state.search);
      }
      els.editBtn.hidden = trashed;
      els.saveBtn.hidden = true;
    }

    els.dirtyIndicator.hidden = !state.dirty || trashed;
    renderBacklinks(note);
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
      el('span', { class: 'crumb-sep', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'crumb-current', text: secondary }),
    );
  }

  function renderEyebrow(note) {
    const trashed = isTrashed(note);
    const pinned = note.pinned && !trashed;
    let label;
    if (trashed) label = 'Note · trashed';
    else if (pinned) label = folderDisplayName(noteFolderId(note)) + ' · pinned';
    else label = folderDisplayName(noteFolderId(note)) + ' · draft';
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
        text: tag,
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
    await loadFolders();
    const all = await DB.getAll();
    state.notes = all.map(normalizeNote);
    ensureSelectionForView();
    renderAll();
    await maybePromptDraftForSelected();
  }

  function ensureSelectionForView() {
    const visible = filteredNotes();
    const hasFilter = !!(state.search || state.tagFilter);
    if (state.editing && state.dirty && selectedNoteIsInView()) return;
    if (selectedNoteIsInView() && (!hasFilter || visible.some((n) => n.id === state.selectedId))) return;
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
  // role="menu" with APG keyboard semantics: focus moves into the menu on open,
  // Up/Down/Home/End cycle items, Esc closes and returns focus to the trigger.
  function overflowMenuItems() {
    return Array.from(els.overflowMenu.querySelectorAll('[role="menuitem"]'))
      .filter((item) => !item.hidden && item.offsetParent !== null);
  }

  function focusOverflowItem(index) {
    const items = overflowMenuItems();
    if (!items.length) return;
    const i = (index + items.length) % items.length;
    items[i].focus();
  }

  function openOverflowMenu() {
    if (!els.overflowMenu.hidden) return;
    els.overflowMenu.hidden = false;
    els.overflowBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOverflowOutsideClick, true);
    document.addEventListener('keydown', onOverflowKey, true);
    setTimeout(() => focusOverflowItem(0), 0);
  }

  function closeOverflowMenu(opts) {
    if (els.overflowMenu.hidden) return;
    els.overflowMenu.hidden = true;
    els.overflowBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOverflowOutsideClick, true);
    document.removeEventListener('keydown', onOverflowKey, true);
    if (opts && opts.returnFocus) els.overflowBtn.focus();
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
    const items = overflowMenuItems();
    const current = items.indexOf(document.activeElement);
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        closeOverflowMenu({ returnFocus: true });
        break;
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        focusOverflowItem(current < 0 ? 0 : current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        focusOverflowItem(current < 0 ? items.length - 1 : current - 1);
        break;
      case 'Home':
        e.preventDefault();
        e.stopPropagation();
        focusOverflowItem(0);
        break;
      case 'End':
        e.preventDefault();
        e.stopPropagation();
        focusOverflowItem(items.length - 1);
        break;
      case 'Tab':
        // Tab leaves the menu: close it and let focus move on naturally.
        closeOverflowMenu();
        break;
      default:
        break;
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
    return withBusy('create-note', [els.newNote, els.emptyNewNote], 'Could not create a new note.', async () => {
      await putNoteRecord(note);
      state.view = 'active';
      state.notes.push(note);
      state.selectedId = note.id;
      state.editing = true;
      state.dirty = false;
      renderAll();
      state.mobileView = 'editor';
      syncMobileView();
      setTimeout(() => els.editor.focus(), 0);
    });
  }

  async function selectNote(id) {
    if (state.selectedId === id && !state.editing) {
      state.mobileView = 'editor';
      syncMobileView();
      return;
    }
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
    return withBusy('save', [els.saveBtn], 'Save failed. Your unsaved edits are still open.', async () => {
      const nextTitle = els.titleInput.value.trim();
      const nextBody = els.editor.value;
      const latestRaw = await DB.get(note.id);
      const latest = latestRaw ? normalizeNote(latestRaw) : null;
      const hasConflict = !latest || latest.updatedAt !== note.updatedAt || state.externalChanges.has(note.id);
      let conflictChoice = null;
      if (hasConflict) {
        conflictChoice = await chooseSaveConflict(latest);
        if (!conflictChoice) return;
        if (conflictChoice === 'saved') {
          await DB.removeDraft(note.id);
          state.externalChanges.delete(note.id);
          if (latest) {
            const index = state.notes.findIndex((item) => item.id === note.id);
            if (index >= 0) state.notes[index] = latest;
          } else {
            state.notes = state.notes.filter((item) => item.id !== note.id);
            state.selectedId = null;
          }
          state.editing = false;
          state.dirty = false;
          renderAll();
          return;
        }
        if (conflictChoice === 'copy') {
          const copy = normalizeNote({
            ...(latest || note),
            id: uuid(),
            title: nextTitle,
            body: nextBody,
            createdAt: now(),
            updatedAt: now(),
            lastDraftAt: null,
          });
          await putNoteRecord(copy);
          await DB.removeDraft(note.id);
          state.externalChanges.delete(note.id);
          if (latest) {
            const index = state.notes.findIndex((item) => item.id === note.id);
            if (index >= 0) state.notes[index] = latest;
          }
          state.notes.push(copy);
          state.selectedId = copy.id;
          state.editing = false;
          state.dirty = false;
          renderAll();
          toast('Saved your edits as a separate note.');
          return;
        }
      }
      const baseNote = latest || note;
      const previousDisplayTitle = deriveTitle(baseNote);
      const changed = (baseNote.title || '') !== nextTitle || (baseNote.body || '') !== nextBody;
      const nextNote = {
        ...baseNote,
        title: nextTitle,
        body: nextBody,
        updatedAt: nextUpdatedAt(baseNote),
        lastDraftAt: null,
      };
      if (changed) await storeRevision(baseNote);
      await putNoteRecord(nextNote);
      await DB.removeDraft(note.id);
      const index = state.notes.findIndex((item) => item.id === note.id);
      if (index >= 0) state.notes[index] = nextNote;
      state.externalChanges.delete(note.id);
      state.editing = false;
      state.dirty = false;
      renderAll();
      await maybeOfferLinkRewrite(previousDisplayTitle, deriveTitle(nextNote), nextNote.id);
    });
  }

  function chooseSaveConflict(latest) {
    state.saveConflict = latest;
    els.saveConflictCopy.textContent = latest
      ? 'This note changed in another tab. Your edits are still open; choose which version to keep.'
      : 'This note was deleted in another tab. You can keep your edits as a separate note.';
    els.conflictKeepMine.hidden = !latest;
    openDialog(els.saveConflictDialog);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (choice) => {
        if (settled) return;
        settled = true;
        cleanup();
        closeDialog(els.saveConflictDialog);
        state.saveConflict = null;
        resolve(choice);
      };
      const useSaved = () => finish('saved');
      const saveCopy = () => finish('copy');
      const keepMine = () => finish('mine');
      const onClose = () => {
        if (!settled) finish(null);
      };
      const cleanup = () => {
        els.conflictUseSaved.removeEventListener('click', useSaved);
        els.conflictSaveCopy.removeEventListener('click', saveCopy);
        els.conflictKeepMine.removeEventListener('click', keepMine);
        els.saveConflictDialog.removeEventListener('close', onClose);
      };
      els.conflictUseSaved.addEventListener('click', useSaved);
      els.conflictSaveCopy.addEventListener('click', saveCopy);
      els.conflictKeepMine.addEventListener('click', keepMine);
      els.saveConflictDialog.addEventListener('close', onClose);
    });
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
    return withBusy('move-trash', [els.confirmDelete, els.deleteBtn], 'Delete failed. The note is still in Notes.', async () => {
      const t = now();
      const nextNote = { ...note, deletedAt: t, updatedAt: t, lastDraftAt: null };
      await putNoteRecord(nextNote);
      await DB.removeDraft(note.id);
      Object.assign(note, nextNote);
      state.editing = false;
      state.dirty = false;
      state.selectedId = null;
      state.mobileView = 'list';
      renderAll();
      toast('Moved to Trash.');
    });
  }

  async function restoreCurrentFromTrash() {
    const note = getNote(state.selectedId);
    if (!note || !isTrashed(note)) return;
    return withBusy('restore', [els.restoreBtn], 'Restore failed. The note is still in Trash.', async () => {
      const nextNote = { ...note, deletedAt: null, updatedAt: now() };
      await putNoteRecord(nextNote);
      Object.assign(note, nextNote);
      state.view = 'active';
      state.selectedId = note.id;
      renderAll();
      toast('Note restored.');
    });
  }

  async function permanentlyDeleteCurrent() {
    const id = state.selectedId;
    if (!id) return;
    return withBusy('permanent-delete', [els.confirmPermanentDelete, els.permanentDeleteBtn], 'Permanent delete failed. The note is still in Trash.', async () => {
      await deleteNoteRecord(id);
      state.notes = state.notes.filter((n) => n.id !== id);
      state.selectedId = null;
      state.editing = false;
      state.dirty = false;
      renderAll();
      toast('Note permanently deleted.');
    });
  }

  async function emptyTrash() {
    const notes = trashedNotes();
    return withBusy('empty-trash', [els.confirmEmptyTrash], 'Empty Trash failed. Trashed notes were not removed.', async () => {
      await Promise.all(notes.map((note) => deleteNoteRecord(note.id)));
      state.notes = state.notes.filter((n) => !isTrashed(n));
      state.selectedId = null;
      state.editing = false;
      state.dirty = false;
      renderAll();
      toast('Trash emptied.');
    });
  }

  async function togglePin() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    return withBusy('pin', [els.pinToggle], 'Pin update failed.', async () => {
      const nextNote = { ...note, pinned: !note.pinned, updatedAt: now() };
      await putNoteRecord(nextNote);
      Object.assign(note, nextNote);
      renderAll();
      toast(note.pinned ? 'Pinned.' : 'Unpinned.');
    });
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
    return withBusy('add-tag', [els.tagAddEmpty, els.tagAddPlus], 'Tag update failed.', async () => {
      const nextNote = {
        ...note,
        tags: Array.from(new Set([...(note.tags || []), ...parts])),
        updatedAt: now(),
      };
      await putNoteRecord(nextNote);
      Object.assign(note, nextNote);
      els.tagInput.value = '';
      renderAll();
    });
  }

  async function removeTag(tag) {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    return withBusy('remove-tag', [], 'Tag update failed.', async () => {
      const nextNote = {
        ...note,
        tags: (note.tags || []).filter((t) => t !== tag),
        updatedAt: now(),
      };
      await putNoteRecord(nextNote);
      Object.assign(note, nextNote);
      renderAll();
    });
  }

  function setTagFilter(tag) {
    state.tagFilter = tag ? normalizeTag(tag) : null;
    state.view = 'active';
    renderAll();
  }

  function clearAllFilters() {
    state.tagFilter = null;
    state.search = '';
    state.searchScope = 'all';
    els.search.value = '';
    renderAll();
  }

  function setSearchScope(scope) {
    if (!SEARCH_SCOPES.has(scope)) return;
    state.searchScope = scope;
    renderAll();
  }

  function toggleBulkMode() {
    state.bulkMode = !state.bulkMode;
    state.bulkSelectedIds.clear();
    renderAll();
  }

  function toggleBulkNote(id, selected) {
    if (selected) state.bulkSelectedIds.add(id);
    else state.bulkSelectedIds.delete(id);
    renderAll();
  }

  function bulkSelectAll(notes) {
    for (const note of notes || []) state.bulkSelectedIds.add(note.id);
    renderAll();
  }

  function bulkClear() {
    state.bulkSelectedIds.clear();
    renderAll();
  }

  async function bulkMoveToTrash() {
    const selected = selectedBulkNotes().filter((note) => !isTrashed(note));
    if (!selected.length) return;
    return withBusy('bulk-move-trash', [], 'Move to Trash failed. Selected notes were not changed.', async () => {
      const t = now();
      const nextNotes = selected.map((note) => ({ ...note, deletedAt: t, updatedAt: t, lastDraftAt: null }));
      await bulkPutNoteRecords(nextNotes);
      await Promise.all(nextNotes.map((note) => DB.removeDraft(note.id)));
      const nextById = new Map(nextNotes.map((note) => [note.id, note]));
      for (const note of state.notes) {
        const nextNote = nextById.get(note.id);
        if (nextNote) Object.assign(note, nextNote);
      }
      if (state.selectedId && nextById.has(state.selectedId)) state.selectedId = null;
      state.bulkSelectedIds.clear();
      state.editing = false;
      state.dirty = false;
      renderAll();
      toast('Moved ' + selected.length + ' note' + (selected.length === 1 ? '' : 's') + ' to Trash.');
    });
  }

  async function bulkRestore() {
    const selected = selectedBulkNotes().filter(isTrashed);
    if (!selected.length) return;
    return withBusy('bulk-restore', [], 'Restore failed. Selected notes are still in Trash.', async () => {
      const t = now();
      const nextNotes = selected.map((note) => ({ ...note, deletedAt: null, updatedAt: t }));
      await bulkPutNoteRecords(nextNotes);
      const nextById = new Map(nextNotes.map((note) => [note.id, note]));
      for (const note of state.notes) {
        const nextNote = nextById.get(note.id);
        if (nextNote) Object.assign(note, nextNote);
      }
      state.bulkSelectedIds.clear();
      state.view = 'active';
      renderAll();
      toast('Restored ' + selected.length + ' note' + (selected.length === 1 ? '' : 's') + '.');
    });
  }

  async function bulkDeleteForever() {
    const selected = selectedBulkNotes().filter(isTrashed);
    if (!selected.length) return;
    const ok = window.confirm('Permanently delete ' + selected.length + ' selected note' + (selected.length === 1 ? '' : 's') + '?');
    if (!ok) return;
    return withBusy('bulk-delete-forever', [], 'Permanent delete failed. Selected notes are still in Trash.', async () => {
      await Promise.all(selected.map((note) => deleteNoteRecord(note.id)));
      const selectedIds = new Set(selected.map((note) => note.id));
      state.notes = state.notes.filter((note) => !selectedIds.has(note.id));
      if (state.selectedId && selectedIds.has(state.selectedId)) state.selectedId = null;
      state.bulkSelectedIds.clear();
      renderAll();
      toast('Deleted ' + selected.length + ' note' + (selected.length === 1 ? '' : 's') + ' forever.');
    });
  }

  async function bulkExportJson() {
    const selected = selectedBulkNotes();
    if (!selected.length) return;
    return withBusy('bulk-export-json', [], 'Export failed.', async () => {
      const selectedIds = new Set(selected.map((note) => note.id));
      const revisions = (await DB.getAllRevisions())
        .map((rev) => normalizeRevision(rev, rev.noteId))
        .filter((rev) => rev && selectedIds.has(rev.noteId));
      const payload = {
        app: 'scratchpad',
        version: window.SCRATCHPAD_VERSION || 'unknown',
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        notes: selected.filter((note) => !isTrashed(note)),
        trashedNotes: selected.filter(isTrashed),
        revisions,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `scratchpad-selected-${exportStamp()}.json`);
      toast('Selected notes exported.');
    });
  }

  function openBulkTagDialog() {
    if (!selectedBulkNotes().filter((note) => !isTrashed(note)).length) return;
    els.bulkTagInput.value = '';
    openDialog(els.bulkTagDialog);
    setTimeout(() => els.bulkTagInput.focus(), 0);
  }

  async function applyBulkTag() {
    const tags = els.bulkTagInput.value.split(',').map(normalizeTag).filter(Boolean);
    if (!tags.length) return;
    const selected = selectedBulkNotes().filter((note) => !isTrashed(note));
    if (!selected.length) return;
    return withBusy('bulk-tag', [els.bulkApplyTag], 'Tag update failed.', async () => {
      const t = now();
      const nextNotes = selected.map((note) => ({
        ...note,
        tags: Array.from(new Set([...(note.tags || []), ...tags])),
        updatedAt: t,
      }));
      await bulkPutNoteRecords(nextNotes);
      const nextById = new Map(nextNotes.map((note) => [note.id, note]));
      for (const note of state.notes) {
        const nextNote = nextById.get(note.id);
        if (nextNote) Object.assign(note, nextNote);
      }
      closeDialog(els.bulkTagDialog);
      renderAll();
      toast('Tag added to ' + selected.length + ' note' + (selected.length === 1 ? '' : 's') + '.');
    });
  }

  // -------- Drafts --------
  async function persistDraftNow() {
    if (!state.editing || !state.selectedId) return;
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;
    const updatedAt = now();
    try {
      await DB.putDraft({
        noteId: note.id,
        title: els.titleInput.value.trim(),
        body: els.editor.value,
        updatedAt,
      });
    } catch (e) {
      console.warn('Draft persistence failed', e);
    }
  }

  const persistDraftDebounced = debounce(persistDraftNow, DRAFT_DEBOUNCE_MS);

  async function discardCurrentDraft() {
    const note = getNote(state.selectedId);
    if (!note) return;
    await DB.removeDraft(note.id);
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
      await DB.removeDraft(note.id);
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
    els.discardOverflowBtn.hidden = false;
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

  function applyEditorFormat(format) {
    if (!state.editing || !els.editor || els.editor.hidden) return;

    const editor = els.editor;
    const value = editor.value;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = value.slice(start, end);
    let replacement = selected;
    let nextStart = start;
    let nextEnd = end;

    if (format === 'bold') {
      replacement = '**' + (selected || 'bold text') + '**';
      nextStart = start + 2;
      nextEnd = nextStart + (selected || 'bold text').length;
    } else if (format === 'italic') {
      replacement = '*' + (selected || 'italic text') + '*';
      nextStart = start + 1;
      nextEnd = nextStart + (selected || 'italic text').length;
    } else if (format === 'code') {
      replacement = '`' + (selected || 'code') + '`';
      nextStart = start + 1;
      nextEnd = nextStart + (selected || 'code').length;
    } else if (format === 'link') {
      const text = selected || 'link text';
      const url = 'https://example.com';
      replacement = '[' + text + '](' + url + ')';
      if (selected) {
        nextStart = start + text.length + 3;
        nextEnd = nextStart + url.length;
      } else {
        nextStart = start + 1;
        nextEnd = nextStart + text.length;
      }
    } else {
      return;
    }

    editor.setRangeText(replacement, start, end, 'end');
    editor.focus();
    editor.setSelectionRange(nextStart, nextEnd);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // -------- Dialogs --------
  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (dialog === els.commandPaletteDialog) {
      els.commandPaletteInput.setAttribute('aria-expanded', 'false');
      els.commandPaletteInput.removeAttribute('aria-activedescendant');
    }
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

  // -------- Programmatic note mutations --------
  // Save path for writes that do not originate in the editor (task toggles,
  // quick capture, link-rename rewrites). Reads the latest record from
  // IndexedDB — never in-memory state — and writes through putNoteRecord so
  // cross-tab behavior matches a manual save.
  const TOGGLE_REVISION_WINDOW_MS = 5 * 60 * 1000;
  const toggleRevisionAt = new Map();

  async function mutateNoteBody(noteId, transform, opts) {
    opts = opts || {};
    const latestRaw = await DB.get(noteId);
    if (!latestRaw) return null;
    const latest = normalizeNote(latestRaw);
    if (isTrashed(latest)) return null;
    const nextBody = transform(latest.body || '');
    if (typeof nextBody !== 'string' || nextBody === latest.body) return latest;
    let snapshot = true;
    if (opts.coalesceToggles) {
      const last = toggleRevisionAt.get(noteId) || 0;
      if (now() - last < TOGGLE_REVISION_WINDOW_MS) snapshot = false;
      else toggleRevisionAt.set(noteId, now());
    }
    if (snapshot) await storeRevision(latest);
    const nextNote = { ...latest, body: nextBody, updatedAt: nextUpdatedAt(latest) };
    await putNoteRecord(nextNote);
    const index = state.notes.findIndex((n) => n.id === noteId);
    if (index >= 0) state.notes[index] = nextNote;
    else state.notes.push(nextNote);
    return nextNote;
  }

  // -------- Task toggles --------
  // Rendered task checkboxes are interactive only when the scanner agrees
  // with what marked rendered; any count mismatch marks them inert so a
  // click can never flip the wrong line.
  function syncTaskCheckboxes(note) {
    const boxes = els.rendered.querySelectorAll('.task-checkbox');
    if (!boxes.length) return;
    const markers = Markdown.findTaskMarkers(note.body || '');
    const interactive = markers.length === boxes.length && !isTrashed(note);
    for (const box of boxes) {
      box.setAttribute('aria-disabled', interactive ? 'false' : 'true');
      if (!interactive) box.setAttribute('tabindex', '-1');
    }
  }

  async function toggleTaskAt(index) {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note) || state.editing) return;
    const updated = await withBusy('task-toggle', [], 'Could not update the task.', () =>
      mutateNoteBody(note.id, (body) => {
        const markers = Markdown.findTaskMarkers(body);
        const marker = markers[index];
        if (!marker) return body;
        const next = body.charAt(marker.offset) === ' ' ? 'x' : ' ';
        return body.slice(0, marker.offset) + next + body.slice(marker.offset + 1);
      }, { coalesceToggles: true }));
    if (updated) renderAll();
  }

  function taskCheckboxIndex(target) {
    const box = target.closest && target.closest('.task-checkbox');
    if (!box || box.getAttribute('aria-disabled') === 'true') return -1;
    return Array.prototype.indexOf.call(els.rendered.querySelectorAll('.task-checkbox'), box);
  }

  // -------- Wikilink navigation --------
  async function createNoteFromWikilink(title) {
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
      await discardCurrentDraft();
    }
    const t = now();
    const note = normalizeNote({
      id: uuid(),
      title,
      body: '',
      tags: [],
      pinned: false,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      lastDraftAt: null,
    });
    await withBusy('create-from-wikilink', [], 'Could not create the linked note.', async () => {
      await putNoteRecord(note);
      state.view = 'active';
      state.notes.push(note);
      state.selectedId = note.id;
      state.editing = true;
      state.dirty = false;
      renderAll();
      state.mobileView = 'editor';
      syncMobileView();
      setTimeout(() => els.editor.focus(), 0);
    });
  }

  function wikilinkHrefParts(target) {
    const link = target.closest && target.closest('a.wikilink');
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#note:')) return { kind: 'note', value: decodeURIComponent(href.slice(6)) };
    if (href.startsWith('#new:')) return { kind: 'new', value: decodeURIComponent(href.slice(5)) };
    return null;
  }

  function onRenderedClick(e) {
    const parts = wikilinkHrefParts(e.target);
    if (parts) {
      e.preventDefault();
      if (parts.kind === 'note') openNoteFromCommand(parts.value);
      else createNoteFromWikilink(parts.value);
      return;
    }
    const index = taskCheckboxIndex(e.target);
    if (index >= 0) {
      e.preventDefault();
      toggleTaskAt(index);
    }
  }

  function onRenderedKey(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const index = taskCheckboxIndex(e.target);
    if (index >= 0) {
      e.preventDefault();
      toggleTaskAt(index);
    }
  }

  // -------- Backlinks --------
  // Computed from note bodies on every render — nothing persisted, so Trash
  // restores and imports can never leave a stale index. O(total body text)
  // per view is fine at local scale.
  function linkingNotesTo(title, excludeId) {
    const wanted = (title || '').trim().toLowerCase();
    if (!wanted) return [];
    return sortNotes(state.notes.filter((n) => {
      if (n.id === excludeId || isTrashed(n)) return false;
      return Markdown.extractWikilinkTargets(n.body || '')
        .some((t) => t.toLowerCase() === wanted);
    }));
  }

  function renderBacklinks(note) {
    const show = note && !isTrashed(note) && !state.editing;
    const sources = show ? linkingNotesTo(deriveTitle(note), note.id) : [];
    if (!sources.length) {
      els.backlinksSection.hidden = true;
      els.backlinksList.replaceChildren();
      return;
    }
    els.backlinksSection.hidden = false;
    els.backlinksSummary.textContent =
      'Linked from ' + sources.length + ' note' + (sources.length === 1 ? '' : 's');
    els.backlinksList.replaceChildren(...sources.map((source) => el('li', {
      children: [el('button', {
        class: 'backlink-btn',
        text: deriveTitle(source),
        attrs: { type: 'button' },
        on: { click: () => openNoteFromCommand(source.id) },
      })],
    })));
  }

  // -------- Wikilink autocomplete --------
  // Opens while the caret sits inside an unclosed [[… run on one line.
  // Caret pixel position comes from a throwaway mirror div that copies the
  // textarea's text metrics; if that ever misbehaves the panel still works,
  // it just anchors slightly off — selection state, not geometry, is the
  // source of truth for insertion.
  const wikilinkSuggestState = { open: false, items: [], index: 0, start: 0 };

  function wikilinkQueryAt(value, caret) {
    const open = value.lastIndexOf('[[', caret - 1);
    if (open === -1) return null;
    const between = value.slice(open + 2, caret);
    if (/[\n\]|]/.test(between)) return null;
    return { start: open + 2, query: between };
  }

  function wikilinkSuggestions(query) {
    const q = normalizeSearchText(query);
    const current = state.selectedId;
    return sortNotes(state.notes.filter((n) => {
      if (n.id === current || isTrashed(n)) return false;
      return !q || normalizeSearchText(deriveTitle(n)).includes(q);
    })).slice(0, 8);
  }

  function caretPixelPosition(textarea, caret) {
    const mirror = el('div');
    const style = window.getComputedStyle(textarea);
    for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth',
      'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'whiteSpace',
      'overflowWrap', 'tabSize']) {
      mirror.style[prop] = style[prop];
    }
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.width = textarea.clientWidth + 'px';
    mirror.textContent = textarea.value.slice(0, caret);
    const marker = el('span', { text: '​' });
    mirror.appendChild(marker);
    textarea.parentElement.appendChild(mirror);
    const top = marker.offsetTop - textarea.scrollTop;
    const left = marker.offsetLeft;
    mirror.remove();
    return { top: textarea.offsetTop + top, left: textarea.offsetLeft + left };
  }

  function closeWikilinkSuggest() {
    wikilinkSuggestState.open = false;
    els.wikilinkSuggest.hidden = true;
    els.wikilinkSuggest.replaceChildren();
  }

  function renderWikilinkSuggest() {
    const items = wikilinkSuggestState.items;
    if (!items.length) {
      closeWikilinkSuggest();
      return;
    }
    els.wikilinkSuggest.replaceChildren(...items.map((note, index) => el('button', {
      class: 'wikilink-option',
      text: deriveTitle(note),
      attrs: {
        type: 'button',
        role: 'option',
        'aria-selected': index === wikilinkSuggestState.index ? 'true' : 'false',
      },
      on: {
        mousedown: (e) => e.preventDefault(), // keep editor focus
        click: () => insertWikilinkSuggestion(index),
      },
    })));
    els.wikilinkSuggest.hidden = false;
  }

  function updateWikilinkSuggest() {
    if (!state.editing || els.editor.hidden) {
      closeWikilinkSuggest();
      return;
    }
    const caret = els.editor.selectionStart;
    const found = wikilinkQueryAt(els.editor.value, caret);
    if (!found) {
      closeWikilinkSuggest();
      return;
    }
    wikilinkSuggestState.open = true;
    wikilinkSuggestState.start = found.start;
    wikilinkSuggestState.index = 0;
    wikilinkSuggestState.items = wikilinkSuggestions(found.query);
    const pos = caretPixelPosition(els.editor, caret);
    els.wikilinkSuggest.style.top = (pos.top + 24) + 'px';
    els.wikilinkSuggest.style.left = Math.max(0, Math.min(pos.left, els.editor.clientWidth - 200)) + 'px';
    renderWikilinkSuggest();
  }

  function insertWikilinkSuggestion(index) {
    const note = wikilinkSuggestState.items[index];
    if (!note) return;
    const caret = els.editor.selectionStart;
    els.editor.setRangeText(deriveTitle(note) + ']]', wikilinkSuggestState.start, caret, 'end');
    closeWikilinkSuggest();
    els.editor.focus();
    els.editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function onEditorSuggestKey(e) {
    if (!wikilinkSuggestState.open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      wikilinkSuggestState.index = Math.min(wikilinkSuggestState.items.length - 1, wikilinkSuggestState.index + 1);
      renderWikilinkSuggest();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      wikilinkSuggestState.index = Math.max(0, wikilinkSuggestState.index - 1);
      renderWikilinkSuggest();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertWikilinkSuggestion(wikilinkSuggestState.index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // do not let Escape exit edit mode while the panel is open
      closeWikilinkSuggest();
    }
  }

  // -------- Rename-safe links --------
  function replaceWikilinkTargets(body, oldTitle, newTitle) {
    const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('\\[\\[\\s*' + escaped + '\\s*(\\|[^\\[\\]\\n]*)?\\]\\]', 'gi');
    return body.replace(pattern, (match, alias) => '[[' + newTitle + (alias || '') + ']]');
  }

  // Called after a title change is persisted. Non-blocking: the save already
  // happened; this only offers to keep other notes' links pointing here.
  async function maybeOfferLinkRewrite(oldTitle, newTitle, noteId) {
    const oldT = (oldTitle || '').trim();
    const newT = (newTitle || '').trim();
    if (!oldT || !newT || oldT.toLowerCase() === newT.toLowerCase()) return;
    const sources = linkingNotesTo(oldT, noteId);
    if (!sources.length) return;
    els.linkRenameCopy.textContent =
      sources.length + ' note' + (sources.length === 1 ? '' : 's') +
      ' link' + (sources.length === 1 ? 's' : '') + ' to "' + oldT + '". Update them to "' + newT + '"?';
    openDialog(els.linkRenameDialog);
    const confirmed = await new Promise((resolve) => {
      let decided = false;
      const onConfirm = () => { decided = true; closeDialog(els.linkRenameDialog); };
      const onClose = () => {
        els.confirmLinkRename.removeEventListener('click', onConfirm);
        resolve(decided);
      };
      els.confirmLinkRename.addEventListener('click', onConfirm, { once: true });
      els.linkRenameDialog.addEventListener('close', onClose, { once: true });
    });
    if (!confirmed) return;
    await withBusy('link-rename', [], 'Link update failed. The rename itself was saved.', async () => {
      for (const source of sources) {
        await mutateNoteBody(source.id, (body) => replaceWikilinkTargets(body, oldT, newT));
      }
      renderAll();
      toast('Updated links in ' + sources.length + ' note' + (sources.length === 1 ? '' : 's') + '.');
    });
  }

  // -------- Daily note --------
  // Identity lives in the dailyDate field (local YYYY-MM-DD), not the title,
  // so users can rename daily notes freely. A note titled "Daily template"
  // customizes the seed body without any settings UI.
  const DAILY_DEFAULT_BODY = '## Tasks\n\n## Notes\n';

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function findDailyNote(key) {
    return sortNotes(state.notes.filter((n) => !isTrashed(n) && n.dailyDate === key))[0] || null;
  }

  function findDailyTemplate() {
    return state.notes.find((n) => !isTrashed(n) && (n.title || '').trim().toLowerCase() === 'daily template') || null;
  }

  async function createDailyNote() {
    const t = now();
    const template = findDailyTemplate();
    const note = normalizeNote({
      id: uuid(),
      title: new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      body: template ? (template.body || '') : DAILY_DEFAULT_BODY,
      tags: ['daily'],
      pinned: false,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      lastDraftAt: null,
      dailyDate: todayKey(),
    });
    await putNoteRecord(note);
    state.notes.push(note);
    return note;
  }

  // -------- Quick capture --------
  function captureTimestamp() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function appendCaptureLine(body, line) {
    const trimmed = (body || '').replace(/\s+$/, '');
    return (trimmed ? trimmed + '\n' : '') + line + '\n';
  }

  function openQuickCapture() {
    els.quickCaptureInput.value = '';
    openDialog(els.quickCaptureDialog);
    setTimeout(() => els.quickCaptureInput.focus(), 0);
  }

  async function submitQuickCapture() {
    const text = els.quickCaptureInput.value.trim();
    closeDialog(els.quickCaptureDialog);
    if (!text) return;
    const line = '- **' + captureTimestamp() + '** ' + text;
    const target = findDailyNote(todayKey());
    // Today's note open in this tab's editor: append to the live buffer so
    // capture can never race the user's own unsaved edits.
    if (target && state.selectedId === target.id && state.editing) {
      els.editor.value = appendCaptureLine(els.editor.value, line);
      els.editor.dispatchEvent(new Event('input', { bubbles: true }));
      toast("Added to today's draft.");
      return;
    }
    await withBusy('quick-capture', [], 'Capture failed. Your note was not changed.', async () => {
      const note = target || await createDailyNote();
      await mutateNoteBody(note.id, (body) => appendCaptureLine(body, line));
      renderAll();
      toast("Captured to today's note.");
    });
  }

  async function openTodayNote() {
    const existing = findDailyNote(todayKey());
    if (existing) {
      await openNoteFromCommand(existing.id);
      return existing;
    }
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return null;
      await discardCurrentDraft();
    }
    return withBusy('open-today', [els.todayNote], "Could not open today's note.", async () => {
      const note = await createDailyNote();
      state.view = 'active';
      state.selectedId = note.id;
      state.editing = false;
      state.dirty = false;
      state.mobileView = 'editor';
      renderAll();
      syncMobileView();
      return note;
    });
  }

  function openEraseLocalDataDialog() {
    closeDialog(els.aboutDialog);
    els.eraseConfirmation.value = '';
    els.eraseConfirmation.removeAttribute('aria-invalid');
    els.eraseConfirmationError.hidden = true;
    openDialog(els.eraseLocalDataDialog);
    setTimeout(() => els.eraseConfirmation.focus(), 0);
  }

  async function eraseLocalData() {
    if (els.eraseConfirmation.value !== 'ERASE') {
      els.eraseConfirmation.setAttribute('aria-invalid', 'true');
      els.eraseConfirmationError.hidden = false;
      els.eraseConfirmation.focus();
      return;
    }
    return withBusy('erase-local-data', [els.confirmEraseLocalData], 'Local data could not be erased.', async () => {
      await DB.clearAllStores();
      const appKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('scratchpad:') || key === 'scratchpad-visited' || key === 'theme-preview')) {
          appKeys.push(key);
        }
      }
      for (const key of appKeys) localStorage.removeItem(key);
      sessionStorage.setItem('scratchpad:eraseComplete', '1');
      broadcastChange({ type: 'reset' });
      window.location.replace('about.html');
    });
  }

  function confirmDiscard() {
    return new Promise((resolve) => {
      openDialog(els.discardDialog);
      let settled = false;
      const dismissButtons = Array.from(els.discardDialog.querySelectorAll('[data-dialog-close]'));
      const cleanup = () => {
        els.confirmDiscard.removeEventListener('click', onConfirm);
        els.discardDialog.removeEventListener('cancel', onDismiss);
        els.discardDialog.removeEventListener('close', onClose);
        for (const button of dismissButtons) button.removeEventListener('click', onDismiss);
      };
      const finish = (discard, close) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (close) closeDialog(els.discardDialog);
        resolve(discard);
      };
      const onConfirm = () => finish(true, true);
      const onDismiss = () => finish(false, false);
      const onClose = () => {
        // A native close event is queued. If the dialog has already reopened,
        // this event belongs to the previous confirmation and must be ignored.
        if (!els.discardDialog.open) finish(false, false);
      };
      els.confirmDiscard.addEventListener('click', onConfirm);
      els.discardDialog.addEventListener('cancel', onDismiss);
      els.discardDialog.addEventListener('close', onClose);
      for (const button of dismissButtons) button.addEventListener('click', onDismiss);
    });
  }

  function readStoredTime(key) {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function writeStoredTime(key, value) {
    localStorage.setItem(key, String(value));
  }

  function lastBackupAt() {
    return readStoredTime(LAST_BACKUP_KEY);
  }

  function formatBackupStatus(ms) {
    if (!ms) return 'No backup recorded';
    return 'Last backup ' + formatFullTimestamp(ms);
  }

  function backupReminderDue() {
    if (!activeNotes().length) return false;
    const snoozedUntil = readStoredTime(BACKUP_SNOOZE_KEY);
    if (snoozedUntil && snoozedUntil > now()) return false;
    const last = lastBackupAt();
    return !last || now() - last > BACKUP_REMINDER_INTERVAL_MS;
  }

  function renderBackupReminder() {
    if (!els.backupReminder) return;
    const last = lastBackupAt();
    els.backupReminderCopy.textContent = last
      ? formatBackupStatus(last) + '. Export a fresh JSON backup to keep another copy outside this browser.'
      : 'No backup recorded for this browser. Export a JSON backup before clearing site data or switching devices.';
    els.backupReminder.hidden = !backupReminderDue();
  }

  function snoozeBackupReminder() {
    writeStoredTime(BACKUP_SNOOZE_KEY, now() + BACKUP_SNOOZE_MS);
    renderBackupReminder();
  }

  function recordBackupDownload() {
    writeStoredTime(LAST_BACKUP_KEY, now());
    localStorage.removeItem(BACKUP_SNOOZE_KEY);
    renderBackupReminder();
    renderDiagnostics();
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'Unavailable';
    if (bytes < 1024) return Math.round(bytes) + ' B';
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = units[0];
    for (let i = 1; i < units.length && value >= 1024; i += 1) {
      value /= 1024;
      unit = units[i];
    }
    return value.toFixed(value >= 10 ? 0 : 1) + ' ' + unit;
  }

  async function storageSummary() {
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return 'Unavailable';
    try {
      const estimate = await navigator.storage.estimate();
      const usage = formatBytes(estimate.usage || 0);
      const quota = Number.isFinite(estimate.quota) && estimate.quota > 0 ? formatBytes(estimate.quota) : null;
      return quota ? usage + ' of ' + quota : usage;
    } catch (e) {
      return 'Unavailable';
    }
  }

  async function storageProtectionStatus() {
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') return 'Unavailable';
    try {
      return (await navigator.storage.persisted()) ? 'Persistent' : 'Best effort';
    } catch (e) {
      return 'Unavailable';
    }
  }

  async function renderStorageProtection() {
    const status = await storageProtectionStatus();
    els.diagnosticStorageProtection.textContent = status;
    els.protectStorageBtn.hidden = status !== 'Best effort' ||
      !navigator.storage || typeof navigator.storage.persist !== 'function';
    return status;
  }

  async function requestStorageProtection() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
    return withBusy('storage-protection', [els.protectStorageBtn], 'Storage protection could not be requested.', async () => {
      let granted = false;
      try {
        granted = await navigator.storage.persist();
      } catch (e) {
        granted = false;
      }
      els.diagnosticStorageProtection.textContent = granted ? 'Persistent' : 'Best effort';
      els.protectStorageBtn.hidden = granted;
      toast(
        granted ? 'Local data protection is on.' : 'Protection was not granted. Keep exporting backups.',
        { tone: granted ? 'success' : 'info' }
      );
    });
  }

  function offlineCacheStatus() {
    if (!('serviceWorker' in navigator)) return 'Unavailable';
    if (navigator.serviceWorker.controller) return 'Ready';
    return 'Available after reload';
  }

  async function renderDiagnostics() {
    if (!els.diagnosticActiveNotes) return;
    els.diagnosticActiveNotes.textContent = String(activeNotes().length);
    els.diagnosticTrashedNotes.textContent = String(trashedNotes().length);
    els.diagnosticStorage.textContent = 'Checking...';
    try {
      const [revisions, drafts, storage] = await Promise.all([
        DB.getAllRevisions(),
        DB.getAllDrafts(),
        storageSummary(),
      ]);
      els.diagnosticRevisions.textContent = String(revisions.length);
      els.diagnosticDrafts.textContent = String(drafts.length);
      els.diagnosticStorage.textContent = storage;
    } catch (e) {
      els.diagnosticRevisions.textContent = 'Unavailable';
      els.diagnosticDrafts.textContent = 'Unavailable';
      els.diagnosticStorage.textContent = 'Unavailable';
    }
    await renderStorageProtection();
    els.diagnosticLastBackup.textContent = formatBackupStatus(lastBackupAt());
    els.diagnosticOfflineCache.textContent = offlineCacheStatus();
  }

  function openAboutDialog() {
    renderBackupReminder();
    renderDiagnostics();
    openDialog(els.aboutDialog);
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

  // -------- Command palette --------
  function commandDefinitions() {
    const commands = [
      {
        id: 'new-note',
        label: 'New note',
        meta: 'Create a blank note',
        keywords: 'create write',
        run: createNote,
      },
      {
        id: 'today-note',
        label: "Open today's note",
        meta: 'Daily note — created on first use',
        keywords: 'today daily journal log',
        run: openTodayNote,
      },
      {
        id: 'quick-capture',
        label: 'Quick capture',
        meta: "Append a timestamped line to today's note",
        keywords: 'capture jot inbox quick add',
        run: openQuickCapture,
      },
      {
        id: 'search-notes',
        label: 'Search notes',
        meta: 'Focus the sidebar search',
        keywords: 'find filter',
        run: () => {
          els.search.focus();
          els.search.select();
        },
      },
      {
        id: 'manage-tags',
        label: 'Manage tags',
        meta: 'Rename, filter, or delete tags',
        keywords: 'tag labels',
        run: openTagManager,
      },
      {
        id: 'new-folder',
        label: 'New folder',
        meta: 'Create a folder',
        keywords: 'folder group organize create',
        run: () => openFolderDialog(null),
      },
      {
        id: 'toggle-bulk',
        label: state.bulkMode ? 'Exit selection mode' : 'Select multiple notes',
        meta: 'Bulk actions',
        keywords: 'bulk batch multi',
        run: toggleBulkMode,
      },
      {
        id: 'export-backup',
        label: 'Export backup',
        meta: 'Download JSON backup',
        keywords: 'backup json download',
        run: exportAll,
      },
      {
        id: 'export-markdown',
        label: 'Export Markdown ZIP',
        meta: 'Download active notes as Markdown',
        keywords: 'zip markdown download',
        run: exportMarkdownZip,
      },
      {
        id: 'import-notes',
        label: 'Import notes',
        meta: 'Restore a JSON backup',
        keywords: 'backup restore json',
        run: () => els.importFile.click(),
      },
      {
        id: 'view-notes',
        label: 'View Notes',
        meta: 'Show active notes',
        keywords: 'active list',
        run: () => setView('active'),
      },
      {
        id: 'view-trash',
        label: 'View Trash',
        meta: 'Show deleted notes',
        keywords: 'deleted',
        run: () => setView('trash'),
      },
      {
        id: 'open-guide',
        label: 'Open user guide',
        meta: 'How to use every feature',
        keywords: 'help docs manual how to guide',
        run: () => window.open('guide.html', '_blank', 'noopener'),
      },
      {
        id: 'diagnostics',
        label: 'Open diagnostics',
        meta: 'Storage and backup health',
        keywords: 'about local health storage',
        run: openAboutDialog,
      },
    ];

    const notes = sortNotes(state.notes)
      .slice(0, 8)
      .map((note) => ({
        id: 'note-' + note.id,
        label: deriveTitle(note),
        meta: isTrashed(note) ? 'Open note in Trash' : 'Open note',
        keywords: [note.body || '', (note.tags || []).join(' ')].join(' '),
        run: () => openNoteFromCommand(note.id),
      }));
    return commands.concat(notes);
  }

  async function openNoteFromCommand(id) {
    const note = getNote(id);
    if (!note) return;
    if (state.editing && state.dirty) {
      const ok = await confirmDiscard();
      if (!ok) return;
      await discardCurrentDraft();
    }
    state.view = isTrashed(note) ? 'trash' : 'active';
    state.selectedId = note.id;
    state.editing = false;
    state.dirty = false;
    state.mobileView = 'editor';
    renderAll();
    await maybePromptDraftForSelected();
  }

  function filteredCommandItems() {
    const q = els.commandPaletteInput.value;
    return commandDefinitions()
      .filter((item) => matchesQuery([item.label, item.meta, item.keywords].join(' '), q))
      .slice(0, 12);
  }

  function renderCommandPaletteList() {
    const items = filteredCommandItems();
    state.commandItems = items;
    if (!items.length) state.commandIndex = -1;
    else if (state.commandIndex < 0 || state.commandIndex >= items.length) {
      state.commandIndex = Math.max(0, items.length - 1);
    }
    const rows = items.map((item, index) => el('div', {
      class: 'command-palette-item' + (index === state.commandIndex ? ' is-active' : ''),
      attrs: {
        id: 'command-palette-option-' + index,
        role: 'option',
        tabindex: '-1',
        'aria-selected': index === state.commandIndex ? 'true' : 'false',
      },
      children: [
        el('span', { class: 'command-palette-label', text: item.label }),
        el('span', { class: 'command-palette-meta', text: item.meta }),
      ],
      on: {
        click: () => runCommandAt(index),
        mouseenter: () => setCommandPaletteIndex(index, false),
        mousedown: (event) => event.preventDefault(),
      },
    }));
    els.commandPaletteList.replaceChildren(...rows);
    els.commandPaletteEmpty.hidden = items.length > 0;
    els.commandPaletteStatus.textContent = items.length
      ? `${items.length} result${items.length === 1 ? '' : 's'} available.`
      : 'No commands or notes found.';
    syncCommandPaletteSelection(false);
  }

  function syncCommandPaletteSelection(scroll) {
    const options = Array.from(els.commandPaletteList.querySelectorAll('[role="option"]'));
    for (let index = 0; index < options.length; index += 1) {
      const active = index === state.commandIndex;
      options[index].classList.toggle('is-active', active);
      options[index].setAttribute('aria-selected', active ? 'true' : 'false');
    }
    const active = options[state.commandIndex];
    if (!active) {
      els.commandPaletteInput.removeAttribute('aria-activedescendant');
      return;
    }
    els.commandPaletteInput.setAttribute('aria-activedescendant', active.id);
    if (scroll) active.scrollIntoView({ block: 'nearest' });
  }

  function setCommandPaletteIndex(index, scroll) {
    if (!state.commandItems.length) {
      state.commandIndex = -1;
    } else {
      state.commandIndex = Math.max(0, Math.min(index, state.commandItems.length - 1));
    }
    syncCommandPaletteSelection(scroll);
  }

  function openCommandPalette() {
    state.commandIndex = 0;
    els.commandPaletteInput.value = '';
    els.commandPaletteInput.setAttribute('aria-expanded', 'true');
    renderCommandPaletteList();
    openDialog(els.commandPaletteDialog);
    setTimeout(() => els.commandPaletteInput.focus(), 0);
  }

  async function runCommandAt(index) {
    const item = state.commandItems[index];
    if (!item) return;
    closeDialog(els.commandPaletteDialog);
    els.commandPaletteInput.value = '';
    await item.run();
  }

  function onCommandPaletteKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCommandPaletteIndex(state.commandIndex + 1, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCommandPaletteIndex(state.commandIndex - 1, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCommandAt(state.commandIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeDialog(els.commandPaletteDialog);
    }
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
    return withBusy('restore-revision', [], 'Revision restore failed.', async () => {
      const nextNote = {
        ...note,
        title: rev.title || '',
        body: rev.body || '',
        updatedAt: now(),
        lastDraftAt: null,
      };
      await storeRevision(note);
      await putNoteRecord(nextNote);
      await DB.removeDraft(note.id);
      Object.assign(note, nextNote);
      state.editing = false;
      state.dirty = false;
      closeDialog(els.historyDialog);
      renderAll();
    });
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

  async function buildBackupPayload() {
    const notes = (await DB.getAll()).map(normalizeNote);
    const noteIds = new Set(notes.map((note) => note.id));
    const revisions = (await DB.getAllRevisions())
      .map((rev) => normalizeRevision(rev, rev.noteId))
      .filter((rev) => rev && noteIds.has(rev.noteId));
    return {
      app: 'scratchpad',
      version: window.SCRATCHPAD_VERSION || 'unknown',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      notes: notes.filter((n) => !isTrashed(n)),
      trashedNotes: notes.filter(isTrashed),
      revisions,
    };
  }

  async function exportAll() {
    return withBusy('export-json', [els.exportBtn], 'Export failed.', async () => {
      const payload = await buildBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `scratchpad-${exportStamp()}.json`);
      recordBackupDownload();
      toast('Backup downloaded (JSON).');
    });
  }

  function bytesToBase64(bytes) {
    let value = '';
    for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value);
  }

  function base64ToBytes(value) {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
    return bytes;
  }

  async function deriveBackupKey(passphrase, salt, usage) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ENCRYPTED_BACKUP_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }

  async function encryptBackupPayload(payload, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(passphrase, salt, 'encrypt');
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      format: ENCRYPTED_BACKUP_FORMAT,
      version: ENCRYPTED_BACKUP_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ENCRYPTED_BACKUP_ITERATIONS, salt: bytesToBase64(salt) },
      cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  function isEncryptedBackup(data) {
    return !!data && data.format === ENCRYPTED_BACKUP_FORMAT && data.version === ENCRYPTED_BACKUP_VERSION;
  }

  function isNativeBackup(data) {
    return !!data &&
      !Array.isArray(data) &&
      data.app === 'scratchpad' &&
      data.schemaVersion === 2 &&
      Array.isArray(data.notes) &&
      Array.isArray(data.trashedNotes) &&
      Array.isArray(data.revisions);
  }

  async function decryptBackupEnvelope(envelope, passphrase) {
    if (!isEncryptedBackup(envelope) || !envelope.kdf || !envelope.cipher ||
      envelope.kdf.iterations !== ENCRYPTED_BACKUP_ITERATIONS ||
      typeof envelope.kdf.salt !== 'string' || typeof envelope.cipher.iv !== 'string' ||
      typeof envelope.ciphertext !== 'string') {
      throw new Error('Invalid encrypted backup envelope');
    }
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encrypted backup parameters');
    const key = await deriveBackupKey(passphrase, salt, 'decrypt');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  function resetPassphraseDialog() {
    els.backupPassphrase.value = '';
    els.backupPassphraseConfirm.value = '';
    els.backupPassphraseShow.checked = false;
    els.backupPassphrase.type = 'password';
    els.backupPassphraseConfirm.type = 'password';
    els.backupPassphrase.removeAttribute('aria-invalid');
    els.backupPassphraseConfirm.removeAttribute('aria-invalid');
    els.backupPassphraseError.textContent = '';
    els.backupPassphraseError.hidden = true;
  }

  function clearPassphraseSession() {
    resetPassphraseDialog();
    state.backupPassphraseMode = null;
    state.encryptedImport = null;
  }

  function openEncryptedExportDialog() {
    closeDialog(els.aboutDialog);
    state.backupPassphraseMode = 'export';
    state.encryptedImport = null;
    resetPassphraseDialog();
    els.backupPassphraseTitle.textContent = 'Encrypt backup';
    els.backupPassphraseCopy.textContent = 'Choose a passphrase. It cannot be recovered if you forget it.';
    els.backupPassphraseConfirmWrap.hidden = false;
    els.confirmEncryptedExport.hidden = false;
    els.confirmEncryptedImport.hidden = true;
    openDialog(els.backupPassphraseDialog);
    setTimeout(() => els.backupPassphrase.focus(), 0);
  }

  function openEncryptedImportDialog(envelope) {
    closeDialog(els.aboutDialog);
    state.backupPassphraseMode = 'import';
    state.encryptedImport = envelope;
    resetPassphraseDialog();
    els.backupPassphraseTitle.textContent = 'Unlock encrypted backup';
    els.backupPassphraseCopy.textContent = 'Enter the passphrase used when this backup was created.';
    els.backupPassphraseConfirmWrap.hidden = true;
    els.confirmEncryptedExport.hidden = true;
    els.confirmEncryptedImport.hidden = false;
    openDialog(els.backupPassphraseDialog);
    setTimeout(() => els.backupPassphrase.focus(), 0);
  }

  function showPassphraseError(message) {
    els.backupPassphrase.setAttribute('aria-invalid', 'true');
    els.backupPassphraseError.textContent = message;
    els.backupPassphraseError.hidden = false;
    els.backupPassphrase.focus();
  }

  async function exportEncryptedBackup() {
    const passphrase = els.backupPassphrase.value;
    if (passphrase.length < 12) {
      showPassphraseError('Use at least 12 characters for this backup passphrase.');
      return;
    }
    if (passphrase !== els.backupPassphraseConfirm.value) {
      els.backupPassphraseConfirm.setAttribute('aria-invalid', 'true');
      showPassphraseError('The passphrases do not match.');
      return;
    }
    return withBusy('export-encrypted', [els.confirmEncryptedExport], 'Encrypted export failed.', async () => {
      const envelope = await encryptBackupPayload(await buildBackupPayload(), passphrase);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `scratchpad-encrypted-${exportStamp()}.scratchpad`);
      closeDialog(els.backupPassphraseDialog);
      clearPassphraseSession();
      recordBackupDownload();
      toast('Encrypted backup downloaded.');
    });
  }

  async function unlockEncryptedBackup() {
    if (!state.encryptedImport) return;
    return withBusy('import-encrypted', [els.confirmEncryptedImport], '', async () => {
      let data;
      try {
        data = await decryptBackupEnvelope(state.encryptedImport, els.backupPassphrase.value);
      } catch (e) {
        console.warn('Encrypted backup unlock failed', e);
        showPassphraseError('The passphrase or file is invalid. Try again.');
        return;
      }
      const preview = buildImportPreview(data);
      if (!preview.notes.length) {
        showPassphraseError('This backup does not contain any valid notes.');
        return;
      }
      state.importPreview = preview;
      state.encryptedImport = null;
      closeDialog(els.backupPassphraseDialog);
      clearPassphraseSession();
      renderImportPreview(preview);
      openDialog(els.importPreviewDialog);
    });
  }

  async function exportMarkdownZip() {
    return withBusy('export-markdown', [els.exportMarkdownBtn, els.exportOverflowBtn], 'Markdown export failed.', async () => {
      const notes = activeNotes();
      if (!notes.length) {
        toast('No active notes to export.', { tone: 'info' });
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
      const blob = new Blob([Zip.createZip(files)], { type: 'application/zip' });
      downloadBlob(blob, `scratchpad-markdown-${exportStamp()}.zip`);
      toast('Markdown ZIP downloaded.');
    });
  }

  function noteToMarkdown(note) {
    const lines = [
      '---',
      'title: ' + JSON.stringify(deriveTitle(note)),
      'tags: [' + (note.tags || []).map((tag) => JSON.stringify(tag)).join(', ') + ']',
      'pinned: ' + (!!note.pinned ? 'true' : 'false'),
      ...(note.dailyDate ? ['dailyDate: ' + JSON.stringify(note.dailyDate)] : []),
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

  function importError(label, reason) {
    return label + ': ' + reason;
  }

  function validateTags(rawTags, errors, preserveNativeLengths) {
    if (rawTags == null) return;
    if (!Array.isArray(rawTags)) {
      errors.push('tags must be an array');
      return;
    }
    if (!preserveNativeLengths && rawTags.length > NOTE_TAGS_MAX) errors.push('too many tags');
    for (const tag of rawTags) {
      if (typeof tag !== 'string') {
        errors.push('tags must be text');
        continue;
      }
      const normalized = normalizeTag(tag);
      if (!preserveNativeLengths && normalized.length > NOTE_TAG_MAX) errors.push('tag is too long');
    }
  }

  function validateImportText(raw, key, max, errors, preserveNativeLengths) {
    if (raw[key] == null) return;
    if (typeof raw[key] !== 'string') {
      errors.push(key + ' must be text');
      return;
    }
    if (!preserveNativeLengths && raw[key].length > max) errors.push(key + ' is too long');
  }

  function validateImportNote(raw, index, preserveNativeLengths) {
    const label = 'Note ' + (index + 1);
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: importError(label, 'entry is not a note object') };
    }
    if (raw.id != null && typeof raw.id !== 'string') errors.push('id must be text');
    if (typeof raw.title !== 'string' && typeof raw.body !== 'string') {
      errors.push('title or body is required');
    }
    validateImportText(raw, 'title', NOTE_TITLE_MAX, errors, preserveNativeLengths);
    validateImportText(raw, 'body', NOTE_BODY_MAX, errors, preserveNativeLengths);
    validateTags(raw.tags, errors, preserveNativeLengths);
    if (errors.length) return { error: importError(label, errors[0]) };
    return { note: normalizeNote(raw) };
  }

  function validateImportRevision(raw, index, validNoteIds, preserveNativeLengths) {
    const label = 'Revision ' + (index + 1);
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: importError(label, 'entry is not a revision object') };
    }
    if (typeof raw.noteId !== 'string' || !raw.noteId) errors.push('noteId is required');
    else if (!validNoteIds.has(raw.noteId)) errors.push('noteId does not match an imported note');
    validateImportText(raw, 'title', NOTE_TITLE_MAX, errors, preserveNativeLengths);
    validateImportText(raw, 'body', NOTE_BODY_MAX, errors, preserveNativeLengths);
    validateTags(raw.tags, errors, preserveNativeLengths);
    if (errors.length) return { error: importError(label, errors[0]) };
    return { revision: normalizeRevision(raw, raw.noteId) };
  }

  function isMarkdownFile(file) {
    return /\.(md|markdown)$/i.test(file.name || '') || file.type === 'text/markdown';
  }

  function parseFrontmatterValue(value) {
    const source = value.trim();
    if (!source) return '';
    try {
      return JSON.parse(source);
    } catch (e) {
      if (source === 'true') return true;
      if (source === 'false') return false;
      return source.replace(/^['"]|['"]$/g, '');
    }
  }

  function parseMarkdownNote(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const metadata = {};
    let bodyLines = lines;
    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1);
      if (end > 0) {
        for (const line of lines.slice(1, end)) {
          const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
          if (match) metadata[match[1]] = parseFrontmatterValue(match[2]);
        }
        bodyLines = lines.slice(end + 1);
        if (bodyLines[0] === '') bodyLines.shift();
      }
    }
    const body = bodyLines.join('\n');
    const createdAt = Date.parse(metadata.createdAt);
    const updatedAt = Date.parse(metadata.updatedAt);
    const tags = Array.isArray(metadata.tags)
      ? metadata.tags
      : typeof metadata.tags === 'string'
        ? metadata.tags.split(',')
        : [];
    const candidate = normalizeNote({
      id: uuid(),
      title: typeof metadata.title === 'string' ? metadata.title : '',
      body,
      tags,
      pinned: metadata.pinned === true,
      createdAt: Number.isFinite(createdAt) ? createdAt : now(),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : (Number.isFinite(createdAt) ? createdAt : now()),
      deletedAt: null,
      lastDraftAt: null,
      dailyDate: typeof metadata.dailyDate === 'string' ? metadata.dailyDate : null,
    });
    if (!candidate.title) candidate.title = deriveTitle(candidate);
    return candidate;
  }

  function presentImportData(data) {
    const preview = buildImportPreview(data);
    if (!preview.notes.length) {
      const rejected = preview.invalid + preview.invalidRevisions;
      toast(
        rejected ? `Import found no valid notes. Rejected ${rejected} invalid entr${rejected === 1 ? 'y' : 'ies'}.` : 'Import found no valid notes in that file.',
        { tone: 'error' }
      );
      return;
    }
    state.importPreview = preview;
    renderImportPreview(preview);
    openDialog(els.importPreviewDialog);
  }

  async function importFromFiles(files) {
    // Close the About dialog up front so any error toast / the preview dialog
    // isn't covered by the modal's top layer.
    closeDialog(els.aboutDialog);
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const markdown = selected.filter(isMarkdownFile);
    if (markdown.length && markdown.length !== selected.length) {
      toast('Choose JSON or Markdown files, not both.', { tone: 'error' });
      return;
    }
    if (!markdown.length && selected.length !== 1) {
      toast('Choose one JSON or encrypted backup at a time.', { tone: 'error' });
      return;
    }
    if (markdown.length) {
      if (markdown.length > IMPORT_MAX_NOTES) {
        toast(`Import failed: choose no more than ${IMPORT_MAX_NOTES} Markdown files at a time.`, { tone: 'error' });
        return;
      }
      if (markdown.some((file) => file.size > IMPORT_MAX_FILE_BYTES)) {
        toast('Import failed: Markdown files must be 2 MB or smaller.', { tone: 'error' });
        return;
      }
      const notes = [];
      try {
        for (const file of markdown) notes.push(parseMarkdownNote(await file.text()));
      } catch (e) {
        console.error('Markdown import read failed', e);
        toast('Import failed: Scratchpad could not read those Markdown files.', { tone: 'error' });
        return;
      }
      presentImportData({ notes });
      return;
    }
    const file = selected[0];
    let text;
    try {
      text = await file.text();
    } catch (e) {
      console.error('Import read failed', e);
      toast('Import failed: Scratchpad could not read that file.', { tone: 'error' });
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      toast('Import failed: that file is not valid JSON.', { tone: 'error' });
      return;
    }
    if (isEncryptedBackup(data)) {
      openEncryptedImportDialog(data);
      return;
    }
    if (file.size > IMPORT_MAX_FILE_BYTES && !isNativeBackup(data)) {
      toast('Import failed: backup files must be 2 MB or smaller.', { tone: 'error' });
      return;
    }
    presentImportData(data);
  }

  function buildImportPreview(data) {
    const empty = {
      notes: [],
      revisions: [],
      invalid: 0,
      invalidRevisions: 0,
      rejectedNotes: [],
      rejectedRevisions: [],
      newCount: 0,
      conflicts: 0,
    };
    if (!data || typeof data !== 'object') {
      return {
        ...empty,
        invalid: 1,
        rejectedNotes: [importError('File', 'top-level JSON must be an object or array')],
      };
    }
    const nativeBackup = isNativeBackup(data);
    let rawNotes = Array.isArray(data)
      ? data
      : []
        .concat(Array.isArray(data.notes) ? data.notes : [])
        .concat(Array.isArray(data.trashedNotes) ? data.trashedNotes : []);
    const existingIds = new Set(state.notes.map((n) => n.id));
    const seenIds = new Set();
    const notes = [];
    const rejectedNotes = [];
    if (!nativeBackup && rawNotes.length > IMPORT_MAX_NOTES) {
      for (let i = IMPORT_MAX_NOTES; i < rawNotes.length; i += 1) {
        rejectedNotes.push(importError('Note ' + (i + 1), 'import limit exceeded'));
      }
      rawNotes = rawNotes.slice(0, IMPORT_MAX_NOTES);
    }
    for (let i = 0; i < rawNotes.length; i += 1) {
      const result = validateImportNote(rawNotes[i], i, nativeBackup);
      if (result.error) {
        rejectedNotes.push(result.error);
        continue;
      }
      if (seenIds.has(result.note.id)) {
        rejectedNotes.push(importError('Note ' + (i + 1), 'duplicate id in import file'));
        continue;
      }
      seenIds.add(result.note.id);
      notes.push(result.note);
    }
    let rawRevisions = Array.isArray(data.revisions) ? data.revisions : [];
    const validNoteIds = new Set(notes.map((note) => note.id));
    const revisions = [];
    const rejectedRevisions = [];
    if (!nativeBackup && rawRevisions.length > IMPORT_MAX_REVISIONS) {
      for (let i = IMPORT_MAX_REVISIONS; i < rawRevisions.length; i += 1) {
        rejectedRevisions.push(importError('Revision ' + (i + 1), 'import limit exceeded'));
      }
      rawRevisions = rawRevisions.slice(0, IMPORT_MAX_REVISIONS);
    }
    for (let i = 0; i < rawRevisions.length; i += 1) {
      const result = validateImportRevision(rawRevisions[i], i, validNoteIds, nativeBackup);
      if (result.error) {
        rejectedRevisions.push(result.error);
        continue;
      }
      revisions.push(result.revision);
    }
    const conflicts = notes.filter((note) => existingIds.has(note.id)).length;
    return {
      notes,
      revisions,
      invalid: rejectedNotes.length,
      invalidRevisions: rejectedRevisions.length,
      rejectedNotes,
      rejectedRevisions,
      newCount: notes.length - conflicts,
      conflicts,
    };
  }

  function renderImportPreview(preview) {
    const rows = [
      ['New notes', preview.newCount],
      ['Conflicts', preview.conflicts],
      ['Rejected entries', preview.invalid],
      ['Revision snapshots', preview.revisions.length],
      ['Rejected revisions', preview.invalidRevisions],
    ].map(([label, value]) => [
      el('dt', { text: label }),
      el('dd', { text: String(value) }),
    ]).flat();
    els.importPreviewCounts.replaceChildren(...rows);
    const rejected = [...preview.rejectedNotes, ...preview.rejectedRevisions];
    if (rejected.length) {
      const shown = rejected.slice(0, 5);
      const items = shown.map((msg) => el('li', { text: msg }));
      if (rejected.length > shown.length) {
        items.push(el('li', { text: `${rejected.length - shown.length} more rejected entr${rejected.length - shown.length === 1 ? 'y' : 'ies'}.` }));
      }
      els.importPreviewErrors.replaceChildren(
        el('p', { text: 'Skipped invalid import content' }),
        el('ul', { children: items })
      );
      els.importPreviewErrors.hidden = false;
    } else {
      els.importPreviewErrors.replaceChildren();
      els.importPreviewErrors.hidden = true;
    }
    const duplicate = document.querySelector('input[name="import-conflict-mode"][value="duplicate"]');
    if (duplicate) duplicate.checked = true;
  }

  async function confirmImport() {
    const preview = state.importPreview;
    if (!preview) return;
    return withBusy('import', [els.confirmImport], 'Import failed. No notes were changed.', async () => {
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
      await DB.importRecords(notesToImport, revisionsToImport, REVISION_LIMIT);
      for (const note of notesToImport) {
        broadcastChange({
          type: 'note-changed',
          noteId: note.id,
          updatedAt: note.updatedAt,
        });
      }
      state.importPreview = null;
      closeDialog(els.importPreviewDialog);
      await loadAll();
      const imported = notesToImport.length;
      toast(
        imported ? `Imported ${imported} note${imported === 1 ? '' : 's'}.` : 'No new notes to import.',
        { tone: imported ? 'success' : 'info' }
      );
    });
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
    return withBusy('rename-tag', [], 'Tag rename failed.', async () => {
      const changed = [];
      const nextById = new Map();
      for (const note of activeNotes()) {
        if (!(note.tags || []).includes(oldTag)) continue;
        const nextNote = {
          ...note,
          tags: Array.from(new Set(note.tags.map((tag) => tag === oldTag ? newTag : tag))),
          updatedAt: now(),
        };
        nextById.set(note.id, nextNote);
        changed.push(putNoteRecord(nextNote));
      }
      await Promise.all(changed);
      for (const note of state.notes) {
        const nextNote = nextById.get(note.id);
        if (nextNote) Object.assign(note, nextNote);
      }
      if (state.tagFilter === oldTag) state.tagFilter = newTag;
      renderAll();
      renderTagManager();
    });
  }

  function openTagDelete(tag, count) {
    state.pendingTagDelete = tag;
    els.tagDeleteCopy.textContent = 'This removes #' + tag + ' from ' + count + (count === 1 ? ' active note.' : ' active notes.');
    openDialog(els.tagDeleteDialog);
  }

  async function deletePendingTag() {
    const tag = state.pendingTagDelete;
    if (!tag) return;
    return withBusy('delete-tag', [els.confirmTagDelete], 'Tag delete failed.', async () => {
      const changed = [];
      const nextById = new Map();
      for (const note of activeNotes()) {
        if (!(note.tags || []).includes(tag)) continue;
        const nextNote = {
          ...note,
          tags: note.tags.filter((t) => t !== tag),
          updatedAt: now(),
        };
        nextById.set(note.id, nextNote);
        changed.push(putNoteRecord(nextNote));
      }
      await Promise.all(changed);
      for (const note of state.notes) {
        const nextNote = nextById.get(note.id);
        if (nextNote) Object.assign(note, nextNote);
      }
      if (state.tagFilter === tag) state.tagFilter = null;
      state.pendingTagDelete = null;
      closeDialog(els.tagDeleteDialog);
      renderAll();
      renderTagManager();
    });
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
  function showWaitingUpdate(worker) {
    state.waitingWorker = worker ||
      (state.serviceWorkerRegistration && state.serviceWorkerRegistration.waiting) ||
      state.waitingWorker;
    if (!state.waitingWorker || !navigator.serviceWorker.controller) return;
    els.pwaUpdateNotice.hidden = false;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const version = encodeURIComponent(window.SCRATCHPAD_VERSION || 'dev');
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js?v=' + version);
      state.serviceWorkerRegistration = registration;
      if (registration.waiting && navigator.serviceWorker.controller) showWaitingUpdate(registration.waiting);
      if (typeof registration.addEventListener === 'function') {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing || typeof installing.addEventListener !== 'function') return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) showWaitingUpdate(registration.waiting || installing);
          });
        });
      }
      if (typeof navigator.serviceWorker.addEventListener === 'function') {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!state.reloadForUpdate) return;
          state.reloadForUpdate = false;
          window.location.reload();
        });
      }
      return registration;
    } catch (e) {
      console.warn('Service worker registration failed', e);
      return null;
    }
  }

  async function checkForUpdates() {
    const registration = state.serviceWorkerRegistration ||
      (navigator.serviceWorker.getRegistration && await navigator.serviceWorker.getRegistration());
    if (!registration || typeof registration.update !== 'function') {
      toast('Update checks are unavailable in this browser.', { tone: 'info' });
      return;
    }
    await registration.update();
    if (registration.waiting) showWaitingUpdate(registration.waiting);
    toast('Checked for updates.', { tone: 'info' });
  }

  function messageServiceWorker(worker, message) {
    return new Promise((resolve, reject) => {
      if (!worker || typeof worker.postMessage !== 'function') {
        reject(new Error('No active service worker'));
        return;
      }
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error('Service worker response timed out')), 8000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        if (event.data && event.data.ok) resolve(event.data);
        else reject(new Error('Service worker refresh failed'));
      };
      worker.postMessage(message, [channel.port2]);
    });
  }

  async function refreshOfflineCopy() {
    const registration = state.serviceWorkerRegistration ||
      (navigator.serviceWorker.getRegistration && await navigator.serviceWorker.getRegistration());
    const worker = (registration && registration.active) || navigator.serviceWorker.controller;
    await messageServiceWorker(worker, { type: 'REFRESH_CACHE' });
    toast('Offline copy refreshed.');
  }

  window.ScratchpadPWA = { showWaitingUpdate };

  // -------- Event wiring --------
  function bindEvents() {
    const onSearch = debounce(() => {
      state.search = els.search.value;
      renderAll();
    }, 150);
    els.search.addEventListener('input', onSearch);
    // Search-scope select was retired in the Soft Glass redesign; search now
    // always matches all fields (state.searchScope defaults to 'all').
    if (els.searchScope) {
      els.searchScope.addEventListener('change', () => setSearchScope(els.searchScope.value));
    }

    els.clearFilter.addEventListener('click', () => setTagFilter(null));
    els.clearSearchBtn.addEventListener('click', clearAllFilters);
    els.activeNotesView.addEventListener('click', () => setView('active'));
    els.trashView.addEventListener('click', () => setView('trash'));
    els.groupFolders.addEventListener('click', () => setGrouping('folders'));
    els.groupRecent.addEventListener('click', () => setGrouping('recent'));
    els.folderDialogSave.addEventListener('click', () => { saveFolderDialog(); });
    els.folderNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveFolderDialog();
      }
    });
    els.folderMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[role="menuitem"]');
      if (item) runFolderMenuAction(item.getAttribute('data-action'));
    });
    els.folderDeleteKeep.addEventListener('click', () => { applyFolderDelete('keep'); });
    els.folderDeleteTrash.addEventListener('click', () => { applyFolderDelete('trash'); });
    els.manageTags.addEventListener('click', openTagManager);

    els.newNote.addEventListener('click', createNote);
    els.todayNote.addEventListener('click', openTodayNote);
    els.bulkToggle.addEventListener('click', toggleBulkMode);
    els.commandPaletteBtn.addEventListener('click', openCommandPalette);
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
      await withBusy('title-save', [els.titleInput], 'Title update failed.', async () => {
        const previousDisplayTitle = deriveTitle(note);
        const nextNote = { ...note, title: v, updatedAt: now() };
        await putNoteRecord(nextNote);
        Object.assign(note, nextNote);
        state.dirty = false;
        renderSidebar();
        els.dirtyIndicator.hidden = true;
        await maybeOfferLinkRewrite(previousDisplayTitle, deriveTitle(nextNote), note.id);
      });
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
    els.editor.addEventListener('input', updateWikilinkSuggest);
    els.editor.addEventListener('keydown', onEditorSuggestKey);
    els.editor.addEventListener('blur', () => setTimeout(closeWikilinkSuggest, 0));
    els.editor.addEventListener('click', () => { if (wikilinkSuggestState.open) updateWikilinkSuggest(); });
    els.rendered.addEventListener('click', onRenderedClick);
    els.rendered.addEventListener('keydown', onRenderedKey);
    els.formatToolbar.addEventListener('mousedown', (e) => {
      const button = e.target.closest && e.target.closest('[data-format]');
      if (button) e.preventDefault();
    });
    els.formatToolbar.addEventListener('click', (e) => {
      const button = e.target.closest && e.target.closest('[data-format]');
      if (!button) return;
      applyEditorFormat(button.dataset.format);
    });

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

    els.tagBar.addEventListener('mousedown', (e) => {
      // When the tag input is open, keep it focused until a neighboring tag
      // button's click fires. Otherwise Firefox can process the blur timer
      // between pointer-down and click, collapsing the bar and detaching the
      // intended target before its action runs.
      if (!els.tagInput.hidden && e.target.closest('button')) e.preventDefault();
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

    els.openAbout.addEventListener('click', openAboutDialog);
    els.exportBtn.addEventListener('click', () => { closeDialog(els.aboutDialog); exportAll(); });
    els.exportEncryptedBtn.addEventListener('click', openEncryptedExportDialog);
    els.exportMarkdownBtn.addEventListener('click', () => { closeDialog(els.aboutDialog); exportMarkdownZip(); });
    els.importBtn.addEventListener('click', () => els.importFile.click());
    els.protectStorageBtn.addEventListener('click', requestStorageProtection);
    els.checkUpdatesBtn.addEventListener('click', () => withBusy(
      'check-updates',
      [els.checkUpdatesBtn],
      'Update check failed.',
      checkForUpdates
    ));
    els.refreshOfflineCopyBtn.addEventListener('click', () => withBusy(
      'refresh-offline-copy',
      [els.refreshOfflineCopyBtn],
      'Offline copy refresh failed.',
      refreshOfflineCopy
    ));
    els.eraseLocalDataBtn.addEventListener('click', openEraseLocalDataDialog);
    els.confirmEraseLocalData.addEventListener('click', eraseLocalData);
    els.eraseConfirmation.addEventListener('input', () => {
      els.eraseConfirmation.removeAttribute('aria-invalid');
      els.eraseConfirmationError.hidden = true;
    });
    els.confirmEncryptedExport.addEventListener('click', exportEncryptedBackup);
    els.confirmEncryptedImport.addEventListener('click', unlockEncryptedBackup);
    els.backupPassphraseShow.addEventListener('change', () => {
      const type = els.backupPassphraseShow.checked ? 'text' : 'password';
      els.backupPassphrase.type = type;
      els.backupPassphraseConfirm.type = type;
    });
    for (const button of els.backupPassphraseDialog.querySelectorAll('[data-dialog-close]')) {
      button.addEventListener('click', clearPassphraseSession);
    }
    els.backupPassphraseDialog.addEventListener('cancel', clearPassphraseSession);
    els.backupReminderExport.addEventListener('click', () => { closeDialog(els.aboutDialog); exportAll(); });
    els.backupReminderSnooze.addEventListener('click', snoozeBackupReminder);
    els.importFile.addEventListener('change', async () => {
      const files = els.importFile.files;
      if (files && files.length) await importFromFiles(files);
      els.importFile.value = '';
    });
    els.pwaUpdateLater.addEventListener('click', () => {
      els.pwaUpdateNotice.hidden = true;
    });
    els.pwaUpdateReload.addEventListener('click', () => {
      const worker = state.waitingWorker ||
        (state.serviceWorkerRegistration && state.serviceWorkerRegistration.waiting);
      if (!worker) return;
      state.reloadForUpdate = true;
      els.pwaUpdateNotice.hidden = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    els.confirmImport.addEventListener('click', confirmImport);
    els.confirmTagDelete.addEventListener('click', deletePendingTag);
    els.bulkApplyTag.addEventListener('click', applyBulkTag);
    els.bulkTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyBulkTag();
      }
    });
    els.commandPaletteInput.addEventListener('input', () => {
      state.commandIndex = 0;
      renderCommandPaletteList();
    });
    els.commandPaletteInput.addEventListener('keydown', onCommandPaletteKey);
    els.commandPaletteDialog.addEventListener('close', () => {
      els.commandPaletteInput.setAttribute('aria-expanded', 'false');
      els.commandPaletteInput.removeAttribute('aria-activedescendant');
    });
    els.quickCaptureInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitQuickCapture();
      }
    });

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

    if (meta && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      openTodayNote();
      return;
    }

    if (meta && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      openCommandPalette();
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
  // First run: seed a few starter notes, then send a brand-new visitor to the
  // About page exactly once — only when they've never visited (no flag) AND have
  // no notes yet. Existing users who predate the flag keep their place (they have
  // notes); a returning user who cleared all their notes also stays (their flag
  // survives), so seeding never recurs. Clearing site data wipes both flag and
  // notes, so it reads as a fresh first run. Fails open if localStorage is blocked
  // so the app can never get stuck here; a seeding error still lets boot proceed.
  async function maybeRedirectFirstRun() {
    let visited;
    try {
      visited = localStorage.getItem('scratchpad-visited');
    } catch (e) {
      return false;
    }
    if (visited) return false;
    try {
      localStorage.setItem('scratchpad-visited', '1');
    } catch (e) {
      /* private mode / quota — mark best-effort, still safe to continue */
    }
    let count = 0;
    try {
      count = (await DB.getAll()).length;
    } catch (e) {
      return false;
    }
    if (count === 0) {
      try {
        if (window.ScratchpadSeed) {
          await DB.bulkPut(window.ScratchpadSeed.buildFirstRunNotes(now()));
        }
      } catch (e) {
        console.error('First-run seeding failed', e); // fail open — still redirect
      }
      window.location.replace('about.html');
      return true;
    }
    return false;
  }

  // OS-level PWA shortcuts land on /?action=<name>. Handle once at boot,
  // then clean the URL so reload/bookmark behaves normally. The service
  // worker matches navigations by pathname, so these URLs work offline.
  async function handleActionParam() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (action === 'new') await createNote();
    else if (action === 'today') await openTodayNote();
    else if (action === 'capture') openQuickCapture();
  }

  async function init() {
    if (await maybeRedirectFirstRun()) return;
    Markdown.setWikilinkResolver((target) => {
      const wanted = (target || '').trim().toLowerCase();
      if (!wanted) return null;
      const matches = sortNotes(state.notes.filter(
        (n) => !isTrashed(n) && deriveTitle(n).trim().toLowerCase() === wanted
      ));
      return matches.length ? matches[0].id : null;
    });
    initCrossTabSync();
    bindEvents();
    try {
      await loadAll();
      await handleActionParam();
      registerServiceWorker();
    } catch (e) {
      console.error('Failed to load notes', e);
      toast('Scratchpad could not open its local database. Your browser may be blocking storage.', { tone: 'error', persist: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
