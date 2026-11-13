// @ts-check
/* One navigation landmark: persistent on larger screens, hosted by a native
   modal dialog on phones. Moving it preserves IDs, listeners, and focus. */
'use strict';
{
  /** @typedef {{ id: string, name: string, color?: string | null }} Folder */
  /** @typedef {{ view: string, folderId: string | null, pinned: boolean, home: boolean, folders: Folder[] }} NavState */
  /** @typedef {{ navigate(action: string, folderId?: string): Promise<unknown>, read(): NavState }} NavApi */
  /** @type {NavApi} */
  let api;
  const panel = /** @type {HTMLElement} */ (document.getElementById('workspace-navigation'));
  const shell = /** @type {HTMLElement} */ (document.getElementById('app-shell'));
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('navigation-dialog'));
  const folders = /** @type {HTMLElement} */ (document.getElementById('workspace-folders'));
  const wide = matchMedia('(min-width: 768px)');
  const triggers = document.querySelectorAll('[data-open-navigation]');
  /** @type {HTMLElement | null} */
  let opener = null;

  function syncExpanded() {
    triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', String(dialog.open)));
  }

  function restorePanel() {
    if (panel.parentElement !== shell) shell.prepend(panel);
    syncExpanded();
    // WebKit does not focus a pointer-clicked button, so its native modal
    // restoration can land on body. Restore the actual trigger explicitly.
    if (!dialog.open && opener) {
      if (opener.getClientRects().length) opener.focus({ preventScroll: true });
      opener = null;
    }
  }

  function close() {
    if (dialog.open) dialog.close();
    restorePanel();
  }

  /** @param {Event} event */
  function open(event) {
    if (wide.matches || dialog.open) return;
    opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    dialog.append(panel);
    dialog.showModal();
    syncExpanded();
  }

  /** @param {NavState} state @returns {string} */
  function activeKey(state) {
    if (state.view !== 'active') return state.view;
    if (state.pinned) return 'pinned';
    if (state.home) return 'home';
    if (state.folderId === 'scratchpad-daily-notes') return 'daily';
    return state.folderId ? 'folder' : 'notes';
  }

  /** @param {Folder} folder @param {string | null} selected */
  function folderButton(folder, selected) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workspace-item workspace-folder';
    button.dataset.folderId = folder.id;
    button.dataset.navAction = 'folder';
    if (folder.color) button.dataset.color = folder.color;
    const icon = /** @type {HTMLTemplateElement} */ (document.getElementById('tpl-navigation-folder'));
    button.append(icon.content.cloneNode(true));
    const label = document.createElement('span');
    label.textContent = folder.name;
    button.append(label);
    if (selected === folder.id) button.setAttribute('aria-current', 'page');
    return button;
  }

  function render() {
    if (!api) return;
    const state = api.read();
    const key = activeKey(state);
    renderEmptyState(state);
    for (const item of panel.querySelectorAll('[data-nav-action]:not(.workspace-folder)')) {
      if (item.getAttribute('data-nav-action') === key) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
    const active = document.activeElement;
    const focusId = active instanceof HTMLElement && folders.contains(active) ? active.dataset.folderId : null;
    const rows = state.folders.filter((folder) => folder.id !== 'scratchpad-daily-notes');
    folders.replaceChildren(...rows.map((folder) => folderButton(folder, key === 'folder' ? state.folderId : null)));
    if (focusId)
      folders.querySelectorAll('button').forEach((button) => {
        if (button.dataset.folderId === focusId) button.focus();
      });
    panel.classList.toggle('has-folders', rows.length > 0);
  }

  /** @param {NavState} state */
  function renderEmptyState(state) {
    const title = document.querySelector('#empty-no-results h3');
    const copy = document.querySelector('#empty-no-results p');
    if (title) title.textContent = state.pinned ? 'No pinned notes yet' : 'No matches';
    if (copy)
      copy.textContent = state.pinned
        ? 'Pin a note from its actions menu to keep it nearby.'
        : 'Nothing matched your search or filter.';
  }

  /** @param {MouseEvent} event */
  async function onAction(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-nav-action]') : null;
    if (!(target instanceof HTMLButtonElement)) return;
    close();
    await api.navigate(target.dataset.navAction || '', target.dataset.folderId);
  }

  /** @param {NavApi} dependencies */
  function init(dependencies) {
    api = dependencies;
    triggers.forEach((trigger) => trigger.addEventListener('click', open));
    document.getElementById('navigation-close')?.addEventListener('click', close);
    document.getElementById('home-back-to-list')?.addEventListener('click', () => api.navigate('notes'));
    panel.addEventListener('click', onAction);
    // A hash jump would fight the wikilink hash, so the skip link moves focus itself.
    document.getElementById('skip-link')?.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById('main')?.focus();
    });
    dialog.addEventListener('close', restorePanel);
    // closedby="any" dismisses on a backdrop click where the browser supports it.
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) close();
      });
    }
    wide.addEventListener('change', close);
  }

  /** @type {Window & typeof globalThis & { ScratchpadNavigation?: object }} */
  const root = window;
  root.ScratchpadNavigation = Object.freeze({ init, render });
}
