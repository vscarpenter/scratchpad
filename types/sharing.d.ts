export type ShareNote = { id: string; title?: string; body?: string; tags?: string[]; updatedAt?: number };
export type SharePayload = { v: number; title: string; body: string; tags: string[]; updatedAt?: number };
export type Envelope = { v: number; ciphertext: string; iv: string };
export type PendingUpdate = Envelope & {
  expectedRevision: number;
  operationId: string;
  fingerprint: string;
  titleAtShare: string;
};
export type Share = {
  id: string;
  noteId: string;
  key: string;
  revokeToken: string;
  sharedAt: number;
  expiresAt: number;
  titleAtShare: string;
  revision?: number;
  publishedAt?: number;
  publishedContentHash?: string;
  pendingUpdate?: PendingUpdate | null;
  publicationState?: string | null;
};
export type ShareDatabase = {
  getSharesForNote(id: string): Promise<Share[]>;
  getShare(id: string): Promise<Share | undefined>;
  putShare(share: Share): Promise<unknown>;
  removeShare(id: string): Promise<unknown>;
  patchShare(id: string, changes: Partial<Share>, operationId?: string): Promise<boolean>;
};
export type ShareCrypto = {
  generateShareKey(): Promise<CryptoKey>;
  exportShareKey(key: CryptoKey): Promise<string>;
  importShareKey(text: string): Promise<CryptoKey>;
  encryptShare(note: SharePayload, key: CryptoKey): Promise<Envelope>;
  decryptShare(envelope: Envelope, key: CryptoKey): Promise<SharePayload>;
};
export type ShareManager = {
  init(api: { db: ShareDatabase; crypto: ShareCrypto }): void;
  fingerprint(note: Pick<SharePayload, 'title' | 'body' | 'tags'>): Promise<string>;
  payload(note: ShareNote): SharePayload;
  url(share: Share): string;
  create(note: ShareNote, expiresDays: number): Promise<Share>;
  publish(note: ShareNote, share: Share): Promise<void>;
  review(share: Share): Promise<SharePayload>;
  revoke(share: Share): Promise<boolean>;
};
export type ShareControlsDeps = {
  manager: ShareManager;
  db: ShareDatabase;
  note(): ShareNote | null;
  getNote(id: string): Promise<ShareNote | undefined>;
  dirty(): boolean;
  refreshShared(): Promise<void>;
  render(): void;
  toast(message: string): void;
  busy(key: string, triggers: HTMLButtonElement[], failure: string, task: () => Promise<void>): Promise<unknown>;
  renderMarkdown(container: HTMLElement, markdown: string): void;
};
