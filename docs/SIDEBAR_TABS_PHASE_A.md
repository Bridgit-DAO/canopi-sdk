# Phase A – Sidebar tabs only (execution guide)

**Branch:** `sdk/sidebar-tabs` (host + SDK).  
**Host worktree (recommended):** a separate clean checkout of the host on `sdk/sidebar-tabs`, so other local branches are not disturbed.  
**Host integration map (this monorepo):** `docs/planning/SIDEBAR_TABS_PHASE_A_HOST.md` – file paths and Phase A checklist for `presence/`. Ship **store-installable sidebar tab modules** with a minimal, stable **`window.canopi`** contract for **`canopi.tab`** plus shared core (bridge, permissions, storage, user, theme, diagnostics) as already specified under **`canopi/docs/SIDEBAR_TAB_SDK_*`**.

**Explicitly out of scope for Phase A:** smart-tag triggers, overlay apps, `pendingContextAnchor` handoffs to third-party modules, `SmartTagManager` / `OverlayAppManager`, and progressive smart-tag layers.

---

## 1. Canonical specs (read first)

| Document | Path in `canopi` repo |
|----------|------------------------|
| Index | `docs/SIDEBAR_TAB_SDK_INDEX.md` |
| Manifest schema | `docs/SIDEBAR_TAB_SDK_MANIFEST_SCHEMA.md` |
| API | `docs/SIDEBAR_TAB_SDK_API.md` |
| Quick start / example | `docs/SIDEBAR_TAB_SDK_QUICK_START.md` |
| Host timing guarantees | `docs/TAB_BUILDER_GUIDE.md` |

---

## 2. Host inventory (`presence` – `sdk/sidebar-tabs` worktree)

Two tab-related systems coexist; Phase A wiring must be clear about **which** registry owns **SDK sidebar tabs**.

### 2.1 Tab Manager display registry (sidepanel UX)

- **`presence/src/features/TabManager/TabRegistry.ts`** – `registerTab`, `registerTabDisplay`, `source: 'builtin' | 'appstore' | 'extension'`. This is the path used for **dynamic tabs** and **display functions** (e.g. Wayback registers `registerTabDisplay('wayback-tab', ...)`).
- **`presence/src/features/TabManager/types.ts`** – `TabConfig`, **`DEFAULT_STATE`** (built-in tab list: discuss, visibility, rooms, people, agent, timelines, wayback, revise, settings, manage).
- **`presence/src/features/TabManager/TabConfiguration.ts`** – merges persisted state with **`tabRegistry.getAllTabs()`** for app-store/extension tabs.

**Implication:** SDK sidebar tabs should align with **`RegisteredTab.source === 'extension'`** (or **`appstore`** once store-backed) and register **`tabContentId`**, **`registerTabDisplay`**, and lifecycle consistent with existing built-in tabs.

### 2.2 Plugin registry (content loading)

- **`presence/src/utils/TabRegistry.ts`** – plugin **`TabPlugin`** registration (`loadContent`, **`ContentType.Custom`**, etc.).
- **`presence/src/utils/plugins/BuiltinPluginRegistry.ts`** – registers built-in **`TabPlugin`** instances (discuss, visibility, settings, manage, rooms, people, agent, timelines, revise).

**Implication:** Either **bridge** SDK tabs through **`TabPlugin`** + **`ContentLoader`**, or **document** that SDK v1 uses **only** the Tab Manager registry + iframe/script entry – but **do not** leave two incompatible registration paths for the same tab id. Pick one integration strategy in the host RFC.

### 2.3 Useful entry points for further discovery

- **`presence/src/utils/ContentLoader.ts`** – uses **`getTabRegistry()`** (plugin registry from `utils`) for loading.
- **`presence/src/utils/IntegratedFlowCoordinator.ts`** – `tabRegistry` from **`features/TabManager/TabRegistry`** for display registration.
- **`presence/src/utils/getActiveSidepanelTab.ts`** – active tab id for gating (smart tags use related patterns later; do not block Phase A on this).

---

## 3. SDK repo tasks (`canopi-sdk`)

1. **`packages/sidebar-sdk`** – real **`package.json`**, build (ESM + types), align exports with planned **`canopi.tab`** surface.
2. **Types / manifest helpers** – tab manifest TypeScript types or JSON Schema validation (mirror **`canopi/docs/schemas/canopi-tab-manifest-v1.schema.json`** when repatriated).
3. **Example** – minimal “Archive Assistant” style module matching **`SIDEBAR_TAB_SDK_QUICK_START.md`**.
4. **Version pin** – document which host commit/API version the example targets.

---

## 4. Host tasks (Phase A MVP)

1. **Loader** – read unified or tab-only manifest; accept **`type: sidebar-tab`** when discriminator lands; **backward compatible** with existing tab manifests.
2. **Registration** – register tab into **`features/TabManager/TabRegistry`** with **`source: 'extension'`** (or **`appstore`**), **`registerTabDisplay`**, stable **`tabContentId`**.
3. **Page context** – emit events / APIs per **`TAB_BUILDER_GUIDE.md`** (`currentUrlData`, tab change, SPA URL refresh).
4. **`window.canopi.tab` subset** – expose only what Phase A needs; no **`canopi.tag`** / **`canopi.overlay`**.

---

## 5. Exit criteria

- One **reference SDK tab** installs, appears in the sidepanel strip, receives **page context**, survives **tab / URL changes**, and uses **bridge + storage** per manifest permissions.
- No dependency on smart-tag or overlay APIs for that path.
- Paired PRs: **`canopi-sdk`** (types, example, docs) + **`canopi`** (loader + host injection), both on **`sdk/sidebar-tabs`**.

---

## 6. Next phase (preview only)

**Phase B** – smart tags + host: **`canopi.tag`**, **`SmartTagManager`**, **`ContextAnchor`** alignment, **`canopi.host`** page-integration layer. Start only after Phase A exit criteria and **§11 security** planning for tag surfaces.
