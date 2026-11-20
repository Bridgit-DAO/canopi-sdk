/** TypeScript shape of manifest v2 (mirrors schema.ts). */
export type ModuleKind = 'smart-tag' | 'tablication' | 'overlay-app';

export type Block =
  | { type: 'text'; field?: string; label?: string }
  | { type: 'quote'; field: string }
  | { type: 'kv'; fields: string[] }
  | { type: 'link'; field: string; label: string }
  | { type: 'badge'; field: string }
  | { type: 'rating'; field: string; max?: number }
  | { type: 'progress'; field: string; max?: number }
  | { type: 'author' }
  | { type: 'timestamp'; field?: string }
  | { type: 'textDiff'; field: string }
  | { type: 'insertPreview'; field: string; positionField: string }
  | { type: 'revisionPicker' }
  | { type: 'tally'; of: 'votes' | 'acceptance' | 'reviews' | 'replies' };

export type Trigger =
  | { type: 'always' | 'manual' | 'page' | 'image' | 'link' }
  | { type: 'url-pattern'; match: string }
  | { type: 'selector'; css: string }
  | { type: 'selection'; minChars?: number }
  | { type: 'anchor-present'; tagTypes?: string[] }
  | { type: 'smart-tag-present'; tagType: string };

export interface Presentation {
  pill?: { emoji?: string; label: string; metric?: { type: 'charDelta'; field?: string } | { type: 'field'; field: string } | { type: 'tally'; of: 'votes' | 'acceptance' | 'reviews' | 'replies' } };
  popovers?: Array<{ trigger: 'hover' | 'click'; title?: string; body: Block[] }>;
  badgeSegment?: { emoji?: string; label: string };
  pagePreviewCard?: { body: Block[] };
  onClick?: 'openFocus' | 'openPopover' | 'openTablication' | 'openPagePreview';
  pagePreview?: { title?: string; body: Block[] };
}

export interface SmartTagSection {
  tagType: string;
  emoji?: string;
  label: string;
  tier?: 'composer' | 'lightweight' | 'meta';
  statusMode?: 'basic' | 'coordinated' | 'patch';
  payloadSchema: { type: 'object'; properties: Record<string, Record<string, unknown>>; required?: string[]; [k: string]: unknown };
  summary: string;
  form?: { order?: string[]; labels?: Record<string, string>; hints?: Record<string, string> };
  presentation?: Presentation;
  surfaces: { discuss: 'inline' | 'filter' | 'none'; home?: string; composer?: 'discuss' | 'home' | 'both' };
  preflight?: { defaultMode?: 'verbose' | 'minimal' | 'none'; allowDirect?: boolean; verboseCopy?: string; choices?: Array<{ id: string; label: string; description?: string }> };
}

export interface ManifestV2 {
  $schema?: string;
  manifestVersion: 2;
  kind: ModuleKind;
  id: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; url?: string; canopiHandle?: string };
  lineage?: { forkedFrom?: { moduleId: string; version: string } };
  permissions?: string[];
  network?: { connect?: string[] };
  triggers?: Trigger[];
  activation?: 'show' | 'list' | 'badge';
  smartTag?: SmartTagSection;
  tablication?: { tab: { id: string; title: string; icon?: string; order?: number }; entry: { html: string }; contains?: string[] };
  overlayApp?: { role?: 'leaf' | 'composite'; defaultPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; collapseOnAnchorFocus?: boolean; defaultAction?: 'openSidepanel' | 'openComposer' | 'openTablication' | 'none' };
}
