/* Scratchpad first-run seed notes. Exposes window.ScratchpadSeed.
   Bodies are arrays of lines joined by "\n" (not template literals) so the
   Markdown Guide's fenced code blocks and a literal ${...} survive intact. */
(function () {
  'use strict';

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function dayKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  const WELCOME_BODY = [
    "# Welcome to Scratchpad",
    "",
    "This is a **privacy-first, local-only** notes app. Everything you write lives in *this browser* — no account, no sync, no servers. To prove it, open your browser's network tab: after the page loads, Scratchpad makes **zero** network calls.",
    "",
    "These three starter notes are a quick tour. Edit them, delete them, make the place yours.",
    "",
    "## Try these",
    "",
    "- [x] Read this welcome note",
    "- [ ] Open the [[Markdown Guide]] to see every formatting trick",
    "- [ ] Press `Cmd/Ctrl + K` for the command palette",
    "- [ ] Jump to **today's note** from the palette (search \"today\") — a fresh page each day",
    "- [ ] Star a note to pin it to the top",
    "- [ ] Export a backup from the ⋯ menu",
    "",
    "## Linking notes together",
    "",
    "Wrap a note's title in double brackets to link to it, like [[Markdown Guide]]. Link to a title that doesn't exist yet and it renders as a **dashed** link — click [[My First Note]] and Scratchpad offers to create it. That's how a web of notes grows.",
    "",
    "> Everything here is yours and stays on this device. Read more any time on the [About page](about.html).",
    "",
  ].join("\n");

  const MARKDOWN_GUIDE_BODY = [
    "# Markdown Guide",
    "",
    "Scratchpad renders standard (GitHub-flavored) Markdown, and the output is sanitized — so pasting from anywhere is safe.",
    "",
    "## Text styling",
    "",
    "Write **bold**, *italic*, ***both***, ~~strikethrough~~, and `inline code`. Break sections with a horizontal rule:",
    "",
    "---",
    "",
    "## Lists",
    "",
    "Nested unordered lists:",
    "",
    "- Groceries",
    "  - Coffee",
    "  - Oat milk",
    "- Errands",
    "  - Post office",
    "",
    "Ordered lists:",
    "",
    "1. First",
    "2. Second",
    "3. Third",
    "",
    "Task lists are **interactive** — toggle the boxes right in the rendered note:",
    "",
    "- [x] Ship the thing",
    "- [x] Tell everyone",
    "- [ ] Rest",
    "",
    "## Quotes",
    "",
    "> \"The palest ink is better than the best memory.\"",
    "",
    "## Code",
    "",
    "Inline `const x = 42;`, or fenced blocks with a language hint:",
    "",
    "```js",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
    "}",
    "```",
    "",
    "```python",
    "def total(items):",
    "    return sum(i.price for i in items)",
    "```",
    "",
    "## Tables",
    "",
    "| Feature | Supported | Notes |",
    "| --- | :---: | --- |",
    "| Headings | yes | `#` through `######` |",
    "| Tables | yes | like this one |",
    "| Task lists | yes | click to toggle |",
    "| Wikilinks | yes | `[[Note Title]]` |",
    "",
    "## Links",
    "",
    "- External links open in a new tab: [Inkwell design system](https://github.com/vscarpenter/inkwell)",
    "- Internal links use double brackets: [[Welcome to Scratchpad]]",
    "- And you can alias them: [[Welcome to Scratchpad|the welcome note]]",
    "",
    "That's the whole toolbox. Back to [[Welcome to Scratchpad]].",
    "",
  ].join("\n");

  const DAILY_BODY = [
    "## Tasks",
    "",
    "- [x] Skim the [[Welcome to Scratchpad]] note",
    "- [ ] Try creating a note of my own",
    "- [ ] Pin the notes I want to keep handy",
    "",
    "## Notes",
    "",
    "This is today's **daily note** — Scratchpad gives you a fresh one each day, so you always have a place for the day's thoughts. Open tomorrow's from the command palette (search \"today\").",
    "",
  ].join("\n");

  // Returns the three first-run notes. `now` (epoch ms) is stamped so ordering is
  // deterministic: Welcome (pinned) newest, then Markdown Guide, then the daily note.
  function buildFirstRunNotes(now) {
    const t = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
    const today = new Date(t);
    return [
      {
        id: uuid(),
        title: 'Welcome to Scratchpad',
        body: WELCOME_BODY,
        tags: ['getting-started', 'welcome'],
        pinned: true,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        lastDraftAt: null,
        dailyDate: null,
      },
      {
        id: uuid(),
        title: 'Markdown Guide',
        body: MARKDOWN_GUIDE_BODY,
        tags: ['reference', 'markdown'],
        pinned: false,
        createdAt: t,
        updatedAt: t - 1000,
        deletedAt: null,
        lastDraftAt: null,
        dailyDate: null,
      },
      {
        id: uuid(),
        title: today.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        body: DAILY_BODY,
        tags: ['daily'],
        pinned: false,
        createdAt: t,
        updatedAt: t - 2000,
        deletedAt: null,
        lastDraftAt: null,
        dailyDate: dayKey(today),
      },
    ];
  }

  window.ScratchpadSeed = { buildFirstRunNotes };
})();
