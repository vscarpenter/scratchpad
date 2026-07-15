# Scratchpad

A privacy-first, local-only notes app. Pure static HTML/CSS/JS — no backend,
no accounts, no telemetry. Your notes live in this browser's IndexedDB and
never leave it.

## Features

### Privacy and resilience

- **Persistent storage protection** — ask supported browsers to reduce the
  risk of automatic storage eviction, with clear best-effort fallback status.
- **Safe multi-tab editing** — detect when another tab changes the same note
  and offer to use the saved version, replace it, or save your work as a copy.
- **Complete local erasure** — type `ERASE` to remove every note, draft,
  revision, and Scratchpad preference from the browser.
- **Encrypted backups** — protect full-fidelity `.scratchpad` backups with a
  passphrase; encryption and decryption happen locally with the Web Crypto API.
- **Controlled offline updates** — work from a cached app shell, choose when an
  update reloads the app, and manually check or refresh the offline copy.

### Notes workflow

- Write and preview Markdown with formatting shortcuts, autosaved drafts, and
  the last 10 saved revisions per note.
- Search titles, bodies, and tags; pin important notes; and use bulk tagging,
  Trash, and restore tools.
- Import one or many Markdown files, including Scratchpad frontmatter, or use
  validated JSON imports with a conflict preview.
- Export full JSON backups, encrypted backups, selected notes, or a Markdown
  ZIP without creating an account.

## Running locally

The whole app is static files. Use any static HTTP server from the project
root (do not open `index.html` via `file://` — IndexedDB is partitioned by
origin and some browsers disable it on file URLs).

```sh
# Python (no install required)
python3 -m http.server 8080

# Node, if you have it
npx --yes serve@latest -l 8080 .
```

Then visit <http://localhost:8080>.

## Deploying to AWS S3 + CloudFront

This is a vanilla static bundle. A one-shot `deploy.sh` ships it.

### First-time setup

1. Create an S3 bucket (private; do **not** enable "public access" — front
   it with CloudFront via an Origin Access Control).
2. Create a CloudFront distribution with the S3 bucket as origin. Set the
   default root object to `index.html`. Add a custom error response so 404 →
   `/index.html` returns 200 if you ever want client-side routing (not
   required today).
3. Copy `.env.local.example` to `.env.local` and fill in:
   - `S3_BUCKET` — bucket name (no `s3://` prefix)
   - `CLOUDFRONT_DISTRIBUTION_ID` — the distribution to invalidate
   - Optionally `AWS_PROFILE` / `AWS_REGION` if your default profile is
     wrong for this project.

   `.env.local` is gitignored; never commit it.
4. Make sure the AWS CLI is installed (`brew install awscli`) and your
   credentials work (`aws sts get-caller-identity`).

### Every deploy

```sh
./deploy.sh             # or: bash deploy.sh   (first run: chmod +x deploy.sh)
./deploy.sh --dry-run   # preview without changing anything
```

What it does:

1. `aws s3 sync public/ → s3://$S3_BUCKET/public/` with
   `Cache-Control: public, max-age=300` (5 min). `--delete` removes any
   orphaned files from older deploys.
2. `aws s3 cp public/manifest.webmanifest` with
   `Content-Type: application/manifest+json` and a short revalidating cache.
   `aws s3 cp public/service-worker.js` with `Cache-Control: no-cache,
   no-store, must-revalidate` so the imported service-worker logic is never
   stuck behind the generic asset cache.
3. `aws s3 cp index.html / about.html / privacy.html / terms.html → s3://$S3_BUCKET/` with
   `Cache-Control: public, max-age=60, must-revalidate` so new HTML reaches
   users within a minute.
4. `aws s3 cp service-worker.js → s3://$S3_BUCKET/service-worker.js` with
   `Cache-Control: no-cache, no-store, must-revalidate` so installed copies
   see the newest app-shell cache quickly.
5. `aws cloudfront create-invalidation` for `/`, `/index.html`,
   `/about.html`, `/privacy.html`, `/terms.html`, `/service-worker.js`,
   `/public/manifest.webmanifest`, and `/public/service-worker.js*` so the
   edge cache flips immediately.

Assets are uploaded **before** HTML on purpose: the new HTML never refers
to assets that haven't landed yet.

### Security headers

Production security headers are emitted by
`cloudfront/security-headers-function.js`, a CloudFront Function attached on
`viewer-response`. The CSP uses sha256 hashes for the inline theme scripts;
it does not require `script-src 'unsafe-inline'`.

Run this after editing any inline `<script>` in `index.html`, `about.html`,
`privacy.html`, or `terms.html`:

```sh
bash cloudfront/recompute-csp-hashes.sh
```

See `cloudfront/README.md` for the exact headers and publish flow.

### Releasing a new version

Edit `public/js/version.js` and change `SCRATCHPAD_VERSION`. The deploy
script refreshes `SCRATCHPAD_BUILD_DATE` to the current date before syncing
`public/`, so the footer build date updates automatically on deploy. The
pages pick both values up automatically via the footer placeholders.

## How data is stored

- All saved notes live in `IndexedDB` under the database name `scratchpad`, in
  an object store called `notes`.
- Unsaved edit recovery uses a `drafts` object store keyed by note id. Drafts
  stay local, are removed after save or discard, and are not included in
  normal exports.
- Saved-note history uses a `revisions` object store and keeps the last 10
  saved snapshots per note.
- Deleted notes are kept in Trash by setting `deletedAt` on the note. They are
  removed permanently only when you choose delete forever or empty Trash.
- The theme preference uses `localStorage` under the key `theme-preview`.
- First-visit state and backup-reminder timestamps use small `localStorage`
  entries. They never contain note content.
- Scratchpad uses `BroadcastChannel` to announce note ids, timestamps, and
  change types between same-origin tabs. It never sends note titles or bodies
  through the channel. Saves compare timestamps against IndexedDB and offer
  explicit conflict choices instead of silently overwriting another tab.
- **About → Protect local data** requests persistent browser storage when the
  Storage API supports it. The browser may decline, and backups remain the
  recovery path either way.
- Nothing is sent off-device. There are no analytics, no error reporting,
  no font loaders, and no third-party runtime requests.

To wipe Scratchpad's notes, drafts, revisions, and preferences, use
**About → Erase local data** and type `ERASE`. Browser site-data controls also
remove the database and offline app cache.

### Backups

Use **About → Export backup (JSON)** for the full-fidelity restore format. The
backup includes metadata (`app`, `version`, `schemaVersion`, `exportedAt`),
active notes, trashed notes, and revision snapshots. Drafts are intentionally
excluded.

Use **About → Export Markdown ZIP** for readable `.md` copies of active notes.
Each file includes frontmatter with title, tags, pinned state, and timestamps.

Use **About → Export encrypted backup** to encrypt the full JSON payload in
the browser with AES-256-GCM. The key is derived from a passphrase with
PBKDF2-HMAC-SHA256, a random salt, and 600,000 iterations. The passphrase and
key are not written to storage, so a forgotten passphrase cannot be recovered.

Importing JSON validates the file before writing anything. The importer caps
file size, note count, revision count, body length, title length, tag count,
and tag length, then shows a preview with rejected entries. The default is to
import conflicts as duplicates; you can also replace matching ids or skip
conflicts.

Markdown import accepts one or more `.md` or `.markdown` files. Scratchpad
understands its own exported frontmatter fields (`title`, `tags`, `pinned`,
`createdAt`, and `updatedAt`) and derives a title from the first heading when
frontmatter is absent. Encrypted `.scratchpad` files are decrypted locally,
then go through the same preview and validation path as JSON.

## Vendored libraries

Runtime dependencies are vendored in `public/js/vendor/` so the deployed app
does not depend on a package CDN. Check them against npm with:

```sh
npm run check:vendor
```

When updating, copy only browser-distribution artifacts into
`public/js/vendor/`, keep filenames stable unless the HTML/service worker are
updated too, then run the Playwright suite and CSP hash check.

## Offline install

Scratchpad registers a service worker when served over HTTP(S). It caches only
the static app shell: the root pages, CSS, JavaScript, vendored libraries,
manifest, local icons, and local Open Graph assets. It does not cache exports,
note content outside IndexedDB, or external resources.

The service-worker cache name is tied to `SCRATCHPAD_VERSION`. A newly installed
worker waits until Scratchpad shows an update notice; the user chooses when to
reload and activate it. **About → Check for updates** performs an explicit
check, while **Refresh offline copy** re-fetches the same-origin app shell and
reports whether it succeeded.

## Keyboard shortcuts

| Shortcut                       | Action                                    |
| ------------------------------ | ----------------------------------------- |
| `⌘/Ctrl` + `N`                 | New note                                  |
| `⌘/Ctrl` + `S`                 | Save (when editing)                       |
| `⌘/Ctrl` + `K` or `/`          | Focus the search box                      |
| `Esc`                          | Clear search when search is focused, or  |
|                                | exit edit mode (with confirmation if dirty) |

## What's in the repo

```
index.html
about.html
privacy.html
terms.html
deploy.sh
.env.local.example
public/
  css/
    inkwell.css            # Inkwell entry point
    inkwell-tokens.css     # Inkwell design tokens
    inkwell-components.css # Inkwell components
    tokens.css             # Legacy aggregator (re-exports)
    app.css                # Scratchpad layout (uses Inkwell tokens only)
  js/
    db.js                  # IndexedDB wrapper
    markdown.js            # marked + DOMPurify rendering policy
    zip.js                 # Dependency-free ZIP writer for Markdown export
    app.js                 # App logic
    erase-landing.js       # Finishes typed local-data erasure after redirect
    version.js             # SCRATCHPAD_VERSION + build date
    vendor/
      marked.min.js        # Markdown parser
      purify.min.js        # DOMPurify HTML sanitizer
  manifest.webmanifest     # PWA install metadata
  service-worker.js        # App-shell cache logic
service-worker.js          # Root shim for full-app service-worker scope
README.md
ScratchPad-PRD.md
```

No build step. No `npm install` for runtime. Deploy the tree as-is.
