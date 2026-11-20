/**
 * SDKInitializer - Handles timing-aware initialization of Canopi SDK components
 * Incorporates insights from Wayback machine work to prevent timing issues
 */

import { TabController } from './TabController.js';
import { PageContextManager } from './PageContextManager.js';
import { CanonicalUrlService } from './CanonicalUrlService.js';

export interface SDKConfig {
  enableTabController?: boolean;
  enablePageContextManager?: boolean;
  enableMessageListeners?: boolean;
  initializationDelay?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface SDKComponents {
  tabController?: TabController;
  pageContextManager?: PageContextManager;
  canonicalUrlService?: CanonicalUrlService;
}

export class SDKInitializer {
  private config: SDKConfig;
  private components: SDKComponents = {};
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  
  constructor(config: SDKConfig = {}) {
    this.config = {
      enableTabController: true,
      enablePageContextManager: true,
      enableMessageListeners: true,
      initializationDelay: 100, // Small delay to ensure DOM is ready
      retryAttempts: 3,
      retryDelay: 500,
      ...config
    };
  }
  
  /**
   * Initialize SDK with timing safeguards
   * Prevents race conditions and ensures proper component startup order
   */
  async initialize(): Promise<SDKComponents> {
    if (this.initialized) {
      return this.components;
    }
    
    if (this.initializationPromise) {
      await this.initializationPromise;
      return this.components;
    }
    
    this.initializationPromise = this.performInitialization();
    await this.initializationPromise;
    
    return this.components;
  }
  
  private async performInitialization(): Promise<void> {
    console.log('SDKInitializer: Starting initialization...');
    
    try {
      // Wait for initial delay to ensure DOM readiness
      if (this.config.initializationDelay! > 0) {
        await this.delay(this.config.initializationDelay!);
      }
      
      // Initialize components in proper order (based on dependencies)
      await this.initializeWithRetry();
      
      // Setup cross-component communication
      this.setupComponentCommunication();
      
      // Mark as initialized
      this.initialized = true;
      
      console.log('SDKInitializer: Initialization complete');
      
      // Emit initialization complete event
      this.emitInitializationEvent('complete');
      
    } catch (error) {
      console.error('SDKInitializer: Initialization failed:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      this.emitInitializationEvent('failed', err);
      throw error;
    }
  }
  
  private async initializeWithRetry(): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        await this.initializeComponents();
        return; // Success
      } catch (error) {
        lastError = error as Error;
        console.warn(`SDKInitializer: Attempt ${attempt} failed:`, error);
        
        if (attempt < this.config.retryAttempts!) {
          await this.delay(this.config.retryDelay!);
        }
      }
    }
    
    throw lastError || new Error('Initialization failed after all retry attempts');
  }
  
  private async initializeComponents(): Promise<void> {
    // Initialize CanonicalUrlService first (no dependencies)
    this.components.canonicalUrlService = await this.initializeCanonicalUrlService();
    
    // Initialize PageContextManager (depends on CanonicalUrlService)
    if (this.config.enablePageContextManager) {
      this.components.pageContextManager = await this.initializePageContextManager();
    }
    
    // Initialize TabController last (depends on PageContextManager)
    if (this.config.enableTabController) {
      this.components.tabController = await this.initializeTabController();
    }
  }
  
  private async initializeCanonicalUrlService(): Promise<CanonicalUrlService> {
    const { DefaultCanonicalUrlService } = await import('./CanonicalUrlService.js');
    return new DefaultCanonicalUrlService();
  }
  
  private async initializePageContextManager(): Promise<PageContextManager> {
    const { PageContextManager } = await import('./PageContextManager.js');
    
    return new PageContextManager(this.components.canonicalUrlService);
  }
  
  private async initializeTabController(): Promise<TabController> {
    const { TabController } = await import('./TabController.js');
    
    return new TabController({
      pageContextManager: this.components.pageContextManager,
      canonicalUrlService: this.components.canonicalUrlService,
      enableMessageListener: this.config.enableMessageListeners
    });
  }
  
  private setupComponentCommunication(): void {
    // Setup communication between components to prevent timing issues
    
    if (this.components.tabController && this.components.pageContextManager) {
      // Listen for tab controller events and ensure page context is updated
      document.addEventListener('CANOPI_SDK_TAB_CHANGED', () => {
        // Force page context refresh when tab changes
        setTimeout(() => {
          this.components.pageContextManager?.refresh();
        }, 50); // Small delay to allow tab change to complete
      });
    }
    
    // Setup periodic health checks to detect stale state
    this.setupHealthChecks();
  }
  
  private setupHealthChecks(): void {
    // Periodic check to ensure components are in sync
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds; cleared by cleanup() (F7)
  }
  
  private performHealthCheck(): void {
    try {
      const currentUrl = window.location.href;
      
      // Check if page context manager has current URL
      const pageContext = this.components.pageContextManager?.getPageContext();
      if (pageContext && pageContext.url !== currentUrl) {
        console.warn('SDKInitializer: Detected stale page context, refreshing...');
        this.components.pageContextManager?.refresh();
      }
      
      // Check if tab controller has current URL
      const tabData = this.components.tabController?.getCurrentTabData();
      if (tabData && tabData.url !== currentUrl) {
        console.warn('SDKInitializer: Detected stale tab data, refreshing...');
        this.components.tabController?.forceRefresh();
      }
      
    } catch (error) {
      console.error('SDKInitializer: Health check failed:', error);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private emitInitializationEvent(status: 'complete' | 'failed', error?: Error): void {
    const event = new CustomEvent('CANOPI_SDK_INITIALIZATION', {
      detail: {
        status,
        components: Object.keys(this.components),
        error: error?.message,
        timestamp: Date.now()
      }
    });
    
    document.dispatchEvent(event);
  }
  
  // Public API
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  getComponents(): SDKComponents {
    return { ...this.components };
  }
  
  getComponent<T extends keyof SDKComponents>(name: T): SDKComponents[T] {
    return this.components[name];
  }
  
  // Force re-initialization (useful for error recovery)
  async reinitialize(): Promise<SDKComponents> {
    this.initialized = false;
    this.initializationPromise = null;
    
    // Cleanup existing components
    this.cleanup();
    
    // Clear components
    this.components = {};
    
    // Re-initialize
    return this.initialize();
  }
  
  // Manual refresh of all components (addresses timing issues)
  refreshAll(): void {
    console.log('SDKInitializer: Refreshing all components...');
    
    this.components.pageContextManager?.refresh();
    this.components.tabController?.forceRefresh();
  }
  
  // Cleanup method
  cleanup(): void {
    this.components.tabController?.destroy();
    this.components.pageContextManager?.destroy();
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

// Singleton instance for global use
export const sdkInitializer = new SDKInitializer();

// Auto-initialize when imported (with timing safeguards)
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      sdkInitializer.initialize().catch(console.error);
    });
  } else {
    // DOM already ready, initialize with small delay
    setTimeout(() => {
      sdkInitializer.initialize().catch(console.error);
    }, 100);
  }
}