# Chronicle dialog recipe — Phase 2 implementation

Spec: `tasks/spec.md`. All four surfaces shipped as one red/green/refactor
cycle each, one commit per surface, plus a visual-polish and docs commit.

## Plan
- [x] 1. Erase gating (`566a2db`) — disabled-until-ERASE contract; dead
      error UI removed as the ratchet offset (deviation noted in spec).
- [x] 2. Import preview (`ed1ece4`) — stat cards, consequence radios,
      outcome-stating button; new `public/js/dialogs.js` module.
- [x] 3. About "Your data" (`15e7c52`) — 3 stat cards, meta line, dotted
      status rows with inline actions; all diagnostic ids preserved.
- [x] 4. Quick capture spotlight (`e58364a`) — no title bar, live foot
      preview + destination; pure helpers moved to ScratchpadDialogs.
- [x] 5. Full verify green; full suite 932 passed / 7 skipped (3 browsers).
- [x] 6. Light + dark screenshots in `.verify/chronicle-dialogs-phase2/`,
      reviewed; erase gate made visibly inert + indigo radios (`5140165`).
- [x] 7. CSP hashes verified unchanged; DESIGN.md Phase 2 note.
- [x] 8. Docs commit. No version bump / deploy unless asked.

## Resuming From Here
- Done: Phase 2 complete on main, all gates green, committed.
- Next: nothing pending. Deploy needs an explicit go-ahead (version bump to
  v3.14.0 + ./deploy.sh).
- Blockers: none.
