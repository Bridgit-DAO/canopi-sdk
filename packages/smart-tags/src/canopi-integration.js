/**
 * Canopi Smart Tag Integration Adapter
 * Integrates VisualizationSmartTag with the canopi smart tag system
 */

class CanopiSmartTagAdapter {
    constructor(options = {}) {
        this.options = {
            providers: ['local', 'hypothesis'], // Support multiple providers
            syncEnabled: true,
            autoSave: true,
            ...options
        };
        
        this.providers = new Map();
        this.contentAnchorManager = null;
        this.visualizationSmartTag = null;
        
        this.init();
    }
    
    init() {
        this.initializeProviders();
        this.initializeContentAnchorManager();
        this.initializeVisualizationSmartTag();
        this.setupCanopiEventListeners();
    }
    
    initializeProviders() {
        // Local provider (default)
        this.providers.set('local', new LocalAnnotationProvider());
        
        // Hypothesis provider (if enabled)
        if (this.options.providers.includes('hypothesis')) {
            this.providers.set('hypothesis', new HypothesisAnnotationProvider());
        }
    }
    
    initializeContentAnchorManager() {
        this.contentAnchorManager = new ContentAnchorManager({
            onAnchorCreated: (anchor) => this.handleAnchorCreated(anchor),
            onAnchorUpdated: (anchor) => this.handleAnchorUpdated(anchor),
            onAnchorDeleted: (anchorId) => this.handleAnchorDeleted(anchorId)
        });
    }
    
    initializeVisualizationSmartTag() {
        this.visualizationSmartTag = new VisualizationSmartTag({
            enableSelection: true,
            enableVisualization: true,
            enableStyleEditor: true,
            providers: Array.from(this.providers.keys())
        });
        
        // Override save method to use canopi providers
        const originalSave = this.visualizationSmartTag.saveVisualization.bind(this.visualizationSmartTag);
        this.visualizationSmartTag.saveVisualization = (visualization) => {
            this.saveToProviders(visualization);
            if (this.options.autoSave) {
                originalSave(visualization);
            }
        };
    }
    
    setupCanopiEventListeners() {
        // Listen for canopi-specific events
        document.addEventListener('CANOPI_TAB_CHANGED', (event) => {
            this.handleTabChanged(event.detail);
        });
        
        document.addEventListener('CANOPI_URL_CONTEXT_UPDATED', (event) => {
            this.handleUrlContextUpdated(event.detail);
        });
        
        document.addEventListener('CANOPI_ANCHOR_SYNC_REQUEST', (event) => {
            this.handleAnchorSyncRequest(event.detail);
        });
        
        // Listen for visualization events
        document.addEventListener('CANOPI_VISUALIZATION_EVENT', (event) => {
            this.handleVisualizationEvent(event.detail);
        });
    }
    
    handleAnchorCreated(anchor) {
        // Sync with all enabled providers
        this.providers.forEach((provider, providerId) => {
            if (provider.isEnabled()) {
                provider.createAnchor(anchor);
            }
        });
        
        // Emit canopi event
        this.emitCanopiEvent('CANOPI_ANCHOR_CREATED', { anchor });
    }
    
    handleAnchorUpdated(anchor) {
        // Sync updates with providers
        this.providers.forEach((provider, providerId) => {
            if (provider.isEnabled() && provider.hasAnchor(anchor.id)) {
                provider.updateAnchor(anchor);
            }
        });
        
        // Emit canopi event
        this.emitCanopiEvent('CANOPI_ANCHOR_UPDATED', { anchor });
    }
    
    handleAnchorDeleted(anchorId) {
        // Remove from all providers
        this.providers.forEach((provider, providerId) => {
            if (provider.isEnabled() && provider.hasAnchor(anchorId)) {
                provider.deleteAnchor(anchorId);
            }
        });
        
        // Emit canopi event
        this.emitCanopiEvent('CANOPI_ANCHOR_DELETED', { anchorId });
    }
    
    handleTabChanged(detail) {
        // Handle tab changes - reload anchors for new context
        this.loadAnchorsForContext(detail.url);
    }
    
    handleUrlContextUpdated(detail) {
        // Handle URL context updates
        this.contentAnchorManager.updateContext(detail);
    }
    
    handleAnchorSyncRequest(detail) {
        // Handle sync requests from other canopi components
        this.syncAnchorsWithProviders();
    }
    
    handleVisualizationEvent(detail) {
        // Handle visualization events and sync with canopi system
        console.log('Visualization event:', detail);
        
        // Update canopi state
        this.updateCanopiState(detail);
    }
    
    saveToProviders(visualization) {
        this.providers.forEach((provider, providerId) => {
            if (provider.isEnabled()) {
                provider.saveVisualization(visualization);
            }
        });
    }
    
    loadAnchorsForContext(url) {
        // Load anchors from all providers for the given context
        const allAnchors = [];
        
        this.providers.forEach((provider, providerId) => {
            if (provider.isEnabled()) {
                const anchors = provider.getAnchorsForUrl(url);
                allAnchors.push(...anchors);
            }
        });
        
        // Restore visualizations
        allAnchors.forEach(anchor => {
            this.restoreVisualization(anchor);
        });
    }
    
    restoreVisualization(anchor) {
        // Restore visualization from anchor data
        if (anchor.visualization) {
            this.visualizationSmartTag.restoreVisualization(anchor.visualization);
        }
    }
    
    syncAnchorsWithProviders() {
        // Sync anchors across all providers
        this.providers.forEach((provider, providerId) => {
            if (provider.isEnabled() && provider.supportsBidirectionalSync()) {
                provider.sync();
            }
        });
    }
    
    updateCanopiState(visualizationEvent) {
        // Update canopi global state with visualization changes
        const state = {
            type: 'visualization',
            event: visualizationEvent.type,
            data: visualizationEvent.visualization,
            timestamp: Date.now()
        };
        
        // Send to canopi state manager
        this.emitCanopiEvent('CANOPI_STATE_UPDATE', state);
    }
    
    emitCanopiEvent(eventType, data) {
        const event = new CustomEvent(eventType, {
            detail: data
        });
        document.dispatchEvent(event);
    }
    
    // Public API methods
    getVisualizationSmartTag() {
        return this.visualizationSmartTag;
    }
    
    getContentAnchorManager() {
        return this.contentAnchorManager;
    }
    
    addProvider(providerId, provider) {
        this.providers.set(providerId, provider);
    }
    
    removeProvider(providerId) {
        this.providers.delete(providerId);
    }
    
    getProvider(providerId) {
        return this.providers.get(providerId);
    }
}

// Content Anchor Manager following canopi architecture
class ContentAnchorManager {
    constructor(options = {}) {
        this.options = {
            onAnchorCreated: options.onAnchorCreated || (() => {}),
            onAnchorUpdated: options.onAnchorUpdated || (() => {}),
            onAnchorDeleted: options.onAnchorDeleted || (() => {}),
            fullSentenceExpansion: true
        };
        
        this.anchors = new Map();
        this.context = {
            url: window.location.href,
            title: document.title,
            timestamp: Date.now()
        };
    }
    
    createAnchor(selection, metadata = {}) {
        const anchor = {
            id: this.generateAnchorId(),
            type: 'text',
            pageUrl: this.context.url,
            pageTitle: this.context.title,
            textFragment: selection.toString(),
            startOffset: selection.getRangeAt(0).startOffset,
            endOffset: selection.getRangeAt(0).endOffset,
            containerPath: this.getElementPath(selection.getRangeAt(0).commonAncestorContainer),
            contentHash: this.generateContentHash(selection.toString()),
            timestamp: Date.now(),
            metadata: metadata,
            ...this.extractTextAnchorContext(selection)
        };
        
        if (this.options.fullSentenceExpansion) {
            anchor.expandedText = this.expandToFullSentence(selection);
        }
        
        this.anchors.set(anchor.id, anchor);
        this.options.onAnchorCreated(anchor);
        
        return anchor;
    }
    
    updateAnchor(anchorId, updates) {
        const anchor = this.anchors.get(anchorId);
        if (!anchor) return null;
        
        const updatedAnchor = { ...anchor, ...updates, updatedAt: Date.now() };
        this.anchors.set(anchorId, updatedAnchor);
        this.options.onAnchorUpdated(updatedAnchor);
        
        return updatedAnchor;
    }
    
    deleteAnchor(anchorId) {
        if (this.anchors.has(anchorId)) {
            this.anchors.delete(anchorId);
            this.options.onAnchorDeleted(anchorId);
            return true;
        }
        return false;
    }
    
    extractTextAnchorContext(selection) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        return {
            textAnchorContext: {
                before: this.getContextText(container, range.startOffset, -50),
                after: this.getContextText(container, range.endOffset, 50),
                containerTag: container.parentElement?.tagName?.toLowerCase(),
                containerClasses: container.parentElement?.className || ''
            }
        };
    }
    
    getContextText(container, offset, length) {
        const text = container.textContent || '';
        if (length < 0) {
            return text.substring(Math.max(0, offset + length), offset);
        } else {
            return text.substring(offset, Math.min(text.length, offset + length));
        }
    }
    
    expandToFullSentence(selection) {
        // Expand selection to include full sentences
        const text = selection.toString();
        const container = selection.getRangeAt(0).commonAncestorContainer;
        const fullText = container.textContent || '';
        
        const startIndex = fullText.indexOf(text);
        if (startIndex === -1) return text;
        
        // Find sentence boundaries
        const beforeText = fullText.substring(0, startIndex);
        const afterText = fullText.substring(startIndex + text.length);
        
        const sentenceStart = Math.max(
            beforeText.lastIndexOf('.'),
            beforeText.lastIndexOf('!'),
            beforeText.lastIndexOf('?')
        ) + 1;
        
        const sentenceEndIndex = Math.min(
            afterText.indexOf('.') !== -1 ? afterText.indexOf('.') + 1 : Infinity,
            afterText.indexOf('!') !== -1 ? afterText.indexOf('!') + 1 : Infinity,
            afterText.indexOf('?') !== -1 ? afterText.indexOf('?') + 1 : Infinity
        );
        
        const sentenceEnd = sentenceEndIndex === Infinity ? 
            fullText.length : 
            startIndex + text.length + sentenceEndIndex;
        
        return fullText.substring(sentenceStart, sentenceEnd).trim();
    }
    
    updateContext(newContext) {
        this.context = { ...this.context, ...newContext };
    }
    
    generateAnchorId() {
        return `anchor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateContentHash(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString();
    }
    
    getElementPath(element) {
        const path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();
            if (element.id) {
                selector += `#${element.id}`;
            } else if (element.className) {
                selector += `.${element.className.split(' ').join('.')}`;
            }
            path.unshift(selector);
            element = element.parentNode;
        }
        return path.join(' > ');
    }
}

// Local Annotation Provider
class LocalAnnotationProvider {
    constructor() {
        this.storageKey = 'canopi-local-annotations';
        this.enabled = true;
    }
    
    isEnabled() {
        return this.enabled;
    }
    
    createAnchor(anchor) {
        const stored = this.getStoredData();
        stored.anchors = stored.anchors || [];
        stored.anchors.push(anchor);
        this.saveStoredData(stored);
    }
    
    updateAnchor(anchor) {
        const stored = this.getStoredData();
        stored.anchors = stored.anchors || [];
        const index = stored.anchors.findIndex(a => a.id === anchor.id);
        if (index !== -1) {
            stored.anchors[index] = anchor;
            this.saveStoredData(stored);
        }
    }
    
    deleteAnchor(anchorId) {
        const stored = this.getStoredData();
        stored.anchors = stored.anchors || [];
        stored.anchors = stored.anchors.filter(a => a.id !== anchorId);
        this.saveStoredData(stored);
    }
    
    hasAnchor(anchorId) {
        const stored = this.getStoredData();
        return (stored.anchors || []).some(a => a.id === anchorId);
    }
    
    getAnchorsForUrl(url) {
        const stored = this.getStoredData();
        return (stored.anchors || []).filter(a => a.pageUrl === url);
    }
    
    saveVisualization(visualization) {
        const stored = this.getStoredData();
        stored.visualizations = stored.visualizations || [];
        stored.visualizations.push(visualization);
        this.saveStoredData(stored);
    }
    
    supportsBidirectionalSync() {
        return false; // Local provider doesn't need bidirectional sync
    }
    
    getStoredData() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        } catch (e) {
            return {};
        }
    }
    
    saveStoredData(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }
}

// Hypothesis Annotation Provider (placeholder)
class HypothesisAnnotationProvider {
    constructor() {
        this.apiUrl = 'https://api.hypothes.is/api';
        this.enabled = false; // Requires authentication
    }
    
    isEnabled() {
        return this.enabled && this.hasValidToken();
    }
    
    hasValidToken() {
        // Check for valid Hypothesis API token
        return localStorage.getItem('hypothesis-api-token') !== null;
    }
    
    createAnchor(anchor) {
        if (!this.isEnabled()) return;
        // Implementation for creating Hypothesis annotations
        console.log('Creating Hypothesis annotation:', anchor);
    }
    
    updateAnchor(anchor) {
        if (!this.isEnabled()) return;
        // Implementation for updating Hypothesis annotations
        console.log('Updating Hypothesis annotation:', anchor);
    }
    
    deleteAnchor(anchorId) {
        if (!this.isEnabled()) return;
        // Implementation for deleting Hypothesis annotations
        console.log('Deleting Hypothesis annotation:', anchorId);
    }
    
    hasAnchor(anchorId) {
        // Check if anchor exists in Hypothesis
        return false;
    }
    
    getAnchorsForUrl(url) {
        if (!this.isEnabled()) return [];
        // Fetch annotations from Hypothesis API
        return [];
    }
    
    saveVisualization(visualization) {
        if (!this.isEnabled()) return;
        // Save visualization as Hypothesis annotation
        console.log('Saving visualization to Hypothesis:', visualization);
    }
    
    supportsBidirectionalSync() {
        return true;
    }
    
    sync() {
        if (!this.isEnabled()) return;
        // Sync with Hypothesis API
        console.log('Syncing with Hypothesis API');
    }
}

// Export for use
window.CanopiSmartTagAdapter = CanopiSmartTagAdapter;
window.ContentAnchorManager = ContentAnchorManager;
window.LocalAnnotationProvider = LocalAnnotationProvider;
window.HypothesisAnnotationProvider = HypothesisAnnotationProvider;