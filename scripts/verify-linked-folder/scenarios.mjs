// The promises under test, from guide.html's Linked folder section and
// docs/superpowers/specs/2026-09-01-linked-folder-design.md ("Fail safe").
const NOTE = { id: 'n1', title: 'Loose idea', body: 'original', tags: [], createdAt: 1, updatedAt: 1 };
const OTHER = { id: 'n2', title: 'Other note', body: 'other body', tags: [], createdAt: 2, updatedAt: 2 };
const FILE = 'loose-idea.md';
const FILE_TEXT = 'typed in the file';
const APP_TEXT = 'typed in the app';

const externalEdit = { run: (world) => world.externalEdit(FILE, FILE_TEXT) };
const appSave = { run: (world) => world.appSave('n1', { body: APP_TEXT }) };
const readNow = {
  run: (world) => {
    world.note('the user presses Read now');
    return world.linkedFolder.readAll(false);
  },
};
const focusLate = { run: (world) => world.focusAfterThrottle() };

function survives(world, text) {
  const inNote = [...world.db.values()].some((note) => note.body === text);
  const inHistory = world.revisions.some((revision) => revision.body === text);
  const onDisk = [...world.files.values()].some((file) => file.text.endsWith(`\n\n${text}`));
  return inNote || inHistory || onDisk;
}

function readBack(world, text) {
  const inNote = [...world.db.values()].some((note) => note.body === text);
  return inNote || world.revisions.some((revision) => revision.body === text);
}

export function check(world, scenario) {
  const violations = [];
  for (const text of scenario.mustSurvive || []) {
    if (!survives(world, text)) {
      violations.push({
        property: `no-lost-text "${text}"`,
        message: `"${text}" is gone: it is not in the note, in History, or on disk`,
      });
    }
  }
  for (const text of scenario.mustReadBack || []) {
    if (survives(world, text) && !readBack(world, text)) {
      violations.push({
        property: `read-back "${text}"`,
        message: `"${text}" is still on disk, but Read now will never bring it into the note`,
      });
    }
  }
  const trashed = (note) => !!note.deletedAt;
  for (const note of world.db.values()) {
    const hasFile = [...world.files.values()].some((file) => file.text.includes(`\nid: ${note.id}\n`));
    if (!trashed(note) && !hasFile) {
      violations.push({
        property: 'file-kept',
        message: `the file for ${note.id} is gone, but the user never trashed that note`,
      });
    }
    if (trashed(note) && hasFile) {
      violations.push({ property: 'file-removed', message: `${note.id} is trashed, but its file is still on disk` });
    }
    const isCurrent = [...world.files.values()].some(
      (file) => file.text.includes(`\nid: ${note.id}\n`) && file.text.endsWith(`\n\n${note.body}`),
    );
    if (!trashed(note) && hasFile && !isCurrent) {
      violations.push({ property: 'file-current', message: `the file for ${note.id} no longer matches the note` });
    }
  }
  return violations;
}

// Guards: these hold on the current code, so a regression shows up here.
export const guards = [
  {
    name: 'file edited, then note saved, then read',
    promise: 'When both change, the newer one wins and the other text stays in History.',
    notes: [NOTE],
    events: [externalEdit, appSave, readNow],
    serial: true,
    holdTimersUntilDone: true,
    mustSurvive: [FILE_TEXT, APP_TEXT],
  },
  {
    name: 'note saved, then file edited, then read',
    promise: 'When both change, the newer one wins and the other text stays in History.',
    notes: [NOTE],
    events: [appSave, externalEdit, readNow],
    serial: true,
    holdTimersUntilDone: true,
    mustSurvive: [FILE_TEXT, APP_TEXT],
  },
  {
    name: 'file edited, then read, with the note untouched',
    promise: 'An edit made in the file lands in the note, and the replaced text stays in History.',
    notes: [NOTE],
    events: [externalEdit, focusLate],
    serial: true,
    mustSurvive: [FILE_TEXT, NOTE.body],
    mustReadBack: [FILE_TEXT],
  },
  {
    name: 'file edited, then note saved, then the write-back fires',
    promise: 'A write-back never overwrites an edit nobody has read.',
    notes: [NOTE],
    events: [externalEdit, appSave],
    serial: true,
    mustSurvive: [FILE_TEXT, APP_TEXT],
    mustReadBack: [FILE_TEXT],
  },
  {
    name: 'note saved, then file edited, then the write-back fires',
    promise: 'A write-back never overwrites an edit nobody has read.',
    notes: [NOTE],
    events: [appSave, externalEdit],
    serial: true,
    mustSurvive: [FILE_TEXT, APP_TEXT],
    mustReadBack: [FILE_TEXT],
  },
  {
    name: 'file edited, then note renamed, then the write-back fires',
    promise: 'A rename never deletes an edit nobody has read.',
    notes: [NOTE],
    events: [externalEdit, { run: (world) => world.appSave('n1', { title: 'Renamed idea', body: APP_TEXT }) }],
    serial: true,
    mustSurvive: [FILE_TEXT, APP_TEXT],
    mustReadBack: [FILE_TEXT],
  },
  {
    name: 'a read overlapping a note save',
    promise: 'When both change, the newer one wins and the other text stays in History.',
    notes: [NOTE],
    setup: [externalEdit],
    events: [readNow, appSave],
    mustSurvive: [FILE_TEXT, APP_TEXT],
  },
  {
    // Only read-back is checked here. The open finding F1 owns the orders where the
    // edit lands before the overwrite and is lost outright.
    name: 'a file edit landing just after the app writes that file',
    promise: 'An edit still on disk gets read back, even if it landed right after a write.',
    notes: [NOTE],
    events: [externalEdit, appSave],
    mustReadBack: [FILE_TEXT],
  },
  {
    name: 'a new file adopted while another note saves',
    promise: 'A read never deletes the files it is adopting (d0d9339).',
    notes: [NOTE, OTHER],
    events: [{ run: (world) => world.externalCreate('fresh-thought.md', 'fresh') }, readNow, appSave],
    mustSurvive: ['fresh', APP_TEXT],
  },
  {
    name: 'a read overlapping a focus read',
    promise: 'Overlapping reads lose nothing and leave every file in place.',
    notes: [NOTE],
    setup: [externalEdit],
    events: [readNow, focusLate],
    mustSurvive: [FILE_TEXT, NOTE.body],
  },
  {
    name: 'a note trashed while the folder is read',
    promise: 'Only a trashed note loses its file.',
    notes: [NOTE, OTHER],
    events: [{ run: (world) => world.trash('n1') }, readNow],
  },
];

// Findings: orders the current code gets wrong. Each stays listed until the product
// code is fixed, and its entry moves to `guards` then. Never weaken one to pass.
export const findings = [
  {
    name: 'F1: a file edit landing between the check and the overwrite',
    promise: 'A write-back never overwrites an edit nobody has read.',
    notes: [NOTE],
    events: [externalEdit, appSave],
    mustSurvive: [FILE_TEXT, APP_TEXT],
  },
];
