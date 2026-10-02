// @ts-check
// Explicit encrypted publishing only. No startup probes, polling, or autosave.
{
  /** @typedef {import('../../types/sharing').Share} Share */
  /** @typedef {import('../../types/sharing').ShareNote} ShareNote */
  /** @typedef {import('../../types/sharing').SharePayload} SharePayload */
  /** @typedef {import('../../types/sharing').PendingUpdate} PendingUpdate */
  /** @typedef {import('../../types/sharing').ShareManager} Manager */
  /** @type {Parameters<Manager['init']>[0]} */
  let api;
  const API = '/api/share';
  const TTL_DAYS = [7, 14, 21, 30];
  const active = new Set();

  /** @param {ShareNote} note @returns {SharePayload} */
  function payload(note) {
    return {
      v: 1,
      title: note.title || '',
      body: note.body || '',
      tags: Array.isArray(note.tags) ? note.tags.slice() : [],
      updatedAt: note.updatedAt,
    };
  }

  /** The plaintext fingerprint stays local. @param {Pick<SharePayload, 'title' | 'body' | 'tags'>} note */
  async function fingerprint(note) {
    const canonical = JSON.stringify([note.title || '', note.body || '', note.tags || []]);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /** @param {Share} share */
  function url(share) {
    return location.origin + '/s/' + share.id + '#k=' + share.key;
  }

  /** @param {string} id @param {() => Promise<any>} task */
  async function locked(id, task) {
    if (navigator.locks) return navigator.locks.request('scratchpad:share:' + id, task);
    if (active.has(id)) throw new Error('This link is already being managed. Try again shortly.');
    active.add(id);
    try {
      return await task();
    } finally {
      active.delete(id);
    }
  }

  /** @param {string} path @param {RequestInit} [options] */
  function request(path, options = {}) {
    return fetch(API + path, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000),
    });
  }

  /** @param {ShareNote} note @param {number} expiresDays @returns {Promise<Share>} */
  async function create(note, expiresDays) {
    const content = payload(note);
    const contentHash = await fingerprint(content);
    const key = await api.crypto.generateShareKey();
    const envelope = await api.crypto.encryptShare(content, key);
    let response;
    try {
      response = await request('', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...envelope, expiresDays: TTL_DAYS.includes(expiresDays) ? expiresDays : 7 }),
      });
    } catch {
      throw new Error('Could not reach the network. Your note was not uploaded.');
    }
    if (response.status === 413) throw new Error('This note is too large to share as a link.');
    if (!response.ok) throw new Error('Sharing failed. Your note was not uploaded.');
    const created = await response.json();
    const share = {
      id: created.id,
      noteId: note.id,
      key: await api.crypto.exportShareKey(key),
      revokeToken: created.revokeToken,
      sharedAt: Date.now(),
      expiresAt: created.expiresAt,
      titleAtShare: content.title,
      revision: created.revision || 1,
      publishedAt: created.publishedAt,
      publishedContentHash: contentHash,
    };
    await api.db.putShare(share);
    return share;
  }

  /** @param {Share} share @param {SharePayload} content @returns {Promise<PendingUpdate>} */
  async function prepare(share, content) {
    if (share.pendingUpdate) return share.pendingUpdate;
    const fingerprintValue = await fingerprint(content);
    const key = await api.crypto.importShareKey(share.key);
    const envelope = await api.crypto.encryptShare(content, key);
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const operationId = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const pending = {
      ...envelope,
      expectedRevision: share.revision || 1,
      operationId,
      fingerprint: fingerprintValue,
      titleAtShare: content.title,
    };
    if (!(await api.db.patchShare(share.id, { pendingUpdate: pending, publicationState: 'unconfirmed' })))
      throw new Error('The local record for this link was removed.');
    return pending;
  }

  /** @param {Share} share @param {Response} response @param {PendingUpdate} pending */
  async function rejectUpdate(share, response, pending) {
    if (response.status === 409) {
      await api.db.patchShare(share.id, { publicationState: 'conflict' }, pending.operationId);
      throw new Error('This link changed in another tab. Review the shared version before publishing again.');
    }
    if (response.status < 500) await api.db.patchShare(share.id, { pendingUpdate: null }, pending.operationId);
    const messages = new Map([
      [403, 'This browser no longer has permission to update this link.'],
      [404, 'This link was stopped or removed. Create a new public link.'],
      [410, 'This link has expired. Create a new public link.'],
      [413, 'This note is too large to update as a link.'],
      [503, 'Shared-link updates are not available yet. Try again later.'],
    ]);
    throw new Error(
      messages.get(response.status) || 'The update was not confirmed. Retry to check the same publication.',
    );
  }

  /** @param {Share} share @param {PendingUpdate} pending @param {Response} response */
  async function acknowledge(share, pending, response) {
    const result = await response.json();
    if (
      result.revision !== pending.expectedRevision + 1 ||
      !Number.isFinite(result.publishedAt) ||
      result.expiresAt !== share.expiresAt
    )
      throw new Error('The update was not confirmed. Retry to check the same publication.');
    const changed = await api.db.patchShare(
      share.id,
      {
        revision: result.revision,
        publishedAt: result.publishedAt,
        titleAtShare: pending.titleAtShare,
        publishedContentHash: pending.fingerprint,
        pendingUpdate: null,
        publicationState: null,
      },
      pending.operationId,
    );
    if (!changed) throw new Error('The shared copy may have changed, but its local record was removed.');
  }

  /** @param {Share} share @param {SharePayload} content */
  async function publishLocked(share, content) {
    const current = await api.db.getShare(share.id);
    if (!current) throw new Error('The local record for this link was removed.');
    if (current.pendingUpdate?.operationId !== share.pendingUpdate?.operationId)
      throw new Error('An update from another tab is unconfirmed. Reopen Share and explicitly retry it.');
    if (!current.pendingUpdate && (current.revision || 1) !== (share.revision || 1)) {
      await api.db.patchShare(share.id, { publicationState: 'conflict' });
      throw new Error('This link changed in another tab. Review the shared version before publishing again.');
    }
    if (current.publicationState === 'conflict') throw new Error('Review the shared version before publishing again.');
    const pending = await prepare(current, content);
    const { fingerprint: _fingerprint, titleAtShare: _title, ...body } = pending;
    let response;
    try {
      response = await request('/' + encodeURIComponent(current.id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-share-owner-token': current.revokeToken },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('The update was not confirmed. Retry to check the same publication.');
    }
    if (!response.ok) return rejectUpdate(current, response, pending);
    try {
      await acknowledge(current, pending, response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('local record')) throw error;
      throw new Error('The shared copy may have changed, but confirmation could not be saved. Retry the update.');
    }
  }

  /** @param {ShareNote} note @param {Share} share */
  async function publish(note, share) {
    const content = payload(note);
    return locked(share.id, () => publishLocked(share, content));
  }

  /** @param {Share} share @param {any} envelope */
  function validateReview(share, envelope) {
    if (!Number.isFinite(envelope.expiresAt) || envelope.expiresAt <= Date.now())
      throw new Error('This link has expired.');
    const revision = envelope.revision === undefined ? 1 : envelope.revision;
    if (
      envelope.expiresAt !== share.expiresAt ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      (envelope.publishedAt !== undefined && !Number.isFinite(envelope.publishedAt))
    )
      throw new Error('Could not confirm the shared version. Its publication metadata is invalid.');
  }

  /** Explicit reconciliation only, never invoked automatically. @param {Share} share */
  async function review(share) {
    return locked(share.id, async () => {
      const response = await request('/' + encodeURIComponent(share.id));
      if (!response.ok) throw new Error('Could not load the shared version. It may have expired or been stopped.');
      const envelope = await response.json();
      validateReview(share, envelope);
      const key = await api.crypto.importShareKey(share.key);
      const content = await api.crypto.decryptShare(envelope, key);
      if (
        typeof content.title !== 'string' ||
        typeof content.body !== 'string' ||
        !Array.isArray(content.tags) ||
        content.tags.some((tag) => typeof tag !== 'string')
      )
        throw new Error('Could not read the shared version safely.');
      if (
        !(await api.db.patchShare(share.id, {
          revision: envelope.revision || 1,
          publishedAt: envelope.publishedAt,
          publishedContentHash: await fingerprint(content),
          pendingUpdate: null,
          publicationState: null,
        }))
      )
        throw new Error('The local record for this link was removed.');
      return content;
    });
  }

  /** @param {Share} share */
  async function revoke(share) {
    return locked(share.id, async () => {
      try {
        const response = await request('/' + encodeURIComponent(share.id), {
          method: 'DELETE',
          headers: { 'x-revoke-token': share.revokeToken },
        });
        return response.ok || response.status === 404;
      } catch {
        return false;
      }
    });
  }

  /** @param {Parameters<Manager['init']>[0]} dependencies */
  function init(dependencies) {
    api = dependencies;
  }
  /** @type {Window & { ScratchpadShareManager?: Manager }} */
  const root = window;
  root.ScratchpadShareManager = Object.freeze({ init, payload, fingerprint, url, create, publish, review, revoke });
}
