// Loads public/js/seed.js under a window shim and asserts the first-run seed
// matches the normalizeNote and folder contracts: three tour notes, one
// Templates folder with four starter templates filed in it, and wikilinks that
// resolve among the seeded titles (except the intentional "My First Note"
// phantom).
import { readFileSync } from 'node:fs';

const win = {};
globalThis.window = win;
new Function('window', readFileSync('public/js/seed.js', 'utf8'))(win);

const errs = [];
const assert = (cond, msg) => {
  if (!cond) errs.push(msg);
};

const api = win.ScratchpadSeed || {};
assert(typeof api.buildFirstRun === 'function', 'seed must export buildFirstRun(now)');
assert(typeof api.seedFirstRun === 'function', 'seed must export seedFirstRun(db, now)');
assert(typeof api.buildStarterTemplates === 'function', 'seed must export buildStarterTemplates(now, folderId)');
assert(typeof api.maybeSeedFirstRun === 'function', 'seed must export maybeSeedFirstRun(db, now)');

const FIXED = Date.parse('2026-07-18T12:00:00');
const seed = typeof api.buildFirstRun === 'function' ? api.buildFirstRun(FIXED) : {};
const notes = Array.isArray(seed.notes) ? seed.notes : [];
const folders = Array.isArray(seed.folders) ? seed.folders : [];

assert(notes.length === 7, `expected 7 notes, got ${notes.length}`);
assert(folders.length === 1, `expected 1 folder, got ${folders.length}`);

const KEYS = [
  'id',
  'title',
  'body',
  'tags',
  'pinned',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastDraftAt',
  'dailyDate',
];
notes.forEach((n, i) => {
  for (const k of KEYS) assert(k in n, `note ${i} missing key ${k}`);
  assert(typeof n.id === 'string' && n.id, `note ${i} bad id`);
  assert(typeof n.title === 'string' && n.title, `note ${i} bad title`);
  assert(typeof n.body === 'string' && n.body, `note ${i} bad body`);
  assert(Array.isArray(n.tags) && n.tags.every((t) => typeof t === 'string'), `note ${i} bad tags`);
  assert(typeof n.pinned === 'boolean', `note ${i} bad pinned`);
  assert(Number.isFinite(n.createdAt) && Number.isFinite(n.updatedAt), `note ${i} bad timestamps`);
  assert(n.deletedAt === null, `note ${i} deletedAt must be null`);
});

const FOLDER_KEYS = ['id', 'name', 'color', 'sortOrder', 'parentId', 'createdAt', 'updatedAt'];
const templatesFolder = folders[0] || {};
for (const k of FOLDER_KEYS) assert(k in templatesFolder, `folder missing key ${k}`);
assert(
  templatesFolder.name === 'Templates',
  `folder named ${JSON.stringify(templatesFolder.name)}, expected Templates`,
);
assert(templatesFolder.color === null && templatesFolder.parentId === null, 'folder must be a plain top-level folder');

const welcome = notes.find((n) => n.title === 'Welcome to Scratchpad');
const guide = notes.find((n) => n.title === 'Markdown Guide');
const daily = notes.find((n) => (n.tags || []).includes('daily'));
assert(!!welcome && welcome.pinned === true, 'Welcome must exist and be pinned');
assert(!!guide && guide.pinned === false, 'Markdown Guide must exist and be unpinned');
assert(!!daily, 'daily note must exist');
assert(daily && /^\d{4}-\d{2}-\d{2}$/.test(daily.dailyDate || ''), 'daily note needs YYYY-MM-DD dailyDate');
// dailyDate matches the local date of FIXED
const d = new Date(FIXED);
const expectKey =
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
assert(daily && daily.dailyDate === expectKey, `daily dailyDate ${daily && daily.dailyDate} != ${expectKey}`);
assert(!!welcome && /template/i.test(welcome.body), 'Welcome must point newcomers at the starter templates');

// Starter templates: four notes filed in the Templates folder. A note created
// from a template has an empty title and derives one from the body's first
// line, so each template opens with an H1 that matches its own title.
const TEMPLATE_TITLES = ['Decision record', 'Meeting notes', 'Project brief', 'Reading notes'];
const templates = notes.filter((n) => n.folderId === templatesFolder.id);
const tourNotes = notes.filter((n) => !n.folderId);
assert(templates.length === 4, `expected 4 notes filed in Templates, got ${templates.length}`);
assert(tourNotes.length === 3, `expected 3 unfiled tour notes, got ${tourNotes.length}`);
assert(
  JSON.stringify(templates.map((n) => n.title).sort()) === JSON.stringify(TEMPLATE_TITLES),
  `template titles ${JSON.stringify(templates.map((n) => n.title))} != ${JSON.stringify(TEMPLATE_TITLES)}`,
);
const oldestTour = Math.min(...tourNotes.map((n) => n.updatedAt), Infinity);
for (const n of templates) {
  const firstLine = n.body.split('\n').find((line) => line.trim());
  assert(
    firstLine === '# ' + n.title,
    `template "${n.title}" must open with "# ${n.title}", got ${JSON.stringify(firstLine)}`,
  );
  assert(n.pinned === false && n.dailyDate === null, `template "${n.title}" must be unpinned and not a daily note`);
  assert(
    n.tags.length > 0 && !n.tags.includes('template'),
    `template "${n.title}" needs inheritable tags, not "template"`,
  );
  assert(n.updatedAt < oldestTour, `template "${n.title}" must sort below the tour notes`);
}
assert(
  !notes.some((n) => n.title.trim().toLowerCase() === 'daily template'),
  'no seeded note may be titled Daily template',
);

// Wikilink resolution: every [[target]] (outside inline code) resolves to a seeded
// title, except the deliberate phantom "My First Note".
const titles = new Set(notes.map((n) => n.title.trim().toLowerCase()));
const targets = new Set();
for (const n of notes) {
  const noCode = n.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const m of noCode.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) targets.add(m[1].trim().toLowerCase());
}
const unresolved = [...targets].filter((t) => !titles.has(t));
assert(
  unresolved.length === 1 && unresolved[0] === 'my first note',
  `unexpected unresolved wikilinks: ${JSON.stringify(unresolved)}`,
);

// buildStarterTemplates is the palette action's source: the same four notes,
// filed in whichever folder it is handed.
const starters = typeof api.buildStarterTemplates === 'function' ? api.buildStarterTemplates(FIXED, 'f-tpl') : [];
assert(
  JSON.stringify(starters.map((n) => [n.title, n.folderId]).sort()) ===
    JSON.stringify(TEMPLATE_TITLES.map((title) => [title, 'f-tpl'])),
  `buildStarterTemplates gave ${JSON.stringify(starters.map((n) => [n.title, n.folderId]))}`,
);

// The first-run gate seeds once: never for a returning visitor (flag set), never
// into a database that already holds notes, and it fails open when storage throws.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
const gateWrites = [];
const gateDb = (rows) => ({
  getAll: async () => rows,
  bulkPutFolders: async () => gateWrites.push('folders'),
  bulkPut: async () => gateWrites.push('notes'),
});
const gate = typeof api.maybeSeedFirstRun === 'function' ? api.maybeSeedFirstRun : async () => 'missing';
const firstVisit = await gate(gateDb([]), FIXED);
const secondVisit = await gate(gateDb([]), FIXED);
store.clear();
const returningWithNotes = await gate(gateDb([{ id: 'x' }]), FIXED);
assert(
  firstVisit === true && gateWrites.join(',') === 'folders,notes',
  `first visit must seed once, got ${firstVisit} with ${gateWrites}`,
);
assert(secondVisit === false && gateWrites.length === 2, 'a visitor with the flag set must not be seeded again');
assert(returningWithNotes === false && gateWrites.length === 2, 'a database with notes must not be seeded');
assert(store.get('scratchpad-visited') === '1', 'the gate must set the visited flag even when it does not seed');

// seedFirstRun writes the folder first, then every note, through the db it is handed.
const writes = [];
const fakeDb = {
  bulkPutFolders: async (rows) => writes.push(['folders', rows.length]),
  bulkPut: async (rows) => writes.push(['notes', rows.length]),
};
if (typeof api.seedFirstRun === 'function') await api.seedFirstRun(fakeDb, FIXED);
assert(
  JSON.stringify(writes) ===
    JSON.stringify([
      ['folders', 1],
      ['notes', 7],
    ]),
  `seedFirstRun must write 1 folder then 7 notes, wrote ${JSON.stringify(writes)}`,
);

if (errs.length) {
  console.error('FAIL\n' + errs.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('PASS — 7 seed notes, 1 folder, contract + wikilinks OK');
