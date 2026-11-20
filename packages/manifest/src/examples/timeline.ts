import type { ManifestV2 } from '../types.js';

/** Spec §2.8 worked example: a timeline item, at home in Timelines and optional in Discuss. */
export const TIMELINE_ITEM_MANIFEST: ManifestV2 = {
  manifestVersion: 2,
  kind: 'smart-tag',
  id: 'live.canopi.timeline-item',
  name: 'Timeline item',
  version: '1.0.0',
  description: 'A dated event on a page or topic timeline.',
  author: { name: 'Canopi', url: 'https://canopi.live' },
  triggers: [{ type: 'page' }, { type: 'selection' }],
  smartTag: {
    tagType: 'timeline-item',
    emoji: '🗓️',
    label: 'Timeline item',
    tier: 'composer',
    statusMode: 'coordinated',
    payloadSchema: {
      type: 'object',
      required: ['date', 'title'],
      properties: {
        date: { type: 'string', format: 'date', 'x-canopi-index': 'date' },
        endDate: { type: 'string', format: 'date', 'x-canopi-index': 'date' },
        title: { type: 'string', maxLength: 200, 'x-canopi-index': 'text' },
        description: { type: 'string', maxLength: 4000 },
        sources: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri' } },
      },
    },
    summary: '{{date}}: {{title}}',
    presentation: {
      pill: { emoji: '🗓️', label: 'Timeline', metric: { type: 'field', field: 'date' } },
      popovers: [{ trigger: 'hover', body: [{ type: 'kv', fields: ['date', 'endDate'] }, { type: 'text', field: 'description' }] }],
      onClick: 'openTablication',
    },
    surfaces: { discuss: 'filter', home: 'live.canopi.timelines', composer: 'both' },
  },
};

export const DISCUSS_TABLICATION_MANIFEST: ManifestV2 = {
  manifestVersion: 2,
  kind: 'tablication',
  id: 'live.canopi.discuss',
  name: 'Discuss',
  version: '1.0.0',
  description: 'Page and anchor discussion.',
  author: { name: 'Canopi', url: 'https://canopi.live' },
  permissions: ['page:context', 'user:profile', 'tags:compose', 'tags:read:post', 'tags:read:patch', 'tags:read:insert'],
  tablication: { tab: { id: 'discuss-tab', title: 'Discuss', icon: '💬', order: 1 }, entry: { html: 'index.html' }, contains: ['post', 'patch', 'insert'] },
};

/** Reserved kind (spec §2.7): valid, with a warning; hosts don't run it yet. */
export const OVERLAY_APP_EXAMPLE: ManifestV2 = {
  manifestVersion: 2,
  kind: 'overlay-app',
  id: 'org.example.fact-check-lens',
  name: 'Fact-check lens',
  version: '0.1.0',
  description: 'Lists itself as active on pages that have fact-check anchors.',
  author: { name: 'Example' },
  triggers: [{ type: 'smart-tag-present', tagType: 'fact-check' }],
  activation: 'list',
  overlayApp: { role: 'leaf', defaultPosition: 'bottom-right', collapseOnAnchorFocus: true, defaultAction: 'openTablication' },
};
