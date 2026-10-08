// @ts-check
/* The note header's location pill. A note in Notes reads Home › folder ›
   title, and Home and the folder are buttons: Home opens Home, and the
   folder shows its notes in the list while the note stays open. Archived and
   trashed notes keep a plain label, because Home lives in the Notes view.
   Every label lands through textContent. */
'use strict';
{
  /** @typedef {{ id: string, title?: string, body?: string, folderId?: string | null, archivedAt?: number | null, deletedAt?: number | null }} CrumbNote */
  /** @typedef {{ isTrashed(note: CrumbNote): boolean, isArchived(note: CrumbNote): boolean, deriveTitle(note: CrumbNote): string, noteFolderId(note: CrumbNote): string | null, folderDisplayName(id: string | null): string, goHome(): unknown, openFolder(id: string | null): unknown }} CrumbDeps */
  /** @typedef {Window & typeof globalThis & { ScratchpadBreadcrumb?: object }} CrumbWindow */

  /** @type {CrumbWindow} */
  const root = window;
  const TITLE_MAX = 32;
  /** @type {CrumbDeps | null} */
  let deps = null;

  /** @param {string} text */
  function truncate(text) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > TITLE_MAX ? flat.slice(0, TITLE_MAX - 1) + '…' : flat;
  }

  /** @param {string} className @param {string} [text] */
  function span(className, text) {
    const element = document.createElement('span');
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function separator() {
    const element = span('crumb-sep');
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  function homeIcon() {
    const template = document.getElementById('tpl-home-icon');
    return template instanceof HTMLTemplateElement ? template.content.cloneNode(true) : document.createTextNode('Home');
  }

  /** @param {string} label @param {() => unknown} onClick @param {Node} [icon] */
  function crumbButton(label, onClick, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crumb-link';
    if (icon) {
      button.append(icon);
      button.setAttribute('aria-label', label);
      button.title = label;
    } else {
      button.textContent = label;
    }
    button.addEventListener('click', () => onClick());
    return button;
  }

  /** @param {HTMLElement} container @param {string} place @param {string} detail */
  function plain(container, place, detail) {
    container.replaceChildren(document.createTextNode(place), separator(), span('crumb-current', detail));
  }

  /** @param {HTMLElement} container @param {CrumbNote} note */
  function render(container, note) {
    if (!deps) return;
    const api = deps;
    const title = truncate(api.deriveTitle(note));
    const folderId = api.noteFolderId(note);
    if (api.isTrashed(note)) return plain(container, 'trash', title);
    if (api.isArchived(note)) return plain(container, 'archive', api.folderDisplayName(folderId));
    const home = span('crumb-home');
    home.append(
      crumbButton('Home', () => api.goHome(), homeIcon()),
      separator(),
    );
    container.replaceChildren(
      home,
      crumbButton(api.folderDisplayName(folderId), () => api.openFolder(folderId)),
      separator(),
      span('crumb-current', title),
    );
  }

  /** @param {CrumbDeps} api */
  function init(api) {
    deps = api;
  }

  root.ScratchpadBreadcrumb = Object.freeze({ init, render });
}
