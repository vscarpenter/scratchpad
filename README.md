# Scratchpad

A privacy-first, local-only notes app. Pure static HTML/CSS/JS — no backend,
no accounts, no telemetry. Your notes live in this browser's IndexedDB and
never leave it.

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
3. `aws s3 cp index.html / privacy.html / terms.html → s3://$S3_BUCKET/` with
   `Cache-Control: public, max-age=60, must-revalidate` so new HTML reaches
   users within a minute.
4. `aws s3 cp service-worker.js → s3://$S3_BUCKET/service-worker.js` with
   `Cache-Control: no-cache, no-store, must-revalidate` so installed copies
   see the newest app-shell cache quickly.
5. `aws cloudfront create-invalidation` for `/`, `/index.html`,
   `/privacy.html`, `/terms.html`, `/service-worker.js`,
   `/public/manifest.webmanifest`, and `/public/service-worker.js*` so the
   edge cache flips immediately.

Assets are uploaded **before** HTML on purpose: the new HTML never refers
to assets that haven't landed yet.

### Optional response headers (CloudFront response headers policy)

- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`

`'unsafe-inline'` is needed for the two small inline scripts (the theme
bootstrap in `<head>` and the toggle script before `</body>`). If you move
both into a separate file, you can drop `'unsafe-inline'`.

### Releasing a new version

Edit `public/js/version.js` — change `SCRATCHPAD_VERSION` and
`SCRATCHPAD_BUILD_DATE`. Both pages pick the new values up automatically
via the footer placeholders.

Optional but recommended response headers (set via CloudFront response
headers policy):

- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`

(`'unsafe-inline'` on `script-src` and `style-src` is needed for the two
small inline scripts — the theme bootstrap in `<head>` and the toggle script
before `</body>`. Everything else loads from `'self'`. If you move both
inline scripts into a separate file, you can tighten this to remove
`'unsafe-inline'`.)

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
- Nothing is sent off-device. There are no analytics, no error reporting,
  no font loaders. If you open DevTools → Network and disable cache, you
  should see **zero** requests after the initial page load.

To wipe everything: DevTools → Application → Storage → Clear site data, or
remove the `scratchpad` IndexedDB database manually.

### Backups

Use **About → Export backup (JSON)** for the full-fidelity restore format. The
backup includes metadata (`app`, `version`, `schemaVersion`, `exportedAt`),
active notes, trashed notes, and revision snapshots. Drafts are intentionally
excluded.

Use **About → Export Markdown ZIP** for readable `.md` copies of active notes.
Each file includes frontmatter with title, tags, pinned state, and timestamps.

Importing JSON always shows a preview before writing anything. The default is
to import conflicts as duplicates; you can also replace matching ids or skip
conflicts.

## Offline install

Scratchpad registers a service worker when served over HTTP(S). It caches only
the static app shell: the root pages, CSS, JavaScript, vendored libraries,
manifest, local icons, and local Open Graph assets. It does not cache exports,
note content outside IndexedDB, or external resources.

The service-worker cache name is tied to `SCRATCHPAD_VERSION`. After a deploy,
users can force-refresh an installed/offline copy by reloading once while
online; if the old shell persists, close all Scratchpad tabs and open it again
so the new worker can activate.

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
privacy.html
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
    app.js                 # App logic
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
