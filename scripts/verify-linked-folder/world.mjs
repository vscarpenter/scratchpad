// A fake browser for public/js/linked-folder.js. The module runs unmodified. Each
// await that touches shared state becomes an operation the explorer resolves in a
// chosen order, so the indivisible steps here are the real code's own await gaps.
// App-side helpers mirror these functions in public/js/app.js: putNoteRecord,
// saveCurrent, moveCurrentToTrash, storeRevision, and loadAll.

const THROTTLE_GAP = 11000; // Just past READ_THROTTLE in linked-folder.js.
const EDITOR_BODY = /\n\n[^]*$/;

function toMarkdown(note) {
  const header = [`id: ${note.id}`, `title: ${note.title || ''}`];
  return `---\n${header.join('\n')}\n---\n\n${note.body || ''}`;
}

function parseField(text, name) {
  const match = new RegExp(`^${name}: (.*)$`, 'm').exec(text);
  return match ? match[1] : '';
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function notFound(path) {
  return Object.assign(new Error(`${path} was not found`), { name: 'NotFoundError' });
}

export class World {
  constructor(source, options = {}) {
    this.options = options;
    this.clock = 1000000;
    this.files = new Map();
    this.db = new Map();
    this.revisions = [];
    this.memory = [];
    this.operations = [];
    this.timers = new Map();
    this.trace = [];
    this.toasts = [];
    this.failure = null;
    this.nextId = 1;
    this.focusListener = null;
    this.linkedFolder = this.load(source);
  }

  load(source) {
    const window = {
      setTimeout: (callback) => this.addTimer(callback),
      addEventListener: (name, callback) => {
        if (name === 'focus') this.focusListener = callback;
      },
      showDirectoryPicker: async () => this.directory(''),
      ScratchpadDB: this.settingsStore(),
    };
    const document = { getElementById: () => null };
    const quietConsole = { warn: () => {} };
    new Function('window', 'document', 'console', source)(window, document, quietConsole);
    window.ScratchpadLinkedFolder.init(this.deps());
    return window.ScratchpadLinkedFolder;
  }

  // The record is memory-backed here: a crash between steps is out of scope, so
  // persisting it adds no interleaving the properties can observe.
  settingsStore() {
    const store = { put: () => {}, delete: () => {}, get: () => ({ result: undefined }), transaction: {} };
    return { tx: async () => store, reqToPromise: async () => undefined, transactionDone: async () => {} };
  }

  deps() {
    return {
      notes: () => this.memory,
      folders: () => [],
      noteToMarkdown: toMarkdown,
      parseMarkdownNote: (text) => this.parseMarkdown(text),
      getStoredNote: (id) => this.operation(`the app reads the stored ${id}`, () => this.db.get(id)),
      storeRevision: async (note) => this.storeRevision(note),
      putNoteRecord: (note, changeType, expected) => this.putNoteRecord(note, changeType, expected),
      deriveTitle: (note) => note.title || 'Untitled',
      slugify,
      noteFolderId: () => null,
      folderDisplayName: () => '',
      isArchived: () => false,
      isTrashed: (note) => !!note.deletedAt,
      uuid: () => `generated-${this.nextId++}`,
      now: () => this.clock,
      toast: (message, options) => this.toast(message, options),
      reload: () => this.reload(),
    };
  }

  parseMarkdown(text) {
    const body = (EDITOR_BODY.exec(text) || ['\n\n'])[0].slice(2);
    const id = parseField(text, 'id') || `generated-${this.nextId++}`;
    return { id, title: parseField(text, 'title'), body, tags: [], createdAt: this.clock, updatedAt: this.clock };
  }

  toast(message, options) {
    this.toasts.push(message);
    if (options?.tone === 'error') this.note(`the app shows an error: "${message}"`);
  }

  note(line) {
    this.trace.push(line);
  }

  addTimer(callback) {
    const id = this.nextId++;
    this.timers.set(id, callback);
    return id;
  }

  // Queues one indivisible step. The explorer decides when it runs.
  operation(label, effect) {
    return new Promise((resolve, reject) => {
      this.operations.push({
        label,
        run: () => {
          this.clock += 1;
          try {
            resolve(effect());
          } catch (error) {
            reject(error);
          }
        },
      });
    });
  }

  // Nothing but the final check reads revisions, so a revision write commutes
  // with every other step and needs no branch point.
  storeRevision(note) {
    this.revisions.push({ noteId: note.id, title: note.title, body: note.body });
    this.note(`History keeps "${note.body}"`);
  }

  // With `expected`, this mirrors DB.putIfUnchanged: one transaction that commits
  // only when the stored updatedAt still matches.
  async putNoteRecord(note, _changeType, expected) {
    const committed = await this.operation(`the database saves "${note.body}" for ${note.id}`, () => {
      if (expected !== undefined && this.db.get(note.id)?.updatedAt !== expected) return false;
      this.db.set(note.id, { ...note });
      return true;
    });
    if (!committed) {
      this.note('the database refuses that write, because the note changed');
      return false;
    }
    this.linkedFolder.noteChanged(note);
    return true;
  }

  async reload() {
    const all = await this.operation('the app reads the database to reload memory', () =>
      [...this.db.values()].map((note) => ({ ...note })),
    );
    this.memory = all;
  }

  directory(prefix) {
    return {
      name: 'linked',
      kind: 'directory',
      getDirectoryHandle: async (name) => this.directory(`${prefix}${name}/`),
      getFileHandle: async (name, options) => {
        if (!options?.create && !this.files.has(prefix + name)) throw notFound(prefix + name);
        return this.fileHandle(prefix + name);
      },
      removeEntry: (name) => this.removeEntry(prefix + name),
      entries: () => this.entries(prefix),
    };
  }

  removeEntry(path) {
    return this.operation(`the file ${path} is deleted`, () => {
      this.files.delete(path);
    });
  }

  // The real iterator is lazy. One snapshot per directory is a stated assumption:
  // the scenarios only ever change the root directory by one file at a time.
  async *entries(prefix) {
    const names = await this.operation('the read lists the folder', () =>
      [...this.files.keys()].filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/')),
    );
    for (const path of names) yield [path.slice(prefix.length), this.fileHandle(path)];
  }

  fileHandle(path) {
    return {
      kind: 'file',
      createWritable: async () => this.writable(path),
      getFile: () => this.getFile(path),
    };
  }

  // Writes buffer in a swap file and land together at close().
  writable(path) {
    let content = '';
    return {
      write: async (text) => {
        content = text;
      },
      close: () => {
        const body = (EDITOR_BODY.exec(content) || ['\n\n'])[0].slice(2);
        return this.operation(`the app overwrites ${path} with "${body}"`, () => {
          this.files.set(path, { text: content, mtime: this.clock });
        });
      },
    };
  }

  getFile(path) {
    return this.operation(`the app opens ${path}`, () => {
      const file = this.files.get(path);
      if (!file) throw notFound(path);
      return { lastModified: file.mtime, text: () => this.readBlob(path, file) };
    });
  }

  // A File from this API fails to read once the file on disk has changed.
  readBlob(path, opened) {
    return this.operation(`the read loads the text of ${path}`, () => {
      if (this.files.get(path) !== opened) throw new Error(`NotReadableError: ${path}`);
      return opened.text;
    });
  }

  seed(note) {
    this.db.set(note.id, { ...note });
    this.memory.push({ ...note });
  }

  externalEdit(path, body) {
    const file = this.files.get(path);
    if (!file) return this.note(`the external editor finds no ${path}`);
    this.clock += 1;
    this.files.set(path, { text: file.text.replace(EDITOR_BODY, `\n\n${body}`), mtime: this.clock });
    return this.note(`an external editor saves "${body}" to ${path}`);
  }

  externalCreate(path, body) {
    this.clock += 1;
    this.files.set(path, { text: `---\ntitle: ${body}\n---\n\n${body}`, mtime: this.clock });
    this.note(`an external editor creates ${path} with "${body}"`);
  }

  async appSave(id, changes) {
    this.note(`the user saves "${changes.body || changes.title}" in the app`);
    const opened = this.memory.find((note) => note.id === id);
    const latest = await this.operation('the app reads the latest note before saving', () => ({ ...this.db.get(id) }));
    if (latest.updatedAt !== opened.updatedAt) return this.saveAsSeparateNote(latest, changes);
    this.storeRevision(latest);
    const next = { ...latest, ...changes, updatedAt: this.clock };
    const expected = this.options.unconditionalSave ? undefined : latest.updatedAt;
    if (!(await this.putNoteRecord(next, undefined, expected))) return this.saveAgainAfterRace(id, changes);
    // saveCurrent awaits DB.removeDraft here, so memory lags the database for a moment.
    await this.operation('the app removes the draft', () => {});
    this.memory = this.memory.map((note) => (note.id === id ? next : note));
    return undefined;
  }

  // saveCurrent keeps the editor open when its write loses, and the user saves again.
  saveAgainAfterRace(id, changes) {
    this.note('the editor stays open');
    return this.appSave(id, changes);
  }

  // saveCurrent opens a conflict dialog when the note changed underneath the editor.
  // The checker assumes the user picks "save as a separate note", the choice that
  // keeps both texts. The dialog's other choices are the user's own decision.
  async saveAsSeparateNote(latest, changes) {
    this.note('the app sees a conflict, and the user keeps the edit as a separate note');
    const copy = {
      ...latest,
      ...changes,
      id: `${latest.id}-copy`,
      title: `${latest.title} copy`,
      updatedAt: this.clock,
    };
    await this.putNoteRecord(copy);
    this.memory = [...this.memory, copy];
  }

  async trash(id) {
    this.note(`the user trashes ${id}`);
    const next = { ...this.db.get(id), deletedAt: this.clock, updatedAt: this.clock };
    await this.putNoteRecord(next);
    this.memory = this.memory.map((note) => (note.id === id ? next : note));
  }

  focusAfterThrottle() {
    this.clock += THROTTLE_GAP;
    this.note('the user returns to the tab after 10 seconds');
    this.focusListener();
  }
}
