# Soft Glass — Scratchpad visual redesign

**Date:** 2026-07-08
**Source handoff:** `design_handoff_soft_glass/README.md` + `soft-glass-reference.html`
**Status:** approved design → implementation

## Goal

A full visual reskin of Scratchpad in the **Soft Glass** direction: frosted floating
glass panels over a faintly tinted wash; system sans replaces the serif/mono editorial
identity; the indigo accent lifts to `#4E5FD8`; pills, squircles and soft shadows replace
the flat 1.5px-border surfaces. Functionality is unchanged — same screens, same features.
This is a token + component-CSS rewrite plus a handful of small structural HTML moves.

## Decisions (from brainstorming)

1. **Override the Inkwell hard rules and update the docs.** Soft Glass intentionally
   retires three documented Inkwell rules — 1.5px borders → 1px hairlines, flat no-shadow
   surfaces → glass shadows, no-gradients → gradient glyph/display-text/wash. `CLAUDE.md`
   and the Inkwell notes get updated so the stated rules match reality. **Unchanged:** all
   colors still route through `var(--token)`; everything stays same-origin (no third-party
   scripts/fonts/trackers); `innerHTML`/`DOMPurify`/`replaceChildren` safety rules hold.
2. **All four screens** in one pass: main reader, editor, empty/first-run, About hero+sections.
3. **Decorative format chips** (B/I/`</>`/link) — visual only, no wiring. The `#search-scope`
   `<select>` is removed; search keeps matching all fields (existing default). No other JS logic changes.
4. **Dark mode included**, via the existing Pattern-B cascade, AA-validated before done.

## Architecture — three CSS layers, edited by leverage

### 1. `public/css/inkwell-tokens.css` — palette + glass tokens

Redefine brand/surface tokens in place so existing `var()` consumers reskin automatically.
Keep **old token names aliased** to new values where practical (e.g. `--accent`, `--paper`,
`--slate`, `--ivory`, `--gray-*`, `--rust*`). Add a new glass group:

- `--wash-base: #F3F4F8`; `--wash-app` and `--wash-hero` radial-gradient stacks (per handoff tokens).
- `--glass-bg: rgba(255,255,255,0.66)`, `--glass-blur: 26px`,
  `--glass-border: 1px solid rgba(255,255,255,0.9)`,
  `--glass-shadow: 0 20px 50px rgba(35,42,90,0.12)`,
  `--glass-fallback: rgba(255,255,255,0.94)` (opaque, for no-blur / reduced-transparency).
- Accent: `--accent: #4E5FD8`, `--accent-d: #4553C4`, `--accent-soft: #EBEEFC`,
  `--accent-soft-2: #DDE2FB`, gradient stops `#5B6CE4`, `--accent-focus-ring: rgba(78,95,216,0.25)`.
- Ink/text: `--slate/ink #1C1E28`, secondary `#5D6170`, muted `#9A9EAD`, body `#33353F`.
- Hairline `rgba(28,30,40,0.06–0.07)`, control fill `rgba(28,30,40,0.05)`, code fill `rgba(28,30,40,0.05)`.
- Success `#57B26A` (text `#3B7A4B`, tint `rgba(87,178,106,0.12)`); Warning `#E8A23D`
  (text `#A2701F`, tint `rgba(232,162,61,0.14)`); checkbox idle `#C9CBD4`, meta dots `#C9CBD4`.
- New radii tokens as needed: 7 (inline code), 9 (glyph), 11 (segmented track), 16 (textarea),
  22 (panels), 26 (empty card). Reuse existing `--r-*` where they line up.
- `--border` becomes a **1px hairline** (`1px solid var(--hairline)`); focus ring token → the new soft-glass halo.

Dark mode: extend the `@media (prefers-color-scheme: dark)` + `[data-theme="dark"]` blocks
(both, kept byte-parallel) with the handoff's proposal: wash base `#101219`; glass
`rgba(23,26,36,0.62)`, border `rgba(255,255,255,0.08)`; ink `#E8E9F0`, secondary `#9A9EAD`,
control fill `rgba(255,255,255,0.06)`; accent lifts to `#7A8AD1` (on-accent text `#0E1016`),
accent-soft `rgba(122,138,209,0.16)`. **Validate AA contrast** for text-on-glass and on-accent.

### 2. `public/css/inkwell-components.css` — shape language

- `.btn` → pill (`--r-pill`), primary carries `box-shadow: 0 8px 18px rgba(78,95,216,0.35)`;
  `.btn-sm` smaller shadow; secondary = control-fill pill; ghost unchanged behavior; danger on rust.
- `.input` / `.search-control` → inset field (`rgba(255,255,255,0.85)`, 1px hairline, inset shadow, radius 12).
- `.segmented` → track `rgba(28,30,40,0.05)` radius 11 pad 3; active segment white + shadow.
- `.badge` / chips → pill, accent-soft chips (`#EBEEFC`/`#4E5FD8`), success/warning tints.
- `.dialog` → glass card radius 22, backdrop `rgba(20,24,44,0.35)` + `backdrop-filter: blur(8px)`.
  Dialog heading returns to sans (drop serif) per Soft Glass.
- `kbd` → soft chip per token spec.
- Press affordance: pills `active { transform: scale(0.98) }` `120ms` ease; hovers per handoff.

### 3. `public/css/app.css` — layout + per-screen

- **Shell:** keep the grid (`grid-template-columns: 302px 1fr; grid-template-rows: 1fr`) — the
  three layout tripwires stay. Add `padding: 18px; gap: 16px`; put `--wash-app` on the shell/body
  (app page only). Sidebar + `.main` become glass cards: `--glass-*`, `radius: 22px`,
  `overflow: hidden`, `contain: layout style paint`. Remove the sidebar's accent top-border.
- **Glass fallback:** `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`
  and `@media (prefers-reduced-transparency: reduce)` → panels use `--glass-fallback`, no blur.
  Always emit `-webkit-backdrop-filter` alongside `backdrop-filter`.
- **Panel entrance (optional):** `opacity` + `translateY(8px)` → 0, `300ms ease-out`, gated by
  `@media (prefers-reduced-motion: reduce)` (no transform/opacity animation).
- **Sidebar:** brand glyph gradient squircle (restyle `.brand-mark` bg to gradient + shadow, radius 9);
  wordmark sans 700 16px; theme toggle → 28px control-fill circle. `.sidebar-kicker` (note count)
  is replaced structurally by the **status chip** at the sidebar foot ("Local-only · never syncs",
  green dot). Search pill; New-note primary; view switch → segmented (Notes/Trash/Tags).
- **Note list:** section labels (uppercase 10.5px muted, amber pin on "Pinned"); default row
  transparent radius 14, hover control-fill; **active/selected** row → white card, 1px accent border,
  card shadow, tag chips; pinned handling preserved.
- **Editor head:** breadcrumb pill; pin/share → 32px circles (pin active = accent-soft);
  Edit/Save → primary pill; overflow circle; decorative format-chip group (edit mode only);
  Unsaved chip → warning-tint pill.
- **Editor doc:** title 32px sans with 2px accent caret bar; dashed add-tag chip; textarea surface
  `rgba(255,255,255,0.7)`, 1px hairline, radius 16, inset shadow, mono 14px/1.85; foot meta row.
- **Rendered markdown:** base 15.5px/1.75 `#33353F`; h3 700 20px; inline code radius 7 code-fill;
  code block radius 14 no border; blockquote accent-soft bg + 3.5px pill accent bar, italic;
  task-list checkboxes 18px radius 6 (checked = accent fill + white check + strike label).
- **Empty/first-run:** `#empty-no-notes .onboarding-panel` → centered glass card (radius 26,
  `rgba(255,255,255,0.72)`, blur 28, white border, big shadow); icon squircle 64px gradient;
  trust chips (success/neutral/accent-soft); floating status chip bottom-left of viewport.
  Other empty states (no-results, pick-one, trash) inherit tokens cleanly.

### `index.html` DOM changes (static, no `innerHTML`)

- Remove the app-page `<footer class="app-footer">…</footer>`.
- Add a **status chip** element at the sidebar foot (after `.note-list` or in sidebar foot).
- Add a decorative **format-chip group** in `.editor-head` (shown only in edit mode via `.editor-card.is-editing` / a body/editor state class already toggled).
- Remove the `#search-scope <select>` (+ its `<label>`). Search JS default already matches all fields.
- Keep `#note-breadcrumb`, `#dirty-indicator`, `#pin-toggle`, `#share-btn` — restyle only.
- **Do not touch** the inline `<head>` theme script or the bottom toggle script (CSP hash parity).

### `about.html` changes

- Rework hero: centered floating **nav pill** (brand + Privacy/Terms + Open-app pill); gradient
  **display headline**; lede; CTA pills (primary + glass); trust chips; DOM **app-preview mock**
  panel rising from the fold. Restyle sections below to glass panels (radius 22), accent feature
  icons, kbd chips. Wash = `--wash-hero`. Do not touch inline scripts.

### `app.js`

No logic changes. After removing `#search-scope`, ensure any reference is null-guarded so nothing
throws (verify by grep). Everything else is render-only and already emits the classes we restyle.

## Non-goals / YAGNI

- No functional format toolbar, no command-palette scope relocation, no markdown highlighter in the textarea.
- No favicon regeneration (noted as "later" in handoff).
- No new dependencies, no build step, no network calls. `marked`/`DOMPurify` stay vendored.

## Risks & protections

| Risk | Protection |
|------|-----------|
| Break note-list scroll | Keep grid + 3 tripwire rules; verify with many notes. |
| Invalidate CSP hashes | Never edit inline `<head>`/toggle scripts. |
| backdrop-filter perf/support | `-webkit-` prefix, blur only on 2 panels, `contain`, `@supports`+reduced-transparency opaque fallback. |
| Dark-mode contrast regressions | AA-validate text-on-glass and on-accent before marking done. |
| Deploy scope drift | All edits in already-deployed files (`public/css/*`, `index.html`, `about.html`, `CLAUDE.md` is not deployed). |

## Verification

Serve `python3 -m http.server 8080`; browser-drive: reader, edit mode, empty first-run, About
hero, **light + dark**, mobile (<768px one-pane), note-list scroll with many notes, transparency +
reduced-motion fallbacks. Screenshots → `.verify/`. Pre-commit hook (innerHTML guard) must pass.
No real deploy without explicit user go-ahead.
