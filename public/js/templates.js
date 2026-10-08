// @ts-check
/* Templates folder: notes in a folder named "Templates" seed new notes from the command palette.
   With no templates yet, the palette offers to add the four starter templates instead. */
'use strict';
{
  /** @typedef {{ id: string, title?: string, body?: string, tags?: string[], folderId?: string | null, archivedAt?: number | null, deletedAt?: number | null }} TemplateNote */
  /** @typedef {{ id: string, name: string }} TemplateFolder */
  /** @typedef {{ notes(): TemplateNote[], folders(): TemplateFolder[], filingFolderId(): string | null, isDailyNotesFolder(id: string): boolean, folderById(id: string): TemplateFolder | null | undefined, uuid(): string, now(): number, normalizeNote(note: object): TemplateNote, putNoteRecord(note: TemplateNote): Promise<unknown>, addNote(note: TemplateNote): void, openNote(id: string): void, deriveTitle(note: TemplateNote): string, toast(message: string): void, createFolder(name: string): Promise<TemplateFolder | null>, rerender(): void }} Deps */
  /** @typedef {{ id: string, label: string, meta: string, keywords: string, run(): void }} Command */
  /** @typedef {{ buildStarterTemplates(now: number, folderId: string): object[] }} Seed */

  const FOLDER_NAME = 'templates';
  const GUIDANCE = 'Add notes to a folder named “Templates” to use them here.';
  /** @type {Window & typeof globalThis & { ScratchpadSeed?: Seed, ScratchpadTemplates?: object }} */
  const root = window;
  /** @type {Deps | null} */
  let deps = null;

  /** @param {TemplateFolder[]} folders */
  function templatesFolder(folders) {
    return (
      folders.find(
        (folder) =>
          String(folder.name || '')
            .trim()
            .toLowerCase() === FOLDER_NAME,
      ) || null
    );
  }

  /** @param {Deps} api @param {TemplateFolder} folder */
  function templateNotes(api, folder) {
    return api
      .notes()
      .filter((note) => note.folderId === folder.id && !note.archivedAt && !note.deletedAt)
      .sort((left, right) => api.deriveTitle(left).localeCompare(api.deriveTitle(right)));
  }

  /** @param {Deps} api @param {TemplateFolder} folder */
  function targetFolderId(api, folder) {
    const id = api.filingFolderId();
    if (!id || id === folder.id || api.isDailyNotesFolder(id) || !api.folderById(id)) return null;
    return id;
  }

  /** @param {Deps} api @param {TemplateNote} template @param {TemplateFolder} folder */
  async function createFrom(api, template, folder) {
    const t = api.now();
    const note = api.normalizeNote({
      id: api.uuid(),
      title: '',
      body: template.body || '',
      tags: [...(template.tags || [])],
      pinned: false,
      folderId: targetFolderId(api, folder),
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
      deletedAt: null,
      lastDraftAt: null,
    });
    await api.putNoteRecord(note);
    api.addNote(note);
    api.openNote(note.id);
    api.toast('New note from “' + api.deriveTitle(template) + '”');
  }

  /** Files the starter templates in the Templates folder, creating it when missing. @param {Deps} api @param {Seed} seed @param {TemplateFolder | null} existing */
  async function addStarters(api, seed, existing) {
    const folder = existing || (await api.createFolder('Templates'));
    if (!folder) return;
    for (const record of seed.buildStarterTemplates(api.now(), folder.id)) {
      const note = api.normalizeNote(record);
      await api.putNoteRecord(note);
      api.addNote(note);
    }
    api.rerender();
    api.toast('Added 4 starter templates to the Templates folder.');
  }

  /** @param {Deps} api @returns {Command} */
  function guidanceCommand(api) {
    return {
      id: 'new-from-template',
      label: 'New note from template…',
      meta: 'Put notes in a folder named Templates first',
      keywords: 'template templates new note',
      run: () => api.toast(GUIDANCE),
    };
  }

  /** The command shown while there are no templates. @param {Deps} api @param {TemplateFolder | null} folder @returns {Command} */
  function starterCommand(api, folder) {
    const seed = root.ScratchpadSeed;
    if (!seed) return guidanceCommand(api);
    return {
      id: 'add-starter-templates',
      label: 'Add starter templates',
      meta: folder ? 'Four notes in your Templates folder' : 'Four notes in a new Templates folder',
      keywords: 'template templates starter new note add',
      run: () => addStarters(api, seed, folder),
    };
  }

  /** @returns {Command[]} */
  function commands() {
    if (!deps) return [];
    const api = deps;
    const folder = templatesFolder(api.folders());
    const templates = folder ? templateNotes(api, folder) : [];
    if (!folder || !templates.length) return [starterCommand(api, folder)];
    return templates.map((template) => ({
      id: 'template-' + template.id,
      label: 'New note from template: ' + api.deriveTitle(template),
      meta: 'Templates folder',
      keywords: 'template templates new note ' + api.deriveTitle(template),
      run: () => createFrom(api, template, folder),
    }));
  }

  /** @param {Deps} api */
  function init(api) {
    deps = api;
  }

  root.ScratchpadTemplates = Object.freeze({ init, commands, templatesFolder });
}
