# User Guide Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `guide.html` — a ten-section user guide with TOC — wired into every entry point and the deploy/SW/CSP infrastructure, per `docs/superpowers/specs/2026-07-17-user-guide-page-design.md`.

**Architecture:** Static content page reusing the `.page-privacy` layout (like terms.html), with a `.page-guide` modifier for guide-only styles. Head theme script and footer toggle script copied byte-identical from privacy.html so existing CSP hashes cover the page.

**Tech Stack:** Static HTML + tokens-only CSS; Playwright e2e.

## Global Constraints

- Inline `<script>` blocks MUST be byte-identical to privacy.html's; verify with `bash cloudfront/recompute-csp-hashes.sh` (after adding guide.html to its list) — it must report all hashes valid with no changes.
- Tokens-only CSS, no emoji, no screenshots, no third-party anything.
- Tests: `bunx playwright test <file> --project=chromium` while iterating; `bunx playwright test` (full, all browsers, true exit code — no `tail` pipes) at the end.
- Commits per creating-git-commits conventions with the `Claude-Session:` trailer.
- Deploy is manual and out of scope.

---

### Task 1: guide.html page + styles + core tests

**Files:** Create `guide.html`, `tests/guide.spec.js`. Modify `public/css/app.css` (`.page-guide` styles).

**Steps:**
- [ ] Write failing tests: page loads with `<h1>`; all ten section ids present (`#first-five-minutes #markdown #task-lists #daily-notes #linking #organizing #backups #privacy-controls #offline #shortcuts`); TOC link with `href="#task-lists"` scrolls to the section; theme toggle cycles `auto → light → dark` and persists across reload (copy theme.spec.js's pattern against `/guide.html`).
- [ ] Run: `bunx playwright test tests/guide.spec.js --project=chromium` — FAIL (404 page).
- [ ] Author guide.html: copy privacy.html's full skeleton (doctype→`</head>`, header, footer, both inline scripts BYTE-IDENTICAL); body class `page-privacy page-guide`; article `class="card privacy-card guide-card"`. Content: hero (h1 "How to use Scratchpad" + one-liner), `<nav class="guide-toc">` of ten anchor chips, ten `<h2 id=…>` sections with the copy outlined in the spec — concrete, second-person, restrained voice; `<kbd class="kbd">` for keys, `<code>` for syntax; the shortcuts section is a table matching README's shortcut set (⌘/Ctrl N, S, K, /, Shift+D, Shift+P, Esc).
- [ ] Add `.page-guide` styles in app.css next to the privacy-page styles: `.guide-toc` (flex-wrap chip row: `--control-fill` background pills, `--r-pill` radius, accent on hover) and `.guide-card h2 { scroll-margin-top: 24px; }`; reuse everything else.
- [ ] Run tests — PASS. Commit: `feat(guide): add user guide page with ten-section TOC`.

### Task 2: entry points

**Files:** Modify `index.html` (footer nav + About dialog link + palette markup none needed), `about.html`, `privacy.html`, `terms.html` (footer navs), `public/js/app.js` (palette command). Test: extend `tests/guide.spec.js`.

**Steps:**
- [ ] Failing tests: each page's footer contains `a[href="guide.html"]`; about.html has a "Read the user guide" link near the hero; palette "Open user guide" command exists and calls `window.open` with `guide.html` (assert via `context.waitForEvent('page')` for the new tab).
- [ ] Add "Guide" to the shared footer nav on all five pages (guide.html links its siblings; each footer's nav lists Privacy · Terms · Guide · About consistently with the existing order conventions).
- [ ] about.html hero/nav area: `<a class="btn btn-secondary" href="guide.html">Read the user guide</a>` styled like the surrounding actions.
- [ ] index.html About dialog: a "User guide" link `target="_blank" rel="noopener"` in the dialog's links row.
- [ ] app.js `commandDefinitions()`: entry `{ id: 'open-guide', label: 'Open user guide', meta: 'How to use every feature', keywords: 'help docs manual how to', run: () => window.open('guide.html', '_blank', 'noopener') }`.
- [ ] Run tests — PASS. Commit: `feat(guide): link the guide from footers, About, dialog, and palette`.

### Task 3: infrastructure wiring

**Files:** Modify `deploy.sh`, `public/service-worker.js`, `cloudfront/recompute-csp-hashes.sh`, `CLAUDE.md`, `README.md`. Test: extend `tests/guide.spec.js` + run hash check.

**Steps:**
- [ ] Failing test: network isolation — load `/guide.html`, record all requests, assert every URL is same-origin (copy network-isolation.spec.js's pattern). Also assert the service worker's `APP_SHELL` includes `/guide.html` by fetching `/public/service-worker.js` text and checking the literal.
- [ ] `deploy.sh`: add `guide.html` to the `for html in …` loop and `"/guide.html"` to the invalidation array.
- [ ] `public/service-worker.js`: add `'/guide.html',` to `APP_SHELL` after `'/terms.html',`.
- [ ] `cloudfront/recompute-csp-hashes.sh`: add guide.html to the comment and the python arg list.
- [ ] Run `bash cloudfront/recompute-csp-hashes.sh` — must pass with NO hash changes (byte-identical scripts). If it reports a difference, fix guide.html's inline scripts, never the hashes.
- [ ] `CLAUDE.md` structure list: add `guide.html` line; README repo tree + features blurb mention the guide.
- [ ] Run tests — PASS. Commit: `feat(guide): wire guide.html into deploy, offline shell, and CSP check`.

### Task 4: release

- [ ] Bump `SCRATCHPAD_VERSION` to `'3.1.1'` (SW cache name rolls with it, so installed PWAs fetch the new shell including guide.html).
- [ ] Full suite: `bunx playwright test` to a log file; confirm true exit code 0.
- [ ] Commit: `chore(release): bump Scratchpad to 3.1.1 with the user guide`.

## Verification checklist

- Hash script green with unchanged hashes; suite green on three browsers; `git diff` touches only the files named above; deploy NOT run.
