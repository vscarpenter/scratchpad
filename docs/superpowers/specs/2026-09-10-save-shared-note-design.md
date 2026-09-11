# Save a shared note: design spec

Date: 2026-09-10
Status: approved

## Decision

The share viewer gains one action, **Save to my Scratchpad**. It copies the
decrypted note into Scratchpad in the same browser, tags the copy `shared`,
and opens it. The viewer hands the note to the app through `sessionStorage`
and a `/?action=save-shared` navigation. The app creates the note through its
normal save path.

Saving adds no API request, no IndexedDB access from the viewer, and no CSP
hash.

This spec supersedes one non-goal in `2026-08-13-note-sharing-design.md`:
"No 'Save a copy to my Scratchpad' button on the viewer. The viewer is inert."
The rest of that spec stands. The viewer stays read-only and still opens no
IndexedDB connection.

## Goals

- A recipient keeps a shared note with one click, before the link expires.
- The copy is an ordinary note. It edits, searches, exports, and writes to a
  linked folder like any other note.
- Saving adds no API request, and no request carries the key or the note
  text.
- `public/js/app.js` nets zero lines against its ratchet ceiling of 6204.

## Non-goals

- No live connection between the copy and the share. The copy never updates.
- No stored provenance field such as a share id, sender, or date. The `shared`
  tag is the only marker.
- No save action on the expired, missing, bad-key, or offline states.
- No folder choice at save time. The copy is unfiled.
- No handoff to another tab, window, or installed app.

## Approaches considered

1. **Same-tab `sessionStorage` handoff (chosen).** The viewer already holds the
   decrypted note. It stashes the note for one navigation, and the app creates
   it. This reuses two existing patterns: the `?action=` PWA shortcuts in
   `handleActionParam`, and the `scratchpad:eraseComplete` handoff.
2. **Pass the link to the app.** The app fetches and decrypts the share again.
   Rejected: it adds a second `GET /api/share` from the app shell and a second
   fetch-and-decrypt path. It also fails if the link expires or the network
   drops between the two clicks.
3. **The viewer writes to IndexedDB.** Rejected for three reasons. It breaks
   the viewer's no-IndexedDB test, and it skips `putNoteRecord`, which drives
   linked folder write-back and the cross-tab broadcast. It also suppresses
   first-run seeding, because `maybeSeedFirstRun` seeds only an empty database.

## Contract

### Viewer

- `#share-doc` gains an action row between the tags and the body. The row holds
  a `btn btn-primary btn-sm` button labeled "Save to my Scratchpad", a muted
  hint, and a hidden `role="alert"` error line.
- Hint: "Adds an editable copy to Scratchpad in this browser. It stays after
  the link expires."
- The row sits inside `#share-doc`, so it appears only in the decrypted state.
- On click, the viewer stashes `{ v: 1, title, body, tags }` from the decrypted
  payload. Then it calls `location.assign('/?action=save-shared')` in the same
  tab, so Back returns to the share.
- If the stash write throws, the error line reads "This browser blocked saving
  the note. Allow site data for this site, then try again." The page stays put.
- The inline theme scripts are untouched, so the three CSP hashes do not change.

### Handoff

- Key: `sessionStorage['scratchpad:pendingSharedNote']`.
- Value: JSON `{"v":1,"title":"…","body":"…","tags":["…"]}`.
- The viewer is the only writer and the app is the only reader. The app deletes
  the key before its first `await`.
- `sessionStorage` is scoped to one tab and one origin, so the stash never
  reaches another tab or any server.

### App

`handleActionParam` dispatches `save-shared` to
`ScratchpadSharedCopy.saveStashed()`. It runs after `maybeSeedFirstRun()` and
`loadAll()`, and after the URL is cleaned.

`saveStashed()` does four things in order:

1. It reads and removes the stash. With no stash it returns silently.
2. It validates the stash against the JSON import limits. It refuses the stash
   if any of these hold:
   - the value is not JSON, or `v` is not 1;
   - the title or body is not a string;
   - the title exceeds 240 characters, or the body exceeds 200,000;
   - tags is not an array, holds more than 20 entries, or holds a non-string;
   - a normalized tag exceeds 48 characters.

   A refused stash creates nothing and toasts "Couldn't save the shared note."
   in the error tone.
3. It looks for a duplicate: the first note not in Trash whose `title` and
   `body` both equal the stash exactly. Tags are ignored. A match opens and
   toasts "This note is already in your Scratchpad." in the info tone.
4. Otherwise it creates the copy through `normalizeNote`. The copy has:
   - a fresh id, with the stash title and body;
   - the stash tags plus `shared`, deduplicated;
   - no pin and no folder;
   - `createdAt` and `updatedAt` set to now;
   - null archive, trash, and draft fields.

   It writes the copy with `putNoteRecord`, adds it to state, opens it, and
   toasts "Saved to your Scratchpad."

Opening a note uses `openNoteFromCommand`, the command palette's path, in view
mode. When a folder view is active, the app first switches to Home. A folder
view hides every note outside its folder, so it would hide an unfiled copy.

### Module

`public/js/shared-copy.js` exposes
`window.ScratchpadSharedCopy = { stash, init, saveStashed }`. It carries
`// @ts-check` with JSDoc types, stays under 400 lines, and keeps functions
under 40 lines. It never opens IndexedDB. Every write goes through the
`putNoteRecord` dependency.

The app passes these dependencies at init: `notes`, `isTrashed`,
`normalizeNote`, `normalizeTag`, `putNoteRecord`, `addNote`, `openNote`,
`uuid`, `now`, `toast`, and `limits`. `limits` holds the four `NOTE_*_MAX`
constants. `openNote` wraps the switch to Home and `openNoteFromCommand`.

## Edge cases

- Reloading `/?action=save-shared` does nothing, because the URL is clean and
  the stash is gone.
- Opening `/?action=save-shared` with no stash does nothing and shows no toast.
- Saving twice from the same share opens the first copy.
- A sender who saves their own share in the same browser gets their original
  note opened, because the duplicate check matches it.
- A match in Trash does not count, so saving again creates a new copy.
- An archived match counts and opens in the Archive view.
- A share that already carries a `shared` tag keeps one `shared` tag.
- Images keep their `attachment:` references and render the existing
  "(image not included)" placeholder.
- Wikilinks resolve against the recipient's notes, as all wikilinks do.
- A linked folder writes the copy to disk through `putNoteRecord`.
- If the app's database fails to open, `init` shows its existing storage error.
  The stash then stays in this tab until the tab closes. It holds the same text
  the tab just displayed.
- On iPhone and iPad, a Home Screen web app keeps its storage apart from
  Safari. A copy saved in Safari lands in Safari's Scratchpad.

## Copy

- `guide.html#sharing` gains a paragraph on saving a shared note. It covers
  the button, the `shared` tag, the duplicate behavior, and the fact that the
  copy lives in this browser.
- `privacy.html` gains one sentence in its sharing section: saving a shared
  note copies it into your browser and uploads nothing.
- `PRODUCT.md` names the save action where it describes sharing.
- The non-goal in `2026-08-13-note-sharing-design.md` gains a pointer to this
  spec.
- The `share.js` header comment states the new rule. The viewer opens no
  IndexedDB and writes one `sessionStorage` key, only when the user saves.

## Registration

- `<script src="/public/js/shared-copy.js">` loads in `share.html` before
  `share.js` and in `index.html` before `app.js`.
- The module joins `APP_SHELL` in `public/service-worker.js` and the
  `jsconfig.json` include list.
- `tests/README.md` names the new spec file.

## Verification

Written test-first. `tests/shared-copy.spec.js` holds top-level tests, each
under 40 lines:

- End to end, a real encrypted share saves from the viewer. The app opens the
  copy with the title shown, tags plus `shared`, no folder, a clean URL, and
  an empty stash.
- The save row is hidden in the expired state.
- A blocked stash write shows the error and stays on the viewer.
- Saving the same stash twice keeps one copy and toasts the duplicate message.
- A matching note in Trash does not block a new copy.
- A restored folder view switches to Home, so the list shows the copy.
- A first visit gets the starter notes plus the selected copy.
- Malformed JSON, a wrong version, an over-limit title, and too many tags each
  toast the error and create nothing.
- `/?action=save-shared` with no stash creates nothing and shows no toast.
- A hostile title renders as text in the app.

`tests/network-isolation.spec.js` gains one test. Saving a shared note adds no
API request beyond the viewer's single GET. Every request stays same-origin,
and none carries the note text or the key.

The existing no-IndexedDB viewer test in `tests/share-viewer.spec.js` stays
unchanged and green.

Gates: `npm run verify` and the full three-browser `npm test`.

## Files

New:

- `public/js/shared-copy.js`
- `tests/shared-copy.spec.js`

Modified:

- `share.html`, `public/js/share.js`
- `public/js/app.js`, `index.html`
- `public/service-worker.js`, `jsconfig.json`
- `public/css/app.css`
- `tests/helpers.js`, which gains the share fixtures so two specs can use them
- `tests/share-viewer.spec.js`, `tests/network-isolation.spec.js`,
  `tests/README.md`
- `guide.html`, `privacy.html`, `PRODUCT.md`
- `docs/superpowers/specs/2026-08-13-note-sharing-design.md`

No version bump and no deploy. A release is a separate decision.
