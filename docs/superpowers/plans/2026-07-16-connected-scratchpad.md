# Connected Scratchpad (v3.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship interactive task lists, a daily note with quick capture, and wikilinks with backlinks — three additive features per `docs/superpowers/specs/2026-07-16-connected-scratchpad-design.md`.

**Architecture:** Rendering changes live in `public/js/markdown.js` (marked v18 renderer/tokenizer extensions whose output passes the existing frozen DOMPurify config untouched). Interaction and state live in new banner-comment sections of `public/js/app.js`, funneled through one new programmatic save path `mutateNoteBody`. One additive note field (`dailyDate`) in the `normalizeNote` allowlist; no IndexedDB migration.

**Tech Stack:** Vanilla JS IIFE modules on `window`, marked v18 + DOMPurify (vendored), Playwright e2e (`tests/*.spec.js`, CommonJS), no build step.

## Global Constraints

- Zero network calls after page load; no third-party scripts; vendored libs only.
- `SANITIZE_CONFIG` in `markdown.js` must not change: `FORBID_TAGS` keeps `input`, `ALLOW_DATA_ATTR` stays `false`.
- `DB_VERSION` stays `2` in `db.js`. Never touch `db.js` in this plan.
- All colors via `var(--token)` in `app.css`; no hex codes; no emoji in source; icons are inline SVG strokes.
- Never set `innerHTML` from note content — rendering goes through `Markdown.renderMarkdownInto` (DOMPurify `RETURN_DOM_FRAGMENT`); clear containers with `replaceChildren()`.
- No new inline `<script>` in any HTML page (would require CSP hash recompute).
- Run tests with `bunx playwright test <file> --project=chromium` while iterating; full cross-browser `bun run test` at the end of each task. Playwright starts its own server (config `webServer`).
- Commits follow the user's convention: Conventional Commits with scope, author `Vinny Carpenter <vscarpenter@gmail.com>`, trailer `Claude-Session: <session URL>`, no `Co-Authored-By: Claude` footer (see `creating-git-commits` skill).
- Deploy is out of scope. Never run `./deploy.sh` (dry-run only if needed).

## File Structure

| File | Role in this plan |
|---|---|
| `public/js/markdown.js` | checkbox renderer override; `findTaskMarkers`; wikilink tokenizer + `setWikilinkResolver`; `extractWikilinkTargets`; `hardenLinks` fragment fix |
| `public/js/app.js` | `dailyDate` in `normalizeNote`; `mutateNoteBody`; task-toggle handlers; daily note + quick capture; `?action=` boot handling; wikilink navigation, backlinks, rename rewrite, autocomplete |
| `index.html` | Today button, quick-capture dialog, link-rename dialog, backlinks section, autocomplete panel |
| `public/css/app.css` | `.task-checkbox`, `.wikilink`, `.backlinks`, `.wikilink-suggest` styles (tokens only) |
| `public/manifest.webmanifest` | `shortcuts` array |
| `tests/helpers.js` | `seedRawNotes` passes `dailyDate` through |
| `tests/task-lists.spec.js`, `tests/daily-note.spec.js`, `tests/wikilinks.spec.js` | new e2e coverage |
| `public/js/version.js`, `README.md`, `about.html` | release bump + docs |

**Existing primitives to reuse (do not reinvent):** `el(tag, options)`, `toast(message, opts)`, `withBusy(key, controls, errorMessage, work)`, `openDialog`/`closeDialog`/`bindDialogClosers` (`data-dialog-close`), `putNoteRecord(note, changeType)`, `storeRevision(note)`, `nextUpdatedAt(note)`, `normalizeNote(n)`, `deriveTitle(note)`, `isTrashed(note)`, `sortNotes(list)`, `getNote(id)`, `openNoteFromCommand(id)`, `confirmDiscard()`, `discardCurrentDraft()`, `normalizeSearchText(text)`, `renderAll()`, `renderEditor()`, `syncMobileView()`.

**Service worker note (verify, don't change):** `public/service-worker.js` navigate handler already matches by `url.pathname`, so `/?action=today` serves the cached shell offline. No SW edit in this plan.

---

### Task 1: `dailyDate` survives normalize, save, and both import paths

**Files:**
- Modify: `public/js/app.js:621-634` (`normalizeNote`), `public/js/app.js:2720-2733` (`noteToMarkdown`), `public/js/app.js:2844-2854` (`parseMarkdownNote`)
- Modify: `tests/helpers.js:37-56` (`seedRawNotes`)
- Test: `tests/daily-note.spec.js` (created here)

**Interfaces:**
- Produces: notes may carry `dailyDate: 'YYYY-MM-DD' | null`. Later tasks rely on `normalizeNote` preserving it and on `seedRawNotes` seeding it.

- [ ] **Step 1: Update `seedRawNotes` in `tests/helpers.js` to pass `dailyDate` through**

In the `notes` mapping inside `seedRawNotes`, after the `lastDraftAt` line add:

```js
      dailyDate: typeof note.dailyDate === 'string' ? note.dailyDate : null,
```

- [ ] **Step 2: Write the failing test**

Create `tests/daily-note.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes } = require('./helpers');

test.describe('dailyDate field', () => {
  test('survives an edit-and-save round trip', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'daily-1', title: 'My day', body: 'original', dailyDate: '2026-07-16' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('edited body');
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toBeHidden();
    const stored = await page.evaluate(() => window.ScratchpadDB.get('daily-1'));
    expect(stored.dailyDate).toBe('2026-07-16');
    expect(stored.body).toBe('edited body');
  });

  test('markdown export/import round-trips dailyDate', async ({ page }) => {
    await gotoApp(page);
    const parsed = await page.evaluate(() => {
      // parseMarkdownNote is internal; exercise via import file path in later
      // steps. Here assert normalizeNote keeps the field on a DB round trip.
      return window.ScratchpadDB.put({
        id: 'roundtrip-1', title: 'T', body: 'B', tags: [], pinned: false,
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null,
        lastDraftAt: null, dailyDate: '2026-01-02',
      }).then(() => window.ScratchpadDB.get('roundtrip-1'));
    });
    expect(parsed.dailyDate).toBe('2026-01-02');
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    // After reload, loadAll() ran the note through normalizeNote.
    await page.locator('.note-row', { hasText: 'T' }).click();
    await page.locator('#edit-btn').click();
    await page.locator('#save-btn').click();
    const after = await page.evaluate(() => window.ScratchpadDB.get('roundtrip-1'));
    expect(after.dailyDate).toBe('2026-01-02');
  });
});
```

- [ ] **Step 3: Run to verify the first test fails**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: FAIL — `stored.dailyDate` is `undefined` (saveCurrent's `baseNote = normalizeNote(latestRaw)` drops the field today).

- [ ] **Step 4: Add `dailyDate` to `normalizeNote`**

In `public/js/app.js` `normalizeNote`, after the `lastDraftAt` line add:

```js
      dailyDate: typeof n.dailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.dailyDate) ? n.dailyDate : null,
```

- [ ] **Step 5: Add `dailyDate` to Markdown export frontmatter**

Replace the `lines` array literal in `noteToMarkdown` with:

```js
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
```

- [ ] **Step 6: Accept `dailyDate` in Markdown import**

In `parseMarkdownNote`, inside the object passed to `normalizeNote`, after `lastDraftAt: null,` add:

```js
      dailyDate: typeof metadata.dailyDate === 'string' ? metadata.dailyDate : null,
```

(`normalizeNote` enforces the `YYYY-MM-DD` shape; JSON import already funnels through `validateImportNote` → `normalizeNote`, so it needs no change.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: PASS (both tests)

- [ ] **Step 8: Full-suite sanity for regressions, then commit**

Run: `bunx playwright test tests/notes-crud.spec.js tests/import.spec.js tests/markdown-import.spec.js --project=chromium`
Expected: PASS

```bash
git add public/js/app.js tests/helpers.js tests/daily-note.spec.js
git commit -m "feat(notes): add additive dailyDate field to the note shape"
```
(Include the standard `Claude-Session:` trailer; same for every commit below.)

---

### Task 2: task checkboxes render as accessible spans (inert)

**Files:**
- Modify: `public/js/markdown.js` (renderer override, registered next to the existing `setOptions` call)
- Modify: `public/css/app.css` (`.task-checkbox` styles)
- Test: `tests/task-lists.spec.js` (created here)

**Interfaces:**
- Produces: rendered task items contain `span.task-checkbox[role="checkbox"][aria-checked][tabindex="0"]`. Task 4 binds interaction to these spans by document order.

- [ ] **Step 1: Write the failing test**

Create `tests/task-lists.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, createAndSaveNote } = require('./helpers');

test.describe('task list rendering', () => {
  test('renders GFM task items as span checkboxes, never inputs', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'tasks-1', title: 'Todos', body: '- [ ] first\n- [x] second' },
    ]);
    await page.locator('.note-row').first().click();
    const rendered = page.locator('#note-rendered');
    await expect(rendered.locator('.task-checkbox')).toHaveCount(2);
    await expect(rendered.locator('.task-checkbox').first()).toHaveAttribute('aria-checked', 'false');
    await expect(rendered.locator('.task-checkbox').nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(rendered.locator('input')).toHaveCount(0);
    await expect(rendered.locator('.task-checkbox').first()).toHaveAttribute('role', 'checkbox');
    await expect(rendered.locator('.task-checkbox').first()).toHaveAttribute('tabindex', '0');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx playwright test tests/task-lists.spec.js --project=chromium`
Expected: FAIL — `.task-checkbox` count is 0 (marked emits `<input>`, DOMPurify strips it).

- [ ] **Step 3: Override the checkbox renderer in `markdown.js`**

Replace the existing `setOptions` block:

```js
  if (window.marked && typeof window.marked.setOptions === 'function') {
    window.marked.setOptions({ breaks: false, gfm: true });
  }
```

with:

```js
  if (window.marked && typeof window.marked.setOptions === 'function') {
    window.marked.setOptions({ breaks: false, gfm: true });
  }

  // GFM task-list checkboxes render as spans so the DOMPurify policy can keep
  // forbidding <input>. App code makes them interactive in view mode; without
  // it they are inert, which is the safe default.
  if (window.marked && typeof window.marked.use === 'function') {
    window.marked.use({
      renderer: {
        checkbox({ checked }) {
          return '<span class="task-checkbox" role="checkbox" tabindex="0" aria-checked="' +
            (checked ? 'true' : 'false') + '"></span>';
        },
      },
    });
  }
```

- [ ] **Step 4: Style the checkbox in `app.css` (tokens only)**

Add at the end of the markdown/rendered-note styles region:

```css
/* Task-list checkboxes (rendered as spans; see markdown.js) */
.note-rendered .task-checkbox {
  display: inline-block;
  width: 1.05em;
  height: 1.05em;
  margin-right: 0.45em;
  vertical-align: -0.15em;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--control-fill);
  cursor: pointer;
  position: relative;
}
.note-rendered .task-checkbox[aria-checked="true"] {
  background: var(--accent);
  border-color: var(--accent);
}
.note-rendered .task-checkbox[aria-checked="true"]::after {
  content: "";
  position: absolute;
  left: 0.28em;
  top: 0.08em;
  width: 0.3em;
  height: 0.6em;
  border: solid var(--paper);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.note-rendered .task-checkbox:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.note-rendered .task-checkbox[aria-disabled="true"] {
  cursor: default;
  opacity: 0.6;
}
.note-rendered li:has(> .task-checkbox) {
  list-style: none;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx playwright test tests/task-lists.spec.js --project=chromium`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/markdown.js public/css/app.css tests/task-lists.spec.js
git commit -m "feat(tasks): render GFM task checkboxes as sanitizer-safe spans"
```

---

### Task 3: task-marker source scanner (pure, exported for tests)

**Files:**
- Modify: `public/js/markdown.js` (add `scanOutsideFences`, `findTaskMarkers`; export on `window.ScratchpadMarkdown`)
- Test: `tests/task-lists.spec.js` (extend)

**Interfaces:**
- Produces: `ScratchpadMarkdown.findTaskMarkers(src)` → `[{ offset, checked }]` where `offset` indexes the state char inside `[ ]`/`[x]`. Also internal helper `scanOutsideFences(src, cb)` reused by Task 10's `extractWikilinkTargets`.

- [ ] **Step 1: Write the failing test (scanner battery)**

Append to `tests/task-lists.spec.js`:

```js
test.describe('task marker scanner', () => {
  test('matches rendered checkboxes and skips fenced code', async ({ page }) => {
    await gotoApp(page);
    const results = await page.evaluate(() => {
      const scan = (src) => window.ScratchpadMarkdown.findTaskMarkers(src);
      return {
        simple: scan('- [ ] a\n- [x] b'),
        nested: scan('- top\n  - [ ] nested'),
        quoted: scan('> - [ ] quoted'),
        ordered: scan('1. [x] ordered'),
        fenced: scan('```\n- [ ] not a task\n```\n- [ ] real'),
        tilde: scan('~~~\n- [ ] hidden\n~~~'),
        notTask: scan('- [link](https://x) text'),
      };
    });
    expect(results.simple.length).toBe(2);
    expect(results.simple[0].checked).toBe(false);
    expect(results.simple[1].checked).toBe(true);
    expect(results.nested.length).toBe(1);
    expect(results.quoted.length).toBe(1);
    expect(results.ordered.length).toBe(1);
    expect(results.fenced.length).toBe(1);
    expect(results.tilde.length).toBe(0);
    expect(results.notTask.length).toBe(0);
    // Offsets point at the state character: flipping it changes the marker.
    const src = '- [ ] a\n- [x] b';
    const offsets = results.simple.map((m) => m.offset);
    expect(src.charAt(offsets[0])).toBe(' ');
    expect(src.charAt(offsets[1])).toBe('x');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx playwright test tests/task-lists.spec.js --project=chromium`
Expected: FAIL — `findTaskMarkers is not a function`.

- [ ] **Step 3: Implement the scanner in `markdown.js`**

Add above `renderMarkdownInto`:

```js
  // Walks src line by line, invoking cb(line, offset) only for lines outside
  // fenced code blocks. Fence state tracks the opening marker char so ``` and
  // ~~~ cannot close each other.
  function scanOutsideFences(src, cb) {
    const lines = String(src || '').split('\n');
    let offset = 0;
    let fence = null;
    for (const line of lines) {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        if (!fence) fence = fenceMatch[1][0];
        else if (fenceMatch[1][0] === fence) fence = null;
      } else if (!fence) {
        cb(line, offset);
      }
      offset += line.length + 1;
    }
  }

  const TASK_MARKER_LINE = /^(?:\s*(?:>\s*)*)(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s/;

  // Returns [{ offset, checked }] for every GFM task marker in document order.
  // offset indexes the state character inside the brackets, so a toggle is a
  // one-character replacement. Mirrors what marked renders closely enough that
  // a count mismatch signals "do not toggle" (see syncTaskCheckboxes).
  function findTaskMarkers(src) {
    const markers = [];
    scanOutsideFences(src, (line, offset) => {
      const m = line.match(TASK_MARKER_LINE);
      // m[0] ends with `[<state>]` plus one whitespace char, so the state
      // character sits three characters back from the match end.
      if (m) markers.push({ offset: offset + m[0].length - 3, checked: m[1] !== ' ' });
    });
    return markers;
  }
```

Export both on the bottom object:

```js
  window.ScratchpadMarkdown = {
    sanitizeConfig: SANITIZE_CONFIG,
    renderMarkdownInto,
    renderEmptyBody,
    findTaskMarkers,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx playwright test tests/task-lists.spec.js --project=chromium`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/markdown.js tests/task-lists.spec.js
git commit -m "feat(tasks): add fence-aware task marker scanner"
```

---

### Task 4: click-to-toggle via `mutateNoteBody` with revision coalescing

**Files:**
- Modify: `public/js/app.js` — new `// -------- Programmatic note mutations --------` section after the Drafts section (~line 1976); new `// -------- Task toggles --------` section after it; hook into `renderEditor` (~line 1097) and `bindEvents` (~line 3349)
- Test: `tests/task-lists.spec.js` (extend)

**Interfaces:**
- Consumes: `ScratchpadMarkdown.findTaskMarkers(src)` (Task 3).
- Produces: `mutateNoteBody(noteId, transform, opts)` → `Promise<note|null>`; `opts.coalesceToggles: boolean`. Reused by Tasks 6 (capture) and 11 (rename rewrite). Also `syncTaskCheckboxes(note)` called from `renderEditor`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/task-lists.spec.js`:

```js
test.describe('task toggling', () => {
  test('click toggles the marker and persists across reload', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'toggle-1', title: 'Todos', body: '- [ ] first\n- [x] second' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#note-rendered .task-checkbox').first().click();
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.locator('.note-row').first().click();
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
    const stored = await page.evaluate(() => window.ScratchpadDB.get('toggle-1'));
    expect(stored.body).toBe('- [x] first\n- [x] second');
  });

  test('rapid toggles coalesce into a single revision', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'toggle-2', title: 'Todos', body: '- [ ] only' },
    ]);
    await page.locator('.note-row').first().click();
    const box = page.locator('#note-rendered .task-checkbox').first();
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    const revisions = await page.evaluate(() => window.ScratchpadDB.getRevisions('toggle-2'));
    expect(revisions.length).toBe(1);
  });

  test('count mismatch renders checkboxes inert', async ({ page }) => {
    // A 4-space-indented line at DOCUMENT START (no list before it) is an
    // indented code block to marked — no checkbox rendered — but the line
    // scanner counts it: 1 rendered vs 2 scanned -> every checkbox goes
    // inert rather than guess the mapping. (Order matters: after a list,
    // marked would parse the indented line as a nested task item.)
    await seedRawNotes(page, [
      { id: 'toggle-3', title: 'Odd', body: '    - [ ] looks like code\n\n- [ ] real' },
    ]);
    await page.locator('.note-row').first().click();
    const box = page.locator('#note-rendered .task-checkbox').first();
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await box.click({ force: true });
    const stored = await page.evaluate(() => window.ScratchpadDB.get('toggle-3'));
    expect(stored.body).toContain('- [ ] real');
  });

  test('keyboard Space toggles', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'toggle-4', title: 'Todos', body: '- [ ] kb' },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#note-rendered .task-checkbox').first().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#note-rendered .task-checkbox').first()).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/task-lists.spec.js --project=chromium`
Expected: the four new tests FAIL (clicks do nothing; no `aria-disabled`).

- [ ] **Step 3: Implement `mutateNoteBody` and toggle handling in `app.js`**

Add after the Dialogs section helpers (`bindDialogClosers`), a new section:

```js
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

  function onRenderedClick(e) {
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
```

- [ ] **Step 4: Wire rendering and events**

In `renderEditor`, immediately after the `Markdown.renderMarkdownInto(els.rendered, note.body || '');` line add:

```js
        syncTaskCheckboxes(note);
```

In `bindEvents`, after `els.editor.addEventListener('input', markDirty);` add:

```js
    els.rendered.addEventListener('click', onRenderedClick);
    els.rendered.addEventListener('keydown', onRenderedKey);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx playwright test tests/task-lists.spec.js --project=chromium`
Expected: PASS (all)

- [ ] **Step 6: Full suite for the feature, then commit**

Run: `bunx playwright test tests/task-lists.spec.js tests/revision-history.spec.js tests/cross-tab-conflicts.spec.js --project=chromium`
Expected: PASS

```bash
git add public/js/app.js tests/task-lists.spec.js
git commit -m "feat(tasks): make rendered task checkboxes toggle the source"
```

---

### Task 5: daily note — find/create, palette command, Today button, shortcut

**Files:**
- Modify: `public/js/app.js` — new `// -------- Daily note --------` section after the Task toggles section; `commandDefinitions()` (~line 2270); `onGlobalKey` (~line 3516); `bindEvents`; `els` map
- Modify: `index.html:93` (Today button in `.sidebar-actions`)
- Test: `tests/daily-note.spec.js` (extend)

**Interfaces:**
- Consumes: `mutateNoteBody` (Task 4), `dailyDate` (Task 1).
- Produces: `todayKey()` → `'YYYY-MM-DD'` (local); `findDailyNote(key)` → note|null; `createDailyNote()` → `Promise<note|null>` (creates, no navigation); `openTodayNote()` → `Promise<note|null>` (find-or-create + navigate). Task 6 reuses `findDailyNote`/`createDailyNote`; Task 7 reuses `openTodayNote`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/daily-note.spec.js`:

```js
test.describe('daily note', () => {
  test('palette command creates today note with defaults, reuses on repeat', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('today');
    await page.locator('.command-palette-item', { hasText: "Open today's note" }).click();
    await expect(page.locator('#note-rendered')).toBeVisible();
    const first = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    expect(first.dailyDate).toBe(key);
    expect(first.tags).toContain('daily');
    expect(first.body).toBe('## Tasks\n\n## Notes\n');
    // Second invocation reuses the same note.
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('today');
    await page.locator('.command-palette-item', { hasText: "Open today's note" }).click();
    const count = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.filter((n) => n.dailyDate).length;
    });
    expect(count).toBe(1);
  });

  test('Daily template note seeds the body; renamed daily note still found', async ({ page }) => {
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await seedRawNotes(page, [
      { id: 'tpl-1', title: 'Daily template', body: '## Agenda\n\n## Log\n' },
      { id: 'day-old', title: 'Renamed by hand', body: 'existing', dailyDate: key },
    ]);
    // Existing daily note wins even though its title was renamed.
    await page.locator('#today-note').click();
    await expect(page.locator('#note-title-display')).toHaveText('Renamed by hand');
    // Erase it, then creation should use the template body.
    await page.evaluate(() => window.ScratchpadDB.remove('day-old'));
    await page.reload();
    await expect(page.locator('#app-shell')).toBeVisible();
    await page.locator('#today-note').click();
    const created = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(created.body).toBe('## Agenda\n\n## Log\n');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: the two new tests FAIL (no palette entry, no `#today-note` button).

- [ ] **Step 3: Add the Today button to `index.html`**

In `.sidebar-actions`, after the `#bulk-toggle` button:

```html
          <button id="today-note" class="btn btn-ghost" type="button" aria-label="Open today's note" title="Open today's note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/><path d="M12 15h.01"/></svg>
          </button>
```

Add to the `els` map in `app.js` (after `newNote`):

```js
    todayNote: $('today-note'),
```

- [ ] **Step 4: Implement the daily-note section in `app.js`**

Add after the Task toggles section:

```js
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
```

- [ ] **Step 5: Wire palette, button, and shortcut**

In `commandDefinitions()`, after the `new-note` entry add:

```js
      {
        id: 'today-note',
        label: "Open today's note",
        meta: 'Daily note — created on first use',
        keywords: 'today daily journal log',
        run: openTodayNote,
      },
```

In `bindEvents`, after `els.newNote.addEventListener('click', createNote);` add:

```js
    els.todayNote.addEventListener('click', openTodayNote);
```

In `onGlobalKey`, after the `meta && (e.key === 'n' ...)` block add:

```js
    if (meta && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      openTodayNote();
      return;
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: PASS (all)

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js index.html tests/daily-note.spec.js
git commit -m "feat(daily): add find-or-create daily note with template support"
```

---

### Task 6: quick capture dialog

**Files:**
- Modify: `index.html` (dialog markup near `#share-dialog`), `public/js/app.js` (`els` map, `// -------- Quick capture --------` section, palette entry, `bindEvents`), `public/css/app.css` (minor)
- Test: `tests/daily-note.spec.js` (extend)

**Interfaces:**
- Consumes: `findDailyNote`/`createDailyNote`/`todayKey` (Task 5), `mutateNoteBody` (Task 4).
- Produces: `openQuickCapture()` — reused by Task 7's `?action=capture`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/daily-note.spec.js`:

```js
test.describe('quick capture', () => {
  test('captures into today note, creating it when needed', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('capture');
    await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
    await page.locator('#quick-capture-input').fill('remember the milk');
    await page.keyboard.press('Enter');
    const note = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(note.body).toMatch(/- \*\*\d{2}:\d{2}\*\* remember the milk\n$/);
    // Second capture appends to the same note.
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('capture');
    await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
    await page.locator('#quick-capture-input').fill('second thought');
    await page.keyboard.press('Enter');
    const after = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.filter((n) => n.dailyDate);
    });
    expect(after.length).toBe(1);
    expect(after[0].body).toContain('remember the milk');
    expect(after[0].body).toMatch(/second thought\n$/);
  });

  test('capture while editing today note appends to the buffer, not the DB', async ({ page }) => {
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await seedRawNotes(page, [
      { id: 'day-1', title: 'Today', body: 'saved body', dailyDate: key },
    ]);
    await page.locator('.note-row').first().click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-editor').fill('unsaved edits');
    await page.locator('#command-palette-btn').click();
    await page.locator('#command-palette-input').fill('capture');
    await page.locator('.command-palette-item', { hasText: 'Quick capture' }).click();
    await page.locator('#quick-capture-input').fill('buffered thought');
    await page.keyboard.press('Enter');
    await expect(page.locator('#note-editor')).toHaveValue(/buffered thought\n$/);
    const stored = await page.evaluate(() => window.ScratchpadDB.get('day-1'));
    expect(stored.body).toBe('saved body');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: the two new tests FAIL (no palette entry / no dialog).

- [ ] **Step 3: Add the dialog markup to `index.html`**

Before the `#share-dialog` element:

```html
  <dialog id="quick-capture-dialog" class="dialog quick-capture-dialog" aria-labelledby="quick-capture-title">
    <div class="dialog-head">
      <h2 id="quick-capture-title">Quick capture</h2>
      <button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button>
    </div>
    <div class="dialog-body">
      <p class="muted-copy">Press Enter to add a timestamped line to today's note.</p>
      <input
        id="quick-capture-input"
        class="input"
        type="text"
        placeholder="What's on your mind?"
        autocomplete="off"
        spellcheck="true"
        aria-label="Capture text"
      />
    </div>
  </dialog>
```

Add to the `els` map:

```js
    quickCaptureDialog: $('quick-capture-dialog'),
    quickCaptureInput: $('quick-capture-input'),
```

- [ ] **Step 4: Implement the capture section in `app.js`**

Add after the Daily note section:

```js
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
```

- [ ] **Step 5: Wire palette and events**

In `commandDefinitions()`, after the `today-note` entry add:

```js
      {
        id: 'quick-capture',
        label: 'Quick capture',
        meta: "Append a timestamped line to today's note",
        keywords: 'capture jot inbox quick add',
        run: openQuickCapture,
      },
```

In `bindEvents`, after the `els.commandPaletteInput` listeners add:

```js
    els.quickCaptureInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitQuickCapture();
      }
    });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: PASS (all)

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js index.html tests/daily-note.spec.js
git commit -m "feat(daily): add quick capture dialog appending to today's note"
```

---

### Task 7: PWA shortcuts and `?action=` boot handling

**Files:**
- Modify: `public/manifest.webmanifest` (add `shortcuts`), `public/js/app.js` (`init`, new `handleActionParam`)
- Test: `tests/daily-note.spec.js` (extend)

**Interfaces:**
- Consumes: `openTodayNote` (Task 5), `openQuickCapture` (Task 6), `createNote` (existing).

- [ ] **Step 1: Write the failing tests**

Append to `tests/daily-note.spec.js`:

```js
test.describe('action URLs', () => {
  test('/?action=today opens today note and cleans the URL', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/?action=today');
    await expect(page.locator('#app-shell')).toBeVisible();
    await expect(page.locator('#note-rendered')).toBeVisible();
    const note = await page.evaluate(async () => {
      const all = await window.ScratchpadDB.getAll();
      return all.find((n) => n.dailyDate);
    });
    expect(note).toBeTruthy();
    expect(new URL(page.url()).search).toBe('');
  });

  test('/?action=capture opens the capture dialog', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/?action=capture');
    await expect(page.locator('#quick-capture-input')).toBeVisible();
  });

  test('/?action=new starts a new note in edit mode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('scratchpad-visited', '1'));
    await page.goto('/?action=new');
    await expect(page.locator('#note-editor')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: the three new tests FAIL.

- [ ] **Step 3: Add `handleActionParam` and call it from `init`**

Add above `init` in `app.js`:

```js
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
```

In `init`, after `await loadAll();` add:

```js
      await handleActionParam();
```

- [ ] **Step 4: Add `shortcuts` to `public/manifest.webmanifest`**

After the `"icons"` array (sibling key):

```json
  "shortcuts": [
    { "name": "New note", "url": "/?action=new" },
    { "name": "Today's note", "url": "/?action=today" },
    { "name": "Quick capture", "url": "/?action=capture" }
  ]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx playwright test tests/daily-note.spec.js --project=chromium`
Expected: PASS (all). Also run `bunx playwright test tests/pwa.spec.js tests/pwa-lifecycle.spec.js tests/first-run.spec.js --project=chromium` — PASS (boot-path regression check).

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js public/manifest.webmanifest tests/daily-note.spec.js
git commit -m "feat(pwa): add manifest shortcuts and ?action= boot handling"
```

---

### Task 8: wikilink tokenizer, resolver injection, `hardenLinks` fragment fix

**Files:**
- Modify: `public/js/markdown.js` (inline extension, `setWikilinkResolver`, `extractWikilinkTargets`, `hardenLinks`), `public/css/app.css` (`.wikilink` styles)
- Modify: `public/js/app.js` (install resolver at boot)
- Test: `tests/wikilinks.spec.js` (created here)

**Interfaces:**
- Consumes: `scanOutsideFences` (Task 3).
- Produces: `ScratchpadMarkdown.setWikilinkResolver(fn)` where `fn(targetTitle)` → note id or `null`; `ScratchpadMarkdown.extractWikilinkTargets(src)` → `string[]` of raw target titles (Tasks 10, 11 reuse it). Rendered links: `a.wikilink[href^="#note:"]` (resolved) / `a.wikilink.is-phantom[href^="#new:"]` (unresolved), href value URI-encoded.

- [ ] **Step 1: Write the failing tests**

Create `tests/wikilinks.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, seedRawNotes, createAndSaveNote } = require('./helpers');

test.describe('wikilink rendering', () => {
  test('resolved, alias, and phantom links render correctly', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'target-1', title: 'Project Plan', body: 'the plan' },
      { id: 'source-1', title: 'Journal', body: 'See [[Project Plan]] and [[Project Plan|the plan]] and [[Missing Note]].', updatedAt: Date.now() + 1000 },
    ]);
    await page.locator('.note-row', { hasText: 'Journal' }).click();
    const rendered = page.locator('#note-rendered');
    const links = rendered.locator('a.wikilink');
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveText('Project Plan');
    await expect(links.nth(0)).toHaveAttribute('href', '#note:target-1');
    await expect(links.nth(1)).toHaveText('the plan');
    await expect(links.nth(1)).toHaveAttribute('href', '#note:target-1');
    await expect(links.nth(2)).toHaveClass(/is-phantom/);
    await expect(links.nth(2)).toHaveAttribute('href', '#new:Missing%20Note');
    // Wikilinks are same-page: no _blank/noopener from hardenLinks.
    await expect(links.nth(0)).not.toHaveAttribute('target', '_blank');
  });

  test('wikilinks inside code are not linkified; case-insensitive match; trashed target is phantom', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'target-2', title: 'Alpha', body: 'a' },
      { id: 'gone-1', title: 'Gone', body: 'g', deletedAt: Date.now() },
      { id: 'source-2', title: 'Refs', body: '`[[Alpha]]` then [[alpha]] then [[Gone]]', updatedAt: Date.now() + 1000 },
    ]);
    await page.locator('.note-row', { hasText: 'Refs' }).click();
    const rendered = page.locator('#note-rendered');
    await expect(rendered.locator('code', { hasText: '[[Alpha]]' })).toBeVisible();
    await expect(rendered.locator('a.wikilink')).toHaveCount(2);
    await expect(rendered.locator('a.wikilink').nth(0)).toHaveAttribute('href', '#note:target-2');
    await expect(rendered.locator('a.wikilink').nth(1)).toHaveClass(/is-phantom/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: FAIL — `a.wikilink` count is 0 (`[[…]]` renders as literal text).

- [ ] **Step 3: Implement the extension in `markdown.js`**

Add below the checkbox `marked.use` block:

```js
  // Wikilinks: [[Title]] / [[Title|alias]]. Resolution is injected by app.js
  // at boot so this module stays free of note-state knowledge. Rendered as
  // fragment hrefs (#note:<id> / #new:<title>) which pass SAFE_URI_PATTERN —
  // no data attributes, no sanitizer changes. app.js intercepts clicks.
  let wikilinkResolver = null;

  function setWikilinkResolver(fn) {
    wikilinkResolver = typeof fn === 'function' ? fn : null;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const WIKILINK_TOKEN = /^\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/;

  if (window.marked && typeof window.marked.use === 'function') {
    window.marked.use({
      extensions: [{
        name: 'wikilink',
        level: 'inline',
        start(src) { return src.indexOf('[['); },
        tokenizer(src) {
          const match = WIKILINK_TOKEN.exec(src);
          if (!match) return undefined;
          return {
            type: 'wikilink',
            raw: match[0],
            target: match[1].trim(),
            alias: (match[2] || '').trim(),
          };
        },
        renderer(token) {
          const resolved = wikilinkResolver ? wikilinkResolver(token.target) : null;
          const text = escapeHtml(token.alias || token.target);
          if (resolved) {
            return '<a class="wikilink" href="#note:' + encodeURIComponent(resolved) + '">' + text + '</a>';
          }
          return '<a class="wikilink is-phantom" href="#new:' + encodeURIComponent(token.target) + '">' + text + '</a>';
        },
      }],
    });
  }

  // Raw wikilink targets in document order, ignoring fenced code blocks.
  // Used for backlink indexing and rename rewriting.
  function extractWikilinkTargets(src) {
    const targets = [];
    const pattern = /\[\[([^\[\]\n|]+?)(?:\|[^\[\]\n]*?)?\]\]/g;
    scanOutsideFences(src, (line) => {
      let match;
      while ((match = pattern.exec(line)) !== null) targets.push(match[1].trim());
      pattern.lastIndex = 0;
    });
    return targets;
  }
```

Note the marked v18 encoding caveat: `encodeURIComponent(resolved)` on a plain uuid is a no-op but guards ids with reserved chars; the test asserts the encoded form for the phantom title (`Missing%20Note`).

- [ ] **Step 4: Scope `hardenLinks` to real links and export the new functions**

Replace `hardenLinks`:

```js
  function hardenLinks(root) {
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      // Fragment links (wikilinks, in-note anchors) are same-page; forcing
      // target=_blank on them would break in-app navigation.
      if (href.startsWith('#')) continue;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }
```

Extend the export object:

```js
  window.ScratchpadMarkdown = {
    sanitizeConfig: SANITIZE_CONFIG,
    renderMarkdownInto,
    renderEmptyBody,
    findTaskMarkers,
    setWikilinkResolver,
    extractWikilinkTargets,
  };
```

- [ ] **Step 5: Install the resolver in `app.js` and style the links**

In `init` in `app.js`, before `initCrossTabSync();` add:

```js
    Markdown.setWikilinkResolver((target) => {
      const wanted = (target || '').trim().toLowerCase();
      if (!wanted) return null;
      const matches = sortNotes(state.notes.filter(
        (n) => !isTrashed(n) && deriveTitle(n).trim().toLowerCase() === wanted
      ));
      return matches.length ? matches[0].id : null;
    });
```

In `app.css`, after the `.task-checkbox` block:

```css
/* Wikilinks */
.note-rendered a.wikilink {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: var(--accent-soft);
  text-underline-offset: 2px;
}
.note-rendered a.wikilink.is-phantom {
  color: var(--text-muted);
  text-decoration-style: dashed;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: PASS. Also `bunx playwright test tests/sanitization.spec.js --project=chromium` — PASS (sanitizer posture unchanged).

- [ ] **Step 7: Commit**

```bash
git add public/js/markdown.js public/js/app.js public/css/app.css tests/wikilinks.spec.js
git commit -m "feat(wikilinks): parse and render [[Title]] links with injected resolver"
```

---

### Task 9: wikilink navigation and phantom-link creation

**Files:**
- Modify: `public/js/app.js` (`onRenderedClick` from Task 4 grows link handling; new `createNoteFromWikilink`)
- Test: `tests/wikilinks.spec.js` (extend)

**Interfaces:**
- Consumes: rendered `a.wikilink` hrefs (Task 8), `openNoteFromCommand(id)` (existing), `putNoteRecord`/`normalizeNote`/`uuid` (existing).

- [ ] **Step 1: Write the failing tests**

Append to `tests/wikilinks.spec.js`:

```js
test.describe('wikilink navigation', () => {
  test('clicking a resolved link opens the target note', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'nav-target', title: 'Target Note', body: 'target body' },
      { id: 'nav-source', title: 'Source', body: 'go to [[Target Note]]', updatedAt: Date.now() + 1000 },
    ]);
    await page.locator('.note-row', { hasText: 'Source' }).click();
    await page.locator('#note-rendered a.wikilink').click();
    await expect(page.locator('#note-title-display')).toHaveText('Target Note');
    await expect(page.locator('#note-rendered')).toContainText('target body');
  });

  test('clicking a phantom link creates the note and opens it in edit mode', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'ph-source', title: 'Source', body: 'todo: [[Brand New Idea]]' },
    ]);
    await page.locator('.note-row', { hasText: 'Source' }).click();
    await page.locator('#note-rendered a.wikilink.is-phantom').click();
    await expect(page.locator('#note-editor')).toBeVisible();
    await expect(page.locator('#note-title-input')).toHaveValue('Brand New Idea');
    // Save, go back to the source: the link is now resolved.
    await page.locator('#save-btn').click();
    await page.locator('.note-row', { hasText: 'Source' }).click();
    await expect(page.locator('#note-rendered a.wikilink')).not.toHaveClass(/is-phantom/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: the two new tests FAIL (click falls through to the raw `#` href).

- [ ] **Step 3: Implement navigation in `app.js`**

Add to the Task toggles section (or directly below it):

```js
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
```

Extend `onRenderedClick` (from Task 4) — full replacement:

```js
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
```

(Anchors are natively keyboard-activatable — Enter fires `click` — so `onRenderedKey` needs no change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js tests/wikilinks.spec.js
git commit -m "feat(wikilinks): navigate resolved links and create from phantoms"
```

---

### Task 10: backlinks section

**Files:**
- Modify: `index.html` (backlinks markup after `#note-rendered`), `public/js/app.js` (`els` map, `renderBacklinks`, hook in `renderEditor`), `public/css/app.css`
- Test: `tests/wikilinks.spec.js` (extend)

**Interfaces:**
- Consumes: `ScratchpadMarkdown.extractWikilinkTargets(src)` (Task 8), `deriveTitle`, `sortNotes`, `openNoteFromCommand`.
- Produces: `linkingNotesTo(title, excludeId)` → `note[]` — reused by Task 11's rename check.

- [ ] **Step 1: Write the failing tests**

Append to `tests/wikilinks.spec.js`:

```js
test.describe('backlinks', () => {
  test('viewed note lists untrashed notes that link to it', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'bl-target', title: 'Hub', body: 'hub body' },
      { id: 'bl-a', title: 'Alpha', body: 'see [[Hub]]' },
      { id: 'bl-b', title: 'Beta', body: 'also [[hub]] lowercase' },
      { id: 'bl-c', title: 'Trashed', body: '[[Hub]] from trash', deletedAt: Date.now() },
      { id: 'bl-d', title: 'Fenced', body: '```\n[[Hub]]\n```' },
    ]);
    await page.locator('.note-row', { hasText: 'Hub' }).click();
    const section = page.locator('#backlinks-section');
    await expect(section).toBeVisible();
    await expect(page.locator('#backlinks-summary')).toHaveText('Linked from 2 notes');
    await section.locator('summary').click();
    await expect(section.locator('button', { hasText: 'Alpha' })).toBeVisible();
    await expect(section.locator('button', { hasText: 'Beta' })).toBeVisible();
    // Clicking a backlink navigates to the source note.
    await section.locator('button', { hasText: 'Alpha' }).click();
    await expect(page.locator('#note-title-display')).toHaveText('Alpha');
  });

  test('section is hidden when nothing links here', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'lonely', title: 'Lonely', body: 'no links' }]);
    await page.locator('.note-row').first().click();
    await expect(page.locator('#backlinks-section')).toBeHidden();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: the two new tests FAIL (no `#backlinks-section`).

- [ ] **Step 3: Add markup and styles**

In `index.html`, directly after `<div id="note-rendered" class="note-rendered" hidden></div>`:

```html
          <details id="backlinks-section" class="backlinks" hidden>
            <summary id="backlinks-summary" class="backlinks-summary">Linked from 0 notes</summary>
            <ul id="backlinks-list" class="backlinks-list"></ul>
          </details>
```

In the `els` map:

```js
    backlinksSection: $('backlinks-section'),
    backlinksSummary: $('backlinks-summary'),
    backlinksList: $('backlinks-list'),
```

In `app.css`:

```css
/* Backlinks */
.backlinks {
  margin-top: var(--space-5, 1.5rem);
  border-top: 1px solid var(--border-hair);
  padding-top: 0.75rem;
}
.backlinks-summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.85rem;
}
.backlinks-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.backlinks-list .backlink-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--control-fill);
  color: var(--text-body);
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.backlinks-list .backlink-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 4: Implement and wire `renderBacklinks`**

Add to `app.js` below the wikilink navigation code:

```js
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
```

In `renderEditor`: in the no-note early return (inside `if (!note) {`) add `els.backlinksSection.hidden = true;`; then at the end of the function (after the `els.dirtyIndicator` line) add:

```js
    renderBacklinks(note);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js index.html public/css/app.css tests/wikilinks.spec.js
git commit -m "feat(wikilinks): show render-time backlinks under viewed notes"
```

---

### Task 11: rename-safe links (offer to rewrite linking notes)

**Files:**
- Modify: `index.html` (link-rename dialog), `public/js/app.js` (`els` map, `maybeOfferLinkRewrite`, hooks in `saveCurrent` and the title-blur handler)
- Test: `tests/wikilinks.spec.js` (extend)

**Interfaces:**
- Consumes: `linkingNotesTo(title, excludeId)` (Task 10), `mutateNoteBody` (Task 4).
- Produces: `maybeOfferLinkRewrite(oldTitle, newTitle, noteId)` — called from both title-change paths.

- [ ] **Step 1: Write the failing tests**

Append to `tests/wikilinks.spec.js`:

```js
test.describe('rename rewriting', () => {
  test('accepting the prompt rewrites linking notes and stores revisions', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'rn-target', title: 'Old Name', body: 'target' },
      { id: 'rn-src', title: 'Linker', body: 'ref [[Old Name]] and [[old name|alias]]' },
    ]);
    await page.locator('.note-row', { hasText: 'Old Name' }).click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-title-input').fill('New Name');
    await page.locator('#save-btn').click();
    await expect(page.locator('#link-rename-dialog')).toBeVisible();
    await expect(page.locator('#link-rename-copy')).toContainText('1 note');
    await page.locator('#confirm-link-rename').click();
    await expect(page.locator('#link-rename-dialog')).toBeHidden();
    const linker = await page.evaluate(() => window.ScratchpadDB.get('rn-src'));
    expect(linker.body).toBe('ref [[New Name]] and [[New Name|alias]]');
    const revisions = await page.evaluate(() => window.ScratchpadDB.getRevisions('rn-src'));
    expect(revisions.length).toBe(1);
  });

  test('declining leaves phantom links intact', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'rd-target', title: 'Old Name', body: 'target' },
      { id: 'rd-src', title: 'Linker', body: 'ref [[Old Name]]' },
    ]);
    await page.locator('.note-row', { hasText: 'Old Name' }).click();
    await page.locator('#edit-btn').click();
    await page.locator('#note-title-input').fill('New Name');
    await page.locator('#save-btn').click();
    await expect(page.locator('#link-rename-dialog')).toBeVisible();
    await page.locator('#link-rename-dialog [data-dialog-close]').first().click();
    const linker = await page.evaluate(() => window.ScratchpadDB.get('rd-src'));
    expect(linker.body).toBe('ref [[Old Name]]');
    await page.locator('.note-row', { hasText: 'Linker' }).click();
    await expect(page.locator('#note-rendered a.wikilink.is-phantom')).toHaveCount(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: the two new tests FAIL (no `#link-rename-dialog`).

- [ ] **Step 3: Add the dialog to `index.html`**

Next to the quick-capture dialog:

```html
  <dialog id="link-rename-dialog" class="dialog" aria-labelledby="link-rename-title">
    <div class="dialog-head">
      <h2 id="link-rename-title">Update links?</h2>
      <button class="dialog-close" type="button" data-dialog-close aria-label="Close">×</button>
    </div>
    <div class="dialog-body">
      <p id="link-rename-copy"></p>
      <p class="muted-copy">Updated notes keep a revision, so this is reversible.</p>
    </div>
    <div class="dialog-foot">
      <button class="btn btn-secondary" type="button" data-dialog-close>Leave them</button>
      <button id="confirm-link-rename" class="btn btn-primary" type="button">Update links</button>
    </div>
  </dialog>
```

`els` map additions:

```js
    linkRenameDialog: $('link-rename-dialog'),
    linkRenameCopy: $('link-rename-copy'),
    confirmLinkRename: $('confirm-link-rename'),
```

- [ ] **Step 4: Implement rewrite logic in `app.js`**

Below the Backlinks section:

```js
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
```

Hook both title-change paths:

1. In `saveCurrent`, capture the old display title before the write — after `const baseNote = latest || note;` add:

```js
      const previousDisplayTitle = deriveTitle(baseNote);
```

and at the end of the function, after the final `renderAll();` add:

```js
      await maybeOfferLinkRewrite(previousDisplayTitle, deriveTitle(nextNote), nextNote.id);
```

2. In the `els.titleInput` blur handler (view-mode title edit), inside the `withBusy('title-save', …)` callback, after `els.dirtyIndicator.hidden = true;` add:

```js
        await maybeOfferLinkRewrite(deriveTitle(note), deriveTitle(nextNote), note.id);
```

(Note: in that handler `note` still holds the pre-rename object only until `Object.assign(note, nextNote)` runs — capture `deriveTitle(note)` into a const *before* the assign, then pass it.) Full corrected insertion:

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: PASS (all). Also `bunx playwright test tests/notes-crud.spec.js tests/cross-tab-conflicts.spec.js --project=chromium` — PASS (save-path regression check).

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js index.html tests/wikilinks.spec.js
git commit -m "feat(wikilinks): offer to rewrite links when a title changes"
```

---

### Task 12: `[[` autocomplete in the editor

**Files:**
- Modify: `index.html` (suggestion panel inside `.editor-card`), `public/js/app.js` (`els` map, `// -------- Wikilink autocomplete --------` section, editor listeners in `bindEvents`), `public/css/app.css`
- Test: `tests/wikilinks.spec.js` (extend)

**Interfaces:**
- Consumes: `deriveTitle`, `sortNotes`, `normalizeSearchText`, `isTrashed`, editor textarea `els.editor`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/wikilinks.spec.js`:

```js
test.describe('wikilink autocomplete', () => {
  test('typing [[ suggests titles; Enter inserts and closes', async ({ page }) => {
    await seedRawNotes(page, [
      { id: 'ac-1', title: 'Project Plan', body: 'p' },
      { id: 'ac-2', title: 'Project Notes', body: 'n' },
      { id: 'ac-3', title: 'Groceries', body: 'g' },
    ]);
    await page.locator('#new-note').click();
    const editor = page.locator('#note-editor');
    await editor.pressSequentially('See [[Proj');
    const panel = page.locator('#wikilink-suggest');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[role="option"]')).toHaveCount(2);
    await expect(panel.locator('[role="option"]').first()).toContainText('Project');
    await page.keyboard.press('Enter');
    await expect(panel).toBeHidden();
    const value = await editor.inputValue();
    expect(value).toMatch(/^See \[\[Project (Plan|Notes)\]\]$/);
  });

  test('Escape dismisses without inserting; ] closes the panel', async ({ page }) => {
    await seedRawNotes(page, [{ id: 'ac-4', title: 'Alpha', body: 'a' }]);
    await page.locator('#new-note').click();
    const editor = page.locator('#note-editor');
    await editor.pressSequentially('x [[Al');
    await expect(page.locator('#wikilink-suggest')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#wikilink-suggest')).toBeHidden();
    expect(await editor.inputValue()).toBe('x [[Al');
    // Editing continues normally (Escape did not exit edit mode).
    await expect(editor).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: the two new tests FAIL (no `#wikilink-suggest`).

- [ ] **Step 3: Add panel markup and styles**

In `index.html`, directly after the `#note-editor` textarea (inside `.editor-card`):

```html
          <div id="wikilink-suggest" class="wikilink-suggest" role="listbox" aria-label="Link suggestions" hidden></div>
```

In `app.css`:

```css
/* Wikilink autocomplete */
.editor-card {
  position: relative;
}
.wikilink-suggest {
  position: absolute;
  z-index: 30;
  min-width: 220px;
  max-width: 320px;
  max-height: 40vh;
  overflow-y: auto;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--glass-shadow);
  padding: 0.25rem;
}
.wikilink-suggest [role="option"] {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-body);
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}
.wikilink-suggest [role="option"][aria-selected="true"] {
  background: var(--accent-soft);
  color: var(--accent);
}
```

`els` map addition:

```js
    wikilinkSuggest: $('wikilink-suggest'),
```

- [ ] **Step 4: Implement the autocomplete section in `app.js`**

```js
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
    const marker = el('span', { text: '\u200b' });
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
    els.wikilinkSuggest.style.left = Math.min(pos.left, els.editor.clientWidth - 200) + 'px';
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
```

- [ ] **Step 5: Wire editor listeners**

In `bindEvents`, after `els.editor.addEventListener('input', markDirty);` add:

```js
    els.editor.addEventListener('input', updateWikilinkSuggest);
    els.editor.addEventListener('keydown', onEditorSuggestKey);
    els.editor.addEventListener('blur', () => setTimeout(closeWikilinkSuggest, 0));
    els.editor.addEventListener('click', () => { if (wikilinkSuggestState.open) updateWikilinkSuggest(); });
```

Note: `onEditorSuggestKey` must run before the global `Escape` handler; it is attached directly to the textarea so it fires first and `stopPropagation()` protects edit mode.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bunx playwright test tests/wikilinks.spec.js --project=chromium`
Expected: PASS (all)

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js index.html public/css/app.css tests/wikilinks.spec.js
git commit -m "feat(wikilinks): autocomplete note titles when typing [["
```

---

### Task 13: release — version bump, docs, full suite

**Files:**
- Modify: `public/js/version.js`, `README.md` (Features + Keyboard shortcuts sections), `about.html` (feature documentation)
- Test: full suite

- [ ] **Step 1: Bump the version**

In `public/js/version.js`, set:

```js
const SCRATCHPAD_VERSION = '3.1.0';
```

(Leave `SCRATCHPAD_BUILD_DATE` alone — the deploy script stamps it.)

- [ ] **Step 2: Update README features**

In `README.md` under `### Notes workflow`, add bullets (match the existing voice):

```markdown
- Tick task-list checkboxes right in the rendered note — `- [ ]` items are
  clickable in view mode and write back to the Markdown source.
- Jump to today's note with one command; it is created on first use from a
  note titled "Daily template" (or a minimal default). Quick capture appends
  a timestamped line from anywhere.
- Link notes with `[[Title]]` (autocompleted as you type); each note shows
  what links to it, and renaming a linked note offers to update references.
```

In the Keyboard shortcuts table add:

```markdown
| `⌘/Ctrl` + `Shift` + `D`       | Open today's note                         |
```

- [ ] **Step 3: Update about.html**

Find the features region (search `about.html` for the section documenting the Notes workflow / recent features) and add three entries mirroring the surrounding markup exactly (same heading level, same classes, no new inline scripts). Copy for the three entries:

- **Task lists that work** — "Tick `- [ ]` checkboxes right in the rendered note. Toggles write back to your Markdown and respect revision history."
- **Daily note and quick capture** — "One command opens today's note, created on first use from your 'Daily template' note or a minimal default. Quick capture appends a timestamped line from anywhere — even while you're mid-edit."
- **Linked notes** — "Connect notes with `[[Title]]` links, autocompleted as you type. Every note shows what links to it, and renaming a note offers to update its references."

- [ ] **Step 4: Run the full cross-browser suite**

Run: `bun run test`
Expected: PASS on chromium, firefox, webkit. Fix anything that fails before proceeding (webkit is the usual suspect for `:has()` and dialog focus timing; the `.task-checkbox` CSS uses `:has()` only for list-marker removal, which degrades gracefully).

- [ ] **Step 5: Commit**

```bash
git add public/js/version.js README.md about.html
git commit -m "chore(release): bump Scratchpad to 3.1.0 and document new features"
```

---

## Verification checklist (post-plan)

- `bun run test` fully green on all three browsers.
- Manual smoke via `python3 -m http.server 8080`: toggle a task, capture a thought, follow a wikilink, create from a phantom, rename a linked note.
- `git log --oneline` shows one commit per task, Conventional Commits style.
- No changes to `db.js`, `SANITIZE_CONFIG`, or any inline `<script>` (no CSP rehash needed) — `git diff main --stat` confirms the touched-file list matches the File Structure table.
- Deploy intentionally NOT run.



