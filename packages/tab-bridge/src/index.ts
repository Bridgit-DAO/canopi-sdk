/**
 * Client for the canopi.tab bridge v1: what a tablication imports to talk to Canopi.
 * Spec: canopi docs/planning/SDK_UNIVERSAL_STACK_SPEC.md §2.4.
 *
 *   import { connect } from '@canopi-sdk/tab-bridge';
 *   const canopi = await connect();
 *   const page = await canopi.page.getContext();
 *
 * The tablication runs in a sandboxed frame. The host hands it a private MessagePort once, in a
 * `canopi.tab.init` message from the parent window; every call then goes over that port and is
 * checked against the permissions the person granted. Errors reject with a BridgeError
 * (code: PERMISSION_DENIED, NOT_AVAILABLE, QUOTA_EXCEEDED, RATE_LIMITED, TOO_LARGE, BAD_REQUEST,
 * UNKNOWN_METHOD, HOST_ERROR, TIMEOUT).
 */

export const BRIDGE_VERSION = 1;

export class BridgeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

export interface PageContext { url: string; title: string }
export interface Profile { handle: string; name: string | null; avatarUrl: string | null }

/** tags.list options: filters and sorting only on the tag's x-canopi-index fields (host-checked). */
export interface ListOptions {
  limit?: number;
  /** 'page' (default): the current page; 'all': every page the viewer can read. */
  scope?: 'page' | 'all';
  where?: Record<string, string | number>;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

/** A tag instance as the host returns it (visibility already applied as the viewer). */
export interface TagInstance {
  id: string;
  tagType: string;
  summary: string;
  data: Record<string, unknown>;
  revision: number;
  supersededBy: string | null;
  author: { handle: string; name: string | null };
  createdAt: string;
}

export interface CanopiTab {
  version: number;
  moduleId: string;
  permissions: readonly string[];
  page: { getContext(): Promise<PageContext | null>; onContextChange(cb: (ctx: PageContext | null) => void): () => void };
  user: { getProfile(): Promise<Profile | null> };
  storage: { get<T = unknown>(key?: string): Promise<T>; set(key: string, value: unknown): Promise<true> };
  theme: { get(): Promise<'light' | 'dark'>; onChange(cb: (theme: 'light' | 'dark') => void): () => void };
  ui: { setBadge(text: string | null): Promise<true>; openTab(tabId: string): Promise<true> };
  tags: { compose(tagType: string, data: Record<string, unknown>): Promise<{ opened: true }>; list(tagType: string, opts?: ListOptions): Promise<TagInstance[]> };
  close(): void;
}

interface InitMessage { type: 'canopi.tab.init'; v: number; moduleId: string; permissions: string[]; theme: 'light' | 'dark' }

/** Wait for the host's handshake and return the bridge. Rejects after `timeoutMs`. */
export function connect(opts: { timeoutMs?: number; callTimeoutMs?: number; target?: Window } = {}): Promise<CanopiTab> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const callTimeoutMs = opts.callTimeoutMs ?? 15000;
  const win = opts.target ?? window;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { win.removeEventListener('message', onMessage); reject(new BridgeError('TIMEOUT', 'no canopi.tab.init from the host')); }, timeoutMs);
    function onMessage(event: MessageEvent) {
      const data = event.data as Partial<InitMessage> | null;
      // Only the embedding host (our parent window) can hand us the port.
      if (event.source !== win.parent || !data || data.type !== 'canopi.tab.init' || !event.ports || !event.ports[0]) return;
      if (data.v !== BRIDGE_VERSION) { clearTimeout(timer); win.removeEventListener('message', onMessage); reject(new BridgeError('BAD_REQUEST', `host speaks bridge v${String(data.v)}, this client v${BRIDGE_VERSION}`)); return; }
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
      resolve(makeClient(event.ports[0], data as InitMessage, callTimeoutMs));
    }
    win.addEventListener('message', onMessage);
  });
}

function makeClient(port: MessagePort, init: InitMessage, callTimeoutMs: number): CanopiTab {
  let next = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners: Record<string, Set<(d: never) => void>> = { 'page.contextChanged': new Set(), 'theme.changed': new Set() };

  port.onmessage = (event: MessageEvent) => {
    const msg = event.data as { id?: number; result?: unknown; error?: { code: string; message: string }; event?: string; data?: unknown };
    if (msg && typeof msg.event === 'string') {
      for (const cb of listeners[msg.event] ?? []) (cb as (d: unknown) => void)(msg.data);
      return;
    }
    if (typeof msg?.id !== 'number') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new BridgeError(msg.error.code, msg.error.message));
    else p.resolve(msg.result);
  };

  function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new BridgeError('TIMEOUT', `${method} timed out`)); }, callTimeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      port.postMessage({ id, method, params: params ?? {} });
    });
  }
  const on = <T>(name: string, cb: (d: T) => void) => { listeners[name].add(cb as (d: never) => void); return () => listeners[name].delete(cb as (d: never) => void); };

  return {
    version: init.v,
    moduleId: init.moduleId,
    permissions: Object.freeze([...(init.permissions ?? [])]),
    page: { getContext: () => call('page.getContext'), onContextChange: (cb) => on('page.contextChanged', cb) },
    user: { getProfile: () => call('user.getProfile') },
    storage: { get: (key) => call('storage.get', key === undefined ? {} : { key }), set: (key, value) => call('storage.set', { key, value }) },
    theme: { get: () => call('theme.get'), onChange: (cb) => on('theme.changed', cb) },
    ui: { setBadge: (text) => call('ui.setBadge', { text }), openTab: (tabId) => call('ui.openTab', { tabId }) },
    tags: {
      compose: (tagType, data) => call('tags.compose', { tagType, data }),
      list: (tagType, o) => call('tags.list', { tagType, limit: o?.limit, scope: o?.scope, where: o?.where, orderBy: o?.orderBy, order: o?.order }),
    },
    close() { port.close(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new BridgeError('HOST_ERROR', 'closed')); } pending.clear(); },
  };
}
