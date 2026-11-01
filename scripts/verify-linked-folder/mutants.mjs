// Each entry removes one safeguard from public/js/linked-folder.js in memory, and
// `guard` names the scenario that must catch it, so a catch is for the right reason.
// An `edits` target that no longer matches fails the run, which signals that the
// code moved and this list needs another look.
export const mutants = [
  {
    name: 'write-backs no longer wait for a read (the d0d9339 bug)',
    guard: 'a new file adopted while another note saves',
    edits: [
      {
        find: 'if (reads || !deps || !record || (await permission())',
        replace: 'if (!deps || !record || (await permission())',
      },
      {
        find: 'if (pending.size && !writeTimer && !reads) writeTimer',
        replace: 'if (pending.size && !writeTimer) writeTimer',
      },
    ],
  },
  {
    name: 'the note loses its text without a History entry when the file wins',
    guard: 'note saved, then file edited, then read',
    edits: [{ find: 'await api.storeRevision(existing);', replace: '' }],
  },
  {
    name: 'the file loses its text without a History entry when the note wins',
    guard: 'file edited, then note saved, then read',
    edits: [
      {
        find: 'await api.storeRevision({ ...existing, title: parsed.title, body: parsed.body, tags: parsed.tags });',
        replace: '',
      },
    ],
  },
  {
    name: 'a read ignores every changed file',
    guard: 'file edited, then read, with the note untouched',
    edits: [{ find: 'if (mtime <= known) return 0;', replace: 'return 0;' }],
  },
  {
    name: 'a trashed note keeps its file',
    guard: 'a note trashed while the folder is read',
    edits: [{ find: 'if (previous) await removeFile(previous);\n      delete', replace: 'delete' }],
  },
  {
    name: 'a write-back overwrites an edit nobody has read (F1)',
    guard: 'file edited, then note saved, then the write-back fires',
    edits: [{ find: 'const seen = await readUnseenEdit(id, api);', replace: 'const seen = 0;' }],
  },
  {
    name: 'two write-backs of one file can overlap',
    guard: 'a read overlapping a note save',
    edits: [{ find: 'writes = writes.then(writeBack).catch(', replace: 'writes = writeBack().catch(' }],
  },
  {
    name: 'Write now returns before its write finishes',
    guard: 'Write now finishes only after the write in progress and its own',
    edits: [{ find: 'await flush();\n    return Object.keys', replace: 'flush();\n    return Object.keys' }],
  },
  {
    name: 'a write-back writes stale memory after its read loses',
    guard: 'file edited, then note saved, then the write-back fires',
    edits: [{ find: 'if (seen < 0) continue;', replace: '' }],
  },
  {
    name: 'an edit found after a write is marked as already read',
    guard: 'a file edit landing just after a write survives the next save',
    edits: [{ find: 'const UNSEEN = 1;', replace: 'const UNSEEN = 0;' }],
  },
  {
    name: 'a read overwrites the note without checking it changed (F2)',
    guard: 'a read overlapping a note save',
    edits: [{ find: ', undefined, existing.updatedAt)', replace: ')' }],
  },
  {
    // saveCurrent lives in app.js, so this breaks the copy in world.mjs. The browser
    // test in tests/linked-folder.spec.js covers the real function.
    name: 'a save overwrites the note without checking it changed (F2)',
    guard: 'a read overlapping a note save',
    edits: [],
    world: { unconditionalSave: true },
  },
  {
    name: 'a write trusts the timestamp without checking the text (F3)',
    guard: 'a file edit landing just after the app writes that file',
    edits: [{ find: 'return same ? file.lastModified : UNSEEN;', replace: 'return file.lastModified;' }],
  },
  {
    name: 'a read never reloads memory',
    guard: 'a new file adopted while another note saves',
    edits: [{ find: 'await saveRecord();\n      if (changed) await api.reload();', replace: 'await saveRecord();' }],
  },
  {
    name: 'a write-back keeps stale memory after it reads an unseen edit',
    guard: 'note saved, then file edited, then the write-back fires',
    edits: [
      {
        find: 'if (changed > 0) await api.reload();\n      if (changed > 0) api.toast',
        replace: 'if (changed > 0) api.toast',
      },
    ],
  },
];
