# Standards and simplification — implementation

Spec: `tasks/spec.md` (approved 2026-08-27)

- [x] Restore the green baseline
- [x] Reconcile standards and tooling
- [x] Remove retired search-scope code
- [ ] Consolidate accessible menu behavior
- [ ] Flatten the Indigo on Paper CSS cascade
- [ ] Run final local, browser, privacy, and visual verification
- [ ] Produce the change report and comprehension quiz

## Resuming From Here

- Current phase: consolidate accessible menu behavior; search now has one explicit all-fields path.
- Next: characterize the shared keyboard, focus, outside-click, and ARIA contract across all four menus.
- Assumptions: v18 becomes canonical; legacy structural and coverage gaps use non-regression ratchets; the accepted plan authorizes continuous implementation and focused local commits.
- Blockers: none.

---

# Indigo on Paper (v5) — implementation history

Spec: docs/superpowers/specs/2026-08-16-indigo-on-paper-design.md (approved)

- [x] RED: typography.spec.js flipped to serif contract; design-tokens.spec.js added (warmth + AA + dark parity + accent pin); both failed for the right reason
- [x] GREEN: inkwell-tokens.css warm swap (light + both dark blocks byte-parallel)
- [x] GREEN: app.css serif voice (doc title, list heading, rendered headings, date spine)
- [x] Sweep: select chevrons re-hued (components light %2375706A, tokens dark %23948A79)
- [x] Verify: full Playwright suite 871/871 green (chromium/firefox/webkit); browser screenshots light+dark in .verify/indigo-on-paper-*.jpg
- [x] Docs: repo CLAUDE.md design section, DESIGN.md front matter + body
- [x] Commit d6c4878 (version.js pre-existing edit and GSD-Design-Reference.html left alone)

- [x] Released: v3.10.0 bump (264040c), pushed, deployed as scratchpad-deploy, invalidation I6MKSI3CEGAC5D388MBCL0823D; production verified (3.10.0 + warm tokens live)

## Resuming From Here
- Done: v5 designed, implemented, tested (871 green), committed, pushed, and deployed to notes.vinny.dev as v3.10.0.
- Next (only if asked): OG image warm refresh (public/og-image.svg → rsvg-convert; banner still shows cool porcelain); .impeccable/design.json regeneration (left stale on purpose — accent unchanged).
- Assumptions: --text-muted stays decorative-secondary (ratios match or beat v4, documented in spec); pure-white --paper is intentional per GSD surface.
- Blockers: none.
