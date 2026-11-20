// @vitest-environment node
/**
 * The CLI once had no timeout, ignored Retry-After, and a retried
 * write could post twice or toggle a reaction off. Now every write carries one
 * Idempotency-Key reused by its retries; 429/503 honour Retry-After; timeouts retry.
 */
import { describe, expect, it } from 'vitest';
import { CanopiClient, parseRetryAfter, MAX_RETRIES } from '../src/client';
import { react } from '../src/agentApi';

const AGENT = { baseUrl: 'https://api.example.test', token: 'cag_test' };

function fakeFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('CLI retries', () => {
  it('parses Retry-After seconds and dates, capped', () => {
    expect(parseRetryAfter('3')).toBe(3);
    expect(parseRetryAfter('99999')).toBe(120);
    expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });

  it('a 429 is retried after Retry-After with the SAME Idempotency-Key', async () => {
    const f = fakeFetch([json(429, { error: 'agent_rate_limited' }, { 'Retry-After': '0' }), json(201, { id: 'm1' })]);
    const client = new CanopiClient(AGENT, { fetchImpl: f.impl });
    const out = await client.request('/api/messages', { method: 'POST', auth: true, body: { content: 'hi' } });
    expect(out).toEqual({ id: 'm1' });
    expect(f.calls).toHaveLength(2);
    const k1 = (f.calls[0].init.headers as Record<string, string>)['Idempotency-Key'];
    const k2 = (f.calls[1].init.headers as Record<string, string>)['Idempotency-Key'];
    expect(k1).toMatch(/^[0-9a-f-]{36}$/);
    expect(k2).toBe(k1);
  });

  it('two separate writes get different keys; reads get none', async () => {
    const f = fakeFetch([json(201, {}), json(201, {}), json(200, [])]);
    const client = new CanopiClient(AGENT, { fetchImpl: f.impl });
    await client.request('/api/messages', { method: 'POST', auth: true, body: {} });
    await client.request('/api/messages', { method: 'POST', auth: true, body: {} });
    await client.request('/api/messages');
    const keys = f.calls.map((c) => (c.init.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBeUndefined();
  });

  it('every attempt has a timeout signal; a network error is retried', async () => {
    const f = fakeFetch([() => { throw new TypeError('fetch failed'); }, json(200, { ok: true })]);
    const client = new CanopiClient(AGENT, { fetchImpl: f.impl });
    expect(await client.request('/x')).toEqual({ ok: true });
    expect(f.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  }, 10000);

  it('gives up after MAX_RETRIES and reports the status', async () => {
    const f = fakeFetch(Array.from({ length: MAX_RETRIES + 1 }, () => json(503, { error: 'down' }, { 'Retry-After': '0' })));
    const client = new CanopiClient(AGENT, { fetchImpl: f.impl });
    await expect(client.request('/x')).rejects.toMatchObject({ status: 503 });
    expect(f.calls).toHaveLength(MAX_RETRIES + 1);
  });

  it('a 400 is not retried', async () => {
    const f = fakeFetch([json(400, { error: 'bad' })]);
    const client = new CanopiClient(AGENT, { fetchImpl: f.impl });
    await expect(client.request('/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 400 });
    expect(f.calls).toHaveLength(1);
  });

  it('`react add` sets (toggle:false), so its retry cannot remove the reaction', async () => {
    const f = fakeFetch([json(200, { action: 'added' })]);
    await react(new CanopiClient(AGENT, { fetchImpl: f.impl }), 'm1', '❤️');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ messageId: 'm1', emoji: '❤️', toggle: false });
  });
});
