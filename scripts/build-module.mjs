#!/usr/bin/env node
/**
 * Build a module into a submission for POST /v1/sdk/modules/versions:
 *   node scripts/build-module.mjs modules/page-notes   ->  modules/page-notes/dist/submission.json
 * Validates the manifest with @canopi-sdk/manifest, copies the tab-bridge client in as tab-bridge.js
 * for tablications, and base64-encodes every file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest } from '../packages/manifest/dist/index.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: build-module.mjs <module dir>'); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const v = validateManifest(manifest);
if (!v.ok) { console.error('invalid manifest:', JSON.stringify(v.errors, null, 2)); process.exit(1); }
const files = {};
if (manifest.kind === 'tablication') {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'manifest.json' || f === 'dist' || f.startsWith('.')) continue;
    files[f] = fs.readFileSync(path.join(dir, f)).toString('base64');
  }
  files['tab-bridge.js'] = fs.readFileSync('packages/tab-bridge/dist/index.js').toString('base64');
}
const out = { manifest, ...(Object.keys(files).length ? { bundle: { files } } : {}) };
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'submission.json'), JSON.stringify(out));
console.log(`${manifest.id}@${manifest.version}: ${Object.keys(files).length} files -> ${path.join(dir, 'dist', 'submission.json')}`, v.warnings.length ? v.warnings : '');
