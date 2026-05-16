Claude Code Prompt: Build Scratchpad
Project overview
Build Scratchpad, a privacy-first, local-only web app for quick notes. Think "minimal Apple Notes in the browser." All data lives in the user's browser via IndexedDB. No backend, no accounts, no telemetry, no network calls for user data. The app will be hosted as static assets in AWS S3 behind CloudFront.
Tech stack and constraints

Pure static web app. HTML, CSS, vanilla JavaScript (or a lightweight framework if you have a strong reason, but default to vanilla). No build step required unless absolutely necessary.
Storage: IndexedDB only. Use the native API or a small wrapper like idb (~1KB). No localStorage for note content (size limits). No remote sync.
Hosting target: AWS S3 static website + CloudFront distribution. Output must be deployable as a folder of static files.
Markdown rendering: Use a small, well-maintained library. Recommended: marked for parsing and DOMPurify for sanitization. Ship them locally in public/js/vendor/, never load from a CDN at runtime.
Design system: Inkwell, applied strictly per the agent instructions linked below.
No analytics, no trackers, no external font loaders, no CDN dependencies at runtime.

Functional requirements
Layout
Two-pane layout, full viewport height:

Left sidebar (~300px fixed width): search box at the top, then a "New Note" button, then the list of notes. Pinned notes appear first under a "Pinned" section header, followed by all other notes under "Notes," both sorted by updatedAt descending. Each row shows the note title (first line, truncated), a small timestamp, a pin indicator if pinned, and any tags as small pills. Active note is visually marked.
Right pane: the selected note. Header shows the editable title, pin toggle, tag editor, and action buttons (Edit, Save, Delete). Body renders as rendered markdown in read mode and as a plain <textarea> in edit mode. Include an "unsaved changes" indicator when the editor is dirty.
Empty state when no notes exist: friendly prompt to create the first note.
Empty state when search returns no matches: clear "no results" message with a button to clear the search.
Responsive: on narrow viewports (<768px), sidebar collapses to a top list view, and selecting a note shows the editor full-screen with a back button.

Data model
Each note: { id (uuid), title, body, tags (string[]), pinned (boolean), createdAt, updatedAt }. Sidebar sort order: pinned first, then by updatedAt descending within each group.
Search and filter

Search box in the sidebar header. Matches against title, body, and tags (case-insensitive substring match). Debounce input by ~150ms.
Tag filtering: clicking a tag pill (in the sidebar row or in the editor) filters the list to notes with that tag. Show an active filter chip near the search box with an "x" to clear.
Search and tag filter compose: both apply together when active.
Clearing search and filters restores the full list.

Tags

Tags edit inline in the note header. Show existing tags as removable pills. An input field accepts new tags on Enter or , (comma). Normalize to lowercase, trim whitespace, dedupe per note.
Tags persist with the note in IndexedDB. No separate tag table needed; derive the global tag list from notes when rendering filter UI.

Pinning

Pin toggle in the note header (icon button using inline SVG). Persists pinned: true/false on the note.
Pinned notes group at the top of the sidebar under a "Pinned" eyebrow label. Unpinned notes follow under "Notes."

Markdown rendering

Read mode renders the body as markdown using marked. Sanitize the output with DOMPurify before inserting into the DOM. Never use innerHTML with unsanitized content.
Support standard CommonMark: headings, lists, links, code blocks, inline code, blockquotes, bold, italic, tables.
Style rendered markdown using Inkwell tokens only. Headings use var(--serif). Inline code and code blocks use var(--mono) and the .code-block component class where appropriate. Links use var(--accent).
Links open in a new tab with rel="noopener noreferrer".
Edit mode shows the raw markdown source in a .textarea. Toggle between modes via the Edit/Save buttons.

Behavior

Create, read, update, delete notes. All operations go to IndexedDB.
Title auto-derives from the first markdown heading or first non-empty line if the user does not set one explicitly.
No autosave on every keystroke; require explicit Save. Show an "unsaved changes" indicator when the editor is dirty.
Keyboard shortcuts:

Cmd/Ctrl + S: save the current note when editing
Cmd/Ctrl + N: create a new note
Cmd/Ctrl + K or /: focus the search box
Esc: clear search when search is focused, or exit edit mode without saving (with confirmation if dirty)


Confirm before delete using a native <dialog>.

Privacy

Add a small "About" or info link explaining: all data is stored locally in this browser, never sent anywhere, and will be lost if the user clears site data.
Include an "Export all notes (JSON)" and "Import notes (JSON)" pair so users can back up manually. Export includes tags and pin state.

Design system: Inkwell
Read and apply: https://raw.githubusercontent.com/vscarpenter/inkwell/main/agent-instructions.md
Follow it exactly. Specific requirements for Scratchpad:

Install via the default pure-CSS path. Fetch all four files (tokens.css, inkwell.css, inkwell-tokens.css, inkwell-components.css) into public/css/ and link inkwell.css from <head>. No Tailwind.
Use the Indigo & Cloud default palette. No variant files.
Page background --ivory, body text --slate. Body font var(--sans), headings var(--serif).
Use Inkwell components verbatim:

.btn with .btn-primary, .btn-secondary, .btn-ghost, .btn-danger for actions
.input for the search box and tag input
.textarea for the markdown editor
.field for labeled fields where applicable
.card for the note editor panel
.badge or .pill for tags in the sidebar and editor (pick one and stay consistent; .badge accent for tags reads well)
.empty-state for no-notes and no-search-results views
Native <dialog> styled by .dialog for delete confirmation
.kbd for displaying shortcuts in the About panel
.eyebrow (mono uppercase) for sidebar section labels ("Pinned," "Notes")


Borders use the --border token (1.5px). Internal dividers in the sidebar use --border-hair.
Active note row uses a subtle accent treatment (left edge stripe or --accent-tint background). No drop shadows, no lift.
Pin and delete icons are inline SVG strokes, never emoji.
Markdown content styling stays inside Inkwell's type and color scale. Do not introduce a parallel "prose" stylesheet.
Any custom CSS for the two-pane layout must reference Inkwell tokens only. No hardcoded hex values, no 1px or 2px outer borders, no Google Fonts, no gradients on surfaces.
Wire the theme toggle per §7 of the agent instructions, including the inline head script to prevent flash of incorrect theme. Persist preference in localStorage under key theme-preview.
Verify the app in both light and dark modes before considering it done.

Deliverables

Complete project folder ready to upload to S3.
index.html at the root.
public/css/ with the four Inkwell files.
public/js/ with app code, and public/js/vendor/ with marked and DOMPurify.
A short README.md covering: how to run locally (any static server), how to deploy to S3 + CloudFront (high level, including suggested cache headers: long cache for CSS/JS with content hashes if you add them, short cache for index.html), how data is stored, and a list of keyboard shortcuts.
No package.json unless you genuinely need one. If you do, keep dependencies to a minimum.

Verification before you finish

Create five notes with mixed tags. Pin two. Confirm pinned notes sort to the top in the sidebar.
Add markdown to a note (headings, list, code block, link, bold/italic). Confirm it renders correctly in read mode and is editable as raw markdown in edit mode.
Search by title, body content, and tag. Confirm results filter correctly and debounce feels snappy.
Click a tag pill. Confirm the list filters to that tag and the active filter chip appears. Clear it.
Combine search and tag filter. Confirm both apply.
Edit a note, refresh mid-edit without saving. Confirm the unsaved changes were not persisted.
Export JSON, clear IndexedDB, import the JSON. Notes, tags, and pin state all return.
Toggle theme through auto → light → dark. Layout and markdown rendering hold in all three.
Resize to mobile viewport. Sidebar collapses, search still works, editor opens full-screen.
Run through the Inkwell §11 verification checklist: no hardcoded hex codes, no 1px/2px outer borders, no webfonts, no gradients on surfaces, no second saturated accent, no emoji icons.
No console errors. No network requests after initial page load (verify in DevTools Network tab with cache disabled).

What to ask me first
Only ask if something is genuinely ambiguous. Reasonable defaults are fine for everything not specified above.
