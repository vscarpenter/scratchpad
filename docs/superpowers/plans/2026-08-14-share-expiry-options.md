# Share Expiry Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the sender choose 7, 14, 21, or 30 days of life for a public share link at creation time, defaulting to 7.

**Architecture:** The client posts a duration enum (`expiresDays`) beside the encrypted envelope; the server validates it against a fixed menu, computes `expiresAt` itself, and tags the S3 object `ttl-days=<N>` so tag-filtered lifecycle rules delete it on schedule. A prefix-wide 30-day backstop rule guarantees the retention cap even if tagging breaks. Everything downstream of creation already consumes the server-returned `expiresAt` and is untouched.

**Tech Stack:** Vanilla browser JS (no build step, IIFE globals), Node 20 ESM Lambda, `node --test` for Lambda tests, Playwright for browser tests, AWS CLI via `share-infra/provision.sh` for infra.

**Spec:** `docs/superpowers/specs/2026-08-14-share-expiry-options-design.md`

## Global Constraints

- **The server owns expiry.** The client sends a duration from the menu `[7, 14, 21, 30]`, never a timestamp. A client-supplied `expiresAt` keeps being dropped, never clamped.
- **Invalid `expiresDays` is HTTP 400**, never clamped or coerced. Absent `expiresDays` defaults to 7 (old-client compatibility).
- **All CSS colors via `var(--token)`** — no hex in `public/css/app.css`; one accent; `--border-hair` outer borders; platform fonts; no emoji in source.
- **No inline `<script>` changes anywhere.** `bash cloudfront/recompute-csp-hashes.sh` must report all hashes unchanged.
- **Never set `innerHTML`**; the pre-commit hook enforces it. Never `git commit --no-verify`.
- **No AWS mutation without explicit user confirmation in the turn.** This plan only edits the infra *artifacts*; applying them is a gated operator step listed at the end.
- Run Lambda tests with `bun run test:lambda`; browser tests with `bunx playwright test tests/<file>`.
- Envelope version stays `1`. Stored object shape stays `{ v, ciphertext, iv, expiresAt, revokeHash }`.

---

### Task 1: TTL menu in `validate.mjs` (TDD)

**Files:**
- Modify: `share-infra/lambda/validate.mjs`
- Test: `share-infra/lambda/validate.test.mjs`

**Interfaces:**
- Produces: `SHARE_TTL_DAYS` (frozen `[7, 14, 21, 30]`), `DEFAULT_TTL_DAYS` (`7`), and `parseShareBody(rawBody)` returning `{ ok: true, value: { v, ciphertext, iv }, ttlDays }` on success. `SHARE_TTL_MS` is removed.

- [ ] **Step 1: Write the failing tests.** In `validate.test.mjs`, update the import to pull `SHARE_TTL_DAYS` and `DEFAULT_TTL_DAYS` instead of `SHARE_TTL_MS`, replace the `'the TTL is exactly seven days'` test, and add the new cases (fixtures `ciphertext`/`iv` already exist at the top of the file):

```js
test('the TTL menu is exactly 7, 14, 21, 30 days with a 7-day default', () => {
  assert.deepEqual([...SHARE_TTL_DAYS], [7, 14, 21, 30]);
  assert.equal(DEFAULT_TTL_DAYS, 7);
});

test('defaults to seven days when expiresDays is absent', () => {
  const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv }));
  assert.equal(result.ok, true);
  assert.equal(result.ttlDays, 7);
});

test('accepts each duration on the menu', () => {
  for (const days of [7, 14, 21, 30]) {
    const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: days }));
    assert.equal(result.ok, true, `rejected ${days}`);
    assert.equal(result.ttlDays, days);
  }
});

test('rejects durations off the menu with a 400', () => {
  for (const days of [0, 1, 8, -7, 31, 365, 6.9]) {
    const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: days }));
    assert.equal(result.ok, false, `accepted ${days}`);
    assert.equal(result.status, 400);
  }
});

test('rejects non-numeric expiresDays with a 400', () => {
  for (const bad of ['14', null, true, [7], { days: 7 }]) {
    const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: bad }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  }
});

test('expiresDays is consumed by validation, never persisted', () => {
  const result = parseShareBody(JSON.stringify({ v: 1, ciphertext, iv, expiresDays: 14 }));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ['ciphertext', 'iv', 'v']);
});
```

- [ ] **Step 2: Run to verify failure.** `bun run test:lambda` — expected: the new tests fail (`SHARE_TTL_DAYS` undefined / `ttlDays` undefined); the import of the removed `SHARE_TTL_MS` may fail the whole file first, which is the same red.

- [ ] **Step 3: Implement.** In `validate.mjs`, replace `export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;` with:

```js
export const SHARE_TTL_DAYS = Object.freeze([7, 14, 21, 30]);
export const DEFAULT_TTL_DAYS = 7;
```

In `parseShareBody`, after the iv check and before the return, add:

```js
  // The menu is closed: an off-menu value is a broken or hostile client, so it
  // is refused rather than clamped. Absent means a pre-menu client; it gets
  // the same seven days it was written against.
  let ttlDays = DEFAULT_TTL_DAYS;
  if ('expiresDays' in parsed) {
    if (!Number.isInteger(parsed.expiresDays) || !SHARE_TTL_DAYS.includes(parsed.expiresDays)) {
      return fail(400, 'Invalid expiresDays');
    }
    ttlDays = parsed.expiresDays;
  }
```

and return `{ ok: true, value: { … }, ttlDays }`.

- [ ] **Step 4: Run to verify pass.** `bun run test:lambda` — expected: all pass (handler.mjs still imports `SHARE_TTL_MS`; if that import breaks the run, do Task 2 Step 1 first — the two land in one commit).

### Task 2: Handler computes expiry from the menu and tags the object

**Files:**
- Modify: `share-infra/lambda/handler.mjs`

**Interfaces:**
- Consumes: `parseShareBody(...).ttlDays` from Task 1.
- Produces: unchanged create response `{ id, revokeToken, expiresAt }`; S3 object now carries tag `ttl-days=<N>`.

- [ ] **Step 1: Implement.** Change the import to `import { parseShareBody, isValidShareId } from './validate.mjs';`. In `create()`, replace `const expiresAt = Date.now() + SHARE_TTL_MS;` with `const expiresAt = Date.now() + parsed.ttlDays * 24 * 60 * 60 * 1000;` and add to the `PutObjectCommand` input:

```js
    // The tag routes the object to its matching lifecycle rule; untagged
    // objects fall to the 30-day backstop. See share-infra/lifecycle.json.
    Tagging: 'ttl-days=' + parsed.ttlDays,
```

- [ ] **Step 2: Run tests.** `bun run test:lambda` — expected: all pass (`handler.test.mjs` needs no changes; `create()` was never unit-tested because it needs S3, and its validation path is covered via Task 1).

- [ ] **Step 3: Commit** (with Task 1 and Task 3, one logical unit: the API + infra contract).

### Task 3: Infra artifacts — lifecycle rules, IAM, operator README

**Files:**
- Modify: `share-infra/lifecycle.json`, `share-infra/iam-policy.json`, `share-infra/README.md`

- [ ] **Step 1: Replace `lifecycle.json`** with:

```json
{
  "Rules": [
    {
      "ID": "expire-shares-ttl-7",
      "Status": "Enabled",
      "Filter": { "And": { "Prefix": "shares/", "Tags": [{ "Key": "ttl-days", "Value": "7" }] } },
      "Expiration": { "Days": 7 }
    },
    {
      "ID": "expire-shares-ttl-14",
      "Status": "Enabled",
      "Filter": { "And": { "Prefix": "shares/", "Tags": [{ "Key": "ttl-days", "Value": "14" }] } },
      "Expiration": { "Days": 14 }
    },
    {
      "ID": "expire-shares-ttl-21",
      "Status": "Enabled",
      "Filter": { "And": { "Prefix": "shares/", "Tags": [{ "Key": "ttl-days", "Value": "21" }] } },
      "Expiration": { "Days": 21 }
    },
    {
      "ID": "expire-shares-ttl-30",
      "Status": "Enabled",
      "Filter": { "And": { "Prefix": "shares/", "Tags": [{ "Key": "ttl-days", "Value": "30" }] } },
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "expire-shares-backstop-30-days",
      "Status": "Enabled",
      "Filter": { "Prefix": "shares/" },
      "Expiration": { "Days": 30 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

(Earliest-expiration-wins makes the backstop safe for tagged objects; `AbortIncompleteMultipartUpload` is not allowed in tag-filtered rules, so it rides the prefix-only backstop.)

- [ ] **Step 2: Add `s3:PutObjectTagging`** to the action list in `iam-policy.json` (supplying tags at PUT time requires it): `"Action": ["s3:PutObject", "s3:PutObjectTagging", "s3:GetObject", "s3:DeleteObject"]`.

- [ ] **Step 3: Update `share-infra/README.md`:** the resource-table lifecycle row, the takedown section's "waiting for its seven days", the guarantees-table "Object expiry | 7 days" row, and add a one-time migration note: after applying the new lifecycle, tag pre-existing objects so they keep their 7-day deletion —

```sh
aws s3api list-objects-v2 --bucket scratchpad-shares --prefix shares/ \
  --query 'Contents[].Key' --output text | tr '\t' '\n' | while read -r key; do
  aws s3api put-object-tagging --bucket scratchpad-shares --key "$key" \
    --tagging 'TagSet=[{Key=ttl-days,Value=7}]'
done
```

- [ ] **Step 4: Commit** Tasks 1–3: `feat(share-api): let senders choose 7, 14, 21, or 30-day link expiry`.

### Task 4: Share dialog expiry picker (UI + client POST)

**Files:**
- Modify: `index.html` (share dialog section), `public/css/app.css`, `public/js/app.js`
- Test: `tests/share-link.spec.js`

**Interfaces:**
- Consumes: the API contract from Task 1 (`expiresDays` in the POST body).
- Produces: `#share-expiry-days` select, reset to `'7'` on every dialog open.

- [ ] **Step 1: Write the failing tests.** In `tests/share-link.spec.js`: in the `'uploads only the encrypted envelope, never the plaintext'` test change the body-keys assertion to `['ciphertext', 'expiresDays', 'iv', 'v']` and add `expect(body.expiresDays).toBe(7);`. Then add (using the file's existing `stubCreate`/`seedOneNote`/dialog-open helpers):

```js
  test('posts the selected expiry duration', async ({ page }) => {
    const seen = await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#share-expiry-days').selectOption('30');
    await page.locator('#create-share-link').click();
    await expect(page.locator('.share-link-url').first()).toBeVisible();
    expect(JSON.parse(seen[0].body).expiresDays).toBe(30);
  });

  test('the expiry select resets to 7 days each time the dialog opens', async ({ page }) => {
    await stubCreate(page);
    await seedOneNote(page);
    await openShareDialog(page);
    await page.locator('#share-expiry-days').selectOption('21');
    await page.keyboard.press('Escape');
    await openShareDialog(page);
    await expect(page.locator('#share-expiry-days')).toHaveValue('7');
  });
```

- [ ] **Step 2: Run to verify failure.** `bunx playwright test tests/share-link.spec.js` — expected: FAIL (`#share-expiry-days` not found; body keys mismatch).

- [ ] **Step 3: Markup.** In `index.html`, between `<ul id="share-link-list" …></ul>` and the create button:

```html
        <div class="share-expiry-picker">
          <label for="share-expiry-days">New link expires after</label>
          <select id="share-expiry-days" class="share-expiry-select">
            <option value="7" selected>7 days</option>
            <option value="14">14 days</option>
            <option value="21">21 days</option>
            <option value="30">30 days</option>
          </select>
        </div>
```

- [ ] **Step 4: Styles.** In `public/css/app.css`, in the share-links section (before the `#create-share-link` rule):

```css
.share-expiry-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.share-expiry-picker label {
  font: 500 12px/1 var(--sans);
  color: var(--text-secondary);
}

.share-expiry-select {
  font: 500 12px/1.2 var(--sans);
  color: var(--text-body);
  background: var(--control-fill);
  border: var(--border-hair);
  border-radius: var(--r-sm);
  padding: 6px 8px;
}
.share-expiry-select:hover { background: var(--control-fill-hover); }
.share-expiry-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

- [ ] **Step 5: Client logic.** In `public/js/app.js`: add `shareExpiryDays: $('share-expiry-days'),` to the `els` map; add `const SHARE_EXPIRY_OPTIONS = [7, 14, 21, 30];` beside `SHARE_API`; in `openShareDialog()` add `els.shareExpiryDays.value = '7';`; in `createPublicShare()` read the select and post an explicit body (no spread, keeps the wire shape obvious):

```js
      const chosen = Number(els.shareExpiryDays.value);
      // A tampered DOM can only shorten the sender's own link back to the default.
      const expiresDays = SHARE_EXPIRY_OPTIONS.includes(chosen) ? chosen : 7;
      …
          body: JSON.stringify({ v: envelope.v, ciphertext: envelope.ciphertext, iv: envelope.iv, expiresDays }),
```

Also update the stale comment above `revokeSharesForNote` ("within seven days" → "at its chosen duration, 30 days at most") and the dialog explainer bullet in `index.html` ("after 7 days" → "after the time you pick — 7 to 30 days").

- [ ] **Step 6: Run to verify pass.** `bunx playwright test tests/share-link.spec.js` — expected: PASS, whole file.

- [ ] **Step 7: Commit:** `feat(share-ui): expiry picker in the share dialog`.

### Task 5: Copy sweep

**Files:**
- Modify: `guide.html`, `terms.html`, `privacy.html`, `share.html`, `README.md`, `PRODUCT.md`, `public/js/share.js` (comment only)

- [ ] **Step 1: Apply the exact edits:**
- `guide.html` ~374: `<strong>Links expire after 7 days</strong>, automatically. The dialog shows the date.` → `<strong>Links expire automatically</strong> — you pick 7, 14, 21, or 30 days when you create one. The dialog shows the date.`
- `guide.html` ~391: `you'd have to wait out the seven days.` → `you'd have to wait out the expiry you chose.`
- `terms.html` ~75: `stores encrypted shared notes for seven days.` → `stores encrypted shared notes for up to 30 days.`
- `terms.html` ~109: `The copy is deleted automatically seven days after you create it, and you can stop sharing sooner.` → `The copy is deleted automatically at the expiry you choose when creating the link — 7, 14, 21, or 30 days — and you can stop sharing sooner.`
- `privacy.html` ~159: `An expiry timestamp, set by the server to seven days from creation.` → `An expiry timestamp, set by the server to the duration you chose — 7, 14, 21, or 30 days from creation.`
- `privacy.html` ~174: `Every share is deleted automatically seven days after it is created, and you can stop sharing sooner from the same dialog.` → `Every share is deleted automatically when it expires — at most 30 days after it is created — and you can stop sharing sooner from the same dialog.`
- `share.html` ~62: `Shared notes stop working seven days after they are created. Ask whoever sent it for a fresh link.` → `Shared notes stop working when they expire. Ask whoever sent it for a fresh link.`
- `README.md` ~10: `Share links stop working after seven days and can be revoked sooner.` → `Share links stop working after the duration the sender picks — 7 to 30 days — and can be revoked sooner.`
- `PRODUCT.md` ~72: `links expire after seven days` → `links expire after a sender-chosen 7, 14, 21, or 30 days`
- `PRODUCT.md` ~175: `a lifecycle rule that expires shares after seven days.` → `tag-routed lifecycle rules that expire shares at their chosen duration, capped at 30 days.`
- `public/js/share.js` ~132 comment: `must not outlive the seven days promised on the page.` → `must not outlive the expiry promised on the page.`

- [ ] **Step 2: Commit:** `docs(share): expiry copy reflects the 7–30 day menu`.

### Task 6: Verification

- [ ] **Step 1:** `bun run test:lambda` — all pass.
- [ ] **Step 2:** `bunx playwright test tests/share-link.spec.js tests/network-isolation.spec.js tests/share-viewer.spec.js tests/share-store.spec.js tests/static-pages.spec.js tests/guide.spec.js` — all pass.
- [ ] **Step 3:** `bash cloudfront/recompute-csp-hashes.sh` — every hash unchanged (no inline script was touched).
- [ ] **Step 4:** Report done; list the gated operator steps (re-run `provision.sh`, one-time tag migration, `deploy.sh` with a version bump) awaiting explicit confirmation.

## Operator rollout (gated — requires explicit user confirmation)

1. `bash share-infra/provision.sh` — applies the updated IAM policy (`put-role-policy` overwrites), the new lifecycle configuration (atomic replace), and redeploys the Lambda. Infra must land **before** the site so a new client never talks to the old Lambda.
2. One-time migration: tag existing `shares/*` objects `ttl-days=7` (snippet in `share-infra/README.md`).
3. Version bump (`public/js/version.js`) + `./deploy.sh`.
