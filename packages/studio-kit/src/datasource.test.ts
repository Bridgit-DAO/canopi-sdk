import { describe, expect, it, vi } from 'vitest';
import { createDataSource, createMemoryDataSource, fillTemplate, pickFixture } from './datasource.js';
import { loadSample } from './test-utils.js';
import type { DataSourceDescriptor } from './types.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fixtures', () => {
  it('pickFixture prefers the most specific match, then the param-less default', () => {
    const fx = [{ response: 'default' }, { params: { a: '1' }, response: 'a' }, { params: { a: '1', b: '2' }, response: 'ab' }];
    expect(pickFixture(fx, { a: '1', b: '2' })?.response).toBe('ab');
    expect(pickFixture(fx, { a: '1' })?.response).toBe('a');
    expect(pickFixture(fx, { a: '9' })?.response).toBe('default');
    expect(pickFixture([{ params: { a: '1' }, response: 'only' }], {})?.response).toBe('only');
    expect(pickFixture([], {})).toBeUndefined();
  });

  it('the memory source answers from fixtures with a copy', async () => {
    const src = loadSample().dataSources[0];
    const mem = createMemoryDataSource(src);
    const a = (await mem.fetch({ pageHost: 'www.northwind-outfitters.example' })) as { account: { name: string } };
    expect(a.account.name).toBe('Northwind Outfitters');
    a.account.name = 'changed';
    expect(((await mem.fetch({ pageHost: 'www.northwind-outfitters.example' })) as typeof a).account.name).toBe('Northwind Outfitters');
    expect(((await mem.fetch({})) as typeof a).account.name).toBe('Bluefin Analytics');
    await expect(createMemoryDataSource({ id: 'x', fixtures: [] }).fetch()).rejects.toThrow(/no fixtures/);
  });

  it('fillTemplate encodes values', () => {
    expect(fillTemplate('https://h.example/x?d={d}&e={missing}', { d: 'a b&c' })).toBe('https://h.example/x?d=a%20b%26c&e=');
  });
});

describe('createDataSource', () => {
  const src = (): DataSourceDescriptor => loadSample().dataSources[0];

  it('mock mode calls the Studio mock endpoint with params, no credentials', async () => {
    const f = vi.fn(async () => json({ account: { id: 'x' } }));
    const ds = createDataSource(src(), { mockBaseUrl: 'https://mock.studio.example/v1/studio/projects/p1/mock/', fetch: f as unknown as typeof fetch });
    expect(await ds.fetch({ pageHost: 'a.example' })).toEqual({ account: { id: 'x' } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://mock.studio.example/v1/studio/projects/p1/mock/src_account?pageHost=a.example');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit' });
    expect(() => createDataSource(src(), {})).toThrow(/mockBaseUrl/);
  });

  it('POST sources send params as a JSON body', async () => {
    const f = vi.fn(async () => json({ ok: 1 }));
    const d = { ...src(), request: { ...src().request, method: 'POST' as const } };
    await createDataSource(d, { mockBaseUrl: 'https://m.example/mock', fetch: f as unknown as typeof fetch }).fetch({ q: '1' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://m.example/mock/src_account');
    expect(init.body).toBe('{"q":"1"}');
  });

  it('live mode fills the urlTemplate onto live.baseUrl and checks the host', async () => {
    const f = vi.fn(async () => json({ account: {} }));
    const d = { ...src(), mode: 'live' as const, live: { baseUrl: 'https://eu.api.pineconecrm.example', host: 'eu.api.pineconecrm.example' } };
    await createDataSource(d, { fetch: f as unknown as typeof fetch }).fetch({ pageHost: 'www.x.example' });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://eu.api.pineconecrm.example/v1/accounts/lookup?domain=www.x.example');
    const wrong = { ...d, live: { baseUrl: 'https://other.example', host: 'eu.api.pineconecrm.example' } };
    await expect(createDataSource(wrong, { fetch: f as unknown as typeof fetch }).fetch()).rejects.toThrow(/not eu.api/);
    expect(() => createDataSource({ ...src(), mode: 'live', live: null })).toThrow(/live.baseUrl/);
  });

  it('HTTP errors and network failures reject with DataSourceError', async () => {
    const bad = createDataSource(src(), { mockBaseUrl: 'https://m.example/mock', fetch: (async () => json({}, 503)) as unknown as typeof fetch });
    await expect(bad.fetch()).rejects.toMatchObject({ name: 'DataSourceError', status: 503, sourceId: 'src_account' });
    const down = createDataSource(src(), { mockBaseUrl: 'https://m.example/mock', fetch: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch });
    await expect(down.fetch()).rejects.toThrow(/unreachable/);
  });

  it('static sources answer from fixtures in any mode', async () => {
    const d = { ...src(), kind: 'static' as const, mode: 'live' as const };
    expect(await createDataSource(d).fetch({})).toMatchObject({ account: { name: 'Bluefin Analytics' } });
  });
});
