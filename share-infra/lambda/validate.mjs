// Pure request validation for the share API. No AWS imports, no I/O -- this
// module is the boundary between a public write endpoint and the bucket, so it
// is unit-testable in isolation and every rejection happens before any S3 call.

export const MAX_BODY_BYTES = 262144; // 256 KB
export const SHARE_TTL_DAYS = Object.freeze([7, 14, 21, 30]);
export const DEFAULT_TTL_DAYS = 7;
export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
export const SHARE_ENVELOPE_VERSION = 1;

const IV_BYTES = 12;

function fail(status, error) {
  return { ok: false, status, error };
}

// Anchored and linear: one start position, and '=' is outside the class, so
// the engine cannot backtrack quadratically the way an unanchored /=+$/ strip
// does against a long padding run (the classic trim-ReDoS probe).
const BASE64_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/;

// Canonical base64 carries at most two padding characters, and BASE64_SHAPE
// has already enforced that, so this loop runs at most twice.
function stripPadding(value) {
  let out = value;
  while (out.endsWith('=')) out = out.slice(0, -1);
  return out;
}

// Buffer.from(..., 'base64') is lenient: it silently drops characters outside
// the alphabet rather than throwing. Round-tripping is the only way to know the
// input really was base64 and not something that merely survived the filter.
// The shape test runs first so the round-trip only ever sees bounded padding.
function decodeBase64(value) {
  if (!BASE64_SHAPE.test(value)) return null;
  const buf = Buffer.from(value, 'base64');
  const normalized = stripPadding(buf.toString('base64'));
  return normalized === stripPadding(value) ? buf : null;
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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'Malformed body');
  if (parsed.v !== SHARE_ENVELOPE_VERSION) return fail(400, 'Unsupported envelope version');
  if (typeof parsed.ciphertext !== 'string' || parsed.ciphertext.length === 0) return fail(400, 'Missing ciphertext');
  if (typeof parsed.iv !== 'string' || parsed.iv.length === 0) return fail(400, 'Missing iv');

  const ciphertext = decodeBase64(parsed.ciphertext);
  if (!ciphertext || ciphertext.length === 0) return fail(400, 'Invalid ciphertext encoding');

  const iv = decodeBase64(parsed.iv);
  if (!iv || iv.length !== IV_BYTES) return fail(400, 'Invalid iv');

  // The menu is closed: an off-menu value is a broken or hostile client, so it
  // is refused rather than clamped. Absent means a pre-menu client; it gets the
  // same seven days it was written against.
  let ttlDays = DEFAULT_TTL_DAYS;
  if ('expiresDays' in parsed) {
    if (!Number.isInteger(parsed.expiresDays) || !SHARE_TTL_DAYS.includes(parsed.expiresDays)) {
      return fail(400, 'Invalid expiresDays');
    }
    ttlDays = parsed.expiresDays;
  }

  // Only these three fields are ever persisted. Anything else the client sent --
  // an expiresAt, a revokeHash, a stray plaintext field -- is dropped here. The
  // server owns expiry and owns the revoke hash; expiresDays is a duration
  // request the server turns into a timestamp, never stored as sent.
  return {
    ok: true,
    value: { v: SHARE_ENVELOPE_VERSION, ciphertext: parsed.ciphertext, iv: parsed.iv },
    ttlDays,
  };
}
