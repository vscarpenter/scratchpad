# Repository Guidelines

## Project Structure & Module Organization

Scratchpad is a static, privacy-first notes app with no backend and no build step. Root HTML files are the deployed pages: `index.html`, `privacy.html`, and `terms.html`. App assets live under `public/`: `public/js/app.js` handles UI state and events, `public/js/db.js` wraps IndexedDB, `public/js/version.js` owns release metadata, and `public/js/vendor/` contains vendored `marked` and `DOMPurify`. Styles live in `public/css/`, with Scratchpad-specific layout in `app.css` and Inkwell tokens/components in the `inkwell-*` files. CloudFront-only security artifacts live in `cloudfront/` and are not deployed by the app.

## Build, Test, and Development Commands

- `python3 -m http.server 8080`: serve the app locally from the repo root; visit `http://localhost:8080`.
- `npx --yes serve@latest -l 8080 .`: alternate static server if Node is available.
- `./deploy.sh --dry-run`: preview the S3 sync, HTML upload, and CloudFront invalidation without changing AWS.
- `./deploy.sh`: deploys `public/` plus the three HTML files; only run after explicit approval.
- `bash cloudfront/recompute-csp-hashes.sh`: recompute and verify CSP hashes after editing inline `<script>` blocks.

Do not open pages through `file://`; IndexedDB behavior is origin-dependent.

## Coding Style & Naming Conventions

Use vanilla HTML, CSS, and JavaScript. Match existing two-space indentation in frontend files. Keep functions and variables in `camelCase`, constants in `UPPER_SNAKE_CASE` where already established, and files lowercase with descriptive names. In `public/css/app.css`, use Inkwell tokens such as `var(--accent)` and `var(--paper)`; do not add hex colors, gradients, shadows, external fonts, or emoji. Do not set untrusted content with `innerHTML`; use DOMPurify fragments and `replaceChildren()`.

## Testing Guidelines

There is no automated test suite. For UI changes, run a local static server and verify note creation, editing, search, import/export, theme toggling, and the privacy/terms pages in a browser. For security-header or inline-script changes, run the CSP hash script and check the browser console for CSP violations.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example `Add CloudFront security-headers function and operator guide`. Keep commits focused and mention user-visible behavior or operational impact. Pull requests should describe the change, list manual verification steps, note any privacy or CSP implications, and include screenshots for visual changes. Never commit `.env.local`, `.verify/`, or generated local secrets.

## Security & Configuration Tips

Preserve the app guarantee: notes stay in the browser and no telemetry, third-party scripts, remote fonts, or external user-content requests are added. Keep `.env.local` private and use `.env.local.example` for documented configuration only.
