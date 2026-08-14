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
- **`POST/GET/DELETE /api/share` is the ONLY sanctioned network call.** The
  product is "your notes stay in this browser unless you deliberately share
  one." Don't add any other fetch/XHR. No sync, no autosave-to-server, no
  telemetry, no error reporting.
- **Note content is encrypted client-side before any upload.** A share is
  AES-GCM ciphertext plus an IV; the key is generated in the browser, lives in
  the URL fragment, and must never appear in a request path, query string,
  header, or body. `tests/network-isolation.spec.js` asserts zero requests in
  normal use, exactly one POST when a link is created, and that no request
  carries the note plaintext. Treat those assertions as the executable form of
  the product promise — tighten them, never relax them.
- **`marked` and `DOMPurify` are vendored**, not loaded from a CDN. They live
  in `public/js/vendor/`. Don't replace with CDN URLs.

### Inkwell design system — "Porcelain Chronicle" (v4)
This repo overrides the base Inkwell system with the **Porcelain Chronicle**
direction: a quiet chronology rail, an opaque note index, and a raised document
on cool porcelain surfaces. Restrained Indigo (`#5661B3`) is the sole accent.
The approved spec is in
`docs/superpowers/specs/2026-07-31-porcelain-chronicle-indigo-design.md`.
Read `https://raw.githubusercontent.com/vscarpenter/inkwell/main/agent-instructions.md`
for the base system, but the rules below reflect this repo's overrides and win.
Key rules for anything in `public/css/app.css`:
- **All colors via `var(--token)`** — no hex codes anywhere in app CSS. Use
  `--accent`, `--ink`, `--text-secondary`/`--text-muted`/`--text-body`, `--paper`,
  `--accent-soft`, `--glass-*`, `--wash-*`, `--control-fill`, `--gray-*`, etc.
  Gradients built from token colors (e.g. `--accent-grad`) are fine.
- **Outer borders are 1px hairlines** via `var(--border)` / `var(--border-hair)`.
  The chronology rail and note index are flat opaque surfaces; the document is
  the only raised surface in the application shell. Focus outlines remain the
  exception and stay visible.
- **No decorative glass in the app shell.** The rail, list, top bar, and document
  stage use the semantic `--surface-*` tokens. Do not add blur or gradients to
  the Chronicle shell. Legacy glass tokens remain for dialogs, onboarding, and
  static pages until those surfaces are redesigned.
- **One accent** — `--accent`. Indigo marks the selected day, primary actions,
  links, tags, the document date spine, and focus. `--accent-text` is the
  legibility sibling for accent text or glyphs sitting on a tint. Semantic
  success, warning, and danger colors remain state-only.
- **Platform fonts only** — no `@font-face`, no Google Fonts. The application
  shell and document title use `--sans`; rendered note prose may retain the
  editorial serif voice. `--mono` is metadata only and never prose.
- **No emoji in source.** Icons are inline SVG strokes (the `⌘K` hint is a
  Unicode symbol, matching the existing kbd shortcuts).
- **Dark mode** extends the Pattern-B cascade in `inkwell-tokens.css`; validate
  AA before shipping, and keep the `@media (prefers-color-scheme: dark)` and
  `[data-theme="dark"]` blocks byte-parallel — a divergence there is invisible
  on auto-dark and only surfaces when a user explicitly toggles. The dark accent
  is lifted to `#8593D6`; accent text on a tint uses `--accent-text` (`#8F9EE1`
  in dark), which clears 4.5:1 on every backdrop **including** the opaque
  `--paper` of the active note row. Dark tints are translucent, so verify a new
  tint pairing against `--paper` — the lightest thing it can composite over.

### HTML/JS safety
- **Never set `innerHTML` to untrusted content.** The pre-commit hook at
  `scripts/hooks/pre-commit` flags staged `innerHTML`/`outerHTML` writes and
  `insertAdjacentHTML(` calls. For sanitized markdown rendering, use
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
share.html               public read-only viewer for a shared note (/s/<id>)
about.html               about / support page
privacy.html             privacy policy page
guide.html               user guide / help page (reuses .page-privacy layout + .page-guide)
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
share-infra/             share API Lambda + AWS provisioning (do NOT deploy)
  lambda/handler.mjs     three-route share API over the private shares bucket
  lambda/validate.mjs    pure request validation; unit-tested, no AWS imports
  iam-policy.json        least privilege: shares/* on scratchpad-shares only
  lifecycle.json         expire shares/ after 7 days
  provision.sh           idempotent bucket + role + Lambda + Function URL
  README.md              operator guide, incl. single-share takedown
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

All five pages share `app.css` but split into two layout modes that want
opposite behavior: the app shell (`index.html`) and the `.page-privacy`
content pages (`about.html`, `guide.html`, `privacy.html`, `terms.html`). Three
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
`guide.html`, `privacy.html`, `terms.html`, `share.html`) reads
`localStorage['theme-preview']` and applies the attribute before any CSS parses,
preventing flash of incorrect theme. It's byte-identical across all six pages
(they share one CSP hash). The toggle script at the bottom of each page cycles
`auto → light → dark → auto`; there are two variants of it (`index.html` sets a
`data-theme-icon` attribute, the content pages don't), hence three hashes total.

`share.html` copies the content-page variants **byte for byte** precisely so it
lands on the existing hashes and needs no CSP change. Verify after any edit with
`bash cloudfront/recompute-csp-hashes.sh`, which now scans `share.html` too. If
it reports a new hash, you broke that property.

## Releases and deploys

### Version bumps
Single source of truth: `public/js/version.js`. Edit the two constants
(`SCRATCHPAD_VERSION`, `SCRATCHPAD_BUILD_DATE`) and all six pages
(`index.html`, `about.html`, `guide.html`, `privacy.html`, `terms.html`,
`share.html`) pick up the new
values via the `#app-version` and `#app-build-date` placeholders in their
footers.

### Deploying
Run `./deploy.sh` (or `bash deploy.sh`); `./deploy.sh --dry-run` previews
without changing anything. It reads `S3_BUCKET` and
`CLOUDFRONT_DISTRIBUTION_ID` from `.env.local`, uploads assets **before**
HTML (so every asset a fresh page references already exists in the bucket),
gives both service workers a `no-store` cache so a stale worker can never
pin users to old code, and invalidates CloudFront for the shell entry
points. The exact sync order, per-file cache-control values, and
content-types live in `deploy.sh`; the `release-prep` skill runs the version
bump + dry-run preflight.

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
Headers live in `cloudfront/security-headers-function.js`. If you edit an
inline `<script>` in any HTML shell, run
`bash cloudfront/recompute-csp-hashes.sh` first and update the CSP
`script-src` hashes in **both** the `.js` file and the reference `.json`.
Publishing is push-to-DEVELOPMENT → publish-to-LIVE
(`aws cloudfront update-function` / `publish-function`) — edge propagation
is seconds, with **no** `update-distribution` and no invalidation needed
(the function runs at viewer-response on every response, cached ones
included). The `csp-update` skill runs this end to end; `cloudfront/README.md`
has the exact command snippets.

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
- `share-infra/` (operator-only share API Lambda, IAM, and provisioning)
- `package.json`, `bun.lock`, `node_modules/`, `tests/`, `scripts/`,
  `playwright.config.js` (local-only dev/test tooling)
- `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json` (design-system record;
  `design.json` is the DESIGN.md sidecar and the only tracked file under
  `.impeccable/`)
- `docs/` (specs and design notes)
- `SECURITY-REVIEW.md`, `security-review-evidence.md` (security posture record;
  the evidence file names live AWS resources and must never be served)
- `.git/`, `.verify/`, `.gitignore`

The deploy script handles this by uploading only `public/**` (with
`--delete`) plus the six HTML shells explicitly (`index.html`,
`about.html`, `guide.html`, `privacy.html`, `terms.html`, `share.html`) and the
root `service-worker.js`. Don't widen the upload scope without adjusting the
exclusions.
