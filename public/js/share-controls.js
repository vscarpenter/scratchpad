// @ts-check
// Per-link actions reuse the existing Share dialog and its local-only boundary.
{
  /** @typedef {import('../../types/sharing').Share} Share */
  /** @typedef {import('../../types/sharing').ShareControlsDeps} Deps */
  /** @type {Deps} */
  let api;
  let generation = 0;
  const list = /** @type {HTMLElement} */ (document.getElementById('share-link-list'));
  const errorLine = /** @type {HTMLElement} */ (document.getElementById('share-link-error'));

  /** @param {string} message */
  function error(message) {
    errorLine.textContent = message;
    errorLine.hidden = false;
  }

  /** @param {string} className @param {string} text */
  function label(className, text) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  }

  /** @param {string} className @param {string} text @param {() => unknown} action */
  function button(className, text, action) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn btn-secondary btn-sm ' + className;
    element.textContent = text;
    element.addEventListener('click', action);
    return element;
  }

  /** @param {Share} share @param {string} hash */
  function status(share, hash) {
    if (share.publicationState === 'conflict') return 'The link changed elsewhere. Review before updating.';
    if (share.pendingUpdate) return 'Publication unconfirmed. Retry checks the version from your first attempt.';
    if (!share.publishedContentHash) return 'Update this link to publish the current saved version.';
    return hash === share.publishedContentHash ? 'Saved version is shared' : "Saved changes haven't been shared";
  }

  /** @param {Share} share */
  function metadata(share) {
    const container = document.createElement('div');
    container.className = 'share-link-metadata';
    const publication = share.publishedAt || share.sharedAt;
    const date = new Date(publication).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    container.append(label('share-link-published', 'Last shared ' + date));
    container.append(label('share-link-expiry', 'Expires ' + new Date(share.expiresAt).toLocaleDateString()));
    return container;
  }

  /** @param {Share} share @param {HTMLElement} row @param {() => Promise<void>} task */
  async function act(share, row, task) {
    errorLine.hidden = true;
    const triggers = Array.from(row.querySelectorAll('button'));
    await api.busy(
      'share:' + share.id,
      triggers,
      'Could not finish managing this link. Reopen Share to retry.',
      async () => {
        try {
          await task();
        } catch (cause) {
          error(cause instanceof Error ? cause.message : 'Could not finish managing this link.');
        }
      },
    );
  }

  /** @param {Share} share @param {HTMLElement} row */
  async function publish(share, row) {
    const selected = api.note();
    if (!selected || selected.id !== share.noteId) return;
    const note = await api.getNote(share.noteId);
    if (!note || note.id !== share.noteId) return;
    if (api.dirty()) {
      error('Save your changes before updating the shared link.');
      return;
    }
    await act(share, row, async () => {
      try {
        await api.manager.publish(note, share);
        api.toast('Shared link updated.');
      } finally {
        await refresh(share.noteId);
      }
    });
  }

  /** @param {Share} share @param {HTMLElement} row */
  async function review(share, row) {
    await act(share, row, async () => {
      const content = await api.manager.review(share);
      const current = await api.db.getShare(share.id);
      if (!current) throw new Error('The local record for this link was removed.');
      row.querySelector('.share-review')?.remove();
      const preview = document.createElement('section');
      preview.className = 'share-review';
      const heading = document.createElement('h4');
      heading.textContent = 'Currently shared: ' + (content.title || 'Untitled note');
      const body = document.createElement('div');
      api.renderMarkdown(body, content.body || '');
      preview.append(
        heading,
        body,
        label('share-review-hint', 'Review this version before replacing it with your saved note.'),
      );
      preview.append(button('share-review-publish', 'Publish my saved version', () => publish(current, row)));
      row.append(preview);
    });
  }

  /** @param {Share} share @param {HTMLElement} row */
  async function stop(share, row) {
    await act(share, row, async () => {
      if (!(await api.manager.revoke(share))) throw new Error('Could not stop sharing. This link is still live.');
      await api.db.removeShare(share.id);
      await api.refreshShared();
      await refresh(share.noteId);
      api.render();
      api.toast('Link stopped working.');
    });
  }

  /** @param {string} url @param {HTMLButtonElement} trigger */
  async function copy(url, trigger) {
    try {
      await navigator.clipboard.writeText(url);
      api.toast('Link copied.');
      trigger.textContent = 'Copied';
      setTimeout(() => {
        trigger.textContent = 'Copy';
      }, 1600);
    } catch {
      error('Could not copy. Select the link and copy it manually.');
    }
  }

  /** @param {Share} share @param {string} hash */
  function rowFor(share, hash) {
    const row = document.createElement('li');
    row.className = 'share-link-row';
    row.dataset.shareId = share.id;
    const url = api.manager.url(share);
    const field = document.createElement('input');
    field.className = 'share-link-url';
    field.type = 'text';
    field.readOnly = true;
    field.value = url;
    field.setAttribute('aria-label', 'Public link for ' + (share.titleAtShare || 'this note'));
    field.addEventListener('focus', () => field.select());
    const actions = document.createElement('div');
    actions.className = 'share-link-actions';
    const copyButton = button('share-link-copy', 'Copy', () => copy(url, copyButton));
    const updateButton =
      share.publicationState === 'conflict'
        ? button('share-link-review', 'Review shared version', () => review(share, row))
        : button('share-link-update', share.pendingUpdate ? 'Retry update' : 'Update shared link', () =>
            publish(share, row),
          );
    updateButton.title = 'Replaces the shared copy for everyone with this link. The URL and expiry stay the same.';
    actions.append(
      copyButton,
      updateButton,
      button('share-link-revoke', 'Stop sharing', () => stop(share, row)),
    );
    const state = label('share-link-status', status(share, hash));
    state.setAttribute('role', 'status');
    row.append(field, metadata(share), state, actions);
    return row;
  }

  /** Local comparison only: opening Share never fetches anything. @param {string} noteId */
  async function refresh(noteId) {
    const currentGeneration = ++generation;
    const note = await api.getNote(noteId);
    if (!note || note.id !== noteId) return;
    const content = api.manager.payload(note);
    const shares = await api.db.getSharesForNote(noteId);
    const hash = await api.manager.fingerprint(content);
    if (currentGeneration !== generation || api.note()?.id !== noteId) return;
    const live = shares.filter((share) => share.expiresAt > Date.now()).sort((a, b) => b.sharedAt - a.sharedAt);
    const focused = document.activeElement;
    const focusedRow = focused?.closest('.share-link-row');
    const focusedId = focusedRow instanceof HTMLElement ? focusedRow.dataset.shareId : null;
    const actionClass = focused?.classList.contains('share-link-revoke')
      ? '.share-link-revoke'
      : '.share-link-update, .share-link-review';
    list.replaceChildren(...live.map((share) => rowFor(share, hash)));
    if (focusedId) {
      const row = list.querySelector('[data-share-id="' + CSS.escape(focusedId) + '"]');
      const action = row?.querySelector(actionClass);
      if (action instanceof HTMLElement) action.focus();
    }
  }

  /** @param {Deps} dependencies */
  function init(dependencies) {
    api = dependencies;
  }
  /** @type {Window & { ScratchpadShareControls?: { init: typeof init; refresh: typeof refresh } }} */
  const root = window;
  root.ScratchpadShareControls = Object.freeze({ init, refresh });
}
