import type { AgentConfig } from './config.js';

import { randomUUID } from 'node:crypto';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Sent as Idempotency-Key. Writes get a fresh key per call, reused across its retries. */
  idempotencyKey?: string;
  /** Per-attempt timeout for this call (a long-poll waits longer than the default). */
  timeoutMs?: number;
};

/** Per-attempt timeout (ms). Override with CANOPI_TIMEOUT_MS. */
export const DEFAULT_TIMEOUT_MS = 20000;
/** Retries after the first attempt for 429/502/503/504, timeouts and network errors. */
export const MAX_RETRIES = 3;
/** Never wait longer than this for one Retry-After (s). */
export const MAX_RETRY_AFTER_S = 120;

/** Seconds to wait from a Retry-After header (delta-seconds or HTTP date), or null. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, MAX_RETRY_AFTER_S);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.min(Math.max(0, (at - now) / 1000), MAX_RETRY_AFTER_S);
  return null;
}

const RETRY_STATUSES = new Set([409, 429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CanopiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const detail =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : JSON.stringify(body);
    super(`HTTP ${status}: ${detail}`);
    this.name = 'CanopiHttpError';
  }
}

export type CanopiClientOptions = {
  clientId?: string;
  /** For tests: replaces global fetch. */
  fetchImpl?: typeof fetch;
};

export class CanopiClient {
  private readonly clientId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: AgentConfig,
    options: CanopiClientOptions = {},
  ) {
    this.clientId = options.clientId ?? 'canopi-cli';
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** Agent tokens (`cag_…`) identify the agent by themselves; no X-User-Id needed. */
  isAgentToken(): boolean {
    return typeof this.config.token === 'string' && this.config.token.startsWith('cag_');
  }

  requireAuth(): void {
    if (!this.config.token) {
      throw new Error(
        'Missing bearer token. Set CANOPI_TOKEN or pass --token (agent token cag_… or Canopi embed token).',
      );
    }
    if (this.isAgentToken()) return;
    if (!this.config.userId) {
      throw new Error(
        'Missing AppUser id. Set CANOPI_USER_ID or pass --user-id (must match embed token sub).',
      );
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path, `${this.config.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private headers(auth: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Canopi-Client': this.clientId,
    };
    if (auth) {
      this.requireAuth();
      headers.Authorization = `Bearer ${this.config.token}`;
      if (!this.isAgentToken()) headers['X-User-Id'] = this.config.userId!;
    } else if (this.isAgentToken()) {
      headers.Authorization = `Bearer ${this.config.token}`;
    } else if (this.config.token && this.config.userId) {
      // Optional auth on read paths (bookmarks, personalization)
      headers.Authorization = `Bearer ${this.config.token}`;
      headers['X-User-Id'] = this.config.userId;
    }
    return headers;
  }

  /**
   * Open a server-sent event stream (GET, signed in, no timeout: the caller's signal ends it). A non-2xx
   * answer throws CanopiHttpError with the parsed body. Nothing is retried here; streamEvent reconnects.
   */
  async openStream(
    path: string,
    opts: { query?: Record<string, string | number | undefined>; lastEventId?: string; signal?: AbortSignal } = {},
  ): Promise<Response> {
    const headers = this.headers(true);
    delete headers['Content-Type'];
    headers.Accept = 'text/event-stream';
    if (opts.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;
    const res = await this.fetchImpl(this.buildUrl(path, opts.query), { method: 'GET', headers, signal: opts.signal });
    if (!res.ok) {
      const text = await res.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      throw new CanopiHttpError(res.status, body);
    }
    return res;
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', auth = false, query, body } = options;
    const url = this.buildUrl(path, query);
    const headers = this.headers(auth);
    const isWrite = method !== 'GET';
    // One key per logical write, reused by every retry: the server replays instead of
    // posting twice or toggling a reaction back off (beta audit C-3).
    if (isWrite) headers['Idempotency-Key'] = options.idempotencyKey ?? randomUUID();
    const envTimeout = Number(process.env.CANOPI_TIMEOUT_MS) > 0 ? Number(process.env.CANOPI_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.max(envTimeout, options.timeoutMs ?? 0);

    for (let attempt = 0; ; attempt++) {
      const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
      if (body !== undefined) init.body = JSON.stringify(body);

      let res: Response;
      try {
        res = await this.fetchImpl(url, init);
      } catch (err) {
        // Timeout or network error: retry (a write is safe to repeat with its key).
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
        const name = err instanceof Error ? err.name : '';
        throw new CanopiHttpError(0, {
          error: name === 'TimeoutError' ? 'timeout' : 'network_error',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
      }

      if (!res.ok && RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        const wait = parseRetryAfter(res.headers.get('Retry-After'));
        await sleep(wait != null ? wait * 1000 : backoffMs(attempt));
        continue;
      }
      if (!res.ok) {
        throw new CanopiHttpError(res.status, parsed);
      }
      return parsed as T;
    }
  }
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt);
}
