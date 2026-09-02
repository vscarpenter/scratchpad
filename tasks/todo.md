# One-pass train v3.22 → v4.1 (2026-09-01) — v3.25 shipped, v4.0 next

Production serves v3.19.0. v3.20.0 is pushed; v3.21.0 through v3.25.0 are
local only. Nothing is deployed. Push and deploy only on an explicit
go-ahead. Port 8080 is occupied by a `python -m http.server` serving
another project, so tests run with `SCRATCHPAD_TEST_PORT=8091`.

## v3.22 unlinked mentions — done

- `7dba47d` spec, `f7d3f1f` plan, `6379380` style(markdown) biome pass,
  `8d9a600` feat(links) mentions panel, `c13fced` docs, `dbe1147` release.
- Tooling on the way: `b1563c4` SCRATCHPAD_TEST_PORT for Playwright, the
  guide origin test now derives its origin from baseURL.
- Gate: verify green (coverage 40.19%); suite 1087 passed / 17 skipped on
  8091 (3 guide-origin failures fixed in the same round); CSP unchanged.

## v3.23 callouts — done

- `b7c2520` spec + plan, `c0888be` feat(markdown) callouts, `d4ab928`
  docs, `5732cd0` release. Gate: verify green (40.05%); suite 1102 passed /
  17 skipped; CSP unchanged. Note: verify's coverage step times out when
  the full suite runs alongside it; rerun after the suite, it is contention.

## v3.24 syntax highlighting — done

- `822d372` spec + plan, `d9220fa` chore(hooks) mnemonic-prefix fix (the
  innerHTML guard was rejecting vendored code), `26adeea` feat(markdown)
  Prism (docs folded in), `e4d4a76` release. Gate: verify green (40.01%);
  suite 1114 passed / 17 skipped; check:vendor ok; CSP unchanged.

## v3.25 templates folder — done

- `85a5889` spec + plan, `9aef80c` feat(palette) templates, docs commit,
  `ede76da` release. Gate: verify green (39.90%); suite 1120 passed / 17
  skipped (one over-specified palette assertion fixed); CSP unchanged.

## Resuming From Here

- Next: v4.0 image attachments (spec committed; plan next; needs a CSP
  publish adding blob: to img-src before its deploy), v3.25 templates folder, v4.0 image attachments (needs a
  CSP publish before deploy), v4.1 linked folder.
- Blockers: none. Assumptions: app.js at 6200 (ratchet count), 4 lines of
  slack under the 6204 ceiling.
- Lesson recorded below: exploration-agent claims about exports must be
  verified before a design leans on them (scanOutsideFences was private).

## Release train after v3.19 (approved order)

Per-feature groundwork lives in `tasks/roadmap.md` (2026-09-01): what each
feature touches today, the proposed shape, the decisions its design gate
must settle, and the cross-cutting ratchet, CSP, sanitizer, and precache
constraints. Two discrepancies found while writing it:

- `scripts/release-gate.mjs` is referenced above and in `tasks/lessons.md`
  but was never committed; today's gate is `npm run verify` + `npm test`.
- `public/js/version.js` carries an uncommitted build-date bump to
  2026-09-01 while the v3.19.0 commit says 2026-08-30.
- The "scope picker" in the v3.20 line no longer exists (removed in
  `e51b143`); operators compose with the lifecycle switch and tag chip.

Each feature gets its own brainstorm → spec + plan under `docs/superpowers/`
→ TDD → ship cycle, one feature per release. Standing constraints: zero
network (`network-isolation.spec.js` untouched), vendored-only deps,
tokens-only CSS, no inline `<script>` changes, structure/format baselines
tightened or held, real deploys gated on an explicit yes.

- [x] **v3.20 Search operators** (committed 2026-09-01 as v3.20.0) — `tag:`, `title:`, `folder:` composing with
      the scope picker (from `backlog.md`); search.js + search-view plumbing +
      guide copy
- [x] **v3.21 Paste as Markdown** (committed 2026-09-01 as v3.21.0) — HTML clipboard → Markdown on paste in the
      editor; vendored minimal converter; establishes the paste handler that
      v4.0 images later extends
- [x] **v3.22 Unlinked mentions** (committed 2026-09-01 as v3.22.0) — extend the backlinks panel with
      plain-text mentions of the note title, one-click "link this"
- [x] **v3.23 Callouts** (committed 2026-09-01 as v3.23.0) — `> [!NOTE]` marked extension + token CSS; warms the
      renderer-extension pattern; keep `share.html`'s viewer working under CSP
- [x] **v3.24 Syntax highlighting** (committed 2026-09-01 as v3.24.0) — vendored highlighter scoped to ~10
      common languages (~30KB), payload-conscious
- [x] **v3.25 Templates folder** (committed 2026-09-01 as v3.25.0) — convention + "New note from template"
      palette command; mirrors the daily-template precedent
- [ ] **v4.0 Image attachments** — DB_VERSION 4→5 (blob store), backup
      schema 5, export strategy decision, size caps, paste/drop; decide
      shares stay text-only (recommended — object URLs are per-browser)
- [ ] **v4.1 Linked plain-text folder** — File System Access two-way `.md`
      round-trip with a user-chosen local directory; biggest and last; it
      inherits the image-export decisions from v4.0; never use the word
      "sync" in copy (terminology ban)