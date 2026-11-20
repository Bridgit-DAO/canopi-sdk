/** Every reference module in modules/ has a valid v2 manifest, and tag/tablication pairs line up. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateManifest } from './validate.js';
import type { ManifestV2 } from './types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../modules');
const manifests = fs.readdirSync(root)
  .filter((d) => fs.existsSync(path.join(root, d, 'manifest.json')))
  .map((d) => [d, JSON.parse(fs.readFileSync(path.join(root, d, 'manifest.json'), 'utf8')) as ManifestV2] as const);

describe('reference modules', () => {
  it.each(manifests)('%s validates', (_dir, m) => {
    const r = validateManifest(m);
    expect(r.errors).toEqual([]);
  });

  it('every tag a tablication contains is a module here, and it may read it', () => {
    const tagTypes = new Set(manifests.map(([, m]) => m.smartTag?.tagType).filter(Boolean));
    for (const [, m] of manifests) {
      for (const t of m.tablication?.contains ?? []) {
        expect(tagTypes.has(t), t).toBe(true);
        expect(m.permissions ?? []).toContain(`tags:read:${t}`);
      }
    }
  });
});
