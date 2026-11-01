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
        find: "if (reads || !deps || !record || (await permission()) !== 'granted') return;",
        replace: "if (!deps || !record || (await permission()) !== 'granted') return;",
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
    edits: [{ find: 'if (await readUnseenEdit(id, api)) paths = assignPaths(api.notes());', replace: '' }],
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
        find: 'if (changed) await api.reload();\n      if (changed) api.toast',
        replace: 'if (changed) api.toast',
      },
    ],
  },
];
