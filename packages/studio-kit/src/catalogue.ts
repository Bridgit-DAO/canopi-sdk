/**
 * The component catalogue: what Deepi may propose, with a prop schema and a one-line description
 * per component. Smart-tag components are the manifest's Block primitives, read from
 * MANIFEST_SCHEMA_V2 (not re-typed); sidebar components are the fixed kit rendered by render.ts.
 */
import { MANIFEST_SCHEMA_V2 } from '@canopi-sdk/manifest';
import type { Block } from '@canopi-sdk/manifest';
import type { SidebarComponentType, Stage } from './types.js';

export const STAGES = ['intake', 'ideas', 'components', 'design', 'data', 'mockup', 'scaffold'] as const satisfies readonly Stage[];

type JsonSchema = Record<string, unknown>;

export interface CatalogueEntry {
  type: string;
  description: string;
  /** JSON Schema of `component.props`. */
  propsSchema: JsonSchema;
  /** What the component's binding should resolve to: an array, one object/value, or no binding. */
  binding: 'array' | 'object' | 'none';
}

/** The Block variants exactly as the manifest schema defines them. */
const BLOCK_VARIANTS = (MANIFEST_SCHEMA_V2.properties.smartTag.properties.presentation.properties.popovers.items.properties.body.items.oneOf) as readonly JsonSchema[];

/** One line per Block primitive; the Record type makes the compiler insist on every Block type. */
const BLOCK_DESCRIPTIONS: Record<Block['type'], string> = {
  text: 'A paragraph of plain text from a payload field, with an optional label.',
  quote: 'A quoted excerpt from a payload field.',
  kv: 'Key/value rows for up to 12 payload fields.',
  link: 'A labelled link whose URL is a payload field.',
  badge: 'A small status chip showing a payload field (e.g. stage, kind).',
  rating: 'Stars for a numeric payload field (max 2-10).',
  progress: 'A progress bar for a numeric payload field against max.',
  author: 'The tag author (handle, name, avatar), drawn by the host.',
  timestamp: 'When the tag was posted, or a date payload field.',
  textDiff: 'A before/after text diff from a payload field (patch tags).',
  insertPreview: 'A preview of inserted text at a position (insert tags).',
  revisionPicker: 'Lets the viewer step through revisions of the tag.',
  tally: 'A count of votes, acceptance, reviews or replies, drawn by the host.',
};

function blockEntry(variant: JsonSchema): CatalogueEntry {
  const props = { ...(variant.properties as Record<string, JsonSchema>) };
  const type = String((props.type as { const: string }).const) as Block['type'];
  delete props.type;
  const required = ((variant.required as string[]) ?? []).filter((r) => r !== 'type');
  return { type, description: BLOCK_DESCRIPTIONS[type], binding: 'none', propsSchema: { type: 'object', additionalProperties: false, required, properties: props } };
}

export const SMART_TAG_COMPONENTS: readonly CatalogueEntry[] = BLOCK_VARIANTS.map(blockEntry);
export const SMART_TAG_COMPONENT_TYPES: readonly Block['type'][] = SMART_TAG_COMPONENTS.map((e) => e.type as Block['type']);

const s = (maxLength = 200) => ({ type: 'string', maxLength });
const field = { type: 'string', minLength: 1, maxLength: 80, description: 'a field of the bound item; dots for nesting' };
/**
 * Value format. "number" groups digits for quantities but leaves ids, codes and years as written;
 * "integer" always groups (rounded); "plain" and "year" never group. Without a format the renderer
 * decides from the field's schema and name (see format.ts).
 */
const FORMATS = ['text', 'number', 'integer', 'plain', 'year', 'currency', 'percent'];
const fmt = { format: { enum: FORMATS }, currency: { type: 'string', minLength: 3, maxLength: 3 }, suffix: s(12) };
const fieldLabels = { type: 'array', maxItems: 12, items: { type: 'object', required: ['field'], additionalProperties: false, properties: { field, label: s(60), format: { enum: FORMATS, description: 'overrides the component format for this field' } } } };
const obj = (properties: JsonSchema, required: string[] = []): JsonSchema => ({ type: 'object', additionalProperties: false, required, properties });

const limit = { type: 'integer', minimum: 1, maximum: 50 };

const SIDEBAR: Record<SidebarComponentType, Omit<CatalogueEntry, 'type'>> = {
  header: { binding: 'object', description: 'Top-of-tab title and subtitle; static text or fields of one bound object.', propsSchema: obj({ title: s(80), subtitle: s(160), titleField: field, subtitleField: field }) },
  stat: { binding: 'object', description: 'One big number with a label: a field of a bound object, or a count/sum over a bound array.', propsSchema: obj({ label: s(60), field, aggregate: { enum: ['count', 'sum'] }, ...fmt }) },
  list: { binding: 'array', description: 'A vertical list of items with title, subtitle, meta line and optional link.', propsSchema: obj({ titleField: field, subtitleField: field, metaField: field, linkField: field, ...fmt, limit, emptyText: s(120) }, ['titleField']) },
  card: { binding: 'object', description: 'One highlighted record: title, body text, a few key fields and a link.', propsSchema: obj({ titleField: field, bodyField: field, fields: { type: 'array', maxItems: 8, items: field }, linkField: field, linkLabel: s(40), emptyText: s(120) }) },
  table: { binding: 'array', description: 'Compact rows and columns over a bound array.', propsSchema: obj({ columns: { ...fieldLabels, minItems: 1, maxItems: 6 }, ...fmt, limit, emptyText: s(120) }, ['columns']) },
  timeline: { binding: 'array', description: 'Dated events in order, newest first as supplied.', propsSchema: obj({ dateField: field, titleField: field, bodyField: field, limit, emptyText: s(120) }, ['dateField', 'titleField']) },
  detail: { binding: 'object', description: 'Label/value pairs for one bound object.', propsSchema: obj({ fields: { ...fieldLabels, minItems: 1 }, ...fmt, emptyText: s(120) }, ['fields']) },
  form: { binding: 'none', description: 'A small form; submits to the tab\'s private storage, or opens the Canopi composer for a smart tag.', propsSchema: obj({ fields: { type: 'array', minItems: 1, maxItems: 8, items: obj({ name: { type: 'string', minLength: 1, maxLength: 40 }, label: s(60), type: { enum: ['text', 'textarea', 'number', 'select'] }, options: { type: 'array', maxItems: 20, items: s(60) }, required: { type: 'boolean' } }, ['name']) }, submitLabel: s(40), composeTagType: { type: 'string', maxLength: 40 } }, ['fields']) },
  action: { binding: 'object', description: 'One button: open another Canopi tab, open the composer for a smart tag, or open an http(s) link.', propsSchema: obj({ label: s(40), kind: { enum: ['openTab', 'compose', 'link'] }, tabId: s(64), tagType: s(40), data: { type: 'object' }, url: s(500), urlField: field }, ['label', 'kind']) },
  sparkline: { binding: 'array', description: 'A tiny trend line over a numeric field of a bound array, with the latest value.', propsSchema: obj({ field, label: s(60), ...fmt }) },
  'tag-feed': { binding: 'none', description: 'Smart-tag instances on this page (or everywhere), read through tags.list.', propsSchema: obj({ tagType: { type: 'string', minLength: 2, maxLength: 40 }, limit, scope: { enum: ['page', 'all'] }, emptyText: s(120) }, ['tagType']) },
  'ask-deepi': { binding: 'none', description: 'A question box for Deepi, with suggested questions.', propsSchema: obj({ placeholder: s(120), suggestions: { type: 'array', maxItems: 4, items: s(120) } }) },
};

export const SIDEBAR_COMPONENTS: readonly CatalogueEntry[] = (Object.keys(SIDEBAR) as SidebarComponentType[]).map((type) => ({ type, ...SIDEBAR[type] }));
export const SIDEBAR_COMPONENT_TYPES: readonly SidebarComponentType[] = SIDEBAR_COMPONENTS.map((e) => e.type as SidebarComponentType);

/** What GET /v1/studio/catalogue returns. Plain JSON. */
export const CATALOGUE = {
  stages: STAGES,
  sidebar: SIDEBAR_COMPONENTS,
  smartTag: SMART_TAG_COMPONENTS,
} as const;
