// @ts-check
/* Transient action feedback. The region is an aria-live="polite" status, so
   appending a toast announces it. Callers must not raise a toast while a modal
   <dialog> is open, because the dialog's top layer would cover it. Close the
   dialog first. tone: 'success' | 'info' | 'error'. Errors persist with a
   dismiss button. Everything else dismisses on a clock that waits while the
   pointer or focus is on the toast. Callers may add one explicit action, such
   as Undo for a lifecycle transition; that toast draws its remaining time. */
{
  ('use strict');

  const DEFAULT_MS = 2600;
  // Matches the exit transition in app.css, so removal follows the fade.
  const EXIT_MS = 220;

  /** @typedef {{ tone?: string, persist?: boolean, duration?: number, actionLabel?: string, action?: () => unknown }} ToastOptions */

  /**
   * @param {string} tag
   * @param {string} className
   * @param {string} [text]
   */
  function make(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * @param {string} className
   * @param {string} text
   * @param {() => unknown} onClick
   */
  function makeButton(className, text, onClick) {
    const button = /** @type {HTMLButtonElement} */ (make('button', className, text));
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Counts down while nothing holds the toast. Hover and focus each hold it,
   * and the clock resumes only when both have let go. `is-paused` also pauses
   * the burn-down bar, so the bar and the clock cannot drift apart.
   * @param {HTMLElement} node
   * @param {number} ms
   * @param {() => void} onDone
   */
  function startClock(node, ms, onDone) {
    /** @type {Set<string>} */
    const holds = new Set();
    let remaining = ms;
    let startedAt = 0;
    let timer = 0;
    const run = () => {
      startedAt = performance.now();
      timer = window.setTimeout(onDone, remaining);
    };
    /** @param {string} reason */
    const hold = (reason) => {
      if (!holds.size) {
        window.clearTimeout(timer);
        remaining -= performance.now() - startedAt;
        node.classList.add('is-paused');
      }
      holds.add(reason);
    };
    /** @param {string} reason */
    const release = (reason) => {
      if (!holds.delete(reason) || holds.size) return;
      node.classList.remove('is-paused');
      run();
    };
    node.addEventListener('pointerenter', () => hold('hover'));
    node.addEventListener('pointerleave', () => release('hover'));
    node.addEventListener('focusin', () => hold('focus'));
    node.addEventListener('focusout', () => release('focus'));
    run();
  }

  /**
   * @param {string} label
   * @param {() => unknown} action
   * @param {() => void} remove
   */
  function actionButton(label, action, remove) {
    const button = makeButton('toast-action', label, async () => {
      // Blur first. Chromium drops focus from a disabled button without a
      // focusout, which would leave the clock held for good.
      button.blur();
      button.disabled = true;
      try {
        await action();
        remove();
      } catch (e) {
        button.disabled = false;
        console.warn('Toast action failed', e);
        const region = /** @type {HTMLElement} */ (button.closest('.toast-region'));
        show(region, 'Undo failed. Your note was not changed.', { tone: 'error' });
      }
    });
    return button;
  }

  /**
   * @param {HTMLElement} node
   * @returns {() => void}
   */
  function remover(node) {
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      node.classList.remove('is-visible');
      window.setTimeout(() => node.remove(), EXIT_MS);
    };
  }

  /**
   * @param {HTMLElement | null} region
   * @param {string} message
   * @param {ToastOptions} [options]
   */
  function show(region, message, options) {
    if (!region) return undefined;
    const opts = options || {};
    const tone = opts.tone || 'success';
    const persist = opts.persist != null ? opts.persist : tone === 'error';
    const node = make('div', 'toast is-' + tone);
    const dot = make('span', 'toast-dot');
    dot.setAttribute('aria-hidden', 'true');
    node.append(dot, document.createTextNode(message));
    const remove = remover(node);

    if (persist) {
      const dismiss = makeButton('toast-dismiss', '×', remove);
      dismiss.setAttribute('aria-label', 'Dismiss');
      node.append(dismiss);
    }
    const action = opts.action;
    const hasAction = !!opts.actionLabel && typeof action === 'function';
    if (opts.actionLabel && typeof action === 'function') {
      node.append(actionButton(opts.actionLabel, action, remove));
    }
    if (!persist) {
      const ms = opts.duration || DEFAULT_MS;
      node.style.setProperty('--toast-ms', ms + 'ms');
      if (hasAction) {
        const burn = make('span', 'toast-burn');
        burn.setAttribute('aria-hidden', 'true');
        node.append(burn);
      }
      startClock(node, ms, remove);
    }

    region.append(node);
    requestAnimationFrame(() => node.classList.add('is-visible'));
    return node;
  }

  /** @type {Window & typeof globalThis & { ScratchpadToast?: object }} */
  const root = window;
  root.ScratchpadToast = Object.freeze({ show });
}
