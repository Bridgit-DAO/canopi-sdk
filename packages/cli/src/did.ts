/**
 * DID sign-in for the CLI: make a did:key, link it to your Canopi account, and sign in with it without a browser.
 * The server side is /api/auth/did (Canopi spec intent/did-sign-in, slice a). A proof is a compact JWS (EdDSA)
 * over { iss: <did>, aud, nonce, purpose, iat, exp }, signed for the audience the server's challenge names.
 *
 * Keys stay on this machine: `keygen` writes a PKCS#8 PEM file with mode 0600, and only signatures are sent.
 * Signing goes through `Signer`, so a later version can sign with ssh-agent, a hardware key or a vault.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CanopiClient } from './client.js';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_MULTICODEC = Buffer.from([0xed, 0x01]);

export type DidPurpose = 'link' | 'signin';

/** Anything that can sign bytes for one DID. */
export interface Signer {
  did: string;
  sign(bytes: Buffer): Buffer;
}

export type LinkedDid = {
  id: string;
  did: string;
  method: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type Challenge = { nonce: string; aud: string; purpose: DidPurpose; expiresAt: string };

export function base58Encode(buf: Buffer): string {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros += 1;
  const digits: number[] = [];
  for (let k = zeros; k < buf.length; k += 1) {
    let carry = buf[k];
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += BASE58[digits[i]];
  return out;
}

/** The did:key for a raw 32-byte Ed25519 public key. */
export function didKeyFromPublicKey(raw: Buffer): string {
  if (raw.length !== 32) throw new Error('Ed25519 public key must be 32 bytes');
  return `did:key:z${base58Encode(Buffer.concat([ED25519_MULTICODEC, raw]))}`;
}

function didForPrivateKey(privateKey: crypto.KeyObject): string {
  const jwk = crypto.createPublicKey(privateKey).export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('Not an Ed25519 key');
  return didKeyFromPublicKey(Buffer.from(jwk.x, 'base64url'));
}

/** A Signer backed by an Ed25519 key file (PKCS#8 PEM). */
export function fileSigner(keyFile: string): Signer {
  const pem = fs.readFileSync(keyFile, 'utf8');
  const privateKey = crypto.createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The key file must hold an Ed25519 private key');
  const did = didForPrivateKey(privateKey);
  return { did, sign: (bytes) => crypto.sign(null, bytes, privateKey) };
}

/**
 * Make an Ed25519 key file (mode 0600) and return its did:key. Refuses to overwrite an existing file.
 */
export function keygen(outFile: string): { did: string; keyFile: string } {
  const keyFile = path.resolve(outFile);
  if (fs.existsSync(keyFile)) throw new Error(`${keyFile} already exists; choose another --out`);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  fs.writeFileSync(keyFile, pem, { mode: 0o600, flag: 'wx' });
  fs.chmodSync(keyFile, 0o600);
  return { did: didForPrivateKey(privateKey), keyFile };
}

/** The compact JWS the server verifies. */
export function makeProof(signer: Signer, challenge: Challenge, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const kid = `${signer.did}#${signer.did.slice('did:key:'.length)}`;
  const h = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      iss: signer.did,
      aud: challenge.aud,
      nonce: challenge.nonce,
      purpose: challenge.purpose,
      iat: nowSeconds,
      exp: nowSeconds + 300,
    }),
  ).toString('base64url');
  const s = signer.sign(Buffer.from(`${h}.${p}`, 'ascii')).toString('base64url');
  return `${h}.${p}.${s}`;
}

async function challenge(client: CanopiClient, purpose: DidPurpose): Promise<Challenge> {
  return client.request<Challenge>('/api/auth/did/challenge', { method: 'POST', auth: purpose === 'link', body: { purpose } });
}

/** Link the signer's DID to the signed-in account. */
export async function linkDid(client: CanopiClient, signer: Signer, label?: string): Promise<LinkedDid> {
  const ch = await challenge(client, 'link');
  const body: { proof: string; label?: string } = { proof: makeProof(signer, ch) };
  if (label !== undefined) body.label = label;
  const out = await client.request<{ did: LinkedDid }>('/api/auth/did/link', { method: 'POST', auth: true, body });
  return out.did;
}

export type DidSignIn = {
  embedToken: string;
  user: { id: string; handle?: string | null; name?: string | null; displayName?: string | null };
};

/** Sign in with the signer's DID. No browser and no stored token needed. */
export async function signInWithDid(client: CanopiClient, signer: Signer): Promise<DidSignIn> {
  const ch = await challenge(client, 'signin');
  return client.request<DidSignIn>('/api/auth/did/signin', {
    method: 'POST',
    auth: false,
    body: { proof: makeProof(signer, ch), client: 'cli' },
  });
}

export async function listDids(client: CanopiClient): Promise<LinkedDid[]> {
  const out = await client.request<{ dids: LinkedDid[] }>('/api/auth/did', { auth: true });
  return out.dids;
}

export async function renameDid(client: CanopiClient, id: string, label: string): Promise<LinkedDid> {
  const out = await client.request<{ did: LinkedDid }>(`/api/auth/did/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body: { label },
  });
  return out.did;
}

export async function removeDid(client: CanopiClient, id: string): Promise<{ removed: boolean }> {
  return client.request<{ removed: boolean }>(`/api/auth/did/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
}
