# Legacy examples (do not run as-is)

These pages use the legacy packages (`@canopi-sdk/smart-tags`, `@canopi-sdk/overlays`, `@canopi-sdk/sidebar-sdk`). Canopi does not load those packages, and the HTML pages import bare package names with no bundler or import map, so they do not run when opened in a browser. They are kept as a record of the earlier design.

For working examples of what Canopi loads today, see [`modules/`](../../modules/):

- [`modules/page-notes/`](../../modules/page-notes/): a tablication (sandboxed sidebar tab) that talks to Canopi only through the `canopi.tab` bridge.
- [`modules/page-note-tag/`](../../modules/page-note-tag/): a declarative smart tag (manifest only, no code).
