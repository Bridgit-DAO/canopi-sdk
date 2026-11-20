# Anchor widget – composer tag shipping status

**Canonical code:** `SHIPPED_ANCHOR_COMPOSER_TAG_IDS` and `isAnchorComposerTagShipped()` in [`src/registry.ts`](../src/registry.ts).

## Policy (Apr 2026)

- **Discuss** and **Bridge** are **shipped** composer-tier tags for the in-page anchor widget: creation flows, backend integration, and Discuss rendering (structured cards where applicable).
- **Task, Quote, Question, Tag, Manage** remain **visible but inactive** in the extension widget until each has a defined form/modal and first-class Discuss rendering (typed `payload` + card UI), comparable to Discuss/Bridge.

**Lightweight** actions (bookmark, react, share, follow) are **not** listed in `SHIPPED_ANCHOR_COMPOSER_TAG_IDS`. They are **auth-gated** in the widget (`ensureSignedInForSmartTags` + background checks). Bookmark/react/share use **commons** (`POST /api/commons/events/emit`). **Follow** uses **`POST /v1/user-anchor-follows/toggle`** (same as focus-mode footer), not commons emit.

## Extension implementation

The extension `content` bundle cannot import this package directly; it mirrors the shipped-id set with a comment pointing here. When adding a newly shipped composer tag:

1. Add its `id` to `SHIPPED_ANCHOR_COMPOSER_TAG_IDS` in this repo.
2. For Canopi maintainers: sync the inlined copy in the host's `presence/src/config/smartTagRegistry.ts` (and the `isComposerTagShipped` check in `content.ts`).
