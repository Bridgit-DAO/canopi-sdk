/**
 * JSON Schema (draft 2020-12) for the StudioProject and for each stage's model output.
 * Self-contained objects (no $ref), so the API can hand any of them to ajv or to a model.
 */
import { MANIFEST_SCHEMA_V2 } from '@canopi-sdk/manifest';
import { SIDEBAR_COMPONENT_TYPES, SMART_TAG_COMPONENT_TYPES, STAGES } from './catalogue.js';

type JsonSchema = Record<string, unknown>;

const id = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' };
const text = (maxLength: number) => ({ type: 'string', maxLength });
const strings = (maxItems: number, maxLength = 200) => ({ type: 'array', maxItems, items: text(maxLength) });
const obj = (properties: JsonSchema, required: string[] = Object.keys(properties)): JsonSchema => ({ type: 'object', additionalProperties: false, required, properties });
const host = { type: 'string', pattern: '^(?:[a-z0-9-]+\\.)+[a-z]{2,}$' };

/** A manifest Trigger, exactly as the manifest schema defines it. */
const trigger = MANIFEST_SCHEMA_V2.properties.triggers.items as unknown as JsonSchema;

export const EXTRACTED_SCHEMA = obj({
  title: text(200),
  summary: text(4000),
  audience: text(1000),
  entities: { type: 'array', maxItems: 30, items: obj({ name: text(120), description: text(1000), fields: strings(40, 80) }) },
  pages: { type: 'array', maxItems: 30, items: obj({ urlPattern: text(300), purpose: text(500) }) },
  apiHints: { type: 'array', maxItems: 30, items: obj({ evidence: text(1000), guess: text(1000) }) },
});

const ideaProps = {
  id,
  kind: { enum: ['sidebar', 'smart-tag', 'both'] },
  title: text(120),
  pitch: text(1000),
  userStory: text(1000),
  whereItAppears: text(1000),
  triggers: { type: 'array', maxItems: 10, items: trigger },
  dataNeeded: strings(20),
  selected: { type: 'boolean' },
};
const IDEA = obj(ideaProps);

const binding = { anyOf: [{ type: 'null' }, obj({ sourceId: id, path: { type: 'string', minLength: 1, maxLength: 200 } })] };
const componentProps = {
  id,
  ideaId: id,
  surface: { enum: ['sidebar', 'smart-tag'] },
  type: { enum: [...SIDEBAR_COMPONENT_TYPES, ...SMART_TAG_COMPONENT_TYPES] },
  title: text(120),
  purpose: text(1000),
  binding,
  props: { type: 'object' },
  status: { enum: ['proposed', 'accepted', 'rejected'] },
  feedback: text(2000),
};
const COMPONENT = obj(componentProps, ['id', 'ideaId', 'surface', 'type', 'title', 'purpose', 'props', 'status', 'feedback']);

const DATA_SOURCE = obj({
  id,
  name: text(120),
  kind: { enum: ['rest', 'graphql', 'supabase', 'webhook', 'feed', 'bridge', 'static'] },
  mode: { enum: ['mock', 'live'] },
  confidence: { enum: ['documented', 'inferred', 'invented'] },
  evidence: text(2000),
  request: obj({ method: { enum: ['GET', 'POST'] }, urlTemplate: { type: 'string', minLength: 1, maxLength: 1000 }, auth: { enum: ['none', 'apiKey', 'oauth2', 'bearer'] } }),
  schema: { type: 'object' },
  fixtures: { type: 'array', maxItems: 20, items: obj({ params: { type: 'object', additionalProperties: { type: 'string' } }, response: {} }, ['response']) },
  live: { anyOf: [{ type: 'null' }, obj({ baseUrl: { type: 'string', pattern: '^https://' }, host, authRef: { anyOf: [{ type: 'null' }, text(200)] } }, ['baseUrl', 'host'])] },
});

const tagType = { type: 'string', pattern: '^[a-z][a-z0-9-]{1,39}$' };
const DESIGN = obj({
  sidebar: { anyOf: [{ type: 'null' }, obj({
    tab: obj({ id: { type: 'string', pattern: '^[a-z0-9][a-z0-9.-]{2,63}$' }, title: { type: 'string', minLength: 1, maxLength: 30 }, icon: text(8) }, ['id', 'title']),
    layout: { type: 'array', maxItems: 20, items: id },
  })] },
  smartTag: { anyOf: [{ type: 'null' }, obj({
    tagType,
    pill: obj({ emoji: text(8), label: { type: 'string', minLength: 1, maxLength: 30 }, metricField: text(40) }, []),
    popover: { type: 'array', maxItems: 20, items: id },
    label: { type: 'string', minLength: 1, maxLength: 40 },
    emoji: text(8),
    payloadSchema: { type: 'object', required: ['type', 'properties'], properties: { type: { const: 'object' }, properties: { type: 'object' } } },
    summary: { type: 'string', minLength: 1, maxLength: 300 },
  }, ['tagType', 'pill', 'popover'])] },
  theme: obj({ accent: { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$' } }, []),
}, []);

export const PROJECT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.canopi.live/studio-project-v1.json',
  title: 'Canopi Studio project v1',
  ...obj({
    schemaVersion: { const: 1 },
    id,
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,47}$' },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    stage: { enum: [...STAGES] },
    source: obj({
      url: { type: 'string', pattern: '^https?://', maxLength: 2000 },
      uploads: { type: 'array', maxItems: 3, items: obj({ name: text(200), mime: text(100), chars: { type: 'integer', minimum: 0 } }) },
      notes: text(20000),
      extracted: { anyOf: [{ type: 'null' }, EXTRACTED_SCHEMA] },
    }, []),
    ideas: { type: 'array', maxItems: 20, items: IDEA },
    components: { type: 'array', maxItems: 60, items: COMPONENT },
    dataSources: { type: 'array', maxItems: 20, items: DATA_SOURCE },
    design: DESIGN,
    feedback: { type: 'array', maxItems: 500, items: obj({ stage: text(20), text: text(4000), at: { type: 'string', minLength: 1, maxLength: 40 } }) },
    manifests: obj({ tablication: { anyOf: [{ type: 'null' }, { type: 'object' }] }, smartTag: { anyOf: [{ type: 'null' }, { type: 'object' }] } }),
    llm: obj({ provider: { enum: ['minimax', 'claude', 'offline'] }, model: text(120) }),
    createdAt: { type: 'string', minLength: 1, maxLength: 40 },
    updatedAt: { type: 'string', minLength: 1, maxLength: 40 },
  }, ['schemaVersion', 'id', 'slug', 'name', 'stage', 'source', 'ideas', 'components', 'dataSources', 'feedback', 'createdAt', 'updatedAt']),
} as const;

const stageSchema = (title: string, properties: JsonSchema): JsonSchema => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', title, ...obj(properties) });

/**
 * What a model must return for each stage (an object at the top, for JSON mode). The API merges
 * the result into the project; human-owned fields (`selected`, `status`, `feedback`) are optional here.
 */
export const STAGE_OUTPUT_SCHEMAS = {
  extracted: { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Studio ingest output', ...EXTRACTED_SCHEMA },
  ideas: stageSchema('Studio ideas output', { ideas: { type: 'array', minItems: 1, maxItems: 8, items: obj(ideaProps, ['id', 'kind', 'title', 'pitch', 'userStory', 'whereItAppears', 'triggers', 'dataNeeded']) } }),
  components: stageSchema('Studio components output', { components: { type: 'array', minItems: 1, maxItems: 30, items: obj(componentProps, ['id', 'ideaId', 'surface', 'type', 'title', 'purpose']) } }),
  design: stageSchema('Studio design output', {
    design: DESIGN,
    components: { type: 'array', maxItems: 30, items: obj({ id, props: { type: 'object' }, binding }, ['id', 'props']) },
  }),
  dataSources: stageSchema('Studio data output', { dataSources: { type: 'array', minItems: 1, maxItems: 10, items: DATA_SOURCE } }),
} as const satisfies Record<string, JsonSchema>;
