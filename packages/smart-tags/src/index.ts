/**
 * Canopi Smart Tags - Main Entry Point
 * Bike rack implementation for unified notes smart tag with pluggable providers
 */

// ─── Tag Registry (canonical definitions) ────────────────────────────────────
export {
  SMART_TAG_DEFINITIONS,
  COMPOSER_TAGS,
  LIGHTWEIGHT_TAGS,
  DEFAULT_PINNED_COMPOSER,
  DEFAULT_PINNED_LIGHTWEIGHT,
  SMART_TAG_MANAGE_ENTRY,
  BRIDGE_RELATIONSHIP_TYPES,
  SHIPPED_ANCHOR_COMPOSER_TAG_IDS,
  isAnchorComposerTagShipped,
  getSmartTagById,
} from './registry.js';
export type {
  SmartTagDefinition,
  SmartTagBridgeIntent,
  SmartTagTier,
  SmartTagVisibilityScope,
  BridgeRelationshipType,
  ShippedAnchorComposerTagId,
} from './registry.js';

// ─── Core classes ─────────────────────────────────────────────────────────────
import { SmartTagManager } from './SmartTagManager.js';
export { SmartTagManager };
export { DefaultCanonicalUrlService } from './SmartTagManager.js';

// Providers
export { LocalProvider } from './providers/LocalProvider.js';
export { HypothesisProvider } from './providers/HypothesisProvider.js';

// Types
export * from './types/annotations.js';

// Legacy compatibility stubs – original JS files not yet migrated to TS
// export { VisualizationSmartTag } from './visualization-smart-tag';
// export { CanopiSmartTagAdapter } from './canopi-integration';

/**
 * Create a SmartTagManager. Nothing runs at import and nothing is put on `window`
 * (F6: the old entry point called SmartTagManager without importing it; F7: no auto-init).
 */
export function initializeSmartTags(config?: ConstructorParameters<typeof SmartTagManager>[0]): SmartTagManager {
  return new SmartTagManager(config);
}
