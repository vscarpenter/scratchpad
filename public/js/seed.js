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

  // Action first. The opening line has to be something the reader can do without
  // learning anything, so the list starts with a checkbox: ticking it in the
  // rendered note writes back to this Markdown and saves, which is the fastest
  // honest proof that the app works and asks nothing of them. Explanation comes
  // after the doing, and every item is optional.
  // No leading H1: the note's own title already renders above the body, and a
  // repeated heading is the first thing a newcomer would see.
  const WELCOME_BODY = [
    "No account, no setup, no save button to hunt for. This is an ordinary note and it is already yours — start with the box below.",
    "",
    "## Try these",
    "",
    "- [ ] Tick this box — it's an edit, and it saves itself",
    "- [ ] Press **Edit** to rewrite this note in your own words, then `Cmd/Ctrl + S`",
    "- [ ] Press `Cmd/Ctrl + N` and start something of your own",
    "- [ ] Open the [[Markdown Guide]] if you're new to Markdown",
    "- [ ] Press `Cmd/Ctrl + K` for every command and every note in one box",
    "",
    "## Where this lives",
    "",
    "Everything you write lives in *this browser* — no account, no sync, no servers. To prove it, open your browser's network tab: after the page loads, Scratchpad makes **zero** network calls.",
    "",
    "## Linking notes together",
    "",
    "Wrap a note's title in double brackets to link to it, like [[Markdown Guide]]. Link to a title that doesn't exist yet and it renders as a **dashed** link — click [[My First Note]] and Scratchpad offers to create it. That's how a web of notes grows.",
    "",
    "> These three starter notes are ordinary notes. Edit them, delete them, make the place yours. More about how it all works on the [About page](about.html).",
    "",
  ].join("\n");

  const MARKDOWN_GUIDE_BODY = [
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
