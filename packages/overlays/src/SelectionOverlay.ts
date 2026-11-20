/**
 * SelectionOverlay - Non-invasive selection capture for Canopi smart tags
 * Based on canopi bike rack architecture - overlay above host content
 */

export interface SelectionOverlayConfig {
  minSelectionLength?: number;
  showToolbar?: boolean;
  toolbarDelay?: number;
  enableKeyboardShortcuts?: boolean;
  excludeSelectors?: string[];
}

export interface SelectionData {
  text: string;
  range: Range;
  boundingRect: DOMRect;
  pageUrl: string;
  timestamp: number;
}

export class SelectionOverlay {
  private config: SelectionOverlayConfig;
  private currentSelection: Selection | null = null;
  private toolbar: HTMLElement | null = null;
  private isEnabled = true;
  
  constructor(config: SelectionOverlayConfig = {}) {
    this.config = {
      minSelectionLength: 3,
      showToolbar: true,
      toolbarDelay: 300,
      enableKeyboardShortcuts: true,
      excludeSelectors: ['input', 'textarea', '[contenteditable]'],
      ...config
    };
    
    this.initialize();
  }
  
  private initialize(): void {
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.injectStyles();
  }
  
  private setupEventListeners(): void {
    // Selection change events
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
    
    // Clean up on various events
    document.addEventListener('mousedown', this.hideToolbar.bind(this));
    document.addEventListener('scroll', this.hideToolbar.bind(this));
    window.addEventListener('resize', this.hideToolbar.bind(this));
    
    // Listen for external disable/enable commands
    document.addEventListener('CANOPI_SELECTION_OVERLAY_TOGGLE', ((event: CustomEvent) => {
      this.isEnabled = event.detail.enabled ?? !this.isEnabled;
    }) as EventListener);
  }
  
  private setupKeyboardShortcuts(): void {
    if (!this.config.enableKeyboardShortcuts) return;
    
    document.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + Shift + A: Annotate current selection
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'A') {
        event.preventDefault();
        this.annotateCurrentSelection();
      }
      
      // Escape: Hide toolbar
      if (event.key === 'Escape') {
        this.hideToolbar();
      }
    });
  }
  
  private handleMouseUp(_event: MouseEvent): void {
    if (!this.isEnabled) return;
    
    // Delay to allow selection to settle
    setTimeout(() => {
      this.processSelection();
    }, 10);
  }
  
  private handleSelectionChange(): void {
    if (!this.isEnabled) return;
    
    const selection = window.getSelection();
    
    // Emit selection change event for canopi
    this.emitSelectionChangedEvent(selection);
  }
  
  private processSelection(): void {
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      this.hideToolbar();
      return;
    }
    
    const text = selection.toString().trim();
    
    if (text.length < this.config.minSelectionLength!) {
      this.hideToolbar();
      return;
    }
    
    // Check if selection is in excluded element
    if (this.isSelectionExcluded(selection)) {
      this.hideToolbar();
      return;
    }
    
    this.currentSelection = selection;
    
    if (this.config.showToolbar) {
      this.showToolbar(selection);
    }
    
    // Emit selection made event
    this.emitSelectionMadeEvent(selection, text);
  }
  
  private isSelectionExcluded(selection: Selection): boolean {
    if (!this.config.excludeSelectors?.length) return false;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container as Element;
    
    if (!element) return false;
    
    return this.config.excludeSelectors.some(selector => {
      return element.matches(selector) || element.closest(selector);
    });
  }
  
  private showToolbar(selection: Selection): void {
    this.hideToolbar(); // Remove existing toolbar
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (rect.width === 0 && rect.height === 0) return;
    
    this.toolbar = this.createToolbar();
    this.positionToolbar(this.toolbar, rect);
    
    document.body.appendChild(this.toolbar);
    
    // Auto-hide after delay
    setTimeout(() => {
      if (this.toolbar && !this.toolbar.matches(':hover')) {
        this.hideToolbar();
      }
    }, 5000);
  }
  
  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'canopi-selection-toolbar';
    
    toolbar.innerHTML = `
      <button class="canopi-toolbar-btn canopi-annotate-btn" title="Annotate this text">
        📝 Annotate
      </button>
      <button class="canopi-toolbar-btn canopi-highlight-btn" title="Highlight this text">
        🖍️ Highlight
      </button>
      <button class="canopi-toolbar-btn canopi-discuss-btn" title="Discuss this text">
        💬 Discuss
      </button>
    `;
    
    // Add event listeners
    const annotateBtn = toolbar.querySelector('.canopi-annotate-btn');
    const highlightBtn = toolbar.querySelector('.canopi-highlight-btn');
    const discussBtn = toolbar.querySelector('.canopi-discuss-btn');
    
    annotateBtn?.addEventListener('click', () => {
      this.annotateCurrentSelection();
      this.hideToolbar();
    });
    
    highlightBtn?.addEventListener('click', () => {
      this.highlightCurrentSelection();
      this.hideToolbar();
    });
    
    discussBtn?.addEventListener('click', () => {
      this.discussCurrentSelection();
      this.hideToolbar();
    });
    
    return toolbar;
  }
  
  private positionToolbar(toolbar: HTMLElement, selectionRect: DOMRect): void {
    const toolbarRect = toolbar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate position above selection
    let left = selectionRect.left + (selectionRect.width / 2) - (toolbarRect.width / 2);
    let top = selectionRect.top - toolbarRect.height - 10;
    
    // Adjust for viewport boundaries
    if (left < 10) left = 10;
    if (left + toolbarRect.width > viewportWidth - 10) {
      left = viewportWidth - toolbarRect.width - 10;
    }
    
    // If toolbar would be above viewport, position below selection
    if (top < 10) {
      top = selectionRect.bottom + 10;
    }
    
    // If still outside viewport, position within viewport
    if (top + toolbarRect.height > viewportHeight - 10) {
      top = viewportHeight - toolbarRect.height - 10;
    }
    
    toolbar.style.left = `${left + window.scrollX}px`;
    toolbar.style.top = `${top + window.scrollY}px`;
  }
  
  private hideToolbar(): void {
    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
  }
  
  private annotateCurrentSelection(): void {
    if (!this.currentSelection) return;
    
    const selectionData = this.createSelectionData(this.currentSelection);
    
    this.emitAnnotationRequestEvent('annotate', selectionData);
  }
  
  private highlightCurrentSelection(): void {
    if (!this.currentSelection) return;
    
    const selectionData = this.createSelectionData(this.currentSelection);
    
    this.emitAnnotationRequestEvent('highlight', selectionData);
  }
  
  private discussCurrentSelection(): void {
    if (!this.currentSelection) return;
    
    const selectionData = this.createSelectionData(this.currentSelection);
    
    this.emitAnnotationRequestEvent('discuss', selectionData);
  }
  
  private createSelectionData(selection: Selection): SelectionData {
    const range = selection.getRangeAt(0);
    
    return {
      text: selection.toString().trim(),
      range: range.cloneRange(),
      boundingRect: range.getBoundingClientRect(),
      pageUrl: window.location.href,
      timestamp: Date.now()
    };
  }
  
  // Event emission methods
  
  private emitSelectionChangedEvent(selection: Selection | null): void {
    const event = new CustomEvent('CANOPI_SELECTION_CHANGED', {
      detail: {
        selection,
        text: selection?.toString() || '',
        timestamp: Date.now()
      }
    });
    
    document.dispatchEvent(event);
  }
  
  private emitSelectionMadeEvent(selection: Selection, text: string): void {
    const selectionData = this.createSelectionData(selection);
    
    const event = new CustomEvent('CANOPI_SELECTION_MADE', {
      detail: {
        selectionData,
        text,
        timestamp: Date.now()
      }
    });
    
    document.dispatchEvent(event);
  }
  
  private emitAnnotationRequestEvent(action: string, selectionData: SelectionData): void {
    const event = new CustomEvent('CANOPI_ANNOTATION_REQUEST', {
      detail: {
        action,
        selectionData,
        timestamp: Date.now()
      }
    });
    
    document.dispatchEvent(event);
  }
  
  // Public API
  
  enable(): void {
    this.isEnabled = true;
  }
  
  disable(): void {
    this.isEnabled = false;
    this.hideToolbar();
  }
  
  toggle(): void {
    this.isEnabled ? this.disable() : this.enable();
  }
  
  getCurrentSelection(): Selection | null {
    return this.currentSelection;
  }
  
  // Style injection for non-invasive overlay
  private injectStyles(): void {
    if (document.getElementById('canopi-selection-overlay-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'canopi-selection-overlay-styles';
    style.textContent = `
      .canopi-selection-toolbar {
        position: absolute;
        z-index: 999999;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 6px;
        display: flex;
        gap: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        opacity: 0;
        transform: translateY(-10px);
        animation: canopi-toolbar-appear 0.2s ease forwards;
      }
      
      @keyframes canopi-toolbar-appear {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .canopi-toolbar-btn {
        padding: 6px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #f8f9fa;
        color: #333;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        transition: all 0.2s ease;
      }
      
      .canopi-toolbar-btn:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      
      .canopi-annotate-btn:hover {
        background: #e3f2fd;
        border-color: #2196f3;
        color: #1976d2;
      }
      
      .canopi-highlight-btn:hover {
        background: #fff3e0;
        border-color: #ff9800;
        color: #f57c00;
      }
      
      .canopi-discuss-btn:hover {
        background: #e8f5e8;
        border-color: #4caf50;
        color: #388e3c;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  // Cleanup method
  destroy(): void {
    this.hideToolbar();
    
    document.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    document.removeEventListener('selectionchange', this.handleSelectionChange.bind(this));
    document.removeEventListener('mousedown', this.hideToolbar.bind(this));
    document.removeEventListener('scroll', this.hideToolbar.bind(this));
    window.removeEventListener('resize', this.hideToolbar.bind(this));
    
    const styles = document.getElementById('canopi-selection-overlay-styles');
    if (styles) {
      styles.remove();
    }
  }
}