# Canopi Visualization Smart Tag System

> **Legacy: not loaded by Canopi.** This package is from an earlier SDK design. The Canopi extension today loads modules through the module manifest v2 (`@canopi-sdk/manifest`) and the sandboxed `canopi.tab` bridge (`@canopi-sdk/tab-bridge`); see [`modules/`](../../modules/) and the [repo README](../../README.md#legacy-packages). The code is kept for reference and still builds and type-checks in CI.

A comprehensive smart tag system for text visualization, annotation, and styling that aligns with the canopi smart tag architecture.

## Anchor composer shipping (Canopi extension)

Which composer-tier tags are **interactive** in the in-page anchor widget is defined in code (`SHIPPED_ANCHOR_COMPOSER_TAG_IDS` in [`src/registry.ts`](./src/registry.ts)). Policy and extension sync notes: **[docs/ANCHOR_COMPOSER_SHIPPING.md](./docs/ANCHOR_COMPOSER_SHIPPING.md)**.

---

## Overview

The Visualization Smart Tag System enables users to:
- Select text on any webpage
- Apply visual styling and highlighting
- Add contextual annotations and notes
- Store and sync annotations across providers
- Integrate seamlessly with the canopi ecosystem

## Architecture

### Core Components

1. **VisualizationSmartTag** - Main component handling text selection and visualization
2. **SelectionOverlay** - Captures and manages text selection events
3. **ContentAnchorManager** - Manages content anchors following canopi spec
4. **CanopiSmartTagAdapter** - Integration layer with canopi system
5. **Annotation Providers** - Pluggable storage backends (local, Hypothesis, etc.)

### Key Features

- **Context-Anchored Annotations**: Following canopi ContentAnchor specification
- **Multiple Providers**: Local storage, Hypothesis API, and extensible provider system
- **Dynamic Styling**: Pre-built styles and custom style editor
- **Rich Annotations**: Add notes, tags, categories, and metadata
- **Persistent Storage**: Annotations survive page reloads and browser sessions
- **Event-Driven Architecture**: Emits canopi-compatible events for integration

## Usage

### Basic Integration

```html
<!-- Include the smart tag system -->
<script src="visualization-smart-tag.js"></script>
<script src="canopi-integration.js"></script>

<script>
// Initialize the system
const canopiAdapter = new CanopiSmartTagAdapter({
    providers: ['local', 'hypothesis'],
    syncEnabled: true,
    autoSave: true
});
</script>
```

### Text Selection and Visualization

1. **Select Text**: Users select any text on the page
2. **Choose Style**: A toolbar appears with styling options:
   - Yellow Highlight
   - Blue Highlight  
   - Red Underline
   - Info Box
   - Warning Callout
   - Custom Style (opens style editor)
3. **Add Information**: Optional notes, tags, and categorization
4. **Apply**: The visualization is applied and stored

### Keyboard Shortcuts

- `Ctrl+H`: Toggle smart tag system on/off
- `Ctrl+Shift+C`: Clear all visualizations
- `Ctrl+Click` on paragraph: Auto-select and show options

## API Reference

### VisualizationSmartTag

```javascript
const smartTag = new VisualizationSmartTag({
    enableSelection: true,
    enableVisualization: true,
    enableStyleEditor: true,
    providers: ['local']
});
```

#### Options
- `enableSelection` (boolean): Enable text selection capture
- `enableVisualization` (boolean): Enable visualization features  
- `enableStyleEditor` (boolean): Enable custom style editor
- `providers` (array): List of enabled annotation providers

#### Methods
- `handleTextSelection(selection)`: Process a text selection
- `applyVisualization(anchor, presetKey)`: Apply a style preset
- `showStyleEditor(anchor)`: Open custom style editor
- `showInfoEditor(anchor)`: Open annotation editor

### ContentAnchorManager

```javascript
const anchorManager = new ContentAnchorManager({
    onAnchorCreated: (anchor) => console.log('Created:', anchor),
    onAnchorUpdated: (anchor) => console.log('Updated:', anchor),
    onAnchorDeleted: (anchorId) => console.log('Deleted:', anchorId),
    fullSentenceExpansion: true
});
```

#### Anchor Structure
```javascript
{
    id: "anchor-1234567890-abc123def",
    type: "text",
    pageUrl: "https://example.com/page",
    pageTitle: "Page Title",
    textFragment: "Selected text content",
    startOffset: 42,
    endOffset: 67,
    containerPath: "body > div.content > p",
    contentHash: "1234567890",
    timestamp: 1640995200000,
    textAnchorContext: {
        before: "Context before selection",
        after: "Context after selection",
        containerTag: "p",
        containerClasses: "content-paragraph"
    },
    expandedText: "Full sentence containing the selection.",
    metadata: {}
}
```

### CanopiSmartTagAdapter

```javascript
const adapter = new CanopiSmartTagAdapter({
    providers: ['local', 'hypothesis'],
    syncEnabled: true,
    autoSave: true
});
```

#### Methods
- `getVisualizationSmartTag()`: Get the VisualizationSmartTag instance
- `getContentAnchorManager()`: Get the ContentAnchorManager instance
- `addProvider(id, provider)`: Add a new annotation provider
- `removeProvider(id)`: Remove an annotation provider

## Style Presets

### Built-in Presets

1. **highlight-yellow**: Yellow background highlight
2. **highlight-blue**: Blue background with white text
3. **underline-red**: Red bottom border underline
4. **box-info**: Info box with blue border and background
5. **callout-warning**: Warning callout with orange styling

### Custom Styles

The style editor allows users to customize:
- Background color
- Text color
- Border properties
- Padding
- Border radius

Custom styles are automatically saved as new presets.

## Annotation System

### Additional Information

Users can add rich metadata to any visualization:

- **Notes**: Free-form text annotations
- **Tags**: Comma-separated tags for categorization
- **Category**: Predefined categories (definition, example, important, question, reference, todo, other)

### Info Indicators

Visualizations with additional information display a small info icon (ℹ️) that shows a tooltip on hover/click.

## Provider System

### Local Provider

Default provider using localStorage:
- Stores annotations locally in browser
- No authentication required
- Data persists across sessions
- Key: `canopi-local-annotations`

### Hypothesis Provider

Integration with Hypothesis annotation service:
- Requires API token authentication
- Syncs with Hypothesis.is platform
- Supports public and private annotations
- Bidirectional sync capability

### Custom Providers

Implement the provider interface:

```javascript
class CustomProvider {
    isEnabled() { return true; }
    createAnchor(anchor) { /* implementation */ }
    updateAnchor(anchor) { /* implementation */ }
    deleteAnchor(anchorId) { /* implementation */ }
    hasAnchor(anchorId) { /* implementation */ }
    getAnchorsForUrl(url) { /* implementation */ }
    saveVisualization(visualization) { /* implementation */ }
    supportsBidirectionalSync() { return false; }
    sync() { /* optional */ }
}
```

## Events

### Emitted Events

The system emits canopi-compatible events:

- `CANOPI_SELECTION_CHANGED`: Text selection changed
- `CANOPI_ANCHOR_CREATED`: New anchor created
- `CANOPI_ANCHOR_UPDATED`: Anchor updated
- `CANOPI_ANCHOR_DELETED`: Anchor deleted
- `CANOPI_VISUALIZATION_EVENT`: Visualization created/updated/deleted
- `CANOPI_STATE_UPDATE`: Global state update

### Event Structure

```javascript
{
    detail: {
        type: 'created', // or 'updated', 'deleted'
        visualization: {
            id: "viz-1234567890-abc123def",
            anchorId: "anchor-1234567890-abc123def",
            presetKey: "highlight-yellow",
            styles: { backgroundColor: "#ffeb3b", ... },
            additionalInfo: {
                notes: "User notes",
                tags: ["important", "definition"],
                category: "definition"
            },
            timestamp: 1640995200000
        },
        timestamp: 1640995200000
    }
}
```

## Integration with Canopi

### Tab SDK Integration

The smart tag system is designed to integrate with the canopi Tab SDK:

```javascript
// Tab SDK will receive context from smart tags
TabSDK.onPageContext((context) => {
    // Context includes anchors and visualizations
    console.log('Page context:', context.anchors, context.visualizations);
});
```

### Wayback Integration

Smart tags support the wayback selection-history system:
- Anchors use the same ContentAnchor schema
- Selection history can reference smart tag anchors
- Shared primitive for text fragment identification

## Storage Format

### Local Storage Structure

```javascript
{
    "anchors": [
        {
            "id": "anchor-123",
            "type": "text",
            "pageUrl": "https://example.com",
            // ... anchor properties
        }
    ],
    "visualizations": [
        {
            "id": "viz-456", 
            "anchorId": "anchor-123",
            "presetKey": "highlight-yellow",
            // ... visualization properties
        }
    ]
}
```

## Performance Considerations

- **Lazy Loading**: Visualizations are restored on-demand
- **Event Throttling**: Selection events are throttled to prevent spam
- **Memory Management**: Old anchors are cleaned up periodically
- **Storage Limits**: Local storage usage is monitored and managed

## Browser Compatibility

- **Modern Browsers**: Chrome 70+, Firefox 65+, Safari 12+, Edge 79+
- **Selection API**: Uses standard Selection and Range APIs
- **Storage**: localStorage with fallback graceful degradation
- **Events**: CustomEvent with polyfill support

## Security Considerations

- **XSS Protection**: All user input is sanitized
- **Content Security Policy**: Compatible with strict CSP
- **Privacy**: Local provider keeps data local by default
- **Authentication**: Secure token handling for external providers

## Troubleshooting

### Common Issues

1. **Selections Not Working**: Check if text selection is disabled by CSS
2. **Styles Not Applying**: Verify CSS specificity and conflicts
3. **Storage Issues**: Check localStorage availability and quota
4. **Provider Sync Fails**: Verify API tokens and network connectivity

### Debug Mode

Enable debug logging:

```javascript
localStorage.setItem('canopi-smart-tags-debug', 'true');
```

### Performance Monitoring

Monitor performance metrics:

```javascript
document.addEventListener('CANOPI_VISUALIZATION_EVENT', (event) => {
    console.log('Performance:', event.detail.performance);
});
```

## Future Enhancements

- **Collaborative Annotations**: Real-time collaborative editing
- **AI-Powered Suggestions**: Smart categorization and tagging
- **Advanced Visualizations**: Charts, diagrams, and rich media
- **Mobile Support**: Touch-optimized selection and editing
- **Offline Sync**: Conflict resolution and offline capabilities

## License

Apache-2.0, see the repository [LICENSE](../../LICENSE).