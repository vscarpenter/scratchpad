// @ts-check
/* The keyboard shortcuts sheet. ? opens it from anywhere outside a text
   field while no dialog is open, and the palette has a command for it. The
   list is cloned from the About dialog, which stays the one place the
   shortcuts are written down. */
'use strict';
{
  /** @typedef {Window & typeof globalThis & { ScratchpadShortcuts?: object }} ShortcutsWindow */

  /** @type {ShortcutsWindow} */
  const root = window;

  /** @param {EventTarget | null} target */
  function isTyping(target) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  function open() {
    const dialog = document.getElementById('shortcuts-dialog');
    const list = document.getElementById('shortcuts-list');
    const source = document.querySelector('#about-dialog .shortcut-list');
    if (!(dialog instanceof HTMLDialogElement) || !list || !source) return;
    list.replaceChildren(...Array.from(source.children, (item) => item.cloneNode(true)));
    if (!dialog.open) dialog.showModal();
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    open();
  }

  function commands() {
    return [
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts',
        meta: 'Every shortcut on one sheet. Press ? anywhere.',
        keywords: 'keys keyboard hotkeys help cheat sheet',
        run: open,
      },
    ];
  }

  window.addEventListener('keydown', onKey);
  root.ScratchpadShortcuts = Object.freeze({ open, commands });
}
