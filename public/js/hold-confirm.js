// @ts-check
/* Hold to confirm. The actions that destroy notes for good ask for a one
   second hold inside their dialog, so a reflexive click or Enter cannot confirm
   them. The module attaches to every [data-hold-confirm] button and gates its
   click. app.js keeps its ordinary click handlers and never learns about the
   hold.

   Assistive technology sends a click with no press before it (VoiceOver, Voice
   Control, Switch Control). Those users cannot hold, and the dialog already
   asked them to confirm, so that click passes straight through. */
{
  ('use strict');

  const HOLD_MS = 1000;
  // A touch click can trail its pointerup. A click this soon after a release
  // still belongs to that press.
  const CLICK_GRACE_MS = 700;
  const DRIFT_SLOP_PX = 8;
  const HINT = 'Keep holding to confirm.';

  /** @typedef {{ timer: number, pressed: boolean, releasedAt: number, confirmed: boolean }} HoldState */

  /** @param {HTMLElement} button */
  function makeHint(button) {
    const hint = document.createElement('span');
    hint.className = 'visually-hidden';
    hint.setAttribute('aria-live', 'polite');
    button.after(hint);
    return hint;
  }

  /**
   * @param {HTMLElement} button
   * @param {PointerEvent} e
   */
  function driftedOff(button, e) {
    const box = button.getBoundingClientRect();
    return (
      e.clientX < box.left - DRIFT_SLOP_PX ||
      e.clientX > box.right + DRIFT_SLOP_PX ||
      e.clientY < box.top - DRIFT_SLOP_PX ||
      e.clientY > box.bottom + DRIFT_SLOP_PX
    );
  }

  /**
   * The press half: starting, finishing, and abandoning a hold.
   * @param {HTMLButtonElement} button
   * @param {HTMLElement} hint
   * @param {HoldState} state
   */
  function holdControls(button, hint, state) {
    const dialog = button.closest('dialog');
    const stop = () => {
      window.clearTimeout(state.timer);
      state.timer = 0;
      button.classList.remove('is-holding');
    };
    const complete = () => {
      stop();
      if (button.disabled || !button.isConnected || (dialog && !dialog.open)) return;
      state.confirmed = true;
      button.click();
    };
    const start = () => {
      state.pressed = true;
      if (state.timer || button.disabled) return;
      hint.textContent = '';
      button.classList.add('is-holding');
      state.timer = window.setTimeout(complete, HOLD_MS);
    };
    const release = () => {
      if (state.timer) hint.textContent = HINT;
      if (state.pressed) state.releasedAt = performance.now();
      state.pressed = false;
      stop();
    };
    const reset = () => {
      stop();
      state.pressed = false;
      state.releasedAt = 0;
    };
    if (dialog) dialog.addEventListener('close', reset);
    return { start, release };
  }

  /**
   * The click half. A click the module raised passes. A click tied to a press
   * is a short tap, so it stops here. A click with no press comes from
   * assistive technology and passes.
   * @param {HTMLButtonElement} button
   * @param {HoldState} state
   */
  function gateClicks(button, state) {
    button.addEventListener(
      'click',
      (e) => {
        if (state.confirmed) {
          state.confirmed = false;
          return;
        }
        const fromPress = state.pressed || performance.now() - state.releasedAt < CLICK_GRACE_MS;
        if (!fromPress) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
  }

  /** @param {HTMLButtonElement} button */
  function attach(button) {
    /** @type {HoldState} */
    const state = { timer: 0, pressed: false, releasedAt: -CLICK_GRACE_MS, confirmed: false };
    const { start, release } = holdControls(button, makeHint(button), state);
    button.style.setProperty('--hold-ms', HOLD_MS + 'ms');
    gateClicks(button, state);

    button.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && e.isPrimary) start();
    });
    // A captured touch never fires pointerleave, so watch the move as well.
    button.addEventListener('pointermove', (e) => {
      if (state.timer && driftedOff(button, e)) release();
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
      button.addEventListener(type, release);
    }
    button.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      // A key held over from opening the dialog repeats here. It counts as a
      // press, so its clicks stop at the gate, but it never starts a hold.
      if (e.repeat) state.pressed = true;
      else start();
    });
    button.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') release();
    });
    // A long press on touch raises the context menu mid-hold.
    button.addEventListener('contextmenu', (e) => {
      if (state.timer) e.preventDefault();
    });
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) release();
    });
  }

  for (const button of document.querySelectorAll('button[data-hold-confirm]')) {
    attach(/** @type {HTMLButtonElement} */ (button));
  }

  /** @type {Window & typeof globalThis & { ScratchpadHoldConfirm?: object }} */
  const root = window;
  root.ScratchpadHoldConfirm = Object.freeze({ attach, HOLD_MS });
}
