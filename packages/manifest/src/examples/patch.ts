import type { ManifestV2 } from '../types.js';

/** Patch as the first `presentation` adopter (spec decision 10): today's pill, diff and "Why it fits". */
export const PATCH_MANIFEST: ManifestV2 = {
  manifestVersion: 2,
  kind: 'smart-tag',
  id: 'live.canopi.patch',
  name: 'Patch',
  version: '2.0.0',
  description: 'Meta-Layer proposal to improve content at any context anchor.',
  author: { name: 'Canopi', url: 'https://canopi.live' },
  triggers: [{ type: 'selection' }, { type: 'image' }, { type: 'page' }, { type: 'link' }],
  smartTag: {
    tagType: 'patch',
    emoji: '🩹',
    label: 'Patch',
    tier: 'composer',
    statusMode: 'patch',
    payloadSchema: {
      type: 'object',
      required: ['proposedText'],
      properties: {
        proposedText: { type: 'string', maxLength: 20000, 'x-canopi-index': 'text' },
        rationale: { type: 'string', maxLength: 4000 },
        sources: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri' } },
      },
    },
    summary: '{{proposedText}}',
    form: { order: ['proposedText', 'rationale', 'sources'], labels: { proposedText: 'Proposed text', rationale: 'Why it fits' } },
    presentation: {
      pill: { emoji: '🩹', label: 'Patch', metric: { type: 'charDelta', field: 'proposedText' } },
      popovers: [
        { trigger: 'hover', title: 'Preview', body: [{ type: 'textDiff', field: 'proposedText' }] },
        { trigger: 'hover', title: 'Why it fits', body: [{ type: 'text', field: 'rationale' }] },
      ],
      badgeSegment: { emoji: '🩹', label: 'Patches' },
      onClick: 'openFocus',
      pagePreview: { title: 'Patched-page preview', body: [{ type: 'textDiff', field: 'proposedText' }, { type: 'text', field: 'rationale' }, { type: 'revisionPicker' }, { type: 'tally', of: 'reviews' }] },
    },
    surfaces: { discuss: 'inline', composer: 'discuss' },
    preflight: { defaultMode: 'verbose', allowDirect: false, choices: [{ id: 'patch', label: 'Patch' }, { id: 'insertAbove', label: 'Insert above' }, { id: 'insertBelow', label: 'Insert below' }] },
  },
};

export const INSERT_MANIFEST: ManifestV2 = {
  manifestVersion: 2,
  kind: 'smart-tag',
  id: 'live.canopi.insert',
  name: 'Insert',
  version: '2.0.0',
  description: 'Proposed text to insert above or below a passage.',
  author: { name: 'Canopi', url: 'https://canopi.live' },
  triggers: [{ type: 'selection' }],
  smartTag: {
    tagType: 'insert',
    emoji: '+',
    label: 'Insert',
    tier: 'composer',
    statusMode: 'patch',
    payloadSchema: {
      type: 'object',
      required: ['proposedText', 'insertPosition'],
      properties: {
        proposedText: { type: 'string', maxLength: 20000 },
        insertPosition: { enum: ['above', 'below'], 'x-canopi-index': 'enum' },
        rationale: { type: 'string', maxLength: 4000 },
      },
    },
    summary: '{{proposedText}}',
    presentation: {
      pill: { emoji: '+', label: 'Insert', metric: { type: 'charDelta', field: 'proposedText' } },
      popovers: [
        { trigger: 'hover', title: 'Preview', body: [{ type: 'insertPreview', field: 'proposedText', positionField: 'insertPosition' }] },
        { trigger: 'hover', title: 'Why it fits', body: [{ type: 'text', field: 'rationale' }] },
      ],
      onClick: 'openFocus',
    },
    surfaces: { discuss: 'inline', composer: 'discuss' },
  },
};
