// @ts-check
/* Templates folder: notes in a folder named "Templates" seed new notes from the command palette. */
{
  ('use strict');

  /** @typedef {{ id: string, title?: string, body?: string, tags?: string[], folderId?: string | null, archivedAt?: number | null, deletedAt?: number | null }} TemplateNote */
  /** @typedef {{ id: string, name: string }} TemplateFolder */
  /** @typedef {{ notes(): TemplateNote[], folders(): TemplateFolder[], filingFolderId(): string | null, isDailyNotesFolder(id: string): boolean, folderById(id: string): TemplateFolder | null | undefined, uuid(): string, now(): number, normalizeNote(note: object): TemplateNote, putNoteRecord(note: TemplateNote): Promise<unknown>, addNote(note: TemplateNote): void, openNote(id: string): void, deriveTitle(note: TemplateNote): string, toast(message: string): void }} Deps */
  /** @typedef {{ id: string, label: string, meta: string, keywords: string, run(): void }} Command */

  const FOLDER_NAME = 'templates';
  const GUIDANCE = 'Add notes to a folder named “Templates” to use them here.';
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

  /** @returns {Command[]} */
  function commands() {
    if (!deps) return [];
    const api = deps;
    const folder = templatesFolder(api.folders());
    const templates = folder ? templateNotes(api, folder) : [];
    if (!folder || !templates.length) return [guidanceCommand(api)];
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

  /** @type {Window & typeof globalThis & { ScratchpadTemplates?: object }} */
  const root = window;
  root.ScratchpadTemplates = Object.freeze({ init, commands, templatesFolder });
}
