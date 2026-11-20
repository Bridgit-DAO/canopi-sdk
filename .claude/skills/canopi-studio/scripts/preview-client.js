// Preview page client, inlined by lib.mjs buildPreviewHtml after studio-kit's browser bundle
// (which defines KIT). Every project string reaches the page through textContent; links only
// through KIT.safeUrl. The sidebar is studio-kit's own renderSidebar on a createMockTab.
/* global KIT */
const DATA = JSON.parse(document.getElementById('studio-data').textContent);
const P = DATA.project;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = KIT.toText(text);
  return e;
};
const kitCss = document.createElement('style');
kitCss.textContent = KIT.SIDEBAR_CSS;
document.head.append(kitCss);
const ACCENT = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const accent = P.design && P.design.theme && P.design.theme.accent;
if (accent && ACCENT.test(accent)) document.documentElement.style.setProperty('--pv-accent', accent);

let theme = 'light';
let pageIndex = 0;
let tab = null;
let handle = null;

function toast(text) {
  const t = $('pv-toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---- header ---------------------------------------------------------------------------------
$('pv-name').textContent = P.name;
$('pv-note').textContent = `Canopi Studio preview · stage ${P.stage} · ${DATA.mockBaseUrl ? `data from ${DATA.mockBaseUrl}` : 'data from fixtures in memory'} · nothing here is live`;
DATA.pages.forEach((pg, i) => {
  const o = el('option', '', `${pg.title} — ${pg.url}`);
  o.value = String(i);
  $('pv-pages').append(o);
});
$('pv-pages').addEventListener('change', (e) => { pageIndex = Number(e.target.value) || 0; void show(); });
$('pv-theme').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  if (tab) tab.setTheme(theme);
});

// ---- smart-tag popover blocks (host-drawn in Canopi; drawn here the same way, as text) -----
const field = (data, f) => (data && typeof f === 'string' ? data[f] : undefined);
function block(b, inst) {
  const d = inst.data;
  const wrap = el('div');
  const label = (t) => { if (t) wrap.append(el('span', 'pv-lbl', t)); };
  switch (b.type) {
    case 'text': label(b.label); wrap.append(el('div', '', field(d, b.field))); break;
    case 'quote': wrap.append(el('blockquote', '', field(d, b.field))); break;
    case 'kv': {
      const dl = el('dl');
      for (const f of b.fields || []) { dl.append(el('dt', '', f), el('dd', '', field(d, f))); }
      wrap.append(dl);
      break;
    }
    case 'link': {
      const href = KIT.safeUrl(field(d, b.field));
      if (href) { const a = el('a', '', b.label || href); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; wrap.append(a); } else wrap.append(el('span', 'pv-lbl', `${b.label || 'link'}: none`));
      break;
    }
    case 'badge': wrap.append(el('span', 'pv-badge', field(d, b.field))); break;
    case 'rating': {
      const max = Number(b.max) || 5;
      const v = Math.max(0, Math.min(max, Math.round(Number(field(d, b.field)) || 0)));
      wrap.append(el('span', '', `${'★'.repeat(v)}${'☆'.repeat(max - v)}`));
      break;
    }
    case 'progress': {
      const pr = el('progress');
      pr.max = Number(b.max) || 100;
      pr.value = Number(field(d, b.field)) || 0;
      wrap.append(pr);
      break;
    }
    case 'author': wrap.append(el('span', 'pv-lbl', `@${inst.author && inst.author.handle}`)); break;
    case 'timestamp': wrap.append(el('span', 'pv-lbl', new Date(String(field(d, b.field) || inst.createdAt)).toLocaleString('en-US'))); break;
    case 'tally': wrap.append(el('span', 'pv-lbl', `${b.of}: 0 (drawn by the host)`)); break;
    default: wrap.append(el('span', 'pv-lbl', `${b.type} (drawn by the host)`));
  }
  return wrap;
}

function popoverBlocks() {
  const st = P.design && P.design.smartTag;
  if (!st) return [];
  const byId = new Map(P.components.map((c) => [c.id, c]));
  return (st.popover || []).map((id) => byId.get(id)).filter((c) => c && c.status !== 'rejected').map((c) => ({ type: c.type, ...c.props }));
}

function pill(inst) {
  const st = P.design.smartTag;
  const span = el('span', 'pv-mention');
  const btn = el('button', 'pv-pill');
  btn.type = 'button';
  const emoji = (st.pill && st.pill.emoji) || st.emoji;
  const metric = st.pill && st.pill.metricField ? field(inst.data, st.pill.metricField) : undefined;
  btn.textContent = [emoji, (st.pill && st.pill.label) || st.label || st.tagType, metric !== undefined && metric !== null && metric !== '' ? `· ${KIT.toText(metric)}` : ''].filter(Boolean).join(' ');
  const pop = el('div', 'pv-pop');
  pop.hidden = true;
  pop.append(el('h4', '', st.label || st.tagType), el('div', 'pv-lbl', inst.summary));
  for (const b of popoverBlocks()) pop.append(block(b, inst));
  btn.addEventListener('mouseenter', () => { pop.hidden = false; });
  span.addEventListener('mouseleave', () => { pop.hidden = true; });
  btn.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    if (P.design.sidebar) toast(`Clicking the pill opens the "${P.design.sidebar.tab.title}" tab (onClick: openTablication).`);
  });
  span.append(btn, pop);
  return span;
}

/** A word or phrase to anchor a pill to: a title-ish payload field, else the summary. */
function anchorText(inst) {
  if (typeof inst.anchorText === 'string' && inst.anchorText.trim()) return inst.anchorText;
  const d = inst.data || {};
  for (const k of ['anchorText', 'quote', 'title', 'name', 'subject', 'label']) if (typeof d[k] === 'string' && d[k].trim()) return d[k];
  return inst.summary || 'Tagged passage';
}

// ---- the stand-in host page -----------------------------------------------------------------
function hostPage(pg) {
  const x = (P.source && P.source.extracted) || {};
  const page = $('pv-page');
  page.replaceChildren();
  let host = '';
  try { host = new URL(pg.url).hostname; } catch { host = pg.url; }
  page.append(el('div', 'pv-kicker', `Stand-in for ${host}`), el('h1', '', pg.title));
  const intro = el('p', '', x.summary || P.source.notes || 'A page the person is reading. The Canopi sidebar sits to the right.');
  page.append(intro);
  const st = P.design && P.design.smartTag;
  if (st) {
    page.append(el('h2', '', 'Tagged on this page'));
    if (!pg.tags.length) page.append(el('p', 'pv-muted', `No ${st.tagType} tags on this page in the fixtures. Add a bridge data source with sample instances to show pills.`));
    for (const inst of pg.tags) {
      const p = el('p');
      p.append(document.createTextNode(`“${anchorText(inst)}”`), pill(inst));
      page.append(p);
    }
  }
  for (const pgInfo of (x.pages || []).slice(0, 4)) page.append(el('p', 'pv-muted', `${pgInfo.urlPattern}: ${pgInfo.purpose}`));
}

// ---- data sources legend --------------------------------------------------------------------
function legend() {
  const box = $('pv-sources');
  box.replaceChildren(el('strong', '', 'Data sources (shapes, and how we know them)'));
  const t = el('table');
  const head = el('tr');
  for (const h of ['Source', 'Kind', 'Mode', 'Shape is', 'Evidence']) head.append(el('th', '', h));
  t.append(head);
  for (const s of P.dataSources) {
    const tr = el('tr');
    tr.append(el('td', '', `${s.id} · ${s.name}`), el('td', '', s.kind), el('td', '', s.mode));
    const c = el('td');
    c.append(el('span', `pv-conf pv-conf-${/^[a-z]+$/.test(s.confidence) ? s.confidence : 'invented'}`, s.confidence));
    tr.append(c, el('td', '', s.evidence));
    t.append(tr);
  }
  box.append(t);
}

// ---- the sidebar: studio-kit renderSidebar on a mock CanopiTab ------------------------------
function sources() {
  return P.dataSources.map((d) => (DATA.mockBaseUrl ? KIT.createDataSource(d, { mockBaseUrl: DATA.mockBaseUrl }) : KIT.createMemoryDataSource(d, { delayMs: 120 })));
}

async function show() {
  const pg = DATA.pages[pageIndex] || DATA.pages[0];
  $('pv-url').textContent = pg.url;
  hostPage(pg);
  const sb = P.design && P.design.sidebar;
  const head = $('pv-tabhead');
  head.replaceChildren(el('span', '', sb ? `${sb.tab.icon || ''} ${sb.tab.title}`.trim() : 'No sidebar in this design'), el('small', '', 'Canopi sidebar (mock tab)'));
  if (handle) handle.destroy();
  if (tab) tab.close();
  handle = null;
  if (!sb) { $('pv-tab').replaceChildren(el('p', 'pv-muted', 'This project designs only a smart tag.')); return; }
  tab = KIT.createMockTab({ page: { url: pg.url, title: pg.title }, theme, tags: pg.tags, moduleId: `studio.${P.slug}.tab` });
  const compose = tab.tags.compose.bind(tab.tags);
  tab.tags.compose = async (tagType, data) => { const r = await compose(tagType, data); toast(`The Canopi composer would open for a "${tagType}" tag with ${JSON.stringify(data)}. The person posts it; nothing posts automatically.`); return r; };
  const openTab = tab.ui.openTab.bind(tab.ui);
  tab.ui.openTab = async (id) => { const r = await openTab(id); toast(`Canopi would open the "${id}" tab.`); return r; };
  const set = tab.storage.set.bind(tab.storage);
  tab.storage.set = async (k, v) => { const r = await set(k, v); toast(`Saved to the tab's private storage (key "${k}").`); return r; };
  handle = await KIT.renderSidebar($('pv-tab'), P, {
    tab,
    sources: sources(),
    askDeepi: async (q) => `In the real tab Deepi answers here. This preview is offline, so "${q}" goes nowhere.`,
  });
}

document.documentElement.setAttribute('data-theme', theme);
legend();
void show();
