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
- Done: v3.15.0 (backup fix + pill nav) and v3.16.0 (20px shell footer
  strip — version · deploy date · vinny.dev, commit `1793630`, release
  `5ec8220`) both shipped 2026-08-30; v3.16.0 invalidation
  I8OTMN9VC19D69PV9XYXNQ81XC, production verified, pushed and in sync.
- Next: nothing pending.
- Blockers: none.
