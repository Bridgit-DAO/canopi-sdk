/**
 * Helpers for the canopi-studio skill: create, validate, preview and scaffold a StudioProject
 * (studio/<slug>/project.json) with @canopi-sdk/studio-kit. The CLI is studio.mjs; tests are
 * studio.test.ts. Needs the workspace built (`npm run build`): the preview inlines studio-kit's
 * browser bundle from packages/studio-kit/dist/vendor.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MANIFEST_SCHEMA_V2 } from '@canopi-sdk/manifest';
import { CATALOGUE, pickFixture, scaffoldModules, validateProject } from '@canopi-sdk/studio-kit';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The canopi-sdk checkout this skill lives in (the directory with packages/studio-kit). */
export function findRepoRoot(start = HERE) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'packages', 'studio-kit', 'package.json')) && fs.existsSync(path.join(dir, 'scripts', 'build-module.mjs'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('could not find the canopi-sdk root (packages/studio-kit and scripts/build-module.mjs)');
    dir = up;
  }
}

export const SLUG = /^[a-z][a-z0-9-]{1,39}$/;

/** studio/<slug>/project.json under the repo root. */
export function projectPath(slug, repoRoot = findRepoRoot()) {
  return path.join(repoRoot, 'studio', slug, 'project.json');
}

export function loadProject(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Write the project with a fresh updatedAt (2-space JSON, trailing newline). */
export function saveProject(file, project) {
  project.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(project, null, 2)}\n`);
}

/** A new, valid, empty project at stage "intake". */
export function newProject({ slug, name, url, notes } = {}) {
  if (!SLUG.test(String(slug ?? ''))) throw new Error(`slug "${slug}" must be kebab-case: ^[a-z][a-z0-9-]{1,39}$`);
  const now = new Date().toISOString();
  const source = {};
  if (url) source.url = url;
  if (notes) source.notes = notes;
  return {
    schemaVersion: 1,
    id: randomUUID(),
    slug,
    name: name || slug,
    stage: 'intake',
    source,
    ideas: [],
    components: [],
    dataSources: [],
    feedback: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** ajv, resolved the way studio-kit resolves it (studio-kit depends on it; the skill adds nothing). */
let fixtureAjv = null;
function ajvFor(repoRoot) {
  if (!fixtureAjv) {
    const req = createRequire(path.join(repoRoot, 'packages', 'studio-kit', 'package.json'));
    const mod = req('ajv/dist/2020.js');
    const Ajv2020 = mod.Ajv2020 ?? mod.default ?? mod;
    fixtureAjv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  }
  return fixtureAjv;
}

/**
 * Checks validateProject can't make, as warnings: each fixture response against its source's
 * `schema` (the web Studio refuses mismatches), a default fixture per source, and a smart tag
 * with no `bridge` source of sample instances (the preview would show no pills).
 */
export function projectHints(project, repoRoot = findRepoRoot()) {
  const out = [];
  const ajv = ajvFor(repoRoot);
  (project.dataSources ?? []).forEach((s, i) => {
    let check = null;
    try { check = ajv.compile(s.schema ?? {}); } catch (e) { out.push({ path: `/dataSources/${i}/schema`, message: `schema does not compile: ${e instanceof Error ? e.message : String(e)}` }); }
    (s.fixtures ?? []).forEach((f, j) => {
      if (check && !check(f.response)) out.push({ path: `/dataSources/${i}/fixtures/${j}/response`, message: `does not match the source schema: ${(check.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}` });
    });
    if ((s.fixtures ?? []).length && !(s.fixtures ?? []).some((f) => !f.params || Object.keys(f.params).length === 0)) out.push({ path: `/dataSources/${i}/fixtures`, message: 'no default fixture (one without params): pages that match no fixture get the first one' });
  });
  const st = project.design?.smartTag;
  const bridgeAt = (project.dataSources ?? []).findIndex((s) => s.kind === 'bridge');
  if (st?.payloadSchema && bridgeAt >= 0) {
    let check = null;
    try { check = ajv.compile(st.payloadSchema); } catch (e) { out.push({ path: '/design/smartTag/payloadSchema', message: `does not compile: ${e instanceof Error ? e.message : String(e)}` }); }
    (project.dataSources[bridgeAt].fixtures ?? []).forEach((f, j) => {
      const items = Array.isArray(f.response) ? f.response : Array.isArray(f.response?.items) ? f.response.items : [];
      items.forEach((item, k) => {
        const data = item && typeof item === 'object' && wrapped(item) ? item.data : item;
        if (check && !check(data)) out.push({ path: `/dataSources/${bridgeAt}/fixtures/${j}/response/${k}`, message: `sample tag payload fails design.smartTag.payloadSchema: ${(check.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}${e.params && 'additionalProperty' in e.params ? ` (${e.params.additionalProperty})` : ''}`).join('; ')}` });
      });
    });
  }
  if (project.design?.smartTag && !(project.dataSources ?? []).some((s) => s.kind === 'bridge')) out.push({ path: '/dataSources', message: 'the smart tag has no bridge source of sample instances: the preview will show no pills' });
  return out;
}

/** validateProject, plus projectHints as warnings, with a printable report. */
export function checkProject(project, { repoRoot } = {}) {
  const r = validateProject(project);
  const warnings = [...r.warnings];
  if (r.ok) warnings.push(...projectHints(project, repoRoot));
  const lines = [];
  for (const e of r.errors) lines.push(`error   ${e.path}  ${e.message}`);
  for (const w of warnings) lines.push(`warning ${w.path}  ${w.message}`);
  const counts = `${r.errors.length} error(s), ${warnings.length} warning(s)`;
  const head = r.ok ? `valid (stage ${project?.stage ?? '?'}): ${counts}` : `INVALID: ${counts}`;
  return { ...r, warnings, text: [head, ...lines].join('\n') };
}

const MERGE_KEYS = new Set(['name', 'stage', 'source', 'ideas', 'components', 'dataSources', 'design', 'feedback']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Merge a stage's output into a copy of the project, like the web Studio's PATCH: `ideas`,
 * `components` and `dataSources` merge item by item by `id` (new ids are appended; fields of an
 * existing item are replaced one by one), `source` and `design` merge one level deep (a `null`
 * value removes a key), `feedback` entries are appended (`at` filled in), `name` and `stage` are set.
 * Returns { project } or { error } for a fragment it can't take. Validate the result before saving.
 */
export function mergeProject(project, fragment) {
  if (!isObj(fragment)) return { error: 'the fragment must be a JSON object' };
  const bad = Object.keys(fragment).filter((k) => !MERGE_KEYS.has(k));
  if (bad.length) return { error: `cannot merge ${bad.join(', ')} (allowed: ${[...MERGE_KEYS].join(', ')})` };
  const p = JSON.parse(JSON.stringify(project));
  for (const [k, v] of Object.entries(fragment)) {
    if (k === 'name' || k === 'stage') p[k] = v;
    else if (k === 'feedback') {
      if (!Array.isArray(v)) return { error: 'feedback must be an array of { stage, text }' };
      for (const f of v) p.feedback.push({ at: new Date().toISOString(), ...f });
    } else if (k === 'source' || k === 'design') {
      if (!isObj(v)) return { error: `${k} must be an object` };
      p[k] = { ...(p[k] ?? {}) };
      for (const [kk, vv] of Object.entries(v)) { if (vv === null && k === 'source') delete p[k][kk]; else p[k][kk] = vv; }
    } else {
      if (!Array.isArray(v)) return { error: `${k} must be an array of items with an id` };
      const list = p[k];
      for (const item of v) {
        if (!isObj(item) || typeof item.id !== 'string') return { error: `every ${k} item needs an id` };
        const i = list.findIndex((x) => x.id === item.id);
        if (i === -1) list.push(item); else list[i] = { ...list[i], ...item };
      }
    }
  }
  return { project: p };
}

// ---------------------------------------------------------------------------------------------
// Catalogue: what the components and design stages may use
// ---------------------------------------------------------------------------------------------

function propLine(name, schema, required) {
  let t = schema.enum ? schema.enum.join('|') : schema.const ?? schema.type ?? 'any';
  if (schema.type === 'array' && schema.items) {
    const it = schema.items;
    t = it.type === 'object' ? `[{${Object.keys(it.properties ?? {}).join(', ')}}]` : `${it.type ?? 'any'}[]`;
  }
  return `${name}${required.includes(name) ? '*' : ''}: ${t}`;
}

/** Trigger types from the manifest schema (the source of truth). */
export function triggerTypes() {
  const out = [];
  for (const v of MANIFEST_SCHEMA_V2.properties.triggers.items.oneOf) {
    const t = v.properties.type;
    const extra = Object.keys(v.properties).filter((k) => k !== 'type');
    for (const name of t.enum ?? [t.const]) out.push(extra.length ? `${name} {${extra.join(', ')}}` : name);
  }
  return out;
}

/** A compact, printable catalogue: component, binding shape, props (* = required). */
export function catalogueText() {
  const block = (title, list) => [
    title,
    ...list.map((e) => {
      const ps = e.propsSchema;
      const props = Object.entries(ps.properties ?? {}).map(([k, s]) => propLine(k, s, ps.required ?? []));
      return `  ${e.type}  [binding: ${e.binding}]  ${e.description}\n      props: ${props.join('; ') || '(none)'}`;
    }),
  ].join('\n');
  return [
    block('SIDEBAR components (tablication; fields are fields of the bound item, dots for nesting):', CATALOGUE.sidebar),
    '',
    block('SMART-TAG components (manifest Blocks; fields are camelCase payload fields, no dots):', CATALOGUE.smartTag),
    '',
    `TRIGGERS: ${triggerTypes().join(', ')}`,
    `STAGES: ${CATALOGUE.stages.join(' > ')}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Preview model: stand-in pages and smart-tag instances
// ---------------------------------------------------------------------------------------------

/** A readable stand-in title: the last path segment ("Link_rot" -> "Link rot"), else the host. */
function titleFromUrl(u) {
  try {
    const x = new URL(u);
    const seg = decodeURIComponent(x.pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ').trim();
    return seg ? `${seg} · ${x.hostname}` : x.hostname;
  } catch { return ''; }
}

/**
 * The pages the preview can switch between: one per distinct page-param fixture (pageUrl,
 * pageHost[+pagePath], pageTitle), then the project's own URL as "any other page" (the default
 * fixture answers there).
 */
export function pageContexts(project) {
  const base = project.source?.url || `https://${project.slug}.example/`;
  const fallbackTitle = project.source?.extracted?.title || project.name;
  const out = [];
  const seen = new Set();
  const add = (url, title) => {
    const k = `${url}\n${title}`;
    if (!seen.has(k)) { seen.add(k); out.push({ url, title }); }
  };
  for (const s of project.dataSources ?? []) {
    for (const f of s.fixtures ?? []) {
      const p = f.params ?? {};
      if (!p.pageUrl && !p.pageHost && !p.pageTitle && !p.pagePath && !p.pageOrigin) continue;
      let url = p.pageUrl;
      if (!url && (p.pageHost || p.pageOrigin)) url = `${p.pageOrigin || `https://${p.pageHost}`}${p.pagePath || '/'}`;
      if (!url && p.pagePath) url = new URL(p.pagePath, base).toString();
      url = url || base;
      add(url, p.pageTitle || titleFromUrl(url) || fallbackTitle);
    }
  }
  add(base, fallbackTitle);
  return out;
}

/** Page params exactly as studio-kit's renderSidebar sends them. */
export function pageParams(ctx) {
  const out = { pageUrl: ctx.url, pageTitle: ctx.title };
  try { const u = new URL(ctx.url); Object.assign(out, { pageOrigin: u.origin, pageHost: u.hostname, pagePath: u.pathname }); } catch { /* not a URL */ }
  return out;
}

/** Fill a smart-tag summary template ("{{field}}: {{other}}") from a payload. */
export function renderSummary(template, data) {
  return String(template ?? '').replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_m, k) => {
    const v = data?.[k];
    return v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  });
}

/** The sample items of the first `bridge` source's fixture for these params: an array or `{ items }`. */
function bridgeItems(project, params) {
  const src = (project.dataSources ?? []).find((s) => s.kind === 'bridge');
  if (!src) return [];
  const fx = pickFixture(src.fixtures, params);
  const raw = Array.isArray(fx?.response) ? fx.response : Array.isArray(fx?.response?.items) ? fx.response.items : [];
  return raw.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
}

/** An item is a bare payload, or `{ anchorText?, data, ...TagInstance fields }`. */
const wrapped = (item) => item.data !== null && typeof item.data === 'object' && !Array.isArray(item.data);

/**
 * Smart-tag instances on a page, from the project's first `bridge` data source (a bridge source
 * stands for tags.list). Each fixture item is a bare payload, or `{ anchorText, data }` (any
 * other TagInstance field may be given too). `anchorText` is the text the tag is anchored to.
 */
export function tagInstances(project, ctx) {
  const st = project.design?.smartTag;
  if (!st) return [];
  const summaryTpl = st.summary ?? `{{${Object.keys(st.payloadSchema?.properties ?? {})[0] ?? 'note'}}}`;
  return bridgeItems(project, ctx ? pageParams(ctx) : {}).slice(0, 20).map((item, i) => {
    const w = wrapped(item);
    const data = w ? item.data : item;
    return {
      id: String(w && item.id ? item.id : `sample-${i + 1}`),
      tagType: st.tagType,
      summary: String(w && item.summary ? item.summary : renderSummary(summaryTpl, data)),
      data,
      revision: 1,
      supersededBy: null,
      author: w && item.author ? item.author : { handle: `sample-user-${(i % 3) + 1}`, name: null },
      createdAt: w && item.createdAt ? item.createdAt : new Date(Date.UTC(2026, 10, 1 + i)).toISOString(),
      ...(w && typeof item.anchorText === 'string' ? { anchorText: item.anchorText } : {}),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Preview HTML: one self-contained file, opened from disk
// ---------------------------------------------------------------------------------------------

export function browserBundlePath(repoRoot = findRepoRoot()) {
  return path.join(repoRoot, 'packages', 'studio-kit', 'dist', 'vendor', 'studio-kit.browser.js');
}

/**
 * Turn the ESM bundle into a scoped script: its trailing `export { a, b as c }` becomes
 * `return { a, c: b }` inside `const KIT = (() => { ... })();`, so its names can't clash.
 */
export function bundleAsScript(src) {
  const m = /export\s*\{([^}]*)\};?\s*$/.exec(src);
  if (!m) throw new Error('studio-kit browser bundle has no trailing export list; rebuild it (npm run build -w packages/studio-kit)');
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [local, exported] = s.split(/\s+as\s+/);
    return exported ? `${exported}: ${local}` : local;
  });
  return `const KIT = (() => {\n${src.slice(0, m.index)}return { ${names.join(', ')} };\n})();\n`;
}

/** JSON or JS safe to inline in a <script> element. */
const inlineSafe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const jsonInline = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const PREVIEW_CSS = `
:root{--pv-bg:#f4f5f7;--pv-fg:#1f2328;--pv-muted:#57606a;--pv-line:#d0d7de;--pv-card:#fff;--pv-accent:#5b8def}
:root[data-theme="dark"]{--pv-bg:#0d1014;--pv-fg:#e8eaed;--pv-muted:#9aa0a6;--pv-line:#2c3036;--pv-card:#161a1f}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--pv-bg);color:var(--pv-fg);font:14px/1.5 system-ui,sans-serif;display:flex;flex-direction:column;min-height:100vh}
.pv-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--pv-line);background:var(--pv-card)}
.pv-bar strong{font-size:15px}.pv-bar .pv-note{color:var(--pv-muted);font-size:12px;margin-right:auto}
.pv-bar select,.pv-bar button{font:inherit;font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--pv-line);background:var(--pv-bg);color:var(--pv-fg)}
.pv-main{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 380px;min-height:0}
.pv-host{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--pv-line)}
.pv-url{margin:10px 14px 0;padding:6px 12px;border-radius:999px;background:var(--pv-card);border:1px solid var(--pv-line);color:var(--pv-muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-page{margin:12px 14px 14px;padding:24px 28px;background:var(--pv-card);border:1px solid var(--pv-line);border-radius:10px;overflow:auto;flex:1}
.pv-page h1{margin:0 0 8px;font-size:24px}.pv-page .pv-kicker{color:var(--pv-muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.pv-page p{max-width:68ch}.pv-muted{color:var(--pv-muted);font-size:13px}.pv-bar select{max-width:420px}.pv-mention{position:relative}
.pv-pill{display:inline-flex;gap:4px;align-items:center;margin-left:6px;padding:1px 8px;border-radius:999px;border:1px solid var(--pv-accent);background:color-mix(in srgb,var(--pv-accent) 14%,transparent);color:inherit;font:inherit;font-size:12px;cursor:pointer;vertical-align:baseline}
.pv-pop{position:absolute;z-index:5;left:0;top:1.8em;width:320px;padding:12px;border-radius:10px;background:var(--pv-card);border:1px solid var(--pv-line);box-shadow:0 8px 28px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:8px;font-size:13px}
.pv-pop[hidden],#pv-toast[hidden]{display:none}.pv-pop h4{margin:0;font-size:13px}.pv-pop .pv-lbl{color:var(--pv-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;display:block}
.pv-pop blockquote{margin:0;padding-left:8px;border-left:3px solid var(--pv-accent)}
.pv-pop .pv-badge{align-self:flex-start;padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--pv-accent) 20%,transparent)}
.pv-pop dl{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:0}.pv-pop dt{color:var(--pv-muted)}.pv-pop dd{margin:0}
.pv-pop progress{width:100%}.pv-pop a{color:var(--pv-accent)}
.pv-side{display:flex;flex-direction:column;min-height:0;background:#121417}
.pv-tabhead{padding:8px 12px;font-weight:600;color:#e8eaed;border-bottom:1px solid #2c3036;display:flex;gap:6px;align-items:center}
.pv-tabhead small{margin-left:auto;font-weight:400;color:#9aa0a6;font-size:11px}
:root:not([data-theme="dark"]) .pv-side{background:#fff}:root:not([data-theme="dark"]) .pv-tabhead{color:#1f2328;border-color:#d0d7de}
#pv-tab{flex:1;overflow:auto;min-height:100%}
.pv-sources{padding:10px 14px 16px;border-top:1px solid var(--pv-line);background:var(--pv-card);font-size:12px}
.pv-sources table{border-collapse:collapse;width:100%}.pv-sources th,.pv-sources td{text-align:left;padding:3px 8px;border-bottom:1px solid var(--pv-line);vertical-align:top}
.pv-conf{padding:0 6px;border-radius:999px;font-size:11px}.pv-conf-documented{background:#2f9e6b33}.pv-conf-inferred{background:#d2992233}.pv-conf-invented{background:#e5534b33}
#pv-toast{position:fixed;right:16px;bottom:16px;max-width:360px;padding:10px 14px;border-radius:8px;background:#1f2328;color:#fff;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.3)}
@media (max-width:820px){.pv-main{grid-template-columns:1fr}.pv-side{min-height:520px}}
`;

/**
 * The preview page: a stand-in host page (the project's pages, with smart-tag pills and
 * popovers) and the sidebar docked on the right, drawn by studio-kit's real renderSidebar on a
 * createMockTab, with data from createMemoryDataSource over the fixtures, or from a fixture
 * server when `mockBaseUrl` is given. Every project string reaches the page through textContent.
 */
export function buildPreviewHtml(project, { mockBaseUrl = null, repoRoot = findRepoRoot(), bundleSource } = {}) {
  const bundle = bundleSource ?? fs.readFileSync(browserBundlePath(repoRoot), 'utf8');
  const client = fs.readFileSync(path.join(HERE, 'preview-client.js'), 'utf8');
  const pages = pageContexts(project).map((ctx) => ({ ...ctx, tags: tagInstances(project, ctx) }));
  const data = { project, pages, mockBaseUrl, generatedAt: new Date().toISOString() };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canopi Studio preview</title>
<style>${PREVIEW_CSS}</style>
</head>
<body>
<header class="pv-bar">
  <strong id="pv-name"></strong>
  <span class="pv-note" id="pv-note"></span>
  <label>Page <select id="pv-pages" aria-label="Stand-in page"></select></label>
  <button id="pv-theme" type="button">Theme</button>
</header>
<div class="pv-main">
  <section class="pv-host" aria-label="Stand-in host page">
    <div class="pv-url" id="pv-url"></div>
    <article class="pv-page" id="pv-page"></article>
  </section>
  <aside class="pv-side" aria-label="Canopi sidebar">
    <div class="pv-tabhead" id="pv-tabhead"></div>
    <div id="pv-tab"></div>
  </aside>
</div>
<section class="pv-sources" id="pv-sources" aria-label="Data sources"></section>
<div id="pv-toast" role="status" hidden></div>
<script type="application/json" id="studio-data">${jsonInline(data)}</script>
<script type="module">
${inlineSafe(bundleAsScript(bundle))}
${inlineSafe(client)}
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Fixture server: the mock endpoint, locally, with CORS for Origin: null
// ---------------------------------------------------------------------------------------------

/**
 * Serve each source's fixtures at `GET|POST {base}/{sourceId}` the way Studio's mock endpoint
 * does: pickFixture on the query string (GET) or JSON body (POST), CORS that answers
 * `Origin: null` (what a sandboxed tablication, or a file:// preview, sends).
 */
export function startFixtureServer(project, { port = 0, host = '127.0.0.1', delayMs = 0 } = {}) {
  const sources = new Map((project.dataSources ?? []).map((s) => [s.id, s]));
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const cors = {
      'access-control-allow-origin': origin ? String(origin) : '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'accept, content-type',
      'access-control-max-age': '600',
      vary: 'Origin',
    };
    const send = (status, body) => {
      res.writeHead(status, { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const m = /^\/mock\/([^/]+)$/.exec(url.pathname);
    if (!m) { send(404, { error: 'not_found', hint: 'GET /mock/<sourceId>' }); return; }
    const src = sources.get(decodeURIComponent(m[1]));
    if (!src) { send(404, { error: 'unknown_source' }); return; }
    if (req.method !== 'GET' && req.method !== 'POST') { send(405, { error: 'method_not_allowed' }); return; }
    const answer = (params) => {
      const f = pickFixture(src.fixtures, params);
      const go = () => (f ? send(200, f.response) : send(404, { error: 'no_fixtures' }));
      if (delayMs) setTimeout(go, delayMs); else go();
    };
    if (req.method === 'GET') { answer(Object.fromEntries(url.searchParams)); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let params = {};
      try { const j = body ? JSON.parse(body) : {}; if (j && typeof j === 'object') params = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)])); } catch { send(400, { error: 'invalid_json' }); return; }
      answer(params);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const base = `http://${host}:${addr.port}/mock`;
      resolve({ server, mockBaseUrl: base, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Scaffold: module drafts on disk, built with the real build-module.mjs
// ---------------------------------------------------------------------------------------------

/** Placeholder mock host for manifests drafted locally (validateManifest accepts it; nothing answers). */
export function defaultMockBaseUrl(project) {
  return `https://studio-mock.invalid/v1/studio/projects/${project.id}/mock`;
}

/** project.manifests as scaffoldModules would build them, or the error that stops it. */
export function draftManifests(project, { mockBaseUrl } = {}) {
  try {
    return { ok: true, manifests: scaffoldModules(project, { mockBaseUrl: mockBaseUrl ?? defaultMockBaseUrl(project) }).manifests };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Write the module directories under `outDir` (repo-relative; default studio/<slug>/draft), then
 * run `node scripts/build-module.mjs <dir>` from the repo root for each. Never submits anything.
 * `embedded: true` bakes the mock fixtures into app.js (studio-kit `data: "embedded"`): no mock host.
 */
export function scaffoldToDir(project, { repoRoot = findRepoRoot(), outDir, mockBaseUrl, author, build = true, embedded = false } = {}) {
  const dir = (outDir ?? path.join('studio', project.slug, 'draft')).replace(/\/+$/, '');
  if (path.isAbsolute(dir) || dir.split(/[\\/]/).includes('..')) throw new Error(`outDir "${dir}" must be relative to the repo root, without ".."`);
  const base = embedded ? null : mockBaseUrl ?? defaultMockBaseUrl(project);
  const result = scaffoldModules(project, { ...(embedded ? { data: 'embedded' } : { mockBaseUrl: base }), dir, ...(author ? { author } : {}) });
  const moduleDirs = [...new Set(result.files.map((f) => path.dirname(f.path)))].filter((d) => result.files.some((f) => f.path === `${d}/manifest.json`));
  for (const d of moduleDirs) fs.rmSync(path.join(repoRoot, d), { recursive: true, force: true });
  for (const f of result.files) {
    const abs = path.join(repoRoot, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content);
  }
  const builds = [];
  if (build) {
    for (const d of moduleDirs) {
      const r = spawnSync(process.execPath, ['scripts/build-module.mjs', d], { cwd: repoRoot, encoding: 'utf8' });
      builds.push({ dir: d, ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() });
    }
  }
  return { files: result.files.map((f) => f.path), moduleDirs, builds, manifests: result.manifests, mockBaseUrl: base };
}
