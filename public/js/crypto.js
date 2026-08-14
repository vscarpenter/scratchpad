/* Scratchpad: crypto primitives shared by encrypted backups and note sharing.
   Exposes window.ScratchpadCrypto. No DOM access, no storage access. */
(function () {
  'use strict';

  const ENCRYPTED_BACKUP_FORMAT = 'scratchpad-encrypted-backup';
  const ENCRYPTED_BACKUP_VERSION = 1;
  const ENCRYPTED_BACKUP_ITERATIONS = 600000;

  const SHARE_VERSION = 1;
  const SHARE_KEY_BYTES = 32;
  const SHARE_IV_BYTES = 12;
  const SHARE_KEY_B64URL_LENGTH = 43;

  function bytesToBase64(bytes) {
    let value = '';
    for (let i = 0; i < bytes.length; i += 1) value += String.fromCharCode(bytes[i]);
    return btoa(value);
  }

  function base64ToBytes(value) {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
    return bytes;
  }

  // A share key travels in a URL fragment, so it uses the URL-safe alphabet
  // with padding stripped. The envelope itself stays on standard base64.
  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return base64ToBytes(padded + '==='.slice((padded.length + 3) % 4));
  }

  async function deriveBackupKey(passphrase, salt, usage) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ENCRYPTED_BACKUP_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }

  async function encryptBackupPayload(payload, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(passphrase, salt, 'encrypt');
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      format: ENCRYPTED_BACKUP_FORMAT,
      version: ENCRYPTED_BACKUP_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ENCRYPTED_BACKUP_ITERATIONS, salt: bytesToBase64(salt) },
      cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  function isEncryptedBackup(data) {
    return !!data && data.format === ENCRYPTED_BACKUP_FORMAT && data.version === ENCRYPTED_BACKUP_VERSION;
  }

  async function decryptBackupEnvelope(envelope, passphrase) {
    if (!isEncryptedBackup(envelope) || !envelope.kdf || !envelope.cipher ||
      envelope.kdf.iterations !== ENCRYPTED_BACKUP_ITERATIONS ||
      typeof envelope.kdf.salt !== 'string' || typeof envelope.cipher.iv !== 'string' ||
      typeof envelope.ciphertext !== 'string') {
      throw new Error('Invalid encrypted backup envelope');
    }
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encrypted backup parameters');
    const key = await deriveBackupKey(passphrase, salt, 'decrypt');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  // -------- Sharing --------
  // Unlike a backup key, a share key is random rather than passphrase-derived:
  // there is no passphrase to remember because the key itself is the link.

  function generateShareKey() {
    return crypto.subtle.importKey(
      'raw',
      crypto.getRandomValues(new Uint8Array(SHARE_KEY_BYTES)),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async function exportShareKey(key) {
    return bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
  }

  async function importShareKey(text) {
    if (typeof text !== 'string' || text.length !== SHARE_KEY_B64URL_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(text)) {
      throw new Error('Invalid share key');
    }
    const bytes = base64UrlToBytes(text);
    if (bytes.length !== SHARE_KEY_BYTES) throw new Error('Invalid share key');
    return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function encryptShare(payload, key) {
    const iv = crypto.getRandomValues(new Uint8Array(SHARE_IV_BYTES));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      v: SHARE_VERSION,
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      iv: bytesToBase64(iv),
    };
  }

  async function decryptShare(envelope, key) {
    if (!envelope || envelope.v !== SHARE_VERSION ||
      typeof envelope.ciphertext !== 'string' || typeof envelope.iv !== 'string') {
      throw new Error('Invalid share envelope');
    }
    const iv = base64ToBytes(envelope.iv);
    if (iv.length !== SHARE_IV_BYTES) throw new Error('Invalid share parameters');
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  window.ScratchpadCrypto = {
    bytesToBase64,
    base64ToBytes,
    bytesToBase64Url,
    base64UrlToBytes,
    isEncryptedBackup,
    encryptBackupPayload,
    decryptBackupEnvelope,
    generateShareKey,
    exportShareKey,
    importShareKey,
    encryptShare,
    decryptShare,
  };
})();
