# Wayback Machine: sidebar tab

Scaffolded by Canopi Studio from project `9f458443-da82-4384-8d81-7b99fecefbce`. A draft: review it, then build it with
`node scripts/build-module.mjs studio/wayback-machine/draft/wayback-machine-tab` (from the canopi-sdk root). Studio never submits modules.

Files: `manifest.json` (ManifestV2), `index.html` + `app.js` (entry; connects with tab-bridge
`connect()`), `studio-kit.js` (the sidebar renderers and data sources from @canopi-sdk/studio-kit),
`style.css`. `tab-bridge.js` is added by build-module.

## What is mock

| Source | Name | Served by | Shape is | Evidence |
|---|---|---|---|---|
| `src_latest` | Latest snapshot of this page | mock (studio-mock.invalid) | documented | https://archive.org/help/wayback_api.php documents GET /wayback/available?url=<url>[&timestamp=] and this response shape. Fixtures are real responses fetched 2026-11-14. CORS probed 2026-11-14: OPTIONS with Origin: null -> access-control-allow-origin: null; GET -> *. |
| `src_oldest` | First snapshot of this page | mock (studio-mock.invalid) | documented | https://archive.org/help/wayback_api.php documents GET /wayback/available?url=<url>[&timestamp=] and this response shape. Fixtures are real responses fetched 2026-11-14. CORS probed 2026-11-14: OPTIONS with Origin: null -> access-control-allow-origin: null; GET -> *. timestamp=19960101 asks for the capture closest to the start of the archive. |
| `src_history` | Captures per year | mock (studio-mock.invalid) | invented | The CDX server (https://web.archive.org/cdx/search/cdx?url=<url>&output=json) is public but answers rows as arrays with a header row, and its preflight with Origin: null answered 405. This { years: [{ year, captures }] } shape does not exist; the yearly counts in the fixtures are real (counted from CDX rows on 2026-11-14). Going live needs a small transform service, or the Internet Archive adding such an endpoint. |

Mock sources are served by Studio at `https://studio-mock.invalid/v1/studio/projects/9f458443-da82-4384-8d81-7b99fecefbce/mock/<source id>` with the same response shape the real API is expected to have.

## Going live

1. In `app.js`, set the source's `mode` to `"live"` and `live` to `{ "baseUrl": "https://api.partner.example", "host": "api.partner.example" }`.
   The request path and query come from `request.urlTemplate`; `live.baseUrl` replaces its origin.
2. In `manifest.json`, replace the mock host in `network.connect` with the partner's host.
3. The partner API must answer CORS for `Origin: null` (the tab runs in a sandboxed frame) and must not
   need cookies; no credentials are sent from the tab.
