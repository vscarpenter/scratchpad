# Model note lifecycle with nullable timestamps

Scratchpad represents Archive with a nullable `archivedAt` timestamp alongside
the existing nullable `deletedAt` timestamp. Active Notes have neither,
Archived Notes have only `archivedAt`, and Trashed Notes have `deletedAt` while
retaining any prior `archivedAt`; Restore therefore clears only `deletedAt`.
This was chosen over a lifecycle-status enum because the timestamps are already
required for Archive ordering and Trash retention, preserve compatibility with
existing note records, and require no IndexedDB store migration or new index.
The IndexedDB version remains 3, while native backups advance to schema version
4 and carry `archivedAt` on records in the existing `notes` array so older
importers preserve content even if they cannot preserve Archive placement.
