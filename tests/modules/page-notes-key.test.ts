import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module shipped as-is in the tablication bundle (no types)
import { noteKeyFor, MAX_KEY_LENGTH } from '../../modules/page-notes/note-key.js';

// Mirrors the host check in canopi presence/src/sdk/tablicationHost.ts (storage.set).
const hostAccepts = (key: unknown) => typeof key === 'string' && key.length > 0 && key.length <= 100;

describe('page-notes storage keys', () => {
  it('keeps the readable key used by earlier versions when it fits', async () => {
    const url = 'https://example.com/a';
    expect(await noteKeyFor(url)).toBe(`note:${url}`);
  });

  it('keeps the readable key right at the limit', async () => {
    const url = 'https://example.com/' + 'x'.repeat(MAX_KEY_LENGTH - 'note:https://example.com/'.length);
    const key = await noteKeyFor(url);
    expect(key).toBe(`note:${url}`);
    expect(key.length).toBe(MAX_KEY_LENGTH);
  });

  it('hashes long URLs into a key the host accepts', async () => {
    const url = 'https://example.com/search?q=' + 'canopi '.repeat(60) + '&utm_source=newsletter';
    const key = await noteKeyFor(url);
    expect(key).toMatch(/^note:#[0-9a-f]{64}$/);
    expect(hostAccepts(key)).toBe(true);
  });

  it('is stable and distinguishes URLs', async () => {
    const a = 'https://example.com/' + 'a'.repeat(200);
    const b = 'https://example.com/' + 'a'.repeat(199) + 'b';
    expect(await noteKeyFor(a)).toBe(await noteKeyFor(a));
    expect(await noteKeyFor(a)).not.toBe(await noteKeyFor(b));
  });

  it('matches SHA-256 of the URL (UTF-8)', async () => {
    const url = 'https://example.com/ünïcode/' + 'p'.repeat(100);
    const { createHash } = await import('node:crypto');
    expect(await noteKeyFor(url)).toBe(`note:#${createHash('sha256').update(url, 'utf8').digest('hex')}`);
  });

  it('returns null without a URL', async () => {
    expect(await noteKeyFor('')).toBeNull();
    expect(await noteKeyFor(undefined)).toBeNull();
  });
});
