/**
 * VisualizationSmartTag - A smart tag for text visualization and styling
 * Aligned with canopi smart tag system architecture
 */

class VisualizationSmartTag {
    constructor(options = {}) {
        this.options = {
            enableSelection: true,
            enableVisualization: true,
            enableStyleEditor: true,
            providers: ['local'], // Default to local provider, can add 'hypothesis' etc.
            ...options
        };
        
        this.anchors = new Map(); // Store content anchors
        this.visualizations = new Map(); // Store active visualizations
        this.stylePresets = new Map(); // Store style presets
        this.selectionOverlay = null;
        
        this.init();
    }
    
    init() {
        this.initializeStylePresets();
        this.initializeSelectionOverlay();
        this.initializeEventListeners();
        this.loadExistingAnchors();
    }
    
    initializeStylePresets() {
        // Default style presets for visualizations
        this.stylePresets.set('highlight-yellow', {
            name: 'Yellow Highlight',
            styles: {
                backgroundColor: '#ffeb3b',
                padding: '2px 4px',
                borderRadius: '3px',
                boxShadow: '0 1px 3px rgba(255, 235, 59, 0.3)'
            }
        });
        
        this.stylePresets.set('highlight-blue', {
            name: 'Blue Highlight',
            styles: {
                backgroundColor: '#2196f3',
                color: '#ffffff',
                padding: '2px 4px',
                borderRadius: '3px',
                boxShadow: '0 1px 3px rgba(33, 150, 243, 0.3)'
            }
        });
        
        this.stylePresets.set('underline-red', {
            name: 'Red Underline',
            styles: {
                borderBottom: '2px solid #f44336',
                paddingBottom: '1px'
            }
        });
        
        this.stylePresets.set('box-info', {
            name: 'Info Box',
            styles: {
                backgroundColor: '#e3f2fd',
                border: '1px solid #2196f3',
                padding: '8px 12px',
                borderRadius: '6px',
                margin: '4px 0',
                boxShadow: '0 2px 4px rgba(33, 150, 243, 0.1)'
            }
        });
        
        this.stylePresets.set('callout-warning', {
            name: 'Warning Callout',
            styles: {
                backgroundColor: '#fff3e0',
                border: '1px solid #ff9800',
                borderLeft: '4px solid #ff9800',
                padding: '12px 16px',
                borderRadius: '4px',
                margin: '8px 0',
                boxShadow: '0 2px 4px rgba(255, 152, 0, 0.1)'
            }
        });
    }
    
    initializeSelectionOverlay() {
        if (!this.options.enableSelection) return;
        
        this.selectionOverlay = new SelectionOverlay({
            onSelectionMade: (selection) => this.handleTextSelection(selection),
            onSelectionChanged: (selection) => this.handleSelectionChange(selection)
        });
    }
    
    initializeEventListeners() {
        // Listen for custom canopi events
        document.addEventListener('CANOPI_SELECTION_CHANGED', (event) => {
            this.handleCanopliSelectionChanged(event.detail);
        });
        
        // Listen for anchor updates
        document.addEventListener('CANOPI_ANCHOR_UPDATED', (event) => {
            this.handleAnchorUpdated(event.detail);
        });
    }
    
    handleTextSelection(selection) {
        if (!selection || selection.toString().trim().length === 0) return;
        
        // Create content anchor following canopi architecture
        const anchor = this.createContentAnchor(selection);
        
        // Show visualization options
        this.showVisualizationOptions(anchor, selection);
    }
    
    createContentAnchor(selection) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        // Create anchor following canopi ContentAnchor spec
        const anchor = {
            id: this.generateAnchorId(),
            type: 'text',
            pageUrl: window.location.href,
            textFragment: selection.toString(),
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            containerPath: this.getElementPath(container),
            contentHash: this.generateContentHash(selection.toString()),
            timestamp: Date.now(),
            provider: 'local' // Default provider
        };
        
        this.anchors.set(anchor.id, anchor);
        return anchor;
    }
    
    showVisualizationOptions(anchor, selection) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        
        // Create floating toolbar
        const toolbar = this.createVisualizationToolbar(anchor, {
            x: rect.left + (rect.width / 2),
            y: rect.top - 10
        });
        
        document.body.appendChild(toolbar);
        
        // Auto-hide after delay or on click outside
        setTimeout(() => {
            if (toolbar.parentNode) {
                this.hideToolbar(toolbar);
            }
        }, 10000);
    }
    
    createVisualizationToolbar(anchor, position) {
        const toolbar = document.createElement('div');
        toolbar.className = 'visualization-smart-tag-toolbar';
        toolbar.style.cssText = `
            position: fixed;
            left: ${position.x}px;
            top: ${position.y}px;
            transform: translateX(-50%) translateY(-100%);
            background: #ffffff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 8px;
            display: flex;
            gap: 4px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
        `;
        
        // Add style preset buttons
        this.stylePresets.forEach((preset, key) => {
            const button = document.createElement('button');
            button.textContent = preset.name;
            button.style.cssText = `
                padding: 6px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: #f8f9fa;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            `;
            
            button.addEventListener('click', () => {
                this.applyVisualization(anchor, key);
                this.hideToolbar(toolbar);
            });
            
            button.addEventListener('mouseenter', () => {
                button.style.background = '#e9ecef';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.background = '#f8f9fa';
            });
            
            toolbar.appendChild(button);
        });
        
        // Add custom style button
        const customButton = document.createElement('button');
        customButton.textContent = '✏️ Custom';
        customButton.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #007bff;
            border-radius: 4px;
            background: #007bff;
            color: white;
            cursor: pointer;
            font-size: 12px;
        `;
        
        customButton.addEventListener('click', () => {
            this.showStyleEditor(anchor);
            this.hideToolbar(toolbar);
        });
        
        toolbar.appendChild(customButton);
        
        // Add info button
        const infoButton = document.createElement('button');
        infoButton.textContent = '+ Info';
        infoButton.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #28a745;
            border-radius: 4px;
            background: #28a745;
            color: white;
            cursor: pointer;
            font-size: 12px;
        `;
        
        infoButton.addEventListener('click', () => {
            this.showInfoEditor(anchor);
            this.hideToolbar(toolbar);
        });
        
        toolbar.appendChild(infoButton);
        
        return toolbar;
    }
    
    applyVisualization(anchor, presetKey) {
        const preset = this.stylePresets.get(presetKey);
        if (!preset) return;
        
        // Find and wrap the text with visualization
        const element = this.findElementByAnchor(anchor);
        if (!element) return;
        
        const visualization = {
            id: this.generateVisualizationId(),
            anchorId: anchor.id,
            presetKey: presetKey,
            styles: { ...preset.styles },
            additionalInfo: null,
            timestamp: Date.now()
        };
        
        // Create wrapper element
        const wrapper = document.createElement('span');
        wrapper.className = 'visualization-smart-tag-wrapper';
        wrapper.setAttribute('data-visualization-id', visualization.id);
        wrapper.setAttribute('data-anchor-id', anchor.id);
        
        // Apply styles
        Object.assign(wrapper.style, visualization.styles);
        
        // Wrap the selected text
        this.wrapTextWithElement(anchor, wrapper);
        
        // Add click handler for editing
        wrapper.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.editVisualization(visualization.id);
        });
        
        // Store visualization
        this.visualizations.set(visualization.id, visualization);
        
        // Emit canopi event
        this.emitVisualizationEvent('created', visualization);
        
        // Save to storage
        this.saveVisualization(visualization);
    }
    
    showStyleEditor(anchor) {
        const modal = this.createStyleEditorModal(anchor);
        document.body.appendChild(modal);
    }
    
    createStyleEditorModal(anchor) {
        const modal = document.createElement('div');
        modal.className = 'visualization-style-editor-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        const editor = document.createElement('div');
        editor.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;
        
        editor.innerHTML = `
            <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Custom Style Editor</h3>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Background Color:</label>
                <input type="color" id="bg-color" style="width: 100%; height: 40px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Text Color:</label>
                <input type="color" id="text-color" style="width: 100%; height: 40px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Border:</label>
                <input type="text" id="border" placeholder="e.g., 1px solid #000" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Padding:</label>
                <input type="text" id="padding" placeholder="e.g., 4px 8px" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Border Radius:</label>
                <input type="text" id="border-radius" placeholder="e.g., 4px" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 24px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Preview:</label>
                <div id="preview" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa;">
                    ${anchor.textFragment}
                </div>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; cursor: pointer;">Cancel</button>
                <button id="apply-btn" style="padding: 8px 16px; border: 1px solid #007bff; border-radius: 4px; background: #007bff; color: white; cursor: pointer;">Apply</button>
            </div>
        `;
        
        modal.appendChild(editor);
        
        // Add event listeners for live preview
        const inputs = editor.querySelectorAll('input');
        const preview = editor.querySelector('#preview');
        
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                this.updateStylePreview(editor, preview);
            });
        });
        
        // Cancel button
        editor.querySelector('#cancel-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Apply button
        editor.querySelector('#apply-btn').addEventListener('click', () => {
            const customStyles = this.getCustomStyles(editor);
            this.applyCustomVisualization(anchor, customStyles);
            document.body.removeChild(modal);
        });
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        return modal;
    }
    
    updateStylePreview(editor, preview) {
        const bgColor = editor.querySelector('#bg-color').value;
        const textColor = editor.querySelector('#text-color').value;
        const border = editor.querySelector('#border').value;
        const padding = editor.querySelector('#padding').value;
        const borderRadius = editor.querySelector('#border-radius').value;
        
        preview.style.backgroundColor = bgColor;
        preview.style.color = textColor;
        preview.style.border = border;
        preview.style.padding = padding;
        preview.style.borderRadius = borderRadius;
    }
    
    getCustomStyles(editor) {
        return {
            backgroundColor: editor.querySelector('#bg-color').value,
            color: editor.querySelector('#text-color').value,
            border: editor.querySelector('#border').value,
            padding: editor.querySelector('#padding').value,
            borderRadius: editor.querySelector('#border-radius').value
        };
    }
    
    applyCustomVisualization(anchor, customStyles) {
        // Create custom preset
        const customPresetKey = `custom-${Date.now()}`;
        this.stylePresets.set(customPresetKey, {
            name: 'Custom Style',
            styles: customStyles
        });
        
        // Apply visualization
        this.applyVisualization(anchor, customPresetKey);
    }
    
    showInfoEditor(anchor) {
        const modal = this.createInfoEditorModal(anchor);
        document.body.appendChild(modal);
    }
    
    createInfoEditorModal(anchor) {
        const modal = document.createElement('div');
        modal.className = 'visualization-info-editor-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        const editor = document.createElement('div');
        editor.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;
        
        editor.innerHTML = `
            <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Add Additional Information</h3>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Selected Text:</label>
                <div style="padding: 8px; background: #f8f9fa; border-radius: 4px; font-style: italic;">
                    "${anchor.textFragment}"
                </div>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Notes:</label>
                <textarea id="notes" placeholder="Add your notes, explanations, or additional context..." 
                    style="width: 100%; height: 120px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: inherit;"></textarea>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Tags:</label>
                <input type="text" id="tags" placeholder="Add tags separated by commas (e.g., important, definition, example)" 
                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500;">Category:</label>
                <select id="category" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <option value="">Select a category</option>
                    <option value="definition">Definition</option>
                    <option value="example">Example</option>
                    <option value="important">Important</option>
                    <option value="question">Question</option>
                    <option value="reference">Reference</option>
                    <option value="todo">To Do</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; cursor: pointer;">Cancel</button>
                <button id="save-btn" style="padding: 8px 16px; border: 1px solid #28a745; border-radius: 4px; background: #28a745; color: white; cursor: pointer;">Save & Apply</button>
            </div>
        `;
        
        modal.appendChild(editor);
        
        // Cancel button
        editor.querySelector('#cancel-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Save button
        editor.querySelector('#save-btn').addEventListener('click', () => {
            const additionalInfo = {
                notes: editor.querySelector('#notes').value,
                tags: editor.querySelector('#tags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
                category: editor.querySelector('#category').value
            };
            
            this.applyVisualizationWithInfo(anchor, additionalInfo);
            document.body.removeChild(modal);
        });
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        return modal;
    }
    
    applyVisualizationWithInfo(anchor, additionalInfo) {
        // Choose appropriate style based on category
        let presetKey = 'highlight-yellow'; // default
        
        if (additionalInfo.category) {
            switch (additionalInfo.category) {
                case 'definition':
                    presetKey = 'box-info';
                    break;
                case 'important':
                    presetKey = 'callout-warning';
                    break;
                case 'question':
                    presetKey = 'underline-red';
                    break;
                default:
                    presetKey = 'highlight-blue';
            }
        }
        
        // Apply visualization with additional info
        const preset = this.stylePresets.get(presetKey);
        const element = this.findElementByAnchor(anchor);
        if (!element || !preset) return;
        
        const visualization = {
            id: this.generateVisualizationId(),
            anchorId: anchor.id,
            presetKey: presetKey,
            styles: { ...preset.styles },
            additionalInfo: additionalInfo,
            timestamp: Date.now()
        };
        
        // Create wrapper with tooltip
        const wrapper = document.createElement('span');
        wrapper.className = 'visualization-smart-tag-wrapper';
        wrapper.setAttribute('data-visualization-id', visualization.id);
        wrapper.setAttribute('data-anchor-id', anchor.id);
        wrapper.setAttribute('title', additionalInfo.notes || 'Click to edit');
        
        // Apply styles
        Object.assign(wrapper.style, visualization.styles);
        
        // Add info indicator if there's additional information
        if (additionalInfo.notes || additionalInfo.tags.length > 0) {
            wrapper.style.position = 'relative';
            
            const indicator = document.createElement('span');
            indicator.textContent = 'ℹ️';
            indicator.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                font-size: 10px;
                background: #007bff;
                color: white;
                border-radius: 50%;
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            `;
            
            indicator.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showInfoTooltip(visualization, e.target);
            });
            
            wrapper.appendChild(indicator);
        }
        
        // Wrap the selected text
        this.wrapTextWithElement(anchor, wrapper);
        
        // Add click handler for editing
        wrapper.addEventListener('click', (e) => {
            if (e.target !== wrapper) return; // Don't trigger if clicking indicator
            e.preventDefault();
            e.stopPropagation();
            this.editVisualization(visualization.id);
        });
        
        // Store visualization
        this.visualizations.set(visualization.id, visualization);
        
        // Emit canopi event
        this.emitVisualizationEvent('created', visualization);
        
        // Save to storage
        this.saveVisualization(visualization);
    }
    
    showInfoTooltip(visualization, targetElement) {
        // Remove existing tooltips
        document.querySelectorAll('.visualization-info-tooltip').forEach(tooltip => {
            tooltip.remove();
        });
        
        const tooltip = document.createElement('div');
        tooltip.className = 'visualization-info-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            background: #333;
            color: white;
            padding: 12px;
            border-radius: 6px;
            font-size: 12px;
            max-width: 300px;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            line-height: 1.4;
        `;
        
        const info = visualization.additionalInfo;
        let content = '';
        
        if (info.notes) {
            content += `<div style="margin-bottom: 8px;"><strong>Notes:</strong><br>${info.notes}</div>`;
        }
        
        if (info.tags && info.tags.length > 0) {
            content += `<div style="margin-bottom: 8px;"><strong>Tags:</strong> ${info.tags.join(', ')}</div>`;
        }
        
        if (info.category) {
            content += `<div><strong>Category:</strong> ${info.category}</div>`;
        }
        
        tooltip.innerHTML = content;
        document.body.appendChild(tooltip);
        
        // Position tooltip
        const rect = targetElement.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;
        
        // Auto-hide after delay
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.remove();
            }
        }, 5000);
        
        // Hide on click outside
        const hideTooltip = (e) => {
            if (!tooltip.contains(e.target) && e.target !== targetElement) {
                tooltip.remove();
                document.removeEventListener('click', hideTooltip);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideTooltip);
        }, 100);
    }
    
    // Utility methods
    generateAnchorId() {
        return `anchor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateVisualizationId() {
        return `viz-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    generateContentHash(text) {
        // Simple hash function for content identification
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
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
    
    findElementByAnchor(anchor) {
        // Implementation would depend on the specific anchor format
        // This is a simplified version
        return document.querySelector(anchor.containerPath) || document.body;
    }
    
    wrapTextWithElement(anchor, wrapper) {
        // This would need more sophisticated text range handling
        // For now, this is a simplified implementation
        const textNodes = this.getTextNodesContaining(anchor.textFragment);
        if (textNodes.length > 0) {
            const range = document.createRange();
            range.selectNode(textNodes[0]);
            range.surroundContents(wrapper);
        }
    }
    
    getTextNodesContaining(text) {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        
        while (node = walker.nextNode()) {
            if (node.textContent.includes(text)) {
                textNodes.push(node);
            }
        }
        
        return textNodes;
    }
    
    hideToolbar(toolbar) {
        if (toolbar && toolbar.parentNode) {
            toolbar.style.opacity = '0';
            toolbar.style.transform = 'translateX(-50%) translateY(-100%) scale(0.9)';
            setTimeout(() => {
                if (toolbar.parentNode) {
                    toolbar.parentNode.removeChild(toolbar);
                }
            }, 200);
        }
    }
    
    editVisualization(visualizationId) {
        const visualization = this.visualizations.get(visualizationId);
        if (!visualization) return;
        
        const anchor = this.anchors.get(visualization.anchorId);
        if (!anchor) return;
        
        // Show edit options
        this.showEditVisualizationModal(visualization, anchor);
    }
    
    showEditVisualizationModal(visualization, anchor) {
        // Implementation for editing existing visualizations
        console.log('Edit visualization:', visualization);
    }
    
    emitVisualizationEvent(eventType, visualization) {
        const event = new CustomEvent('CANOPI_VISUALIZATION_EVENT', {
            detail: {
                type: eventType,
                visualization: visualization,
                timestamp: Date.now()
            }
        });
        document.dispatchEvent(event);
    }
    
    saveVisualization(visualization) {
        // Save to localStorage or send to canopi backend
        const saved = JSON.parse(localStorage.getItem('canopi-visualizations') || '[]');
        saved.push(visualization);
        localStorage.setItem('canopi-visualizations', JSON.stringify(saved));
    }
    
    loadExistingAnchors() {
        // Load existing visualizations from storage
        const saved = JSON.parse(localStorage.getItem('canopi-visualizations') || '[]');
        saved.forEach(viz => {
            this.visualizations.set(viz.id, viz);
            // Restore visual elements if needed
        });
    }
    
    handleCanopliSelectionChanged(detail) {
        // Handle canopi selection change events
        console.log('Canopi selection changed:', detail);
    }
    
    handleAnchorUpdated(detail) {
        // Handle anchor update events
        console.log('Anchor updated:', detail);
    }
    
    handleSelectionChange(selection) {
        // Handle selection change from SelectionOverlay
        console.log('Selection changed:', selection);
    }
}

// SelectionOverlay class for handling text selection
class SelectionOverlay {
    constructor(options = {}) {
        this.options = {
            onSelectionMade: options.onSelectionMade || (() => {}),
            onSelectionChanged: options.onSelectionChanged || (() => {}),
            minSelectionLength: 3
        };
        
        this.init();
    }
    
    init() {
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        document.addEventListener('selectionchange', (e) => this.handleSelectionChange(e));
    }
    
    handleMouseUp(event) {
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length >= this.options.minSelectionLength) {
                this.options.onSelectionMade(selection);
            }
        }, 10);
    }
    
    handleSelectionChange(event) {
        const selection = window.getSelection();
        this.options.onSelectionChanged(selection);
        
        // Emit canopi event
        const canopliEvent = new CustomEvent('CANOPI_SELECTION_CHANGED', {
            detail: {
                selection: selection,
                text: selection.toString(),
                timestamp: Date.now()
            }
        });
        document.dispatchEvent(canopliEvent);
    }
}

// Export for use
window.VisualizationSmartTag = VisualizationSmartTag;
window.SelectionOverlay = SelectionOverlay;