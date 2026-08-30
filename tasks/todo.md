# Production feedback round — 2026-08-30

Two user-reported issues after v3.14.0.

## Plan
- [x] 1. Backup chip stuck on "Never backed up" — root cause: exportMarkdownZip
      was the only full-library export not calling recordBackupDownload.
      Fixed test-first (`aa8c1a9`).
- [x] 2. Floating pill site nav (designed in design-reference.html, never
      built) implemented on guide/about/privacy/terms, tokenized for Indigo
      on Paper (`a38d8f7`). Theme-toggle scripts untouched → CSP hashes
      unchanged. share.html keeps its quiet header.
- [x] 3. Full verify green; full suite 950 passed / 7 skipped; nav verified
      light + dark + 390/360px in `.verify/site-nav/`.

## Resuming From Here
- Done: v3.15.0 (backup fix + pill nav), v3.16.0 (20px shell footer strip),
  v3.17.0 (40px footer with site links), and v3.18.0 (footer strip on the
  share viewer with root-absolute hrefs for /s/<id>, plus the since-v3.11
  theme-toggle grid-stack fix — shell toggle rules now scoped to
  body:not(.page-privacy); feature `3e2f686`, release `bfffb34`) all
  shipped 2026-08-30; production verified on both /share.html and the
  /s/ route, pushed and in sync.
- Next: nothing pending.
- Blockers: none.
