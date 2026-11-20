# @canopi-sdk/studio-kit

The contract and runtime pieces of **Canopi Studio**, the guided flow that turns an existing
application into a clickable Canopi demo, then into ManifestV2 module drafts. This package is the
source of truth for the `StudioProject` document. The canopi API and UI use a built copy of it.

| Piece | Exports |
|---|---|
| Schema and validation | `PROJECT_SCHEMA`, `validateProject(input)` (returns `{ ok, errors, warnings, project? }`, with errors shaped like `validateManifest`'s), `STAGE_OUTPUT_SCHEMAS` (`extracted`, `ideas`, `components`, `design`, `dataSources`), `validateStageOutput(stage, output)` |
| Catalogue | `STAGES`, `CATALOGUE` (what `GET /v1/studio/catalogue` returns), `SIDEBAR_COMPONENTS`, `SMART_TAG_COMPONENTS` (read from the manifest's `Block` schema, not typed out again here) |
| Sidebar renderers | `renderSidebar(root, project, { tab, sources, params?, askDeepi? })`, `renderComponent`, `SIDEBAR_CSS`, `toText`, `safeUrl` |
| Data sources | `createDataSource(descriptor, { mockBaseUrl, fetch? })`, `createMemoryDataSource(descriptor)`, `pickFixture`, `fillTemplate`, `DataSourceError` |
| Bindings | `resolveBinding(data, path)`, `parseBindingPath`, `isValidBindingPath`, `getField` |
| Preview host | `createMockTab({ page, user, theme, tags, storage, permissions?, enforcePermissions? })`: a host-less `CanopiTab` |
| Scaffold | `scaffoldModules(project, { mockBaseUrl?, data?, author?, version?, dir? })` returns `{ files: [{ path, content }], manifests }`. Also `ScaffoldError` and `RUNTIME_SOURCE` |

Demo seed: `fixtures/sample-project.json` ("Pinecone CRM", a fictional app).

## Rules the code keeps

- **Escaping.** Renderers build DOM nodes and set `textContent`. They never assign `innerHTML`.
  Links are allowed only when they are `http(s)`. The theme accent is used only if it is a hex
  colour. A test feeds `<img onerror>` strings through every component.
- **Theme.** `renderSidebar` sets `data-theme` on the root from `tab.theme.get()`, then follows
  `tab.theme.onChange`. It also re-renders when `tab.page.onContextChange` fires.
- **Request params.** Data sources receive `pageUrl`, `pageOrigin`, `pageHost`, `pagePath` and
  `pageTitle`, plus anything passed in `params`. A `urlTemplate` like `...?domain={pageHost}`
  is filled from these.
- **Mock vs live.**
  - `mode: "mock"` calls `GET|POST {mockBaseUrl}/{sourceId}`. GET sends the params as a query
    string, POST as a JSON body.
  - `mode: "live"` fills `request.urlTemplate` and swaps its origin for `live.baseUrl`. The host
    must equal `live.host`.
  - No credentials are sent.
  - `static` and `bridge` sources answer from their fixtures.
  - Mock servers should choose fixtures with `pickFixture`. It picks the most specific match on
    `params`, then the fixture with no params, then the first one.
- **Binding paths** support `$`, `.key`, `['key']`, `[n]`, `[*]` and `.*`, and nothing else. Any
  path with a wildcard resolves to an array.
- **Smart-tag design.** `design.smartTag.payloadSchema` and `summary` are optional additions to
  contract v0. If they are missing, the scaffold derives a payload schema from the popover block
  fields and uses `{{firstField}}` as the summary.

## Scaffold output

`scaffoldModules` validates the project, then writes up to two module directories:

- `modules/<slug>-tab/`: `manifest.json`, `index.html`, `app.js`, `studio-kit.js`, `style.css`,
  `README.md`. `app.js` uses tab-bridge `connect()` with the renderers and data sources.
  `studio-kit.js` is the dependency-free browser runtime (`RUNTIME_SOURCE`).
- `modules/<slug>-tag/`: `manifest.json` and `README.md`.

Each manifest must pass `validateManifest` before it is returned. A tablication's
`network.connect` lists the mock host for mock sources and `live.host` for live ones. The mock host
cannot be `*.canopi.live`, because `validateManifest` refuses Canopi hosts there. Serve Studio's
mock endpoint from a host of its own.

`data: "embedded"` is the zero-infrastructure alternative (the default is `"mock-host"`): the
fixtures of every mock source are written into `app.js` and answered in memory with
`createMemoryDataSource`, so no `mockBaseUrl` is needed and no mock host is listed in
`network.connect`. Live sources stay live and keep their hosts.

Build a scaffold from the repo root:

```bash
node scripts/build-module.mjs modules/<slug>-tab
```

## Build and vendoring

Inside the workspace, `npm run build -w packages/studio-kit` runs two steps:

- `tsc` writes `dist/*.js` and `.d.ts` files: ESM, used by the workspace and by vitest.
- `scripts/bundle.mjs` writes `dist/vendor/`, the self-contained copy another repo vendors:

| File | For |
|---|---|
| `studio-kit.cjs` | Node CommonJS, with everything included (ajv and the manifest validator are bundled): `require('…/studio-kit')` |
| `studio-kit.mjs` | The same as ESM, for `await import()` |
| `studio-kit.browser.js` | Browser ESM: renderers, data sources, bindings, `createMockTab`. No ajv |
| `sample-project.json` | The demo seed |
| `package.json` | `main` points at the `.cjs` file. `exports` covers `.` (require/import), `./browser` and `./sample-project.json` |

To vendor it into canopi the same way `scripts/sync-sdk-manifest.sh` vendors the manifest:

```bash
SDK=/path/to/canopi-sdk  # checkout at the commit to pin
(cd "$SDK" && npm ci && npm run build)
rm -rf vendor/canopi-sdk-studio-kit && cp -r "$SDK/packages/studio-kit/dist/vendor" vendor/canopi-sdk-studio-kit
echo "Bridgit-DAO/canopi-sdk@$(cd "$SDK" && git rev-parse HEAD) packages/studio-kit" > vendor/canopi-sdk-studio-kit/VERSION
```

The browser runtime is generated into `src/generated/runtime-source.ts`, so the scaffold can embed
it as a string. Run `npm run gen:runtime -w packages/studio-kit` after changing `render.ts`,
`datasource.ts` or `binding.ts`. A test fails if the generated file is stale.
