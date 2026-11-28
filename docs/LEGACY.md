# Earlier SDK design (not loaded by Canopi)

This page keeps the notes on the first SDK design. Module builders can skip it: Canopi loads modules through the manifest and the `canopi.tab` bridge described in the [README](../README.md).

## The packages

| Package | What |
|---|---|
| `@canopi-sdk/shared` | Timing and state utilities, used by the legacy `sidebar-sdk`. |
| `@canopi-sdk/smart-tags` | Smart-tag registry, `SmartTagManager`, annotation providers. |
| `@canopi-sdk/sidebar-sdk` | Page context, tab coordination, canonical URL helpers. Call `initializeSidebarSDK()` to start it; nothing runs at import. |
| `@canopi-sdk/overlays` | Selection overlay. |

`@canopi-sdk/smart-tags`, `@canopi-sdk/sidebar-sdk` and `@canopi-sdk/overlays` are an **earlier SDK design that Canopi does not load**. The extension does not import them; it loads modules through the manifest and the `canopi.tab` bridge. (The host keeps a hand-maintained copy of the shipped anchor-composer tag ids from `smart-tags/src/registry.ts`.) They are kept for reference and still build and type-check in CI. Do not build new modules on them.

The examples that used them are in [`examples/legacy/`](../examples/legacy/). They import bare package names with no bundler, so they do not run as-is.

## Design notes

Phase A host integration is in [`SIDEBAR_TABS_PHASE_A.md`](./SIDEBAR_TABS_PHASE_A.md).



### 📦 Packages Overview

#### Smart Tags (`packages/smart-tags/`)
**Bike Rack Implementation** - Context-anchored annotations system:
- Unified notes smart tag with pluggable annotation providers
- Hypothesis integration (REST API, OAuth)
- Local provider for Canopi-only annotations
- Context anchors tied to web targets (URI + selectors)
- Provider sync and authentication management

#### Sidebar SDK (`packages/sidebar-sdk/`)
**Tab SDK Foundation** – workspace package with Vite build (`npm run build -w @canopi-sdk/sidebar-sdk`):
- Tab lifecycle and Chrome `runtime.onMessage` (`TAB_CHANGED` / `TAB_UPDATED`) with DOM fallbacks
- Page context manager and `page-context-changed` events
- Canonical URL normalization (proxy/query stripping)
- See [`docs/SIDEBAR_TABS_PHASE_A.md`](./SIDEBAR_TABS_PHASE_A.md) for host integration and Phase A scope

#### Overlays (`packages/overlays/`)
**Selection Overlay System** - User interaction layer:
- SelectionOverlay for text/media selection capture
- Non-invasive overlay above host content (no DOM injection)
- Selection → anchor → sidebar workflow
- Content script messaging system
- Cross-domain selection handling

#### Content Anchoring (`packages/content-anchoring/`, planned, never created)
**Core Anchoring Primitives** - Foundation for all smart tags:
- Enhanced Anchor data model (selector, text, pageUrl, offsets)
- ContentAnchorManager with full-sentence expansion
- CanonicalUrlService for proxy URL handling
- Anchor storage and retrieval system
- Cross-tab anchor synchronization

#### Shared (`packages/shared/`)
**Common Infrastructure** - Shared utilities:
- TypeScript types and interfaces
- Event system and messaging
- Storage abstractions
- Authentication helpers
- Provider interface definitions

### 🎯 Architecture Principles

#### Separation from Core Canopi
- **Core Canopi**: Backend services, data management, tab system core
- **SDK Applications**: Client-side UI, browser integration, user interactions
- **Clean Interface**: Event-driven communication, no tight coupling

#### Non-Invasive Design
- **No DOM Injection**: Only small loader in `<head>`, overlay always above content
- **Two Entry Paths**: (1) SDK-installed page, (2) proxy-served page (user opt-in)
- **Overlay Layer**: All UI components rendered above host content

#### Provider Architecture
- **Pluggable Backends**: Local (default) + remote providers (Hypothesis first)
- **Common Interface**: Standardized provider API for sync and storage
- **Authentication**: OAuth/API token support with group/private visibility

### 🚀 Implementation Phases

Based on the canopi bike rack implementation plan:

#### Phase 0: Foundation ✅
- [x] Canonical URL service for proxy/direct URL normalization
- [x] Enhanced anchor data model with text, pageUrl, offsets
- [x] Provider interface definitions

#### Phase 1: Tab System Integration 🚧
- [ ] Extend TabLoadContext and TabId for anchored tabs
- [ ] Add `acceptsPageContext` to TabConfig
- [ ] Register anchored-tab in DEFAULT_STATE and TabRegistry
- [ ] Create AnchoredTabPlugin as reference implementation

#### Phase 2: Selection System 📋
- [ ] SelectionOverlay with content script messaging
- [ ] Selection → anchor → sidebar workflow
- [ ] CANOPI_SELECTION_CHANGED event system
- [ ] Cross-domain selection handling

#### Phase 3: Management Interface 📋
- [ ] Manage tab anchoring settings
- [ ] Per-domain enable/disable controls
- [ ] Proxy settings and preferences
- [ ] Provider authentication management

### 🔗 Integration Points

#### With Core Canopi
- **Tab System**: Extends existing TabManager, TabRegistry, TabConfiguration
- **Event System**: Uses existing CustomEvent messaging
- **Storage**: Integrates with existing backend/storage systems
- **Authentication**: Leverages existing auth infrastructure

#### Sidebar SDK Contract
```typescript
interface TabConfig {
  acceptsPageContext?: boolean; // Receives page-context-changed events
}

// Events
interface PageContextChangedEvent {
  canonicalUrl: string;
  pageId: string;
}
```

#### Provider Interface
```typescript
interface AnnotationProvider {
  id: string;
  isEnabled(): boolean;
  createAnnotation(anchor: Anchor): Promise<void>;
  getAnnotations(pageUrl: string): Promise<Annotation[]>;
  sync?(): Promise<void>;
}
```

### 📚 Key Files and Structure

Trees below reflect the **current** layout; some packages are still stubs or partially wired (see [SDK_IMPLEMENTATION_MASTER.md](./SDK_IMPLEMENTATION_MASTER.md) §2).

#### Smart Tags Package
```
packages/smart-tags/
├── src/
│   ├── providers/
│   │   ├── LocalProvider.ts
│   │   └── HypothesisProvider.ts
│   ├── SmartTagManager.ts
│   ├── registry.ts
│   ├── index.ts
│   └── *.js (legacy integration helpers)
├── types/
│   └── annotations.ts
└── README.md
```

#### Sidebar SDK Package
```
packages/sidebar-sdk/
└── src/
    ├── index.ts
    ├── SDKInitializer.ts
    ├── PageContextManager.ts
    ├── TabController.ts
    └── CanonicalUrlService.ts
```

#### Overlays Package
```
packages/overlays/
└── src/
    └── SelectionOverlay.ts
```
