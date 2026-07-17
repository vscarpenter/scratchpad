# User guide page (guide.html)

Date: 2026-07-17
Status: Approved for implementation

## Goal

Add a companion page to about.html: a full user guide with a table of
contents covering every feature, reachable from everywhere it makes sense.
Ships as v3.1.1.

## Product constraints

- Static, same-origin, local-only. No screenshots — text plus styled
  `<kbd>`/`<code>` and the existing inline-SVG icon language only.
- The `<head>` theme script and footer toggle script are byte-identical to
  the other four pages so the existing CSP hashes cover them. If any inline
  script differs, the release is broken — verify with
  `bash cloudfront/recompute-csp-hashes.sh` after adding guide.html to its
  file list.
- Tokens-only CSS; no emoji in source; reuse Soft Glass components.
- No new JavaScript beyond the shared theme scripts.

## Page structure

- `guide.html` at the site root, `<body class="page-privacy page-guide">` —
  inherits the content-page layout (window scroll, `.card` article, shared
  `.app-footer`); `.page-guide` scopes guide-only styles.
- A small hero: page title plus a one-line description.
- A chip-style TOC linking to ten `<h2>` sections (ids are stable anchors):
  1. `#first-five-minutes` — create, write, save; edit vs view; where data
     lives (link to privacy.html)
  2. `#markdown` — syntax crib (headings, lists, code, quotes, links,
     tables) and the formatting toolbar
  3. `#task-lists` — `- [ ]` syntax, clicking checkboxes in view mode, the
     inert fallback in plain language
  4. `#daily-notes` — Today button and `⌘/Ctrl+Shift+D`, the "Daily
     template" convention, quick capture, PWA shortcuts
  5. `#linking` — `[[Title]]`, autocomplete, phantom links create notes,
     backlinks, rename updating
  6. `#organizing` — search, tags and bulk tagging, pins, Trash, command
     palette
  7. `#backups` — JSON export/import, Markdown ZIP, encrypted backups,
     conflict handling, backup reminders
  8. `#privacy-controls` — storage protection, multi-tab safety, typed
     ERASE, what never leaves the browser
  9. `#offline` — PWA install, controlled updates, refresh offline copy
  10. `#shortcuts` — full keyboard shortcuts table using `.kbd`

## Entry points

- Footer nav on index.html, about.html, privacy.html, terms.html gains a
  "Guide" link; guide.html's own footer shows the same nav.
- about.html: a visible "Read the user guide" link in the hero/nav area.
- index.html About dialog: a "User guide" link.
- Command palette: `Open user guide` entry.
- Every app-to-guide entry (dialog link and palette command) opens a NEW
  tab (`target="_blank" rel="noopener"` / `window.open('guide.html',
  '_blank', 'noopener')`) so it can never navigate away from a dirty
  editor. Static-page footers navigate in place as usual.

## Integration

- `deploy.sh`: add guide.html to the HTML shell upload loop and the
  CloudFront invalidation list.
- `public/service-worker.js`: add `/guide.html` to `APP_SHELL`.
- `cloudfront/recompute-csp-hashes.sh`: add guide.html to the verified
  file list (both the comment and the python invocation).
- `CLAUDE.md` project-structure list and README repo tree mention the page.

## Testing

New `tests/guide.spec.js`:

- Page loads with the title and all ten section headings.
- TOC anchor click navigates to its section.
- Theme toggle cycles and persists across reload (reuses theme.spec.js
  conventions).
- Footer links on the other four pages reach guide.html.
- Command palette entry navigates to the guide.
- No cross-origin requests while loading guide.html (network-isolation
  conventions).

## Release

- Version bump to 3.1.1.
- README features section mentions the guide.
- Run `bash cloudfront/recompute-csp-hashes.sh` — must pass with unchanged
  hashes (byte-identical inline scripts).
- Deploy remains manual and requires explicit confirmation.
