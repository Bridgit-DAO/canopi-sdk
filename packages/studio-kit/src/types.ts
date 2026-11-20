/** TypeScript shape of a StudioProject (mirrors schema.ts). Contract: STUDIO_CONTRACT.md v0. */
import type { Block, ManifestV2, Trigger } from '@canopi-sdk/manifest';

export type Stage = 'intake' | 'ideas' | 'components' | 'design' | 'data' | 'mockup' | 'scaffold';

export type SidebarComponentType =
  | 'header' | 'stat' | 'list' | 'card' | 'table' | 'timeline' | 'detail'
  | 'form' | 'action' | 'sparkline' | 'tag-feed' | 'ask-deepi';

/** Smart-tag components are exactly the manifest's host-drawn Block primitives. */
export type SmartTagComponentType = Block['type'];

export interface Entity { name: string; description: string; fields: string[] }

export interface Extracted {
  title: string;
  summary: string;
  audience: string;
  entities: Entity[];
  pages: Array<{ urlPattern: string; purpose: string }>;
  apiHints: Array<{ evidence: string; guess: string }>;
}

export interface Idea {
  id: string;
  kind: 'sidebar' | 'smart-tag' | 'both';
  title: string;
  pitch: string;
  userStory: string;
  whereItAppears: string;
  triggers: Trigger[];
  dataNeeded: string[];
  selected: boolean;
}

export interface Binding { sourceId: string; path: string }

export interface Component {
  id: string;
  ideaId: string;
  surface: 'sidebar' | 'smart-tag';
  type: SidebarComponentType | SmartTagComponentType;
  title: string;
  purpose: string;
  binding?: Binding | null;
  props: Record<string, unknown>;
  status: 'proposed' | 'accepted' | 'rejected';
  feedback: string;
}

export type DataSourceKind = 'rest' | 'graphql' | 'supabase' | 'webhook' | 'feed' | 'bridge' | 'static';

/** One example response, keyed by the request params it answers (no params: the default). */
export interface Fixture { params?: Record<string, string>; response: unknown }

export interface DataSourceDescriptor {
  id: string;
  name: string;
  kind: DataSourceKind;
  mode: 'mock' | 'live';
  confidence: 'documented' | 'inferred' | 'invented';
  evidence: string;
  request: { method: 'GET' | 'POST'; urlTemplate: string; auth: 'none' | 'apiKey' | 'oauth2' | 'bearer' };
  schema: Record<string, unknown>;
  fixtures: Fixture[];
  live: { baseUrl: string; host: string; authRef?: string | null } | null;
}

export interface Design {
  sidebar?: { tab: { id: string; title: string; icon?: string }; layout: string[] } | null;
  /**
   * Smart-tag design. `payloadSchema`, `summary`, `label` and `emoji` are additions to the v0
   * contract: a ManifestV2 smart tag cannot be built without a payload schema and a summary.
   * When absent, the scaffold derives them from the fields the popover blocks use.
   */
  smartTag?: {
    tagType: string;
    pill: { emoji?: string; label?: string; metricField?: string };
    popover: string[];
    label?: string;
    emoji?: string;
    payloadSchema?: { type: 'object'; properties: Record<string, Record<string, unknown>>; required?: string[] };
    summary?: string;
  } | null;
  theme?: { accent?: string };
}

export interface StudioProject {
  schemaVersion: 1;
  id: string;
  slug: string;
  name: string;
  stage: Stage;
  source: {
    url?: string;
    uploads?: Array<{ name: string; mime: string; chars: number }>;
    notes?: string;
    extracted?: Extracted | null;
  };
  ideas: Idea[];
  components: Component[];
  dataSources: DataSourceDescriptor[];
  design?: Design;
  feedback: Array<{ stage: string; text: string; at: string }>;
  manifests?: { tablication: ManifestV2 | null; smartTag: ManifestV2 | null };
  llm?: { provider: 'minimax' | 'claude' | 'offline'; model: string };
  createdAt: string;
  updatedAt: string;
}
