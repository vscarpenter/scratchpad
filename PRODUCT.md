# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Markdown-fluent developers and power users who want a fast, no-account place to
think. They reach for Scratchpad the way they'd reach for a terminal scratch
buffer or a `*scratch*` window: open it, capture, move on. They expect keyboard
shortcuts to work, search to be instant, and the tool to stay out of the way.
The unifying value is trust through locality. They use it *because* nothing
leaves the browser, not in spite of it.

A second audience arrived with the linked folder in v4.1.0 (confirmed
2026-09-08): people who already keep a plain-text vault in Obsidian, iA Writer,
or plain `.md` files in git. They want a browser front end that does not take
ownership of their files. Scratchpad writes their notes as Markdown on disk,
reads their edits back, and leaves the files readable by any tool. The audience
is real but bounded, because the linked folder needs the File System Access API
and works only in Chromium browsers today.

Scratchpad is a **public product**, not a personal tool that happens to be
online: anyone who lands on notes.vinny.dev is a target user, not just its
author. First-run experience, activation, and the persuasion surfaces (about,
guide) are therefore legitimate product concerns. Copy must never assume prior
familiarity with the tool, its conventions, or its author.

## Product Purpose

A privacy-first, local-first notes app. Notes live in the browser's IndexedDB,
and the app makes zero network calls for user data after the initial page load.
That guarantee is the product, not an implementation detail.

Since v4.1.0 a user can also link one local folder, and Scratchpad writes every
note there as a Markdown file with frontmatter. IndexedDB stays the source of
truth inside the app; the folder is a durable copy the user chose and can open
in any editor. The folder is local, so it adds no network surface and changes
no promise.

Success is a tool calm and trustworthy enough to become a daily writing habit:
quick to open, pleasant to read in, and out of the way while you work. Pure
static HTML/CSS/vanilla JS, no build step, deployed at notes.vinny.dev.

## Positioning

**A daily writing habit with nothing standing in front of it.** There is no
account to create, no sync to configure, and no setup to complete. The app
opens and you write. Daily notes, quick capture, `[[wikilinks]]`, and instant
search across titles, bodies, and tags are what make the habit stick once it
starts.

A neighboring app can copy any single feature. What it cannot easily copy is
the *absence*: most alternatives ask for an account, an install, or a sync
decision before the first word. Scratchpad's claim is that the path from "I
need to write this down" to writing it has no steps in it.

Privacy is the foundation this rests on, not the headline. Local-first storage
and client-side-encrypted sharing are the mechanism that makes a no-account
product possible at all. They earn the claim rather than being the claim. Lead
with the habit, and let the privacy architecture be the reason it is credible.

Plain-text ownership works the same way. The linked folder answers the fair
question about any browser-only tool, which is what happens when the browser
forgets. It is supporting proof, not the lead. Confirmed 2026-09-08: the habit
stays the headline, and "local-first" replaces "local-only" wherever the older
wording is now inaccurate.

## Operating Context

- **The session shape.** A browser tab, often left open all day, on a laptop,
  with real secondary use on mobile. Installable as a PWA and usable offline
  from a cached app shell. The core loop is open, capture, move on.
- **Daily writing.** One command opens today's note; it is created on first use
  from a note titled "Daily template" (or a minimal default) and kept in a
  managed Daily Notes folder. Daily notes group into collapsible months. An
  on-demand Monthly Review generates reflection prompts and links to that
  month's notes without copying their contents. Quick capture appends a
  timestamped line from anywhere. Any folder named Templates turns its notes
  into palette commands that seed new notes.
- **Writing and reading.** Markdown with formatting shortcuts, autosaved
  drafts, and the last 10 saved revisions per note. GitHub-style `[!NOTE]`
  callouts and syntax highlighting for common languages render in view mode.
  Task-list checkboxes are clickable there and write back to the Markdown
  source. Rich-text pastes convert to Markdown on the way in. Images attach by
  paste, drop, or the note menu, stay in this browser, and are never uploaded
  when a note is shared.
- **Organizing and finding.** Folders with a switcher, tags, pinning, and bulk
  tagging. Search is focused and relevance-ranked across titles, bodies, and
  tags, narrowed with `tag:`, `title:`, and `folder:` operators. Labeled typo
  matches catch the near misses. Find and replace works inside a note. Archive
  clears finished work without starting Trash's 30-day deletion clock.
- **Connecting.** `[[Title]]` wikilinks autocomplete as you type. Each note
  shows its backlinks and the notes that mention its title without linking,
  with one-click linking. Renaming a linked note offers to update references.
- **Plain-text ownership.** One linked local folder holds every note as a
  Markdown file with frontmatter, in the Markdown ZIP layout, with attachments
  written beside the notes. Scratchpad reads the folder on request and when the
  window regains focus, so edits from any text editor land in the note. A
  conflict keeps the other text as a revision rather than discarding it, and a
  lost permission degrades to a Reconnect control. The words are linked folder,
  write, read, reconnect, and unlink.
- **Portability.** JSON backups (schema v5), passphrase-encrypted `.scratchpad`
  backups, and Markdown ZIP export, all carrying attachments. Markdown and
  validated JSON import with a conflict preview; imports still accept schema
  v2 through v5.
- **Sharing.** A user-triggered public read-only link at `/s/<id>`. The note is
  encrypted in the browser first, the host stores ciphertext and an IV, and the
  key travels in the URL fragment. Links expire after a sender-chosen 7, 14,
  21, or 30 days, and they can be revoked sooner. A recipient can save a copy
  into Scratchpad in their own browser. The copy is tagged `shared`, and saving
  uploads nothing.
- **Storage reality.** IndexedDB can be evicted by the browser. Scratchpad
  requests persistent storage on a best-effort basis, surfaces the result
  honestly, reminds users to back up, and treats backups and the linked folder,
  not hope, as the recovery path. Multi-tab edits are detected over
  BroadcastChannel and resolved by explicit user choice, never a silent
  overwrite.
- **Surfaces.** Six deployed shells: the app (`index.html`), the public share
  viewer (`share.html`), and four content pages (`about.html`, `guide.html`,
  `privacy.html`, `terms.html`).

## Capabilities and Constraints

**Stack.** Static HTML/CSS/vanilla JavaScript. No build step and no runtime
package manager. `marked`, DOMPurify, and Prism are vendored in
`public/js/vendor/`. Playwright and the scripts in `scripts/` are local-only
dev tooling and are never deployed. Delivery is S3 + CloudFront behind Origin
Access Control, with security headers emitted by a CloudFront Function and a
CSP that hashes the inline theme scripts rather than allowing `unsafe-inline`.

**Permanent commitments (confirmed).** Future work must preserve all three:

- **Free forever.** No paid tier, subscription, trial, or upsell. No pricing
  surface will ever be designed, and no copy should imply one is coming.
- **No accounts or identity, ever.** No sign-in, user record, or email capture,
  not even as an option. Any personalization that requires knowing who someone
  is is permanently out of bounds.
- **Sharing is the ceiling on network surface.** `POST/GET/DELETE /api/share`
  is the only sanctioned network call. No sync, collaboration, multi-device
  continuity, or server-side note storage. The linked folder does not breach
  this ceiling, because it writes to local disk through the browser's own
  directory picker.

**Also binding, from the existing codebase.** No third-party scripts, fonts,
trackers, or analytics. Everything is same-origin. Note content is encrypted
client-side before any upload, and the key must never appear in a request path,
query string, header, or body.

**Browser support.** The linked folder needs the File System Access API, so it
is Chromium-only today and its controls stay hidden elsewhere. Every other
feature works without it. No copy may present the linked folder as the normal
path or imply that notes are files by default.

**Support and maintenance (decided 2026-09-08).** Scratchpad is actively
maintained by one person on a best-effort basis, with no SLA. Copy may say it
is actively maintained. Copy may never promise a response time, an uptime
figure, a support channel, or a release cadence.

**Terminology.** note, daily note, quick capture, folder, tag, template,
attachment, Archive, Trash, revision, backup, share link, linked folder, and
the linked-folder verbs write, read, reconnect, and unlink. Avoid "document",
"page", and "workspace". Never say "sync": nothing leaves the device and there
is no second device, so the word names something the product does not do.

## Brand Commitments

- **Name and home.** Scratchpad, at notes.vinny.dev. Authored and maintained by
  Vinny Carpenter (vinny.dev); the source repository is public.
- **Design system.** Inkwell (`vscarpenter/inkwell`), vendored locally and
  never loaded from a CDN. This repo's active direction is Indigo on Paper v5;
  DESIGN.md owns the visual world.
- **Platform fonts only.** No `@font-face`, no hosted font services. This is a
  privacy commitment before it is an aesthetic one.
- **No emoji in source.** Icons are inline SVG strokes.
- **Real assets.** `public/og-image.png` (1200×630) for social cards, with
  `public/og-image.svg` as its regenerable source.

## Brand Personality

Calm, editorial, restrained. Voice is quiet and confident — a private writing
room, not a productivity dashboard. Serif headings and generous whitespace
signal care without preciousness. The interface should read as *considered*:
every element earns its place, nothing shouts. Warmth comes from typography and
copy, never from decoration.

## Anti-references

This is a tight target — it rejects four lanes simultaneously, leaving only
distinctive-through-restraint:

- **Bloated productivity SaaS** (Notion, Confluence): nested sidebars,
  slash-command overload, database views, feature-stuffed toolbars. Scratchpad
  stays a scratchpad.
- **Generic AI-template aesthetic**: gradient hero text, glassmorphism,
  identical card grids, tiny uppercase tracked eyebrows on every section,
  purple-to-blue everything.
- **Consumer-bland** (Apple Notes, Google Keep): flat, characterless,
  system-default everything, no point of view.
- **Over-designed / loud**: heavy shadows, animation everywhere, decorative
  flourishes competing with the writing.

The reference lane it *should* live in: iA Writer / Linear-quiet — opinionated
typography, deliberate restraint, craft in the details rather than the surface.

## Evidence on Hand

Real and citable:

- **The privacy claim is executable, not prose.**
  `tests/network-isolation.spec.js` asserts zero network requests in normal
  use, exactly one POST when a share link is created, and that no request
  carries note plaintext. It fails the build if the guarantee is broken. The
  suite around it is 60 Playwright spec files.
- **The source is public and auditable.** Anyone can read the code behind every
  claim, including the vendored dependencies and the share Lambda.
- **Shipped legal and help copy.** `privacy.html`, `terms.html`, and
  `guide.html` are real, and they are revised when behavior changes. The
  privacy page was rewritten the day sharing shipped rather than after.
- **A written decision record.** 24 approved specs in
  `docs/superpowers/specs/`, their implementation plans in
  `docs/superpowers/plans/`, and two ADRs in `docs/adr/` covering note
  lifecycle and the ratcheted vanilla-JavaScript quality profile.
- **Server-side least privilege.** `share-infra/` carries the actual Lambda, an
  IAM policy scoped to `shares/*` on a single bucket, and tag-routed lifecycle
  rules that expire shares at their chosen duration, capped at 30 days.
- **Release state.** Version 4.1.1, built 2026-09-05. Encrypted note sharing
  shipped 2026-08-13, image attachments in v4.0.0, and the linked folder in
  v4.1.0.

Absences future work must not fabricate:

- **No user counts, install numbers, retention data, or adoption metrics.**
  None exist. Do not invent, estimate, or imply them.
- **No testimonials, reviews, press mentions, case studies, or customer logos.**
- **No third-party security audit or certification.** The evidence is readable
  source and a test suite. Never upgrade that into "audited", "certified", or
  "verified by" language.
- **No uptime, availability, or performance benchmark data.**

## Product Principles

1. **The tool disappears into the writing.** The measure of success is that you
   stop noticing the interface. Chrome recedes; the words are the subject.
2. **Privacy is the product — show it, don't bury it.** Local-only is the
   reason to choose this. Surface the guarantee with quiet confidence; never let
   it read as a disclaimer.
3. **Distinctive through restraint, not decoration.** With all four slop lanes
   ruled out, character has to come from typography, spacing, and copy. Resist
   every urge to add a flourish to prove the design is "designed."
4. **Fast for fingers that know the way.** Power users live on the keyboard.
   Shortcuts, instant search, and density where it earns its keep — without
   pushing approachability off the table.
5. **Every element earns its place.** When in doubt, remove it. Restraint is a
   deliberate choice here, applied repeatedly, not a styling default.

## Accessibility & Inclusion

Target: **functional accessibility** — real blockers must be fixed (unlabeled
controls, keyboard traps, focus loss, broken tab order, illegible state). Body
text holds WCAG AA contrast (the Inkwell tokens already document their ratios);
do not flood reports with AA-but-not-AAA contrast nitpicks. Reduced-motion is
respected. Standard keyboard and screen-reader support for all interactive
controls is expected, since the audience is keyboard-first.
