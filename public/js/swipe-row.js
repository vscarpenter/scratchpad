// @ts-check
/* Swipe actions for note rows, touch and pen only. A mouse keeps the HTML5
   drag to a folder. The module delegates from the note list, because every
   render replaces the rows, and it never touches how a row is built.

   A rail is a sibling laid under the row, only as wide as the gap the sliding
   row has opened. It exists while a swipe is in progress or a row rests open,
   so a closed row carries no extra DOM. The document toolbar and bulk mode
   already reach the same actions, which is the alternative WCAG 2.5.1 asks a
   gesture to have. */
{
  ('use strict');

  const LOCK_PX = 10;
  const ACTION_PX = 76;
  const COMMIT_PAD_PX = 64;
  const COMMIT_RATIO = 0.55;
  // Pixels per millisecond.
  const OPEN_FLICK = 0.11;
  const COMMIT_FLICK = 0.5;
  const VELOCITY_WINDOW_MS = 100;
  const CLICK_GUARD_MS = 400;
  const SETTLE_FALLBACK_MS = 400;

  /** @typedef {{ id: string, label: string, danger?: boolean, full?: boolean, exits?: boolean }} SwipeAction */
  /** @typedef {{ leading: SwipeAction[], trailing: SwipeAction[] }} SwipeSides */
  /** @typedef {{ describe: (row: HTMLElement) => SwipeSides | null, onAction: (noteId: string, actionId: string) => unknown }} SwipeOptions */
  /** @typedef {{ rail: HTMLElement, track: HTMLElement, actions: SwipeAction[], width: number, commitPoint: number }} Rail */
  /** @typedef {{ row: HTMLElement, sides: SwipeSides, leading: Rail | null, trailing: Rail | null, x: number, settleRun: number }} Session */
  /** @typedef {{ row: HTMLElement, sides: SwipeSides, pointerId: number, startX: number, startY: number, baseX: number, lockDx: number, locked: boolean, samples: { t: number, x: number }[] }} Gesture */
  /** @typedef {{ list: HTMLElement, opts: SwipeOptions, gesture: Gesture | null, session: Session | null, isOpen: boolean, lastSwipeAt: number, stopTracking: () => void }} Context */

  /**
   * Decides where a released row lands. `offset` is the distance travelled in
   * the opening direction, and `velocity` is positive in that direction.
   * @param {{ offset: number, velocity: number, railWidth: number, rowWidth: number }} release
   * @returns {'closed' | 'open' | 'commit'}
   */
  function resolveRelease({ offset, velocity, railWidth, rowWidth }) {
    const commitPoint = Math.max(railWidth + COMMIT_PAD_PX, rowWidth * COMMIT_RATIO);
    if (offset >= commitPoint) return 'commit';
    if (velocity > COMMIT_FLICK && offset > railWidth) return 'commit';
    if (velocity < -OPEN_FLICK) return 'closed';
    if (offset >= railWidth / 2 || velocity > OPEN_FLICK) return 'open';
    return 'closed';
  }

  /** @param {{ t: number, x: number }[]} samples @param {number} now */
  function velocityOf(samples, now) {
    const recent = samples.filter((sample) => now - sample.t <= VELOCITY_WINDOW_MS);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    return last.t === first.t ? 0 : (last.x - first.x) / (last.t - first.t);
  }

  /**
   * @param {'leading' | 'trailing'} side
   * @param {SwipeAction[]} actions
   * @param {number} rowWidth
   * @param {(action: SwipeAction) => void} onPick
   * @returns {Rail | null}
   */
  function buildRail(side, actions, rowWidth, onPick) {
    if (!actions.length) return null;
    const rail = document.createElement('div');
    rail.className = 'swipe-rail is-' + side;
    // Hidden until the row moves its way, so its buttons stay out of the tab
    // order and the accessibility tree while the other side is in play.
    rail.hidden = true;
    const track = document.createElement('div');
    track.className = 'swipe-rail-track';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swipe-action' + (action.danger ? ' is-danger' : '') + (action.full ? ' is-full' : '');
      button.textContent = action.label;
      button.addEventListener('click', () => onPick(action));
      track.append(button);
    }
    rail.append(track);
    const width = actions.length * ACTION_PX;
    return { rail, track, actions, width, commitPoint: Math.max(width + COMMIT_PAD_PX, rowWidth * COMMIT_RATIO) };
  }

  /** @param {Context} ctx @param {HTMLElement} row @param {SwipeSides} sides @returns {Session} */
  function mount(ctx, row, sides) {
    /** @type {Session} */
    const session = { row, sides, leading: null, trailing: null, x: 0, settleRun: 0 };
    /** @param {SwipeAction} action */
    const onPick = (action) => act(ctx, session, action);
    session.leading = buildRail('leading', sides.leading, row.offsetWidth, onPick);
    session.trailing = buildRail('trailing', sides.trailing, row.offsetWidth, onPick);
    for (const rail of [session.leading, session.trailing]) {
      if (!rail) continue;
      rail.rail.style.top = row.offsetTop + 'px';
      rail.rail.style.left = row.offsetLeft + 'px';
      rail.rail.style.width = row.offsetWidth + 'px';
      rail.rail.style.height = row.offsetHeight + 'px';
      row.before(rail.rail);
    }
    row.classList.add('is-swiping');
    return session;
  }

  /** @param {Session} session @param {number} x */
  function setOffset(session, x) {
    session.x = x;
    session.row.style.transform = x ? `translateX(${x}px)` : '';
    const reveals = [
      { rail: session.leading, reveal: Math.max(0, x), other: Math.max(0, -x) },
      { rail: session.trailing, reveal: Math.max(0, -x), other: Math.max(0, x) },
    ];
    for (const { rail, reveal, other } of reveals) {
      if (!rail) continue;
      // At zero a rail keeps its state, so it stays drawn while it closes.
      if (reveal > 0) rail.rail.hidden = false;
      else if (other > 0) rail.rail.hidden = true;
      rail.track.style.width = reveal + 'px';
      rail.rail.classList.toggle('is-committing', reveal >= rail.commitPoint);
    }
  }

  /** @param {Session} session @param {boolean} on */
  function markSettling(session, on) {
    session.row.classList.toggle('is-swipe-settling', on);
    for (const rail of [session.leading, session.trailing]) {
      if (rail) rail.rail.classList.toggle('is-swipe-settling', on);
    }
  }

  /**
   * Animates to `x`, then runs `then`. A newer settle or a new drag on the same
   * session bumps settleRun, and the stale run then skips its callback.
   * @param {Session} session
   * @param {number} x
   * @param {() => void} then
   */
  function settle(session, x, then) {
    const run = ++session.settleRun;
    const still = x === session.x || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setOffset(session, x);
      then();
      return;
    }
    let timer = 0;
    /** @param {TransitionEvent} [e] */
    const finish = (e) => {
      if (e && (e.target !== session.row || e.propertyName !== 'transform')) return;
      window.clearTimeout(timer);
      session.row.removeEventListener('transitionend', finish);
      if (run !== session.settleRun) return;
      markSettling(session, false);
      then();
    };
    session.row.addEventListener('transitionend', finish);
    timer = window.setTimeout(finish, SETTLE_FALLBACK_MS);
    markSettling(session, true);
    // Flush styles so the transition starts from where the finger left it.
    void session.row.offsetWidth;
    setOffset(session, x);
  }

  /** @param {Context} ctx @param {Session} session */
  function unmount(ctx, session) {
    session.settleRun++;
    for (const rail of [session.leading, session.trailing]) {
      if (rail) rail.rail.remove();
    }
    session.row.style.transform = '';
    session.row.classList.remove('is-swiping', 'is-swipe-settling', 'is-swipe-open');
    if (ctx.session === session) {
      ctx.session = null;
      ctx.isOpen = false;
    }
  }

  /** @param {Context} ctx @param {Session} session */
  function close(ctx, session) {
    if (ctx.session === session) ctx.isOpen = false;
    session.row.classList.remove('is-swipe-open');
    settle(session, 0, () => unmount(ctx, session));
  }

  /**
   * Runs an action. A blocked or failed action leaves the row in the list, so
   * the row closes once the action settles. A render has already replaced it
   * otherwise.
   * @param {Context} ctx
   * @param {Session} session
   * @param {SwipeAction} action
   */
  function act(ctx, session, action) {
    ctx.lastSwipeAt = performance.now();
    const noteId = session.row.getAttribute('data-id') || '';
    const result = ctx.opts.onAction(noteId, action.id);
    Promise.resolve(result).finally(() => {
      if (session.row.isConnected) close(ctx, session);
    });
  }

  /** @param {Context} ctx @param {Session} session @param {number} velocity */
  function release(ctx, session, velocity) {
    const leading = session.x > 0;
    const rail = leading ? session.leading : session.trailing;
    if (!rail) return close(ctx, session);
    const sign = leading ? 1 : -1;
    const rowWidth = session.row.offsetWidth;
    const outcome = resolveRelease({
      offset: Math.abs(session.x),
      velocity: velocity * sign,
      railWidth: rail.width,
      rowWidth,
    });
    const full = rail.actions.find((action) => action.full);
    if (outcome === 'commit' && full) {
      if (!full.exits) return act(ctx, session, full);
      return settle(session, sign * rowWidth, () => act(ctx, session, full));
    }
    if (outcome === 'closed') return close(ctx, session);
    ctx.isOpen = true;
    session.row.classList.add('is-swipe-open');
    return settle(session, sign * rail.width, () => {});
  }

  /** @param {Context} ctx */
  function dropStale(ctx) {
    if (ctx.session && !ctx.session.row.isConnected) unmount(ctx, ctx.session);
  }

  /** @param {Context} ctx */
  function closeOpen(ctx) {
    dropStale(ctx);
    if (ctx.session && ctx.isOpen) close(ctx, ctx.session);
  }

  /** @param {Context} ctx @param {PointerEvent} e */
  function onDown(ctx, e) {
    if (e.pointerType === 'mouse') return;
    dropStale(ctx);
    // A second finger ends the swipe rather than fighting the first.
    if (!e.isPrimary) return endGesture(ctx, 0);
    const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.note-row'));
    if (!row) return;
    const sameRow = !!ctx.session && ctx.session.row === row;
    if (ctx.session && !sameRow) {
      // The first tap elsewhere only dismisses, as it does in Mail.
      if (ctx.isOpen) ctx.lastSwipeAt = performance.now();
      close(ctx, ctx.session);
    }
    const sides = sameRow && ctx.session ? ctx.session.sides : ctx.opts.describe(row);
    if (!sides) return;
    ctx.gesture = {
      row,
      sides,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: sameRow && ctx.session ? ctx.session.x : 0,
      lockDx: 0,
      locked: false,
      samples: [],
    };
    ctx.stopTracking = trackPointer(ctx);
  }

  /**
   * Locks to a horizontal swipe once the move is clearly sideways. A vertical
   * start abandons the gesture, and the list scrolls as it always has.
   * @param {Context} ctx
   * @param {Gesture} gesture
   * @param {number} dx
   * @param {number} dy
   */
  function tryLock(ctx, gesture, dx, dy) {
    if (Math.abs(dy) > LOCK_PX && Math.abs(dy) >= Math.abs(dx)) {
      endGesture(ctx, 0);
      return false;
    }
    if (Math.abs(dx) <= LOCK_PX || Math.abs(dx) <= Math.abs(dy)) return false;
    const reuse = ctx.session && ctx.session.row === gesture.row ? ctx.session : null;
    if (ctx.session && !reuse) unmount(ctx, ctx.session);
    ctx.session = reuse || mount(ctx, gesture.row, gesture.sides);
    ctx.session.settleRun++;
    markSettling(ctx.session, false);
    gesture.locked = true;
    gesture.lockDx = dx;
    return true;
  }

  /** @param {Context} ctx @param {PointerEvent} e */
  function onMove(ctx, e) {
    const gesture = ctx.gesture;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (!gesture.row.isConnected) return endGesture(ctx, 0);
    const dx = e.clientX - gesture.startX;
    if (!gesture.locked && !tryLock(ctx, gesture, dx, e.clientY - gesture.startY)) return;
    const session = ctx.session;
    if (!session) return;
    const limit = session.row.offsetWidth;
    let x = gesture.baseX + dx - gesture.lockDx;
    if (x > 0 && !session.leading) x = 0;
    if (x < 0 && !session.trailing) x = 0;
    x = Math.max(-limit, Math.min(limit, x));
    setOffset(session, x);
    gesture.samples.push({ t: performance.now(), x });
    if (gesture.samples.length > 8) gesture.samples.shift();
  }

  /** @param {Context} ctx @param {number} velocity */
  function endGesture(ctx, velocity) {
    const gesture = ctx.gesture;
    ctx.gesture = null;
    ctx.stopTracking();
    if (!gesture || !gesture.locked || !ctx.session) return;
    ctx.lastSwipeAt = performance.now();
    if (!ctx.session.row.isConnected) return unmount(ctx, ctx.session);
    release(ctx, ctx.session, velocity);
  }

  /**
   * Follows the pointer on the window for one gesture, so a finger that leaves
   * the row still reports its moves and its release.
   * @param {Context} ctx
   * @returns {() => void}
   */
  function trackPointer(ctx) {
    ctx.stopTracking();
    /** @param {PointerEvent} e */
    const move = (e) => onMove(ctx, e);
    /** @param {PointerEvent} e */
    const up = (e) => {
      if (!ctx.gesture || e.pointerId !== ctx.gesture.pointerId) return;
      const cancelled = e.type === 'pointercancel';
      endGesture(ctx, cancelled ? 0 : velocityOf(ctx.gesture.samples, performance.now()));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      ctx.stopTracking = () => {};
    };
  }

  /**
   * A click right after a swipe, or on a row that rests open, must not open
   * the note. Rail buttons handle their own clicks.
   * @param {Context} ctx
   * @param {MouseEvent} e
   */
  function onClickCapture(ctx, e) {
    dropStale(ctx);
    if (/** @type {Element} */ (e.target).closest('.swipe-rail')) return;
    const justSwiped = performance.now() - ctx.lastSwipeAt < CLICK_GUARD_MS;
    if (!justSwiped && !ctx.isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    closeOpen(ctx);
  }

  /** @param {HTMLElement} list @param {SwipeOptions} opts */
  function attach(list, opts) {
    /** @type {Context} */
    const ctx = {
      list,
      opts,
      gesture: null,
      session: null,
      isOpen: false,
      lastSwipeAt: -CLICK_GUARD_MS,
      stopTracking: () => {},
    };
    list.addEventListener('pointerdown', (e) => onDown(ctx, e));
    list.addEventListener('click', (e) => onClickCapture(ctx, e), true);
    list.addEventListener('scroll', () => closeOpen(ctx), { passive: true });
    document.addEventListener('pointerdown', (e) => {
      if (!list.contains(/** @type {Node} */ (e.target))) closeOpen(ctx);
    });
  }

  /** @type {Window & typeof globalThis & { ScratchpadSwipeRow?: object }} */
  const root = window;
  root.ScratchpadSwipeRow = Object.freeze({ attach, resolveRelease });
}
