import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CanopiTab } from '@canopi-sdk/tab-bridge';
import { createMockTab } from './mockTab.js';

const tag = (id: string, tagType: string, data: Record<string, unknown>, supersededBy: string | null = null) => ({
  id, tagType, summary: `s-${id}`, data, revision: 1, supersededBy, author: { handle: 'ann', name: null }, createdAt: '2026-11-01T00:00:00Z',
});

describe('createMockTab', () => {
  it('is a CanopiTab', () => {
    expectTypeOf(createMockTab()).toMatchTypeOf<CanopiTab>();
    const t = createMockTab({ moduleId: 'studio.x.tab' });
    expect(t.version).toBe(1);
    expect(t.moduleId).toBe('studio.x.tab');
  });

  it('serves page, user, theme and fires change events', async () => {
    const t = createMockTab({ page: { url: 'https://a.example/', title: 'A' }, user: { handle: 'bo', name: 'Bo', avatarUrl: null }, theme: 'light' });
    expect(await t.page.getContext()).toEqual({ url: 'https://a.example/', title: 'A' });
    expect((await t.user.getProfile())?.handle).toBe('bo');
    expect(await t.theme.get()).toBe('light');
    const pages: unknown[] = [], themes: unknown[] = [];
    const off = t.page.onContextChange((c) => pages.push(c));
    t.theme.onChange((x) => themes.push(x));
    t.setPage({ url: 'https://b.example/', title: 'B' });
    off();
    t.setPage(null);
    t.setTheme('dark');
    expect(pages).toEqual([{ url: 'https://b.example/', title: 'B' }]);
    expect(themes).toEqual(['dark']);
    expect(await t.page.getContext()).toBeNull();
  });

  it('keeps storage in memory; null deletes', async () => {
    const t = createMockTab({ storage: { a: 1 } });
    await t.storage.set('b', { x: 1 });
    expect(await t.storage.get('b')).toEqual({ x: 1 });
    expect(await t.storage.get()).toEqual({ a: 1, b: { x: 1 } });
    await t.storage.set('a', null);
    expect(await t.storage.get('a')).toBeNull();
  });

  it('lists tags by type with where/limit, skipping superseded ones, and records compose/badge/openTab', async () => {
    const t = createMockTab({ tags: [tag('1', 'sig', { k: 'a' }), tag('2', 'sig', { k: 'b' }), tag('3', 'sig', { k: 'a' }, '4'), tag('5', 'other', {})] });
    expect((await t.tags.list('sig')).map((x) => x.id)).toEqual(['1', '2']);
    expect((await t.tags.list('sig', { where: { k: 'a' } })).map((x) => x.id)).toEqual(['1']);
    expect(await t.tags.list('sig', { limit: 1 })).toHaveLength(1);
    await t.tags.compose('sig', { k: 'c' });
    await t.ui.setBadge('3');
    await t.ui.openTab('other-tab');
    expect(t.calls).toEqual({ badge: '3', openedTabs: ['other-tab'], composed: [{ tagType: 'sig', data: { k: 'c' } }] });
  });

  it('can enforce permissions like the host, and rejects after close', async () => {
    const t = createMockTab({ permissions: ['page:context'], enforcePermissions: true });
    await expect(t.tags.list('sig')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(t.page.getContext()).resolves.toBeTruthy();
    t.close();
    await expect(t.page.getContext()).rejects.toMatchObject({ code: 'HOST_ERROR' });
  });
});
