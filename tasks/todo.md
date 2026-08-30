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
- Done: both fixes shipped as v3.15.0 on 2026-08-30 (deployed as
  scratchpad-deploy, invalidation I8L6VFHV8H4VV0EFHA0Y0QK9BU, production
  verified — version, nav markup, and the backup-record call all live;
  pushed through `23f939e`).
- Next: nothing pending.
- Blockers: none.
