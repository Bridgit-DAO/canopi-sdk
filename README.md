# Canopi SDK

Build modules for [Canopi](https://canopi.live): smart tags and tablications (sidebar tabs) described by one manifest, and loaded by the Canopi extension. Repository: [github.com/Bridgit-DAO/canopi-sdk](https://github.com/Bridgit-DAO/canopi-sdk).

**New here? Follow [`docs/FIRST_MODULE.md`](./docs/FIRST_MODULE.md):** build, preview and submit your first tablication. It needs only this repository.

## What Canopi loads today

Canopi loads **modules**: a folder with a `manifest.json` (module manifest v2) and, for a tablication, the files of a small web app.

- **Smart tag**: declarative, manifest only (payload schema, label, presentation). Example: [`modules/page-note-tag/`](./modules/page-note-tag/).
- **Tablication**: a sidebar tab that runs in a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin, no Canopi cookies, storage or DOM). It talks to Canopi only through the `canopi.tab` bridge client, [`@canopi-sdk/tab-bridge`](./packages/tab-bridge/), which the build copies in as `tab-bridge.js`. Every bridge call is checked against the permissions in the manifest. Example: [`modules/page-notes/`](./modules/page-notes/).

Build a module into a submission for `POST /v1/sdk/modules/versions`:

```bash
npm ci && npm run build
node scripts/build-module.mjs modules/page-notes   # -> modules/page-notes/dist/submission.json
```

Bridge limits worth knowing (the Canopi host enforces them): `storage.set` keys are 1-100 characters, module storage is 100 KB in total, a bridge message is at most 64 KB, and a frame may make 50 calls per second.

## Packages (0.2.0, 2026-10-05)

| Package | Status | What |
|---|---|---|
| `@canopi-sdk/manifest` | **Current** | **Module manifest v2**: one JSON Schema for smart tags, tablications and (reserved) overlay apps. It covers presentations, surfaces, triggers, permissions and network hosts, and ships with TypeScript types, a validator and a plain-text summary renderer. Canopi vendors this validator. |
| `@canopi-sdk/tab-bridge` | **Current** | Client for the `canopi.tab` bridge v1: what a sandboxed tablication imports to talk to Canopi. |
| `@canopi-sdk/studio-kit` | **Current** | **Canopi Studio** contract: StudioProject schema + validator, component catalogue, escaped sidebar renderers, mock/live data sources, mock `CanopiTab`, and a scaffold generator that emits ManifestV2 module dirs. Vendorable build in `dist/vendor`. |
| `@canopi-sdk/shared` | Support | Timing and state utilities, used by the legacy `sidebar-sdk`. |
| `@canopi-sdk/smart-tags` | Legacy | Smart-tag registry, `SmartTagManager`, annotation providers. |
| `@canopi-sdk/sidebar-sdk` | Legacy | Page context, tab coordination, canonical URL helpers. Call `initializeSidebarSDK()` to start it; nothing runs at import. |
| `@canopi-sdk/overlays` | Legacy | Selection overlay. |

To run Canopi Studio locally with `studio-kit`, use the [`canopi-studio`](./.claude/skills/canopi-studio/) skill.

Every package builds to ES modules plus type declarations in `dist/`, with an `exports` field, and has **no side effects at import**: no globals, listeners or timers. All packages are licensed Apache-2.0 and stay `private` (not published to npm).

```bash
npm ci            # Node 22, npm 10.9.9 (what CI and the servers run)
npm run build     # shared first, then every package
npm run type-check
npm run lint
npm test          # vitest, happy-dom (packages/*/src, tests/ and skill scripts)
```

CI (`.github/workflows/ci.yml`) runs all of these on every PR, plus a gitleaks scan of the new commits and `npm audit` (high and above).

## Legacy packages

`@canopi-sdk/smart-tags`, `@canopi-sdk/sidebar-sdk` and `@canopi-sdk/overlays` are an **earlier SDK design that Canopi does not load**. The extension does not import them; it loads modules through the manifest and the `canopi.tab` bridge above. (The host keeps a hand-maintained copy of the shipped anchor-composer tag ids from `smart-tags/src/registry.ts`.) They are kept for reference and still build and type-check in CI. Do not build new modules on them.

The examples that used them are in [`examples/legacy/`](./examples/legacy/). They import bare package names with no bundler, so they do not run as-is.

## Documentation

**Building a module:** [`docs/FIRST_MODULE.md`](./docs/FIRST_MODULE.md).

**SDK design (maintainers):** [`docs/SDK_IMPLEMENTATION_MASTER.md`](./docs/SDK_IMPLEMENTATION_MASTER.md) – architecture, context anchoring, patches and progressive layers, resolved decisions, open questions, and security prerequisites (§11).

### In this repository

| Document | Description |
|----------|--------------|
| [`docs/SDK_IMPLEMENTATION_MASTER.md`](./docs/SDK_IMPLEMENTATION_MASTER.md) | Implementation guide for sidebar / smart-tag / overlay SDKs; merges planning decisions; patches vs surfaces (consolidated plan §11.2); §11 security (analysis before ship, agents, breach monitoring); open questions. |
| [`docs/SIDEBAR_TABS_PHASE_A.md`](./docs/SIDEBAR_TABS_PHASE_A.md) | **Phase A (legacy design):** sidebar tabs only – host inventory (`presence`), SDK tasks, exit criteria, branch/worktree `sdk/sidebar-tabs`. |

### Canonical specs (`canopi` host repo)

For Canopi maintainers only; module builders don't need the `canopi` repository. Detailed manifests, JSON Schema, API specs, and planning docs still live in the main **`canopi`** repository until migrated. Paths below are relative to the root of **`canopi`** (often `../canopi/` next to this clone).

| Topic | Path |
|-------|------|
| Consolidated extension SDK plan (sidebar, tag, overlay; canvas §10–§11; patches) | `docs/planning/CANOPI_EXTENSION_SDK_CONSOLIDATED_PLAN.md` |
| Smart tag implementation plan (phases, DB, API, Phase 0 gates) | `docs/planning/SMART_TAG_SDK_IMPLEMENTATION_PLAN.md` |
| Context anchor plan (bridge, gating, proximity) | `docs/planning/CONTEXT_ANCHOR_PLAN.md` |
| Sidebar Tab SDK index (manifest schema, API, quick start, examples) | `docs/SIDEBAR_TAB_SDK_INDEX.md` |
| Tab behavior and URL timing for modules | `docs/TAB_BUILDER_GUIDE.md` |
| Sidebar tab SDK status | `docs/SIDEBAR_TAB_SDK_STATUS.md` |
| Unified store architecture | `docs/CANOPI_STORE_UNIFIED_ARCHITECTURE.md` |

Example (sibling clones): `../canopi/docs/planning/CANOPI_EXTENSION_SDK_CONSOLIDATED_PLAN.md`.

## Repository structure

```
canopi-sdk/
├── modules/                  # Reference modules Canopi loads (manifest v2)
│   ├── page-note-tag/        #   declarative smart tag
│   └── page-notes/           #   tablication (sandboxed sidebar tab)
├── packages/
│   ├── manifest/             # Module manifest v2: schema, types, validator (current)
│   ├── tab-bridge/           # canopi.tab bridge client (current)
│   ├── studio-kit/           # Canopi Studio contract and scaffold generator (current)
│   ├── shared/               # Shared utilities (used by sidebar-sdk)
│   ├── smart-tags/           # Legacy
│   ├── sidebar-sdk/          # Legacy
│   └── overlays/             # Legacy
├── examples/legacy/          # Examples for the legacy packages (do not run as-is)
├── scripts/                  # build-module.mjs and helper scripts
├── tests/                    # Tests for modules/ (vitest)
├── studio/                   # Canopi Studio local app (canopi-studio skill)
├── .claude/skills/           # canopi-studio skill
└── docs/                     # Design docs (much of it describes the legacy design)
```

## Legacy design notes

> The rest of this section describes the earlier design behind the legacy packages. It is kept for reference and is not how Canopi loads modules today.

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
- See [`docs/SIDEBAR_TABS_PHASE_A.md`](./docs/SIDEBAR_TABS_PHASE_A.md) for host integration and Phase A scope

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

Trees below reflect the **current** layout; some packages are still stubs or partially wired (see [SDK_IMPLEMENTATION_MASTER.md](./docs/SDK_IMPLEMENTATION_MASTER.md) §2).

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

## Contributing

Changes to the manifest schema or the `canopi.tab` bridge need a matching change in the Canopi host, so open an issue to discuss them first. New modules go in `modules/` and must pass `validateManifest` (the `reference modules` test checks every manifest there).

## License

Licensed under the [Apache License, Version 2.0](./LICENSE). Copyright 2026 Bridgit DAO.
