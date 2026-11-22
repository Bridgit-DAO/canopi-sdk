/**
 * Agent-facing operations shared by the CLI and the MCP server (PHNAI spec §C).
 *
 * Every write resolves a concrete target first. A post never silently lands in Public
 * Square: the community comes from --community-id or from the embed's config (--embed),
 * and the page from --page-id or a URL the server normalizes (--url).
 */
import { CanopiHttpError, type CanopiClient } from './client.js';

export type TargetInput = {
  pageId?: string;
  url?: string;
  embed?: string;
  communityId?: string;
};

export type Target = {
  pageId: string;
  communityId: string;
  embedInstanceId?: string;
  pathname?: string;
};

export const ENDPOINTS = {
  embedConfig: (id: string) => `/api/embeds/config/${encodeURIComponent(id)}`,
  normalizeUrl: '/v1/presence/normalize-url',
  messages: '/api/messages',
  message: (id: string) => `/api/messages/${encodeURIComponent(id)}`,
  reactions: '/v1/reactions',
  reaction: (id: string) => `/v1/reactions/${encodeURIComponent(id)}`,
  // Canopi Events (docs/planning/EVENTS_MODULE_SPEC.md §10, §12)
  events: '/v1/events',
  event: (slug: string) => `/v1/events/${encodeURIComponent(slug)}`,
  eventCommunities: '/v1/events/communities',
  eventRsvp: (slug: string) => `/v1/events/${encodeURIComponent(slug)}/rsvp`,
  eventStream: (slug: string) => `/v1/events/${encodeURIComponent(slug)}/stream`,
  eventUpdates: (slug: string) => `/v1/events/${encodeURIComponent(slug)}/updates`,
  eventMessages: (slug: string) => `/v1/events/${encodeURIComponent(slug)}/messages`,
} as const;

export async function resolveTarget(client: CanopiClient, input: TargetInput): Promise<Target> {
  let communityId = input.communityId?.trim() || undefined;
  const embedInstanceId = input.embed?.trim() || undefined;
  if (embedInstanceId) {
    const cfg = await client.request<{ config?: { communityId?: string | null } }>(ENDPOINTS.embedConfig(embedInstanceId));
    const embedCommunity = cfg?.config?.communityId || undefined;
    if (!communityId) communityId = embedCommunity;
    if (!communityId) throw new Error(`Embed ${embedInstanceId} has no community configured; pass --community-id`);
  }
  if (!communityId) {
    throw new Error('No community: pass --embed <canopiId> or --community-id <uuid> (posts are never defaulted to Public Square)');
  }

  let pageId = input.pageId?.trim() || undefined;
  let pathname: string | undefined;
  if (input.url) {
    try { pathname = new URL(input.url).pathname; } catch { throw new Error(`Invalid --url: ${input.url}`); }
    if (!pageId) {
      const norm = await client.request<{ pageId?: string }>(ENDPOINTS.normalizeUrl, { method: 'POST', body: { url: input.url } });
      pageId = norm?.pageId;
    }
  }
  if (!pageId) throw new Error('No page: pass --url <page URL> or --page-id <id>');
  return { pageId, communityId, embedInstanceId, pathname };
}

export type PostInput = {
  content: string;
  parentId?: string;
  quoteId?: string;
  status?: 'published' | 'draft';
  sourceApp: string;
  /** Smart tag, e.g. 'pro-human-ai'; payload is validated server-side against the tag schema. */
  tagType?: string;
  payload?: Record<string, unknown>;
};

export function parsePayloadJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { throw new Error('--payload must be a JSON object'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('--payload must be a JSON object');
  return v as Record<string, unknown>;
}

export function postMessage(client: CanopiClient, target: Target, input: PostInput) {
  if (!input.content || !input.content.trim()) throw new Error('content is required');
  return client.request(ENDPOINTS.messages, {
    method: 'POST',
    auth: true,
    body: {
      pageId: target.pageId,
      communityId: target.communityId,
      embedInstanceId: target.embedInstanceId,
      content: input.content,
      parentId: input.parentId,
      quoteId: input.quoteId,
      status: input.status ?? 'published',
      sourceApp: input.sourceApp,
      tagType: input.tagType,
      payload: input.payload,
    },
  });
}

export function listMessages(
  client: CanopiClient,
  target: Target,
  opts: { limit?: number | string; cursor?: string; parentId?: string } = {},
) {
  return client.request(ENDPOINTS.messages, {
    query: {
      pageId: target.pageId,
      communityId: target.communityId,
      communityIds: target.communityId,
      embedInstanceId: target.embedInstanceId,
      pathname: target.pathname,
      includeTopReply: 'true',
      limit: opts.limit ?? 25,
      cursor: opts.cursor,
      parentId: opts.parentId,
    },
  });
}

export function getMessage(client: CanopiClient, id: string) {
  return client.request(ENDPOINTS.message(id));
}

export function react(client: CanopiClient, messageId: string, emoji: string) {
  // toggle:false: `react add` sets the reaction; a retry never removes it (C-3).
  return client.request(ENDPOINTS.reactions, { method: 'POST', auth: true, body: { messageId, emoji, toggle: false } });
}

export function unreact(client: CanopiClient, reactionId: string) {
  return client.request(ENDPOINTS.reaction(reactionId), { method: 'DELETE', auth: true });
}

// ── Canopi Events (plan slice S9): shared by `canopi events …` and both MCP servers ──

export type EventListFilter = {
  url?: string;
  pageId?: string;
  communityIds?: string[];
  status?: string[];
  from?: string;
  to?: string;
  limit?: number | string;
};

const csv = (xs?: string[]) => (xs && xs.length ? xs.join(',') : undefined);

/** Events the token's person may see (an agent reads with its operator's memberships). */
export function listEvents(client: CanopiClient, f: EventListFilter = {}) {
  return client.request(ENDPOINTS.events, {
    query: { url: f.url, pageId: f.pageId, communityIds: csv(f.communityIds), status: csv(f.status), from: f.from, to: f.to, limit: f.limit },
  });
}

/** Where the token's person can hold an event (the community_id plan_event takes); an agent token's allow-list applies. */
export function listEventCommunities(client: CanopiClient) {
  return client.request(ENDPOINTS.eventCommunities);
}

export function getEvent(client: CanopiClient, slug: string) {
  return client.request(ENDPOINTS.event(slug));
}

export type PlanEventInput = {
  title: string;
  url: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  communityId?: string;
  conversation?: 'room' | 'discuss' | 'live';
  visibility?: 'public' | 'community' | 'unlisted';
  agentPolicy?: 'none' | 'listen' | 'participate';
  pageForSignedOut?: 'show' | 'hide';
  description?: string;
  anchorHash?: string;
  instant?: boolean;
  note?: string;
};

/**
 * Create an event. As a person it is scheduled (or live); as an agent (events:plan) it is a draft the
 * operator confirms. Only set fields are sent, so the server's defaults apply (agent_policy: listen).
 */
export function planEvent(client: CanopiClient, input: PlanEventInput) {
  const body = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== ''));
  return client.request(ENDPOINTS.events, { method: 'POST', auth: true, body });
}

const RSVPS = ['going', 'maybe', 'declined'] as const;
export type Rsvp = (typeof RSVPS)[number];

/** Longest RSVP note the server stores. */
export const RSVP_NOTE_MAX = 500;

/**
 * RSVP, optionally with a short note other attendees (and their assistants) read as untrusted text.
 * `note` left out keeps the stored note; `null` or `''` clears it. An agent's RSVP and note are marked
 * AI-generated by the server.
 */
export async function rsvpEvent(client: CanopiClient, slug: string, rsvp: Rsvp, opts: { note?: string | null } = {}) {
  if (!RSVPS.includes(rsvp)) throw new Error('rsvp must be going, maybe or declined');
  const body: { rsvp: Rsvp; note?: string | null } = { rsvp };
  if (opts.note !== undefined) {
    if (opts.note !== null && typeof opts.note !== 'string') throw new Error('note must be text');
    if (typeof opts.note === 'string' && opts.note.length > RSVP_NOTE_MAX) throw new Error(`note must be at most ${RSVP_NOTE_MAX} characters`);
    body.note = opts.note;
  }
  return client.request(ENDPOINTS.eventRsvp(slug), { method: 'POST', auth: true, body });
}

/** Host/cohost cancel (an agent's cancel is a draft its operator confirms). */
export function cancelEvent(client: CanopiClient, slug: string) {
  return client.request(ENDPOINTS.event(slug), { method: 'DELETE', auth: true });
}

/** post_to_event: says it in the event's mode (Room, Discuss or Live). */
export async function postToEvent(client: CanopiClient, slug: string, input: { text: string; parentId?: string }) {
  if (!input.text || !input.text.trim()) throw new Error('text is required');
  return client.request(ENDPOINTS.eventMessages(slug), { method: 'POST', auth: true, body: { text: input.text, parentId: input.parentId } });
}

export type EventLogPage = { items: Array<{ type: string; data: unknown }>; cursor: string };

/** The server holds a long-poll at most this long (routes/events.js WAIT_MAX_S). */
export const EVENT_WAIT_MAX_S = 25;

/**
 * One long-poll of the event log. Without `since`: the newest items and a cursor, at once. With `since`:
 * what came after it, waiting up to `wait` seconds for something (empty items and the same cursor if not).
 */
export function attendEvent(client: CanopiClient, slug: string, opts: { since?: string; wait?: number } = {}): Promise<EventLogPage> {
  const wait = opts.since ? (opts.wait ?? 20) : 0;
  if (!Number.isInteger(wait) || wait < 0 || wait > EVENT_WAIT_MAX_S) throw new Error(`wait must be 0..${EVENT_WAIT_MAX_S} seconds`);
  return client.request<EventLogPage>(ENDPOINTS.eventUpdates(slug), {
    query: { since: opts.since, wait },
    timeoutMs: (wait + 15) * 1000,
  });
}

export type SseFrame = { id?: string; event?: string; data: string };

/** Complete SSE frames in `text` (comment lines such as `: hb` are skipped). */
export function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const f: SseFrame = { data: '' };
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'id') f.id = value;
      else if (field === 'event') f.event = value;
      else if (field === 'data') data.push(value);
    }
    if (!data.length && !f.event) continue;
    f.data = data.join('\n');
    frames.push(f);
  }
  return frames;
}

export type StreamedItem = { type: string; cursor: string | null; data: unknown };

/**
 * Follow the event log over SSE until `signal` aborts. Each frame's id is the cursor after it; a dropped
 * connection reconnects with Last-Event-ID, so nothing is missed or repeated. A refusal (4xx) throws.
 */
export async function streamEvent(
  client: CanopiClient,
  slug: string,
  opts: { onItem: (item: StreamedItem) => void; since?: string; signal?: AbortSignal; retryDelayMs?: number; maxReconnects?: number },
): Promise<void> {
  let cursor = opts.since || undefined;
  const maxReconnects = opts.maxReconnects ?? 100;
  for (let attempt = 0; attempt <= maxReconnects && !opts.signal?.aborted; attempt++) {
    let res: Response;
    try {
      res = await client.openStream(ENDPOINTS.eventStream(slug), { lastEventId: cursor, signal: opts.signal });
    } catch (err) {
      if (opts.signal?.aborted) return;
      if (err instanceof CanopiHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) throw err;
      await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000));
      continue;
    }
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const end = buf.lastIndexOf('\n\n');
        if (end < 0) continue;
        const complete = buf.slice(0, end + 2);
        buf = buf.slice(end + 2);
        for (const f of parseSse(complete)) {
          if (f.id) cursor = f.id;
          let data: unknown = f.data;
          try { data = JSON.parse(f.data); } catch { /* keep text */ }
          opts.onItem({ type: f.event || 'message', cursor: f.id ?? null, data });
          if (opts.signal?.aborted) return;
        }
      }
    } catch {
      if (opts.signal?.aborted) return;
    }
    if (opts.signal?.aborted) return;
    await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000));
  }
}

