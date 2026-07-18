# First-run seed notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the first run, seed three starter notes (Welcome, Markdown Guide, today's daily note) so a new user lands in a populated, self-explanatory app.

**Architecture:** A new self-contained `public/js/seed.js` module builds the three note records. The existing first-run gate in `app.js` (`maybeRedirectFirstRun`) persists them via `DB.bulkPut` right before it redirects to `about.html`, so they're waiting when the user returns.

**Tech Stack:** Vanilla JS (no build step), IndexedDB via `window.ScratchpadDB`, Playwright for browser tests, plain `node` for a content-contract check.

## Global Constraints

- No third-party scripts/fonts/trackers; everything same-origin. `seed.js` is a same-origin external script — allowed by CSP `script-src 'self'` (verified). No CSP hash change (hashes are only for inline scripts).
- Note record shape must match `normalizeNote`: `{ id, title, body, tags, pinned, createdAt, updatedAt, deletedAt, lastDraftAt, dailyDate }`.
- `dailyDate` format is local `YYYY-MM-DD`; daily-note title mirrors `createDailyNote()`: `toLocaleDateString([], { weekday:'short', month:'short', day:'numeric', year:'numeric' })`.
- Seeding must reuse the existing gate (`!scratchpad-visited && noteCount === 0`) — no new flag. It must fail open (never block boot) and never re-seed a user who deleted all notes.
- Note bodies are authored as arrays of double-quoted line strings joined by `"\n"` — NOT backtick template literals, because the Markdown Guide contains ``` fences and a literal `${name}` that a JS template literal would mis-parse.
- `deploy.sh` ships `public/**` automatically; `public/js/seed.js` needs no deploy change.

---

### Task 1: `seed.js` content module + node contract check

**Files:**
- Create: `public/js/seed.js`
- Create: `scripts/check-seed-notes.mjs`

**Interfaces:**
- Produces: `window.ScratchpadSeed.buildFirstRunNotes(now?: number) => Note[]` where `Note = { id, title, body, tags, pinned, createdAt, updatedAt, deletedAt, lastDraftAt, dailyDate }`. Returns exactly 3 notes: `[Welcome (pinned), Markdown Guide, today's daily note]`. `now` is epoch ms; defaults to `Date.now()`.

- [ ] **Step 1: Write the failing contract check**

Create `scripts/check-seed-notes.mjs`:

```js
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
  const noCode = n.body.replace(/`[^`]*`/g, '').replace(/```[\s\S]*?```/g, '');
  for (const m of noCode.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) targets.add(m[1].trim().toLowerCase());
}
const unresolved = [...targets].filter((t) => !titles.has(t));
assert(unresolved.length === 1 && unresolved[0] === 'my first note',
  `unexpected unresolved wikilinks: ${JSON.stringify(unresolved)}`);

if (errs.length) { console.error('FAIL\n' + errs.map((e) => '  - ' + e).join('\n')); process.exit(1); }
console.log('PASS — 3 seed notes, contract + wikilinks OK');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-seed-notes.mjs`
Expected: FAIL — `Cannot find module 'public/js/seed.js'` / ENOENT (file not created yet).

- [ ] **Step 3: Create `public/js/seed.js`**

```js
/* Scratchpad first-run seed notes. Exposes window.ScratchpadSeed.
   Bodies are arrays of lines joined by "\n" (not template literals) so the
   Markdown Guide's ``` fences and literal ${...} survive intact. */
(function () {
  'use strict';

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function dayKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  const WELCOME_BODY = [
    "# Welcome to Scratchpad",
    "",
    "This is a **privacy-first, local-only** notes app. Everything you write lives in *this browser* — no account, no sync, no servers. To prove it, open your browser's network tab: after the page loads, Scratchpad makes **zero** network calls.",
    "",
    "These three starter notes are a quick tour. Edit them, delete them, make the place yours.",
    "",
    "## Try these",
    "",
    "- [x] Read this welcome note",
    "- [ ] Open the [[Markdown Guide]] to see every formatting trick",
    "- [ ] Press `Cmd/Ctrl + K` for the command palette",
    "- [ ] Jump to **today's note** from the palette (search \"today\") — a fresh page each day",
    "- [ ] Star a note to pin it to the top",
    "- [ ] Export a backup from the ⋯ menu",
    "",
    "## Linking notes together",
    "",
    "Wrap a note's title in double brackets to link to it, like [[Markdown Guide]]. Link to a title that doesn't exist yet and it renders as a **dashed** link — click [[My First Note]] and Scratchpad offers to create it. That's how a web of notes grows.",
    "",
    "> Everything here is yours and stays on this device. Read more any time on the [About page](about.html).",
    "",
  ].join("\n");

  const MARKDOWN_GUIDE_BODY = [
    "# Markdown Guide",
    "",
    "Scratchpad renders standard (GitHub-flavored) Markdown, and the output is sanitized — so pasting from anywhere is safe.",
    "",
    "## Text styling",
    "",
    "Write **bold**, *italic*, ***both***, ~~strikethrough~~, and `inline code`. Break sections with a horizontal rule:",
    "",
    "---",
    "",
    "## Lists",
    "",
    "Nested unordered lists:",
    "",
    "- Groceries",
    "  - Coffee",
    "  - Oat milk",
    "- Errands",
    "  - Post office",
    "",
    "Ordered lists:",
    "",
    "1. First",
    "2. Second",
    "3. Third",
    "",
    "Task lists are **interactive** — toggle the boxes right in the rendered note:",
    "",
    "- [x] Ship the thing",
    "- [x] Tell everyone",
    "- [ ] Rest",
    "",
    "## Quotes",
    "",
    "> \"The palest ink is better than the best memory.\"",
    "",
    "## Code",
    "",
    "Inline `const x = 42;`, or fenced blocks with a language hint:",
    "",
    "```js",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
    "}",
    "```",
    "",
    "```python",
    "def total(items):",
    "    return sum(i.price for i in items)",
    "```",
    "",
    "## Tables",
    "",
    "| Feature | Supported | Notes |",
    "| --- | :---: | --- |",
    "| Headings | yes | `#` through `######` |",
    "| Tables | yes | like this one |",
    "| Task lists | yes | click to toggle |",
    "| Wikilinks | yes | `[[Note Title]]` |",
    "",
    "## Links",
    "",
    "- External links open in a new tab: [Inkwell design system](https://github.com/vscarpenter/inkwell)",
    "- Internal links use double brackets: [[Welcome to Scratchpad]]",
    "- And you can alias them: [[Welcome to Scratchpad|the welcome note]]",
    "",
    "That's the whole toolbox. Back to [[Welcome to Scratchpad]].",
    "",
  ].join("\n");

  const DAILY_BODY = [
    "## Tasks",
    "",
    "- [x] Skim the [[Welcome to Scratchpad]] note",
    "- [ ] Try creating a note of my own",
    "- [ ] Pin the notes I want to keep handy",
    "",
    "## Notes",
    "",
    "This is today's **daily note** — Scratchpad gives you a fresh one each day, so you always have a place for the day's thoughts. Open tomorrow's from the command palette (search \"today\").",
    "",
  ].join("\n");

  // Returns the three first-run notes. `now` (epoch ms) is stamped so ordering is
  // deterministic: Welcome (pinned) newest, then Markdown Guide, then the daily note.
  function buildFirstRunNotes(now) {
    const t = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    const today = new Date(t);
    return [
      {
        id: uuid(),
        title: 'Welcome to Scratchpad',
        body: WELCOME_BODY,
        tags: ['getting-started', 'welcome'],
        pinned: true,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        lastDraftAt: null,
        dailyDate: null,
      },
      {
        id: uuid(),
        title: 'Markdown Guide',
        body: MARKDOWN_GUIDE_BODY,
        tags: ['reference', 'markdown'],
        pinned: false,
        createdAt: t,
        updatedAt: t - 1000,
        deletedAt: null,
        lastDraftAt: null,
        dailyDate: null,
      },
      {
        id: uuid(),
        title: today.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        body: DAILY_BODY,
        tags: ['daily'],
        pinned: false,
        createdAt: t,
        updatedAt: t - 2000,
        deletedAt: null,
        lastDraftAt: null,
        dailyDate: dayKey(today),
      },
    ];
  }

  window.ScratchpadSeed = { buildFirstRunNotes };
})();
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `node scripts/check-seed-notes.mjs`
Expected: PASS — `PASS — 3 seed notes, contract + wikilinks OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/seed.js scripts/check-seed-notes.mjs
git commit -m "feat(onboarding): add first-run seed-notes module"
```

---

### Task 2: Wire seeding into first-run + Playwright tests

**Files:**
- Modify: `index.html` (add `<script src="public/js/seed.js"></script>` before `public/js/app.js`)
- Modify: `public/js/app.js` (`maybeRedirectFirstRun`, ~line 4200-4210)
- Test: `tests/first-run.spec.js`

**Interfaces:**
- Consumes: `window.ScratchpadSeed.buildFirstRunNotes(now)` (Task 1), `DB.bulkPut(notes)`, `now()` (existing in app.js).

- [ ] **Step 1: Write the failing Playwright tests**

Append to `tests/first-run.spec.js` (inside the existing `test.describe('first-run redirect', ...)` block, before its closing `});`):

```js
  test('first run seeds the three starter notes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/about\.html$/);

    // Return to the app: flag is set now, so no second redirect.
    await page.goto('/index.html');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);

    const summary = await page.evaluate(async () => {
      const notes = await window.ScratchpadDB.getAll();
      const d = new Date();
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return {
        count: notes.length,
        titles: notes.map((n) => n.title),
        pinned: notes.filter((n) => n.pinned).map((n) => n.title),
        dailyToday: notes.filter((n) => n.dailyDate === key).length,
      };
    });
    expect(summary.count).toBe(3);
    expect(summary.titles).toContain('Welcome to Scratchpad');
    expect(summary.titles).toContain('Markdown Guide');
    expect(summary.pinned).toEqual(['Welcome to Scratchpad']);
    expect(summary.dailyToday).toBe(1);
  });

  test('seeded Welcome resolves its Markdown Guide link and keeps the phantom', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/about\.html$/);
    await page.goto('/index.html');
    await expect(page.locator('#app-shell')).toBeVisible();

    await page.locator('.note-row', { hasText: 'Welcome to Scratchpad' }).click();
    const rendered = page.locator('#note-rendered');
    // Real link to an existing note (not phantom):
    const guideLink = rendered.locator('a.wikilink:not(.is-phantom)', { hasText: 'Markdown Guide' });
    await expect(guideLink.first()).toBeVisible();
    // The one intentional phantom:
    await expect(rendered.locator('a.wikilink.is-phantom', { hasText: 'My First Note' })).toBeVisible();
  });

  test('does not seed a returning visitor who has zero notes', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('scratchpad-visited', '1'); });
    await page.goto('/');
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.waitForFunction(() => !!window.ScratchpadDB);
    const count = await page.evaluate(async () => (await window.ScratchpadDB.getAll()).length);
    expect(count).toBe(0);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx playwright test first-run --project=chromium`
Expected: the two seeding tests FAIL (no notes seeded → `count` is 0, Welcome row not found); the zero-notes test PASSES already.

- [ ] **Step 3: Add the seed script tag to `index.html`**

Modify the script block (currently lines ~703-707) to insert `seed.js` immediately before `app.js`:

```html
  <script src="public/js/db.js"></script>
  <script src="public/js/version.js"></script>
  <script src="public/js/markdown.js"></script>
  <script src="public/js/zip.js"></script>
  <script src="public/js/seed.js"></script>
  <script src="public/js/app.js"></script>
```

- [ ] **Step 4: Seed inside the first-run gate in `public/js/app.js`**

Replace the `if (count === 0) { ... }` block in `maybeRedirectFirstRun` (around lines 4206-4209):

```js
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
```

Also update the function's leading comment to note that it seeds starter notes before redirecting.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test first-run --project=chromium`
Expected: all first-run tests PASS.

- [ ] **Step 6: Run the broader suite to check for regressions**

Run: `npx playwright test first-run network-isolation wikilinks daily-note --project=chromium`
Expected: PASS (adding a same-origin script must not break network-isolation; seeded wikilinks/daily behave).

- [ ] **Step 7: Commit**

```bash
git add index.html public/js/app.js tests/first-run.spec.js
git commit -m "feat(onboarding): seed starter notes on first run"
```

---

## Self-Review

**Spec coverage:**
- Seed 3 notes on first run → Task 1 (module) + Task 2 (wiring). ✓
- Reuse existing gate, no new flag, fail open → Task 2 Step 4. ✓
- Welcome pinned, Markdown Guide, today-dated daily → Task 1 content + check. ✓
- Option-A link adaptation (all resolve except one labeled phantom) → Task 1 content + check assertion + Task 2 render test. ✓
- `seed.js` script tag, no CSP change, deploy via public/** → Task 2 Step 3; Global Constraints. ✓
- Tests: fresh→redirect+seed, return→no dup, deleted-all→empty, wikilink resolves → Task 2 tests. ✓

**Placeholder scan:** none — all code and commands are concrete.

**Type consistency:** `buildFirstRunNotes(now)` signature and the 10-key note shape are identical across the module, the node check, and the app.js call site. `dailyDate` key computation matches between `seed.js` `dayKey`, the node check, and the Playwright test.
