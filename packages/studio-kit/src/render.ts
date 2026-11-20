/**
 * Sidebar kit renderers: plain DOM, no dependencies. Every value reaches the page through
 * textContent or a checked attribute; nothing is parsed as HTML. The same code runs in the Studio
 * preview (with a mock tab) and inside an exported tablication (with the real canopi.tab bridge).
 */
import type { CanopiTab } from '@canopi-sdk/tab-bridge';
import { getField, resolveBinding } from './binding.js';
import type { DataSource } from './datasource.js';
import { fieldLabel, formatNumber, formatTimestamp, schemaAtPath, schemaOfField } from './format.js';
import type { Component, StudioProject } from './types.js';

export interface RenderOptions {
  tab: CanopiTab;
  sources: DataSource[] | Record<string, DataSource>;
  /** Extra request params; page params (pageUrl, pageOrigin, pageHost, pagePath, pageTitle) are added. */
  params?: Record<string, string>;
  /** Answers the ask-deepi box. Without it the box says Deepi is not connected. */
  askDeepi?: (question: string) => Promise<string>;
}

export interface SidebarHandle {
  refresh(): Promise<void>;
  destroy(): void;
}

type Props = Record<string, unknown>;
interface Ctx {
  tab: CanopiTab;
  askDeepi?: RenderOptions['askDeepi'];
  /** JSON Schema of what the component's binding resolves to (from the source's response schema), when known. */
  schema?: Record<string, unknown>;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ACCENT = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Static stylesheet for the kit (themed by `data-theme` on the root, accent by `--sk-accent`). */
export const SIDEBAR_CSS = `.sk-root{--sk-bg:#121417;--sk-fg:#e8eaed;--sk-muted:#9aa0a6;--sk-line:#2c3036;--sk-chip:rgba(127,127,127,.14);--sk-accent:#5b8def;color-scheme:dark;background:var(--sk-bg);color:var(--sk-fg);font:14px/1.45 system-ui,sans-serif;padding:12px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}
.sk-root[data-theme="light"]{--sk-bg:#fff;--sk-fg:#1f2328;--sk-muted:#57606a;--sk-line:#d0d7de;color-scheme:light}
.sk-root *{box-sizing:border-box}
.sk-c{display:flex;flex-direction:column;gap:6px}
.sk-c>h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--sk-muted);margin:0}
.sk-header h2{margin:0;font-size:18px}.sk-header p{margin:0;color:var(--sk-muted)}
.sk-stat .sk-value{font-size:24px;font-weight:650;color:var(--sk-accent)}
.sk-muted,.sk-empty,.sk-status{color:var(--sk-muted);margin:0;font-size:13px}
.sk-error{color:#e5534b;margin:0;font-size:13px}
.sk-list,.sk-timeline,.sk-feed{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.sk-list li,.sk-feed li,.sk-card-box{padding:8px;border-radius:8px;background:var(--sk-chip)}
.sk-list .sk-sub,.sk-list .sk-meta,.sk-feed .sk-sub{display:block;font-size:12px;color:var(--sk-muted)}
.sk-timeline li{border-left:2px solid var(--sk-accent);padding:0 0 0 8px}
.sk-timeline time{display:block;font-size:11px;color:var(--sk-muted)}
.sk-table{width:100%;border-collapse:collapse;font-size:13px}.sk-table th,.sk-table td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--sk-line)}
.sk-dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0}.sk-dl dt{color:var(--sk-muted)}.sk-dl dd{margin:0;overflow-wrap:anywhere}
.sk-root input,.sk-root textarea,.sk-root select{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--sk-line);border-radius:6px;padding:6px}
.sk-root label{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--sk-muted)}
.sk-root button,.sk-root a.sk-button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid var(--sk-accent);background:transparent;color:var(--sk-fg);cursor:pointer;text-decoration:none;align-self:flex-start}
.sk-chips{display:flex;flex-wrap:wrap;gap:6px}.sk-chips button{font-size:12px;padding:2px 8px;border-color:var(--sk-line)}
.sk-spark svg{width:100%;height:36px}.sk-spark polyline{fill:none;stroke:var(--sk-accent);stroke-width:2}
.sk-answer{white-space:pre-wrap;padding:8px;border-radius:8px;background:var(--sk-chip);margin:0}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: unknown): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = toText(text);
  return e;
}

/**
 * Display text for any value. Never HTML. Capture stamps and ISO date-times read as dates;
 * numbers are digit-grouped except year-like integers (field-aware formatting: formatValue).
 */
export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return formatTimestamp(v) ?? v;
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(toText).join(', ');
  try { return JSON.stringify(v); } catch { return ''; }
}

/** An http(s) URL, or null. Anything else (javascript:, data:, relative) is refused. */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const asObject = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const errCode = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'error');

/** A value for display, with the component's format and what is known about its field. */
function formatValue(v: unknown, p: Props, field?: { name?: string; schema?: Record<string, unknown>; format?: unknown }): string {
  const format = str(field?.format) || str(p.format, 'text');
  if (typeof v === 'number') {
    if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: str(p.currency, 'USD'), maximumFractionDigits: 0 }).format(v);
    if (format === 'percent') return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(v);
    return formatNumber(v, { name: field?.name, schema: field?.schema, format }) + str(p.suffix);
  }
  return toText(v) + str(p.suffix);
}

/** `formatValue` of `field` of `o`, with the field's schema from the binding. */
function fieldValue(o: unknown, field: string, p: Props, ctx: Ctx, format?: unknown): string {
  return formatValue(getField(o, field || undefined), p, { name: field.split('.').pop(), schema: schemaOfField(ctx.schema, field), format });
}

function formatDate(v: unknown): string {
  const ts = formatTimestamp(v);
  if (ts) return ts;
  if (typeof v !== 'string' && typeof v !== 'number') return toText(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? toText(v) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function empty(p: Props, d = 'Nothing here yet.') { return el('p', 'sk-empty', str(p.emptyText, d)); }

type Renderer = (section: HTMLElement, c: Component, data: unknown, ctx: Ctx) => void | Promise<void>;

const RENDERERS: Record<string, Renderer> = {
  header(s, c, data) {
    const p = c.props, o = asObject(data);
    s.append(el('h2', '', p.titleField ? getField(o, str(p.titleField)) : str(p.title, c.title)));
    const sub = p.subtitleField ? getField(o, str(p.subtitleField)) : p.subtitle;
    if (sub !== undefined && sub !== '') s.append(el('p', '', sub));
  },
  stat(s, c, data, ctx) {
    const p = c.props;
    let text: string;
    if (p.aggregate === 'count') text = formatValue(asArray(data).length, p, { format: 'integer' });
    else if (p.aggregate === 'sum') text = formatValue(asArray(data).reduce<number>((a, it) => a + num(getField(it, str(p.field) || undefined), 0), 0), p, { format: str(p.format) || 'number' });
    else text = fieldValue(asObject(data), str(p.field), p, ctx);
    s.append(el('div', 'sk-value', text));
    if (p.label) s.append(el('p', 'sk-muted', p.label));
  },
  list(s, c, data, ctx) {
    const p = c.props, items = asArray(data).slice(0, num(p.limit, 10));
    if (!items.length) { s.append(empty(p)); return; }
    const ul = el('ul', 'sk-list');
    for (const it of items) {
      const li = el('li');
      const title = getField(it, str(p.titleField) || undefined);
      const href = p.linkField ? safeUrl(getField(it, str(p.linkField))) : null;
      if (href) { const a = el('a', '', title); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); }
      else li.append(el('span', '', title));
      if (p.subtitleField) li.append(el('span', 'sk-sub', getField(it, str(p.subtitleField))));
      if (p.metaField) li.append(el('span', 'sk-meta', fieldValue(it, str(p.metaField), p, ctx)));
      ul.append(li);
    }
    s.append(ul);
  },
  card(s, c, data, ctx) {
    const p = c.props, o = asObject(data);
    if (o === undefined || o === null) { s.append(empty(p)); return; }
    const box = el('div', 'sk-card-box');
    if (p.titleField) box.append(el('strong', '', getField(o, str(p.titleField))));
    if (p.bodyField) box.append(el('p', 'sk-muted', getField(o, str(p.bodyField))));
    const fields = Array.isArray(p.fields) ? p.fields.filter((f): f is string => typeof f === 'string') : [];
    if (fields.length) {
      const dl = el('dl', 'sk-dl');
      for (const f of fields) dl.append(el('dt', '', fieldLabel(f, undefined, schemaOfField(ctx.schema, f))), el('dd', '', fieldValue(o, f, {}, ctx)));
      box.append(dl);
    }
    const href = p.linkField ? safeUrl(getField(o, str(p.linkField))) : null;
    if (href) { const a = el('a', '', str(p.linkLabel, 'Open')); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.append(a); }
    s.append(box);
  },
  table(s, c, data, ctx) {
    const p = c.props, rows = asArray(data).slice(0, num(p.limit, 20));
    const cols = (Array.isArray(p.columns) ? p.columns : []) as Array<{ field?: unknown; label?: unknown; format?: unknown }>;
    if (!rows.length) { s.append(empty(p)); return; }
    const t = el('table', 'sk-table'), head = el('tr');
    for (const col of cols) head.append(el('th', '', fieldLabel(str(col.field), col.label, schemaOfField(ctx.schema, str(col.field)))));
    t.append(el('thead')); t.tHead!.append(head);
    const body = el('tbody');
    for (const r of rows) {
      const tr = el('tr');
      for (const col of cols) tr.append(el('td', '', fieldValue(r, str(col.field), p, ctx, col.format)));
      body.append(tr);
    }
    t.append(body);
    s.append(t);
  },
  timeline(s, c, data) {
    const p = c.props, items = asArray(data).slice(0, num(p.limit, 10));
    if (!items.length) { s.append(empty(p)); return; }
    const ol = el('ol', 'sk-timeline');
    for (const it of items) {
      const li = el('li');
      const when = getField(it, str(p.dateField) || undefined);
      const t = el('time', '', formatDate(when));
      if (typeof when === 'string') t.dateTime = when;
      li.append(t, el('strong', '', getField(it, str(p.titleField) || undefined)));
      if (p.bodyField) li.append(el('p', 'sk-muted', getField(it, str(p.bodyField))));
      ol.append(li);
    }
    s.append(ol);
  },
  detail(s, c, data, ctx) {
    const p = c.props, o = asObject(data);
    const fields = (Array.isArray(p.fields) ? p.fields : []) as Array<{ field?: unknown; label?: unknown; format?: unknown }>;
    if (o === undefined || o === null) { s.append(empty(p)); return; }
    // The section is `.sk-detail`; the grid is the inner `<dl class="sk-dl">` only.
    const dl = el('dl', 'sk-dl');
    for (const f of fields) {
      const name = str(f.field);
      dl.append(el('dt', '', fieldLabel(name, f.label, schemaOfField(ctx.schema, name))), el('dd', '', fieldValue(o, name, p, ctx, f.format)));
    }
    s.append(dl);
  },
  form(s, c, _data, ctx) {
    const p = c.props;
    const form = el('form');
    const fields = (Array.isArray(p.fields) ? p.fields : []) as Array<{ name?: unknown; label?: unknown; type?: unknown; options?: unknown; required?: unknown }>;
    for (const f of fields) {
      const name = str(f.name);
      if (!name) continue;
      const label = el('label', '', str(f.label, name));
      let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (f.type === 'textarea') input = el('textarea');
      else if (f.type === 'select') {
        input = el('select');
        for (const o of Array.isArray(f.options) ? f.options : []) { const opt = el('option', '', o); opt.value = typeof o === 'string' ? o : toText(o); input.append(opt); }
      } else { input = el('input'); input.type = f.type === 'number' ? 'number' : 'text'; }
      input.name = name;
      if (f.required === true) input.required = true;
      label.append(input);
      form.append(label);
    }
    const btn = el('button', '', str(p.submitLabel, 'Save'));
    btn.type = 'submit';
    const status = el('p', 'sk-status');
    status.setAttribute('aria-live', 'polite');
    form.append(btn, status);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const values: Record<string, unknown> = {};
      for (const f of fields) {
        const name = str(f.name);
        const input = form.elements.namedItem(name) as HTMLInputElement | null;
        if (!input) continue;
        values[name] = f.type === 'number' && input.value !== '' ? Number(input.value) : input.value;
      }
      try {
        if (p.composeTagType) {
          await ctx.tab.tags.compose(str(p.composeTagType), values);
          status.textContent = 'Review and post it in the Canopi composer.';
        } else {
          await ctx.tab.storage.set(`form:${c.id}`, values);
          status.textContent = 'Saved';
        }
      } catch (e) {
        status.textContent = `Could not submit (${errCode(e)})`;
      }
    });
    s.append(form);
  },
  action(s, c, data, ctx) {
    const p = c.props, label = str(p.label, c.title || 'Open');
    if (p.kind === 'link') {
      const href = safeUrl(p.urlField ? getField(asObject(data), str(p.urlField)) : p.url);
      if (!href) { s.append(el('p', 'sk-muted', 'No link available.')); return; }
      const a = el('a', 'sk-button', label);
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      s.append(a);
      return;
    }
    const btn = el('button', '', label);
    btn.type = 'button';
    const status = el('p', 'sk-status');
    btn.addEventListener('click', async () => {
      try {
        if (p.kind === 'openTab') await ctx.tab.ui.openTab(str(p.tabId));
        else if (p.kind === 'compose') {
          await ctx.tab.tags.compose(str(p.tagType), (p.data && typeof p.data === 'object' ? p.data : {}) as Record<string, unknown>);
          status.textContent = 'Review and post it in the Canopi composer.';
        }
      } catch (e) { status.textContent = `Could not do that (${errCode(e)})`; }
    });
    s.append(btn, status);
  },
  sparkline(s, c, data, ctx) {
    const p = c.props;
    const values = asArray(data).map((it) => getField(it, str(p.field) || undefined)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) { s.append(empty(p, 'Not enough data.')); return; }
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 30');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${str(p.label, c.title)}: ${values.map((v) => toText(v)).join(', ')}`);
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - min) / span) * 26).toFixed(2)}`).join(' '));
    svg.append(line);
    const wrap = el('div', 'sk-spark');
    wrap.append(svg);
    s.append(wrap, el('p', 'sk-muted', `${str(p.label)}${p.label ? ': ' : ''}${formatValue(values[values.length - 1], p, { name: str(p.field).split('.').pop(), schema: schemaOfField(ctx.schema, str(p.field)) })}`));
  },
  async 'tag-feed'(s, c, _data, ctx) {
    const p = c.props;
    try {
      const items = await ctx.tab.tags.list(str(p.tagType), { limit: num(p.limit, 10), scope: p.scope === 'all' ? 'all' : 'page' });
      if (!items.length) { s.append(empty(p, 'No tags on this page yet.')); return; }
      const ul = el('ul', 'sk-feed');
      for (const it of items) {
        const li = el('li', '', it.summary);
        li.append(el('span', 'sk-sub', `@${it.author?.handle ?? ''}`));
        ul.append(li);
      }
      s.append(ul);
    } catch (e) {
      s.append(el('p', 'sk-error', `Tags unavailable (${errCode(e)})`));
    }
  },
  'ask-deepi'(s, c, _data, ctx) {
    const p = c.props;
    const form = el('form');
    const input = el('input');
    input.type = 'text';
    input.name = 'q';
    input.placeholder = str(p.placeholder, 'Ask Deepi about this page…');
    const btn = el('button', '', 'Ask');
    btn.type = 'submit';
    const answer = el('p', 'sk-answer');
    answer.hidden = true;
    const chips = el('div', 'sk-chips');
    for (const q of Array.isArray(p.suggestions) ? p.suggestions : []) {
      const b = el('button', '', q);
      b.type = 'button';
      b.addEventListener('click', () => { input.value = typeof q === 'string' ? q : toText(q); });
      chips.append(b);
    }
    form.append(input, btn);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      answer.hidden = false;
      if (!ctx.askDeepi) { answer.textContent = "Deepi isn't connected in this build."; return; }
      answer.textContent = 'Thinking…';
      try { answer.textContent = await ctx.askDeepi(q); } catch (e) { answer.textContent = `Deepi is unavailable (${errCode(e)})`; }
    });
    s.append(chips, form, answer);
  },
};

/** Render one component into a new section. Data errors show in the section, never throw. */
export async function renderComponent(c: Component, data: unknown, ctx: Ctx): Promise<HTMLElement> {
  const s = el('section', `sk-c sk-${/^[a-z-]+$/.test(c.type) ? c.type : 'unknown'}`);
  s.dataset.cmp = c.id;
  if (c.title && c.type !== 'header') s.append(el('h3', '', c.title));
  const r = RENDERERS[c.type];
  if (!r) { s.append(el('p', 'sk-error', `Unsupported component "${c.type}"`)); return s; }
  await r(s, c, data, ctx);
  return s;
}

function pageParams(ctx: { url: string; title: string } | null): Record<string, string> {
  if (!ctx) return {};
  const out: Record<string, string> = { pageUrl: ctx.url, pageTitle: ctx.title };
  try { const u = new URL(ctx.url); Object.assign(out, { pageOrigin: u.origin, pageHost: u.hostname, pagePath: u.pathname }); } catch { /* not a URL */ }
  return out;
}

/** Render `design.sidebar.layout` in order into `root`, and re-render on page changes. */
export async function renderSidebar(root: HTMLElement, project: Pick<StudioProject, 'components' | 'design'>, opts: RenderOptions): Promise<SidebarHandle> {
  const { tab } = opts;
  const sources: Record<string, DataSource> = Array.isArray(opts.sources) ? Object.fromEntries(opts.sources.map((s) => [s.id, s])) : opts.sources;
  const byId = new Map(project.components.map((c) => [c.id, c]));
  const layout = (project.design?.sidebar?.layout ?? []).map((id) => byId.get(id)).filter((c): c is Component => !!c && c.surface === 'sidebar' && c.status !== 'rejected');
  const ctx: Ctx = { tab, askDeepi: opts.askDeepi };

  root.classList.add('sk-root');
  const accent = project.design?.theme?.accent;
  if (accent && ACCENT.test(accent)) root.style.setProperty('--sk-accent', accent);
  const setTheme = (t: string) => root.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  try { setTheme(await tab.theme.get()); } catch { setTheme('dark'); }
  const offTheme = tab.theme.onChange(setTheme);

  let page: { url: string; title: string } | null = null;
  try { page = await tab.page.getContext(); } catch { page = null; }
  let generation = 0;

  async function refresh(): Promise<void> {
    const mine = ++generation;
    const params = { ...pageParams(page), ...(opts.params ?? {}) };
    const fetches = new Map<string, Promise<unknown>>();
    const sections = await Promise.all(layout.map(async (c) => {
      let data: unknown;
      let schema: Record<string, unknown> | undefined;
      if (c.binding?.sourceId) {
        const src = sources[c.binding.sourceId];
        try {
          if (!src) throw new Error(`no source "${c.binding.sourceId}"`);
          if (!fetches.has(src.id)) fetches.set(src.id, src.fetch(params));
          data = resolveBinding(await fetches.get(src.id), c.binding.path || '$');
          schema = schemaAtPath(src.schema, c.binding.path || '$');
        } catch {
          const s = el('section', 'sk-c');
          s.dataset.cmp = c.id;
          if (c.title) s.append(el('h3', '', c.title));
          s.append(el('p', 'sk-error', `Couldn't load ${c.binding.sourceId}`));
          return s;
        }
      }
      return renderComponent(c, data, schema ? { ...ctx, schema } : ctx);
    }));
    if (mine === generation) root.replaceChildren(...sections);
  }

  const offPage = tab.page.onContextChange((next) => { page = next; void refresh(); });
  await refresh();
  return { refresh, destroy() { offTheme(); offPage(); generation++; root.replaceChildren(); } };
}
