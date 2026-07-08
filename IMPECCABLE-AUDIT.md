# Scratchpad — Technical Audit

Scope: all pages (`index.html` app + `about.html`, `privacy.html`, `terms.html`),
`app.css`, `inkwell-*.css`, `app.js`. Register: **product** (app), with `about.html`
as a **brand** surface. Goal weighting: aesthetic refinement; a11y at functional minimum.

Code-level audit (measurable/verifiable in the implementation). Visual design
critique is a separate pass (`/impeccable critique`).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3/4 | `role="menu"` overflow lacks arrow-key nav + focus management; two `<h1>` on app page |
| 2 | Performance | 4/4 | Lean vanilla, no build, vendored libs, reduced-motion honored; full sidebar re-render is the only watch-item |
| 3 | Responsive Design | 3/4 | Solid structural collapse; icon buttons pass 24px AA but miss the 44px comfort target; ≤22px × controls are the one possible AA case |
| 4 | Theming | 4/4 | Zero hardcoded hex in app CSS; dark mode is pure token-flip; SVG mockup flips automatically |
| 5 | Anti-Patterns | 3/4 | App surface is tell-free; `about.html` carries eyebrow-per-section (7×) + stacked icon-card grids |
| **Total** | | **17/20** | **Good — high craft, refinement opportunities concentrated on `about.html` + minor a11y polish** |

## Anti-Patterns Verdict

**Does this look AI-generated? The app (`index.html`): no. The about page: partly.**

The application shell is the opposite of slop — it's a committed, opinionated
product UI. Buttons, inputs, dialogs, and the editor all draw from one coherent
token system; there's no gradient text, no decorative glassmorphism (the only
`backdrop-filter` is a purposeful 2px modal scrim), no hero-metric template, no
mismatched controls. The hand-built, theme-aware SVG app mockup on `about.html`
is genuinely distinctive craft. This passes the product slop test: a user fluent
in Linear/Notion/iA Writer would trust it.

The tells live on `about.html`, and they're exactly the two lanes you named as
anti-references ("Generic AI-template aesthetic"):

1. **Eyebrow above every section (7 of 7).** `How it works`, `What's in the box`,
   `An architectural fact, not a policy`, `Why local-first`, `If you live in the
   keyboard`, `Open in a new tab`, plus the hero. The copy is witty, but the
   *structure* — a tiny uppercase mono kicker over every section — is the
   2023-era AI scaffold. One named kicker as a system is voice; seven is grammar.
2. **Stacked identical card grids.** Three step-cards + six icon-heading-body
   feature cards + a 2×2 promise grid, in sequence. For a "calm, editorial,
   restrained" target, that's more boxes than the content needs.

Neither is fatal — they're confined to the marketing page and executed well — but
they're the highest-leverage aesthetic-refinement target precisely because they're
the patterns you explicitly want to avoid.

Two things that *look* like bans but are defensible:
- **Numbered markers (01/02/03)** on "How it works" — justified: it's a genuine
  3-step sequence where order carries meaning. Not the numbered-eyebrow reflex.
- **1.5px left-edge on active/pinned note rows** — technically a "side-stripe,"
  but at 1.5px it's a selection indicator (Gmail/Linear idiom), it's the Inkwell
  signature border width, and the PRD explicitly sanctioned it. Keep it.

## Executive Summary

- **Audit Health Score: 17/20 (Good).** This is a well-built, high-craft codebase;
  findings are refinements, not rescue work.
- **Issues by severity: P0 0 · P1 0 · P2 4 · P3 6.**
- **Top issues:**
  1. `about.html` eyebrow-per-section + stacked card grids (anti-pattern, on-brand-violation)
  2. `role="menu"` overflow menu has no arrow-key navigation or focus-into-menu
  3. Four `alert()` calls break the otherwise-custom dialog/feedback system
  4. No success feedback after export / delete / restore / pin (copy has it; the rest don't)
- **Recommended next steps:** `quieter` on `about.html`, then `harden` for the
  feedback/menu gaps, then a `polish` pass.

## Detailed Findings by Severity

### [P2] Eyebrow above every section on `about.html`
- **Location:** `about.html` — 7 `<p class="eyebrow">` (lines 55, 198, 240, 293, 348, 378, 405)
- **Category:** Anti-Pattern
- **Impact:** The uppercase-mono-kicker-per-section pattern is the single most
  common AI-generation tell and is on your explicit anti-reference list. It makes
  a thoughtful page read as templated.
- **Recommendation:** Keep at most 1–2 as deliberate accents (hero + maybe one
  pivot section). Let the serif `h2`s carry the sections on their own; vary the
  cadence so sections aren't all `eyebrow → h2 → lede`.
- **Suggested command:** `/impeccable quieter about.html`

### [P2] Stacked identical card grids on `about.html`
- **Location:** `about.html` `.about-steps` (3), `.about-features` (6); `app.css:1565–1643`
- **Category:** Anti-Pattern
- **Impact:** Three boxed grids in a row read busier than "calm/editorial/restrained."
  The 6-up icon+heading+body grid is the textbook identical-card-grid.
- **Recommendation:** Demote the feature grid to a typographic list or a 2-column
  definition layout; drop the per-card borders so the section breathes. The unified
  bordered promise grid (`.about-promises`) is the better model already on the page.
- **Suggested command:** `/impeccable layout about.html`

### [P2] Overflow menu (`role="menu"`) under-delivers its ARIA contract
- **Location:** `app.js:866–898` (`openOverflowMenu`/`onOverflowKey`), `index.html:130–140`
- **Category:** Accessibility
- **Impact:** The menu *is* keyboard-operable — items are real `<button>`s (Tab to
  reach, Enter to activate, Esc to close), so this is **not** a keyboard blocker. The
  gap is narrower: it advertises `role="menu"` + `role="menuitem"`, which promises the
  ARIA Authoring Practices menu pattern (focus moves into the menu on open, Up/Down
  arrows cycle items), and the handler only does `Escape`. The role out-promises the
  behavior.
- **Recommendation:** Either deliver the pattern (focus first item on open; Up/Down +
  Home/End; restore focus to trigger on close — already done for Esc), **or** drop the
  `role="menu"`/`role="menuitem"` and treat it as a plain disclosure of buttons, which
  is what it already behaves like.
- **WCAG:** 4.1.2 (Name, Role, Value) — ARIA-APG mismatch, not a 2.1.1 keyboard failure
- **Suggested command:** `/impeccable harden` (overflow menu)

### [P2] `alert()` breaks the custom dialog + feedback system
- **Location:** `app.js:1417, 1461, 1466, 1991`
- **Category:** Anti-Pattern (consistency) / Accessibility
- **Impact:** Everywhere else you use styled native `<dialog>`s and an `aria-live`
  share-status. These four error paths (no notes to export, bad import JSON, no
  valid notes, DB open failure) fall back to a jarring OS `alert()` that doesn't
  match the app's voice or theme.
- **Recommendation:** Route them through the same surface as copy feedback — an
  `aria-live` status line or a small toast — or a styled dialog for the fatal
  DB-open case.
- **Suggested command:** `/impeccable harden` (error + empty-state messaging)

### [P3] No confirmation feedback after export / delete / restore / pin
- **Location:** `app.js` `exportAll`, `exportMarkdownZip`, `moveCurrentToTrash`,
  `restoreCurrentFromTrash`, `togglePin`
- **Category:** Anti-Pattern (state feedback)
- **Impact:** Copy-to-clipboard announces success (`showShareStatus`, line 1306),
  but export downloads and destructive moves complete silently. For a local-only
  app where export *is* the backup story, silent success undercuts trust.
- **Recommendation:** Reuse the `aria-live` status pattern for a brief "Backup
  downloaded" / "Moved to Trash" confirmation.
- **Suggested command:** `/impeccable delight` or `/impeccable harden`

### [P3] Two `<h1>` elements on the app page
- **Location:** `index.html:50` (`.brand-title`) and `index.html:147` (`#note-title-display`)
- **Category:** Accessibility
- **Impact:** The sidebar brand and the open note are both `<h1>`. Modern HTML
  tolerates it, but for SR users a single top-level heading per page is cleaner.
- **Recommendation:** Demote the sidebar brand to a `<p>`/`<div>` wordmark (or
  `aria-label` the masthead) and let the note title be the page's sole `<h1>`.
  Also: empty states jump brand-`h1` → `h3` with no `h2`.
- **Standard:** Best-practice/convention, not a strict violation — HTML5 permits
  multiple `<h1>`. (Adjacent to WCAG 1.3.1 Info & Relationships; don't bill it as a failure.)
- **Suggested command:** `/impeccable harden`

### [P3] A few controls below the 44px comfort target (one possible AA case)
- **Location:** `app.css` — theme toggle 30×30 (`:99`), icon-btn 34×34 (`:467`),
  dialog-close 28×28 (`inkwell-components.css:612`); and the small `×` controls
  `tag-pill-remove` (`:535`) / `filter-x` (`:173`), which sit inside 22px-tall
  `.badge` pills (`inkwell-components.css:350`)
- **Category:** Responsive
- **Impact:** Important to get the standard right, since you asked for functional
  minimum: **WCAG 2.5.8 (Target Size Minimum, AA) is 24×24px** — the 30/34/28px
  controls all *pass* AA and only miss the 44px *comfort* target (that's 2.5.5
  Enhanced/AAA + platform HIG). The genuine candidates for a 2.5.8 AA concern are the
  `×` buttons, whose effective tap height is ≤~22px inside their pills.
- **Recommendation:** Prioritize the `×` controls — pad their hit area past 24px
  (ideally toward 40px on `@media (pointer: coarse)`) without growing the visual
  mark; the footer links already do this. The 28–34px icon buttons are a comfort
  nicety, not a compliance must.
- **WCAG:** 2.5.8 (Target Size, Minimum — AA) — *only* the ≤22px `×` controls; the rest are AAA-comfort
- **Suggested command:** `/impeccable adapt`

### [P3] `scroll-behavior: smooth` not disabled under reduced motion
- **Location:** `inkwell-components.css:29`; reduced-motion block at `:848–853` only
  zeroes `animation`/`transition` duration
- **Category:** Accessibility
- **Impact:** Users with `prefers-reduced-motion` still get smooth-scroll jumps
  (anchor nav, focus scroll).
- **Recommendation:** Add `scroll-behavior: auto !important` to the reduced-motion block.
- **Suggested command:** `/impeccable harden`

### [P3] Active note row uses a surface shadow
- **Location:** `app.css:239` (`.note-row.is-active { box-shadow: var(--shadow-sm) }`)
- **Category:** Anti-Pattern (design-system fidelity)
- **Impact:** Inkwell's stated rule is "no drop shadows on surfaces." The selected
  row carries a hairline `--shadow-sm`. It's subtle, but it's the one place the app
  steps outside its own no-surface-shadow rule.
- **Recommendation:** If you want strict Inkwell fidelity, lean on the existing
  accent left-edge + `--paper` background for selection and drop the shadow. Low stakes.
- **Suggested command:** `/impeccable polish`

### [P3] Full sidebar re-render on every state change
- **Location:** `app.js:432` (`renderSidebar` → `replaceChildren`), called by `renderAll`
- **Category:** Performance
- **Impact:** Every keystroke (debounced 150ms), pin, tag edit rebuilds the entire
  list. Negligible at dozens of notes; for a power user with thousands it could
  stutter. YAGNI today.
- **Recommendation:** Note for later — diff/keyed update or windowing if note counts
  grow. Don't pre-optimize now.
- **Suggested command:** `/impeccable optimize` (only if it ever bites)

## Patterns & Systemic Issues

- **Landing-page scaffolding reflex (about.html only):** eyebrow-per-section +
  multiple card grids are the recurring shape. Fixing the cadence once fixes the
  page's "templated" read.
- **Feedback is inconsistent, not absent:** one path (copy) does `aria-live`
  correctly; export/delete/restore/pin and four error paths don't. Standardize on
  the pattern that already exists.
- **ARIA contracts that out-promise behavior:** the `role="menu"` is the clearest
  case — the role implies keyboard semantics the handler doesn't deliver.

## Positive Findings (keep + replicate)

- **Theming is exemplary.** Zero hardcoded hex in `app.css`; dark mode is a pure
  token flip with *no* `[data-theme]` rules in app CSS; even the SVG mockup reads
  from tokens and flips automatically. This is the model to protect.
- **Privacy is structural, not decorative.** Vendored marked/DOMPurify, sanitized
  markdown via `RETURN_DOM_FRAGMENT` + `replaceChildren`, external links forced to
  `rel="noopener noreferrer"`, zero network calls. The product guarantee is real.
- **Native `<dialog>` done right** — `showModal()` gives focus trap, Esc, and
  focus-return for free across nine dialogs.
- **Genuine craft details:** the theme-aware SVG mockup, the editorial empty-state
  ("A page is a small private room"), the bucketed sidebar (Today / Yesterday /
  This week), and the dependency-free ZIP writer all signal care.
- **Lean by construction:** no build step, ~60KB JS, inline SVG icons, reduced-motion
  honored globally, animations limited to transform/opacity.
- **Strong, specific copy** across privacy/terms/about — no buzzwords, real voice.

## Recommended Actions (priority order)

1. **[P2] `/impeccable quieter about.html`** — cut eyebrows to 1–2, vary section cadence.
2. **[P2] `/impeccable layout about.html`** — demote the icon-card feature grid; let the page breathe.
3. **[P2] `/impeccable harden`** — overflow-menu keyboard semantics, replace `alert()`s, add export/action feedback, reduced-motion scroll, h1 hierarchy.
4. **[P3] `/impeccable adapt`** — bump small touch targets to ≥40px on coarse pointers.
5. **[P3] `/impeccable polish`** — final pass (active-row shadow, last details) before shipping.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.
