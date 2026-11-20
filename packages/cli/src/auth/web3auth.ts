import crypto from 'node:crypto';
import { openBrowser, sleep } from '../util.js';

const RELAY_ID_RE = /^[a-zA-Z0-9_-]{16,96}$/;

export type RelayAuthPayload = {
  type: string;
  user?: {
    id?: string;
    userId?: string;
    name?: string;
    handle?: string;
    email?: string;
  };
  embedToken?: string | null;
};

export type LoginResult = {
  ok: true;
  userId: string;
  embedToken: string;
  userName?: string;
  userHandle?: string;
  loginUrl: string;
  relayId: string;
};

function createRelayId(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function buildLoginUrl(baseUrl: string, relayId: string): string {
  const url = new URL('/embed/web3auth-popup.html', `${baseUrl.replace(/\/+$/, '')}/`);
  url.searchParams.set('relayId', relayId);
  url.searchParams.set('extensionId', 'canopi-cli');
  return url.toString();
}

async function pollExtensionRelay(
  baseUrl: string,
  relayId: string,
  timeoutMs: number,
  onTick?: (elapsedMs: number) => void
): Promise<RelayAuthPayload> {
  const deadline = Date.now() + timeoutMs;
  const pollUrl = `${baseUrl.replace(/\/+$/, '')}/api/auth/web3auth/extension-relay/${encodeURIComponent(relayId)}`;

  while (Date.now() < deadline) {
    onTick?.(timeoutMs - (deadline - Date.now()));
    const res = await fetch(pollUrl, { headers: { Accept: 'application/json' } });
    const body = (await res.json()) as {
      ok?: boolean;
      pending?: boolean;
      payload?: RelayAuthPayload;
      error?: string;
    };

    if (res.status === 202 || body.pending) {
      await sleep(1500);
      continue;
    }

    if (body.ok && body.payload?.type === 'CANOPI_AUTH_SUCCESS') {
      return body.payload;
    }

    if (!res.ok) {
      throw new Error(body.error || `Relay poll failed (${res.status})`);
    }

    await sleep(1500);
  }

  throw new Error('Sign-in timed out. Complete Web3Auth in the browser and try again.');
}

export async function loginViaWeb3AuthRelay(options: {
  baseUrl: string;
  openBrowser?: boolean;
  timeoutMs?: number;
  onStatus?: (message: string) => void;
}): Promise<LoginResult> {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const relayId = createRelayId();
  if (!RELAY_ID_RE.test(relayId)) {
    throw new Error('Internal error: invalid relay id');
  }

  const loginUrl = buildLoginUrl(baseUrl, relayId);
  options.onStatus?.(`Login URL: ${loginUrl}`);

  if (options.openBrowser !== false) {
    options.onStatus?.('Opening browser for Canopi sign-in…');
    try {
      openBrowser(loginUrl);
    } catch {
      options.onStatus?.('Could not open a browser automatically. Open the login URL manually.');
    }
  }

  options.onStatus?.('Waiting for Web3Auth (complete sign-in in the browser)…');

  let lastWaitLog = 0;
  const payload = await pollExtensionRelay(baseUrl, relayId, options.timeoutMs ?? 120_000, () => {
    const now = Date.now();
    if (now - lastWaitLog > 15_000) {
      lastWaitLog = now;
      options.onStatus?.('Still waiting…');
    }
  });

  const user = payload.user ?? {};
  const userId = String(user.id || user.userId || '').trim();
  const embedToken = String(payload.embedToken || '').trim();

  if (!userId || !embedToken) {
    throw new Error('Sign-in succeeded but embedToken or user id was missing from relay payload');
  }

  return {
    ok: true,
    userId,
    embedToken,
    userName: user.name,
    userHandle: user.handle,
    loginUrl,
    relayId,
  };
}

export async function refreshEmbedToken(baseUrl: string, token: string, userId: string): Promise<{
  embedToken: string;
  userId: string;
}> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/auth/refresh-embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ embedToken: token, userId }),
  });
  const body = (await res.json()) as { embedToken?: string; userId?: string; error?: string };
  if (!res.ok || !body.embedToken || !body.userId) {
    throw new Error(body.error || `Refresh failed (${res.status})`);
  }
  return { embedToken: body.embedToken, userId: body.userId };
}
