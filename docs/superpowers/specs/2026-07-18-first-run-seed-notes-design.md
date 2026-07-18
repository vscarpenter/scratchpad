# First-run seed notes — design

**Date:** 2026-07-18
**Status:** Approved

## Problem

A brand-new visitor to `notes.vinny.dev` is already redirected once to `about.html`
(`app.js` `maybeRedirectFirstRun()`), and About's "Open Scratchpad" buttons link
back to `index.html`. But when they open the app it is **empty** — nothing to
explore, no illustration of what Markdown, wikilinks, task lists, or daily notes
do. We want first-time users to land in an app that already contains a small,
self-explanatory set of starter notes.

## Goal

On the very first run, seed three starter notes so they are waiting when the user
returns from About:

1. **Welcome to Scratchpad** — pinned; orientation + privacy framing.
2. **Markdown Guide** — the formatting reference from the sample backup.
3. A **daily note dated today** — shows the daily-note feature with a light example.

These are ordinary notes: fully editable and deletable, and once deleted they are
**never** re-seeded.

## Non-goals

- No settings/UI to toggle or re-run seeding.
- No change to the existing redirect behavior (it already works).
- No shared content source with `sample-notes-backup.json` (that file is a
  dev/test artifact; the seed is production onboarding — they may drift, and
  that's fine).

## Approach

Seed **inside the existing first-run gate**, right before the redirect fires.
The gate `!scratchpad-visited && noteCount === 0` already identifies exactly a
fresh install, so reusing it means:

- Existing users (who have notes) are never seeded.
- A returning user who deleted every note already has the `scratchpad-visited`
  flag set, so the gate returns early — they are never re-seeded.
- Storage blocked (private mode): the flag can't be read, the gate fails open —
  no seed, no redirect (unchanged behavior).

No second "have they been seeded?" flag is introduced.

### Rejected alternatives

- **Seed on the return visit** (detect "came from About"): needs a second flag and
  fragile return-detection to distinguish from a cleared-notes user.
- **Seed lazily whenever the DB is empty**: would re-seed a user who deliberately
  deleted every note.

## Components

### 1. `public/js/seed.js` (new)

Exposes `window.ScratchpadSeed.buildFirstRunNotes(now)` returning an array of three
fully-formed note records (same shape `normalizeNote` produces):
`{ id, title, body, tags, pinned, createdAt, updatedAt, deletedAt: null,
lastDraftAt: null, dailyDate }`.

- Uses `crypto.randomUUID()` for ids.
- `now` (epoch ms) is passed in by the caller; the module stamps `createdAt` /
  `updatedAt` from it so ordering is deterministic:
  - **Welcome** — pinned, `updatedAt = now` (top of the "Pinned" sidebar section).
  - **Markdown Guide** — `updatedAt = now - 1000`.
  - **Daily note** — `updatedAt = now - 2000`.
- The daily note computes today's local date key (`YYYY-MM-DD`) and a localized
  title (`toLocaleDateString` with `{ weekday:'short', month:'short', day:'numeric',
  year:'numeric' }`) — mirroring `createDailyNote()` in `app.js`. This is ~4 lines
  of duplication kept local so the seed module is self-contained.

Same-origin external script → **no CSP hash needed** (hashes are only for inline
scripts). Ships automatically under `public/**` via `deploy.sh`.

### 2. `index.html`

Add `<script src="public/js/seed.js"></script>` immediately before
`<script src="public/js/app.js"></script>` so `window.ScratchpadSeed` exists when
`app.js` `init()` runs. Only `index.html` needs it (the content pages don't).

### 3. `app.js` — `maybeRedirectFirstRun()`

After the existing `count === 0` check, seed before redirecting:

```js
if (count === 0) {
  try {
    if (window.ScratchpadSeed) {
      await DB.bulkPut(window.ScratchpadSeed.buildFirstRunNotes(now()));
    }
  } catch (e) {
    console.error('First-run seeding failed', e); // fail open: still redirect
  }
  window.location.replace('about.html');
  return true;
}
```

`await DB.bulkPut(...)` resolves on transaction completion, so the notes are
durable before `location.replace` navigates away. A seed failure is swallowed —
seeding must never block boot.

## Content (Option A — reference only what exists)

Every wikilink resolves among the three seeded notes, except one intentionally
labeled phantom link that teaches click-to-create.

### Welcome to Scratchpad (pinned; tags: `getting-started`, `welcome`)

```markdown
# Welcome to Scratchpad

This is a **privacy-first, local-only** notes app. Everything you write lives in
*this browser* — no account, no sync, no servers. To prove it, open your browser's
network tab: after the page loads, Scratchpad makes **zero** network calls.

These three starter notes are a quick tour. Edit them, delete them, make the place
yours.

## Try these

- [x] Read this welcome note
- [ ] Open the [[Markdown Guide]] to see every formatting trick
- [ ] Press `Cmd/Ctrl + K` for the command palette
- [ ] Jump to **today's note** from the palette (search "today") — a fresh page each day
- [ ] Star a note to pin it to the top
- [ ] Export a backup from the ⋯ menu

## Linking notes together

Wrap a note's title in double brackets to link to it, like [[Markdown Guide]].
Link to a title that doesn't exist yet and it renders as a **dashed** link — click
[[My First Note]] and Scratchpad offers to create it. That's how a web of notes
grows.

> Everything here is yours and stays on this device. Read more any time on the
> [About page](about.html).
```

### Markdown Guide (tags: `reference`, `markdown`)

Reused from the sample backup verbatim, with the one aliased example retargeted so
it resolves: `[[Reading List|what I'm reading]]` → `[[Welcome to Scratchpad|the
welcome note]]`. Full body (headings, styling, lists, interactive task list,
blockquote, JS + Python code fences, alignment table, links) as in the sample.

### Daily note (tags: `daily`; `dailyDate` = today; title = localized today)

```markdown
## Tasks

- [x] Skim the [[Welcome to Scratchpad]] note
- [ ] Try creating a note of my own
- [ ] Pin the notes I want to keep handy

## Notes

This is today's **daily note** — Scratchpad gives you a fresh one each day, so you
always have a place for the day's thoughts. Open tomorrow's from the command
palette (search "today").
```

## Testing

**Playwright** (extend `tests/first-run.spec.js`):

1. Fresh visitor (no flag, empty DB) → redirected to `about.html` **and**
   IndexedDB contains exactly 3 notes; one pinned "Welcome to Scratchpad", one
   "Markdown Guide", one with a `dailyDate` matching today.
2. After returning to `index.html` (flag now set), the three notes load, a
   `[[Markdown Guide]]` wikilink in Welcome renders as a resolved
   `a.wikilink` (not `is-phantom`), and no duplicate seeding occurs on reload.
3. Deleted-all user (flag set, empty DB) → stays empty, no seeding.

**Node check** (`scripts/` style, run with `node`): `buildFirstRunNotes(now)`
returns notes that satisfy the `normalizeNote` field contract, and every wikilink
target (excluding the deliberate `My First Note` phantom) matches a seeded note
title.

## Files touched

- `public/js/seed.js` (new)
- `index.html` (one script tag)
- `app.js` (`maybeRedirectFirstRun` seeding)
- `tests/first-run.spec.js` (extended)
- `scripts/check-seed-notes.mjs` (new, optional node check)
