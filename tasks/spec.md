# Spec: four interaction ports from React Bits (2026-09-20)

Vinny approved the design in session on 2026-09-20, including three choices:
Mail-style swipe actions, hold to confirm inside the existing dialogs, and a
tick-only task animation. The standing design-approval correction authorizes
one continuous pass from here.

The source ideas come from the React Bits registry (SwipeToast, SpringCheck,
HoldButton, SwipeRow; MIT plus Commons Clause). No React Bits code ships. Each
item is a vanilla rewrite that fits the no-build, no-dependency profile.

## Goal

Four small interactions, built in this order, one commit each:

1. The Undo toast shows how much time is left, and any toast waits while the
   pointer or focus is on it.
2. A task checkbox draws its tick when the user checks it.
3. "Delete forever" and "Empty Trash" need a one-second hold inside their
   dialogs.
4. On touch, a note row swipes left for Archive and Trash, and right for Pin.

## Shared constraints

- Tokens only in `app.css`. No hex values, no new tokens, no `@font-face`, no
  blur or gradient in the shell, no emoji, no `innerHTML`.
- No new network calls. `tests/network-isolation.spec.js` stays untouched and
  green.
- `public/js/app.js` sits at 6,200 lines against a 6,204 ceiling. Logic goes
  into new modules that meet the v18 limits: 400 lines per file, 40 per
  function, nesting depth 3. The `app.js` total must end at or below 6,200.
- Each new module follows the `dialogs.js` pattern: `// @ts-check`, a block
  scope, a frozen `window.ScratchpadX` export, JSDoc types. Each one joins
  `jsconfig.json`, the `APP_SHELL` list in `public/service-worker.js`, and a
  script tag in `index.html` ahead of `app.js`.
- No inline script changes, so the CSP hashes stay the same. Confirm with
  `bash cloudfront/recompute-csp-hashes.sh`.
- Every animation has a `prefers-reduced-motion: reduce` branch.
- No dark-mode rules in `app.css`. Color pairs reuse pairs the token tests
  already validate (`--on-accent` on `--accent`, the `.btn-danger` pair).

## 1. Toast burn-down (`public/js/toast.js`, `window.ScratchpadToast`)

- `toast()` moves out of `app.js` into `ScratchpadToast.show(region, message,
  opts)`. The options keep their names and defaults: `tone`, `persist`,
  `duration` (2,600 ms), `actionLabel`, `action`. The returned node, the class
  names (`toast`, `is-<tone>`, `is-visible`, `toast-dot`, `toast-dismiss`,
  `toast-action`), and the 220 ms removal delay do not change.
- `app.js` keeps a one-line `toast` wrapper, so its 100-plus call sites do not
  change.
- One pausable clock replaces `setTimeout(remove, duration)`. It pauses while
  the pointer is over the toast or focus is inside it, and resumes when both
  have left. Pausing sets `is-paused` on the toast node.
- A toast that has an action and auto-dismisses gets one
  `span.toast-burn[aria-hidden="true"]`. CSS draws a 2px `--accent` bar on the
  bottom edge, clipped to the pill. The bar scales from full to zero over
  `--toast-ms`, which the module sets from `duration`. `is-paused` pauses the
  animation, so the bar and the clock cannot drift apart.
- Toasts without an action get the pause and no bar. Persistent toasts get
  neither.
- Reduced motion hides the bar. The pause still works.
- The failed-action path still raises the "Undo failed" error toast.

## 2. Task tick (CSS plus one `app.js` statement)

- A toggle calls `renderAll()`, which replaces the checkbox node. A CSS
  transition can never run on a node that starts life checked. So
  `toggleTaskAt` adds `is-just-toggled` to the checkbox at the same index
  after the render.
- `.task-checkbox.is-just-toggled` runs a box pop (about 300 ms,
  `--ease-pop`). When checked, its `::after` tick draws with a `clip-path`
  reveal: short leg first, then the long leg. Geometry and colors of the
  resting state do not change.
- Unchecking runs the box pop only.
- Task text is untouched: no strike, no dimming.
- Opening a note with checked tasks animates nothing, because no node carries
  the class.
- Reduced motion: no animation.

## 3. Hold to confirm (`public/js/hold-confirm.js`, `window.ScratchpadHoldConfirm`)

- `#confirm-permanent-delete` and `#confirm-empty-trash` gain
  `data-hold-confirm`. Their labels become "Hold to delete forever" and "Hold
  to empty Trash". The dialogs, their copy, and Cancel do not change.
- The module attaches to every `[data-hold-confirm]` button at load. The
  `app.js` click handlers stay as they are.
- Holding the primary pointer, Space, or Enter for 1,000 ms confirms. The
  module then calls `button.click()`, and its own capture-phase click gate
  lets that one click through.
- A click that follows a press the module saw is a short tap. The gate stops
  it and writes "Keep holding to confirm." into a visually hidden
  `aria-live="polite"` hint next to the button.
- A click with no press before it comes from assistive technology (VoiceOver,
  Voice Control, Switch Control). The gate lets it through, because those
  users cannot hold and the dialog already asked them to confirm.
- A hold cancels on early release, pointer leave, pointer cancel, window blur,
  a hidden document, or a disabled button. Key repeat does not restart it.
- Feedback: `is-holding` on the button drives a fill that scales across the
  button over `--hold-ms`, in the `.btn-danger` color pair. Release snaps the
  fill back over `--t-fast`.
- Reduced motion keeps the fill, because it reports progress, and drops the
  snap-back.
- `tests/helpers.js` gains `holdToConfirm(page, selector)`. The three existing
  call sites use it.

## 4. Swipe row (`public/js/swipe-row.js`, `window.ScratchpadSwipeRow`)

- `ScratchpadSwipeRow.attach(list, { canSwipe, onAction })` delegates from the
  note list, because `renderAll()` replaces rows. `renderRow` does not change.
- Touch and pen pointers only. Mouse keeps the HTML5 drag to a folder.
- Rows get `touch-action: pan-y`. A gesture locks horizontal once it moves
  10px and is wider than it is tall. A vertical start abandons the gesture,
  so the list scrolls as before.
- Swipe left reveals a trailing rail with "Archive" then "Trash". Swipe right
  reveals a leading rail with "Pin" or "Unpin". Buttons are text only, at
  least 44px tall, in validated color pairs.
- The module builds a rail when a swipe starts and removes it when the row
  closes. A closed row has no extra DOM, so existing tests and AT see no
  change.
- On release, a pure `resolveRelease({ offset, velocity, railWidth,
  rowWidth })` returns `closed`, `open`, or `commit`:
  - `commit` when the offset passes the commit point (the larger of rail
    width plus 64px and 55 percent of the row), or a flick faster than
    0.5 px/ms lands past the rail width.
  - `open` when the offset passes half the rail, or a flick faster than
    0.11 px/ms moves in the opening direction.
  - `closed` otherwise.
- A full left swipe commits Archive. A full right swipe commits Pin. Past the
  commit point the full-swipe button grows to fill the rail, so the target is
  clear before release.
- One row is open at a time. A tap on an open row, a tap elsewhere, a list
  scroll, or a render closes it. The click that ends a swipe does not open the
  note.
- `canSwipe(row)` is false in Trash, in bulk mode, and in search results.
- Actions in `app.js`:
  - Archive and Trash reuse `bulkSetArchiveState(true)` and
    `bulkMoveToTrash()` with the row id as the only selected id. Those paths
    already stay in the current view, clear the selection when it was the
    open note, revoke live shares before trashing, and raise the Undo toast
    for Archive.
  - Pin reuses `togglePin`, which gains an optional id.
  - While an edit is dirty, a swipe action does nothing except raise the info
    toast "Save or discard your edits first." The bulk trash path resets the
    editing state, which would drop the draft.
- In the Archive view the left rail offers "Unarchive" in place of "Archive",
  and there is no right swipe (archived notes do not pin).
- No new keyboard path. The document toolbar already pins, archives, and
  trashes the open note, and bulk mode covers the list. That satisfies WCAG
  2.5.1, which asks for an alternative to the gesture.
- Snaps run over `--t-base` with `--ease-out`. Reduced motion snaps at once.

## Anti-goals

- No React, no `motion`, no `gsap`, no vendored code, no icons from a package.
- No liquid fill, no springs driven by script, no sound, no haptics.
- No swipe on mouse, no swipe in Trash, no swipe to delete forever.
- No change to what Archive, Trash, Pin, permanent delete, or Empty Trash do.
- No countdown bar on plain toasts, and no strike or dim on done tasks.
- No change to `renderRow`, to the dialogs' copy, or to the toast call sites.

## Edge cases

- Toast: hover and focus at once, then one leaves (stay paused). The action
  button clicked while paused. Two toasts stacked, each with its own clock.
- Tick: a count mismatch marks checkboxes inert (existing rule), so no class
  lands. A trashed note does not toggle.
- Hold: release at 900 ms (no confirm). Pointer slides off mid-hold. Tab away
  mid-hold. `withBusy` disables the button. Enter key repeat. Dialog closed
  with Escape mid-hold.
- Swipe: diagonal start, second finger down, `pointercancel` from a native
  scroll, a render mid-swipe (the row leaves the DOM), a swipe on the active
  row, a swipe that starts on a tag button, right-to-left over-pull past the
  row width (clamped with resistance).

## Acceptance criteria

Each item goes red first, then green, on Chromium, Firefox, and WebKit.

1. `tests/toast.spec.js`
   - an Undo toast has one `.toast-burn`; a plain toast has none
   - hovering a 600 ms test toast keeps it past 1,200 ms; leaving dismisses it
   - focus inside the toast pauses it; blur resumes it
   - the archive Undo action still restores the note
2. `tests/task-lists.spec.js` (or a new spec if the ratchet says so)
   - checking a box leaves exactly one `.is-just-toggled`, on that box
   - reopening the note shows zero `.is-just-toggled`
   - reduced motion reports `animation-name: none`
3. `tests/hold-confirm.spec.js`
   - a plain click leaves the dialog open, the note intact, and the hint set
   - a 1,100 ms hold deletes the note
   - release at 400 ms does not delete
   - holding Enter confirms; a bare `element.click()` with no press confirms
   - pointer leave cancels
   - Empty Trash behaves the same way
4. `tests/swipe-row.spec.js` (synthetic touch pointer events)
   - `resolveRelease` table: closed, open, commit, flick open, flick commit
   - a left drag past half the rail opens it and shows Archive and Trash
   - tapping Trash moves the note to Trash; tapping Archive raises Undo
   - a full left swipe archives and Undo restores
   - a right swipe toggles Pin
   - a vertical drag and a mouse drag do nothing
   - no rail in Trash, bulk mode, or search
   - the click after a swipe does not open the note
   - a dirty edit blocks the action and raises the info toast
5. The whole existing suite stays green. `npm run verify` passes, with
   `app.js` at or below 6,200 lines and no new long or deep functions.
6. `bash cloudfront/recompute-csp-hashes.sh` reports no new hash.
7. Light and dark screenshots of all four surfaces land in `.verify/`.
8. DESIGN.md gains a short note on the four interactions. The guide page
   mentions the hold and the swipe where it covers Trash and the note list.

## Assumptions

- Work happens on a `feat/interaction-polish` branch. Nothing is pushed.
- The uncommitted `shadcn` devDependency, `bun.lock`, `skills-lock.json`, and
  `.mcp.json` are Vinny's and stay out of every commit here.
- 1,000 ms is the right hold length. It is one constant in the module.
- Text-only rail buttons are enough. Icons would need new `<template>` SVGs.
- Search results get no swipe, because a result row can be archived or
  trashed already and the rail would need more states.
- The version bump and the deploy are separate, user-invoked steps.
