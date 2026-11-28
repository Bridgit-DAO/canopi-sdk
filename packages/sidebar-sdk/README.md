# @canopi-sdk/sidebar-sdk

> **Legacy: not loaded by Canopi.** This package is from an earlier SDK design. The Canopi extension today loads modules through the module manifest v2 (`@canopi-sdk/manifest`) and the sandboxed `canopi.tab` bridge (`@canopi-sdk/tab-bridge`); see [`modules/`](../../modules/) and the [repo README](../../docs/LEGACY.md). The code is kept for reference and still builds and type-checks in CI.

Client helpers for **Canopi Sidebar Tab SDK** modules: page context, tab coordination, canonical URL normalization, timing-safe initialization.

Phase A focuses on **`canopi.tab`** and host guarantees in **`TAB_BUILDER_GUIDE.md`**. See the repo [`docs/SIDEBAR_TABS_PHASE_A.md`](../docs/SIDEBAR_TABS_PHASE_A.md) for host inventory and implementation sequencing.

## Build

```bash
npm install
npm run build
```

## Consumption

Use the built **`dist/`** artifacts from extension tab entry scripts after the host injects the stable **`window.canopi`** API described in **`canopi/docs/SIDEBAR_TAB_SDK_API.md`**.
