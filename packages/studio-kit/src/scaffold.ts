/**
 * Scaffold generator: a StudioProject in, ManifestV2 module directories out, in the same shape
 * as modules/page-notes (tablication) and modules/page-note-tag (smart tag), ready for
 * `node scripts/build-module.mjs modules/<dir>`. Pure: returns files, writes nothing.
 */
import { validateManifest } from '@canopi-sdk/manifest';
import type { Block, ManifestV2, Trigger } from '@canopi-sdk/manifest';
import { SIDEBAR_CSS } from './render.js';
import { RUNTIME_SOURCE } from './generated/runtime-source.js';
import { validateProject } from './validate.js';
import type { ProjectIssue } from './validate.js';
import type { Component, DataSourceDescriptor, StudioProject } from './types.js';

export interface ScaffoldFile { path: string; content: string }

export interface ScaffoldOptions {
  /** Studio's mock endpoint base, `https://<mock host>/v1/studio/projects/:id/mock`. Required when a used source is mock. */
  mockBaseUrl?: string;
  author?: ManifestV2['author'];
  version?: string;
  /** Parent directory of the module directories (default "modules"). */
  dir?: string;
  /**
   * Where mock sources get their data in the exported tablication:
   * - "mock-host" (default): Studio's fixture endpoint at `mockBaseUrl`, whose host goes in network.connect.
   * - "embedded": the fixtures are baked into app.js and answered in memory (createMemoryDataSource);
   *   no mock host is needed or listed. Live sources are unchanged.
   */
  data?: 'mock-host' | 'embedded';
}

export interface ScaffoldResult {
  files: ScaffoldFile[];
  manifests: { tablication: ManifestV2 | null; smartTag: ManifestV2 | null };
}

export class ScaffoldError extends Error {
  constructor(message: string, public readonly issues: ProjectIssue[] = []) {
    super(issues.length ? `${message}: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}` : message);
    this.name = 'ScaffoldError';
  }
}

const CANOPI_HOST = /(^|\.)canopi\.live$/i;
const live = (c: Component) => c.status !== 'rejected';
const fromBridge = (s: DataSourceDescriptor) => s.kind === 'static' || s.kind === 'bridge';
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { throw new ScaffoldError(`mockBaseUrl "${url}" is not a URL`); }
}

/** Payload fields a list of blocks refers to (field, fields[], positionField). */
function blockFields(blocks: Block[]): Map<string, 'string' | 'number'> {
  const out = new Map<string, 'string' | 'number'>();
  for (const b of blocks) {
    const r = b as Record<string, unknown>;
    const kind = b.type === 'rating' || b.type === 'progress' ? 'number' : 'string';
    if (typeof r.field === 'string') out.set(r.field, kind);
    if (typeof r.positionField === 'string') out.set(r.positionField, 'number');
    if (Array.isArray(r.fields)) for (const f of r.fields) if (typeof f === 'string' && !out.has(f)) out.set(f, 'string');
  }
  return out;
}

function sourcesReadme(sources: DataSourceDescriptor[], mockHost: string | null, embedded: boolean): string {
  if (!sources.length) return 'This module uses no outside data.\n';
  const rows = sources.map((s) => `| \`${s.id}\` | ${oneLine(s.name)} | ${fromBridge(s) ? 'built-in fixtures' : s.mode === 'mock' ? (embedded ? 'embedded fixtures (in app.js)' : `mock (${mockHost})`) : `live (${s.live?.host})`} | ${s.confidence} | ${oneLine(s.evidence) || '—'} |`);
  return ['| Source | Name | Served by | Shape is | Evidence |', '|---|---|---|---|---|', ...rows, ''].join('\n');
}

export function scaffoldModules(project: StudioProject, opts: ScaffoldOptions = {}): ScaffoldResult {
  const v = validateProject(project);
  if (!v.ok) throw new ScaffoldError('the project is not valid', v.errors);
  const p = project;
  const dir = (opts.dir ?? 'modules').replace(/\/+$/, '');
  const data = opts.data ?? 'mock-host';
  if (data !== 'mock-host' && data !== 'embedded') throw new ScaffoldError(`data must be "mock-host" or "embedded", not "${String(data)}"`);
  const embedded = data === 'embedded';
  const version = opts.version ?? '0.1.0';
  const author = opts.author ?? { name: `${clip(p.name, 60)} (Canopi Studio draft)` };
  const byId = new Map(p.components.map((c) => [c.id, c]));
  const pick = (ids: string[] | undefined) => (ids ?? []).map((id) => byId.get(id)).filter((c): c is Component => !!c && live(c));
  const sidebarCmps = pick(p.design?.sidebar?.layout);
  const tagCmps = pick(p.design?.smartTag?.popover);
  const wantTab = !!p.design?.sidebar && sidebarCmps.length > 0;
  const wantTag = !!p.design?.smartTag;
  if (!wantTab && !wantTag) throw new ScaffoldError('nothing to scaffold: design.sidebar (with a layout) or design.smartTag is needed');

  const tabModuleId = `studio.${p.slug}.tab`;
  const tagModuleId = `studio.${p.slug}.tag`;
  const files: ScaffoldFile[] = [];
  let tablication: ManifestV2 | null = null;
  let smartTag: ManifestV2 | null = null;
  const pitch = p.ideas.filter((i) => i.selected).map((i) => oneLine(i.pitch)).filter(Boolean).join(' ');

  if (wantTab) {
    const sidebar = p.design!.sidebar!;
    const used = new Set(sidebarCmps.map((c) => c.binding?.sourceId).filter((x): x is string => !!x));
    const sources = p.dataSources.filter((s) => used.has(s.id));
    // Embedded: mock sources answer from fixtures baked into app.js, so no mock host is needed.
    const isEmbeddedMock = (s: DataSourceDescriptor) => embedded && !fromBridge(s) && s.mode === 'mock';
    const needsMock = !embedded && sources.some((s) => !fromBridge(s) && s.mode === 'mock');
    let mockHost: string | null = null;
    if (needsMock) {
      if (!opts.mockBaseUrl) throw new ScaffoldError('mockBaseUrl is required: the sidebar uses mock data sources');
      mockHost = hostOf(opts.mockBaseUrl);
      if (CANOPI_HOST.test(mockHost)) throw new ScaffoldError(`mock host "${mockHost}" is a Canopi host, which validateManifest refuses in network.connect; serve the Studio mock endpoint from a non-canopi.live host`);
    }
    const hosts = new Set<string>();
    if (mockHost) hosts.add(mockHost);
    for (const s of sources) if (!fromBridge(s) && s.mode === 'live' && s.live) hosts.add(s.live.host);

    const perms = new Set<string>(['page:context']);
    const contains = new Set<string>();
    for (const c of sidebarCmps) {
      const pr = c.props;
      if (c.type === 'tag-feed' && typeof pr.tagType === 'string') { perms.add(`tags:read:${pr.tagType}`); contains.add(pr.tagType); }
      if (c.type === 'form') perms.add(pr.composeTagType ? 'tags:compose' : 'storage:module');
      if (c.type === 'action' && pr.kind === 'compose') perms.add('tags:compose');
      if (c.type === 'action' && pr.kind === 'openTab') perms.add('ui:openTab');
    }

    tablication = {
      manifestVersion: 2,
      kind: 'tablication',
      id: tabModuleId,
      name: clip(p.name, 60),
      version,
      description: clip(pitch || `${p.name} in the Canopi sidebar. Scaffolded by Canopi Studio.`, 500),
      author,
      permissions: [...perms],
      ...(hosts.size ? { network: { connect: [...hosts] } } : {}),
      tablication: {
        tab: { id: sidebar.tab.id, title: sidebar.tab.title, ...(sidebar.tab.icon ? { icon: sidebar.tab.icon } : {}) },
        entry: { html: 'index.html' },
        ...(contains.size ? { contains: [...contains] } : {}),
      },
    };

    const runtimeProject = {
      design: { sidebar: { tab: sidebar.tab, layout: sidebarCmps.map((c) => c.id) }, ...(p.design?.theme ? { theme: p.design.theme } : {}) },
      components: sidebarCmps.map(({ id, surface, type, title, binding, props, status }) => ({ id, surface, type, title, binding: binding ?? null, props, status })),
      dataSources: sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, mode: s.mode, request: s.request, live: s.live, fixtures: fromBridge(s) || isEmbeddedMock(s) ? s.fixtures : [] })),
    };
    const base = `${dir}/${p.slug}-tab`;
    files.push(
      { path: `${base}/manifest.json`, content: `${JSON.stringify(tablication, null, 2)}\n` },
      { path: `${base}/index.html`, content: `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(sidebar.tab.title)}</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<main id="app" class="sk-root" aria-live="polite"><p class="sk-muted">Connecting to Canopi…</p></main>\n<script type="module" src="app.js"></script>\n</body>\n</html>\n` },
      { path: `${base}/style.css`, content: `html, body { margin: 0; background: #121417; }\n${SIDEBAR_CSS}` },
      {
        path: `${base}/app.js`,
        content: `// ${oneLine(p.name).replace(/\*\//g, '')}: tablication scaffolded by Canopi Studio (project ${p.id}).
// Everything goes through the canopi.tab bridge; data comes only from the hosts in network.connect.
import { connect } from './tab-bridge.js';
import { renderSidebar, createDataSource, createMemoryDataSource } from './studio-kit.js';

// Components, layout and data sources from the Studio project. To go live, set a source's
// mode to "live" with live: { baseUrl, host }, and put that host in manifest.json network.connect.
const PROJECT = ${JSON.stringify(runtimeProject, null, 2)};

const MOCK_BASE_URL = ${JSON.stringify(embedded ? null : opts.mockBaseUrl ?? null)};
${embedded ? `// Exported with embedded data: mock sources answer from their fixtures above, in memory; nothing is fetched for them.
const EMBEDDED = true;
` : `const EMBEDDED = false;
`}
const root = document.getElementById('app');
(async () => {
  try {
    const tab = await connect();
    const sources = PROJECT.dataSources.map((d) => (EMBEDDED && d.mode === 'mock'
      ? createMemoryDataSource(d)
      : createDataSource(d, { mockBaseUrl: MOCK_BASE_URL || undefined })));
    await renderSidebar(root, PROJECT, { tab, sources });
  } catch (e) {
    root.textContent = \`Could not connect to Canopi (\${e && e.code ? e.code : 'error'})\`;
  }
})();
`,
      },
      { path: `${base}/studio-kit.js`, content: RUNTIME_SOURCE },
      {
        path: `${base}/README.md`,
        content: `# ${oneLine(p.name)}: sidebar tab

Scaffolded by Canopi Studio from project \`${p.id}\`. A draft: review it, then build it with
\`node scripts/build-module.mjs ${base}\` (from the canopi-sdk root). Studio never submits modules.

Files: \`manifest.json\` (ManifestV2), \`index.html\` + \`app.js\` (entry; connects with tab-bridge
\`connect()\`), \`studio-kit.js\` (the sidebar renderers and data sources from @canopi-sdk/studio-kit),
\`style.css\`. \`tab-bridge.js\` is added by build-module.

## What is mock

${sourcesReadme(sources, mockHost, embedded)}
${mockHost ? `Mock sources are served by Studio at \`${opts.mockBaseUrl}/<source id>\` with the same response shape the real API is expected to have.\n` : ''}${embedded && sources.some(isEmbeddedMock) ? 'Exported with embedded data: the mock fixtures are in `app.js` (`PROJECT.dataSources[].fixtures`) and answered in memory, so no mock host is listed in `network.connect`.\n' : ''}
## Going live

1. In \`app.js\`, set the source's \`mode\` to \`"live"\` and \`live\` to \`{ "baseUrl": "https://api.partner.example", "host": "api.partner.example" }\`.
   The request path and query come from \`request.urlTemplate\`; \`live.baseUrl\` replaces its origin.
2. In \`manifest.json\`, replace the mock host in \`network.connect\` with the partner's host.
3. The partner API must answer CORS for \`Origin: null\` (the tab runs in a sandboxed frame) and must not
   need cookies; no credentials are sent from the tab.
`,
      },
    );
  }

  if (wantTag) {
    const st = p.design!.smartTag!;
    const blocks = tagCmps.map((c) => ({ type: c.type, ...c.props }) as Block);
    const derived = blockFields(blocks);
    if (st.pill.metricField && !derived.has(st.pill.metricField)) derived.set(st.pill.metricField, 'string');
    if (!st.payloadSchema && derived.size === 0) derived.set('note', 'string');
    const payloadSchema = st.payloadSchema ?? {
      type: 'object' as const,
      additionalProperties: false,
      properties: Object.fromEntries([...derived].map(([name, t]) => [name, t === 'number' ? { type: 'number' } : { type: 'string', maxLength: 1000 }])),
    };
    const label = clip(st.label ?? st.pill.label ?? p.name, 40);
    const firstField = Object.keys(payloadSchema.properties)[0];
    const triggerIdeas = new Set(tagCmps.map((c) => c.ideaId));
    const seen = new Set<string>();
    const triggers: Trigger[] = [];
    for (const idea of p.ideas) {
      if (!(idea.selected || triggerIdeas.has(idea.id)) || idea.kind === 'sidebar') continue;
      for (const t of idea.triggers) { const k = JSON.stringify(t); if (!seen.has(k) && triggers.length < 10) { seen.add(k); triggers.push(t); } }
    }
    const emoji = st.emoji ?? st.pill.emoji;
    smartTag = {
      manifestVersion: 2,
      kind: 'smart-tag',
      id: tagModuleId,
      name: clip(label, 60),
      version,
      description: clip(pitch || `${p.name} smart tag. Scaffolded by Canopi Studio.`, 500),
      author,
      triggers: triggers.length ? triggers : [{ type: 'page' }],
      smartTag: {
        tagType: st.tagType,
        ...(emoji ? { emoji } : {}),
        label,
        tier: 'composer',
        statusMode: 'basic',
        payloadSchema,
        summary: st.summary ?? `{{${firstField}}}`,
        presentation: {
          pill: { ...(emoji ? { emoji } : {}), label: clip(st.pill.label ?? label, 30), ...(st.pill.metricField ? { metric: { type: 'field' as const, field: st.pill.metricField } } : {}) },
          ...(blocks.length ? { popovers: [{ trigger: 'hover' as const, title: clip(label, 60), body: blocks.slice(0, 20) }] } : {}),
          onClick: tablication ? 'openTablication' : 'openFocus',
        },
        surfaces: tablication ? { discuss: 'inline', home: tabModuleId, composer: 'both' } : { discuss: 'inline', composer: 'discuss' },
      },
    };
    const base = `${dir}/${p.slug}-tag`;
    files.push(
      { path: `${base}/manifest.json`, content: `${JSON.stringify(smartTag, null, 2)}\n` },
      {
        path: `${base}/README.md`,
        content: `# ${oneLine(label)}: smart tag

Scaffolded by Canopi Studio from project \`${p.id}\`. Declarative: the host draws the pill and
popover from \`manifest.json\`; there is no code and no outside data. Validate it with
\`node scripts/build-module.mjs ${base}\` (from the canopi-sdk root).

## What is mock

Nothing at runtime. In the Studio mock-up the tag instances were sample data; real instances are
posted by people through the Canopi composer.${st.payloadSchema ? '' : ' The payload schema was derived from the fields the popover shows (all optional strings or numbers): tighten it (required fields, enums, `x-canopi-index` on up to 5 fields) before submitting.'}

## Going live

Review \`payloadSchema\`, \`summary\` and \`triggers\`, then build and submit it with your Canopi account.
`,
      },
    );
  }

  for (const [k, m] of [['tablication', tablication], ['smartTag', smartTag]] as const) {
    if (!m) continue;
    const r = validateManifest(m);
    if (!r.ok) throw new ScaffoldError(`generated ${k} manifest is invalid`, r.errors);
  }
  return { files, manifests: { tablication, smartTag } };
}
