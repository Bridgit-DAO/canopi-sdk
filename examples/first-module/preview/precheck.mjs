#!/usr/bin/env node
/**
 * Check a built submission against the rules Canopi applies on submit that validateManifest (and so
 * build-module.mjs) does not (docs/FIRST_MODULE.md, "Before you submit"):
 *
 *   node examples/first-module/preview/precheck.mjs examples/first-module/hello-page/dist/submission.json
 *
 * Mirrors canopi services/sdkModuleService.js submitVersion and services/sdkBundleService.js
 * prepareBundle. It cannot check what needs Canopi's database: invited submitter, tab id or module
 * id already taken by someone else, version already submitted, smart tags owned by someone else.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: precheck.mjs <dist/submission.json>'); process.exit(2); }
const { manifest, bundle } = JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = [];
const say = (code, msg) => problems.push(`${code}: ${msg}`);

const RESERVED_TAB_IDS = new Set(['discuss-tab', 'live-tab', 'visibility-tab', 'people-tab', 'agent-tab', 'bookmarks-tab', 'patches-tab', 'settings-tab', 'manage-tab', 'rooms-tab', 'timelines-tab', 'wayback-tab', 'vault-tab', 'sdk-tab', 'sidebar-tab', 'current-tab', 'data-tab']);
const RESERVED_TAG_TYPES = new Set(['post', 'patch', 'insert', 'bridge', 'pro-human-ai', 'discuss', 'task', 'quote', 'question', 'tag', 'reply']);

if (/^live\.canopi\./.test(String(manifest.id))) say('module_id_reserved', 'live.canopi.* is reserved for Canopi; use your own reverse-domain id');
const tabId = manifest.tablication && manifest.tablication.tab && manifest.tablication.tab.id;
if (tabId && (RESERVED_TAB_IDS.has(tabId) || (!/-tab$/.test(tabId) && RESERVED_TAB_IDS.has(`${tabId}-tab`)))) say('tab_id_reserved', `"${tabId}" is a built-in sidebar tab`);
if (/canopi/i.test(String((manifest.author && manifest.author.name) || ''))) say('author_name_reserved', 'author.name may not contain "canopi" (any case)');
if (manifest.smartTag && RESERVED_TAG_TYPES.has(manifest.smartTag.tagType)) say('tag_type_reserved', `"${manifest.smartTag.tagType}" is a Canopi tag type`);

if (manifest.kind === 'tablication') {
  const PATH_RE = /^(?!.*\.\.)(?!\/)[a-zA-Z0-9_\-/]+\.[a-z0-9]{1,5}$/;
  const TYPES = new Set(['html', 'js', 'mjs', 'css', 'json', 'txt', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'woff2']);
  const files = Object.entries((bundle && bundle.files) || {});
  if (!files.length) say('invalid_bundle', 'bundle is empty');
  if (files.length > 50) say('invalid_bundle', `${files.length} files; the limit is 50`);
  let total = 0;
  for (const [p, b64] of files) {
    if (!PATH_RE.test(p)) say('invalid_bundle', `bad file path "${p}" (letters, digits, _ - / and one extension; no dots in the name)`);
    else if (!TYPES.has(p.split('.').pop().toLowerCase())) say('invalid_bundle', `file type not allowed: "${p}" (allowed: ${[...TYPES].join(', ')})`);
    total += Buffer.from(b64, 'base64').length;
  }
  if (total > 1.5 * 1024 * 1024) say('invalid_bundle', `bundle is ${total} bytes; the limit is ${1.5 * 1024 * 1024}`);
  const entry = manifest.tablication && manifest.tablication.entry && manifest.tablication.entry.html;
  if (!files.some(([p]) => p === entry)) say('invalid_bundle', `bundle lacks the entry file "${entry}"`);
}

const body = JSON.stringify({ manifest, bundle });
// The API parses JSON bodies up to 2 MB (express.json limit), and base64 adds a third.
if (Buffer.byteLength(body) > 2 * 1024 * 1024) say('413', `request body is ${Buffer.byteLength(body)} bytes; the API accepts at most ${2 * 1024 * 1024}`);
if (problems.length) {
  console.error(`${manifest.id}@${manifest.version}: Canopi would refuse this submission:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`${manifest.id}@${manifest.version}: passes the submit-time rules checked here (${(body.length / 1024).toFixed(1)} KB request body)`);
