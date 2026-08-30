# Chronicle dialog recipe — apply design handoff

Source spec: `design_handoff_chronicle_dialogs/` (README + snippets). Tier:
Standard (bounded, exact code provided, no public contract change — ids/roles
untouched; design already approved, so continuous pass per standing correction).

## Plan
- [x] 1. Survey test assertions touching dialog copy/structure — none assert on
      the changed copy or structure; no spec updates needed.
- [x] 2. Apply `index.html` hunks 1–3 (share zones, erase zone, palette footer).
- [x] 3. Append recipe CSS block to end of `public/css/app.css` (order-dependent).
- [x] 4. Targeted specs 155/155 green, then full `verify` green and full suite
      920 passed / 7 skipped (chromium, firefox, webkit).
- [x] 5. Visual check: all five dialogs captured light AND dark in
      `.verify/chronicle-dialogs/` — rust tints and --accent-text verified.
- [x] 6. `bash cloudfront/recompute-csp-hashes.sh` — all hashes verified, no
      change (no inline scripts touched).
- [x] 7. DESIGN.md: new "Dialogs" section (5 recipe rules) + Typography chrome
      line amended (dialog titles now serif).
- [x] 8. Commit. Handoff bundle left untracked (biome-formatted its .css so
      check:format's untracked-file sweep passes).

## Resuming From Here
- Done: everything above; working tree committed.
- Next: nothing pending from this task. Phase 2 of the handoff (About "Your
  data" panel, import stat cards, quick-capture spotlight bar, erase button
  gating) is designed but NOT implemented — specs available from the designer
  on request.
- Assumption: quick-capture title keeps its 19px size override but picks up
  the serif family — treated as intended by the recipe.
