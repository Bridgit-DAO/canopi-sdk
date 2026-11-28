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

| Package | What |
|---|---|
| `@canopi-sdk/manifest` | **Module manifest v2**: one JSON Schema for smart tags, tablications and (reserved) overlay apps. It covers presentations, surfaces, triggers, permissions and network hosts, and ships with TypeScript types, a validator and a plain-text summary renderer. Canopi vendors this validator. |
| `@canopi-sdk/tab-bridge` | Client for the `canopi.tab` bridge v1: what a sandboxed tablication imports to talk to Canopi. |
| `@canopi-sdk/studio-kit` | **Canopi Studio** contract: StudioProject schema + validator, component catalogue, escaped sidebar renderers, mock/live data sources, mock `CanopiTab`, and a scaffold generator that emits ManifestV2 module dirs. Vendorable build in `dist/vendor`. |
| `@canopi-sdk/cli` | The `canopi` command: post, reply, quote and react on Canopi as an agent (`cag_` token) or a person, and manage your agents. `npm install -g @canopi-sdk/cli`. |

The repository also holds packages from an earlier design (`smart-tags`, `sidebar-sdk`, `overlays`, `shared`). Canopi does not load them and new modules should not use them; the notes are in [`docs/LEGACY.md`](./docs/LEGACY.md).

To run Canopi Studio locally with `studio-kit`, use the [`canopi-studio`](./.claude/skills/canopi-studio/) skill.

Every package builds to ES modules plus type declarations in `dist/`, with an `exports` field, and has **no side effects at import**: no globals, listeners or timers. All packages are licensed Apache-2.0. `@canopi-sdk/manifest`, `@canopi-sdk/tab-bridge`, `@canopi-sdk/studio-kit` and `@canopi-sdk/cli` are published to npm (see [`docs/RELEASING.md`](./docs/RELEASING.md)).

```bash
npm ci            # Node 22, npm 10.9.9 (what CI and the servers run)
npm run build     # shared first, then every package
npm run type-check
npm run lint
npm test          # vitest, happy-dom (packages/*/src, tests/ and skill scripts)
```

CI (`.github/workflows/ci.yml`) runs all of these on every PR, plus a gitleaks scan of the new commits and `npm audit` (high and above).

## Documentation

**Building a module:** [`docs/FIRST_MODULE.md`](./docs/FIRST_MODULE.md).

**SDK design (maintainers):** [`docs/SDK_IMPLEMENTATION_MASTER.md`](./docs/SDK_IMPLEMENTATION_MASTER.md) – architecture, context anchoring, patches and progressive layers, resolved decisions, open questions, and security prerequisites (§11).

### In this repository

| Document | Description |
|----------|--------------|
| [`docs/SDK_IMPLEMENTATION_MASTER.md`](./docs/SDK_IMPLEMENTATION_MASTER.md) | Implementation guide for sidebar / smart-tag / overlay SDKs; merges planning decisions; patches vs surfaces (consolidated plan §11.2); §11 security (analysis before ship, agents, breach monitoring); open questions. |

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
│   ├── manifest/             # Module manifest v2: schema, types, validator
│   ├── tab-bridge/           # canopi.tab bridge client
│   ├── studio-kit/           # Canopi Studio contract and scaffold generator
│   └── cli/                  # The `canopi` command, @canopi-sdk/cli
├── scripts/                  # build-module.mjs and helper scripts
├── tests/                    # Tests for modules/ (vitest)
├── studio/                   # Canopi Studio local app (canopi-studio skill)
├── .claude/skills/           # canopi-studio skill
└── docs/                     # Guides and design docs
```

## Contributing

Changes to the manifest schema or the `canopi.tab` bridge need a matching change in the Canopi host, so open an issue to discuss them first. New modules go in `modules/` and must pass `validateManifest` (the `reference modules` test checks every manifest there).

## License

Licensed under the [Apache License, Version 2.0](./LICENSE). Copyright 2026 Bridgit DAO.
