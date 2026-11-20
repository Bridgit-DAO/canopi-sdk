/**
 * PageContextManager - Manages page context for canopi sidebar SDK
 * Based on canopi bike rack implementation plan Phase 5
 */

import { CanonicalUrlService, canonicalUrlService as defaultCanonicalUrlService } from './CanonicalUrlService.js';

export interface PageContext {
  url: string;
  canonicalUrl: string;
  title: string;
  timestamp: number;
}

export interface PageContextChangedEvent {
  canonicalUrl: string;
  url: string;
  title: string;
  previousContext?: PageContext;
}

export class PageContextManager {
  private pageContext: PageContext | null = null;
  private canonicalUrlService: CanonicalUrlService;
  private observers: Set<(context: PageContext) => void> = new Set();
  
  constructor(canonicalUrlService?: CanonicalUrlService) {
    this.canonicalUrlService = canonicalUrlService ?? defaultCanonicalUrlService;
    this.initialize();
  }
  
  private initialize(): void {
    // Set initial page context
    this.updatePageContext(window.location.href, document.title);
    
    // Listen for navigation events
    this.setupNavigationListeners();
    
    // Listen for title changes
    this.setupTitleObserver();
  }
  
  private setupNavigationListeners(): void {
    // Handle pushState/replaceState navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleNavigationChange();
    };
    
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleNavigationChange();
    };
    
    // Handle popstate (back/forward buttons)
    window.addEventListener('popstate', () => {
      this.handleNavigationChange();
    });
    
    // Handle hash changes
    window.addEventListener('hashchange', () => {
      this.handleNavigationChange();
    });
  }
  
  private setupTitleObserver(): void {
    // Observe title changes using MutationObserver
    const titleElement = document.querySelector('title');
    if (titleElement) {
      const observer = new MutationObserver(() => {
        this.updatePageContext(window.location.href, document.title);
      });
      
      observer.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }
  
  private handleNavigationChange(): void {
    // Small delay to allow page to update
    setTimeout(() => {
      this.updatePageContext(window.location.href, document.title);
    }, 10);
  }
  
  private updatePageContext(rawUrl: string, title: string): void {
    const canonicalUrl = this.canonicalUrlService.getCanonicalUrl(rawUrl);
    const previousContext = this.pageContext;
    
    // Check if context actually changed
    if (previousContext && previousContext.canonicalUrl === canonicalUrl) {
      // Only update title if it changed
      if (previousContext.title !== title) {
        this.pageContext = {
          ...previousContext,
          title,
          timestamp: Date.now()
        };
        this.notifyObservers();
      }
      return;
    }
    
    // Create new context
    this.pageContext = {
      url: rawUrl,
      canonicalUrl,
      title,
      timestamp: Date.now()
    };
    
    // Emit page context changed event
    this.emitPageContextChangedEvent(previousContext ?? undefined);
    
    // Notify observers
    this.notifyObservers();
  }
  
  private emitPageContextChangedEvent(previousContext?: PageContext): void {
    if (!this.pageContext) return;
    
    const eventData: PageContextChangedEvent = {
      canonicalUrl: this.pageContext.canonicalUrl,
      url: this.pageContext.url,
      title: this.pageContext.title,
      previousContext
    };
    
    const event = new CustomEvent('page-context-changed', {
      detail: eventData
    });
    
    document.dispatchEvent(event);
    
    console.log('PageContextManager: Context changed to', this.pageContext.canonicalUrl);
  }
  
  private notifyObservers(): void {
    if (!this.pageContext) return;
    
    this.observers.forEach(observer => {
      try {
        observer(this.pageContext!);
      } catch (error) {
        console.error('PageContextManager: Observer error:', error);
      }
    });
  }
  
  // Public API
  
  getPageContext(): PageContext | null {
    return this.pageContext;
  }
  
  setPageContext(rawUrl: string, title?: string): void {
    const pageTitle = title || document.title;
    this.updatePageContext(rawUrl, pageTitle);
  }
  
  // Observer pattern for programmatic listening
  addObserver(observer: (context: PageContext) => void): void {
    this.observers.add(observer);
    
    // Immediately call with current context if available
    if (this.pageContext) {
      // Use setTimeout to avoid synchronous callback issues
      setTimeout(() => {
        observer(this.pageContext!);
      }, 0);
    }
  }
  
  removeObserver(observer: (context: PageContext) => void): void {
    this.observers.delete(observer);
  }
  
  // Clear all observers (useful for cleanup)
  clearObservers(): void {
    this.observers.clear();
  }
  
  // Utility methods
  
  getCurrentUrl(): string | null {
    return this.pageContext?.url || null;
  }
  
  getCanonicalUrl(): string | null {
    return this.pageContext?.canonicalUrl || null;
  }
  
  getCurrentTitle(): string | null {
    return this.pageContext?.title || null;
  }
  
  isCurrentPage(url: string): boolean {
    if (!this.pageContext) return false;
    
    const canonicalUrl = this.canonicalUrlService.getCanonicalUrl(url);
    return this.pageContext.canonicalUrl === canonicalUrl;
  }
  
  // Manual refresh method
  refresh(): void {
    this.updatePageContext(window.location.href, document.title);
  }
  
  // Cleanup method
  destroy(): void {
    this.observers.clear();
    // Note: We don't restore original pushState/replaceState to avoid conflicts
  }
}

// Singleton instance for convenience
// Lazy singleton: the constructor attaches window listeners, so nothing is created at import (F7).
let sharedPageContextManager: PageContextManager | null = null;
export function getPageContextManager(): PageContextManager {
  if (!sharedPageContextManager) sharedPageContextManager = new PageContextManager();
  return sharedPageContextManager;
}