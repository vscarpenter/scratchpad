// Operator-only hourly cleanup. It never accepts public requests. Its separate
// role can list the shares prefix; the public API role cannot.
import { shareStore } from './s3-store.mjs';

async function cleanOne(api, id) {
  const record = await api.store.read(id, { allowMissing403: false });
  if (!record) return false;
  if (!Number.isFinite(record.value.expiresAt)) throw new Error('Invalid expiry');
  if (api.now() < record.value.expiresAt) return false;
  if (!record.etag) throw new Error('Missing storage precondition');
  try {
    await api.store.remove(id, record.etag);
    return true;
  } catch (error) {
    if (
      ['PreconditionFailed', 'NoSuchKey'].includes(error.name) ||
      [404, 412].includes(error.$metadata?.httpStatusCode)
    )
      return false;
    throw error;
  }
}

export async function cleanupShares(api) {
  let examined = 0;
  let deleted = 0;
  let failed = 0;
  for await (const id of api.store.list()) {
    if (api.remaining && api.remaining() < 10000) throw new Error('Cleanup deadline');
    examined += 1;
    try {
      if (await cleanOne(api, id)) deleted += 1;
    } catch {
      failed += 1;
    }
  }
  if (failed) throw new Error(failed + ' cleanup failure(s)');
  return { examined, deleted };
}

export async function handler(_event, context) {
  return cleanupShares({ store: shareStore, now: Date.now, remaining: () => context.getRemainingTimeInMillis() });
}
