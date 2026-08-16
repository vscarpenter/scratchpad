# Indigo on Paper — warm-neutral redesign (v5)

**Status:** approved 2026-08-16 (Variant B of the GSD comparison mockups;
see the "Scratchpad on Paper" artifact from the exploration session).
**Supersedes:** Porcelain Chronicle (v4,
`2026-07-31-porcelain-chronicle-indigo-design.md`) — structure and accent
survive; the neutral foundation and display voice change.

## Decision

Adopt two of the three dials from GSD's design language
(`GSD-Design-Reference.html`) and decline the third:

1. **Temperature** — cool porcelain neutrals become GSD's warm paper ramp,
   in both themes.
2. **Voice** — the document title, list date heading, and rendered prose
   headings speak in the platform serif (`--serif`, already Iowan Old
   Style / Palatino) instead of heavy sans. Chrome stays sans; metadata
   stays mono.
3. **Pigments — declined.** Indigo `#5661B3` remains the sole accent.
   The four-pigment folder idea (Variant C) is explicitly out of scope;
   it would break the repo's "one accent" rule and needs its own spec if
   folder wayfinding ever earns it.

Everything else in Porcelain Chronicle stands: the chronology rail, the
opaque note index, the single raised document, 1px hairlines, mono
metadata, no glass in the shell, no emoji, no remote assets.

## What deliberately does not change

- The entire accent block, light and dark (`--accent` `#5661B3` /
  `#8593D6`, `--accent-text`, focus rings, primary shadows). The dark
  accent math is already AA-validated; this is the reason Variant B wins.
- Brand assets: favicon, `theme-color`, OG image, share.html styling
  (it inherits the tokens).
- Semantic colors (success / warning / rust / info) in both themes.
- All HTML shells and inline scripts — **no CSP hash movement.**
- Dark-mode structure: Pattern B cascade, byte-parallel dark blocks.

## Token values (light)

| Token | Porcelain (v4) | Indigo on Paper (v5) |
|---|---|---|
| `--wash-base` (stage/canvas) | `#EFF1F7` | `#ECE7DC` |
| `--paper` (document, cards) | `#FFFEFE` | `#FFFFFF` |
| `--surface-rail` | `color-mix(paper 88%, ivory)` | `color-mix(paper 40%, ivory)` ≈ `#F4F0E6` |
| `--surface-list` | `color-mix(paper 42%, ivory)` | `color-mix(paper 75%, ivory)` ≈ `#FAF7EF` |
| `--oat` | `#E9EBF4` | `#E7E1D3` |
| `--ink` / `--slate` | `#25283A` | `#211E1A` |
| `--text-secondary` | `#484B61` | `#55504A` |
| `--text-body` | `#3F4358` | `#423D36` |
| `--text-muted` | `#73788C` | `#797368` |
| `--text-quote` | `#444A66` | `#514A3E` |
| `--hairline-color` | `#E1E3EF` | `#E3DDD0` |
| `--hairline-color-2` | `#D9DBEA` | `#D8D1C1` |
| `--idle-border` / `--meta-dot` / `--gray-300` | `#CBD0E0` | `#C9C1B0` |
| `--accent-soft` / `--accent-soft-2` | `#E8EAFA` / `#D9DDF4` | `#E8E9F4` / `#DBDDF1` |
| ink-based fills (`--control-fill` etc.) | `rgba(37,40,58,α)` | `rgba(33,30,26,α)` same α |
| cool shadows | `rgba(35,42,90,α)` / `rgba(28,30,40,α)` / `rgba(55,61,105,α)` | `rgba(40,33,22,α)` / `rgba(33,30,26,α)` same α |
| `--glass-bg` family | `rgba(255,254,254,α)` | `rgba(255,255,255,α)` |
| `--glass-border` / strong | `#D9DBEA` / `#CBD0E0` | `#D8D1C1` / `#C9C1B0` |
| `--backdrop` | `rgba(20,24,44,.35)` | `rgba(28,23,14,.35)` |

Note the rail/list mix ratios flip on purpose: in v5 the note index is the
lighter panel and the rail the deeper paper, matching the approved mockup,
and the same formulas produce the warm dark panels automatically.

## Token values (dark — both blocks, byte-parallel)

| Token | v4 | v5 |
|---|---|---|
| `--wash-base` | `#101219` | `#100E0A` |
| `--paper` | `#232634` | `#221E17` |
| `--slate` / `--ink` | `#E8E9F0` | `#F1ECE2` |
| `--oat` | `#2B2D38` | `#2C2822` |
| `--text-secondary` | `#B4B8C4` | `#B3ACA0` |
| `--text-muted` | `#8E92A0` | `#948A79` |
| `--text-body` | `#C9CBD4` | `#CFC9BD` |
| `--text-quote` | `#B9BEDD` | `#CBC2B0` |
| `--idle-border` / `--meta-dot` | `#4A4D5A` | `#4A4438` |
| `--gray-300` | `#3A3D48` | `#3B362C` |
| `--glass-bg` family | `rgba(23,26,36,α)` | `rgba(26,23,17,α)` |
| wash gradients | keep indigo + amber radials over the new base |
| hairlines, control fills, shadows, accent block, semantics | unchanged |

The dark `.select` chevron stroke moves `%238E92A0` → `%23948A79` (both
blocks); the light chevron in `inkwell-components.css` moves `%236F6F75`
→ `%2375706A`.

## Type voice (app.css, desktop ≥768px overrides only)

| Rule | v4 | v5 |
|---|---|---|
| `.note-doc-title` | `--sans` 36px / 750 / -0.045em | `--serif` 36px / 600 / -0.015em |
| `.chronicle-sidebar-heading h2` | `--sans` 22px / 700 | `--serif` 23px / 600 / -0.01em |
| `.note-rendered h1/h2/h3` | forced `--sans` | override removed — base serif voice returns |
| `.editor-date-spine` number | inherits sans | `--serif` 600 |

Mobile base styles already use the serif title; the desktop sans override
is what this spec removes. Chrome (buttons, rows, chips, dialogs, empty
states) stays sans. The mono metadata voice (eyebrow, timestamps, tags,
`⌘K`) is retained everywhere — it is Scratchpad's own signature and the
second thing besides indigo that keeps this from being a GSD clone.

## Accessibility contract

Executable in `tests/design-tokens.spec.js`:

- Ink, secondary, and body text clear **4.5:1** on every surface they sit
  on, both themes.
- `--accent-text` clears **4.5:1** on `--accent-soft` composited over
  `--paper`, both themes (the v4 dark math is retained verbatim).
- `--on-accent` clears **4.5:1** on `--accent`, both themes.
- `--text-muted` is decorative-secondary (timestamps, placeholders); v5
  matches or improves every v4 muted ratio (e.g. muted-on-stage 3.85 vs
  3.84, muted-on-paper 4.94 vs 4.31 — the token comment already documents
  the decorative exemption).
- The two dark blocks in `inkwell-tokens.css` remain byte-parallel
  (asserted structurally, not by eye).

## Out of scope

Four-pigment folders (Variant C), dialog/onboarding glass retirement,
content-page redesign beyond inherited tokens, OG image re-rendering,
version bump and deploy (separate release step).
