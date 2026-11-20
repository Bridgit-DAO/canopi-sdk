import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import { validateManifest } from '@canopi-sdk/manifest';
import type { ManifestIssue } from '@canopi-sdk/manifest';
import { isValidBindingPath } from './binding.js';
import { SIDEBAR_COMPONENTS, SMART_TAG_COMPONENTS } from './catalogue.js';
import type { CatalogueEntry } from './catalogue.js';
import { PROJECT_SCHEMA, STAGE_OUTPUT_SCHEMAS } from './schema.js';
import type { StudioProject } from './types.js';

export type ProjectIssue = ManifestIssue;

export interface ProjectValidation {
  ok: boolean;
  errors: ProjectIssue[];
  warnings: ProjectIssue[];
  project?: StudioProject;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(PROJECT_SCHEMA);
const propValidators = new Map<string, { entry: CatalogueEntry; check: ValidateFunction }>();
for (const [surface, list] of [['sidebar', SIDEBAR_COMPONENTS], ['smart-tag', SMART_TAG_COMPONENTS]] as const) {
  for (const entry of list) propValidators.set(`${surface}:${entry.type}`, { entry, check: ajv.compile(entry.propsSchema) });
}
const stageValidators = Object.fromEntries(Object.entries(STAGE_OUTPUT_SCHEMAS).map(([k, s]) => [k, ajv.compile(s)])) as Record<keyof typeof STAGE_OUTPUT_SCHEMAS, ValidateFunction>;

function ajvIssues(v: ValidateFunction, prefix = ''): ProjectIssue[] {
  return (v.errors ?? []).map((e) => ({
    path: `${prefix}${e.instancePath}` || '/',
    message: `${e.message ?? 'invalid'}${e.params && 'additionalProperty' in e.params ? `: ${String((e.params as Record<string, unknown>).additionalProperty)}` : ''}`,
  }));
}

/** Validate one stage's model output against STAGE_OUTPUT_SCHEMAS[stage]. */
export function validateStageOutput(stage: keyof typeof STAGE_OUTPUT_SCHEMAS, input: unknown): { ok: boolean; errors: ProjectIssue[] } {
  const v = stageValidators[stage];
  if (!v) return { ok: false, errors: [{ path: '/', message: `unknown stage "${String(stage)}"` }] };
  return v(input) ? { ok: true, errors: [] } : { ok: false, errors: ajvIssues(v) };
}

/**
 * Validate a StudioProject: JSON Schema first, then the cross-references a schema can't express
 * (ids, bindings, layout, component props against the catalogue, embedded manifests).
 */
export function validateProject(input: unknown): ProjectValidation {
  const errors: ProjectIssue[] = [];
  const warnings: ProjectIssue[] = [];
  if (!validateSchema(input)) return { ok: false, errors: ajvIssues(validateSchema), warnings };
  const p = input as StudioProject;

  const seen = new Map<string, string>();
  const unique = (kind: string, list: Array<{ id: string }>) => list.forEach((x, i) => {
    if (seen.has(x.id)) errors.push({ path: `/${kind}/${i}/id`, message: `duplicate id "${x.id}" (also in ${seen.get(x.id)})` });
    else seen.set(x.id, kind);
  });
  unique('ideas', p.ideas);
  unique('components', p.components);
  unique('dataSources', p.dataSources);

  const ideas = new Set(p.ideas.map((i) => i.id));
  const sources = new Set(p.dataSources.map((s) => s.id));
  const components = new Map(p.components.map((c) => [c.id, c]));

  p.components.forEach((c, i) => {
    const at = `/components/${i}`;
    if (!ideas.has(c.ideaId)) errors.push({ path: `${at}/ideaId`, message: `unknown idea "${c.ideaId}"` });
    const pv = propValidators.get(`${c.surface}:${c.type}`);
    if (!pv) {
      errors.push({ path: `${at}/type`, message: `"${c.type}" is not a ${c.surface} component` });
      return;
    }
    if (Object.keys(c.props).length > 0 && !pv.check(c.props)) errors.push(...ajvIssues(pv.check, `${at}/props`));
    if (c.binding) {
      if (!sources.has(c.binding.sourceId)) errors.push({ path: `${at}/binding/sourceId`, message: `unknown data source "${c.binding.sourceId}"` });
      if (!isValidBindingPath(c.binding.path)) errors.push({ path: `${at}/binding/path`, message: `"${c.binding.path}" is outside the supported JSONPath subset ($, .key, ['key'], [n], [*])` });
      if (pv.entry.binding === 'none') warnings.push({ path: `${at}/binding`, message: `${c.type} does not use a binding` });
    }
  });

  const checkRefs = (ids: string[], at: string, surface: 'sidebar' | 'smart-tag') => {
    const dup = new Set<string>();
    ids.forEach((id, i) => {
      const c = components.get(id);
      if (dup.has(id)) errors.push({ path: `${at}/${i}`, message: `"${id}" appears twice` });
      dup.add(id);
      if (!c) errors.push({ path: `${at}/${i}`, message: `unknown component "${id}"` });
      else if (c.surface !== surface) errors.push({ path: `${at}/${i}`, message: `"${id}" is a ${c.surface} component, not ${surface}` });
      else if (c.status === 'rejected') warnings.push({ path: `${at}/${i}`, message: `"${id}" was rejected and will not render` });
    });
  };
  if (p.design?.sidebar) checkRefs(p.design.sidebar.layout, '/design/sidebar/layout', 'sidebar');
  if (p.design?.smartTag) checkRefs(p.design.smartTag.popover, '/design/smartTag/popover', 'smart-tag');

  p.dataSources.forEach((s, i) => {
    if (s.mode === 'live' && !s.live && s.kind !== 'static' && s.kind !== 'bridge') errors.push({ path: `/dataSources/${i}/live`, message: 'mode "live" needs live { baseUrl, host }' });
    if (s.fixtures.length === 0) warnings.push({ path: `/dataSources/${i}/fixtures`, message: 'no fixtures: the mock and preview have nothing to show' });
  });

  for (const k of ['tablication', 'smartTag'] as const) {
    const m = p.manifests?.[k];
    if (!m) continue;
    const r = validateManifest(m);
    errors.push(...r.errors.map((e) => ({ path: `/manifests/${k}${e.path === '/' ? '' : e.path}`, message: e.message })));
    warnings.push(...r.warnings.map((e) => ({ path: `/manifests/${k}${e.path === '/' ? '' : e.path}`, message: e.message })));
  }

  return { ok: errors.length === 0, errors, warnings, project: errors.length === 0 ? p : undefined };
}
