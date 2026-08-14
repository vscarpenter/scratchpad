// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

/**
 * ScratchpadCrypto is the single crypto module behind both encrypted backups
 * and note sharing. A shared note's confidentiality rests entirely on these
 * functions, so they get direct tests rather than only being covered through
 * the UI that calls them.
 */
test.describe('ScratchpadCrypto share primitives', () => {
  test('encrypt/decrypt roundtrip preserves the payload', async ({ page }) => {
    await gotoApp(page);
    const result = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const payload = { v: 1, title: 'Hi', body: '# Heading\n\ntext', tags: ['a'], updatedAt: 42 };
      const envelope = await C.encryptShare(payload, key);
      return { envelope, decrypted: await C.decryptShare(envelope, key) };
    });
    expect(result.decrypted).toEqual({ v: 1, title: 'Hi', body: '# Heading\n\ntext', tags: ['a'], updatedAt: 42 });
    expect(result.envelope.v).toBe(1);
    expect(typeof result.envelope.ciphertext).toBe('string');
    expect(typeof result.envelope.iv).toBe('string');
  });

  test('ciphertext does not contain the plaintext', async ({ page }) => {
    await gotoApp(page);
    const envelope = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      return C.encryptShare({ v: 1, title: 'SUPERSECRET', body: 'SUPERSECRET', tags: [], updatedAt: 0 }, key);
    });
    expect(envelope.ciphertext).not.toContain('SUPERSECRET');
    expect(atob(envelope.ciphertext)).not.toContain('SUPERSECRET');
  });

  test('each share gets a fresh IV', async ({ page }) => {
    await gotoApp(page);
    const ivs = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const payload = { v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 };
      const a = await C.encryptShare(payload, key);
      const b = await C.encryptShare(payload, key);
      return [a.iv, b.iv];
    });
    expect(ivs[0]).not.toBe(ivs[1]);
  });

  test('the wrong key fails to decrypt', async ({ page }) => {
    await gotoApp(page);
    const failed = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const envelope = await C.encryptShare(
        { v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 },
        await C.generateShareKey()
      );
      try {
        await C.decryptShare(envelope, await C.generateShareKey());
        return false;
      } catch {
        return true;
      }
    });
    expect(failed).toBe(true);
  });

  test('a tampered ciphertext fails the authentication tag', async ({ page }) => {
    await gotoApp(page);
    const failed = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const envelope = await C.encryptShare({ v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 }, key);
      const bytes = C.base64ToBytes(envelope.ciphertext);
      bytes[0] = bytes[0] ^ 0xff;
      try {
        await C.decryptShare({ ...envelope, ciphertext: C.bytesToBase64(bytes) }, key);
        return false;
      } catch {
        return true;
      }
    });
    expect(failed).toBe(true);
  });

  test('a tampered IV fails to decrypt', async ({ page }) => {
    await gotoApp(page);
    const failed = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const envelope = await C.encryptShare({ v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 }, key);
      const iv = C.base64ToBytes(envelope.iv);
      iv[0] = iv[0] ^ 0xff;
      try {
        await C.decryptShare({ ...envelope, iv: C.bytesToBase64(iv) }, key);
        return false;
      } catch {
        return true;
      }
    });
    expect(failed).toBe(true);
  });

  test('a malformed envelope is rejected before any crypto work', async ({ page }) => {
    await gotoApp(page);
    const rejections = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const good = await C.encryptShare({ v: 1, title: 't', body: 'b', tags: [], updatedAt: 0 }, key);
      const attempt = async (envelope) => {
        try {
          await C.decryptShare(envelope, key);
          return false;
        } catch {
          return true;
        }
      };
      return {
        missing: await attempt(null),
        wrongVersion: await attempt({ ...good, v: 2 }),
        noCiphertext: await attempt({ v: 1, iv: good.iv }),
        shortIv: await attempt({ ...good, iv: C.bytesToBase64(new Uint8Array(8)) }),
      };
    });
    expect(rejections).toEqual({ missing: true, wrongVersion: true, noCiphertext: true, shortIv: true });
  });

  test('key export/import roundtrips and rejects malformed text', async ({ page }) => {
    await gotoApp(page);
    const result = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      const key = await C.generateShareKey();
      const exported = await C.exportShareKey(key);
      const envelope = await C.encryptShare({ v: 1, title: 'ok', body: '', tags: [], updatedAt: 0 }, key);
      const decrypted = await C.decryptShare(envelope, await C.importShareKey(exported));
      const rejects = async (text) => {
        try {
          await C.importShareKey(text);
          return false;
        } catch {
          return true;
        }
      };
      return {
        exported,
        title: decrypted.title,
        rejectsShort: await rejects('too-short'),
        rejectsNonBase64Url: await rejects('!'.repeat(43)),
        rejectsEmpty: await rejects(''),
        rejectsMissing: await rejects(undefined),
      };
    });
    expect(result.exported).toHaveLength(43);
    expect(result.exported).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.title).toBe('ok');
    expect(result.rejectsShort).toBe(true);
    expect(result.rejectsNonBase64Url).toBe(true);
    expect(result.rejectsEmpty).toBe(true);
    expect(result.rejectsMissing).toBe(true);
  });

  // CloudFront's Origin Access Control signs origin requests with SigV4, which
  // requires the viewer to supply the hex SHA-256 of any request body in the
  // x-amz-content-sha256 header. Known vectors, because a wrong hash here means
  // every share upload is rejected at the edge.
  test('sha256Hex matches the published SHA-256 vectors', async ({ page }) => {
    await gotoApp(page);
    const hashes = await page.evaluate(async () => {
      const C = window.ScratchpadCrypto;
      return {
        empty: await C.sha256Hex(''),
        abc: await C.sha256Hex('abc'),
        unicode: await C.sha256Hex('héllo → ✓'),
        repeat: await C.sha256Hex('abc'),
      };
    });
    expect(hashes.empty).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hashes.abc).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashes.abc).toBe(hashes.repeat);
    expect(hashes.unicode).toMatch(/^[0-9a-f]{64}$/);
  });

  test('base64url encoding survives bytes that need URL-safe substitution', async ({ page }) => {
    await gotoApp(page);
    const ok = await page.evaluate(() => {
      const C = window.ScratchpadCrypto;
      // 0xfb 0xff produce '+' and '/' in standard base64, the two characters
      // the URL-safe alphabet has to replace.
      const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x10, 0x83]);
      const encoded = C.bytesToBase64Url(bytes);
      const decoded = C.base64UrlToBytes(encoded);
      return {
        urlSafe: !/[+/=]/.test(encoded),
        roundTrip: Array.from(decoded).join(',') === Array.from(bytes).join(','),
      };
    });
    expect(ok).toEqual({ urlSafe: true, roundTrip: true });
  });
});
