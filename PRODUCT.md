# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Markdown-fluent developers and power users who want a fast, no-account place to
think. They reach for Scratchpad the way they'd reach for a terminal scratch
buffer or a `*scratch*` window: open it, capture, move on. They expect keyboard
shortcuts to work, search to be instant, and the tool to never get in the way.
The unifying value is trust through locality — they use it *because* nothing
leaves the browser, not in spite of it.

Scratchpad is a **public product**, not a personal tool that happens to be
online: anyone who lands on notes.vinny.dev is a target user, not just its
author. First-run experience, activation, and the persuasion surfaces (about,
guide) are therefore legitimate product concerns. Copy must never assume prior
familiarity with the tool, its conventions, or its author.

## Product Purpose

A privacy-first, local-only notes app. Everything lives in the browser's
IndexedDB; the app makes zero network calls for user data after initial load.
That guarantee is the product, not an implementation detail. Success is a tool
that feels calm and trustworthy enough to become a daily writing habit — quick
to open, pleasant to read in, and invisible while you work. Pure static
HTML/CSS/vanilla JS, no build step, deployed at notes.vinny.dev.

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

Privacy is the foundation this rests on, not the headline. Local-only storage
and client-side-encrypted sharing are the mechanism that makes a no-account
product possible at all — they earn the claim rather than being the claim.
Lead with the habit; let the privacy architecture be the reason it's credible.

## Operating Context

- **The session shape.** A browser tab, often left open all day, on a laptop,
  with real secondary use on mobile. Installable as a PWA and usable offline
  from a cached app shell. The core loop is open → capture → move on.
- **Daily writing.** One command opens today's note; it is created on first use
  from a note titled "Daily template" (or a minimal default) and kept in a
  managed Daily Notes folder. Daily notes group into collapsible months. An
  on-demand Monthly Review generates reflection prompts and links to that
  month's notes without copying their contents. Quick capture appends a
  timestamped line from anywhere.
- **Organizing and finding.** Folders, tags, pinning, bulk tagging, and search
  across titles, bodies, and tags. Archive clears finished work without
  starting Trash's 30-day deletion clock.
- **Connecting.** `[[Title]]` wikilinks autocomplete as you type; each note
  shows its backlinks, and renaming a linked note offers to update references.
- **Portability.** JSON backups (schema v4), passphrase-encrypted `.scratchpad`
  backups, and Markdown ZIP export; Markdown and validated JSON import with a
  conflict preview.
- **Sharing.** A user-triggered public read-only link at `/s/<id>`. The note is
  encrypted in the browser first; the host stores ciphertext and an IV, the key
  travels in the URL fragment, links expire after seven days, and they can be
  revoked sooner.
- **Storage reality.** IndexedDB can be evicted by the browser. Scratchpad
  requests persistent storage on a best-effort basis, surfaces the result
  honestly, reminds users to back up, and treats backups — not hope — as the
  recovery path. Multi-tab edits are detected over BroadcastChannel and
  resolved by explicit user choice, never a silent overwrite.
- **Surfaces.** Six deployed shells: the app (`index.html`), the public share
  viewer (`share.html`), and four content pages (`about.html`, `guide.html`,
  `privacy.html`, `terms.html`).

## Capabilities and Constraints

**Stack.** Static HTML/CSS/vanilla JavaScript. No build step and no runtime
package manager. `marked` and DOMPurify are vendored in `public/js/vendor/`.
Playwright and the scripts in `scripts/` are local-only dev tooling and are
never deployed. Delivery is S3 + CloudFront behind Origin Access Control, with
security headers emitted by a CloudFront Function and a CSP that hashes the
inline theme scripts rather than allowing `unsafe-inline`.

**Permanent commitments (confirmed).** Future work must preserve all three:

- **Free forever.** No paid tier, subscription, trial, or upsell. No pricing
  surface will ever be designed, and no copy should imply one is coming.
- **No accounts or identity, ever.** No sign-in, user record, or email capture,
  not even as an option. Any personalization that requires knowing who someone
  is is permanently out of bounds.
- **Sharing is the ceiling on network surface.** `POST/GET/DELETE /api/share`
  is the only sanctioned network call. No sync, collaboration, multi-device
  continuity, or server-side note storage.

**Also binding, from the existing codebase.** No third-party scripts, fonts,
trackers, or analytics — everything is same-origin. Note content is encrypted
client-side before any upload, and the key must never appear in a request path,
query string, header, or body.

**Deliberately open — do not assume an answer.** Whether Scratchpad carries
support, uptime, or roadmap obligations is undecided. Do not imply a team, an
SLA, or a release cadence; equally, do not assert that it is unsupported or
unmaintained. Leave the question alone until it is answered.

**Terminology.** note, daily note, quick capture, folder, tag, Archive, Trash,
revision, backup, share link. Avoid "document", "page", "workspace", and
"sync" — the last is actively misleading here.

## Brand Commitments

- **Name and home.** Scratchpad, at notes.vinny.dev. Authored and maintained by
  Vinny Carpenter (vinny.dev); the source repository is public.
- **Design system.** Inkwell (`vscarpenter/inkwell`), vendored locally and
  never loaded from a CDN. This repo's active direction is Porcelain Chronicle
  v4; DESIGN.md owns the visual world.
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
  suite around it is roughly 46 Playwright spec files.
- **The source is public and auditable.** Anyone can read the code behind every
  claim, including the vendored dependencies and the share Lambda.
- **Shipped legal and help copy.** `privacy.html`, `terms.html`, and
  `guide.html` are real, and they are revised when behavior changes — the
  privacy page was rewritten the day sharing shipped rather than after.
- **A written decision record.** `docs/superpowers/specs/`,
  `docs/superpowers/plans/`, and `docs/adr/0001-model-note-lifecycle-with-nullable-timestamps.md`.
- **Server-side least privilege.** `share-infra/` carries the actual Lambda, an
  IAM policy scoped to `shares/*` on a single bucket, and a lifecycle rule that
  expires shares after seven days.
- **Release state.** Version 3.7.0; encrypted note sharing shipped 2026-08-13.

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
