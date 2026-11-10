// @ts-check
/* Local calendar arithmetic uses noon and numeric date parts, never UTC
   parsing or fixed 24-hour offsets, including at DST/month/year boundaries. */
'use strict';
{
  /** @typedef {{ id: string, dailyDate?: string | null, createdAt?: number }} CalendarNote */
  /** @typedef {{ selected(): CalendarNote | null | undefined, notes(): CalendarNote[], openDate(key: string, trigger: HTMLElement): Promise<unknown> }} CalendarApi */
  /** @type {CalendarApi} */
  let api;
  let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
  let focusKey = dateKey(new Date());
  let selectedId = '';
  const days = /** @type {HTMLElement} */ (document.getElementById('chronicle-days'));
  const label = /** @type {HTMLElement} */ (document.getElementById('chronicle-month'));
  const body = /** @type {HTMLElement} */ (document.getElementById('calendar-body'));
  const toggle = /** @type {HTMLButtonElement} */ (document.getElementById('calendar-toggle'));

  /** @param {Date} date @returns {string} */
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /** @param {string} key @returns {Date} */
  function dateOf(key) {
    const [year, monthNumber, day] = key.split('-').map(Number);
    return new Date(year, monthNumber - 1, day, 12);
  }

  /** @param {Date} date */
  function showMonth(date) {
    month = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  }

  /** @param {Date} date @param {string} selected @param {Set<string>} existing */
  function dayButton(date, selected, existing) {
    const key = dateKey(date);
    const today = key === dateKey(new Date());
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chronicle-day';
    button.dataset.date = key;
    button.textContent = String(date.getDate());
    button.tabIndex = key === focusKey ? 0 : -1;
    button.classList.toggle('is-outside', date.getMonth() !== month.getMonth());
    button.classList.toggle('is-active', key === selected);
    button.classList.toggle('is-today', today);
    button.classList.toggle('has-note', existing.has(key));
    const name = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    button.setAttribute('aria-label', `Open daily note for ${name}${existing.has(key) ? ', note exists' : ''}`);
    button.setAttribute('aria-pressed', String(key === selected));
    if (today) button.setAttribute('aria-current', 'date');
    return button;
  }

  function render() {
    if (!api) return;
    const note = api.selected();
    const selected = note?.dailyDate || '';
    if (note?.id !== selectedId) {
      selectedId = note?.id || '';
      if (selected) {
        focusKey = selected;
        showMonth(dateOf(selected));
      }
    }
    const active = document.activeElement;
    const restore = active instanceof HTMLButtonElement && days.contains(active);
    if (restore) focusKey = active.dataset.date || focusKey;
    const existing = new Set(
      api
        .notes()
        .map((row) => row.dailyDate || '')
        .filter(Boolean),
    );
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay(), 12);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
    const length = Math.ceil((month.getDay() + lastDay) / 7) * 7;
    const dates = Array.from(
      { length },
      (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12),
    );
    if (!dates.some((date) => dateKey(date) === focusKey)) focusKey = dateKey(month);
    label.textContent = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
    days.setAttribute('aria-label', label.textContent);
    days.replaceChildren(...dates.map((date) => dayButton(date, selected, existing)));
    if (restore) focusDate();
  }

  function focusDate() {
    days.querySelectorAll('button').forEach((button) => {
      if (button.dataset.date === focusKey) button.focus();
    });
  }

  /** @param {number} delta */
  function changeMonth(delta) {
    showMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1, 12));
    focusKey = dateKey(month);
    render();
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (!(event.target instanceof HTMLButtonElement)) return;
    // Alt+Left is browser Back, and other modified arrows belong to the OS.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.target.dataset.date;
    if (!key) return;
    const date = dateOf(key);
    const delta = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -date.getDay(),
      End: 6 - date.getDay(),
    }[event.key];
    if (delta === undefined && !['PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    if (delta !== undefined) date.setDate(date.getDate() + delta);
    else moveByMonth(date, event.key === 'PageUp' ? -1 : 1);
    focusKey = dateKey(date);
    showMonth(date);
    // The old focused button must not override the new roving focus key.
    event.target.blur();
    render();
    focusDate();
  }

  /** @param {Date} date @param {number} delta */
  function moveByMonth(date, delta) {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + delta);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
    date.setDate(Math.min(day, last));
  }

  /** @param {MouseEvent} event */
  async function onDay(event) {
    const button = event.target instanceof Element ? event.target.closest('button[data-date]') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    focusKey = button.dataset.date || focusKey;
    await api.openDate(focusKey, button);
  }

  function toggleBody() {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
  }

  /** @param {CalendarApi} dependencies */
  function init(dependencies) {
    api = dependencies;
    body.hidden = matchMedia('(max-width: 767px)').matches;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
    toggle.addEventListener('click', toggleBody);
    document.getElementById('calendar-prev')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendar-next')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('calendar-today')?.addEventListener('click', () => {
      focusKey = dateKey(new Date());
      showMonth(new Date());
      render();
    });
    days.addEventListener('click', onDay);
    days.addEventListener('keydown', onKey);
    render();
  }

  /** @type {Window & typeof globalThis & { ScratchpadCalendar?: object }} */
  const root = window;
  root.ScratchpadCalendar = Object.freeze({ init, render });
}
