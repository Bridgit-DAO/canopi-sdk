// Tests for the canopi-studio skill helpers, run against packages/studio-kit/fixtures/sample-project.json.
// Needs the workspace built (`npm run build`): preview inlines studio-kit's browser bundle and
// scaffold runs the real scripts/build-module.mjs.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  browserBundlePath, buildPreviewHtml, bundleAsScript, catalogueText, checkProject, draftManifests, findRepoRoot,
  mergeProject, newProject, pageContexts, projectHints, renderSummary, scaffoldToDir, startFixtureServer, tagInstances, triggerTypes,
} from './lib.mjs';

const REPO = findRepoRoot();
const SAMPLE = path.join(REPO, 'packages/studio-kit/fixtures/sample-project.json');
const load = () => JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
const XSS = '</script><img src=x onerror="window.__pwned=1">';
const NORTHWIND = 'https://www.northwind-outfitters.example/';

/** The sample plus a bridge source with two buying-signal payloads (one hostile). */
function withSignals() {
  const p = load();
  p.dataSources.push({
    id: 'src_signals', name: 'Sample buying-signal tags', kind: 'bridge', mode: 'mock', confidence: 'invented',
    evidence: 'Sample instances for the mock-up.', request: { method: 'GET', urlTemplate: 'https://tags.invalid/buying-signal', auth: 'none' },
    schema: { anyOf: [{ type: 'array' }, { type: 'object', required: ['items'] }] }, live: null,
    fixtures: [
      { params: { pageHost: 'www.northwind-outfitters.example' }, response: [{ signal: 'funding', note: `Series B ${XSS}`, strength: 4, source: 'javascript:alert(1)' }] },
      { response: { items: [{ signal: 'hiring', note: 'Hiring 12 analysts', strength: 3, source: 'https://news.example/a' }, { signal: 'expansion', note: 'EU office', strength: 2 }] } },
    ],
  });
  return p;
}

function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

describe('validate', () => {
  it('passes the sample and reports problems with paths', () => {
    const ok = checkProject(load());
    expect(ok.ok).toBe(true);
    expect(ok.text).toMatch(/^valid \(stage mockup\): 0 error\(s\)/);
    const bad = load();
    bad.components[0].binding.sourceId = 'src_missing';
    const r = checkProject(bad);
    expect(r.ok).toBe(false);
    expect(r.text).toContain('error   /components/0/binding/sourceId  unknown data source "src_missing"');
  });

  it('newProject makes a valid empty project and refuses a bad slug', () => {
    const p = newProject({ slug: 'open-library', name: 'Open Library', url: 'https://openlibrary.org/' });
    expect(checkProject(p).ok).toBe(true);
    expect(p.stage).toBe('intake');
    expect(() => newProject({ slug: 'Bad Slug' })).toThrow(/kebab-case/);
  });
});

describe('merge', () => {
  it('merges stage output by id like the web Studio PATCH, and refuses other fields', () => {
    const p = load();
    const m = mergeProject(p, {
      stage: 'components',
      ideas: [{ id: 'idea_3', selected: true }],
      components: [{ id: 'cmp_ask', status: 'rejected', feedback: 'not now' }, { id: 'cmp_new', ideaId: 'idea_1', surface: 'sidebar', type: 'header', title: 'New', purpose: 'p', binding: null, props: {}, status: 'proposed', feedback: '' }],
      design: { theme: { accent: '#123456' } },
      feedback: [{ stage: 'components', text: 'drop ask-deepi' }],
    });
    expect(m.error).toBeUndefined();
    const q = m.project;
    expect(q.stage).toBe('components');
    expect(q.ideas.find((i: { id: string }) => i.id === 'idea_3').selected).toBe(true);
    expect(q.components.find((c: { id: string }) => c.id === 'cmp_ask')).toMatchObject({ status: 'rejected', feedback: 'not now', type: 'ask-deepi' });
    expect(q.components.at(-1).id).toBe('cmp_new');
    expect(q.design.sidebar.layout).toEqual(p.design.sidebar.layout);     // design merges one level deep
    expect(q.design.theme.accent).toBe('#123456');
    expect(q.feedback.at(-1)).toMatchObject({ stage: 'components', text: 'drop ask-deepi' });
    expect(q.feedback.at(-1).at).toMatch(/^\d{4}-/);
    expect(checkProject(q).ok).toBe(true);
    expect(p.components.find((c: { id: string }) => c.id === 'cmp_ask').status).toBe('accepted'); // input untouched
    expect(mergeProject(p, { id: 'x' }).error).toMatch(/cannot merge id/);
    expect(mergeProject(p, { components: [{ status: 'accepted' }] }).error).toMatch(/needs an id/);
  });
});

describe('hints', () => {
  it('warns on fixtures that miss their schema and on sample tags that miss the payload schema', () => {
    const p = withSignals();
    p.dataSources[0].schema = { type: 'object', required: ['account'], properties: { account: { type: 'object', required: ['name'] } } };
    p.dataSources[0].fixtures[1].response = { account: {} };
    p.dataSources.at(-1).fixtures[1].response.items.push({ anchorText: 'EU', data: { signal: 'nope', note: 'x', extra: 1 } });
    const hints = projectHints(p, REPO).map((h: { path: string; message: string }) => `${h.path} ${h.message}`);
    expect(hints.some((h: string) => h.startsWith('/dataSources/0/fixtures/1/response does not match the source schema: /account must have required property'))).toBe(true);
    expect(hints.some((h: string) => h.startsWith('/dataSources/4/fixtures/1/response/2 sample tag payload fails'))).toBe(true);
    expect(projectHints(withSignals(), REPO)).toEqual([]);
    expect(projectHints(load(), REPO).map((h: { message: string }) => h.message)).toEqual(['the smart tag has no bridge source of sample instances: the preview will show no pills']);
  });
});

describe('catalogue', () => {
  it('lists every sidebar component, every smart-tag block and the manifest triggers', () => {
    const t = catalogueText();
    for (const type of ['header', 'stat', 'list', 'table', 'timeline', 'detail', 'form', 'action', 'sparkline', 'tag-feed', 'ask-deepi']) expect(t).toContain(`  ${type}  [binding:`);
    for (const type of ['text', 'kv', 'link', 'badge', 'rating', 'tally']) expect(t).toContain(`  ${type}  [binding: none]`);
    expect(triggerTypes()).toEqual(['always', 'manual', 'page', 'image', 'link', 'url-pattern {match}', 'selector {css}', 'selection {minChars}', 'anchor-present {tagTypes}', 'smart-tag-present {tagType}']);
    expect(t).toContain('columns*: [{field, label, format}]');
  });
});

describe('preview model', () => {
  it('derives pages from page-param fixtures, then the project URL', () => {
    expect(pageContexts(load())).toEqual([
      { url: NORTHWIND, title: 'www.northwind-outfitters.example' },
      { url: 'https://www.pineconecrm.example/', title: 'Pinecone CRM: the lightweight CRM for small sales teams' },
    ]);
  });

  it('reads smart-tag instances from a bridge source, page by page', () => {
    expect(tagInstances(load(), { url: NORTHWIND, title: '' })).toEqual([]);
    const p = withSignals();
    const here = tagInstances(p, { url: NORTHWIND, title: '' });
    expect(here).toHaveLength(1);
    expect(here[0]).toMatchObject({ tagType: 'buying-signal', summary: `funding: Series B ${XSS}`, supersededBy: null, revision: 1 });
    const elsewhere = tagInstances(p, { url: 'https://other.example/', title: '' });
    expect(elsewhere.map((t) => t.data.signal)).toEqual(['hiring', 'expansion']);
    p.dataSources.at(-1).fixtures[1].response.items = [{ anchorText: 'opens an EU office', data: { signal: 'expansion', note: 'EU' } }];
    const wrappedOne = tagInstances(p, { url: 'https://other.example/', title: '' })[0];
    expect(wrappedOne).toMatchObject({ anchorText: 'opens an EU office', data: { signal: 'expansion', note: 'EU' }, summary: 'expansion: EU' });
    expect(renderSummary('{{signal}}: {{missing}}', { signal: 'x' })).toBe('x: ');
  });
});

describe('preview html', () => {
  it('scopes the browser bundle so its names cannot clash, and exposes the kit', () => {
    const src = fs.readFileSync(browserBundlePath(REPO), 'utf8');
    const kit = new Function(`${bundleAsScript(src)}\nreturn KIT;`)();
    for (const k of ['renderSidebar', 'createMockTab', 'createMemoryDataSource', 'createDataSource', 'SIDEBAR_CSS', 'safeUrl']) expect(kit).toHaveProperty(k);
  });

  it('inlines the project safely and renders the real sidebar plus pills from it', async () => {
    const p = withSignals();
    p.components.find((c: { id: string }) => c.id === 'cmp_deals').title = XSS;
    const html = buildPreviewHtml(p, { repoRoot: REPO });
    // Only the two script elements the page itself opens; the project's "</script>" is escaped.
    expect(html.match(/<\/script>/gi)).toHaveLength(2);
    expect(html).not.toContain('<img src=x');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const data = JSON.parse(doc.getElementById('studio-data')!.textContent!);
    expect(data.project.components.find((c: { id: string }) => c.id === 'cmp_deals').title).toBe(XSS);
    expect(data.pages.map((x: { tags: unknown[] }) => x.tags.length)).toEqual([1, 2]);

    // Run the page's own script against its own markup.
    document.body.innerHTML = doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '');
    document.body.append(doc.getElementById('studio-data')!);
    const code = doc.querySelector('script[type="module"]')!.textContent!;
    new Function(code)();
    await new Promise((r) => setTimeout(r, 400));
    const tab = document.getElementById('pv-tab')!;
    expect(tab.textContent).toContain('Northwind Outfitters');
    expect(tab.textContent).toContain('$186,000');
    expect(tab.textContent).toContain(XSS);                   // shown as text
    expect(document.querySelector('img')).toBeNull();          // never parsed as HTML
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    const pills = [...document.querySelectorAll('.pv-pill')];
    expect(pills).toHaveLength(1);
    expect(pills[0].textContent).toBe('📈 Buying signal · funding');
    expect(document.querySelector('.pv-pop a')).toBeNull();    // javascript: link refused
    expect(document.getElementById('pv-sources')!.textContent).toContain('invented');
    expect(document.querySelectorAll('#pv-pages option')).toHaveLength(2);
  });
});

describe('fixture server', () => {
  const started: Array<() => Promise<void>> = [];
  afterAll(async () => { for (const c of started) await c(); });

  it('answers like the Studio mock endpoint, with CORS for Origin: null', async () => {
    const s = await startFixtureServer(load());
    started.push(s.close);
    const get = await request(`${s.mockBaseUrl}/src_account?pageHost=www.northwind-outfitters.example`, { headers: { origin: 'null' } });
    expect(get.status).toBe(200);
    expect(get.headers['access-control-allow-origin']).toBe('null');
    expect(JSON.parse(get.body).account.name).toBe('Northwind Outfitters');
    const fallback = await request(`${s.mockBaseUrl}/src_account?pageHost=elsewhere.example`);
    expect(JSON.parse(fallback.body).account.name).toBe('Bluefin Analytics');
    expect(fallback.headers['access-control-allow-origin']).toBe('*');
    const pre = await request(`${s.mockBaseUrl}/src_deals`, { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'POST' } });
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toContain('POST');
    const post = await request(`${s.mockBaseUrl}/src_deals`, { method: 'POST', headers: { origin: 'null', 'content-type': 'application/json' }, body: JSON.stringify({ pageHost: 'www.northwind-outfitters.example' }) });
    expect(JSON.parse(post.body).total).toBe(2);
    expect((await request(`${s.mockBaseUrl}/nope`)).status).toBe(404);
  });
});

describe('scaffold', () => {
  const out = path.join('studio', `.test-${process.pid}`, 'draft');
  afterAll(() => fs.rmSync(path.join(REPO, 'studio', `.test-${process.pid}`), { recursive: true, force: true }));

  it('drafts manifests with the placeholder mock host', () => {
    const r = draftManifests(load());
    expect(r.ok).toBe(true);
    expect(r.manifests!.tablication!.network!.connect).toEqual(['studio-mock.invalid']);
    expect(r.manifests!.smartTag!.smartTag!.tagType).toBe('buying-signal');
  });

  it('writes the module dirs and builds each with scripts/build-module.mjs', () => {
    const r = scaffoldToDir(load(), { repoRoot: REPO, outDir: out, author: { name: 'Ada Example' } });
    expect(r.manifests.tablication!.author).toEqual({ name: 'Ada Example' });
    expect(r.moduleDirs).toEqual([`${out}/pinecone-crm-tab`, `${out}/pinecone-crm-tag`]);
    expect(r.builds.map((b) => b.ok)).toEqual([true, true]);
    expect(r.builds[0].output).toMatch(/^studio\.pinecone-crm\.tab@0\.1\.0: 6 files ->/);
    const sub = JSON.parse(fs.readFileSync(path.join(REPO, out, 'pinecone-crm-tab/dist/submission.json'), 'utf8'));
    expect(Object.keys(sub.bundle.files).sort()).toEqual(['README.md', 'app.js', 'index.html', 'studio-kit.js', 'style.css', 'tab-bridge.js']);
    expect(fs.existsSync(path.join(REPO, out, 'pinecone-crm-tag/dist/submission.json'))).toBe(true);
  });

  it('--embedded bakes the fixtures into app.js and lists no mock host; the draft still builds', () => {
    const r = scaffoldToDir(load(), { repoRoot: REPO, outDir: `${out}-embedded`, embedded: true });
    expect(r.mockBaseUrl).toBeNull();
    expect(r.manifests.tablication!.network).toBeUndefined();
    expect(r.builds.map((b) => b.ok)).toEqual([true, true]);
    const app = fs.readFileSync(path.join(REPO, `${out}-embedded`, 'pinecone-crm-tab/app.js'), 'utf8');
    expect(app).toContain('const EMBEDDED = true;');
    expect(app).not.toContain('studio-mock.invalid');
  });

  it('refuses an output dir outside the repo', () => {
    expect(() => scaffoldToDir(load(), { repoRoot: REPO, outDir: '../elsewhere', build: false })).toThrow(/relative to the repo root/);
  });
});
