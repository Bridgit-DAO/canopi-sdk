# @canopi-sdk/manifest

The module manifest v2 for [Canopi](https://canopi.live): one JSON Schema for smart tags and
tablications (sidebar tabs), with TypeScript types, a validator and a plain-text summary renderer.
Canopi checks every submitted module with this same validator.

```bash
npm install @canopi-sdk/manifest
```

```js
import { validateManifest } from '@canopi-sdk/manifest';

const result = validateManifest(manifest);   // manifest = the parsed manifest.json
if (!result.ok) console.error(result.errors); // [{ path, message }]
// result.warnings lists problems that don't block the module
```

Exports:

- `validateManifest(manifest)` → `{ ok, errors, warnings }`
- `MANIFEST_SCHEMA_V2`: the JSON Schema
- `renderSummary(...)`, `summaryFields(...)`: the one-line summary a smart tag shows
- Types: `ManifestV2`, `ModuleKind`, `Block`, `Trigger`, `Presentation`, `SmartTagSection`,
  `ManifestIssue`, `ManifestValidation`

Canopi refuses a few things at submit time that this validator doesn't check yet (for example
"Canopi" in the author name). The guide's precheck covers them:
[Your first Canopi tablication](https://github.com/Bridgit-DAO/canopi-sdk/blob/master/docs/FIRST_MODULE.md).

Apache-2.0. Source: [Bridgit-DAO/canopi-sdk](https://github.com/Bridgit-DAO/canopi-sdk/tree/master/packages/manifest).
