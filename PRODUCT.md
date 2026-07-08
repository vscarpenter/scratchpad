# Product

## Register

product

## Users

Markdown-fluent developers and power users who want a fast, no-account place to
think. They reach for Scratchpad the way they'd reach for a terminal scratch
buffer or a `*scratch*` window: open it, capture, move on. They expect keyboard
shortcuts to work, search to be instant, and the tool to never get in the way.
The unifying value is trust through locality — they use it *because* nothing
leaves the browser, not in spite of it.

## Product Purpose

A privacy-first, local-only notes app. Everything lives in the browser's
IndexedDB; the app makes zero network calls for user data after initial load.
That guarantee is the product, not an implementation detail. Success is a tool
that feels calm and trustworthy enough to become a daily writing habit — quick
to open, pleasant to read in, and invisible while you work. Pure static
HTML/CSS/vanilla JS, no build step, deployed at notes.vinny.dev.

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

## Design Principles

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
