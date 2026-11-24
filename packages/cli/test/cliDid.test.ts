// @vitest-environment node
/**
 * DID sign-in in the CLI (src/did.ts; Canopi spec intent/did-sign-in §3.4). Against a fake API that checks proofs
 * the way the server does (Ed25519 over the compact JWS, iss/aud/nonce/purpose):
 *  - keygen writes an Ed25519 key file with mode 0600 and refuses to overwrite;
 *  - the did:key matches the W3C test vector encoding;
 *  - link → list → sign in (no stored token) → rename → remove round trip hits the documented routes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CanopiClient } from '../src/client';
import { didKeyFromPublicKey, fileSigner, keygen, linkDid, listDids, makeProof, removeDid, renameDid, signInWithDid } from '../src/did';

const BASE = 'https://api.example.test';
const AUD = 'https://api.example.test';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function base58Decode(text: string): Buffer {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes: number[] = [];
  for (const ch of text) {
    let carry = A.indexOf(ch);
    for (let i = 0; i < bytes.length; i += 1) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of text) { if (ch !== '1') break; bytes.push(0); }
  return Buffer.from(bytes.reverse());
}

/** Verify a proof as the server does; returns the payload or throws. */
function verify(proof: string, purpose: string, nonces: Set<string>) {
  const [h, p, s] = proof.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  expect(header.alg).toBe('EdDSA');
  const did = header.kid.split('#')[0];
  expect(header.kid).toBe(`${did}#${did.slice(8)}`);
  const raw = base58Decode(did.slice('did:key:z'.length)).subarray(2);
  const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
  expect(crypto.verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))).toBe(true);
  expect(payload).toMatchObject({ iss: did, aud: AUD, purpose });
  expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
  expect(nonces.delete(payload.nonce)).toBe(true);
  return payload;
}

function fakeApi() {
  const nonces = new Set<string>();
  const linked = new Map<string, { id: string; did: string; label: string | null }>();
  const calls: string[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const method = init.method || 'GET';
    const headers = (init.headers || {}) as Record<string, string>;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const authed = !!(headers.Authorization || headers.authorization);
    calls.push(`${method} ${u.pathname}${authed ? ' (auth)' : ''}`);
    if (u.pathname === '/api/auth/did/challenge') {
      const nonce = crypto.randomBytes(32).toString('base64url');
      nonces.add(nonce);
      return json(200, { nonce, aud: AUD, purpose: body.purpose, expiresAt: new Date(Date.now() + 300000).toISOString() });
    }
    if (u.pathname === '/api/auth/did/link') {
      const pl = verify(body.proof, 'link', nonces);
      const row = { id: crypto.randomUUID(), did: pl.iss, label: body.label ?? null };
      linked.set(row.id, row);
      return json(201, { did: { ...row, method: 'key', createdAt: 'now', lastUsedAt: null } });
    }
    if (u.pathname === '/api/auth/did/signin') {
      const pl = verify(body.proof, 'signin', nonces);
      if (![...linked.values()].some((r) => r.did === pl.iss)) return json(401, { error: 'DID_NOT_LINKED', code: 'DID_NOT_LINKED' });
      return json(200, { embedToken: 'payload.sig', user: { id: 'u-1', handle: 'falstaff', displayName: 'John Falstaff' } });
    }
    if (u.pathname === '/api/auth/did' && method === 'GET') {
      return json(200, { dids: [...linked.values()].map((r) => ({ ...r, method: 'key', createdAt: 'now', lastUsedAt: null })) });
    }
    const m = /^\/api\/auth\/did\/([^/]+)$/.exec(u.pathname);
    if (m && method === 'PATCH') {
      const row = linked.get(m[1]);
      if (!row) return json(404, { code: 'NOT_FOUND' });
      row.label = body.label;
      return json(200, { did: { ...row, method: 'key', createdAt: 'now', lastUsedAt: null } });
    }
    if (m && method === 'DELETE') return json(linked.delete(m[1]) ? 200 : 404, { removed: true });
    return json(404, {});
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('canopi did', () => {
  it('keygen writes an Ed25519 key with mode 0600, prints its did:key, and never overwrites', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-did-'));
    const out = path.join(dir, 'k.pem');
    const { did, keyFile } = keygen(out);
    expect(did).toMatch(/^did:key:z6Mk/);
    expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
    expect(fileSigner(keyFile).did).toBe(did);
    expect(() => keygen(out)).toThrow(/already exists/);
  });

  it('encodes did:key as the W3C test vector does', () => {
    const vectorMultibase = 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
    const raw = base58Decode(vectorMultibase.slice(1)).subarray(2);
    expect(didKeyFromPublicKey(raw)).toBe(['did', 'key', vectorMultibase].join(':'));
  });

  it('makes a proof for the audience and nonce the challenge names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-did-'));
    const signer = fileSigner(keygen(path.join(dir, 'k.pem')).keyFile);
    const nonces = new Set(['n'.repeat(43)]);
    const pl = verify(makeProof(signer, { nonce: 'n'.repeat(43), aud: AUD, purpose: 'signin', expiresAt: '' }), 'signin', nonces);
    expect(pl.iss).toBe(signer.did);
  });

  it('link → list → sign in without a token → rename → remove', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-did-'));
    const signer = fileSigner(keygen(path.join(dir, 'k.pem')).keyFile);
    const { impl, calls } = fakeApi();
    const signedIn = new CanopiClient({ baseUrl: BASE, token: 'payload.sig', userId: 'u-1' }, { fetchImpl: impl });
    const anonymous = new CanopiClient({ baseUrl: BASE }, { fetchImpl: impl });

    const row = await linkDid(signedIn, signer, 'laptop');
    expect(row).toMatchObject({ did: signer.did, label: 'laptop' });
    expect((await listDids(signedIn)).map((d) => d.id)).toEqual([row.id]);

    const result = await signInWithDid(anonymous, signer);
    expect(result).toMatchObject({ embedToken: 'payload.sig', user: { id: 'u-1', handle: 'falstaff' } });

    expect((await renameDid(signedIn, row.id, 'YubiKey')).label).toBe('YubiKey');
    expect(await removeDid(signedIn, row.id)).toMatchObject({ removed: true });
    await expect(signInWithDid(anonymous, signer)).rejects.toThrow();

    expect(calls.slice(0, 6)).toEqual([
      'POST /api/auth/did/challenge (auth)',
      'POST /api/auth/did/link (auth)',
      'GET /api/auth/did (auth)',
      'POST /api/auth/did/challenge',
      'POST /api/auth/did/signin',
      `PATCH /api/auth/did/${row.id} (auth)`,
    ]);
  });
});
