/**
 * @canopi-sdk/smart-tags – Canonical Smart Tag Registry
 *
 * Single source of truth for all smart tag action types used across:
 *   - Canopi Chrome extension (presence/src/config/smartTagRegistry.ts re-exports this)
 *   - Third-party sidebar apps built with the Sidebar SDK
 *   - The Tag Registry service (verification, meta-domain mapping)
 *   - Neo4j SchemaLayer nodes
 *
 * Design rules:
 *   - No extension-specific imports (no chrome.*, no DOM globals)
 *   - Pure TypeScript types + data – importable anywhere
 *   - `bridgeIntent` tells the host environment what action to perform
 *   - Hosts (extension, SDK app) map bridgeIntents to their own message/event system
 *
 * Tag tiers:
 *   COMPOSER  – opens a compose UI; creates a message/note/task body on the anchor
 *   LIGHTWEIGHT – one-click action; no compose UI; recorded directly on the anchor
 *   META      – system actions (manage, etc.); no anchor body created
 *
 * Server-side types (SmartTagServerDefinition, SmartTagForkLicense, etc.) mirror the
 * columns of the `smart_tag_definitions` table returned by GET /v1/smart-tags.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE TYPES (mirror of smart_tag_definitions DB columns)
// Returned by GET /v1/smart-tags
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Who may use this smart tag type.
 * Maps to `smart_tag_definitions.visibility`.
 */
export type SmartTagServerVisibility =
  | 'private'      // creator only
  | 'invite_only'  // explicit entitlements required
  | 'community'    // members of the creator's active community
  | 'public';      // world-readable

/**
 * How users acquire the right to use this tag type.
 * Maps to `smart_tag_definitions.access_model`.
 */
export type SmartTagServerAccessModel =
  | 'free'         // every type is 'free' today
  | 'one_time'     // reserved
  | 'subscription' // reserved
  | 'usage'        // reserved
  | 'invite';      // reserved

/**
 * What kind of forking is allowed for this type.
 * Maps to `smart_tag_definitions.fork_license`.
 *
 * | Value           | Meaning |
 * |-----------------|---------|
 * | `none`          | No forking allowed |
 * | `cosmetic_only` | Only visual changes (label/icon); no schema changes |
 * | `schema_extend` | May add fields; may not remove or change existing fields |
 * | `open`          | Any schema modification allowed |
 * | `non_commercial`| Reserved |
 */
export type SmartTagForkLicense =
  | 'none'
  | 'cosmetic_only'
  | 'schema_extend'
  | 'open'
  | 'non_commercial';

/**
 * Whether a forked type is meaningfully different from its parent.
 * Set automatically by schema fingerprint comparison at registration time.
 * Maps to `smart_tag_definitions.variant_kind`.
 */
export type SmartTagVariantKind =
  | 'original'  // not a fork
  | 'cosmetic'  // schema_hash identical to parent
  | 'extended'; // schema meaningfully changed

/**
 * Full server-side definition of a smart tag type as returned by GET /v1/smart-tags.
 *
 * This is the canonical shape for all server-registered types, including third-party
 * types registered by other developers. It extends the client-side
 * SmartTagDefinition with governance, access-control, and lifecycle fields.
 */
export interface SmartTagServerDefinition {
  // ── Identity ────────────────────────────────────────────────────────────────
  /** Short alias used in messages.tag_type (e.g. 'task') */
  tag_type: string;
  /**
   * Permanent, globally unique identity – e.g. 'task.smart-tag.meta'.
   * Never changes even if the type is deprecated or renamed.
   * Instances reference this to survive schema evolution.
   */
  meta_domain: string;

  // ── Display ─────────────────────────────────────────────────────────────────
  label: string;
  icon?: string | null;
  description?: string | null;

  // ── Behaviour ───────────────────────────────────────────────────────────────
  is_public: boolean;
  is_singleton: boolean;

  // ── Access control ──────────────────────────────────────────────────────────
  visibility: SmartTagServerVisibility;
  access_model: SmartTagServerAccessModel;

  // ── Fork / lineage ──────────────────────────────────────────────────────────
  fork_license: SmartTagForkLicense;
  allow_forking: boolean;
  /** tag_type of the direct parent, if this type is a fork */
  forked_from?: string | null;
  /** meta_domain of the root ancestor across the entire fork chain */
  root_meta_domain?: string | null;
  /** Reserved; 0 for every type today. */
  fork_royalty_pct: number;
  /** Reserved; 0 for every type today. */
  root_royalty_pct: number;
  variant_kind: SmartTagVariantKind;

  // ── Schema ──────────────────────────────────────────────────────────────────
  schema_version: number;
  /** JSON Schema draft-07 for messages.payload – null means free-form */
  schema?: object | null;

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  deprecated_at?: string | null;
  successor_tag_type?: string | null;
}

// ─── Bridge intent ───────────────────────────────────────────────────────────

/**
 * What the host environment should do when this tag is activated.
 * Hosts map these to their own message-passing / event system.
 */
export type SmartTagBridgeIntent =
  | 'attachToComposer'   // open compose UI pre-loaded with anchor + tagType
  | 'startBridgeSession' // initiate a bridge session (set source anchor)
  | 'bookmark'           // save silently – no compose UI
  | 'react'              // lightweight emoji reaction – no compose UI
  | 'share'              // copy/open shareable anchor URL – no compose UI
  | 'follow'             // subscribe to anchor activity – no compose UI
  | 'manage';            // open Manage Tags panel – no anchor body

// ─── Tag tiers ───────────────────────────────────────────────────────────────

export type SmartTagTier = 'composer' | 'lightweight' | 'meta';

// ─── Visibility scoping ──────────────────────────────────────────────────────

/**
 * Who can see what a user attaches to an anchor.
 * Applies to composer tags (Discuss, Note/private Discuss, Task, etc.) and Tag.
 * Lightweight actions (Bookmark, React, Share, Follow) feed the anonymised
 * public-commons stream regardless of this setting.
 */
export type SmartTagVisibilityScope =
  | 'private'     // only the actor
  | 'group'       // a Room / ad-hoc group (Rooms = phase 2)
  | 'community'   // the actor's active Canopi community
  | 'public';     // world-readable

// ─── Definition shape ────────────────────────────────────────────────────────

export interface SmartTagDefinition {
  /** Stable id – used in storage, messages, Neo4j SchemaLayer nodes, telemetry. */
  id: string;

  /**
   * Permanent server-side identity for this type – e.g. 'task.smart-tag.meta'.
   * Mirrors `SmartTagServerDefinition.meta_domain`.
   * Used to correlate client-side definitions with server definitions across
   * schema versions, renames, and deprecations.
   */
  metaDomain: string;

  /** Emoji icon shown in the widget grid. */
  emoji: string;

  /** Short display label (one word preferred). */
  label: string;

  /** Full label for context menus, settings panels, and accessibility. */
  menuTitle: string;

  /** Tier determines where in the widget UI this tag appears. */
  tier: SmartTagTier;

  /** What the host should do when this tag is activated. */
  bridgeIntent: SmartTagBridgeIntent;

  /**
   * When bridgeIntent === 'attachToComposer', this is forwarded as `tagType`
   * so the compose UI can pre-configure itself (message type, template, etc.).
   * Also used as the Neo4j SchemaLayer discriminator.
   */
  composerTagType?: string;

  /**
   * Default visibility scope pre-selected in the compose UI.
   * Users can change it before submitting.
   */
  defaultVisibility?: SmartTagVisibilityScope;

  /**
   * Whether this tag is pinned by default for new users.
   * Users can re-pin / unpin via Manage Tags.
   */
  pinnedByDefault: boolean;

  /**
   * Native browser context menu contexts this tag applies to.
   * Extension-specific – ignored by SDK apps.
   */
  contexts?: Array<
    | 'selection' | 'image' | 'link' | 'page'
    | 'frame' | 'audio' | 'video' | 'editable'
    | 'action' | 'launcher'
  >;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * All smart tag definitions, ordered as they appear in the default widget grid
 * (composer tier first, then lightweight tier).
 *
 * NOTE on Note/Discuss: "Note" is NOT a separate tag type. A private note is
 * Discuss with defaultVisibility = 'private'. The widget may expose a "Note"
 * shortcut button that pre-sets visibility to private, but the underlying
 * tag type is 'discuss'.
 */
export const SMART_TAG_DEFINITIONS: readonly SmartTagDefinition[] = [
  // ── Composer tier (opens compose UI) ───────────────────────────────────────
  {
    id: 'discuss',
    metaDomain: 'discuss.smart-tag.meta',
    emoji: '💬',
    label: 'Discuss',
    menuTitle: '💬 Start discussion',
    tier: 'composer',
    bridgeIntent: 'attachToComposer',
    composerTagType: 'discuss',
    defaultVisibility: 'community',
    pinnedByDefault: true,
    contexts: ['selection', 'image'],
  },
  {
    id: 'task',
    metaDomain: 'task.smart-tag.meta',
    emoji: '✅',
    label: 'Task',
    menuTitle: '✅ Create task',
    tier: 'composer',
    bridgeIntent: 'attachToComposer',
    composerTagType: 'task',
    defaultVisibility: 'community',
    pinnedByDefault: true,
    contexts: ['selection'],
  },
  {
    id: 'quote',
    metaDomain: 'quote.smart-tag.meta',
    emoji: '❝',
    label: 'Quote',
    menuTitle: '❝ Quote',
    tier: 'composer',
    bridgeIntent: 'attachToComposer',
    composerTagType: 'quote',
    defaultVisibility: 'public',
    pinnedByDefault: true,
    contexts: ['selection'],
  },
  {
    id: 'question',
    metaDomain: 'question.smart-tag.meta',
    emoji: '❓',
    label: 'Question',
    menuTitle: '❓ Ask a question',
    tier: 'composer',
    bridgeIntent: 'attachToComposer',
    composerTagType: 'question',
    defaultVisibility: 'community',
    pinnedByDefault: true,
    contexts: ['selection', 'image'],
  },
  {
    id: 'bridge',
    metaDomain: 'bridge.smart-tag.meta',
    emoji: '🌉',
    label: 'Bridge',
    menuTitle: '🌉 Create bridge',
    tier: 'composer',
    bridgeIntent: 'startBridgeSession',
    composerTagType: 'bridge',
    defaultVisibility: 'public',
    pinnedByDefault: true,
    contexts: ['selection', 'image', 'link'],
  },
  {
    id: 'tag',
    metaDomain: 'tag.smart-tag.meta',
    emoji: '🏷️',
    label: 'Tag',
    menuTitle: '🏷️ Add tag',
    tier: 'composer',
    bridgeIntent: 'attachToComposer',
    composerTagType: 'tag',
    defaultVisibility: 'public',  // public by default – contributes to collective ontology
    pinnedByDefault: true,
    contexts: ['selection', 'image'],
  },

  // ── Available (not pinned by default) ──────────────────────────────────────
  {
    id: 'cite',
    metaDomain: 'cite.smart-tag.meta',
    emoji: '📎',
    label: 'Cite',
    menuTitle: '📎 Cite source',
    tier: 'composer',
    bridgeIntent: 'attachToComposer',
    composerTagType: 'cite',
    defaultVisibility: 'public',
    pinnedByDefault: false,
    contexts: ['selection', 'link'],
  },

  // ── Lightweight tier (one-click – no compose UI) ───────────────────────────
  {
    id: 'bookmark',
    metaDomain: 'bookmark.smart-tag.meta',
    emoji: '🔖',
    label: 'Bookmark',
    menuTitle: '🔖 Bookmark',
    tier: 'lightweight',
    bridgeIntent: 'bookmark',
    defaultVisibility: 'private',
    pinnedByDefault: true,
    contexts: ['selection', 'image', 'link', 'page'],
  },
  {
    id: 'react',
    metaDomain: 'react.smart-tag.meta',
    emoji: '⚡',
    label: 'React',
    menuTitle: '⚡ React',
    tier: 'lightweight',
    bridgeIntent: 'react',
    defaultVisibility: 'public',
    pinnedByDefault: true,
    contexts: ['selection', 'image'],
  },
  {
    id: 'share',
    metaDomain: 'share.smart-tag.meta',
    emoji: '↗️',
    label: 'Share',
    menuTitle: '↗️ Share anchor',
    tier: 'lightweight',
    bridgeIntent: 'share',
    defaultVisibility: 'public',
    pinnedByDefault: true,
    contexts: ['selection', 'image', 'link'],
  },
  {
    id: 'follow',
    metaDomain: 'follow.smart-tag.meta',
    emoji: '🔔',
    label: 'Follow',
    menuTitle: '🔔 Follow anchor',
    tier: 'lightweight',
    bridgeIntent: 'follow',
    defaultVisibility: 'private',
    pinnedByDefault: true,
    contexts: ['selection', 'image', 'page'],
  },
];

// ─── Derived helpers ─────────────────────────────────────────────────────────

/** All composer-tier tags, in display order. */
export const COMPOSER_TAGS: readonly SmartTagDefinition[] =
  SMART_TAG_DEFINITIONS.filter(t => t.tier === 'composer');

/** All lightweight-tier tags, in display order. */
export const LIGHTWEIGHT_TAGS: readonly SmartTagDefinition[] =
  SMART_TAG_DEFINITIONS.filter(t => t.tier === 'lightweight');

/** Default-pinned composer tags (the 3×2 grid in a fresh install). */
export const DEFAULT_PINNED_COMPOSER: readonly SmartTagDefinition[] =
  COMPOSER_TAGS.filter(t => t.pinnedByDefault);

/** Default-pinned lightweight tags (the inline row in a fresh install). */
export const DEFAULT_PINNED_LIGHTWEIGHT: readonly SmartTagDefinition[] =
  LIGHTWEIGHT_TAGS.filter(t => t.pinnedByDefault);

/** Look up a definition by id. Returns undefined if not found. */
export function getSmartTagById(id: string): SmartTagDefinition | undefined {
  return SMART_TAG_DEFINITIONS.find(t => t.id === id);
}

// ─── Manage pseudo-entry ─────────────────────────────────────────────────────

/**
 * The "Manage" footer entry – not a real anchor action; opens the tag
 * management panel. Not in SMART_TAG_DEFINITIONS so it never appears in
 * iteration loops that process real tag types.
 */
export const SMART_TAG_MANAGE_ENTRY = {
  id: 'manage',
  emoji: '⚙️',
  label: 'Manage tags',
  tier: 'meta' as SmartTagTier,
  bridgeIntent: 'manage' as SmartTagBridgeIntent,
} as const;

// ─── Extension anchor widget – shipping (Apr 2026) ───────────────────────────

/**
 * Composer-tier tags that are **fully shipped** in the Canopi extension anchor widget:
 * form flow + structured Discuss display + backend payload.
 *
 * All other composer tags (Discuss, Task, Quote, Question, Tag, Manage) stay **visible but
 * inactive** in the widget until their product flows match Bridge quality.
 *
 * Lightweight tier (bookmark, react, share, follow) remains active – separate from composer.
 */
export const SHIPPED_ANCHOR_COMPOSER_TAG_IDS = ['discuss', 'bridge'] as const;
export type ShippedAnchorComposerTagId = (typeof SHIPPED_ANCHOR_COMPOSER_TAG_IDS)[number];

export function isAnchorComposerTagShipped(tagId: string): boolean {
  return (SHIPPED_ANCHOR_COMPOSER_TAG_IDS as readonly string[]).includes(tagId);
}

// ─── Meta-domain map ─────────────────────────────────────────────────────────

/**
 * Maps each built-in `tag_type` string to its permanent `meta_domain`.
 *
 * Use this to correlate a `messages.tag_type` value with its server-side
 * definition even after the type is renamed or deprecated.
 *
 * @example
 *   META_DOMAIN_MAP['task'] // → 'task.smart-tag.meta'
 */
export const META_DOMAIN_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  SMART_TAG_DEFINITIONS.map(t => [t.id, t.metaDomain]),
);

/**
 * Look up the permanent meta_domain for a given tag_type id.
 * Returns undefined for unknown / third-party types not in the built-in list.
 */
export function getMetaDomain(tagId: string): string | undefined {
  return META_DOMAIN_MAP[tagId];
}

// ─── Bridge relationship vocabulary ──────────────────────────────────────────
// Kept here because bridges are initiated from the smart tag widget.
// Authoritative source: bridge-registry repo (mirrors this enum).

export const BRIDGE_RELATIONSHIP_TYPES = [
  'cites',
  'contradicts',
  'supports',
  'extends',
  'timeline',
  'related',
] as const;

export type BridgeRelationshipType = typeof BRIDGE_RELATIONSHIP_TYPES[number];
