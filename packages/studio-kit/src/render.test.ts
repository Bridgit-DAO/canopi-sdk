import { describe, expect, it } from 'vitest';
import { createMemoryDataSource } from './datasource.js';
import { createMockTab } from './mockTab.js';
import { renderSidebar, safeUrl, SIDEBAR_CSS } from './render.js';
import { loadSample, SAMPLE_PATH } from './test-utils.js';
import type { Component, StudioProject } from './types.js';

const XSS = '<img src=x onerror="window.__pwned=1">';
const NORTHWIND = { url: 'https://www.northwind-outfitters.example/about', title: 'About Northwind' };
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function sampleSetup(p: StudioProject = loadSample(), tags = [] as Parameters<typeof createMockTab>[0]['tags']) {
  const tab = createMockTab({ page: NORTHWIND, theme: 'dark', tags });
  const sources = p.dataSources.map((d) => createMemoryDataSource(d));
  return { p, tab, sources };
}

describe('renderSidebar', () => {
  it('renders design.sidebar.layout in order, skipping rejected components, on fixture data', async () => {
    const { p, tab, sources } = sampleSetup();
    const root = mount();
    await renderSidebar(root, p, { tab, sources });
    const ids = [...root.querySelectorAll<HTMLElement>('[data-cmp]')].map((e) => e.dataset.cmp);
    expect(ids).toEqual(p.design!.sidebar!.layout);
    expect(root.textContent).toContain('Northwind Outfitters');
    expect(root.textContent).toContain('$186,000');                // ARR stat, currency
    expect(root.textContent).toContain('$82,500');                 // pipeline sum of open deals
    expect(root.textContent).toContain('Priya Raman');             // detail with a dotted field
    expect(root.querySelectorAll('.sk-table tbody tr')).toHaveLength(2);
    expect(root.querySelectorAll('.sk-timeline li')).toHaveLength(3);
    expect(root.querySelector('.sk-spark polyline')?.getAttribute('points')).toBeTruthy();
    expect(root.querySelector<HTMLAnchorElement>('a.sk-button')?.href).toBe('https://app.pineconecrm.example/accounts/acc_4821');
    expect(root.querySelector('[data-cmp="cmp_logo_card"]')).toBeNull();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--sk-accent')).toBe('#2f9e6b');
  });

  it('follows the bridge theme and re-renders on navigation', async () => {
    const { p, tab, sources } = sampleSetup();
    const root = mount();
    const h = await renderSidebar(root, p, { tab, sources });
    tab.setTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    tab.setPage({ url: 'https://bluefin-analytics.example/', title: 'Bluefin' });
    await flush(); await flush();
    expect(root.textContent).toContain('Bluefin Analytics');
    h.destroy();
    expect(root.children).toHaveLength(0);
    tab.setTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('a failing source shows an error in its components only', async () => {
    const { p, tab, sources } = sampleSetup();
    const root = mount();
    const broken = sources.map((s) => (s.id === 'src_deals' ? { id: s.id, fetch: () => Promise.reject(new Error('down')) } : s));
    await renderSidebar(root, p, { tab, sources: broken });
    expect(root.querySelector('[data-cmp="cmp_deals"] .sk-error')?.textContent).toMatch(/Couldn't load src_deals/);
    expect(root.textContent).toContain('Northwind Outfitters');
  });

  it('form composes the smart tag through the bridge; tag-feed lists instances; ask-deepi uses the hook', async () => {
    const { p, tab, sources } = sampleSetup(undefined, [{ id: 't1', tagType: 'buying-signal', summary: 'hiring: 12 store managers', data: {}, revision: 1, supersededBy: null, author: { handle: 'priya', name: null }, createdAt: '2026-11-01T00:00:00Z' }]);
    const root = mount();
    await renderSidebar(root, p, { tab, sources, askDeepi: async (q) => `You asked: ${q}` });
    expect(root.querySelector('[data-cmp="cmp_signals"]')?.textContent).toContain('hiring: 12 store managers');
    const form = root.querySelector<HTMLFormElement>('[data-cmp="cmp_signal_form"] form')!;
    (form.elements.namedItem('note') as HTMLTextAreaElement).value = 'Opening 6 stores';
    (form.elements.namedItem('strength') as HTMLInputElement).value = '4';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(tab.calls.composed).toEqual([{ tagType: 'buying-signal', data: { signal: 'funding', note: 'Opening 6 stores', strength: 4 } }]);
    const ask = root.querySelector<HTMLFormElement>('[data-cmp="cmp_ask"] form')!;
    (ask.elements.namedItem('q') as HTMLInputElement).value = 'Risk?';
    ask.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(root.querySelector('[data-cmp="cmp_ask"] .sk-answer')?.textContent).toBe('You asked: Risk?');
  });
});

describe('escaping', () => {
  function hostile(): { p: StudioProject; data: unknown } {
    const cmp = (id: string, type: Component['type'], props: Record<string, unknown>, path = '$.rows[*]'): Component => ({ id, ideaId: 'i', surface: 'sidebar', type, title: XSS, purpose: '', binding: { sourceId: 's', path }, props, status: 'accepted', feedback: '' });
    const row = { name: XSS, sub: XSS, when: XSS, n: 3, url: 'javascript:alert(1)', nested: { x: XSS } };
    const components: Component[] = [
      cmp('h', 'header', { titleField: 'name', subtitleField: 'sub' }, '$.rows[0]'),
      cmp('st', 'stat', { field: 'name', label: XSS, suffix: XSS }, '$.rows[0]'),
      cmp('l', 'list', { titleField: 'name', subtitleField: 'sub', metaField: 'nested', linkField: 'url', emptyText: XSS }),
      cmp('c', 'card', { titleField: 'name', bodyField: 'sub', fields: ['name'], linkField: 'url' }, '$.rows[0]'),
      cmp('t', 'table', { columns: [{ field: 'name', label: XSS }] }),
      cmp('tl', 'timeline', { dateField: 'when', titleField: 'name', bodyField: 'sub' }),
      cmp('d', 'detail', { fields: [{ field: 'name', label: XSS }] }, '$.rows[0]'),
      cmp('a', 'action', { label: XSS, kind: 'link', urlField: 'url' }, '$.rows[0]'),
      cmp('f', 'form', { fields: [{ name: 'x', label: XSS, type: 'select', options: [XSS] }], submitLabel: XSS }),
      cmp('tf', 'tag-feed', { tagType: 'sig', emptyText: XSS }),
      cmp('ad', 'ask-deepi', { placeholder: XSS, suggestions: [XSS] }),
      cmp('sp', 'sparkline', { field: 'n', label: XSS }),
      { ...cmp('u', 'header', {}), type: '<b>bad</b>' as never },
    ];
    const p = { components, design: { sidebar: { tab: { id: 'x-tab', title: 'x' }, layout: components.map((c) => c.id) }, theme: { accent: 'red;background:url(x)' } } } as unknown as StudioProject;
    return { p, data: { rows: [row, { ...row, n: 5 }] } };
  }

  it('feeds <img onerror> strings through every component without creating elements or running script', async () => {
    const { p, data } = hostile();
    const tab = createMockTab({ tags: [{ id: '1', tagType: 'sig', summary: XSS, data: {}, revision: 1, supersededBy: null, author: { handle: XSS, name: null }, createdAt: '' }] });
    const root = mount();
    await renderSidebar(root, p, { tab, sources: { s: { id: 's', fetch: async () => data } }, askDeepi: async () => XSS });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(root.textContent).toContain(XSS);
    expect(root.innerHTML).toContain('&lt;img');
    for (const a of root.querySelectorAll('a')) expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    expect(root.querySelector('[data-cmp="a"]')?.textContent).toContain('No link available.');
    expect(root.querySelector('[data-cmp="ad"] input')?.getAttribute('placeholder')).toBe(XSS);
    expect(root.style.getPropertyValue('--sk-accent')).toBe('');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    const ask = root.querySelector<HTMLFormElement>('[data-cmp="ad"] form')!;
    (ask.elements.namedItem('q') as HTMLInputElement).value = 'q';
    ask.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[data-cmp="ad"] .sk-answer')?.textContent).toBe(XSS);
  });

  it('safeUrl allows only http(s)', () => {
    expect(safeUrl('https://a.example/x')).toBe('https://a.example/x');
    for (const u of ['javascript:alert(1)', 'data:text/html,x', '/relative', 'vbscript:x', 42]) expect(safeUrl(u)).toBeNull();
  });

  it('the renderers never assign innerHTML/outerHTML or use insertAdjacentHTML', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(path.dirname(SAMPLE_PATH), '../src/render.ts'), 'utf8');
    expect(src).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/);
  });
});

describe('detail layout, numbers, timestamps and labels', () => {
  const cmp = (id: string, type: Component['type'], props: Record<string, unknown>, path: string): Component => ({ id, ideaId: 'i', surface: 'sidebar', type, title: 'T', purpose: '', binding: { sourceId: 's', path }, props, status: 'accepted', feedback: '' });
  const schema = {
    type: 'object',
    properties: {
      trail: { type: 'object', properties: { lengthKm: { type: 'number' }, elevation_gain_m: { type: 'integer' }, firstSurveyed: { type: 'integer' }, code: { type: 'integer' }, postal: { type: 'string' }, visitors: { type: 'integer' }, capturedAt: { type: 'string' }, updated: { type: 'string' }, ref: { type: 'integer', title: 'Reference', format: 'plain' }, plainNote: { type: 'string' } } },
      rows: { type: 'array', items: { type: 'object', properties: { year: { type: 'string' }, recordId: { type: 'integer' }, visitors: { type: 'integer' } } } },
    },
  };
  const data = {
    trail: { lengthKm: 12.5, elevation_gain_m: 1250, firstSurveyed: 1897, code: 48213, postal: 94110, visitors: 125000, capturedAt: '20261111014936', updated: '2026-11-01T09:30:00Z', ref: 987654, plainNote: '20261111 notes' },
    rows: [{ year: 2004, recordId: 1234567, visitors: 34000 }],
  };
  async function render(components: Component[]) {
    const p = { components, design: { sidebar: { tab: { id: 'x', title: 'x' }, layout: components.map((c) => c.id) } } } as unknown as StudioProject;
    const root = mount();
    await renderSidebar(root, p, { tab: createMockTab({}), sources: [{ id: 's', schema, fetch: async () => data }] });
    return root;
  }
  const pairs = (root: HTMLElement, id: string) => [...root.querySelectorAll(`[data-cmp="${id}"] dt`)].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);

  it('the detail section is not the grid: only its inner <dl> is', async () => {
    const root = await render([cmp('d', 'detail', { fields: [{ field: 'lengthKm' }] }, '$.trail')]);
    const section = root.querySelector('[data-cmp="d"]')!;
    const dl = section.querySelector('dl')!;
    expect(section.classList.contains('sk-detail')).toBe(true);
    expect(dl.className).toBe('sk-dl');
    expect(section.querySelector('h3')?.parentElement).toBe(section);
    expect(SIDEBAR_CSS).toMatch(/\.sk-dl\{display:grid/);
    expect(SIDEBAR_CSS).not.toMatch(/\.sk-detail\{[^}]*grid/);
  });

  it('groups quantities only; years, ids, codes and string-typed fields stay as written; stamps read as dates; labels are humanised', async () => {
    const fields = ['lengthKm', 'elevation_gain_m', 'firstSurveyed', 'code', 'postal', 'visitors', 'capturedAt', 'updated', 'ref', 'plainNote'].map((field) => ({ field }));
    const root = await render([
      cmp('d', 'detail', { fields }, '$.trail'),
      cmp('t', 'table', { columns: [{ field: 'year' }, { field: 'recordId' }, { field: 'visitors', label: 'People' }] }, '$.rows[*]'),
      cmp('c', 'card', { fields: ['elevation_gain_m', 'firstSurveyed'] }, '$.trail'),
    ]);
    expect(pairs(root, 'd')).toEqual([
      ['Length (km)', '12.5'],
      ['Elevation gain (m)', '1,250'],
      ['First surveyed', '1897'],
      ['Code', '48213'],
      ['Postal', '94110'],
      ['Visitors', '125,000'],
      ['Captured at', 'Nov 11, 2026, 01:49 UTC'],
      ['Updated', 'Nov 1, 2026, 09:30 UTC'],
      ['Reference', '987654'],
      ['Plain note', '20261111 notes'],
    ]);
    expect([...root.querySelectorAll('[data-cmp="t"] th')].map((e) => e.textContent)).toEqual(['Year', 'Record ID', 'People']);
    expect([...root.querySelectorAll('[data-cmp="t"] td')].map((e) => e.textContent)).toEqual(['2004', '1234567', '34,000']);
    expect(pairs(root, 'c')).toEqual([['Elevation gain (m)', '1,250'], ['First surveyed', '1897']]);
  });

  it('an explicit field format wins over the defaults', async () => {
    const root = await render([cmp('d', 'detail', { fields: [{ field: 'firstSurveyed', label: 'Count', format: 'integer' }, { field: 'visitors', format: 'plain' }] }, '$.trail')]);
    expect(pairs(root, 'd')).toEqual([['Count', '1,897'], ['Visitors', '125000']]);
  });
});
