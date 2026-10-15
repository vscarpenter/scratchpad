# Threat model

Scratchpad is a local-first notes app served at https://notes.vinny.dev. It's static HTML, CSS, and vanilla JavaScript with no build step. Notes live in the browser's IndexedDB and stay there unless the user deliberately shares one. This file describes what the project promises, where untrusted input enters, and how we rate what the scanner finds.

## What this project does and where untrusted input enters

The product promise is the security boundary. A note's plaintext and a share link's key must never leave the browser. After the page loads, the app makes no network requests apart from the share API and one update check. The user starts that check from Settings. `tests/network-isolation.spec.js` is the executable form of that promise.

Sharing works like this. The browser generates a 256-bit AES-GCM key, encrypts the note, and sends only the ciphertext and IV to `POST /api/share`. The key travels in the link's fragment (`/s/<id>#k=<key>`), which browsers never send to a server. The API stores the envelope in a private S3 bucket and returns a share ID plus an owner token. The owner token authorizes `DELETE` and `PUT`, and the server stores only its SHA-256 hash.

Untrusted input enters in these places:

- A shared note. `share.html` fetches the envelope, decrypts it with the fragment key, and renders the body as Markdown. The sender controls every byte of the plaintext. `share.html` runs on the same origin as the app, so script running there can read every note in the visitor's IndexedDB.
- Save to my Scratchpad. The viewer stashes the decrypted note in `sessionStorage`, and the app turns it into an ordinary local note (`public/js/shared-copy.js`). From then on, sender-controlled Markdown renders inside the app with wikilink and attachment resolution turned on.
- The share API. `share-infra/lambda/handler.mjs` accepts anonymous `POST` and `GET` requests from the internet, plus owner-authenticated `DELETE` and `PUT`. `validate.mjs` is the boundary between that public endpoint and the bucket.
- File imports. Users import JSON backups, encrypted `.scratchpad` backups, and Markdown files (`importFromFiles` in `public/js/app.js`). Backups can carry image attachments as base64 bytes with a declared MIME type.
- The linked folder. Through the File System Access API, the app reads and writes `.md` files in a folder the user picks (`public/js/linked-folder.js`). Other programs can change those files at any time.
- Paste and drop. HTML on the clipboard becomes Markdown through an inert `DOMParser` document (`public/js/html-to-markdown.js`). Pasted and dropped images go through `public/js/attachments.js`.
- URL state. The viewer reads the share ID from the path or `?id=` and the key from the fragment. The app handles `?action=<name>` links at boot, including the `save-shared` handoff from the viewer.

All Markdown, from any source, renders through `renderMarkdownInto` in `public/js/markdown.js`. It runs `marked`, then DOMPurify with `RETURN_DOM_FRAGMENT`, a closed tag and attribute policy, and a URI allowlist. It then strips remote `src` attributes and forces external links to open in a new tab with `rel="noopener noreferrer"`. No app code assigns `innerHTML`, and a pre-commit hook blocks new raw HTML writes.

## Components that matter most / least

These matter most:

- `public/js/markdown.js` and its DOMPurify configuration. The custom `marked` renderers for code blocks, callouts, images, wikilinks, highlights, and task checkboxes build HTML strings before sanitization runs.
- `public/js/share.js`, `public/js/crypto.js`, `public/js/share-manager.js`, and `public/js/shared-copy.js`. Updating a shared link re-encrypts under the same key, so every encryption must draw a fresh IV.
- `share-infra/lambda/`, especially `handler.mjs`, `validate.mjs`, `update.mjs`, `s3-store.mjs`, and `cleanup.mjs`. Look at owner-token checks, expiry checks, conditional writes, the origin-secret check, and anything that could persist a field other than `v`, `ciphertext`, and `iv`.
- `cloudfront/security-headers-function.js`, which sets the production CSP and other headers, and `cloudfront/share-router-function.js`. The router is a security control: it rewrites unknown paths to `index.html` so every response carries the security headers.
- `public/service-worker.js`, which decides what the app serves offline.
- Import parsing and validation in `public/js/app.js`, `public/js/attachments.js`, and `public/js/linked-folder.js`.

These matter least:

- `scripts/`, `tests/`, `docs/`, `config/`, and `.github/` are developer tooling and never deploy. One exception is `scripts/dev-server.mjs`. It deliberately serves only the deployed file set and refuses non-loopback `Host` headers. A bypass that exposes other files (such as `.env.local`) is in scope.
- `share-infra/*.sh`, `deploy.sh`, and `cloudfront/recompute-csp-hashes.sh` are operator scripts that the maintainer runs with their own AWS credentials. Treat their inputs as trusted. The exception is `deploy.sh`, which must upload only its allowlist.
- `public/js/vendor/` holds vendored copies of `marked`, DOMPurify, and Prism. Please report bugs in those libraries upstream. How Scratchpad configures and calls them is in scope.

## How to exercise it

The image has Node 22, Bun, the locked dev dependencies, and Playwright's Chromium, Firefox, and WebKit builds. Everything below runs offline.

- `node --test share-infra/lambda/*.test.mjs` runs the share API tests. They call `createShareHandler` with an in-memory store from `share-infra/lambda/fixtures.mjs`, so no AWS SDK or network is involved. That's the easiest way to drive the API with crafted events.
- `node scripts/dev-server.mjs 8080` serves the app at `http://127.0.0.1:8080`. The share viewer works at `/share.html?id=<12-character id>#k=<key>`.
- `node_modules/.bin/playwright test --project=chromium tests/<name>.spec.js` runs one spec. The Playwright config starts the dev server itself, and `SCRATCHPAD_TEST_PORT` changes its port.
- `tests/share-viewer.spec.js`, `tests/sanitization.spec.js`, and `tests/network-isolation.spec.js` are good starting points. The viewer tests stub `/api/share/*` with `page.route`, which is also the simplest way to feed `share.html` a hostile envelope.
- `bun run test` runs the whole browser suite on all three engines. It takes a while.
- Playwright sizes its worker pool from the CPU count Node reports, and inside a container that count can exceed the two CPUs a scan gets. Pass `--workers=1` if browser tests time out.
- `bun audit` and `node scripts/check-vendor-versions.mjs` query npm, so they fail offline.

The dev server doesn't send the production CSP. To judge whether a payload survives in production, compare it against the policy in `cloudfront/security-headers-function.js`. That policy allows `script-src 'self'` plus three hashes for known inline scripts, `connect-src 'self'`, and `frame-ancestors 'none'`.

## How you rate severity

Critical:

- Note plaintext, a share key, or an owner token leaves the browser in any request, including requests to the share API.
- Script runs on the app origin from content an attacker controls: a shared note, an imported file, a linked-folder file, or pasted HTML. If the production CSP would block that specific payload, rate it high and say so.
- Someone without a share's fragment key recovers its plaintext.
- Someone without a share's owner token changes, replaces, or deletes it.

High:

- A share outlives its expiry, comes back after revocation, or has its expiry changed by an update.
- AES-GCM IV reuse under one key, or any other weakness that lets someone holding only the ciphertext learn the plaintext.
- A request reaches the share API without passing through CloudFront, bypassing the origin secret.
- An app page can be framed, or ships without its security headers.
- The service worker can be made to cache and serve attacker-controlled content.

Medium:

- Denial of service against the share API that gets around the API Gateway throttling documented in `share-infra/README.md`, or that runs up real storage cost.
- An import that corrupts or silently deletes a user's existing notes or linked-folder files.
- A `scripts/dev-server.mjs` bypass that serves files outside the deployed set.

Low:

- Self-XSS that requires victims to paste the payload into their own note.
- Issues that need a malicious browser extension, a compromised device, or a modified local copy of the app.
- Missing hardening with no demonstrated impact.

## Anything to leave alone

- Anyone holding a share ID can read its ciphertext and metadata (revision, publish time, and expiry). The ID carries 72 random bits and the content is encrypted, so that's by design.
- `hasValidOriginSecret` allows every request when the secret is unset. That path exists for local runs, and `share-infra/provision.sh` always sets the secret. Report it only if you can show a deployed path that leaves it unset.
- The store treats an S3 403 as a missing object, because the API role deliberately can't list the bucket. That's intended.

Reports help most when they include a failing Playwright test or `node --test` case that reproduces the issue. A patch should keep the existing tests green. Please keep fixes inside the existing patterns: DOMPurify fragments and `replaceChildren()` for rendering, `textContent` for plain fields, and no new network requests.
