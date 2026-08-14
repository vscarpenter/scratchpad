# Note Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user turn one note into a public, read-only link that is encrypted in the browser and stops working after seven days.

**Architecture:** The note is encrypted client-side with AES-GCM; the 256-bit key rides in the URL fragment and is never transmitted. A single Lambda with three routes is added as a second origin on the existing CloudFront distribution, so the browser stays same-origin. The shares S3 bucket has Block Public Access fully on — every read goes through the Lambda, leaving exactly one code path that can return share data.

**Tech Stack:** Vanilla ES5-flavored browser JS (no build step, no modules — scripts attach to `window`), WebCrypto, IndexedDB, Node 20 ESM for the Lambda, Playwright for browser tests, `node --test` for Lambda tests, AWS CLI for provisioning.

**Spec:** `docs/superpowers/specs/2026-08-13-note-sharing-design.md`

## Global Constraints

- **No third-party scripts, fonts, trackers, or analytics.** Everything same-origin. `marked` and `DOMPurify` stay vendored in `public/js/vendor/`.
- **No build step.** Browser JS files are plain `<script src>` includes wrapped in an IIFE that attaches one global (`window.ScratchpadCrypto`, `window.ScratchpadDB`, `window.Markdown`). Do not introduce ESM, bundlers, or transpilation in `public/`.
- **Never set `innerHTML` to untrusted content.** The pre-commit hook at `scripts/hooks/pre-commit` blocks staged `innerHTML`/`outerHTML` writes and `insertAdjacentHTML(`. Clear containers with `replaceChildren()`. Render markdown only via `Markdown.renderMarkdownInto()`.
- **Never use `git commit --no-verify`.**
- **All CSS colors via `var(--token)`** — no hex codes in `public/css/app.css`. One accent: `--accent`.
- **No emoji in source.** Icons are inline SVG strokes cloned from a `<template>` in the HTML.
- **Platform fonts only** — no `@font-face`, no Google Fonts.
- **`share.html` must reuse the inline theme-init and theme-toggle scripts from `index.html` byte for byte.** Those two scripts already have sha256 hashes in `cloudfront/security-headers-function.js`. Copying them verbatim means the CSP needs no change. Any deviation — even whitespace — requires running `bash cloudfront/recompute-csp-hashes.sh` and updating both `cloudfront/security-headers-function.js` and `cloudfront/response-headers-policy.json`.
- **Share expiry is 7 days**, set by the server as `now + 7 * 24 * 60 * 60 * 1000`. A client-supplied `expiresAt` is ignored, never clamped.
- **Request body cap is 262144 bytes (256 KB)**, rejected with HTTP 413 before any S3 call.
- **Share IDs are 12 base64url characters.** Share keys are 256-bit AES-GCM, exported as 43 base64url characters. IVs are 12 bytes.
- **Shares bucket is `scratchpad-shares`**, key prefix `shares/`, Block Public Access fully enabled.
- **AWS-managed CloudFront policies only** — the distribution is on the Free pricing plan, which rejects custom cache and origin-request policies. Use managed `CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) and managed `AllViewerExceptHostHeader` (`b689b0a8-53d0-40ab-baf2-68738e2966ac`).
- **Never run the real `./deploy.sh` or any AWS mutation without explicit user confirmation in the current turn.** `./deploy.sh --dry-run` is safe to run autonomously.
- Run the browser suite with `bun run test` (Playwright). Run Lambda tests with `bun run test:lambda`.

---

## Task 1: Extract `public/js/crypto.js`

Behavior-preserving move of the AES-GCM, PBKDF2, and base64 helpers out of `app.js`, plus the new share-specific functions. This ships no user-visible change; its whole purpose is that Task 6 and Task 4 have one crypto module instead of two.

**Files:**
- Create: `public/js/crypto.js`
- Create: `tests/crypto.spec.js`
- Modify: `public/js/app.js` — delete lines 36-38 (constants) and 4767-4843 (helpers); rewrite call sites at 4912, 4927, 5188
- Modify: `index.html:849` — add the script tag
- Modify: `public/service-worker.js` — add `/public/js/crypto.js` to `APP_SHELL`

**Interfaces:**
- Consumes: nothing.
- Produces: `window.ScratchpadCrypto` with:
  - `bytesToBase64(Uint8Array) -> string`
  - `base64ToBytes(string) -> Uint8Array`
  - `bytesToBase64Url(Uint8Array) -> string`
  - `base64UrlToBytes(string) -> Uint8Array`
  - `isEncryptedBackup(any) -> boolean`
  - `encryptBackupPayload(payload, passphrase) -> Promise<envelope>`
  - `decryptBackupEnvelope(envelope, passphrase) -> Promise<payload>`
  - `generateShareKey() -> Promise<CryptoKey>`
  - `exportShareKey(CryptoKey) -> Promise<string>` (43 base64url chars)
  - `importShareKey(string) -> Promise<CryptoKey>` (throws on wrong length)
  - `encryptShare(payload, CryptoKey) -> Promise<{v:1, ciphertext:string, iv:string}>`
  - `decryptShare(envelope, CryptoKey) -> Promise<payload>` (throws on tamper or wrong key)

- [ ] **Step 1: Write the failing test**

Create `tests/crypto.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

/**
 * ScratchpadCrypto is the single crypto module for both encrypted backups and
 * note sharing. Share confidentiality rests entirely on these functions, so
 * they get direct tests rather than only being covered through the UI.
 */
test.describe('ScratchpadCrypto share primitives', () => {
  test('encrypt/decrypt roundtrip preserves the payload', async ({ page }) => {
    await gotoApp(page);
    const result = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const payload = { v: 1, title: 'Hi', body: '# Heading\n\ntext', tags: ['a'], updatedAt: 42 };
      const envelope = await C.encryptShare(payload, key);
      return { envelope, decrypted: await C.decryptShare(envelope, key) };
    });
    expect(result.decrypted).toEqual({ v: 1, title: 'Hi', body: '# Heading\n\ntext', tags: ['a'], updatedAt: 42 });
    expect(result.envelope.v).toBe(1);
    expect(typeof result.envelope.ciphertext).toBe('string');
    expect(typeof result.envelope.iv).toBe('string');
  });

  test('ciphertext does not contain the plaintext', async ({ page }) => {
    await gotoApp(page);
    const envelope = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      return C.encryptShare({ v: 1, title: 'SUPERSECRET', body: 'SUPERSECRET', tags: [], updatedAt: 0 }, key);
    });
    expect(envelope.ciphertext).not.toContain('SUPERSECRET');
    expect(atob(envelope.ciphertext)).not.toContain('SUPERSECRET');
  });

  test('each share gets a fresh IV', async ({ page }) => {
    await gotoApp(page);
    const ivs = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const payload = { v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 };
      const a = await C.encryptShare(payload, key);
      const b = await C.encryptShare(payload, key);
      return [a.iv, b.iv];
    });
    expect(ivs[0]).not.toBe(ivs[1]);
  });

  test('the wrong key fails to decrypt', async ({ page }) => {
    await gotoApp(page);
    const failed = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const envelope = await C.encryptShare({ v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 }, await C.generateShareKey());
      try {
        await C.decryptShare(envelope, await C.generateShareKey());
        return false;
      } catch { return true; }
    });
    expect(failed).toBe(true);
  });

  test('a tampered ciphertext fails the authentication tag', async ({ page }) => {
    await gotoApp(page);
    const failed = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const envelope = await C.encryptShare({ v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 }, key);
      const bytes = C.base64ToBytes(envelope.ciphertext);
      bytes[0] = bytes[0] ^ 0xff;
      try {
        await C.decryptShare({ ...envelope, ciphertext: C.bytesToBase64(bytes) }, key);
        return false;
      } catch { return true; }
    });
    expect(failed).toBe(true);
  });

  test('key export/import roundtrips and rejects malformed text', async ({ page }) => {
    await gotoApp(page);
    const result = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const exported = await C.exportShareKey(key);
      const envelope = await C.encryptShare({ v: 1, title: 'ok', body: '', tags: [], updatedAt: 0 }, key);
      const decrypted = await C.decryptShare(envelope, await C.importShareKey(exported));
      let rejected = false;
      try { await C.importShareKey('too-short'); } catch { rejected = true; }
      return { exported, title: decrypted.title, rejected };
    });
    expect(result.exported).toHaveLength(43);
    expect(result.exported).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.title).toBe('ok');
    expect(result.rejected).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

Run: `bun run test -- tests/crypto.spec.js`
Expected: every case FAILS with a `TypeError` about reading properties of undefined — `window.ScratchpadCrypto` does not exist yet. If a case fails for any other reason, stop and diagnose before writing code.

- [ ] **Step 3: Create `public/js/crypto.js`**

The first half is a verbatim move from `app.js` (constants from lines 36-38, functions from 4767-4843). Do not "improve" it during the move — a behavior change here is a change to a shipped encryption format.

```js
/* Scratchpad: crypto primitives shared by encrypted backups and note sharing.
   Exposes window.ScratchpadCrypto. No DOM access, no storage access. */
(function () {
  'use strict';

  const ENCRYPTED_BACKUP_FORMAT = 'scratchpad-encrypted-backup';
  const ENCRYPTED_BACKUP_VERSION = 1;
  const ENCRYPTED_BACKUP_ITERATIONS = 600000;

  const SHARE_VERSION = 1;
  const SHARE_KEY_BYTES = 32;
  const SHARE_IV_BYTES = 12;
  const SHARE_KEY_B64URL_LENGTH = 43;

  function bytesToBase64(bytes) {
    let value = '';
    for (let i = 0; i < bytes.length; i += 1) value += String.fromCharCode(bytes[i]);
    return btoa(value);
  }

  function base64ToBytes(value) {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
    return bytes;
  }

  // The share key travels in a URL fragment, so it uses the URL-safe alphabet
  // with padding stripped. The envelope itself stays on standard base64.
  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return base64ToBytes(padded + '==='.slice((padded.length + 3) % 4));
  }

  async function deriveBackupKey(passphrase, salt, usage) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ENCRYPTED_BACKUP_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }

  async function encryptBackupPayload(payload, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(passphrase, salt, 'encrypt');
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      format: ENCRYPTED_BACKUP_FORMAT,
      version: ENCRYPTED_BACKUP_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ENCRYPTED_BACKUP_ITERATIONS, salt: bytesToBase64(salt) },
      cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  function isEncryptedBackup(data) {
    return !!data && data.format === ENCRYPTED_BACKUP_FORMAT && data.version === ENCRYPTED_BACKUP_VERSION;
  }

  async function decryptBackupEnvelope(envelope, passphrase) {
    if (!isEncryptedBackup(envelope) || !envelope.kdf || !envelope.cipher ||
      envelope.kdf.iterations !== ENCRYPTED_BACKUP_ITERATIONS ||
      typeof envelope.kdf.salt !== 'string' || typeof envelope.cipher.iv !== 'string' ||
      typeof envelope.ciphertext !== 'string') {
      throw new Error('Invalid encrypted backup envelope');
    }
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encrypted backup parameters');
    const key = await deriveBackupKey(passphrase, salt, 'decrypt');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  // --- Sharing -------------------------------------------------------------
  // Unlike a backup key, a share key is random rather than passphrase-derived:
  // there is no passphrase to remember because the key itself is the link.

  function generateShareKey() {
    return crypto.subtle.importKey(
      'raw',
      crypto.getRandomValues(new Uint8Array(SHARE_KEY_BYTES)),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async function exportShareKey(key) {
    return bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
  }

  async function importShareKey(text) {
    if (typeof text !== 'string' || text.length !== SHARE_KEY_B64URL_LENGTH || !/^[A-Za-z0-9_-]+$/.test(text)) {
      throw new Error('Invalid share key');
    }
    const bytes = base64UrlToBytes(text);
    if (bytes.length !== SHARE_KEY_BYTES) throw new Error('Invalid share key');
    return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function encryptShare(payload, key) {
    const iv = crypto.getRandomValues(new Uint8Array(SHARE_IV_BYTES));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      v: SHARE_VERSION,
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
    };
  }

  async function decryptShare(envelope, key) {
    if (!envelope || envelope.v !== SHARE_VERSION ||
      typeof envelope.ciphertext !== 'string' || typeof envelope.iv !== 'string') {
      throw new Error('Invalid share envelope');
    }
    const iv = base64ToBytes(envelope.iv);
    if (iv.length !== SHARE_IV_BYTES) throw new Error('Invalid share parameters');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  window.ScratchpadCrypto = {
    bytesToBase64,
    base64ToBytes,
    bytesToBase64Url,
    base64UrlToBytes,
    isEncryptedBackup,
    encryptBackupPayload,
    decryptBackupEnvelope,
    generateShareKey,
    exportShareKey,
    importShareKey,
    encryptShare,
    decryptShare,
  };
})();
```

- [ ] **Step 4: Wire the script tag**

In `index.html`, add the include immediately before `db.js` at line 849, so the module is defined before anything that uses it:

```html
  <script src="public/js/crypto.js"></script>
  <script src="public/js/db.js"></script>
```

In `public/service-worker.js`, add `'/public/js/crypto.js',` to `APP_SHELL` immediately before `'/public/js/db.js',`.

- [ ] **Step 5: Run the new test and confirm it passes**

Run: `bun run test -- tests/crypto.spec.js`
Expected: PASS, 6 cases.

- [ ] **Step 6: Delete the moved code from `app.js`**

Delete the three constants at lines 36-38. Delete `bytesToBase64`, `base64ToBytes`, `deriveBackupKey`, `encryptBackupPayload`, `isEncryptedBackup`, and `decryptBackupEnvelope` (lines 4767-4843), leaving `isNativeBackup` — which sits between them at 4816-4826 — in place.

Rewrite the three remaining call sites:

- Line ~4912: `const envelope = await encryptBackupPayload(await buildBackupPayload(), passphrase);`
  becomes `const envelope = await ScratchpadCrypto.encryptBackupPayload(await buildBackupPayload(), passphrase);`
- Line ~4927: `data = await decryptBackupEnvelope(state.encryptedImport, els.backupPassphrase.value);`
  becomes `data = await ScratchpadCrypto.decryptBackupEnvelope(state.encryptedImport, els.backupPassphrase.value);`
- Line ~5188: `if (isEncryptedBackup(data)) {`
  becomes `if (ScratchpadCrypto.isEncryptedBackup(data)) {`

Then confirm nothing was missed:

```bash
grep -n "ENCRYPTED_BACKUP_\|bytesToBase64\|base64ToBytes\|isEncryptedBackup\|deriveBackupKey\|encryptBackupPayload\|decryptBackupEnvelope" public/js/app.js
```

Expected: only the three `ScratchpadCrypto.`-prefixed call sites.

- [ ] **Step 7: Prove the extraction changed no behavior**

Run: `bun run test -- tests/encrypted-backup.spec.js tests/crypto.spec.js tests/import.spec.js`
Expected: PASS. `encrypted-backup.spec.js` is the regression net for this move — if it fails, the move was not faithful.

- [ ] **Step 8: Run the full suite**

Run: `bun run test`
Expected: PASS. This catches any missed call site in a flow the targeted specs do not exercise.

- [ ] **Step 9: Commit**

```bash
git add public/js/crypto.js tests/crypto.spec.js public/js/app.js index.html public/service-worker.js
git commit -m "refactor(crypto): extract shared crypto module from app.js

Move the AES-GCM, PBKDF2, and base64 helpers out of app.js into
public/js/crypto.js and add the share primitives alongside them, so
sharing and encrypted backups cannot drift into two implementations of
the same envelope format.

Pure move for the backup path; encrypted-backup.spec.js is unchanged
and green. app.js drops ~80 lines.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Task 2: Lambda request validation (pure module)

The validation logic is separated from all AWS access so it can be unit-tested with the Node built-in runner and no mocking. This is the module that stands between a public write endpoint and the bucket.

**Files:**
- Create: `share-infra/lambda/validate.mjs`
- Create: `share-infra/lambda/validate.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_BODY_BYTES = 262144`
  - `SHARE_TTL_MS = 604800000`
  - `SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/`
  - `parseShareBody(rawBody) -> {ok:true, value:{v,ciphertext,iv}} | {ok:false, status:number, error:string}`
  - `isValidShareId(string) -> boolean`

- [ ] **Step 1: Write the failing test**

Create `share-infra/lambda/validate.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShareBody, isValidShareId, MAX_BODY_BYTES, SHARE_TTL_MS } from './validate.mjs';

const iv = Buffer.alloc(12, 7).toString('base64');
const ciphertext = Buffer.from('some ciphertext bytes').toString('base64');
const good = JSON.stringify({ v: 1, ciphertext, iv });

test('accepts a well-formed body', () => {
  const result = parseShareBody(good);
  assert.equal(result.ok, true);
  assert.equal(result.value.iv, iv);
  assert.equal(result.value.ciphertext, ciphertext);
});

test('rejects a body over the size cap with 413', () => {
  const oversized = JSON.stringify({ v: 1, ciphertext: 'A'.repeat(MAX_BODY_BYTES), iv });
  const result = parseShareBody(oversized);
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

test('rejects malformed JSON with 400', () => {
  const result = parseShareBody('{not json');
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('rejects a missing body with 400', () => {
  assert.equal(parseShareBody(undefined).status, 400);
  assert.equal(parseShareBody('').status, 400);
});

test('rejects a wrong envelope version', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 2, ciphertext, iv })).status, 400);
});

test('rejects a missing or non-string field', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 1, iv })).status, 400);
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext, iv: 5 })).status, 400);
});

test('rejects an IV that is not exactly 12 bytes', () => {
  const shortIv = Buffer.alloc(8, 1).toString('base64');
  const longIv = Buffer.alloc(16, 1).toString('base64');
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext, iv: shortIv })).status, 400);
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext, iv: longIv })).status, 400);
});

test('rejects ciphertext that is not valid base64', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext: '!!!not base64!!!', iv })).status, 400);
});

test('rejects empty ciphertext', () => {
  assert.equal(parseShareBody(JSON.stringify({ v: 1, ciphertext: '', iv })).status, 400);
});

test('ignores a client-supplied expiresAt entirely', () => {
  const withExpiry = JSON.stringify({ v: 1, ciphertext, iv, expiresAt: 4102444800000 });
  const result = parseShareBody(withExpiry);
  assert.equal(result.ok, true);
  assert.equal('expiresAt' in result.value, false);
});

test('the TTL is exactly seven days', () => {
  assert.equal(SHARE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

test('validates share id shape', () => {
  assert.equal(isValidShareId('AbCdEf123456'), true);
  assert.equal(isValidShareId('with-dash_ok'), true);
  assert.equal(isValidShareId('tooshort'), false);
  assert.equal(isValidShareId('waytoolongforanid'), false);
  assert.equal(isValidShareId('../../../etc/pw'), false);
  assert.equal(isValidShareId(''), false);
  assert.equal(isValidShareId(undefined), false);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test:lambda`
Expected: FAIL — `Cannot find module .../validate.mjs`.

- [ ] **Step 3: Write `share-infra/lambda/validate.mjs`**

```js
// Pure request validation for the share API. No AWS imports, no I/O — this
// module is the boundary between a public write endpoint and the bucket, so it
// is unit-testable in isolation and every rejection happens before any S3 call.

export const MAX_BODY_BYTES = 262144; // 256 KB
export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
export const SHARE_ENVELOPE_VERSION = 1;
const IV_BYTES = 12;

function fail(status, error) {
  return { ok: false, status, error };
}

function decodeBase64(value) {
  const buf = Buffer.from(value, 'base64');
  // Buffer.from is lenient: it silently drops invalid characters rather than
  // throwing, so round-trip to confirm the input really was base64.
  return buf.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '') ? buf : null;
}

export function isValidShareId(id) {
  return typeof id === 'string' && SHARE_ID_PATTERN.test(id);
}

export function parseShareBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.length === 0) return fail(400, 'Missing body');
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return fail(413, 'Body too large');

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return fail(400, 'Malformed JSON');
  }

  if (!parsed || typeof parsed !== 'object') return fail(400, 'Malformed body');
  if (parsed.v !== SHARE_ENVELOPE_VERSION) return fail(400, 'Unsupported envelope version');
  if (typeof parsed.ciphertext !== 'string' || parsed.ciphertext.length === 0) return fail(400, 'Missing ciphertext');
  if (typeof parsed.iv !== 'string' || parsed.iv.length === 0) return fail(400, 'Missing iv');

  const ciphertext = decodeBase64(parsed.ciphertext);
  if (!ciphertext || ciphertext.length === 0) return fail(400, 'Invalid ciphertext encoding');

  const iv = decodeBase64(parsed.iv);
  if (!iv || iv.length !== IV_BYTES) return fail(400, 'Invalid iv');

  // Only these three fields are ever persisted. Anything else the client sent,
  // including an expiresAt, is dropped here — the server owns expiry.
  return { ok: true, value: { v: SHARE_ENVELOPE_VERSION, ciphertext: parsed.ciphertext, iv: parsed.iv } };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run test:lambda`
Expected: PASS, 12 cases.

- [ ] **Step 5: Commit**

```bash
git add share-infra/lambda/validate.mjs share-infra/lambda/validate.test.mjs
git commit -m "feat(share-infra): add pure request validation for the share API

Size cap, envelope shape, base64 validity, and exact IV length, all
checked before any S3 call. A client-supplied expiresAt is dropped
rather than clamped -- the server owns expiry.

Pure module with no AWS imports, so it tests under node --test with no
mocking.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Task 3: Lambda handler and AWS provisioning

Three routes over a private bucket. No app changes in this task — when it lands, the API exists and nothing in the product calls it yet.

**Files:**
- Create: `share-infra/lambda/handler.mjs`
- Create: `share-infra/lambda/handler.test.mjs`
- Create: `share-infra/iam-policy.json`
- Create: `share-infra/lifecycle.json`
- Create: `share-infra/provision.sh`
- Create: `share-infra/README.md`

**Interfaces:**
- Consumes: `parseShareBody`, `isValidShareId`, `SHARE_TTL_MS` from Task 2.
- Produces: the HTTP contract the client in Tasks 4 and 6 depends on —
  - `POST /api/share` body `{v:1,ciphertext,iv}` → `201 {id, revokeToken, expiresAt}`
  - `GET /api/share/{id}` → `200 {v,ciphertext,iv,expiresAt}` | `404` | `410`
  - `DELETE /api/share/{id}` header `X-Revoke-Token` → `204` | `403` | `404`
  - Exported for tests: `route(method, path) -> {action, id}`, `newShareId()`, `hashToken(token)`

- [ ] **Step 1: Write the failing test**

Create `share-infra/lambda/handler.test.mjs`. It tests routing, ID generation, and token hashing — the parts that are pure. S3 access is exercised by the smoke test in Step 7, not mocked here.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { route, newShareId, hashToken, timingSafeEqualHex } from './handler.mjs';

test('routes POST /api/share to create', () => {
  assert.deepEqual(route('POST', '/api/share'), { action: 'create', id: null });
});

test('routes GET /api/share/{id} to read', () => {
  assert.deepEqual(route('GET', '/api/share/AbCdEf123456'), { action: 'read', id: 'AbCdEf123456' });
});

test('routes DELETE /api/share/{id} to revoke', () => {
  assert.deepEqual(route('DELETE', '/api/share/AbCdEf123456'), { action: 'revoke', id: 'AbCdEf123456' });
});

test('rejects a traversal attempt in the id', () => {
  assert.equal(route('GET', '/api/share/..%2F..%2Fetc').action, 'unknown');
  assert.equal(route('GET', '/api/share/../../etc').action, 'unknown');
});

test('rejects unknown methods and paths', () => {
  assert.equal(route('PUT', '/api/share/AbCdEf123456').action, 'unknown');
  assert.equal(route('POST', '/api/share/AbCdEf123456').action, 'unknown');
  assert.equal(route('GET', '/api/share').action, 'unknown');
  assert.equal(route('GET', '/api/other').action, 'unknown');
});

test('share ids are 12 url-safe characters and do not repeat', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i += 1) {
    const id = newShareId();
    assert.match(id, /^[A-Za-z0-9_-]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 500);
});

test('hashToken is stable, hex, and hides the token', () => {
  const hashed = hashToken('a-token');
  assert.equal(hashed, hashToken('a-token'));
  assert.match(hashed, /^[0-9a-f]{64}$/);
  assert.notEqual(hashed, hashToken('a-token '));
});

test('timingSafeEqualHex compares equal-length hex safely', () => {
  const a = hashToken('x');
  assert.equal(timingSafeEqualHex(a, a), true);
  assert.equal(timingSafeEqualHex(a, hashToken('y')), false);
  assert.equal(timingSafeEqualHex(a, 'short'), false);
  assert.equal(timingSafeEqualHex(a, undefined), false);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test:lambda`
Expected: FAIL — `Cannot find module .../handler.mjs`. The `validate.test.mjs` cases from Task 2 still pass.

- [ ] **Step 3: Write `share-infra/lambda/handler.mjs`**

```js
// Share API. Three routes over a private bucket:
//   POST   /api/share          create
//   GET    /api/share/{id}     read
//   DELETE /api/share/{id}     revoke
//
// The bucket has Block Public Access fully on, so this handler is the only way
// to reach share data. Every read therefore gets an expiry check even though
// S3 lifecycle also deletes the object -- lifecycle runs on a daily cadence and
// can lag a nominal expiry by up to 48 hours.

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { parseShareBody, isValidShareId, SHARE_TTL_MS } from './validate.mjs';

const BUCKET = process.env.SHARES_BUCKET;
const PREFIX = 'shares/';
const s3 = new S3Client({});

const READ_PATH = /^\/api\/share\/([^/]+)$/;

export function newShareId() {
  return randomBytes(9).toString('base64url'); // 9 bytes -> exactly 12 chars
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function route(method, path) {
  if (method === 'POST' && path === '/api/share') return { action: 'create', id: null };
  const match = READ_PATH.exec(path);
  const id = match ? match[1] : null;
  if (!id || !isValidShareId(id)) return { action: 'unknown', id: null };
  if (method === 'GET') return { action: 'read', id };
  if (method === 'DELETE') return { action: 'revoke', id };
  return { action: 'unknown', id: null };
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

async function readObject(id) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: PREFIX + id + '.json' }));
    return JSON.parse(await res.Body.transformToString());
  } catch (error) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function create(rawBody) {
  const parsed = parseShareBody(rawBody);
  if (!parsed.ok) return json(parsed.status, { error: parsed.error });

  const id = newShareId();
  const revokeToken = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SHARE_TTL_MS;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: PREFIX + id + '.json',
    ContentType: 'application/json',
    Body: JSON.stringify({ ...parsed.value, expiresAt, revokeHash: hashToken(revokeToken) }),
  }));

  return json(201, { id, revokeToken, expiresAt });
}

async function read(id) {
  const stored = await readObject(id);
  if (!stored) return json(404, { error: 'Not found' });
  if (Date.now() > stored.expiresAt) return json(410, { error: 'Expired' });
  // revokeHash is deliberately not echoed back.
  return json(200, { v: stored.v, ciphertext: stored.ciphertext, iv: stored.iv, expiresAt: stored.expiresAt });
}

async function revoke(id, token) {
  const stored = await readObject(id);
  if (!stored) return json(404, { error: 'Not found' });
  if (typeof token !== 'string' || !timingSafeEqualHex(stored.revokeHash, hashToken(token))) {
    return json(403, { error: 'Forbidden' });
  }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: PREFIX + id + '.json' }));
  return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' };
}

export async function handler(event) {
  const method = event?.requestContext?.http?.method || '';
  const path = event?.rawPath || '';
  const { action, id } = route(method, path);

  const rawBody = event?.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event?.body;

  try {
    if (action === 'create') return await create(rawBody);
    if (action === 'read') return await read(id);
    if (action === 'revoke') {
      const headers = event.headers || {};
      return await revoke(id, headers['x-revoke-token'] || headers['X-Revoke-Token']);
    }
    return json(404, { error: 'Not found' });
  } catch (error) {
    // Never echo the error: it can carry bucket names and key paths.
    console.error('share handler failure', action, error?.name);
    return json(500, { error: 'Server error' });
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run test:lambda`
Expected: PASS, 20 cases across both files.

Note: `@aws-sdk/client-s3` is provided by the Lambda Node 20 runtime, so there is no `package.json` and no `npm install` here. The import resolves at runtime in Lambda, and the test file imports only the pure exports, so `node --test` never evaluates an S3 call. If the import itself fails locally, add `share-infra/lambda/package.json` containing `{"type":"module"}` and install the SDK as a dev-only dependency — do not commit `node_modules`.

- [ ] **Step 5: Write the IAM policy and lifecycle rule**

`share-infra/iam-policy.json` — least privilege, scoped to the shares prefix only. It names no other bucket, so a bug in the handler cannot reach the site bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ShareObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::scratchpad-shares/shares/*"
    }
  ]
}
```

`share-infra/lifecycle.json`:

```json
{
  "Rules": [
    {
      "ID": "expire-shares-after-7-days",
      "Status": "Enabled",
      "Filter": { "Prefix": "shares/" },
      "Expiration": { "Days": 7 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

- [ ] **Step 6: Write `share-infra/provision.sh`**

```bash
#!/usr/bin/env bash
# Provision the Scratchpad share API: private bucket, lifecycle, role, Lambda,
# Function URL. Idempotent -- safe to re-run; existing resources are reported
# and skipped. Operator-only; never deployed to S3.
set -euo pipefail

BUCKET="${SHARES_BUCKET:-scratchpad-shares}"
REGION="${AWS_REGION:-us-east-1}"
ROLE_NAME="scratchpad-share-lambda-role"
FUNCTION_NAME="scratchpad-share-api"
POLICY_NAME="scratchpad-share-s3-access"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "DRY-RUN: $*"
  else
    "$@"
  fi
}

echo "Bucket:   $BUCKET"
echo "Region:   $REGION"
echo "Function: $FUNCTION_NAME"
[ "$DRY_RUN" -eq 1 ] && echo "(dry run -- no changes)"
echo

# 1. Private bucket -------------------------------------------------------
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket exists, skipping create."
else
  run aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    $([ "$REGION" = "us-east-1" ] || echo "--create-bucket-configuration LocationConstraint=$REGION")
fi

run aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

run aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

run aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration "file://$HERE/lifecycle.json"

# 2. Execution role -------------------------------------------------------
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role exists, skipping create."
else
  run aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  run aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "Waiting for role propagation..."
  run sleep 10
fi

run aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "file://$HERE/iam-policy.json"

# 3. Package and deploy the function --------------------------------------
ZIP="$(mktemp -d)/share-api.zip"
(cd "$HERE/lambda" && zip -q -r "$ZIP" handler.mjs validate.mjs)
echo "Packaged: $ZIP"

ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || echo 'ROLE_ARN_PENDING')"

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  run aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://$ZIP"
else
  run aws lambda create-function --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x --role "$ROLE_ARN" --handler handler.handler \
    --timeout 10 --memory-size 256 --zip-file "fileb://$ZIP" \
    --environment "Variables={SHARES_BUCKET=$BUCKET}"
  run aws lambda create-function-url-config --function-name "$FUNCTION_NAME" --auth-type NONE
  run aws lambda add-permission --function-name "$FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl \
    --principal '*' --function-url-auth-type NONE
fi

run aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
  --environment "Variables={SHARES_BUCKET=$BUCKET}"

echo
echo "Function URL:"
aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --query 'FunctionUrl' --output text 2>/dev/null || echo "(pending)"
echo
echo "Next: attach this origin to the CloudFront distribution -- see README.md step 4."
```

Make it executable: `chmod +x share-infra/provision.sh`

- [ ] **Step 7: Write `share-infra/README.md`**

It must contain, with exact commands: the one-time provisioning run; how to attach the Lambda origin and the `/api/share*` cache behavior to the existing distribution using managed policy IDs `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` (CachingDisabled) and `b689b0a8-53d0-40ab-baf2-68738e2966ac` (AllViewerExceptHostHeader), with `AllowedMethods` including `POST` and `DELETE`; how to redeploy handler code after an edit; a curl smoke test of all three routes; **how to take down a single share by ID** (`aws s3 rm "s3://scratchpad-shares/shares/<id>.json"`); and how to set the CloudWatch billing alarm. Include the warning that `OriginPath` must stay empty on the existing S3 origin.

The smoke test to include verbatim:

```bash
# Replace with the Function URL from provision.sh, or use https://notes.vinny.dev
API="https://notes.vinny.dev/api/share"
IV=$(head -c 12 /dev/urandom | base64)
CT=$(head -c 64 /dev/urandom | base64)

CREATED=$(curl -sS -X POST "$API" -H 'content-type: application/json' \
  -d "{\"v\":1,\"ciphertext\":\"$CT\",\"iv\":\"$IV\"}")
echo "$CREATED"
ID=$(echo "$CREATED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
TOKEN=$(echo "$CREATED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["revokeToken"])')

curl -sS "$API/$ID"; echo                                   # expect 200 + ciphertext
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$API/$ID" -H "x-revoke-token: wrong"   # expect 403
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE "$API/$ID" -H "x-revoke-token: $TOKEN"  # expect 204
curl -sS -o /dev/null -w '%{http_code}\n' "$API/$ID"                                        # expect 404

# Oversized body is refused before any S3 write
python3 -c 'print("{\"v\":1,\"iv\":\"AAAAAAAAAAAAAAAA\",\"ciphertext\":\"" + "A"*300000 + "\"}")' > /tmp/big.json
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$API" -H 'content-type: application/json' --data-binary @/tmp/big.json  # expect 413
```

- [ ] **Step 8: Add `share-infra/` to the do-not-deploy list**

In `CLAUDE.md`, under "What not to deploy", add `share-infra/` next to `cloudfront/` in both the bullet list and the project-structure tree. `deploy.sh` uploads only `public/**` plus an explicit HTML list, so no script change is needed — this is documentation of intent.

- [ ] **Step 9: Commit**

```bash
git add share-infra/ CLAUDE.md
git commit -m "feat(share-infra): add the share API Lambda and provisioning

Three routes over a bucket with Block Public Access fully on, so the
handler is the only path to share data. Reads check expiry themselves
because S3 lifecycle runs daily and can lag a nominal expiry by up to
48 hours.

The revoke token is stored only as a sha256 hash and compared in
constant time, so a full dump of the bucket confers no ability to
revoke. The IAM policy names only the shares prefix -- the handler has
no permission that touches the site bucket.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

- [ ] **Step 10: Provision AWS — REQUIRES USER CONFIRMATION**

Run `bash share-infra/provision.sh --dry-run` autonomously and show the output. Then **stop and ask the user for explicit confirmation** before running the real `bash share-infra/provision.sh` or attaching the CloudFront origin. Per `CLAUDE.md`, every AWS mutation needs a fresh "yes" in the current turn; a previous approval never carries forward.

---

## Task 4: Public viewer page and `/s/*` routing

The read-only page a recipient lands on. It is the only surface in the product that renders markdown originating outside the user's own browser, which makes sanitization the highest-value test here.

**Files:**
- Create: `share.html`
- Create: `public/js/share.js`
- Create: `cloudfront/share-router-function.js`
- Create: `tests/share-viewer.spec.js`
- Modify: `public/css/app.css` — add the `.share-view` block
- Modify: `public/service-worker.js` — cache `share.html` and the new scripts; route `/s/*` navigations to the share shell
- Modify: `deploy.sh` — add `share.html` to the upload list and the invalidation list

**Interfaces:**
- Consumes: `ScratchpadCrypto.importShareKey`, `ScratchpadCrypto.decryptShare` (Task 1); `GET /api/share/{id}` (Task 3); `Markdown.renderMarkdownInto(el, src)` (existing, `public/js/markdown.js`).
- Produces: nothing other tasks consume. Task 6 only needs to build a URL of the shape `/s/<id>#k=<key>`.

- [ ] **Step 1: Write the failing test**

Create `tests/share-viewer.spec.js`. Every case stubs `/api/share/*` with `page.route`, so no network and no AWS is involved. The helper builds a real encrypted envelope using the app's own crypto, so the test exercises real decryption rather than a mock.

```js
// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * The viewer renders markdown that came from outside this browser -- the only
 * place in the product that does. Sanitization is therefore load-bearing, not
 * defense in depth.
 */

// Encrypt a payload with the app's own crypto, then hand back the envelope and
// the base64url key that belongs in the URL fragment.
async function makeShare(page, payload) {
  await page.goto('/share.html');
  return page.evaluate(async (p) => {
    const C = window.ScratchpadCrypto;
    const key = await C.generateShareKey();
    return { envelope: await C.encryptShare(p, key), key: await C.exportShareKey(key) };
  }, payload);
}

async function stubShare(page, envelope, { expiresAt = Date.now() + 86400000, status = 200 } = {}) {
  await page.route('**/api/share/*', (routeCall) => routeCall.fulfill({
    status,
    contentType: 'application/json',
    body: status === 200 ? JSON.stringify({ ...envelope, expiresAt }) : JSON.stringify({ error: 'nope' }),
  }));
}

test.describe('share viewer', () => {
  test('renders a decrypted note', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1, title: 'Shared note', body: '# Hello\n\nSome **bold** text.', tags: ['ideas'], updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-title')).toHaveText('Shared note');
    await expect(page.locator('.share-body h1')).toHaveText('Hello');
    await expect(page.locator('.share-body strong')).toHaveText('bold');
    await expect(page.locator('.share-tag')).toHaveText('ideas');
    await expect(page.locator('.share-expiry')).toContainText('Expires');
    await expect(page.locator('.share-state-error')).toHaveCount(0);
  });

  test('sanitizes hostile markdown', async ({ page }) => {
    const hostile = [
      '<img src=x onerror="window.__pwned = true">',
      '<script>window.__pwned = true;<\/script>',
      '[click](javascript:window.__pwned=true)',
      '<iframe src="https://example.com"></iframe>',
      '<a href="#" onclick="window.__pwned=true">x</a>',
    ].join('\n\n');
    const { envelope, key } = await makeShare(page, { v: 1, title: 'x', body: hostile, tags: [], updatedAt: 1 });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-body')).toBeVisible();
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(page.locator('.share-body script')).toHaveCount(0);
    await expect(page.locator('.share-body iframe')).toHaveCount(0);
    expect(await page.locator('.share-body').innerHTML()).not.toContain('onerror');
    expect(await page.locator('.share-body').innerHTML()).not.toContain('javascript:');
  });

  test('escapes the title rather than parsing it as markup', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1, title: '<img src=x onerror="window.__pwned=true">', body: 'b', tags: [], updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    await expect(page.locator('.share-title')).toContainText('<img');
    await expect(page.locator('.share-title img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('opens external links in a new tab with noopener', async ({ page }) => {
    const { envelope, key } = await makeShare(page, {
      v: 1, title: 't', body: '[out](https://example.com)', tags: [], updatedAt: 1,
    });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);

    const link = page.locator('.share-body a');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('shows the expired state on 410', async ({ page }) => {
    await stubShare(page, null, { status: 410 });
    await page.goto('/share.html?id=AbCdEf123456#k=' + 'A'.repeat(43));
    await expect(page.locator('.share-state-expired')).toBeVisible();
    await expect(page.locator('.share-state-expired')).toContainText('expired');
    await expect(page.locator('.share-body')).toHaveCount(0);
  });

  test('shows the not-found state on 404', async ({ page }) => {
    await stubShare(page, null, { status: 404 });
    await page.goto('/share.html?id=AbCdEf123456#k=' + 'A'.repeat(43));
    await expect(page.locator('.share-state-missing')).toBeVisible();
  });

  test('shows the bad-key state when the fragment is missing or malformed', async ({ page }) => {
    const { envelope } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    await stubShare(page, envelope);

    await page.goto('/share.html?id=AbCdEf123456');
    await expect(page.locator('.share-state-badkey')).toBeVisible();

    await page.goto('/share.html?id=AbCdEf123456#k=not-a-real-key');
    await expect(page.locator('.share-state-badkey')).toBeVisible();
  });

  test('shows the bad-key state when the key does not decrypt the payload', async ({ page }) => {
    const { envelope } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    const { key: otherKey } = await makeShare(page, { v: 1, title: 'other', body: 'x', tags: [], updatedAt: 1 });
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + otherKey);
    await expect(page.locator('.share-state-badkey')).toBeVisible();
  });

  test('shows the network-failure state when the fetch fails', async ({ page }) => {
    await page.route('**/api/share/*', (routeCall) => routeCall.abort());
    await page.goto('/share.html?id=AbCdEf123456#k=' + 'A'.repeat(43));
    await expect(page.locator('.share-state-offline')).toBeVisible();
  });

  test('never puts the key in a network request', async ({ page }) => {
    const { envelope, key } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    const urls = [];
    page.on('request', (req) => urls.push(req.url()));
    await stubShare(page, envelope);
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);
    await expect(page.locator('.share-title')).toHaveText('t');

    const apiCalls = urls.filter((u) => u.includes('/api/share'));
    expect(apiCalls.length).toBe(1);
    for (const url of urls) expect(url).not.toContain(key);
  });

  test('the viewer opens no IndexedDB connection', async ({ page }) => {
    const { envelope, key } = await makeShare(page, { v: 1, title: 't', body: 'b', tags: [], updatedAt: 1 });
    await stubShare(page, envelope);
    await page.addInitScript(() => {
      window.__idbOpened = false;
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => { window.__idbOpened = true; return original(...args); };
    });
    await page.goto('/share.html?id=AbCdEf123456#k=' + key);
    await expect(page.locator('.share-title')).toHaveText('t');
    expect(await page.evaluate(() => window.__idbOpened)).toBe(false);
  });
});
```

Note the tests use `/share.html?id=...`, not `/s/...`. The local dev server (`python3 -m http.server 8080`) has no CloudFront Function, so `share.js` must accept the ID from **either** a `/s/<id>` path **or** an `?id=` query parameter. That is not test-only scaffolding — it is what makes the page testable and locally developable without AWS.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test -- tests/share-viewer.spec.js`
Expected: FAIL — `/share.html` 404s.

- [ ] **Step 3: Write `share.html`**

Structure: reuse the `.page-privacy` body class so the page scrolls naturally with content (per the layout tripwires in `CLAUDE.md`), plus a `.page-share` class for the view-specific styles.

Requirements that are easy to get wrong:

1. The `<head>` inline theme script must be **byte-identical** to `index.html:34-40`. Copy it, do not retype it.
2. The bottom inline toggle script must be **byte-identical** to `index.html:856-881`. Copy it.
3. **That toggle script calls `btn.addEventListener` with no null guard**, so the page MUST contain a `#theme-toggle` button and a `#theme-label` element or it throws on load. Copy the footer theme-toggle markup from `privacy.html`.
4. Script order: `vendor/marked.min.js`, `vendor/purify.min.js`, `crypto.js`, `markdown.js`, `share.js`. No `db.js`, no `app.js`, no `seed.js` — the viewer touches no storage.
5. Meta: `<meta name="robots" content="noindex, nofollow" />`. A share link is private-by-obscurity and must never be indexed. Give it a generic `og:title` of "A note shared from Scratchpad" and **no** `og:description` derived from content — the server cannot read the note, and neither should a link preview.

Body skeleton:

```html
<body class="page-privacy page-share">
  <main class="privacy-main share-main" id="share-main">
    <div class="share-state share-state-loading" id="share-loading">
      <p class="share-state-text">Decrypting&hellip;</p>
    </div>

    <article class="share-doc" id="share-doc" hidden>
      <header class="share-doc-head">
        <h1 class="share-title" id="share-title"></h1>
        <ul class="share-tags" id="share-tags"></ul>
      </header>
      <div class="share-body" id="share-body"></div>
    </article>

    <div class="share-state share-state-expired" id="share-expired" hidden>
      <h1 class="share-state-title">This link has expired</h1>
      <p class="share-state-text">Shared notes stop working seven days after they are created. Ask whoever sent it for a fresh link.</p>
    </div>

    <div class="share-state share-state-missing" id="share-missing" hidden>
      <h1 class="share-state-title">Nothing here</h1>
      <p class="share-state-text">This link does not point to a shared note. It may have been revoked by whoever created it.</p>
    </div>

    <div class="share-state share-state-badkey" id="share-badkey" hidden>
      <h1 class="share-state-title">This link is incomplete</h1>
      <p class="share-state-text">The part of the link after the <code>#</code> holds the key that decrypts this note. Copy the whole link and try again.</p>
    </div>

    <div class="share-state share-state-offline" id="share-offline" hidden>
      <h1 class="share-state-title">Could not load this note</h1>
      <p class="share-state-text">Check your connection and reload the page.</p>
    </div>
  </main>

  <footer class="privacy-footer share-footer">
    <p class="share-expiry" id="share-expiry" hidden></p>
    <p class="share-provenance">
      Shared from <a href="/">Scratchpad</a>. Encrypted in the sender's browser &mdash;
      this site cannot read it.
    </p>
    <!-- copy the theme-toggle button + #theme-label markup from privacy.html here -->
  </footer>
```

- [ ] **Step 4: Write `public/js/share.js`**

```js
/* Scratchpad share viewer. Fetches one encrypted share, decrypts it with the
   key from the URL fragment, and renders it read-only. Touches no storage. */
(function () {
  'use strict';

  const els = {
    loading: document.getElementById('share-loading'),
    doc: document.getElementById('share-doc'),
    title: document.getElementById('share-title'),
    tags: document.getElementById('share-tags'),
    body: document.getElementById('share-body'),
    expiry: document.getElementById('share-expiry'),
    expired: document.getElementById('share-expired'),
    missing: document.getElementById('share-missing'),
    badkey: document.getElementById('share-badkey'),
    offline: document.getElementById('share-offline'),
  };

  const STATES = ['loading', 'doc', 'expired', 'missing', 'badkey', 'offline'];

  function show(name) {
    STATES.forEach((key) => {
      if (els[key]) els[key].hidden = key !== name;
    });
  }

  // The CloudFront Function rewrites /s/<id> to /share.html without changing
  // the browser's URL, so the path still carries the id in production. The
  // ?id= form is what makes the page work under a plain static file server.
  function readShareId() {
    const fromPath = /^\/s\/([A-Za-z0-9_-]{12})\/?$/.exec(location.pathname);
    if (fromPath) return fromPath[1];
    const fromQuery = new URLSearchParams(location.search).get('id');
    return /^[A-Za-z0-9_-]{12}$/.test(fromQuery || '') ? fromQuery : null;
  }

  function readShareKey() {
    const match = /[#&]k=([A-Za-z0-9_-]+)/.exec(location.hash);
    return match ? match[1] : null;
  }

  function renderTags(tags) {
    els.tags.replaceChildren();
    if (!Array.isArray(tags) || tags.length === 0) return;
    tags.forEach((tag) => {
      if (typeof tag !== 'string' || !tag) return;
      const li = document.createElement('li');
      li.className = 'share-tag';
      li.textContent = tag;
      els.tags.appendChild(li);
    });
  }

  function renderExpiry(expiresAt) {
    if (!Number.isFinite(expiresAt)) return;
    const when = new Date(expiresAt);
    els.expiry.textContent = 'Expires ' + when.toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    els.expiry.hidden = false;
  }

  async function main() {
    show('loading');

    const id = readShareId();
    if (!id) { show('missing'); return; }

    const keyText = readShareKey();
    if (!keyText) { show('badkey'); return; }

    let key;
    try {
      key = await ScratchpadCrypto.importShareKey(keyText);
    } catch {
      show('badkey');
      return;
    }

    let response;
    try {
      response = await fetch('/api/share/' + encodeURIComponent(id), {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      show('offline');
      return;
    }

    if (response.status === 410) { show('expired'); return; }
    if (response.status === 404) { show('missing'); return; }
    if (!response.ok) { show('offline'); return; }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      show('offline');
      return;
    }

    // Belt and braces: the server refuses expired objects, but a cached or
    // replayed response must not outlive the promise printed on the page.
    if (Number.isFinite(envelope.expiresAt) && Date.now() > envelope.expiresAt) {
      show('expired');
      return;
    }

    let note;
    try {
      note = await ScratchpadCrypto.decryptShare(envelope, key);
    } catch {
      show('badkey');
      return;
    }

    // textContent, never innerHTML: the title is user data and is not markdown.
    els.title.textContent = typeof note.title === 'string' && note.title ? note.title : 'Untitled note';
    document.title = els.title.textContent + ' — shared from Scratchpad';
    renderTags(note.tags);
    Markdown.renderMarkdownInto(els.body, typeof note.body === 'string' ? note.body : '');
    renderExpiry(envelope.expiresAt);
    show('doc');
  }

  main();
})();
```

- [ ] **Step 5: Add the `.share-*` styles to `public/css/app.css`**

Tokens only, no hex codes. Reuse the existing `.page-privacy` reading-column width so the shared note matches the static pages. The document is the only raised surface; the states are flat. Style `.share-tag` with `--accent-soft` and `--accent-text` to match tag chips elsewhere, and give `.share-body` the same prose treatment `.rendered` gets in the app.

- [ ] **Step 6: Run the viewer tests**

Run: `bun run test -- tests/share-viewer.spec.js`
Expected: PASS, 11 cases. Sanitization and the "no IndexedDB" case are the two that must never be weakened to make a build green.

- [ ] **Step 7: Write `cloudfront/share-router-function.js`**

```js
// CloudFront Function (cloudfront-js-2.0) attached to the default cache
// behavior on viewer-request. Rewrites /s/<id> to /share.html so share links
// are short. The browser URL is unchanged, so share.js still reads the id from
// location.pathname.
//
// The existing viewer-response security-headers function is separate and
// untouched. Publish with update-function then publish-function; no
// update-distribution and no invalidation are needed.

function handler(event) {
    var request = event.request;
    if (/^\/s\/[A-Za-z0-9_-]{12}\/?$/.test(request.uri)) {
        request.uri = '/share.html';
    }
    return request;
}
```

Document the publish commands in `cloudfront/README.md` alongside the existing function workflow, and note that this function attaches at **viewer-request** while the headers function attaches at **viewer-response** — a distribution can have one of each on the same behavior.

- [ ] **Step 8: Update the service worker**

In `public/service-worker.js`:

Add to `APP_SHELL`, keeping the existing ordering style:

```js
    '/share.html',
    '/public/js/crypto.js',
    '/public/js/share.js',
```

Then make navigations to `/s/*` fall back to the share shell rather than the app shell. The current handler falls back to `/index.html` for every navigation, which would render the notes app at a share URL when offline. Replace the navigate branch:

```js
    if (req.mode === 'navigate') {
      const shellFallback = /^\/s\/[A-Za-z0-9_-]{12}\/?$/.test(url.pathname)
        ? '/share.html'
        : '/index.html';
      event.respondWith(
        fetch(req).catch(() =>
          caches.match(url.pathname).then((cached) => cached || caches.match(shellFallback))
        )
      );
      return;
    }
```

No change is needed to make `/api/share*` bypass the cache: the fetch handler already returns early for non-`GET` requests, and `GET /api/share/{id}` is not in `APP_SHELL_SET` so it falls through to the network untouched. Add a comment at the `APP_SHELL_SET` check recording that this is load-bearing — a cached share response would survive revocation.

- [ ] **Step 9: Add `share.html` to the deploy scope**

In `deploy.sh`, add `share.html` to the `for html in ...` list at line 154 and `"/share.html"` to the invalidation paths array at line 176. Update the header comment at line 24 to name the six HTML shells instead of five.

- [ ] **Step 10: Verify the deploy preview and run the full suite**

Run: `./deploy.sh --dry-run`
Expected: `share.html` appears in the upload plan and the invalidation list; no `share-infra/` or `docs/` path appears anywhere.

Run: `bun run test`
Expected: PASS. `pwa.spec.js` and `pwa-lifecycle.spec.js` matter here — the `APP_SHELL` and navigate-fallback edits are exactly what they cover.

- [ ] **Step 11: Commit**

```bash
git add share.html public/js/share.js public/css/app.css cloudfront/share-router-function.js cloudfront/README.md public/service-worker.js deploy.sh tests/share-viewer.spec.js
git commit -m "feat(share): add the read-only public viewer for shared notes

share.html fetches one encrypted share, decrypts it with the key from
the URL fragment, and renders it read-only. No editor, no IndexedDB, no
writes -- a test asserts the page opens no database connection.

This is the only surface that renders markdown from outside the user's
own browser, so it goes through Markdown.renderMarkdownInto and is
tested against hostile payloads directly. Marked noindex: a share link
is private by obscurity and must never be indexed.

A viewer-request CloudFront Function rewrites /s/<id> to /share.html;
the viewer also accepts ?id= so the page works under a plain static
server with no AWS.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Task 5: `shares` object store in `db.js`

**Files:**
- Modify: `public/js/db.js` — `DB_VERSION` 3 → 4, `shares` store, five new functions, and cleanup wiring in `deleteNoteEverywhere` and `clearAllStores`
- Create: `tests/share-store.spec.js`

**Interfaces:**
- Consumes: nothing.
- Produces, on `window.ScratchpadDB`:
  - `getSharesForNote(noteId) -> Promise<Share[]>`
  - `getAllShares() -> Promise<Share[]>`
  - `putShare(share) -> Promise<void>`
  - `removeShare(id) -> Promise<void>`
  - `pruneExpiredShares(now) -> Promise<Share[]>` (returns the rows it removed)
  - Share record: `{ id, noteId, key, revokeToken, sharedAt, expiresAt, titleAtShare }`

- [ ] **Step 1: Write the failing test**

Create `tests/share-store.spec.js` covering: a put/get roundtrip by `noteId`; two shares on one note both returned; `removeShare` removing only its own row; `pruneExpiredShares` removing rows with `expiresAt` in the past and returning them while leaving live rows alone; `deleteNoteEverywhere` also clearing that note's shares; `clearAllStores` emptying the shares store; and an upgrade case that seeds a v3 database, reopens at v4, and asserts existing notes survive.

Drive each through `page.evaluate(() => window.ScratchpadDB....)` after `gotoApp`, matching the style in `tests/storage-protection.spec.js`.

- [ ] **Step 2: Run and confirm it fails**

Run: `bun run test -- tests/share-store.spec.js`
Expected: FAIL — `ScratchpadDB.putShare is not a function`.

- [ ] **Step 3: Implement**

In `public/js/db.js`:

```js
  const DB_VERSION = 4;
  const STORES = {
    notes: 'notes',
    drafts: 'drafts',
    revisions: 'revisions',
    folders: 'folders',
    shares: 'shares',
  };
```

Inside `onupgradeneeded`, after the folders block — additive only, so a v3 database upgrades without touching existing data:

```js
        if (!db.objectStoreNames.contains(STORES.shares)) {
          const shares = db.createObjectStore(STORES.shares, { keyPath: 'id' });
          shares.createIndex('noteId', 'noteId');
          shares.createIndex('expiresAt', 'expiresAt');
        }
```

Add the five functions following the existing `reqToPromise`/`tx` idiom, then add `shares` to the store list and a `t.objectStore(STORES.shares)` cleanup in both `deleteNoteEverywhere` (delete via the `noteId` index, mirroring how revisions are handled there) and `clearAllStores`. Export all five from `window.ScratchpadDB`.

- [ ] **Step 4: Run the tests**

Run: `bun run test -- tests/share-store.spec.js tests/storage-protection.spec.js tests/data-erasure.spec.js tests/reliability.spec.js`
Expected: PASS. The erasure and reliability specs are the ones that would catch a broken `clearAllStores` transaction.

- [ ] **Step 5: Commit**

```bash
git add public/js/db.js tests/share-store.spec.js
git commit -m "feat(db): add the shares object store at DB_VERSION 4

Tracks live share links per note so the creator can redisplay a link
made days ago and revoke it. The decryption key is stored locally
because without it the link is unrecoverable -- shares are encrypted
against the server, not against this disk.

Deleting a note and erasing all data both clear the note's shares.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Task 6: Create a public link from the existing share dialog

`index.html:809` already has a "Share this note" dialog with on-device actions. The public link goes **into that dialog** as a clearly secondary action rather than into a new one — one share affordance, on-device options first.

Its body text at `index.html:815` currently reads *"Sharing happens on this device — Scratchpad doesn't send your note anywhere."* That sentence stops being true in this task and must change in the same commit that makes it false.

**Files:**
- Modify: `index.html:809-828` — add the public-link section, the first-run explainer, and a share glyph `<template>`
- Modify: `public/js/app.js` — `createPublicShare`, dialog state, element refs, listeners
- Modify: `public/css/app.css` — `.share-link-*` styles, tokens only
- Create: `tests/share-link.spec.js`

**Interfaces:**
- Consumes: `ScratchpadCrypto.generateShareKey/exportShareKey/encryptShare` (Task 1); `POST /api/share` (Task 3); `ScratchpadDB.putShare/getSharesForNote` (Task 5).
- Produces: `buildShareUrl(id, key) -> string` returning `location.origin + '/s/' + id + '#k=' + key`.

- [ ] **Step 1: Write the failing test**

Create `tests/share-link.spec.js`. Every case stubs the API with `page.route('**/api/share', ...)` — no network, no AWS. Cases:

1. The first time, the dialog shows the explainer and a "Create public link" button; the link area is empty.
2. Clicking through creates a link matching `/^https?:\/\/[^/]+\/s\/[A-Za-z0-9_-]{12}#k=[A-Za-z0-9_-]{43}$/`.
3. **The POST body contains no plaintext**: intercept the request, assert the body parses to exactly `{v,ciphertext,iv}`, that it contains neither the note title nor its body text, and that it has no `expiresAt`.
4. **The key never leaves the browser**: assert the exported key substring appears in no request URL and no request body.
5. The explainer appears once — after a first share, reopening the dialog does not show it again (persist a `scratchpad:shareExplainerSeenAt` flag in `localStorage`, matching the existing `LAST_BACKUP_KEY` convention).
6. A 500 response shows an inline error, leaves the note unmodified, and writes no row to the shares store.
7. An aborted request shows an offline-flavored error, not a silent failure.
8. Sharing twice produces two distinct links and both are listed.
9. The dialog is reachable and operable by keyboard, and the new controls are inside the existing focus trap.

- [ ] **Step 2: Run and confirm it fails**

Run: `bun run test -- tests/share-link.spec.js`
Expected: FAIL — the "Create public link" control does not exist.

- [ ] **Step 3: Extend the dialog markup**

Rewrite the `.dialog-body` of `#share-dialog`. The on-device actions stay first and keep their primary styling; the public link is visually and structurally secondary.

```html
    <div class="dialog-body">
      <p>Copying and emailing happen on this device — Scratchpad doesn't send your note anywhere.</p>
      <p id="share-mailto-warning" class="share-warning" hidden>
        This note is long. The email draft will be truncated; copy to clipboard to send the full note.
      </p>
      <div class="share-actions">
        <button id="share-copy" class="btn btn-primary" type="button">Copy to clipboard</button>
        <button id="share-email" class="btn btn-secondary" type="button">Open in email</button>
      </div>
      <p id="share-status" class="share-status" role="status" aria-live="polite" hidden></p>

      <hr class="menu-divider" />

      <section class="share-link-section" aria-labelledby="share-link-heading">
        <h3 id="share-link-heading" class="share-link-heading">Public link</h3>

        <div id="share-explainer" class="share-explainer" hidden>
          <p>A public link uploads an <strong>encrypted copy</strong> of this note's title, text, and tags.</p>
          <ul class="share-explainer-list">
            <li>The key that decrypts it stays in the link itself and is never sent to the server. Scratchpad cannot read a shared note.</li>
            <li><strong>Anyone with the link can read and forward it.</strong> There is no password.</li>
            <li>The link stops working after 7 days. You can stop sharing sooner.</li>
            <li>None of your other notes are uploaded, and the copy never changes if you edit this note later.</li>
          </ul>
        </div>

        <ul id="share-link-list" class="share-link-list"></ul>

        <button id="create-share-link" class="btn btn-secondary" type="button">Create public link</button>
        <p id="share-link-error" class="share-link-error" role="alert" hidden></p>
      </section>
    </div>
```

Add a share glyph template near `tpl-pin-icon`, for the note-list indicator in Task 7:

```html
  <template id="tpl-share-icon">
    <svg class="note-share-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>
    </svg>
  </template>
```

- [ ] **Step 4: Implement creation in `app.js`**

Add element refs alongside the existing `shareBtn`/`shareCopy` entries, then:

```js
  const SHARE_EXPLAINER_KEY = 'scratchpad:shareExplainerSeenAt';
  const SHARE_API = '/api/share';

  function buildShareUrl(id, key) {
    return location.origin + '/s/' + id + '#k=' + key;
  }

  // Only these four fields are uploaded. Everything else on a note -- id,
  // folderId, timestamps, daily-note and archive state -- stays local, because
  // the viewer does not need it and each omitted field is one less thing to leak.
  function buildSharePayload(note) {
    return {
      v: 1,
      title: note.title || '',
      body: note.body || '',
      tags: Array.isArray(note.tags) ? note.tags.slice() : [],
      updatedAt: note.updatedAt,
    };
  }

  async function createPublicShare() {
    const note = getNote(state.selectedId);
    if (!note || isTrashed(note)) return;

    els.shareLinkError.hidden = true;
    return withBusy('create-share', [els.createShareLink], '', async () => {
      const key = await ScratchpadCrypto.generateShareKey();
      const envelope = await ScratchpadCrypto.encryptShare(buildSharePayload(note), key);

      let response;
      try {
        response = await fetch(SHARE_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          body: JSON.stringify(envelope),
        });
      } catch {
        showShareLinkError('Could not reach the network. Your note was not uploaded.');
        return;
      }

      if (response.status === 413) {
        showShareLinkError('This note is too large to share as a link.');
        return;
      }
      if (!response.ok) {
        showShareLinkError('Sharing failed. Your note was not uploaded.');
        return;
      }

      const created = await response.json();
      await ScratchpadDB.putShare({
        id: created.id,
        noteId: note.id,
        key: await ScratchpadCrypto.exportShareKey(key),
        revokeToken: created.revokeToken,
        sharedAt: now(),
        expiresAt: created.expiresAt,
        titleAtShare: note.title || '',
      });

      localStorage.setItem(SHARE_EXPLAINER_KEY, String(now()));
      await refreshShareLinks(note.id);
      renderNotes();
    });
  }
```

`showShareLinkError(text)` sets `els.shareLinkError.textContent` and unhides it. `openShareDialog` additionally unhides `#share-explainer` when `localStorage.getItem(SHARE_EXPLAINER_KEY)` is absent, and calls `refreshShareLinks(note.id)` (implemented in Task 7). Wire `els.createShareLink.addEventListener('click', createPublicShare)` next to the existing share listeners at line ~5732.

- [ ] **Step 5: Run the tests**

Run: `bun run test -- tests/share-link.spec.js tests/share-export.spec.js`
Expected: PASS. `share-export.spec.js` guards the on-device actions that already lived in this dialog.

- [ ] **Step 6: Commit**

```bash
git add index.html public/js/app.js public/css/app.css tests/share-link.spec.js
git commit -m "feat(share): create expiring public links from the share dialog

Extends the existing on-device share dialog rather than adding a second
one: copy and email stay primary, the public link is explicitly
secondary and explained before first use.

Only the title, body, tags, and updatedAt are uploaded, encrypted, with
the key held back. A test asserts the POST body contains no plaintext
and that the key appears in no request.

The dialog's 'Scratchpad doesn't send your note anywhere' line is
rewritten in this commit, because this is the commit that makes it
false.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Task 7: List, copy, and revoke links; note-list indicator

**Files:**
- Modify: `public/js/app.js` — `refreshShareLinks`, `revokeShare`, `pruneShares` on boot, share glyph in the note row renderer, revoke hook on note delete
- Modify: `public/css/app.css`
- Create: `tests/share-revoke.spec.js`

**Interfaces:**
- Consumes: everything from Tasks 5 and 6, plus `DELETE /api/share/{id}` from Task 3.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Create `tests/share-revoke.spec.js`, stubbing both `POST` and `DELETE`. Cases: each live link renders with its expiry date and a Copy and a Stop-sharing button; Copy writes the full URL including the fragment to the stubbed clipboard; Stop sharing sends `DELETE /api/share/{id}` with the correct `x-revoke-token` header, removes the row, and removes the list entry; a failed revoke keeps the row and shows an error rather than lying about success; a note with a live share shows the glyph in the note list and loses it after revoking; expired rows are pruned on app start and never render; and deleting a note issues a revoke for its links but still deletes the note when that request fails.

- [ ] **Step 2: Run and confirm it fails**

Run: `bun run test -- tests/share-revoke.spec.js`
Expected: FAIL — no link list is rendered.

- [ ] **Step 3: Implement**

```js
  async function refreshShareLinks(noteId) {
    const shares = await ScratchpadDB.getSharesForNote(noteId);
    els.shareLinkList.replaceChildren();
    shares
      .filter((share) => share.expiresAt > now())
      .sort((a, b) => b.sharedAt - a.sharedAt)
      .forEach((share) => els.shareLinkList.appendChild(shareLinkRow(share)));
  }
```

`shareLinkRow(share)` builds the row with `document.createElement` and `textContent` only — never `innerHTML`, which the pre-commit hook would block anyway. It shows the URL in a readonly `<input>` (selectable, and it wraps better than text), an `Expires <date>` line, a Copy button, and a Stop sharing button.

```js
  async function revokeShare(share) {
    let response;
    try {
      response = await fetch(SHARE_API + '/' + encodeURIComponent(share.id), {
        method: 'DELETE',
        headers: { 'x-revoke-token': share.revokeToken },
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      showShareLinkError('Could not reach the network. This link is still live.');
      return false;
    }
    // 404 means it is already gone, which is the outcome we wanted.
    if (!response.ok && response.status !== 404) {
      showShareLinkError('Could not stop sharing. This link is still live.');
      return false;
    }
    await ScratchpadDB.removeShare(share.id);
    return true;
  }
```

On boot, next to the existing trash-retention sweep, add `await ScratchpadDB.pruneExpiredShares(now())` so dead rows never render.

In the note-row renderer, next to the pin icon, clone `#tpl-share-icon` when the note has a live share. Keep a `state.sharedNoteIds` Set refreshed alongside the notes load so the renderer stays synchronous.

In the note-delete path, before `deleteNoteEverywhere`, fetch that note's shares and call `revokeShare` for each, ignoring failures — the note deletion must not be blocked by a network problem, and the share expires on its own regardless.

- [ ] **Step 4: Run the tests**

Run: `bun run test -- tests/share-revoke.spec.js tests/share-link.spec.js tests/notes-crud.spec.js tests/data-erasure.spec.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `bun run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js public/css/app.css tests/share-revoke.spec.js
git commit -m "feat(share): list, copy, and revoke live share links

Every live link for a note is listed with its expiry, so 'share again'
minting a second link never becomes invisible. Revoking sends the
locally held token; a failed revoke says the link is still live rather
than claiming success.

Deleting a note revokes its links on a best-effort basis and deletes
the note regardless -- a network failure must not block a deletion, and
the share expires on its own.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Task 8: Privacy copy, terms, and tightened isolation tests

The feature is not shippable until the public claims match it. This task is the one that makes the product honest, and it is not optional cleanup.

**Files:**
- Modify: `privacy.html`, `terms.html`, `about.html`, `guide.html`, `index.html`, `share.html` (OG meta), `README.md`, `CLAUDE.md`
- Modify: `tests/network-isolation.spec.js`
- Modify: `tests/static-pages.spec.js` if it asserts on copy

- [ ] **Step 1: Tighten the isolation tests first**

`tests/network-isolation.spec.js` currently asserts only that requests are same-origin, while its docstring claims zero network calls. Close that gap in the direction of a stronger guarantee:

1. Rewrite the existing two cases to assert **zero** requests after load during normal note use, not merely same-origin ones. Ignore the document, its subresources, and the service worker by recording only requests initiated after `gotoApp` settles.
2. Add: creating a public link issues **exactly one** request, to `/api/share`, same-origin, method POST.
3. Add: the share dialog's on-device actions (copy, email) issue **zero** requests.
4. Add: no request body or URL anywhere in the session contains the note's plaintext body text.

Run: `bun run test -- tests/network-isolation.spec.js`
Expected: the new cases pass against the code from Tasks 6 and 7; if case 1 fails, an unexpected request exists and must be explained before proceeding.

- [ ] **Step 2: Rewrite the privacy claims**

Grep for every absolute claim and fix each:

```bash
grep -rn "never leave\|no servers\|no backend\|local-only\|doesn't send" --include="*.html" --include="*.md" . | grep -v node_modules | grep -v docs/
```

Known sites: `README.md:3-5`; `privacy.html:7,20,58,65,152`; `about.html:7,15,21,24,63,385`; `terms.html:7,14,20,56,58`; `guide.html:7,20,58`; `index.html:7,14,21,23,26`.

The framing is **"Local-only by default. One exception, and you trigger it."** Do not delete the privacy story — make it precise. "Your notes never leave this browser" becomes "Your notes stay in this browser unless you create a share link — and a shared note is encrypted before it leaves, with the key held back."

`privacy.html` gains a Sharing section stating: exactly what is uploaded (ciphertext, an IV, an expiry timestamp, and a hash of the revocation token); exactly what is not (the decryption key, any other note, any identifier, any device fingerprint); that the operator cannot read a shared note; the 7-day retention and automatic deletion; and that anyone holding the link can read and forward it.

- [ ] **Step 3: Add acceptable-use terms**

`terms.html` gains a section covering: the user is responsible for what they publish through a share link; content that is illegal or infringing is not permitted; the operator may remove any shared object at any time; shares are deleted automatically after 7 days; and the service is provided as-is with no availability guarantee. Keep the existing plain-language voice — no legalese drift.

- [ ] **Step 4: Document the feature**

`guide.html` gains a Sharing section: how to create a link, that it expires in 7 days, that the shared copy is a frozen snapshot, how to stop sharing, and the plain warning that anyone with the link can read it.

`CLAUDE.md` gains: `share-infra/` in the do-not-deploy list and the structure tree; `share.html` in the deployed-HTML list; a note that `share.html` reuses the byte-identical inline theme scripts so all six pages share one CSP hash set; and an amendment to the "Privacy posture" hard rules recording that `/api/share` is the single sanctioned network call and that note content is encrypted client-side before any upload.

- [ ] **Step 5: Verify**

```bash
bun run test
./deploy.sh --dry-run
grep -rn "never leaves your browser" --include="*.html" . | grep -v node_modules
```

Expected: suite green; dry-run lists six HTML shells and no operator files; the grep returns only strings that are still true in context.

- [ ] **Step 6: Bump the version**

Edit `public/js/version.js`: set `SCRATCHPAD_VERSION` to `3.7.0` (a feature, not a patch) and `SCRATCHPAD_BUILD_DATE` to the release date.

- [ ] **Step 7: Commit**

```bash
git add privacy.html terms.html about.html guide.html index.html share.html README.md CLAUDE.md public/js/version.js tests/network-isolation.spec.js
git commit -m "docs(privacy): make the privacy claims true now that sharing exists

Sharing is the first feature to send note content off the device, so
every absolute claim across the five shells becomes precise: local-only
by default, one exception, and the user triggers it. privacy.html now
names exactly what a share uploads and what it withholds.

terms.html gains acceptable-use language and a stated right to remove
content, because the domain now hosts user-submitted content.

network-isolation.spec.js is tightened rather than relaxed: it asserted
same-origin while claiming zero calls, and now asserts zero calls in
normal use plus exactly one POST when a link is created.

Claude-Session: https://claude.ai/code/session_01ETxugvi9QaRhNMtkb7LUrZ"
```

---

## Self-review

**Spec coverage.** Every spec section maps to a task: threat model → Tasks 2, 3, 6 tests; architecture → Task 3; Lambda contract → Tasks 2, 3; crypto → Task 1; snapshot semantics → Task 6 (`buildSharePayload` is called once at creation, and no update route exists); local state → Task 5; viewer → Task 4; routing → Task 4; service worker → Tasks 1, 4; infrastructure → Task 3; abuse posture → Tasks 2, 3; copy → Task 8; verification → distributed; phasing → task order.

**Interface consistency.** `encryptShare`/`decryptShare` return and accept `{v, ciphertext, iv}` in Tasks 1, 4, and 6. `parseShareBody` returns `{ok, value}` or `{ok, status, error}` in Tasks 2 and 3. The share record has identical fields in Tasks 5, 6, and 7. `buildShareUrl` (Task 6) produces the shape `readShareId`/`readShareKey` (Task 4) parse. Share IDs are 12 base64url chars in the Lambda regex, the client regex, the CloudFront Function regex, and the service-worker regex.

**Known deviation from the spec.** The spec implies a new share dialog; the repo already has one at `index.html:809` whose body text asserts nothing is sent anywhere. Task 6 extends that dialog instead of adding a second, and rewrites that sentence in the same commit that makes it false. This is a better outcome than the spec described and the spec has been amended to match.
