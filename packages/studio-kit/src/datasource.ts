/**
 * The data-source seam: one interface whether the data comes from Studio's mock endpoint, the
 * partner's live API, or the fixtures in memory. Going live is a descriptor change, not a code change.
 */
import type { DataSourceDescriptor, Fixture } from './types.js';

export interface DataSource {
  id: string;
  fetch(params?: Record<string, string>): Promise<unknown>;
  /** The response's JSON Schema (the descriptor's `schema`), when known: the renderers read field types, titles and formats from it. */
  schema?: Record<string, unknown>;
}

const withSchema = (src: DataSource, schema: unknown): DataSource =>
  (schema && typeof schema === 'object' && !Array.isArray(schema) ? { ...src, schema: schema as Record<string, unknown> } : src);

export class DataSourceError extends Error {
  constructor(public readonly sourceId: string, public readonly status: number | null, message: string) {
    super(message);
    this.name = 'DataSourceError';
  }
}

export interface DataSourceOptions {
  /** `.../v1/studio/projects/:id/mock`; the source id is appended. Needed for mode "mock". */
  mockBaseUrl?: string;
  /** Injected fetch (tests, or a host that proxies). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * The fixture that answers `params`: the one whose params all match with the most keys, else
 * the first without params, else the first. The mock server uses the same rule.
 */
export function pickFixture(fixtures: Fixture[] | undefined, params: Record<string, string> = {}): Fixture | undefined {
  if (!fixtures || fixtures.length === 0) return undefined;
  let best: Fixture | undefined;
  let bestKeys = 0;
  for (const f of fixtures) {
    const keys = Object.entries(f.params ?? {});
    if (keys.length === 0) continue;
    if (keys.every(([k, v]) => params[k] === v) && keys.length > bestKeys) { best = f; bestKeys = keys.length; }
  }
  return best ?? fixtures.find((f) => !f.params || Object.keys(f.params).length === 0) ?? fixtures[0];
}

/** Fill `{name}` placeholders, URL-encoding each value; unknown names become empty. */
export function fillTemplate(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => encodeURIComponent(params[name] ?? ''));
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** A source that answers straight from its fixtures (tests, offline preview, `static` sources). */
export function createMemoryDataSource(descriptor: Pick<DataSourceDescriptor, 'id' | 'fixtures'> & { schema?: unknown }, opts: { delayMs?: number } = {}): DataSource {
  return withSchema({
    id: descriptor.id,
    async fetch(params) {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const f = pickFixture(descriptor.fixtures, params);
      if (!f) throw new DataSourceError(descriptor.id, null, `source "${descriptor.id}" has no fixtures`);
      return clone(f.response);
    },
  }, descriptor.schema);
}

async function request(id: string, f: typeof fetch, url: string, method: string, params: Record<string, string>): Promise<unknown> {
  const init: RequestInit = { method, credentials: 'omit', headers: { accept: 'application/json' } };
  if (method === 'POST') {
    init.headers = { accept: 'application/json', 'content-type': 'application/json' };
    init.body = JSON.stringify(params);
  }
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    throw new DataSourceError(id, null, `source "${id}" unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new DataSourceError(id, res.status, `source "${id}" answered ${res.status}`);
  return res.json();
}

/**
 * mode "mock": `GET|POST {mockBaseUrl}/{id}` (GET sends params as the query string, POST as a JSON body).
 * mode "live": the descriptor's urlTemplate, filled with params, re-based onto `live.baseUrl`.
 * Kinds "static" and "bridge" answer from fixtures (bridge data reaches a tab through tags.list).
 * No credentials are sent: a sandboxed tablication has none, and the partner sees `Origin: null`.
 */
export function createDataSource(descriptor: DataSourceDescriptor, opts: DataSourceOptions = {}): DataSource {
  if (descriptor.kind === 'static' || descriptor.kind === 'bridge') return createMemoryDataSource(descriptor);
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const method = descriptor.request?.method === 'POST' ? 'POST' : 'GET';
  const id = descriptor.id;

  if (descriptor.mode === 'mock') {
    if (!opts.mockBaseUrl) throw new DataSourceError(id, null, `source "${id}" is mock: mockBaseUrl is required`);
    const base = `${opts.mockBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;
    return withSchema({
      id,
      fetch(params = {}) {
        const qs = method === 'GET' ? new URLSearchParams(params).toString() : '';
        return request(id, f, qs ? `${base}?${qs}` : base, method, params);
      },
    }, descriptor.schema);
  }

  const live = descriptor.live;
  if (!live || !live.baseUrl) throw new DataSourceError(id, null, `source "${id}" is live but has no live.baseUrl`);
  return withSchema({
    id,
    fetch(params = {}) {
      const filled = new URL(fillTemplate(descriptor.request.urlTemplate, params), live.baseUrl);
      const url = new URL(filled.pathname + filled.search, live.baseUrl);
      if (live.host && url.hostname !== live.host) {
        return Promise.reject(new DataSourceError(id, null, `source "${id}" resolved to ${url.hostname}, not ${live.host}`));
      }
      return request(id, f, url.toString(), method, params);
    },
  }, descriptor.schema);
}
