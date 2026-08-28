# Repository Guidelines

> **`CLAUDE.md` is the source of truth for this repo and must be read before
> making changes.** This file mirrors the load-bearing subset of it — the
> invariants you cannot get wrong and the commands that actually work — so that
> agents which auto-load `AGENTS.md` (but not `CLAUDE.md`) start from correct
> guidance. When the two diverge, `CLAUDE.md` wins; update both from it.

## What this is

Scratchpad is a privacy-first, local-only notes app: pure static HTML/CSS/vanilla
JavaScript, **no build step**, deployed at https://notes.vinny.dev via S3 +
CloudFront. Notes live in IndexedDB; theme in localStorage. **The entire app
makes zero network calls after initial page load** — that is a product
guarantee, not an implementation detail. `share-infra/` (operator-only share API
Lambda) and `cloudfront/` (operator-only security-header artifacts) are the
only server-side pieces, and neither is deployed with the app.

## Standards contract

`coding-standards.md` v18 is the canonical human reference. The repository's
enforceable vanilla-JavaScript profile and legacy ratchets are documented in
`docs/adr/0002-adopt-a-ratcheted-vanilla-javascript-quality-profile.md`. Run
`npm run verify` plus `npm test`; do not claim the greenfield 80% coverage or
size thresholds until the ratchets actually reach them.

## Hard rules — do not violate

- **No third-party scripts, fonts, trackers, or analytics.** Everything is
  same-origin. `marked` and `DOMPurify` are vendored in `public/js/vendor/`, not
  loaded from a CDN. No sync, no autosave-to-server, no telemetry.
- **`POST/GET/DELETE /api/share` is the ONLY sanctioned network call.** A share
  is client-side AES-GCM ciphertext plus an IV; the key lives in the URL
  **fragment** and must never touch a request path, query, header, or body.
  `tests/network-isolation.spec.js` and `tests/storage-protection.spec.js` are
  the executable form of this promise — tighten, never relax.
- **Never set `innerHTML`/`outerHTML` to untrusted content.** The sanctioned
  pattern is `DOMPurify.sanitize(raw, { RETURN_DOM_FRAGMENT: true })` +
  `replaceChildren()` — see `public/js/app.js` `renderMarkdownInto()`. Clear with
  `container.replaceChildren()`, not `innerHTML = ''`. Clone static SVG from a
  `<template>`. External links open in new tabs with `rel="noopener noreferrer"`.
- **Design (Inkwell "Indigo on Paper" v5): colors via `var(--token)` only** in
  `public/css/app.css` — no hex. Gradients _built from token colors_ are fine;
  decorative glass is not (keep the app shell flat; the document is the one
  raised surface). Restrained Indigo `--accent` is the sole accent. **Platform
  fonts only** (no `@font-face` / Google Fonts); no emoji in source. **No
  dark-mode rules in `app.css`** — dark mode is driven by `inkwell-tokens.css`
  tokens; fix token usage, don't add `[data-theme="dark"]` rules. Executable in
  `tests/design-tokens.spec.js`; full spec at
  `docs/superpowers/specs/2026-08-16-indigo-on-paper-design.md`.

## Commands (use these — not the ones in older notes)

```sh
node scripts/dev-server.mjs          # serve locally on 127.0.0.1:8080
npm test                             # Playwright suite; auto-starts dev-server, 3 browsers
npm test folders.spec.js             # target one spec
npm test --headed                   # or: -- --ui, -- --report
npm run test:lambda                  # node --test on share-infra/lambda
npm run check:shell                 # app-shell integrity guard
npm run check:vendor                # vendored marked/DOMPurify currency
bash cloudfront/recompute-csp-hashes.sh   # ONLY after editing an inline <script>; update CSP hash in the .js AND the .json
./deploy.sh --dry-run               # preview S3 sync + CF invalidation; safe to run autonomously
./deploy.sh                         # REAL deploy — only after explicit user confirmation
```

**Do NOT use `python3 -m http.server` or `npx serve` here** — they serve the
whole working tree (`.env.local`, `.git/`, security dossiers) with directory
listings and no Host validation. `scripts/dev-server.mjs` serves exactly what
`deploy.sh` uploads and rejects non-loopback Host headers (DNS rebinding); the
Playwright suite uses it. **Do not open pages via `file://`** — IndexedDB
behavior on file URLs is inconsistent.

## Layout tripwires (don't regress)

Three rules in `app.css` keep the app shell and the `.page-privacy` content
pages working together. If the sidebar overflows the viewport or a content page
fails to scroll, fix these — see `CLAUDE.md` "Layout tripwires."

## Releases and deploys

- **Version truth:** `public/js/version.js` (`SCRATCHPAD_VERSION`,
  `SCRATCHPAD_BUILD_DATE`); all six shells (`index`, `about`, `guide`,
  `privacy`, `terms`, `share`) pick it up via footer placeholders.
- **Deploy uploads** `public/**` (with `--delete`) plus the **six** HTML shells
  and the root `service-worker.js` only. Never widen that without updating the
  exclusions. `share-infra/` and `cloudfront/` are operator-only and never
  deploy.
- **Authorization:** never run a real deploy (or any AWS mutation: `aws s3 cp`,
  `update-distribution`, `create-invalidation`) without explicit "yes, deploy" in
  the current turn. Dry-runs are safe to run on their own.
- **Deploy identity:** `deploy.sh` forwards `AWS_PROFILE` (set
  `AWS_PROFILE=scratchpad-deploy` in `.env.local`, a least-privilege user); an
  unset profile falls back to an admin `default` profile (finding `SP-01`).
  Confirm with `aws sts get-caller-identity` before a real deploy.
- **After editing an inline `<script>`:** run
  `bash cloudfront/recompute-csp-hashes.sh` and update the CSP `script-src`
  hashes in **both** `cloudfront/security-headers-function.js` and the reference
  `.json`, then publish push-to-DEVELOPMENT → publish-to-LIVE. The theme-preview
  head script is byte-identical across all six pages (they share one CSP hash).

## Coding style & naming

Vanilla HTML/CSS/JS. Two-space indentation in frontend files. `camelCase` for
functions/variables, `UPPER_SNAKE_CASE` for established constants, lowercase
descriptive filenames. Match existing conventions rather than restyling.

## Testing

There **is** an automated suite: 49 Playwright specs in `tests/`
(`npm test`), plus `node --test` on the share Lambda (`npm run test:lambda`)
and the `check:shell` / `check:vendor` guards. After any UI change run the
relevant specs (note CRUD, search, import/export, theme, share flows,
sanitization, network isolation); after a security-header or inline-script
change run the CSP recompute and check the console for CSP violations.

## Pre-commit guard

A pre-commit hook (`scripts/hooks/pre-commit`, activate with
`git config core.hooksPath scripts/hooks`) fails closed on staged raw-DOM writes
(`innerHTML`/`outerHTML`/`insertAdjacentHTML(...)`/`document.write`/
`setHTMLUnsafe(...)`/`createContextualFragment(...)`). It scans only added
lines, so it never blocks unrelated commits, and exempts `public/js/vendor/` and
`node_modules/`.

## Commit & pull request guidelines

Short imperative commit subjects (e.g. `Add CloudFront security-headers
function and operator guide`). Keep commits focused; note user-visible behavior
or operational impact. PRs should describe the change, list manual verification
steps, call out any privacy or CSP implications, and include screenshots for
visual changes. **Never commit** `.env.local`, `.verify/`, the security-review
dossiers, or any generated secret. (`CLAUDE.md` "What not to deploy" lists the
full set.)

## Security & configuration tips

Preserve the app guarantee: notes stay in the browser; add no telemetry,
third-party requests, remote fonts, or external user-content fetches. Keep
`.env.local` private and use `.env.local.example` for documented configuration
only. For deep detail on any of the above, read the corresponding section of
`CLAUDE.md`.
