import { Ajv2020 } from 'ajv/dist/2020.js';
import { MANIFEST_SCHEMA_V2 } from './schema.js';
import type { ManifestV2 } from './types.js';

export const PAYLOAD_SCHEMA_MAX_BYTES = 16 * 1024;
export const MAX_INDEX_FIELDS = 5;
const INDEX_TYPES = new Set(['text', 'number', 'date', 'enum', 'ref']);
/** Schema keywords Canopi refuses: regexes would run on its servers (ReDoS); no remote refs. */
const FORBIDDEN_SCHEMA_KEYWORDS = new Set(['pattern', 'patternProperties', '$ref', '$dynamicRef']);
/** Built-in sidebar tab ids a tablication may not use. */
export const RESERVED_TAB_IDS = new Set(['discuss-tab', 'live-tab', 'visibility-tab', 'people-tab', 'agent-tab', 'bookmarks-tab', 'patches-tab', 'settings-tab', 'manage-tab', 'rooms-tab', 'timelines-tab', 'wayback-tab', 'vault-tab', 'sdk-tab', 'sidebar-tab', 'current-tab', 'data-tab']);
const CANOPI_HOST = /(^|\.)canopi\.live$/i;

/** Paths of forbidden keywords in a JSON Schema (property names under "properties" are fields). */
function forbiddenSchemaKeywords(schema: unknown, at = ''): string[] {
  if (Array.isArray(schema)) return schema.flatMap((x, i) => forbiddenSchemaKeywords(x, `${at}/${i}`));
  if (!schema || typeof schema !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (!at.endsWith('/properties')) {
      if (FORBIDDEN_SCHEMA_KEYWORDS.has(k)) out.push(`${at}/${k}`);
      if (k === 'format' && v === 'regex') out.push(`${at}/format`);
    }
    out.push(...forbiddenSchemaKeywords(v, `${at}/${k}`));
  }
  return out;
}

export interface ManifestIssue {
  path: string;
  message: string;
}

export interface ManifestValidation {
  ok: boolean;
  errors: ManifestIssue[];
  warnings: ManifestIssue[];
  manifest?: ManifestV2;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(MANIFEST_SCHEMA_V2);

type Json = Record<string, unknown>;

/** Field names a template block, pill metric or summary may refer to. */
function payloadFields(payloadSchema: Json): Set<string> {
  const props = (payloadSchema.properties ?? {}) as Json;
  return new Set(Object.keys(props));
}

/** `{{field}}` references in a summary template. */
export function summaryFields(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]);
}

function collectBlockFields(value: unknown, out: Array<{ path: string; field: string }>, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectBlockFields(v, out, `${path}/${i}`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Json;
  for (const key of ['field', 'positionField']) {
    if (typeof obj[key] === 'string') out.push({ path: `${path}/${key}`, field: obj[key] as string });
  }
  if (Array.isArray(obj.fields)) (obj.fields as unknown[]).forEach((f, i) => typeof f === 'string' && out.push({ path: `${path}/fields/${i}`, field: f }));
  for (const [k, v] of Object.entries(obj)) if (k !== 'field' && k !== 'fields' && k !== 'positionField') collectBlockFields(v, out, `${path}/${k}`);
}

/**
 * Validate a module manifest v2: JSON Schema first, then the rules a schema can't express.
 * Fields that a tag's templates may use are its payloadSchema properties; nothing else.
 */
export function validateManifest(input: unknown): ManifestValidation {
  const errors: ManifestIssue[] = [];
  const warnings: ManifestIssue[] = [];
  if (!validateSchema(input)) {
    for (const e of validateSchema.errors ?? []) {
      errors.push({ path: e.instancePath || '/', message: `${e.message ?? 'invalid'}${e.params && 'additionalProperty' in e.params ? `: ${String((e.params as Json).additionalProperty)}` : ''}` });
    }
    return { ok: false, errors, warnings };
  }
  const m = input as ManifestV2;

  if (m.kind === 'overlay-app') {
    warnings.push({ path: '/kind', message: 'overlay-app is reserved: hosts do not run overlay apps yet (spec §2.7)' });
  }

  for (const host of m.network?.connect ?? []) {
    if (CANOPI_HOST.test(host)) errors.push({ path: '/network/connect', message: `"${host}" is a Canopi host: use the canopi.tab bridge` });
  }
  // Canopi's own modules (live.canopi.*, reserved for Canopi by the host) keep their built-in tab ids.
  if (m.tablication && RESERVED_TAB_IDS.has(m.tablication.tab.id) && !m.id.startsWith('live.canopi.')) {
    errors.push({ path: '/tablication/tab/id', message: `"${m.tablication.tab.id}" is a built-in tab id` });
  }
  if (m.smartTag) {
    for (const p of forbiddenSchemaKeywords(m.smartTag.payloadSchema, '/smartTag/payloadSchema')) {
      errors.push({ path: p, message: 'not allowed in payloadSchema (pattern, patternProperties, $ref and format "regex" are refused)' });
    }
    const st = m.smartTag;
    const size = new TextEncoder().encode(JSON.stringify(st.payloadSchema)).length;
    if (size > PAYLOAD_SCHEMA_MAX_BYTES) errors.push({ path: '/smartTag/payloadSchema', message: `payloadSchema is ${size} bytes; the limit is ${PAYLOAD_SCHEMA_MAX_BYTES}` });

    const fields = payloadFields(st.payloadSchema as Json);
    const props = (st.payloadSchema.properties ?? {}) as Record<string, Json>;
    const indexed = Object.entries(props).filter(([, p]) => p && p['x-canopi-index'] !== undefined);
    if (indexed.length > MAX_INDEX_FIELDS) errors.push({ path: '/smartTag/payloadSchema', message: `at most ${MAX_INDEX_FIELDS} fields may set x-canopi-index (found ${indexed.length})` });
    for (const [name, p] of indexed) {
      if (!INDEX_TYPES.has(String(p['x-canopi-index']))) errors.push({ path: `/smartTag/payloadSchema/properties/${name}/x-canopi-index`, message: 'must be one of text, number, date, enum, ref' });
    }

    for (const f of summaryFields(st.summary)) {
      if (!fields.has(f)) errors.push({ path: '/smartTag/summary', message: `summary refers to unknown field "${f}"` });
    }
    const refs: Array<{ path: string; field: string }> = [];
    collectBlockFields(st.presentation, refs, '/smartTag/presentation');
    for (const r of refs) if (!fields.has(r.field)) errors.push({ path: r.path, message: `refers to unknown field "${r.field}"` });
    for (const name of st.form?.order ?? []) if (!fields.has(name)) errors.push({ path: '/smartTag/form/order', message: `unknown field "${name}"` });

    const popovers = st.presentation?.popovers ?? [];
    if (popovers.some((p) => p.trigger === 'click') && st.presentation?.onClick && st.presentation.onClick !== 'openPopover') {
      errors.push({ path: '/smartTag/presentation/onClick', message: 'a click popover needs onClick "openPopover"' });
    }
    if (st.presentation?.onClick === 'openPagePreview' && !st.presentation.pagePreview) {
      errors.push({ path: '/smartTag/presentation/pagePreview', message: 'onClick "openPagePreview" needs a pagePreview template' });
    }
    if (st.presentation?.onClick === 'openTablication' && !st.surfaces.home) {
      errors.push({ path: '/smartTag/surfaces/home', message: 'onClick "openTablication" needs surfaces.home' });
    }
    if ((st.surfaces.composer === 'home' || st.surfaces.composer === 'both') && !st.surfaces.home) {
      errors.push({ path: '/smartTag/surfaces/home', message: `composer "${st.surfaces.composer}" needs surfaces.home` });
    }
    if (st.surfaces.discuss === 'none' && !st.surfaces.home) {
      warnings.push({ path: '/smartTag/surfaces', message: 'shown nowhere: discuss is "none" and there is no home tablication' });
    }
  }

  return { ok: errors.length === 0, errors, warnings, manifest: errors.length === 0 ? m : undefined };
}
