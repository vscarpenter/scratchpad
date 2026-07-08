# CLAUDE.md — Scratchpad project guidance

Project-specific instructions for AI assistants working in this repo. Read this
before making changes.

## What this is

Scratchpad is a privacy-first, local-only notes app. Pure static HTML/CSS/vanilla
JavaScript, no build step, deployed at https://notes.vinny.dev via AWS S3 +
CloudFront. Notes live in IndexedDB; theme preference in localStorage. The
entire app makes zero network calls after initial page load. That's a product
guarantee, not an implementation detail.

## Hard rules — do not violate

### Privacy posture
- **No third-party scripts, fonts, trackers, or analytics.** Everything is
  same-origin. If a change would add a CDN reference, a Google Font, a script
  tag pointing off-site, or an `<img>` from a third-party host, stop and check.
- **No remote calls for user data.** The product is "your notes never leave
  this browser." Don't add fetch/XHR for note content.
- **`marked` and `DOMPurify` are vendored**, not loaded from a CDN. They live
  in `public/js/vendor/`. Don't replace with CDN URLs.

### Inkwell design system — "Soft Glass" (v3)
This repo overrides the base Inkwell system with the **Soft Glass** reskin
(frosted floating glass panels over a tinted wash, system-sans identity, lifted
`#4E5FD8` accent, pills/squircles/soft shadows). The full spec is in
`docs/superpowers/specs/2026-07-08-soft-glass-redesign-design.md`. Read
`https://raw.githubusercontent.com/vscarpenter/inkwell/main/agent-instructions.md`
for the base system, but the rules below reflect this repo's overrides and win.
Key rules for anything in `public/css/app.css`:
- **All colors via `var(--token)`** — no hex codes anywhere in app CSS. Use
  `--accent`, `--ink`, `--text-secondary`/`--text-muted`/`--text-body`, `--paper`,
  `--accent-soft`, `--glass-*`, `--wash-*`, `--control-fill`, `--gray-*`, etc.
  Gradients built from token colors (e.g. `--accent-grad`) are fine.
- **Outer borders are 1px hairlines** via `var(--border)` / `var(--border-hair)`;
  floating panels use `var(--glass-border)`. (Soft Glass retired the old 1.5px
  signature border.) Focus outlines (`outline: 2px solid var(--accent)`) are the
  exception and stay.
- **Surfaces float.** The two top-level panels (sidebar + main; the About nav
  pill and hero preview) are frosted glass — `--glass-bg` + `backdrop-filter`
  (always ship the `-webkit-` prefix), `contain: layout style paint`, and both
  `@supports not (backdrop-filter…)` and `prefers-reduced-transparency` opaque
  fallbacks. Smaller cards are opaque panels with `--glass-shadow`; do **not**
  put `backdrop-filter` on rows, chips, or many small elements (compositing cost).
  Soft shadows and the sanctioned gradients (brand glyph, About display text,
  page wash) are part of the system now.
- **One accent** — `--accent` (`--accent-2` is only the lighter stop for the
  About display-text gradient). Use `--olive`/`--sky` for a data-viz hue.
- **Platform fonts only** — no `@font-face`, no Google Fonts. The system is
  sans-led (`--sans`); `--serif` is retained but unused by Soft Glass.
- **No emoji in source.** Icons are inline SVG strokes (the `⌘K` hint is a
  Unicode symbol, matching the existing kbd shortcuts).
- **Dark mode** extends the Pattern-B cascade in `inkwell-tokens.css`; validate
  AA before shipping. The dark accent is lifted to `#8593D6` so accent text on
  `--accent-soft` chips clears 4.5:1.

### HTML/JS safety
- **Never set `innerHTML` to untrusted content.** A pre-commit hook flags
  `innerHTML` writes. For sanitized markdown rendering, use
  `DOMPurify.sanitize(raw, { RETURN_DOM_FRAGMENT: true })` and append the
  fragment — see `public/js/app.js` `renderMarkdownInto()`.
- **For clearing containers**, use `container.replaceChildren()`, not
  `innerHTML = ''`.
- **For static SVG icons**, use a `<template>` in `index.html` and clone its
  content — see `tpl-pin-icon`.
- **External links open in new tabs** with `rel="noopener noreferrer"`. The
  markdown post-processor handles this for user content.

## Project structure

```
index.html               app entry
about.html               about / support page
privacy.html             privacy policy page
terms.html               terms-of-use page (reuses .page-privacy class for layout)
service-worker.js        root service worker (deployed no-store)
deploy.sh                S3 sync + CloudFront invalidation
.env.local.example       documents required env vars (S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID)
.env.local               actual secrets (gitignored)
public/
  manifest.webmanifest   PWA manifest (deployed with explicit content-type)
  service-worker.js      PWA service-worker logic (deployed no-store)
  og-image.png           1200x630 OG/Twitter card image (deployed)
  og-image.svg           regenerable source for og-image.png (deployed)
  css/
    inkwell.css          Inkwell entry; imports the other three
    inkwell-tokens.css   design tokens (light + dark)
    inkwell-components.css
    tokens.css           legacy aggregator (re-exports)
    app.css              Scratchpad's own layout; tokens-only
  js/
    db.js                IndexedDB wrapper (one connection, transactional)
    app.js               state, rendering, events
    version.js           SCRATCHPAD_VERSION + SCRATCHPAD_BUILD_DATE
    vendor/
      marked.min.js
      purify.min.js
cloudfront/              CloudFront security-header artifacts (do NOT deploy)
  README.md              operator guide for the function workflow
  security-headers-function.js   active deployed source: CF Function attached
                                 at viewer-response, emits CSP/HSTS/COOP/CORP/etc.
  response-headers-policy.json   reference-only equivalent declarative policy;
                                 kept in sync by the hash script for the
                                 hypothetical future where the distribution
                                 leaves the Free pricing plan
  recompute-csp-hashes.sh        recomputes inline-script sha256 hashes and
                                 verifies them in every CSP-bearing source file
README.md
ScratchPad-PRD.md        original product requirements
coding-standard.md       user's own reference file (do NOT deploy)
```

### Regenerating the OG image

`public/og-image.svg` is the source of truth. After editing it:

```sh
rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png
```

Both files are deployed under `public/`. Twitter and LinkedIn ignore SVG OG
images, so the PNG is the one social scrapers actually see.

## Layout tripwires (don't unintentionally regress)

All four pages share `app.css` but split into two layout modes that want
opposite behavior: the app shell (`index.html`) and the `.page-privacy`
content pages (`about.html`, `privacy.html`, `terms.html`). Three
load-bearing rules in `app.css` make both work simultaneously — touch any
of them carefully:

1. **`body:not(.page-privacy) { height: 100vh; height: 100dvh; }`** — caps
   the app page at viewport height so internal scroll regions have a
   definite size. The privacy page opts out (its body grows with content
   and the window scrolls).
2. **`.app-shell { grid-template-rows: 1fr; }`** — pins the grid's single
   row to the container height. Without this, the row auto-sizes to its
   children's content and the sidebar grows beyond the viewport.
3. **`.sidebar { min-height: 0; }`** — overrides the grid item default of
   `min-height: auto` so the item can be smaller than its intrinsic content
   size, letting `.note-list { overflow-y: auto }` actually scroll.

If you see the sidebar growing past the viewport with many notes, or the
privacy page failing to scroll naturally, these three rules are where to
look.

## Theme system

Inkwell's tokens auto-flip for dark mode via the `data-theme="dark"`
attribute. There are **no dark-mode rules in `app.css`** — and there
shouldn't be. If something doesn't render correctly in dark mode, fix the
token usage rather than adding `[data-theme="dark"] {…}` rules.

The inline `<head>` script in every page (`index.html`, `about.html`,
`privacy.html`, `terms.html`) reads `localStorage['theme-preview']` and
applies the attribute before any CSS parses, preventing flash of incorrect
theme. It's byte-identical across all four pages (they share one CSP hash).
The toggle script at the bottom of each page cycles
`auto → light → dark → auto`.

## Releases and deploys

### Version bumps
Single source of truth: `public/js/version.js`. Edit the two constants
(`SCRATCHPAD_VERSION`, `SCRATCHPAD_BUILD_DATE`) and all four pages
(`index.html`, `about.html`, `privacy.html`, `terms.html`) pick up the new
values via the `#app-version` and `#app-build-date` placeholders in their
footers.

### Deploying
Run `./deploy.sh` (or `bash deploy.sh`). It reads `.env.local` for
`S3_BUCKET` and `CLOUDFRONT_DISTRIBUTION_ID`, then, in order:
1. Syncs `public/` to `s3://$S3_BUCKET/public/` with
   `Cache-Control: public, max-age=300` and `--delete` (excludes
   `*.DS_Store` and dotfiles). Assets go up **before** HTML so every
   asset a fresh page references already exists in the bucket.
2. Re-uploads `public/manifest.webmanifest` with an explicit
   `application/manifest+json` content-type and
   `Cache-Control: public, max-age=300, must-revalidate`.
3. Re-uploads `public/service-worker.js` with an explicit
   `application/javascript` content-type and
   `Cache-Control: no-cache, no-store, must-revalidate`.
4. Uploads the HTML shells — `index.html`, `about.html`, `privacy.html`,
   `terms.html` — with `Cache-Control: public, max-age=60, must-revalidate`.
5. Uploads the root `service-worker.js` with
   `Cache-Control: no-cache, no-store, must-revalidate`.
6. Invalidates CloudFront for the shell entry points: `/`, `/index.html`,
   `/about.html`, `/privacy.html`, `/terms.html`, `/service-worker.js`,
   `/public/manifest.webmanifest`, and `/public/service-worker.js*`.

Service workers are always uploaded `no-store` so a stale worker can never
pin users to old code; HTML gets a short 60s cache.

`./deploy.sh --dry-run` previews without changing anything.

**Authorization:** never run the real deploy without explicit user
confirmation in the current turn. Dry-runs are fine to run autonomously
because they don't mutate. Real deploys (and any other AWS mutation —
`aws s3 cp`, `aws cloudfront update-distribution`, `create-invalidation`)
need a "yes, deploy" or equivalent each time.

### CloudFront origin gotcha
The distribution origin is the **S3 website endpoint** (not the REST
endpoint with OAC). Two consequences:
- **`OriginPath` must stay empty.** Anything in `OriginPath` is prefixed
  onto every request CloudFront forwards. We hit a real bug where it was
  `/index.html` and every URL 404'd. If you see universal 404s after a
  deploy, check `OriginPath` first.
- **`DefaultRootObject` is intentionally empty** — the S3 website endpoint
  handles `/` → `index.html` on its own.

### CloudFront Free pricing plan
The distribution is enrolled in CloudFront's **Free** flat-rate pricing
plan. That plan gates several features to higher tiers; the API rejects
them at `update-distribution` time with `InvalidArgument: Distributions
with the Free pricing plan can't have the following features: <X>`.

Features blocked on Free that you'd otherwise reach for:
- **Custom response-headers policies** (Business/Premium only) — this is
  why security headers live in `cloudfront/security-headers-function.js`
  as a CloudFront Function instead of a declarative policy.
- **Custom cache policies** and **custom origin-request policies**
  (Business/Premium only) — use AWS-managed policies, or work around with
  a CloudFront Function on viewer-request.
- **Access logs** (Pro and above).

CloudFront Functions are available on every tier and run at
viewer-request / viewer-response. They're the standard escape hatch when
the Free plan blocks a declarative feature.

Pricing-plan management is **console-only** as of aws-cli 2.34.x — there
are no CLI commands to subscribe, upgrade, or cancel a plan. Cancelling
the Free plan takes effect at the next billing cycle; upgrading is
immediate but adds a flat monthly fee.

### Updating security headers
Headers live in `cloudfront/security-headers-function.js`. To change them:

1. Edit the file. If you touched an inline `<script>` in `index.html`,
   `about.html`, `privacy.html`, or `terms.html`, run
   `bash cloudfront/recompute-csp-hashes.sh` first and update the CSP
   `script-src` hashes (in both the .js file and the reference .json — the
   script verifies both).
2. Push the new code to the DEVELOPMENT stage with `aws cloudfront update-function`
   (needs the current DEVELOPMENT ETag from `describe-function`).
3. Publish DEVELOPMENT → LIVE with `aws cloudfront publish-function`. Edge
   propagation is seconds; no `update-distribution` and no invalidation
   needed (the function runs at viewer-response on every response,
   including cached ones).

`cloudfront/README.md` has the exact command snippets.

## Local development

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Don't open `index.html` via `file://`. IndexedDB behavior on file URLs is
inconsistent across browsers.

## Verification screenshots

`./.verify/` holds browser-driven verification screenshots (gitignored).
The directory is convenient for "show me what the change looked like"
checks; not part of the app and never deployed.

## What not to deploy

These files exist in the repo but **must not** end up in S3 / CloudFront:
- `README.md`, `ScratchPad-PRD.md`, `CLAUDE.md`, `coding-standard.md`, `backlog.md`
- `deploy.sh`, `.env.local`, `.env.local.example`
- `cloudfront/` (operator-only AWS policy artifacts)
- `package.json`, `bun.lock`, `node_modules/`, `tests/`, `scripts/`,
  `playwright.config.js` (local-only dev/test tooling)
- `.git/`, `.verify/`, `.gitignore`

The deploy script handles this by uploading only `public/**` (with
`--delete`) plus the four HTML shells explicitly (`index.html`,
`about.html`, `privacy.html`, `terms.html`) and the root
`service-worker.js`. Don't widen the upload scope without adjusting the
exclusions.
