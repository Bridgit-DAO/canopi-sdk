/**
 * A host-less CanopiTab for previews and tests. It implements the real interface from
 * @canopi-sdk/tab-bridge (checked by the compiler), keeps storage in memory, and records what a
 * tablication asked the host to do (badge, openTab, compose) so a preview can show it.
 */
import { BRIDGE_VERSION, BridgeError } from '@canopi-sdk/tab-bridge';
import type { CanopiTab, ListOptions, PageContext, Profile, TagInstance } from '@canopi-sdk/tab-bridge';

export interface MockTabOptions {
  page?: PageContext | null;
  user?: Profile | null;
  theme?: 'light' | 'dark';
  tags?: TagInstance[];
  storage?: Record<string, unknown>;
  moduleId?: string;
  permissions?: string[];
  /** When true, calls without the matching permission reject with PERMISSION_DENIED like the host. */
  enforcePermissions?: boolean;
}

export interface MockTab extends CanopiTab {
  /** Simulate navigation: updates page.getContext and fires onContextChange. */
  setPage(ctx: PageContext | null): void;
  /** Simulate a theme switch: fires theme.onChange. */
  setTheme(theme: 'light' | 'dark'): void;
  /** What the tablication asked the host for. */
  readonly calls: { badge: string | null; openedTabs: string[]; composed: Array<{ tagType: string; data: Record<string, unknown> }> };
  readonly closed: boolean;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function createMockTab(opts: MockTabOptions = {}): MockTab {
  let page: PageContext | null = opts.page === undefined ? { url: 'https://example.com/', title: 'Example' } : opts.page;
  let theme: 'light' | 'dark' = opts.theme ?? 'dark';
  const user = opts.user === undefined ? { handle: 'preview', name: 'Preview user', avatarUrl: null } : opts.user;
  const store = new Map<string, unknown>(Object.entries(clone(opts.storage ?? {})));
  const tags = clone(opts.tags ?? []);
  const permissions = opts.permissions ?? ['page:context', 'user:profile', 'storage:module', 'ui:badge', 'ui:openTab', 'tags:compose'];
  const pageCbs = new Set<(c: PageContext | null) => void>();
  const themeCbs = new Set<(t: 'light' | 'dark') => void>();
  const calls: MockTab['calls'] = { badge: null, openedTabs: [], composed: [] };
  let closed = false;

  const need = (perm: string) => {
    if (closed) throw new BridgeError('HOST_ERROR', 'closed');
    if (opts.enforcePermissions && !permissions.includes(perm)) throw new BridgeError('PERMISSION_DENIED', `needs ${perm}`);
  };
  const ok = async <T>(perm: string, f: () => T): Promise<T> => { need(perm); return f(); };

  const tab: MockTab = {
    version: BRIDGE_VERSION,
    moduleId: opts.moduleId ?? 'studio.preview',
    permissions: Object.freeze([...permissions]),
    page: {
      getContext: () => ok('page:context', () => clone(page)),
      onContextChange(cb) { pageCbs.add(cb); return () => { pageCbs.delete(cb); }; },
    },
    user: { getProfile: () => ok('user:profile', () => clone(user)) },
    storage: {
      get: <T = unknown>(key?: string) => ok('storage:module', () => (key === undefined ? Object.fromEntries(store) : store.get(key) ?? null) as T),
      set: (key: string, value: unknown) => ok('storage:module', () => {
        if (value === null || value === undefined) store.delete(key); else store.set(key, clone(value));
        return true as const;
      }),
    },
    theme: {
      get: async () => theme,
      onChange(cb) { themeCbs.add(cb); return () => { themeCbs.delete(cb); }; },
    },
    ui: {
      setBadge: (text) => ok('ui:badge', () => { calls.badge = text; return true as const; }),
      openTab: (tabId) => ok('ui:openTab', () => { calls.openedTabs.push(tabId); return true as const; }),
    },
    tags: {
      compose: (tagType, data) => ok('tags:compose', () => { calls.composed.push({ tagType, data: clone(data) }); return { opened: true as const }; }),
      list: (tagType: string, o?: ListOptions) => ok(`tags:read:${tagType}`, () => {
        let out = tags.filter((t) => t.tagType === tagType && t.supersededBy === null);
        for (const [k, v] of Object.entries(o?.where ?? {})) out = out.filter((t) => t.data[k] === v);
        if (o?.orderBy) {
          const k = o.orderBy, dir = o.order === 'asc' ? 1 : -1;
          out = [...out].sort((a, b) => (String(a.data[k]) < String(b.data[k]) ? -dir : String(a.data[k]) > String(b.data[k]) ? dir : 0));
        }
        return clone(out.slice(0, Math.max(0, Math.min(o?.limit ?? 50, 100))));
      }),
    },
    close() { closed = true; pageCbs.clear(); themeCbs.clear(); },
    setPage(ctx) { page = ctx; for (const cb of [...pageCbs]) cb(clone(ctx)); },
    setTheme(t) { theme = t; for (const cb of [...themeCbs]) cb(t); },
    calls,
    get closed() { return closed; },
  };
  return tab;
}
