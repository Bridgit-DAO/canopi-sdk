import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateManifest } from '@canopi-sdk/manifest';
import { RUNTIME_SOURCE, ScaffoldError, createMockTab, pickFixture, scaffoldModules } from './index.js';
import { loadSample, SAMPLE_PATH } from './test-utils.js';
import type { StudioProject } from './types.js';

const REPO = path.resolve(path.dirname(SAMPLE_PATH), '../../..');
const MOCK = 'https://studio-mock.example/v1/studio/projects/7f3c9a52-1d4e-4b8a-9c61-2e5f0b7d4a13/mock';

function writeOut(files: Array<{ path: string; content: string }>): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-kit-')));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
    fs.writeFileSync(path.join(dir, f.path), f.content);
  }
  return dir;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('scaffoldModules', () => {
  it('produces a tablication and a smart tag shaped like the reference modules', () => {
    const { files, manifests } = scaffoldModules(loadSample(), { mockBaseUrl: MOCK });
    expect(files.map((f) => f.path).sort()).toEqual([
      'modules/pinecone-crm-tab/README.md', 'modules/pinecone-crm-tab/app.js', 'modules/pinecone-crm-tab/index.html',
      'modules/pinecone-crm-tab/manifest.json', 'modules/pinecone-crm-tab/studio-kit.js', 'modules/pinecone-crm-tab/style.css',
      'modules/pinecone-crm-tag/README.md', 'modules/pinecone-crm-tag/manifest.json',
    ]);
    const tab = manifests.tablication!, tag = manifests.smartTag!;
    expect(validateManifest(tab).errors).toEqual([]);
    expect(validateManifest(tag).errors).toEqual([]);
    expect(tab.network?.connect).toEqual(['studio-mock.example']);
    expect(tab.permissions).toEqual(expect.arrayContaining(['page:context', 'tags:compose', 'tags:read:buying-signal']));
    expect(tab.permissions).not.toContain('storage:module');
    expect(tab.tablication?.contains).toEqual(['buying-signal']);
    expect(tag.smartTag?.surfaces).toEqual({ discuss: 'inline', home: tab.id, composer: 'both' });
    expect(tag.smartTag?.presentation?.popovers?.[0].body.map((b) => b.type)).toEqual(['badge', 'text', 'rating', 'link', 'author']);
    expect(tag.triggers).toEqual([{ type: 'selection', minChars: 20 }, { type: 'url-pattern', match: '*://*/news/*' }]);
    const app = files.find((f) => f.path.endsWith('app.js'))!.content;
    expect(app).toContain("import { connect } from './tab-bridge.js'");
    expect(app).not.toContain('cmp_logo_card');
    expect(files.find((f) => f.path.endsWith('studio-kit.js'))!.content).toBe(RUNTIME_SOURCE);
    expect(files.find((f) => f.path === 'modules/pinecone-crm-tab/README.md')!.content).toMatch(/What is mock[\s\S]*studio-mock\.example[\s\S]*Going live/);
  });

  it('round trip: the scaffold builds with the repo\'s real scripts/build-module.mjs', () => {
    const script = path.join(REPO, 'scripts/build-module.mjs');
    for (const need of ['packages/manifest/dist/index.js', 'packages/tab-bridge/dist/index.js']) {
      expect(fs.existsSync(path.join(REPO, need)), `${need} missing: run npm run build first`).toBe(true);
    }
    const out = writeOut(scaffoldModules(loadSample(), { mockBaseUrl: MOCK }).files);
    for (const mod of ['pinecone-crm-tab', 'pinecone-crm-tag']) {
      const dir = path.join(out, 'modules', mod);
      const log = execFileSync(process.execPath, [script, dir], { cwd: REPO, encoding: 'utf8' });
      expect(log).toContain('submission.json');
      const sub = JSON.parse(fs.readFileSync(path.join(dir, 'dist/submission.json'), 'utf8'));
      expect(sub.manifest.id).toBe(mod === 'pinecone-crm-tab' ? 'studio.pinecone-crm.tab' : 'studio.pinecone-crm.tag');
      if (mod === 'pinecone-crm-tab') expect(Object.keys(sub.bundle.files).sort()).toEqual(['README.md', 'app.js', 'index.html', 'studio-kit.js', 'style.css', 'tab-bridge.js']);
      else expect(sub.bundle).toBeUndefined();
    }
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('the exported runtime renders the exported project against a mock server', async () => {
    const p = loadSample();
    const { files } = scaffoldModules(p, { mockBaseUrl: MOCK });
    const app = files.find((f) => f.path.endsWith('app.js'))!.content;
    const project = JSON.parse(/const PROJECT = ([\s\S]*?);\n\nconst MOCK_BASE_URL/.exec(app)![1]);
    // Inside the repo (gitignored node_modules) so the test runner will load it.
    const out = path.join(REPO, 'node_modules/.cache/studio-kit-test');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'studio-kit.mjs'), RUNTIME_SOURCE);
    const runtime = await import(/* @vite-ignore */ path.join(out, 'studio-kit.mjs'));
    // A stand-in for canopi's GET /v1/studio/projects/:id/mock/:sourceId, using the same fixture rule.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url);
      const src = p.dataSources.find((s) => u.pathname === new URL(`${MOCK}/${s.id}`).pathname)!;
      return new Response(JSON.stringify(pickFixture(src.fixtures, Object.fromEntries(u.searchParams))!.response), { status: 200 });
    }));
    const tab = createMockTab({ page: { url: 'https://www.northwind-outfitters.example/', title: 'Northwind' } });
    const sources = project.dataSources.map((d: never) => runtime.createDataSource(d, { mockBaseUrl: MOCK }));
    const root = document.createElement('main');
    await runtime.renderSidebar(root, project, { tab, sources });
    expect(root.querySelectorAll('[data-cmp]')).toHaveLength(p.design!.sidebar!.layout.length);
    expect(root.textContent).toContain('Northwind Outfitters');
    expect(root.querySelector('.sk-error')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.length).toBe(4);
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('lists the live host for live sources next to the mock host', () => {
    const p = loadSample();
    p.dataSources[0].mode = 'live';
    p.dataSources[0].live = { baseUrl: 'https://api.pineconecrm.example', host: 'api.pineconecrm.example', authRef: null };
    expect(scaffoldModules(p, { mockBaseUrl: MOCK }).manifests.tablication!.network!.connect).toEqual(['studio-mock.example', 'api.pineconecrm.example']);
    for (const s of p.dataSources) { s.mode = 'live'; s.live = { baseUrl: 'https://api.pineconecrm.example', host: 'api.pineconecrm.example' }; }
    expect(scaffoldModules(p).manifests.tablication!.network!.connect).toEqual(['api.pineconecrm.example']);
  });

  it('data: "embedded" bakes the fixtures into app.js, lists no mock host and needs no mockBaseUrl', async () => {
    const p = loadSample();
    const { files, manifests } = scaffoldModules(p, { data: 'embedded' });
    const tab = manifests.tablication!;
    expect(validateManifest(tab).errors).toEqual([]);
    expect(tab.network).toBeUndefined();
    const app = files.find((f) => f.path.endsWith('app.js'))!.content;
    expect(app).toContain('const MOCK_BASE_URL = null;');
    expect(app).toContain('const EMBEDDED = true;');
    expect(app).not.toContain('studio-mock');
    const project = JSON.parse(/const PROJECT = ([\s\S]*?);\n\nconst MOCK_BASE_URL/.exec(app)![1]);
    for (const d of project.dataSources) expect(d.fixtures.length, d.id).toBeGreaterThan(0);
    expect(files.find((f) => f.path === 'modules/pinecone-crm-tab/README.md')!.content).toMatch(/embedded fixtures \(in app\.js\)/);
    // The runtime renders the embedded project with no network at all.
    const out = path.join(REPO, 'node_modules/.cache/studio-kit-test-embedded');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'studio-kit.mjs'), RUNTIME_SOURCE);
    const runtime = await import(/* @vite-ignore */ path.join(out, 'studio-kit.mjs'));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network in embedded mode'); }));
    const sources = project.dataSources.map((d: never) => runtime.createMemoryDataSource(d));
    const root = document.createElement('main');
    await runtime.renderSidebar(root, project, { tab: createMockTab({ page: { url: 'https://www.northwind-outfitters.example/', title: 'Northwind' } }), sources });
    expect(root.textContent).toContain('Northwind Outfitters');
    expect(root.querySelector('.sk-error')).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    fs.rmSync(out, { recursive: true, force: true });
  });

  it('data: "embedded" keeps live sources live and lists only their hosts', () => {
    const p = loadSample();
    p.dataSources[0].mode = 'live';
    p.dataSources[0].live = { baseUrl: 'https://api.pineconecrm.example', host: 'api.pineconecrm.example', authRef: null };
    const { files, manifests } = scaffoldModules(p, { data: 'embedded', mockBaseUrl: MOCK });
    expect(manifests.tablication!.network!.connect).toEqual(['api.pineconecrm.example']);
    const project = JSON.parse(/const PROJECT = ([\s\S]*?);\n\nconst MOCK_BASE_URL/.exec(files.find((f) => f.path.endsWith('app.js'))!.content)![1]);
    const live = project.dataSources.find((d: { id: string }) => d.id === p.dataSources[0].id);
    if (live) expect(live.fixtures).toEqual([]);
    expect(() => scaffoldModules(p, { data: 'bogus' as never })).toThrow(/data must be/);
  });

  it('the default (mock-host) app.js does not embed mock fixtures', () => {
    const app = scaffoldModules(loadSample(), { mockBaseUrl: MOCK }).files.find((f) => f.path.endsWith('app.js'))!.content;
    expect(app).toContain('const EMBEDDED = false;');
    const project = JSON.parse(/const PROJECT = ([\s\S]*?);\n\nconst MOCK_BASE_URL/.exec(app)![1]);
    for (const d of project.dataSources) if (d.kind !== 'static' && d.kind !== 'bridge' && d.mode === 'mock') expect(d.fixtures).toEqual([]);
  });

  it('refuses what validateManifest would refuse, and invalid projects', () => {
    expect(() => scaffoldModules(loadSample())).toThrow(/mockBaseUrl is required/);
    expect(() => scaffoldModules(loadSample(), { mockBaseUrl: 'https://api.canopi.live/v1/studio/projects/x/mock' })).toThrow(/Canopi host/);
    const bad = loadSample();
    bad.components[0].ideaId = 'nope';
    expect(() => scaffoldModules(bad, { mockBaseUrl: MOCK })).toThrow(ScaffoldError);
    const none = loadSample();
    none.design = {};
    expect(() => scaffoldModules(none, { mockBaseUrl: MOCK })).toThrow(/nothing to scaffold/);
  });

  it('a smart tag alone, with no payloadSchema, derives one from the popover fields', () => {
    const p: StudioProject = loadSample();
    p.design = { smartTag: { tagType: 'buying-signal', pill: { label: 'Signal', metricField: 'signal' }, popover: ['cmp_sig_badge', 'cmp_sig_note', 'cmp_sig_strength', 'cmp_sig_author'] } };
    const { files, manifests } = scaffoldModules(p);
    expect(files.map((f) => f.path)).toEqual(['modules/pinecone-crm-tag/manifest.json', 'modules/pinecone-crm-tag/README.md']);
    const st = manifests.smartTag!.smartTag!;
    expect(Object.keys(st.payloadSchema.properties)).toEqual(['signal', 'note', 'strength']);
    expect(st.payloadSchema.properties.strength).toEqual({ type: 'number' });
    expect(st.surfaces).toEqual({ discuss: 'inline', composer: 'discuss' });
    expect(validateManifest(manifests.smartTag).errors).toEqual([]);
  });

  it('escapes the project name in generated HTML', () => {
    const p = loadSample();
    p.design!.sidebar!.tab.title = '<img onerror=x>';
    const html = scaffoldModules(p, { mockBaseUrl: MOCK }).files.find((f) => f.path.endsWith('index.html'))!.content;
    expect(html).toContain('<title>&lt;img onerror=x&gt;</title>');
  });
});

describe('generated runtime', () => {
  it('src/generated/runtime-source.ts is up to date (npm run gen:runtime -w packages/studio-kit)', async () => {
    const { buildRuntimeModule, RUNTIME_OUT } = await import(/* @vite-ignore */ path.join(REPO, 'packages/studio-kit/scripts/runtime-build.mjs'));
    expect(fs.readFileSync(RUNTIME_OUT, 'utf8')).toBe(await buildRuntimeModule());
  });
});
