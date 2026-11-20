/**
 * Canopi module manifest v2: one schema for smart tags, tablications and (reserved) overlay apps.
 * Spec: canopi docs/planning/SDK_UNIVERSAL_STACK_SPEC.md (§2.1 modules, §2.6 presentations,
 * §2.7 overlay apps and triggers, §2.8 data and surfaces). JSON Schema draft 2020-12.
 */

const id = { type: 'string', pattern: '^[a-z0-9][a-z0-9.-]{2,63}$' } as const;
const tagType = { type: 'string', pattern: '^[a-z][a-z0-9-]{1,39}$' } as const;
const fieldName = { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_]{0,39}$' } as const;
const shortText = (max: number) => ({ type: 'string', minLength: 1, maxLength: max }) as const;

/** Host-drawn template primitives (§2.6). Every value is escaped by the host; no HTML, no CSS. */
const block = {
  oneOf: [
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'text' }, field: fieldName, label: shortText(60) } },
    { type: 'object', required: ['type', 'field'], additionalProperties: false, properties: { type: { const: 'quote' }, field: fieldName } },
    { type: 'object', required: ['type', 'fields'], additionalProperties: false, properties: { type: { const: 'kv' }, fields: { type: 'array', minItems: 1, maxItems: 12, items: fieldName } } },
    { type: 'object', required: ['type', 'field', 'label'], additionalProperties: false, properties: { type: { const: 'link' }, field: fieldName, label: shortText(40) } },
    { type: 'object', required: ['type', 'field'], additionalProperties: false, properties: { type: { const: 'badge' }, field: fieldName } },
    { type: 'object', required: ['type', 'field'], additionalProperties: false, properties: { type: { const: 'rating' }, field: fieldName, max: { type: 'integer', minimum: 2, maximum: 10 } } },
    { type: 'object', required: ['type', 'field'], additionalProperties: false, properties: { type: { const: 'progress' }, field: fieldName, max: { type: 'number', exclusiveMinimum: 0 } } },
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'author' } } },
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'timestamp' }, field: fieldName } },
    { type: 'object', required: ['type', 'field'], additionalProperties: false, properties: { type: { const: 'textDiff' }, field: fieldName } },
    { type: 'object', required: ['type', 'field', 'positionField'], additionalProperties: false, properties: { type: { const: 'insertPreview' }, field: fieldName, positionField: fieldName } },
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'revisionPicker' } } },
    { type: 'object', required: ['type', 'of'], additionalProperties: false, properties: { type: { const: 'tally' }, of: { enum: ['votes', 'acceptance', 'reviews', 'replies'] } } },
  ],
} as const;

const blocks = { type: 'array', minItems: 1, maxItems: 20, items: block } as const;

const trigger = {
  oneOf: [
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { enum: ['always', 'manual', 'page', 'image', 'link'] } } },
    { type: 'object', required: ['type', 'match'], additionalProperties: false, properties: { type: { const: 'url-pattern' }, match: shortText(200) } },
    { type: 'object', required: ['type', 'css'], additionalProperties: false, properties: { type: { const: 'selector' }, css: shortText(200) } },
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'selection' }, minChars: { type: 'integer', minimum: 1, maximum: 10000 } } },
    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'anchor-present' }, tagTypes: { type: 'array', maxItems: 10, items: tagType } } },
    { type: 'object', required: ['type', 'tagType'], additionalProperties: false, properties: { type: { const: 'smart-tag-present' }, tagType } },
  ],
} as const;

const PERMISSION_PATTERN =
  '^(page:context|user:profile|storage:module|ui:badge|ui:openTab|tags:compose|tags:read:[a-z][a-z0-9-]{1,39})$';

export const MANIFEST_SCHEMA_V2 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.canopi.live/module-manifest-v2.json',
  title: 'Canopi module manifest v2',
  type: 'object',
  required: ['manifestVersion', 'kind', 'id', 'name', 'version', 'description', 'author'],
  additionalProperties: false,
  properties: {
    $schema: { type: 'string' },
    manifestVersion: { const: 2 },
    kind: { enum: ['smart-tag', 'tablication', 'overlay-app'] },
    id,
    name: shortText(60),
    version: { type: 'string', pattern: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z.-]+)?$' },
    description: shortText(500),
    author: {
      type: 'object', required: ['name'], additionalProperties: false,
      properties: { name: shortText(80), url: { type: 'string', pattern: '^https://' }, canopiHandle: { type: 'string', pattern: '^[a-z0-9_]{2,30}$' } },
    },
    lineage: {
      type: 'object', additionalProperties: false,
      properties: { forkedFrom: { type: 'object', required: ['moduleId', 'version'], additionalProperties: false, properties: { moduleId: id, version: { type: 'string' } } } },
    },
    permissions: { type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string', pattern: PERMISSION_PATTERN } },
    network: {
      type: 'object', additionalProperties: false,
      properties: { connect: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', pattern: '^(?:[a-z0-9-]+\\.)+[a-z]{2,}$' } } },
    },
    triggers: { type: 'array', maxItems: 10, items: trigger },
    activation: { enum: ['show', 'list', 'badge'] },
    smartTag: {
      type: 'object',
      required: ['tagType', 'label', 'payloadSchema', 'summary', 'surfaces'],
      additionalProperties: false,
      properties: {
        tagType,
        emoji: { type: 'string', maxLength: 8 },
        label: shortText(40),
        tier: { enum: ['composer', 'lightweight', 'meta'] },
        statusMode: { enum: ['basic', 'coordinated', 'patch'] },
        payloadSchema: { type: 'object', required: ['type', 'properties'], properties: { type: { const: 'object' }, properties: { type: 'object' } } },
        summary: shortText(300),
        form: {
          type: 'object', additionalProperties: false,
          properties: {
            order: { type: 'array', maxItems: 30, items: fieldName },
            labels: { type: 'object', additionalProperties: shortText(60) },
            hints: { type: 'object', additionalProperties: shortText(200) },
          },
        },
        presentation: {
          type: 'object', additionalProperties: false,
          properties: {
            pill: {
              type: 'object', required: ['label'], additionalProperties: false,
              properties: {
                emoji: { type: 'string', maxLength: 8 },
                label: shortText(30),
                metric: {
                  oneOf: [
                    { type: 'object', required: ['type'], additionalProperties: false, properties: { type: { const: 'charDelta' }, field: fieldName } },
                    { type: 'object', required: ['type', 'field'], additionalProperties: false, properties: { type: { const: 'field' }, field: fieldName } },
                    { type: 'object', required: ['type', 'of'], additionalProperties: false, properties: { type: { const: 'tally' }, of: { enum: ['votes', 'acceptance', 'reviews', 'replies'] } } },
                  ],
                },
              },
            },
            popovers: {
              type: 'array', maxItems: 3,
              items: { type: 'object', required: ['trigger', 'body'], additionalProperties: false, properties: { trigger: { enum: ['hover', 'click'] }, title: shortText(60), body: blocks } },
            },
            badgeSegment: { type: 'object', required: ['label'], additionalProperties: false, properties: { emoji: { type: 'string', maxLength: 8 }, label: shortText(30) } },
            pagePreviewCard: { type: 'object', required: ['body'], additionalProperties: false, properties: { body: blocks } },
            onClick: { enum: ['openFocus', 'openPopover', 'openTablication', 'openPagePreview'] },
            pagePreview: { type: 'object', required: ['body'], additionalProperties: false, properties: { title: shortText(60), body: blocks } },
          },
        },
        surfaces: {
          type: 'object', required: ['discuss'], additionalProperties: false,
          properties: { discuss: { enum: ['inline', 'filter', 'none'] }, home: id, composer: { enum: ['discuss', 'home', 'both'] } },
        },
        preflight: {
          type: 'object', additionalProperties: false,
          properties: {
            defaultMode: { enum: ['verbose', 'minimal', 'none'] },
            allowDirect: { type: 'boolean' },
            verboseCopy: shortText(600),
            choices: { type: 'array', maxItems: 6, items: { type: 'object', required: ['id', 'label'], additionalProperties: false, properties: { id: fieldName, label: shortText(40), description: shortText(200) } } },
          },
        },
      },
    },
    tablication: {
      type: 'object', required: ['tab', 'entry'], additionalProperties: false,
      properties: {
        tab: { type: 'object', required: ['id', 'title'], additionalProperties: false, properties: { id, title: shortText(30), icon: { type: 'string', maxLength: 8 }, order: { type: 'integer', minimum: 0, maximum: 1000 } } },
        entry: { type: 'object', required: ['html'], additionalProperties: false, properties: { html: { type: 'string', pattern: '^[a-zA-Z0-9_./-]+\\.html$' } } },
        contains: { type: 'array', maxItems: 20, uniqueItems: true, items: tagType },
      },
    },
    overlayApp: {
      type: 'object', additionalProperties: false,
      properties: {
        role: { enum: ['leaf', 'composite'] },
        defaultPosition: { enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left'] },
        collapseOnAnchorFocus: { type: 'boolean' },
        defaultAction: { enum: ['openSidepanel', 'openComposer', 'openTablication', 'none'] },
      },
    },
  },
  allOf: [
    { if: { properties: { kind: { const: 'smart-tag' } } }, then: { required: ['smartTag'], not: { anyOf: [{ required: ['tablication'] }, { required: ['overlayApp'] }] } } },
    { if: { properties: { kind: { const: 'tablication' } } }, then: { required: ['tablication'], not: { anyOf: [{ required: ['smartTag'] }, { required: ['overlayApp'] }] } } },
    { if: { properties: { kind: { const: 'overlay-app' } } }, then: { required: ['overlayApp', 'triggers', 'activation'], not: { anyOf: [{ required: ['smartTag'] }, { required: ['tablication'] }] } } },
  ],
} as const;
