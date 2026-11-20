import { describe, expect, it } from 'vitest';
import { MANIFEST_SCHEMA_V2 } from '@canopi-sdk/manifest';
import { CATALOGUE, SIDEBAR_COMPONENT_TYPES, SMART_TAG_COMPONENT_TYPES, STAGES, STAGE_OUTPUT_SCHEMAS, validateProject, validateStageOutput } from './index.js';
import { loadSample } from './test-utils.js';

describe('validateProject', () => {
  it('accepts the sample project with no warnings beyond the rejected component', () => {
    const r = validateProject(loadSample());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.project?.slug).toBe('pinecone-crm');
  });

  it('reports schema errors as { path, message } like validateManifest', () => {
    const p = loadSample() as unknown as Record<string, unknown>;
    p.stage = 'launch';
    p.extra = 1;
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/stage' }),
      expect.objectContaining({ path: '/', message: expect.stringContaining('extra') }),
    ]));
    expect(validateProject(null).ok).toBe(false);
  });

  it('checks cross-references: ideas, sources, layout, surfaces, duplicates', () => {
    const p = loadSample();
    p.components[0].ideaId = 'idea_missing';
    p.components[1].binding = { sourceId: 'src_missing', path: '$.x' };
    p.components[2].binding = { sourceId: 'src_deals', path: '$..items[?(@.amount>1)]' };
    p.design!.sidebar!.layout.push('cmp_sig_badge', 'nope', 'cmp_header');
    p.components.push({ ...p.components[3] });
    const msgs = validateProject(p).errors.map((e) => `${e.path} ${e.message}`);
    expect(msgs).toEqual(expect.arrayContaining([
      '/components/0/ideaId unknown idea "idea_missing"',
      '/components/1/binding/sourceId unknown data source "src_missing"',
      expect.stringMatching(/^\/components\/2\/binding\/path .*JSONPath subset/),
      expect.stringMatching(/cmp_sig_badge" is a smart-tag component, not sidebar/),
      expect.stringMatching(/unknown component "nope"/),
      expect.stringMatching(/"cmp_header" appears twice/),
      expect.stringMatching(/duplicate id "cmp_account_detail"/),
    ]));
  });

  it('checks component type against surface and props against the catalogue', () => {
    const p = loadSample();
    p.components[0].type = 'badge';                      // a Block on the sidebar surface
    p.components.find((c) => c.id === 'cmp_sig_badge')!.props = { field: 'signal', color: 'red' };
    p.components.find((c) => c.id === 'cmp_deals')!.props = { columns: [] };
    const msgs = validateProject(p).errors.map((e) => `${e.path} ${e.message}`);
    expect(msgs).toEqual(expect.arrayContaining([
      '/components/0/type "badge" is not a sidebar component',
      expect.stringMatching(/props .*color/),
      expect.stringMatching(/cmp|\/components\/4\/props\/columns/),
    ]));
  });

  it('a live source needs live { baseUrl, host }, and embedded manifests are validated', () => {
    const p = loadSample();
    p.dataSources[0].mode = 'live';
    p.manifests = { tablication: { manifestVersion: 2 } as never, smartTag: null };
    const msgs = validateProject(p).errors.map((e) => e.path);
    expect(msgs).toContain('/dataSources/0/live');
    expect(msgs.some((m) => m.startsWith('/manifests/tablication'))).toBe(true);
  });
});

describe('catalogue', () => {
  it('smart-tag types are exactly the manifest Block primitives', () => {
    const blockVariants = MANIFEST_SCHEMA_V2.properties.smartTag.properties.presentation.properties.popovers.items.properties.body.items.oneOf;
    expect([...SMART_TAG_COMPONENT_TYPES].sort()).toEqual(blockVariants.map((v) => v.properties.type.const).sort());
    for (const e of CATALOGUE.smartTag) expect(e.description.length).toBeGreaterThan(10);
  });

  it('has the sidebar kit from the contract, each with a description and props schema', () => {
    expect([...SIDEBAR_COMPONENT_TYPES]).toEqual(['header', 'stat', 'list', 'card', 'table', 'timeline', 'detail', 'form', 'action', 'sparkline', 'tag-feed', 'ask-deepi']);
    for (const e of CATALOGUE.sidebar) {
      expect(e.description).toMatch(/\.$/);
      expect(e.propsSchema).toMatchObject({ type: 'object' });
    }
    expect(STAGES).toEqual(['intake', 'ideas', 'components', 'design', 'data', 'mockup', 'scaffold']);
    expect(JSON.parse(JSON.stringify(CATALOGUE))).toEqual(CATALOGUE);
  });
});

describe('stage output schemas', () => {
  it('accept the sample project\'s parts and reject malformed output', () => {
    const p = loadSample();
    expect(validateStageOutput('extracted', p.source.extracted).errors).toEqual([]);
    expect(validateStageOutput('ideas', { ideas: p.ideas.map(({ selected: _s, ...i }) => i) }).ok).toBe(true);
    expect(validateStageOutput('components', { components: p.components.map(({ id, ideaId, surface, type, title, purpose }) => ({ id, ideaId, surface, type, title, purpose })) }).ok).toBe(true);
    expect(validateStageOutput('design', { design: p.design, components: p.components.map(({ id, props, binding }) => ({ id, props, binding })) }).ok).toBe(true);
    expect(validateStageOutput('dataSources', { dataSources: p.dataSources }).ok).toBe(true);
    expect(validateStageOutput('ideas', { ideas: [{ id: 'x', kind: 'popup' }] }).ok).toBe(false);
    expect(validateStageOutput('ideas', [p.ideas[0]]).ok).toBe(false);
    expect(Object.keys(STAGE_OUTPUT_SCHEMAS).sort()).toEqual(['components', 'dataSources', 'design', 'extracted', 'ideas']);
  });
});
