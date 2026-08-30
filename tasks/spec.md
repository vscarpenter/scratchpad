# Spec: Chronicle dialog recipe — Phase 2

Approved directions from the 2026-08 design review
(`design_handoff_chronicle_dialogs/README.md`, "Phase 2"). Design direction is
approved; detailed spec derived here from those directions plus the Phase 1
recipe (DESIGN.md "Dialogs") and existing code. Continuous pass authorized by
the standing design-approval correction.

## Goal

Four dialog surfaces adopt the Phase 2 directions without changing any data
behavior:

1. **About → "Your data" panel** — 3 stat cards (notes / revisions / storage),
   status rows with state dots and inline actions, links stay demoted in the
   existing dialog footer.
2. **Import preview** — counts become stat cards; conflict radios gain
   one-clause consequence copy; the primary button states the outcome
   ("Import 16 notes").
3. **Quick capture → spotlight bar** — no title bar; footer shows a live
   preview of exactly what will be appended and where.
4. **Erase button disabled until "ERASE" is fully typed** (visual + JS).

## Hard constraints (executable in the existing suite)

- Every `#diagnostic-*` id keeps its element and text semantics —
  `tests/diagnostics.spec.js` asserts each value (`toHaveText('2')` etc.).
- `#import-preview-counts` keeps a `<dl>` whose `dd` order is unchanged:
  New notes, Conflicts, Rejected entries, Revision snapshots, Rejected
  revisions, Folders — `tests/import.spec.js` asserts `dd.nth(0/2/4)`.
- `#quick-capture-input` / `#quick-capture-submit` ids, Enter-to-capture, and
  `?action=capture` behavior unchanged (`daily-note.spec.js`,
  `keyboard-shortcuts.spec.js`).
- Radio `name="import-conflict-mode"` values `duplicate|replace|skip` and
  default-to-duplicate on render are unchanged.
- Recipe rules apply: tokens only in app.css, serif titles, mono small-caps
  labels, hairlines, indigo action-only, rust erasure-only. No emoji; SVG or
  Unicode symbols only. No new network calls. No `innerHTML`.

## 1. Erase gating (JS + markup + CSS)

- `#confirm-erase-local-data` gets the `disabled` attribute in markup.
- On `input` in `#erase-confirmation`: button enabled iff
  `value === 'ERASE'` (exact, case-sensitive, no trim). Deleting characters
  re-disables. Dialog open resets input and re-disables.
- The click-time value guard stays as a one-line defense-in-depth check, but
  the now-unreachable error UI (`#erase-confirmation-error`, `aria-invalid`
  toggling) is REMOVED — the structure ratchet requires additions to app.js
  to pay their way, and dead error plumbing is the in-scope offset.
  (Deviation from first draft recorded 2026-08-30.)
- **Spec change to tests**: `data-erasure.spec.js` "wrong text" case becomes:
  fill `'erase'` → expect button `toBeDisabled()` and dialog still open; fill
  `'ERASE'` → `toBeEnabled()` → click proceeds. All other erase tests already
  fill `'ERASE'` first and stay valid.

## 2. Import preview (JS render + markup + CSS)

- `renderImportPreview` wraps each dt/dd pair in a `<div>` (same pattern as
  the About diagnostics list); dl order unchanged. CSS turns the six pairs
  into a 3-across stat-card grid (2 rows), dt in the existing Phase 1 mono
  small-caps voice, dd value in serif 600 ~20px.
- Each conflict radio label gains a `.import-consequence` line
  (12px, `--text-secondary`), one clause each:
  - duplicate: "Conflicting notes come in as copies; nothing is overwritten."
  - replace: "Existing notes with matching ids are overwritten."
  - skip: "Only new notes come in; conflicts stay untouched."
- `#confirm-import` label states the outcome. N = notes that will import for
  the selected mode: duplicate/replace → `newCount + conflicts`; skip →
  `newCount`. Label `Import N notes` / `Import 1 note`; when N = 0 the label
  falls back to plain `Import` (folders may still merge). Recomputed on
  preview render and on radio change.

## 3. About "Your data" panel (markup + JS + CSS)

- `#diagnostics-title` text becomes "Your data" (verify no test pins
  "Local diagnostics" first; keep the id).
- Structure inside `#diagnostics-panel` (all existing ids preserved):
  - `.data-stats`: three stat cards — Notes (`#diagnostic-active-notes`),
    Revisions (`#diagnostic-revisions`), Storage (`#diagnostic-storage`).
    Card label mono small-caps 10px `--text-muted`; value serif 600 20px.
  - `.data-meta`: one quiet line "`#diagnostic-archived-notes` archived ·
    `#diagnostic-trashed-notes` in trash · `#diagnostic-drafts` drafts"
    (ids live on inline spans holding only the number).
  - `.data-status`: three status rows, each `dot + term + value + inline
    action`, hairline-separated:
    - Storage protection → value `#diagnostic-storage-protection`, inline
      `#protect-storage-btn` (existing hidden logic untouched). Dot state:
      Persistent → ok, Best effort → warn, Unavailable → muted.
    - Last backup → value `#diagnostic-last-backup`, no action. Dot: backup
      recorded → ok, never → warn.
    - Offline cache → value `#diagnostic-offline-cache`, inline
      `#refresh-offline-copy-btn` and `#check-updates-btn` (both btn-sm).
      Dot: Ready → ok, otherwise warn/muted.
  - `renderDiagnostics` additionally sets `data-state="ok|warn|muted"` on
    each status row; CSS colors the dot via tokens (`--success`,
    `--warning`, `--text-muted`). Color is never the only signal — the text
    value stays.
- `.about-control-row` disappears (its three buttons moved inline).
- Footer links: already demoted in `.about-dialog-foot` — no change.
- Danger zone: unchanged from Phase 1.

## 4. Quick capture spotlight (markup + JS + CSS)

- Remove the entire `.dialog-head` (icon, h2, subtitle, close button). The
  dialog gets `aria-label="Quick capture"` instead of `aria-labelledby`.
  Esc still closes (native cancel); no visible close button.
- `#quick-capture-description` becomes a `visually-hidden` paragraph so the
  input's `aria-describedby` keeps working for AT.
- The `.quick-capture-hint` row becomes `.quick-capture-foot`: left side is a
  live preview `- **HH:MM** <typed text>` (timestamp mono, text plain,
  `aria-hidden="true"`, muted ellipsis when input empty), right side keeps
  the destination + `Enter` kbd hint. Destination reads "Today's note", or
  "today's draft" when the today note is open in the editor (mirrors the
  `submitQuickCapture` buffer branch).
- JS: on dialog open and on every `input`, update preview text and
  destination. Timestamp from the existing `captureTimestamp()`.
- CSS: head rules for quick-capture (`.quick-capture-dialog .dialog-head*`,
  `.quick-capture-heading`, `.quick-capture-mark`, `.quick-capture-subtitle`)
  are removed as dead; body padding compensates for the missing head.

## Anti-goals

- No behavior change to what erase erases, what import writes, what capture
  appends, or diagnostics computation.
- No new tokens, no literal colors, no `@font-face`, no shell changes.
- No Phase 3 inventions (e.g. redesigned radios as cards, capture into
  arbitrary notes).

## Edge cases

- Erase: paste "ERASE " (trailing space) stays disabled; case-sensitive.
- Import: N = 0 (folders-only import) → plain "Import" label; 1 → singular.
- Quick capture: empty input preview shows timestamp + muted placeholder;
  destination logic when the today note exists but is not open → "Today's
  note"; input with only spaces behaves as empty (capture already no-ops).
- About: `storage.persist` unsupported → protection row muted, protect button
  hidden (existing logic).

## Acceptance criteria

1. New/updated Playwright assertions (red first, then green):
   - erase button disabled → enabled → re-disabled by input value.
   - import consequence copy visible; `#confirm-import` reads "Import 2
     notes" for the markdown-import preview; switching to Skip with 1
     conflict changes the label accordingly.
   - About shows "Your data", three `.data-stat` cards, and status rows with
     `data-state` set.
   - quick capture has no `h2`, carries `aria-label`, and the foot preview
     mirrors typed text with a `**HH:MM**`-style timestamp; destination
     wording flips in the editing-today branch.
2. Entire existing suite stays green (920 currently) across all 3 browsers.
3. `bun run verify` green; CSP hashes unchanged
   (`recompute-csp-hashes.sh` — no inline scripts touched).
4. Light + dark screenshots of all four surfaces reviewed.
5. DESIGN.md Dialogs section gains a short Phase 2 note.

## Assumptions (explicit)

- "count" card = active notes (archived/trash/drafts stay visible in the meta
  line so nothing regresses to hidden).
- Check-for-updates lives on the offline-cache status row (both are
  service-worker concerns); no dedicated updates row.
- Removing the quick-capture close button is intended by "spotlight bar";
  Esc and click-outside behavior are unchanged.
- Import button counts notes only; folders/revisions ride along silently.
