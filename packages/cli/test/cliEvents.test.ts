// @vitest-environment node
/**
 * The event calls the CLI shares with the MCP servers
 * (src/agentApi.ts). Against a fake fetch:
 *  - list / show / plan (create) / rsvp / cancel / post_to_event hit the documented routes with the token;
 *  - attend (long-poll) passes the cursor and waits longer than the server holds the request;
 *  - the SSE stream yields items with their cursor and resumes with Last-Event-ID after a drop.
 */
import { describe, expect, it } from 'vitest';
import { CanopiClient } from '../src/client';
import {
  attendEvent, cancelEvent, getEvent, listEvents, parseSse, planEvent, postToEvent, rsvpEvent, streamEvent,
} from '../src/agentApi';

const AGENT = { baseUrl: 'https://api.example.test', token: 'cag_test' };
type Call = { url: string; method: string; headers: Record<string, string>; body?: any; timeout?: boolean };

function fake(respond: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const c: Call = {
      url: String(url), method: init.method || 'GET', headers: (init.headers || {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined, timeout: !!init.signal,
    };
    calls.push(c);
    return respond(c);
  }) as unknown as typeof fetch;
  return { client: new CanopiClient(AGENT, { fetchImpl: impl }), calls };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const path = (c: Call) => { const u = new URL(c.url); return u.pathname + u.search; };

describe('event calls shared by the CLI and MCP (S9)', () => {
  it('list, show, rsvp, cancel and post_to_event use the event routes with the agent token', async () => {
    const f = fake(() => json(200, { ok: true }));
    await listEvents(f.client, { url: 'https://example.org/a', communityIds: ['c1', 'c2'], status: ['scheduled', 'live'], limit: 5 });
    await getEvent(f.client, 'abcdefghij');
    await rsvpEvent(f.client, 'abcdefghij', 'going');
    await cancelEvent(f.client, 'abcdefghij');
    await postToEvent(f.client, 'abcdefghij', { text: 'hello', parentId: 'p1' });
    expect(f.calls.map((c) => `${c.method} ${path(c)}`)).toEqual([
      'GET /v1/events?url=https%3A%2F%2Fexample.org%2Fa&communityIds=c1%2Cc2&status=scheduled%2Clive&limit=5',
      'GET /v1/events/abcdefghij',
      'POST /v1/events/abcdefghij/rsvp',
      'DELETE /v1/events/abcdefghij',
      'POST /v1/events/abcdefghij/messages',
    ]);
    expect(f.calls.every((c) => c.headers.Authorization === 'Bearer cag_test')).toBe(true);
    expect(f.calls[2].body).toEqual({ rsvp: 'going' });
    expect(f.calls[4].body).toEqual({ text: 'hello', parentId: 'p1' });
    await expect(rsvpEvent(f.client, 'abcdefghij', 'yes' as any)).rejects.toThrow(/going, maybe or declined/);
    await expect(postToEvent(f.client, 'abcdefghij', { text: '  ' })).rejects.toThrow(/text is required/);
  });

  it('plan sends the event fields the API takes (camelCase), nothing else', async () => {
    const f = fake(() => json(201, { event: { slug: 'abcdefghij', status: 'draft' } }));
    const out = await planEvent(f.client, {
      title: 'Tides', url: 'https://example.org/tides', startsAt: '2026-12-03T17:00:00Z', endsAt: '2026-12-03T18:00:00Z',
      timezone: 'America/New_York', communityId: 'c1', conversation: 'room', agentPolicy: 'participate', note: 'for the reading group',
    });
    expect(out).toEqual({ event: { slug: 'abcdefghij', status: 'draft' } });
    expect(f.calls[0].method).toBe('POST');
    expect(path(f.calls[0])).toBe('/v1/events');
    expect(f.calls[0].body).toEqual({
      title: 'Tides', url: 'https://example.org/tides', startsAt: '2026-12-03T17:00:00Z', endsAt: '2026-12-03T18:00:00Z',
      timezone: 'America/New_York', communityId: 'c1', conversation: 'room', agentPolicy: 'participate', note: 'for the reading group',
    });
    expect(f.calls[0].headers['Idempotency-Key']).toBeTruthy();
  });

  it('attend (long-poll) passes since + wait; the client waits longer than the server holds it', async () => {
    const f = fake((c) => json(200, new URL(c.url).searchParams.get('since')
      ? { items: [{ type: 'message', data: { id: 'm2' } }], cursor: 'm2.b' }
      : { items: [], cursor: 'm1.a' }));
    const first = await attendEvent(f.client, 'abcdefghij', {});
    expect(first).toEqual({ items: [], cursor: 'm1.a' });
    expect(path(f.calls[0])).toBe('/v1/events/abcdefghij/updates?wait=0');
    const next = await attendEvent(f.client, 'abcdefghij', { since: first.cursor, wait: 20 });
    expect(next.cursor).toBe('m2.b');
    expect(path(f.calls[1])).toBe('/v1/events/abcdefghij/updates?since=m1.a&wait=20');
    expect(() => attendEvent(f.client, 'abcdefghij', { since: 'm1.a', wait: 99 })).toThrow(/wait/);
  });

  it('parseSse splits frames and keeps id, event and data; comments (heartbeats) are skipped', () => {
    const frames = parseSse(': hb\n\nid: m1.a\nevent: ready\ndata: {"cursor":"m1.a"}\n\nid: m2.b\nevent: message\ndata: {"id":"x"}\n\n');
    expect(frames).toEqual([
      { id: 'm1.a', event: 'ready', data: '{"cursor":"m1.a"}' },
      { id: 'm2.b', event: 'message', data: '{"id":"x"}' },
    ]);
  });

  it('the stream yields items with cursors and resumes with Last-Event-ID after a drop', async () => {
    const enc = new TextEncoder();
    const sse = (chunks: string[]) => new Response(new ReadableStream({
      start(ctrl) { for (const c of chunks) ctrl.enqueue(enc.encode(c)); ctrl.close(); },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    let n = 0;
    const f = fake(() => {
      n += 1;
      return n === 1
        ? sse(['id: m1.a\nevent: ready\ndata: {"cursor":"m1.a"}\n\n', 'id: m2.b\nevent: mess', 'age\ndata: {"id":"one"}\n\n'])
        : sse(['id: m3.c\nevent: message\ndata: {"id":"two"}\n\n']);
    });
    const got: Array<{ type: string; cursor: string | null; data: any }> = [];
    const ac = new AbortController();
    await streamEvent(f.client, 'abcdefghij', {
      signal: ac.signal, retryDelayMs: 1,
      onItem: (it) => { got.push(it); if (got.length === 3) ac.abort(); },
    });
    expect(got).toEqual([
      { type: 'ready', cursor: 'm1.a', data: { cursor: 'm1.a' } },
      { type: 'message', cursor: 'm2.b', data: { id: 'one' } },
      { type: 'message', cursor: 'm3.c', data: { id: 'two' } },
    ]);
    expect(path(f.calls[0])).toBe('/v1/events/abcdefghij/stream');
    expect(f.calls[0].headers.Accept).toBe('text/event-stream');
    expect(f.calls[1].headers['Last-Event-ID']).toBe('m2.b');
  });

  it('a refused stream (403) is an error, not a reconnect loop', async () => {
    const f = fake(() => json(403, { error: 'event_agents_not_allowed' }));
    await expect(streamEvent(f.client, 'abcdefghij', { onItem: () => {}, retryDelayMs: 1 })).rejects.toThrow(/403.*event_agents_not_allowed/);
    expect(f.calls).toHaveLength(1);
  });
});
