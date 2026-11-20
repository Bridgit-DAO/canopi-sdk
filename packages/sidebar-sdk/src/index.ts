/**
 * Canopi Sidebar SDK - Main Entry Point
 * Incorporates timing fixes discovered from Wayback machine work
 */

// Core components
export { TabController, getTabController } from './TabController.js';
export { PageContextManager, getPageContextManager } from './PageContextManager.js';
export type { CanonicalUrlService } from './CanonicalUrlService.js';
export { DefaultCanonicalUrlService, canonicalUrlService } from './CanonicalUrlService.js';
export { SDKInitializer, sdkInitializer } from './SDKInitializer.js';

// Types
export type { PageContext, PageContextChangedEvent } from './PageContextManager.js';
export type { TabData, TabControllerConfig } from './TabController.js';
export type { SDKConfig, SDKComponents } from './SDKInitializer.js';
import type { SDKComponents } from './SDKInitializer.js';

// Timing utilities
export { TimingUtils, StateManager } from '@canopi-sdk/shared';

/**
 * Start the sidebar SDK. Nothing runs at import: call this from the host when the tab boots
 * (F7: no auto-initialisation, no window globals, no timers left running).
 * Call `sdkInitializer.cleanup()` to stop it.
 */
export async function initializeSidebarSDK(): Promise<SDKComponents> {
  const { sdkInitializer } = await import('./SDKInitializer.js');
  return sdkInitializer.initialize();
}
