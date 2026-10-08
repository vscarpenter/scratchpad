export type DeskNote = {
  id: string;
  title?: string;
  body?: string;
  tags?: string[];
  pinned?: boolean;
  folderId?: string | null;
  updatedAt?: number;
  archivedAt?: number | null;
  deletedAt?: number | null;
};
export type DeskFolder = { id: string; name: string; color?: string | null };
export type DeskState = {
  notes: DeskNote[];
  selectedId: string | null;
  view: string;
  search: string;
  tagFilter: string | null;
  editing: boolean;
  dirty: boolean;
};
/** What the view needs to describe a note; app.js supplies these at init. */
export type DeskLookups = {
  deriveTitle(note: DeskNote): string;
  noteFolderId(note: DeskNote): string | null;
  folderById(id: string): DeskFolder | null;
  folderDisplayName(id: string | null): string;
  todayNote(): DeskNote | null;
};
export type DeskDeps = DeskLookups & {
  state: DeskState;
  seeded: boolean;
  now(): number;
  isArchived(note: DeskNote): boolean;
  isTrashed(note: DeskNote): boolean;
  createNote(): unknown;
  openNote(id: string): unknown;
  openToday(): unknown;
  openCapture(): unknown;
  openPalette(query: string): unknown;
  setFolderView(id: string | null, render?: boolean): unknown;
  clearFilters(): unknown;
  confirmDiscard(): Promise<boolean>;
  discardDraft(): Promise<unknown>;
};
export type DeskRefs = {
  root: HTMLElement;
  date: HTMLElement;
  greeting: HTMLElement;
  sub: HTMLElement;
  newNote: HTMLElement;
  today: HTMLElement;
  todayMeta: HTMLElement;
  capture: HTMLElement;
  template: HTMLElement;
  templateMeta: HTMLElement;
  pins: HTMLElement;
  pinsEmpty: HTMLElement;
  pinsMore: HTMLElement;
  layout: HTMLElement;
  chips: HTMLElement;
  recent: HTMLElement;
  noteIcon: HTMLTemplateElement;
};
/** Home's view state. render() returns a copy with a stale folder filter reset. */
export type DeskUi = { pinsExpanded: boolean; folderFilter: string; layout: 'list' | 'grid' };
export type DeskView = {
  ALL: string;
  render(api: DeskLookups, refs: DeskRefs, notes: DeskNote[], ui: DeskUi, nowMs: number): DeskUi;
  greetingFor(hour: number): string;
  whenLabel(ms: number, nowMs: number): string;
  excerptOf(body: string, title: string): string;
};
