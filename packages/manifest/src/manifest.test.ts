import { describe, expect, it } from 'vitest';
import { validateManifest, renderSummary, MAX_INDEX_FIELDS } from './index.js';
import { PATCH_MANIFEST, INSERT_MANIFEST } from './examples/patch.js';
import { TIMELINE_ITEM_MANIFEST, DISCUSS_TABLICATION_MANIFEST, OVERLAY_APP_EXAMPLE } from './examples/timeline.js';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('manifest v2: examples', () => {
  it.each([
    ['Patch (first presentation adopter)', PATCH_MANIFEST],
    ['Insert', INSERT_MANIFEST],
    ['Timeline item', TIMELINE_ITEM_MANIFEST],
    ['Discuss tablication (contains post, patch, insert)', DISCUSS_TABLICATION_MANIFEST],
  ])('%s is valid with no warnings', (_n, m) => {
    const r = validateManifest(m);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('an overlay app is valid but reserved (warning), and needs triggers + activation', () => {
    const r = validateManifest(OVERLAY_APP_EXAMPLE);
    expect(r.ok).toBe(true);
    expect(r.warnings[0].message).toMatch(/reserved/);
    const m = clone(OVERLAY_APP_EXAMPLE) as Record<string, unknown>;
    delete m.activation;
    expect(validateManifest(m).ok).toBe(false);
  });
});

describe('manifest v2: rules', () => {
  it('kind and section must match; unknown top-level fields are refused', () => {
    expect(validateManifest({ ...clone(PATCH_MANIFEST), kind: 'tablication' }).ok).toBe(false);
    expect(validateManifest({ ...clone(PATCH_MANIFEST), tablication: DISCUSS_TABLICATION_MANIFEST.tablication }).ok).toBe(false);
    const r = validateManifest({ ...clone(PATCH_MANIFEST), script: 'evil.js' });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message).join()).toContain('script');
  });

  it('templates may only use primitives (no HTML/CSS/script blocks)', () => {
    const m = clone(PATCH_MANIFEST);
    (m.smartTag!.presentation!.popovers![0].body as unknown[]).push({ type: 'html', html: '<img onerror=x>' });
    expect(validateManifest(m).ok).toBe(false);
  });

  it('every template, pill, summary and form reference must be a payload field', () => {
    const m = clone(TIMELINE_ITEM_MANIFEST);
    m.smartTag!.summary = '{{date}}: {{headline}}';
    (m.smartTag!.presentation!.popovers![0].body as Array<{ type: string; fields?: string[] }>)[0].fields = ['date', 'nope'];
    m.smartTag!.form = { order: ['ghost'] };
    const msgs = validateManifest(m).errors.map((e) => e.message);
    expect(msgs).toEqual(expect.arrayContaining(['summary refers to unknown field "headline"', 'refers to unknown field "nope"', 'unknown field "ghost"']));
  });

  it(`at most ${MAX_INDEX_FIELDS} indexed fields, of the allowed types`, () => {
    const m = clone(TIMELINE_ITEM_MANIFEST);
    const props = m.smartTag!.payloadSchema.properties;
    for (const k of ['a', 'b', 'c', 'd']) props[k] = { type: 'string', 'x-canopi-index': 'text' };
    expect(validateManifest(m).errors[0].message).toMatch(/at most 5 fields/);
    const m2 = clone(TIMELINE_ITEM_MANIFEST);
    m2.smartTag!.payloadSchema.properties.title['x-canopi-index'] = 'fulltext';
    expect(validateManifest(m2).errors[0].message).toMatch(/text, number, date, enum, ref/);
  });

  it('the payload schema is capped at 16 KB', () => {
    const m = clone(PATCH_MANIFEST);
    m.smartTag!.payloadSchema.properties.proposedText.description = 'x'.repeat(17000);
    expect(validateManifest(m).errors[0].message).toMatch(/16384/);
  });

  it('surfaces and clicks must be consistent', () => {
    const m = clone(TIMELINE_ITEM_MANIFEST);
    delete m.smartTag!.surfaces.home;
    const msgs = validateManifest(m).errors.map((e) => e.message);
    expect(msgs).toEqual(expect.arrayContaining(['onClick "openTablication" needs surfaces.home', 'composer "both" needs surfaces.home']));
    const n = clone(PATCH_MANIFEST);
    n.smartTag!.presentation!.popovers![0].trigger = 'click';
    expect(validateManifest(n).errors[0].message).toBe('a click popover needs onClick "openPopover"');
    const hidden = clone(PATCH_MANIFEST);
    hidden.smartTag!.surfaces = { discuss: 'none' };
    expect(validateManifest(hidden).warnings[0].message).toMatch(/shown nowhere/);
  });

  it('permissions are a closed list (tags:read is per tag type)', () => {
    const m = clone(DISCUSS_TABLICATION_MANIFEST);
    m.permissions = ['page:context', 'cookies:read'];
    expect(validateManifest(m).ok).toBe(false);
    m.permissions = ['tags:read:timeline-item'];
    expect(validateManifest(m).ok).toBe(true);
  });

  it('network hosts are bare hostnames (no schemes, paths or wildcards)', () => {
    const m = clone(DISCUSS_TABLICATION_MANIFEST);
    for (const bad of ['https://api.example.org', '*.example.org', 'example.org/path']) {
      m.network = { connect: [bad] };
      expect(validateManifest(m).ok).toBe(false);
    }
    m.network = { connect: ['api.example.org'] };
    expect(validateManifest(m).ok).toBe(true);
  });
});

describe('renderSummary (messages.content)', () => {
  it('fills fields as plain text and never produces HTML structure on its own', () => {
    expect(renderSummary('{{date}}: {{title}}', { date: '2026-10-13', title: 'Beta' })).toBe('2026-10-13: Beta');
    expect(renderSummary('{{title}}', { title: 'a\u0000b\n\n c' })).toBe('ab c');
    expect(renderSummary('{{tags}} {{missing}} {{obj}}', { tags: ['x', 'y'], obj: { a: 1 } })).toBe('x, y');
    expect(renderSummary('{{t}}', { t: 'x'.repeat(5000) })).toHaveLength(2000);
  });
});

describe('host rules from the security review', () => {
  it('refuses regex keywords and remote refs in payloadSchema, but allows a field named "pattern"', () => {
    const m = clone(TIMELINE_ITEM_MANIFEST) as any;
    m.smartTag.payloadSchema.properties.title.pattern = '^(a|aa)+$';
    m.smartTag.payloadSchema.properties.pattern = { type: 'string' };
    const r = validateManifest(m);
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.path)).toEqual(['/smartTag/payloadSchema/properties/title/pattern']);
  });

  it('refuses built-in tab ids and Canopi hosts in network.connect', () => {
    const t = clone(DISCUSS_TABLICATION_MANIFEST) as any;
    t.id = 'org.example.fake-discuss';
    expect(validateManifest(t).errors.map((e) => e.path)).toContain('/tablication/tab/id');
    t.tablication.tab.id = 'fake-discuss-tab';
    t.network = { connect: ['api.example.org', 'api.canopi.live'] };
    expect(validateManifest(t).errors).toEqual([{ path: '/network/connect', message: '"api.canopi.live" is a Canopi host: use the canopi.tab bridge' }]);
  });

  it('refuses the Live tab id too (Canopi refuses it on upload; launch review 2026-11-10)', () => {
    const t = clone(DISCUSS_TABLICATION_MANIFEST) as any;
    t.id = 'org.example.fake-live';
    t.tablication.tab.id = 'live-tab';
    expect(validateManifest(t).errors.map((e) => e.path)).toContain('/tablication/tab/id');
  });
});
