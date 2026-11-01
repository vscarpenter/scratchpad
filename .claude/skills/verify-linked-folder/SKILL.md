---
name: verify-linked-folder
description: Check a change against the linked folder's promise that no text is lost when a note and its Markdown file both change. Use when a change touches public/js/linked-folder.js, or putNoteRecord, saveCurrent, moveCurrentToTrash, storeRevision, or loadAll in public/js/app.js, and when fixing findings F1, F2, or F3.
---

# Verify the linked folder

The guide promises: "When a note and its file have both changed, the newer one wins and the other text is kept in the note's History." If that breaks, someone loses words with no copy anywhere, in an app whose notes live only on their device.

Browser tests check the orders someone thought to write. This check runs the real `public/js/linked-folder.js` in Node and tries every order of its async steps within small scenarios. It needs no install beyond Node.

## Run it

```sh
npm run check:linked-folder
```

It takes about 10 seconds and prints three sections. Exit 0 means every guard holds, every listed finding still reproduces, and every broken variant is caught.

| Line | Meaning | What to do |
| --- | --- | --- |
| `pass` | The guard held in every order. | Nothing. |
| `FAIL` | A promise broke, or the search hit its cap. | Read the numbered steps it prints. |
| `open` | A known finding still reproduces. | Nothing, unless you're fixing it. |
| `GONE` | A listed finding stopped reproducing. | Move it to `guards` in `scenarios.mjs`. |
| `caught` | The guards caught a broken variant. | Nothing. |
| `MISSED` | A guard no longer catches its variant. | The guard got weaker. Fix that first. |
| `STALE` | A variant's target text moved. | Update `find` in `mutants.mjs`. |

## Does your change touch the verified code?

Run this, using the sync commit from the coverage record below:

```sh
git diff "$(git log -1 --format=%h --grep='(#42)' main)" HEAD -- public/js/linked-folder.js public/js/app.js
```

Any change to `linked-folder.js` runs through the check automatically, because the check loads that file. Changes in `app.js` don't, because `scripts/verify-linked-folder/world.mjs` holds a hand-written copy of how those functions behave. If the diff changes a function in the coverage record, compare it against its counterpart in `world.mjs` and update the copy.

## Real bug or modeling error?

Read the failing steps as a story, then find each step in the code. It's a real bug if every step can happen in the browser in that order. Reproduce it to be sure: `tests/linked-folder.spec.js` has helpers that write files through the origin private file system while a page runs.

It's a modeling error if a step can't happen. Examples are a fake that resolves an operation the real API wouldn't, or an app helper in `world.mjs` that has drifted from `app.js`. Fix the fake and say why in your commit.

Never make a failure pass by removing a scenario, shrinking `mustSurvive`, or holding timers longer. A failure that reflects a real order is a finding. Add it to `findings`, report it, and leave product code alone unless the user asked for a fix.

## When a change is intended

If you add an await that touches shared state in `linked-folder.js`, the fake already explores it, as long as the await goes through a fake operation. If it calls a new browser API, add that API to `world.mjs` through `World.operation`, so it becomes its own step. A new safeguard gets a new entry in `mutants.mjs`, with the guard that should catch it. A new promise gets a new guard.

When you fix a finding, move its scenario from `findings` to `guards` and add a variant that removes your fix.

## Open findings

The check reproduces each of these on the current code.

F1 is what remains of a larger bug. `flush` used to overwrite files without looking first, so a save lost any edit made by a tool like `git pull` or a sync client while the tab kept focus. `readUnseenEdit` now reads the file first, and `tests/linked-folder.spec.js` holds the browser regression test. An edit can still land in the moment between that read and `writable.close()`. The File System Access API has no conditional write, so this window can only shrink, not close.

## Safeguards a change must keep

Reads and saves write notes through `putNoteRecord` with the `updatedAt` they started from, so neither can replace a newer note (formerly F2). When a read loses, `applyFile` leaves `record.written` alone and the file stays unread. When a save loses, the editor stays open.

`writeFile` compares the text after each write and records `UNSEEN` if another writer got in, so that edit still gets read (formerly F3).

Only one write-back runs at a time, because two of them can finish out of order and leave older text in the file. A write-back counts toward `reads` to hold the next one back.

## What this does and doesn't prove

A `pass` covers every order of the async steps in that scenario, and nothing else. The scenarios have one or two notes, and each side edits at most once.

These stay outside the check:

- Two tabs of the app open at once. Each tab holds its own `record` and `pending`.
- The conflict dialog in `saveCurrent`. The check assumes the user keeps the edit as a separate note.
- `mutateNoteBody`, which uses the same conditional write but has no copy in `world.mjs`.
- Attachments, folders, and archived notes, including the paths they produce.
- A file the app has never written or read. Linking, or a rename that lands on that path, overwrites it unread, because `readUnseenEdit` only checks paths in `record.written`.
- Lost permission and failed writes.
- A crash between steps. `saveRecord` is a stub.
- Timestamps that tie, or a file system clock that disagrees with the browser's. The fake clock always moves forward.
- The real `noteToMarkdown` and `parseMarkdownNote`, which `world.mjs` replaces with a simple format.
- `DB.pruneRevisions` dropping old History entries.

## Coverage record

Sync commit: the squash commit of PR #42 on `main`, whose `world.mjs` was checked against that `app.js`. Replace it with a newer hash only after you confirm `world.mjs` still describes `app.js` at the new commit.

| Covered code | How the check sees it |
| --- | --- |
| `public/js/linked-folder.js`, the whole module except `render`, `reconnect`, and `unlink` | Runs the real file. |
| `putNoteRecord`, `saveCurrent`, `moveCurrentToTrash`, `storeRevision`, `loadAll` in `public/js/app.js` | Hand-written copy in `world.mjs`. |
| File System Access API: `createWritable`, `getFile`, `entries`, `removeEntry` | Fakes in `world.mjs`. A write lands at `close()`, and a `File` fails to read once the file has changed. |

The scenarios live in `scripts/verify-linked-folder/scenarios.mjs`, the broken variants in `mutants.mjs`, and the search in `explore.mjs`.
