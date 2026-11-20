#!/usr/bin/env node
/**
 * Local preview host for a tablication (docs/FIRST_MODULE.md, "Preview it locally").
 *
 *   npm run build                                   # once: builds packages/tab-bridge/dist
 *   node examples/first-module/preview/serve.mjs examples/first-module/hello-page [--port 8790]
 *   open http://127.0.0.1:8790/
 *
 * It serves the module the way the Canopi bundle host does (the same sandbox CSP, built from the
 * manifest's network.connect) inside a sandbox="allow-scripts" iframe, and host.js answers the
 * canopi.tab bridge with the host's permission checks and limits. It is a stand-in, not Canopi:
 * there is no real composer, no smart-tag data and no sign-in. Nothing leaves your machine.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : 8790;
if (!dir) { console.error('usage: serve.mjs <module dir> [--port 8790]'); process.exit(2); }
const moduleDir = path.resolve(dir);
const bridgeFile = path.join(repo, 'packages/tab-bridge/dist/index.js');
if (!fs.existsSync(bridgeFile)) { console.error(`missing ${bridgeFile}: run "npm run build" in the repo root first`); process.exit(1); }

// The bundle host's rules (canopi services/sdkBundleService.js): file names, types, CSP.
const PATH_RE = /^(?!.*\.\.)(?!\/)[a-zA-Z0-9_\-/]+\.[a-z0-9]{1,5}$/;
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', woff2: 'font/woff2',
};
const typeOf = (p) => TYPES[String(p).split('.').pop().toLowerCase()] || null;

function readManifest() { return JSON.parse(fs.readFileSync(path.join(moduleDir, 'manifest.json'), 'utf8')); }

function bundleCsp(manifest) {
  const hosts = ((manifest.network && manifest.network.connect) || []).filter((h) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(h));
  return [
    'sandbox allow-scripts', "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'", `connect-src ${hosts.length ? hosts.map((h) => `https://${h}`).join(' ') : "'none'"}`,
    "base-uri 'none'", "form-action 'none'", "object-src 'none'",
  ].join('; ');
}

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/index.html') return send(res, 200, TYPES.html, fs.readFileSync(path.join(here, 'host.html')));
  if (p === '/host.js') return send(res, 200, TYPES.js, fs.readFileSync(path.join(here, 'host.js')));
  if (p === '/manifest.json') {
    try { return send(res, 200, TYPES.json, JSON.stringify(readManifest())); } catch (e) { return send(res, 500, TYPES.txt, `manifest.json: ${e.message}`); }
  }
  if (p.startsWith('/module/')) {
    const rel = p.slice('/module/'.length);
    let manifest;
    try { manifest = readManifest(); } catch (e) { return send(res, 500, TYPES.txt, `manifest.json: ${e.message}`); }
    const headers = { 'Content-Security-Policy': bundleCsp(manifest), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Access-Control-Allow-Origin': '*' };
    if (!PATH_RE.test(rel) || !typeOf(rel)) {
      console.warn(`[preview] ${rel}: the Canopi bundle host refuses this file name or type`);
      return send(res, 404, TYPES.txt, 'not found', headers);
    }
    // build-module.mjs ships the SDK's bridge client as tab-bridge.js; serve the same file here.
    const file = rel === 'tab-bridge.js' ? bridgeFile : path.join(moduleDir, rel);
    if (!file.startsWith(moduleDir + path.sep) && file !== bridgeFile) return send(res, 404, TYPES.txt, 'not found', headers);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, TYPES.txt, 'not found', headers);
    return send(res, 200, typeOf(rel), fs.readFileSync(file), headers);
  }
  return send(res, 404, TYPES.txt, 'not found');
});

server.listen(port, '127.0.0.1', () => {
  const m = readManifest();
  console.log(`Previewing ${m.id}@${m.version} from ${moduleDir}`);
  console.log(`Open http://127.0.0.1:${port}/  (Ctrl+C to stop)`);
});
