// Loads public/js/seed.js under a window shim and asserts the seed notes match
// the normalizeNote contract and that their wikilinks resolve among themselves
// (except the one intentional "My First Note" phantom).
import { readFileSync } from 'node:fs';

const win = {};
globalThis.window = win;
new Function('window', readFileSync('public/js/seed.js', 'utf8'))(win);

const errs = [];
const assert = (cond, msg) => { if (!cond) errs.push(msg); };

const FIXED = Date.parse('2026-07-18T12:00:00');
const notes = win.ScratchpadSeed.buildFirstRunNotes(FIXED);

assert(Array.isArray(notes) && notes.length === 3, `expected 3 notes, got ${notes && notes.length}`);

const KEYS = ['id', 'title', 'body', 'tags', 'pinned', 'createdAt', 'updatedAt', 'deletedAt', 'lastDraftAt', 'dailyDate'];
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

const welcome = notes.find((n) => n.title === 'Welcome to Scratchpad');
const guide = notes.find((n) => n.title === 'Markdown Guide');
const daily = notes.find((n) => (n.tags || []).includes('daily'));
assert(!!welcome && welcome.pinned === true, 'Welcome must exist and be pinned');
assert(!!guide && guide.pinned === false, 'Markdown Guide must exist and be unpinned');
assert(!!daily, 'daily note must exist');
assert(daily && /^\d{4}-\d{2}-\d{2}$/.test(daily.dailyDate || ''), 'daily note needs YYYY-MM-DD dailyDate');
// dailyDate matches the local date of FIXED
const d = new Date(FIXED);
const expectKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
assert(daily && daily.dailyDate === expectKey, `daily dailyDate ${daily && daily.dailyDate} != ${expectKey}`);

// Wikilink resolution: every [[target]] (outside inline code) resolves to a seeded
// title, except the deliberate phantom "My First Note".
const titles = new Set(notes.map((n) => n.title.trim().toLowerCase()));
const targets = new Set();
for (const n of notes) {
  const noCode = n.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const m of noCode.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) targets.add(m[1].trim().toLowerCase());
}
const unresolved = [...targets].filter((t) => !titles.has(t));
assert(unresolved.length === 1 && unresolved[0] === 'my first note',
  `unexpected unresolved wikilinks: ${JSON.stringify(unresolved)}`);

if (errs.length) { console.error('FAIL\n' + errs.map((e) => '  - ' + e).join('\n')); process.exit(1); }
console.log('PASS — 3 seed notes, contract + wikilinks OK');
