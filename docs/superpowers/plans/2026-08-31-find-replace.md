# Find and Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved in-note find-and-replace bar
(`docs/superpowers/specs/2026-08-31-find-replace-design.md`) as v3.19.

**Architecture:** New vanilla module `public/js/find-replace.js` owns the bar's
state machine, matching, and replacement; `app.js` only intercepts `⌘/Ctrl+F`
while editing, adds the palette entry, and closes the bar on edit-mode exit.
Markup is a non-modal `role="toolbar"` overlay inside `.editor-card`
(index.html:221), styled tokens-only in `app.css`. Replacement reuses the
`applyEditorFormat` mutation pattern so drafts and dirty state work unchanged.

**Spec:** `docs/superpowers/specs/2026-08-31-find-replace-design.md`

## Global Constraints

- Zero network: no fetch/XHR anywhere; `tests/network-isolation.spec.js`
  untouched.
- All new CSS colors via `var(--token)`; no hex, no dark-mode rules, no
  decorative glass in the app shell, no emoji (ASCII chips `Aa`, `.*`; close
  control is inline SVG).
- No new third-party runtime code and no changes to any inline `<script>` —
  CSP hashes must remain byte-identical (verify with
  `bash cloudfront/recompute-csp-hashes.sh` at the end).
- Two-space indent, camelCase, house `el()` builder for JS-created DOM; static
  markup lives in `index.html`.
- Tests run against `scripts/dev-server.mjs` on Chromium, Firefox, and WebKit
  (default Playwright config); target one spec with
  `npm test find-replace.spec.js`.

## Task 1: Bar markup, module skeleton, open/close lifecycle

**Files:** Create `public/js/find-replace.js`, `tests/find-replace.spec.js`.
Modify `index.html` (markup + script tag), `public/js/app.js` (⌘F + palette +
edit-mode wiring), `public/css/app.css` (minimal visible bar styles).

**Interfaces:** Module exposes `window.ScratchpadFind = { init, open, close,
isOpen }`. `init({ editor, onDirty })` receives the `#note-editor` textarea and
the app's `markDirty`; `app.js` calls `close()` whenever edit mode exits.

- [ ] **Step 1: Write failing lifecycle tests** in `tests/find-replace.spec.js`
  (house style: fresh context per test via `tests/helpers.js`):

```js
test('Cmd+F opens the find bar only while editing', async ({ page }) => {
  const { gotoApp, createAndSaveNote } = require('./helpers');
  await gotoApp(page);
  await createAndSaveNote(page, 'Note one', 'alpha beta gamma');
  await page.keyboard.press('ControlOrMeta+f');            // browsing: nothing
  await expect(page.locator('#find-bar')).toBeHidden();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('#find-bar')).toBeVisible();
  await expect(page.locator('#find-input')).toBeFocused();
});
```

Cover: open focuses find input; `Escape` closes and refocuses `#note-editor`;
leaving edit mode hides an open bar; palette lists "Find in note" only while
editing and opening works from the palette.

- [ ] **Step 2: Run** `npm test find-replace.spec.js` — expect FAIL (no
  `#find-bar`).
- [ ] **Step 3: Add markup** inside `.editor-card` (after the card header,
  before `#note-rendered`): `#find-bar` (`role="toolbar"`,
  `aria-label="Find in note"`, `hidden`) with `#find-input`
  (`aria-label="Find in note"`, `autocomplete="off"`, `spellcheck="false"`),
  `#find-count`, `#find-case-toggle` and `#find-regex-toggle`
  (`aria-pressed="false"`), `#find-close` (inline SVG cross,
  `aria-label="Close find bar"`), `#find-replace-input`
  (`aria-label="Replace with"`), `#find-replace-btn`, `#find-replace-all-btn`,
  `#find-live` (visually hidden, `aria-live="polite"`), `#find-notice`
  (`hidden`, muted). Load `<script src="/public/js/find-replace.js">` before
  `app.js` (index.html:933).
- [ ] **Step 4: Implement the module skeleton** —
  `init({ editor, onDirty })` binds listeners; `open()` unhides, focuses find
  input, runs query; `close()` hides and returns focus to the editor; internal
  keydown handles `Escape` first, then falls through. In `app.js`: `⌘/Ctrl+F`
  interception in `onGlobalKey` *only when* `state.editing`; the global
  `Escape` branch consults `ScratchpadFind.isOpen()` first; palette gains
  `{ id: 'find-in-note', label: 'Find in note', meta: '⌘/Ctrl+F — find and replace in this note', keywords: 'find replace search text', run: () => ScratchpadFind.open() }`
  behind the `state.editing` gate; edit-mode exit calls `close()`.
  Minimal `app.css`: `.find-bar` flat `var(--surface-*)` fill, hairline
  `var(--border)`, absolute top-right inside `.editor-card`, z-index above the
  textarea.
- [ ] **Step 5: Run** `npm test find-replace.spec.js` — expect PASS;
  `npm run check:shell` still green.
- [ ] **Step 6: Commit** — `feat(editor): find bar opens with Cmd+F while editing`

## Task 2: Matching engine, counter, cycling, toggles

**Files:** Modify `public/js/find-replace.js`, `tests/find-replace.spec.js`,
`public/css/app.css` (chip active states).

**Interfaces:** Internal `computeMatches(text, query, caseSensitive, regex)`
returns `{ invalid, matches: [{ start, end }] }`; the module tracks the
current match index and query state; toggles live in module state (session
only, never storage); `#find-live` announces `"N of M"`.

- [ ] **Step 1: Write failing tests**: typing `beta` shows `1 of 1` and
  focuses the match as a native textarea selection
  (`selectionStart`/`selectionEnd` equal the match range); `Enter` cycles
  forward, `Shift+Enter` backward, wrapping at both ends; counter live-updates
  on query and note-text changes; `Aa` makes `Beta` ≠ `beta`; `.*` mode matches
  `be.a`; invalid `.*` query (`[`) shows the muted `#find-notice`
  "Invalid pattern", hides the counter, and Enter does nothing; `0 of 0` with
  empty results; `#find-live` echoes the counter.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement the matcher** in the module:

```js
function computeMatches(text, query, caseSensitive, regex) {
  if (!query) return { invalid: false, matches: [] };
  if (regex) {
    let re;
    try {
      re = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } catch {
      return { invalid: true, matches: [] };
    }
    const matches = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex += 1; // zero-length guard
    }
    return { invalid: false, matches };
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  const hay = caseSensitive ? text : text.toLowerCase();
  const matches = [];
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i === -1) break;
    matches.push({ start: i, end: i + query.length });
    from = i + query.length;
  }
  return { invalid: false, matches };
}
```

Cycling keeps a match index; Enter/⇧Enter advance/retreat with wraparound;
presentation is `editor.setSelectionRange(start, end)` + focus (native caret
scrolling). Toggles set `aria-pressed`, re-run the query from index 0, and
reset the index when the focused match stops existing. Counter + notice +
live region update on every query/text/toggle change (editor `input` included).

- [ ] **Step 4: Run** — expect PASS; `npm test keyboard-shortcuts.spec.js
  editor-rail.spec.js` still green.
- [ ] **Step 5: Commit** — `feat(editor): match counter, cycling, and case/regex toggles`

## Task 3: Replacement

**Files:** Modify `public/js/find-replace.js`, `tests/find-replace.spec.js`.

**Interfaces:** `Replace` = focused match only; `Replace all` = one rewrite.
Both dispatch an `input` event on the textarea after `setRangeText`/value
mutation, then call `onDirty()`.

- [ ] **Step 1: Write failing tests**: `⌘/Ctrl+Enter` replaces the focused
  match, the selection lands at the replacement end, repeated invocations step
  forward through remaining matches; the dirty indicator shows and `⌘S` saves
  the replaced source; `Replace all` replaces every occurrence, toasts
  "Replaced 3 occurrences" (house `toast()`), and is disabled at zero matches;
  regex mode `$1` capture references work (`(\w+)@example` → `$1` on
  `a@example` yields `a`); literal mode inserts `$1` verbatim; empty replace
  string deletes matches.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**: single replace uses
  `editor.setRangeText(replacement, m.start, m.end, 'end')` then
  `editor.dispatchEvent(new Event('input', { bubbles: true }))` and
  `onDirty()`; recompute matches and keep a sensible next index (VS Code steps
  forward from the replacement). Replace all builds the new value in one pass
  (regex mode via `String.prototype.replace` with the `g` flag so `$1`
  semantics are native; literal mode via `split().join()`), then dispatches
  input + `onDirty()` + `toast(\`Replaced ${n} occurrences\`)`. Update the
  counter afterward.
- [ ] **Step 4: Run** — expect PASS; `npm test notes-crud.spec.js
  reliability.spec.js` still green (draft/autosave interactions).
- [ ] **Step 5: Commit** — `feat(editor): replace current and replace all`

## Task 4: Responsive, accessibility sweep, docs, offline shell

**Files:** Modify `public/css/app.css`, `public/service-worker.js` (precache
list, ~line 41: add `'/public/js/find-replace.js'` before `app.js`),
`guide.html`, `README.md`, `tests/README.md`, `tests/find-replace.spec.js`.

- [ ] **Step 1: Write failing responsive/a11y tests**: at 390×844 the bar fits
  its stage width with no horizontal document overflow; bar interactive
  targets ≥44px; inputs keep ≥16px font; `role="toolbar"` with accessible
  name; all controls expose labels; toggles expose `aria-pressed`; bar works
  inside focus mode (`⌘/Ctrl+Shift+F` then `⌘/Ctrl+F`).
- [ ] **Step 2: Run** — expect FAIL on bounds/target assertions.
- [ ] **Step 3: Implement responsive CSS** (tokens only; media query stacks
  rows full-width, pads to 44px targets, 16px input font) and add the
  service-worker precache entry. Docs: `guide.html` shortcut row
  (`⌘/Ctrl+F` — "Find in note (while editing)") plus a "Find and replace"
  section; README shortcut table row; `tests/README.md` map row for
  `find-replace.spec.js`.
- [ ] **Step 4: Run** — expect PASS; `npm test pwa.spec.js touch-targets.spec.js
  accessibility-semantics.spec.js design-tokens.spec.js guide.spec.js` green;
  `npm run check:shell` green (precache path resolves).
- [ ] **Step 5: Commit** — `docs(guide): find and replace guide, shortcuts, and offline shell entry`

## Task 5: Release v3.19.0 and full verification

- [ ] **Step 1:** Bump `public/js/version.js` to `SCRATCHPAD_VERSION = '3.19.0'`
  (build date refreshes at deploy).
- [ ] **Step 2:** Full gate: `npm run verify`, `npm test` (all ~950+ specs,
  three browsers), `bash cloudfront/recompute-csp-hashes.sh` (must report no
  change), `npm run check:vendor` untouched-green.
- [ ] **Step 3:** Visual spot-check at desktop/mobile in light + dark via
  `scripts/dev-server.mjs`; capture to `.verify/find-replace/`.
- [ ] **Step 4:** Update `tasks/` ledger with the ship note; review the full
  diff.
- [ ] **Step 5:** Commit — `chore(release): v3.19.0 find and replace`. Deploy
  only on an explicit "yes, deploy".