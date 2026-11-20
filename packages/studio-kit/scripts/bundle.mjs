#!/usr/bin/env node
/**
 * Vendorable build in dist/vendor (what another repo copies, like canopi's vendor/canopi-sdk-manifest):
 *   studio-kit.cjs         Node, CommonJS: everything (schemas, validators, catalogue, scaffold, data sources), ajv bundled
 *   studio-kit.mjs         the same as an ES module (for `await import()` from CommonJS)
 *   studio-kit.browser.js  browser ES module: renderers, data sources, bindings, mock CanopiTab (no ajv)
 *   sample-project.json    the demo seed
 */
import fs from 'node:fs';
import { build } from 'esbuild';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (rel) => path.join(root, rel);
const out = p('dist/vendor') + path.sep;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const common = { bundle: true, legalComments: 'none', charset: 'utf8', logLevel: 'warning' };
await build({ ...common, entryPoints: [p('src/index.ts')], outfile: `${out}studio-kit.cjs`, platform: 'node', format: 'cjs', target: 'node18' });
await build({ ...common, entryPoints: [p('src/index.ts')], outfile: `${out}studio-kit.mjs`, platform: 'node', format: 'esm', target: 'node18' });
await build({ ...common, entryPoints: [p('src/browser.ts')], outfile: `${out}studio-kit.browser.js`, platform: 'browser', format: 'esm', target: 'es2020' });
fs.copyFileSync(p('fixtures/sample-project.json'), `${out}sample-project.json`);
fs.writeFileSync(`${out}package.json`, `${JSON.stringify({
  name: '@canopi-sdk/studio-kit',
  private: true,
  main: 'studio-kit.cjs',
  exports: { '.': { require: './studio-kit.cjs', import: './studio-kit.mjs' }, './browser': './studio-kit.browser.js', './sample-project.json': './sample-project.json' },
}, null, 2)}\n`);
console.log(`vendor build -> ${out}`);
