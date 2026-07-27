# Claude Code kickoff prompt

Paste this into Claude Code from the root of the `scratchpad` repo. Work one change at a time.

---

We are implementing five scoped UI changes to Scratchpad. Read `design_handoff_scratchpad_ui/README.md` first. It has the full spec, exact token names, file and line references, and per-change acceptance criteria. Open `design_handoff_scratchpad_ui/Scratchpad UI Review.dc.html` in a browser to see each proposal drawn beside the current UI.

Ground rules:

- This repo is static HTML, CSS, and vanilla JS with no build step. Keep it that way. No new dependencies.
- Every color, size, radius, and shadow comes from `public/css/inkwell-tokens.css`. If a value is not in there, ask before adding one, and mirror any new token into both dark mode blocks.
- Follow `coding-standard.md` and `CLAUDE.md` in the repo root.
- Keep every element id. The command palette, keyboard shortcuts, and the Playwright specs all bind to them.
- Keep coarse-pointer targets at 44px or larger. `tests/touch-targets.spec.js` enforces it.
- If you change an inline `<script>` in `index.html`, run `cloudfront/recompute-csp-hashes.sh` and say so in the PR body.
- Apply the vinny-voice skill to any UI copy, commit messages, and PR descriptions.

Order of work, one branch and one PR per change:

1. Sidebar header, five rows down to two. Target 217px or less for `.sidebar-head`.
2. Note rows, metadata on every row and a lighter active state.
3. Editor rail, fixed top rail plus a floating format pill and a focus mode button.
4. Backup status chip replacing the footer slogan, with the export menu moved out of the About dialog.
5. Typography, serif headings and matched read and edit metrics.

For each change: implement it, run `npx playwright test`, update the specs named in that change's acceptance section, and check light mode, dark mode, and a 390px viewport before you open the PR. Report anything in the spec that fights the existing code instead of working around it.

Two existing bugs to fix along the way, both documented in `ui-design-suggestions.md`:

- `selectNote()` returns early before setting `mobileView = 'editor'`, so tapping the already-selected row on mobile does not open the editor.
- The theme control on about.html, privacy.html, and terms.html renders as text but inherits the 30px square `.theme-toggle` rule, so it collapses.

One decision is open and change 5 depends on it. PRODUCT.md lists glassmorphism and gradients as anti-references. Inkwell 3.0 "Soft Glass" is built on both. Ask me which one wins before you start the typography change.
