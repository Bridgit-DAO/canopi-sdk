/**
 * TabController - Handles tab lifecycle and timing issues discovered from Wayback machine work
 * Solves stale state problems when users navigate or switch tabs
 */

import { PageContextManager, PageContext } from './PageContextManager.js';
import { CanonicalUrlService, canonicalUrlService } from './CanonicalUrlService.js';

export interface TabControllerConfig {
  pageContextManager?: PageContextManager;
  canonicalUrlService?: CanonicalUrlService;
  enableMessageListener?: boolean;
}

export interface TabData {
  url: string;
  canonicalUrl: string;
  title: string;
  tabId?: number;
  timestamp: number;
}

export class TabController {
  private pageContextManager: PageContextManager;
  private canonicalUrlService: CanonicalUrlService;
  private currentTabData: TabData | null = null;
  private messageListener: ((message: any, sender: any, sendResponse: any) => void) | null = null;
  
  constructor(config: TabControllerConfig = {}) {
    this.pageContextManager = config.pageContextManager || new PageContextManager();
    this.canonicalUrlService = config.canonicalUrlService || canonicalUrlService;
    
    if (config.enableMessageListener !== false) {
      this.setupMessageListener();
    }
    
    this.initialize();
  }
  
  private initialize(): void {
    // Initialize with current page context
    this.refreshFromActiveTab();
    
    // Listen for page context changes from PageContextManager
    this.pageContextManager.addObserver((context) => {
      this.handlePageContextChange(context);
    });
  }
  
  /**
   * Critical method discovered from Wayback machine work:
   * When user switches tabs or navigates, sidepanel must refresh to avoid stale state
   */
  public refreshFromActiveTab(): void {
    try {
      // Get current page context
      const pageContext = this.pageContextManager.getPageContext();
      
      if (pageContext) {
        this.updateCurrentTabData({
          url: pageContext.url,
          canonicalUrl: pageContext.canonicalUrl,
          title: pageContext.title,
          timestamp: pageContext.timestamp
        });
      } else {
        // Force refresh page context if not available
        this.pageContextManager.refresh();
      }
      
      console.log('TabController: Refreshed from active tab');
    } catch (error) {
      console.error('TabController: Failed to refresh from active tab:', error);
    }
  }
  
  /**
   * Setup chrome.runtime.onMessage listener for TAB_CHANGED events
   * Critical fix discovered from Wayback machine work
   */
  private setupMessageListener(): void {
    // Check if we're in extension context
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      this.messageListener = (message, sender, sendResponse) => {
        this.handleRuntimeMessage(message, sender, sendResponse);
      };
      
      chrome.runtime.onMessage.addListener(this.messageListener);
      console.log('TabController: Runtime message listener setup');
    } else {
      // Fallback for non-extension environments
      this.setupFallbackListeners();
    }
  }
  
  private handleRuntimeMessage(message: any, _sender: any, _sendResponse: any): void {
    switch (message.type) {
      case 'TAB_CHANGED':
        console.log('TabController: Received TAB_CHANGED message');
        this.handleTabChanged(message.data);
        break;
        
      case 'TAB_UPDATED':
        console.log('TabController: Received TAB_UPDATED message');
        this.handleTabUpdated(message.data);
        break;
        
      case 'TAB_ACTIVATED':
        console.log('TabController: Received TAB_ACTIVATED message');
        this.refreshFromActiveTab();
        break;
        
      default:
        // Ignore unknown messages
        break;
    }
  }
  
  private setupFallbackListeners(): void {
    // For non-extension environments, listen for custom events
    document.addEventListener('CANOPI_TAB_CHANGED', (event: Event) => {
      this.handleTabChanged((event as CustomEvent).detail);
    });
    
    document.addEventListener('CANOPI_TAB_UPDATED', (event: Event) => {
      this.handleTabUpdated((event as CustomEvent).detail);
    });
    
    console.log('TabController: Fallback event listeners setup');
  }
  
  private handleTabChanged(data: any): void {
    console.log('TabController: Handling tab change:', data);
    
    // Critical: Re-fetch active tab URL and update currentUrlData
    // This prevents stale state when user navigates
    this.refreshFromActiveTab();
    
    // Emit tab change event for SDK consumers
    this.emitTabChangeEvent(data);
  }
  
  private handleTabUpdated(data: any): void {
    console.log('TabController: Handling tab update:', data);
    
    // Update current tab data if it matches
    if (data.url) {
      const canonicalUrl = this.canonicalUrlService.getCanonicalUrl(data.url);
      
      this.updateCurrentTabData({
        url: data.url,
        canonicalUrl,
        title: data.title || document.title,
        tabId: data.tabId,
        timestamp: Date.now()
      });
    }
  }
  
  private handlePageContextChange(context: PageContext): void {
    this.updateCurrentTabData({
      url: context.url,
      canonicalUrl: context.canonicalUrl,
      title: context.title,
      timestamp: context.timestamp
    });
  }
  
  private updateCurrentTabData(tabData: Partial<TabData>): void {
    const previousData = this.currentTabData;
    
    this.currentTabData = {
      ...this.currentTabData,
      ...tabData,
      timestamp: Date.now()
    } as TabData;
    
    // Emit update event if URL changed
    if (!previousData || previousData.canonicalUrl !== this.currentTabData.canonicalUrl) {
      this.emitTabDataUpdateEvent(previousData);
    }
  }
  
  private emitTabChangeEvent(data: any): void {
    const event = new CustomEvent('CANOPI_SDK_TAB_CHANGED', {
      detail: {
        currentTabData: this.currentTabData,
        changeData: data,
        timestamp: Date.now()
      }
    });
    
    document.dispatchEvent(event);
  }
  
  private emitTabDataUpdateEvent(previousData: TabData | null): void {
    const event = new CustomEvent('CANOPI_SDK_TAB_DATA_UPDATED', {
      detail: {
        currentTabData: this.currentTabData,
        previousTabData: previousData,
        timestamp: Date.now()
      }
    });
    
    document.dispatchEvent(event);
  }
  
  // Public API
  
  getCurrentTabData(): TabData | null {
    return this.currentTabData;
  }
  
  getCurrentUrl(): string | null {
    return this.currentTabData?.url || null;
  }
  
  getCanonicalUrl(): string | null {
    return this.currentTabData?.canonicalUrl || null;
  }
  
  getCurrentTitle(): string | null {
    return this.currentTabData?.title || null;
  }
  
  // Force refresh method for SDK consumers
  forceRefresh(): void {
    this.refreshFromActiveTab();
  }
  
  // Check if current tab matches URL
  isCurrentTab(url: string): boolean {
    if (!this.currentTabData) return false;
    
    const canonicalUrl = this.canonicalUrlService.getCanonicalUrl(url);
    return this.currentTabData.canonicalUrl === canonicalUrl;
  }
  
  // Cleanup method
  destroy(): void {
    if (this.messageListener && chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
    }
    
    // Remove page context observer
    // Note: PageContextManager doesn't expose removeObserver in current implementation
    // This would need to be added to PageContextManager
  }
}

// Singleton instance for convenience
// Lazy singleton: the constructor attaches message listeners, so nothing is created at import (F7).
let sharedTabController: TabController | null = null;
export function getTabController(): TabController {
  if (!sharedTabController) sharedTabController = new TabController();
  return sharedTabController;
}