/**
 * SmartTagManager - Canopi Bike Rack Implementation
 * Unified notes smart tag with pluggable annotation providers
 */

import { Anchor, Annotation, AnnotationProvider } from './types/annotations.js';
import { LocalProvider } from './providers/LocalProvider.js';
import { HypothesisProvider } from './providers/HypothesisProvider.js';

export interface SmartTagConfig {
  providers?: string[];
  defaultProvider?: string;
  syncEnabled?: boolean;
  autoSave?: boolean;
  canonicalUrlService?: CanonicalUrlService;
}

export interface CanonicalUrlService {
  getCanonicalUrl(rawUrl: string): string;
}

export class SmartTagManager {
  private providers: Map<string, AnnotationProvider> = new Map();
  private config: SmartTagConfig;
  private canonicalUrlService: CanonicalUrlService;
  
  constructor(config: SmartTagConfig = {}) {
    this.config = {
      providers: ['local'],
      defaultProvider: 'local',
      syncEnabled: true,
      autoSave: true,
      ...config
    };
    
    this.canonicalUrlService = config.canonicalUrlService || new DefaultCanonicalUrlService();
    this.initializeProviders();
    this.setupEventListeners();
  }
  
  private initializeProviders(): void {
    // Always include local provider
    this.providers.set('local', new LocalProvider());
    
    // Add Hypothesis provider if requested
    if (this.config.providers?.includes('hypothesis')) {
      this.providers.set('hypothesis', new HypothesisProvider());
    }
  }
  
  private setupEventListeners(): void {
    // Listen for canopi selection events
    document.addEventListener('CANOPI_SELECTION_CHANGED', ((event: CustomEvent) => {
      this.handleSelectionChanged(event.detail);
    }) as EventListener);
    
    // Listen for page context changes
    document.addEventListener('page-context-changed', ((event: CustomEvent) => {
      this.handlePageContextChanged(event.detail);
    }) as EventListener);
    
    // Listen for SDK tab changes (prevents stale state from Wayback insights)
    document.addEventListener('CANOPI_SDK_TAB_CHANGED', ((event: CustomEvent) => {
      this.handleTabChanged(event.detail);
    }) as EventListener);
    
    // Listen for SDK initialization
    document.addEventListener('CANOPI_SDK_INITIALIZATION', ((event: CustomEvent) => {
      this.handleSDKInitialization(event.detail);
    }) as EventListener);
  }
  
  private handleSelectionChanged(detail: any): void {
    const { selection, text } = detail;
    
    if (!text || text.trim().length < 3) return;
    
    // Create anchor from selection
    const anchor = this.createAnchorFromSelection(selection, text);
    
    // Show annotation options
    this.showAnnotationOptions(anchor);
  }
  
  private handlePageContextChanged(detail: { canonicalUrl: string }): void {
    // Reload annotations for new page context
    this.loadAnnotationsForUrl(detail.canonicalUrl);
  }
  
  private handleTabChanged(detail: any): void {
    // Critical: Handle tab changes to prevent stale annotations
    console.log('SmartTagManager: Tab changed, refreshing annotations');
    
    if (detail.currentTabData?.canonicalUrl) {
      // Clear any cached state and reload for new tab
      this.loadAnnotationsForUrl(detail.currentTabData.canonicalUrl);
    }
  }
  
  private handleSDKInitialization(detail: { status: string }): void {
    if (detail.status === 'complete') {
      console.log('SmartTagManager: SDK initialization complete, refreshing state');
      
      // Refresh annotations for current page after SDK is ready
      const currentUrl = this.canonicalUrlService.getCanonicalUrl(window.location.href);
      this.loadAnnotationsForUrl(currentUrl);
    }
  }
  
  private createAnchorFromSelection(selection: Selection, text: string): Anchor {
    const range = selection.getRangeAt(0);
    const canonicalUrl = this.canonicalUrlService.getCanonicalUrl(window.location.href);
    
    return {
      id: this.generateAnchorId(),
      selector: this.generateSelector(range),
      text: text.trim(),
      pageUrl: canonicalUrl,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      createdAt: Date.now()
    };
  }
  
  private generateSelector(range: Range): string {
    // Generate CSS selector or XPath for the range
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container as Element;
    
    if (!element) return 'body';
    
    // Simple selector generation - can be enhanced
    let selector = element.tagName.toLowerCase();
    
    if (element.id) {
      selector += `#${element.id}`;
    } else if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }
    
    return selector;
  }
  
  private generateAnchorId(): string {
    return `anchor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private showAnnotationOptions(anchor: Anchor): void {
    // Emit event to show annotation UI
    const event = new CustomEvent('CANOPI_SHOW_ANNOTATION_OPTIONS', {
      detail: { anchor }
    });
    document.dispatchEvent(event);
  }
  
  // Public API methods
  
  async createAnnotation(anchor: Anchor, content: string, tags: string[] = []): Promise<void> {
    const annotation: Annotation = {
      id: this.generateAnnotationId(),
      anchorId: anchor.id,
      content,
      tags,
      provider: this.config.defaultProvider!,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Save to all enabled providers
    const promises = Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isEnabled())
      .map(([_, provider]) => provider.createAnnotation(anchor, annotation));
    
    await Promise.all(promises);
    
    // Emit creation event
    this.emitAnnotationEvent('created', annotation);
  }
  
  async getAnnotationsForUrl(url: string): Promise<Annotation[]> {
    const canonicalUrl = this.canonicalUrlService.getCanonicalUrl(url);
    const allAnnotations: Annotation[] = [];
    
    for (const [_, provider] of this.providers) {
      if (provider.isEnabled()) {
        try {
          const annotations = await provider.getAnnotations(canonicalUrl);
          allAnnotations.push(...annotations);
        } catch (error) {
          console.warn(`Failed to load annotations from provider:`, error);
        }
      }
    }
    
    // Deduplicate and sort by creation time
    const uniqueAnnotations = this.deduplicateAnnotations(allAnnotations);
    return uniqueAnnotations.sort((a, b) => a.createdAt - b.createdAt);
  }
  
  async updateAnnotation(annotationId: string, updates: Partial<Annotation>): Promise<void> {
    const updatedAnnotation = { ...updates, updatedAt: Date.now() };
    
    // Update in all providers that have this annotation
    const promises = Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isEnabled())
      .map(([_, provider]) => provider.updateAnnotation?.(annotationId, updatedAnnotation))
      .filter(Boolean);
    
    await Promise.all(promises);
    
    // Emit update event
    this.emitAnnotationEvent('updated', updatedAnnotation as Annotation);
  }
  
  async deleteAnnotation(annotationId: string): Promise<void> {
    // Delete from all providers
    const promises = Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isEnabled())
      .map(([_, provider]) => provider.deleteAnnotation?.(annotationId))
      .filter(Boolean);
    
    await Promise.all(promises);
    
    // Emit deletion event
    this.emitAnnotationEvent('deleted', { id: annotationId } as Annotation);
  }
  
  async syncProviders(): Promise<void> {
    if (!this.config.syncEnabled) return;
    
    const syncPromises = Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isEnabled() && provider.sync)
      .map(([_, provider]) => provider.sync!());
    
    await Promise.all(syncPromises);
  }
  
  // Provider management
  
  addProvider(id: string, provider: AnnotationProvider): void {
    this.providers.set(id, provider);
  }
  
  removeProvider(id: string): void {
    this.providers.delete(id);
  }
  
  getProvider(id: string): AnnotationProvider | undefined {
    return this.providers.get(id);
  }
  
  listProviders(): Array<{ id: string; enabled: boolean }> {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      enabled: provider.isEnabled()
    }));
  }
  
  // Private utility methods
  
  private generateAnnotationId(): string {
    return `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private deduplicateAnnotations(annotations: Annotation[]): Annotation[] {
    const seen = new Set<string>();
    return annotations.filter(annotation => {
      const key = `${annotation.anchorId}-${annotation.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private async loadAnnotationsForUrl(url: string): Promise<void> {
    try {
      const annotations = await this.getAnnotationsForUrl(url);
      
      // Emit event with loaded annotations
      const event = new CustomEvent('CANOPI_ANNOTATIONS_LOADED', {
        detail: { url, annotations }
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to load annotations:', error);
    }
  }
  
  private emitAnnotationEvent(type: 'created' | 'updated' | 'deleted', annotation: Annotation): void {
    const event = new CustomEvent('CANOPI_ANNOTATION_EVENT', {
      detail: { type, annotation, timestamp: Date.now() }
    });
    document.dispatchEvent(event);
  }
}

// Default canonical URL service implementation
class DefaultCanonicalUrlService implements CanonicalUrlService {
  getCanonicalUrl(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      
      // Check if this is a canopi proxy URL
      if (url.hostname.includes('canopi') && url.searchParams.has('url')) {
        const targetUrl = url.searchParams.get('url');
        return targetUrl ? decodeURIComponent(targetUrl) : rawUrl;
      }
      
      // Return normalized URL (remove fragment, sort params)
      url.hash = '';
      url.search = new URLSearchParams([...url.searchParams.entries()].sort()).toString();
      
      return url.toString();
    } catch (error) {
      console.warn('Failed to parse URL:', rawUrl, error);
      return rawUrl;
    }
  }
}

export { DefaultCanonicalUrlService };