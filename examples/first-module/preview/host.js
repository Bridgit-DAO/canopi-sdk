// Preview side of the canopi.tab bridge v1. It mirrors the Canopi host's checks
// (presence/src/sdk/tablicationHost.ts in canopi): permissions from the manifest, storage keys of
// 1-100 characters, 100 KB of module storage, 64 KB messages, 50 calls a second, badge text cut
// to 4 characters, tags.compose only for tag types in tablication.contains. It is a stand-in:
// tags.list answers [] and tags.compose only logs what the composer would have opened with.
const STORAGE_LIMIT_BYTES = 100 * 1024;
const MESSAGE_LIMIT_BYTES = 64 * 1024;
const RATE_LIMIT_PER_SECOND = 50;
const METHOD_PERMISSION = {
  'page.getContext': 'page:context', 'user.getProfile': 'user:profile', 'storage.get': 'storage:module',
  'storage.set': 'storage:module', 'theme.get': null, 'ui.setBadge': 'ui:badge', 'ui.openTab': 'ui:openTab',
  'tags.compose': 'tags:compose', 'tags.list': (p) => `tags:read:${String(p.tagType || '')}`,
};

const $ = (id) => document.getElementById(id);
const manifest = await (await fetch('/manifest.json')).json();
const granted = new Set(manifest.permissions || []);
const contains = new Set((manifest.tablication && manifest.tablication.contains) || []);
const storeKey = `canopi-preview-storage:${manifest.id}`;
let theme = 'dark';
let port = null;

const bytes = (v) => new TextEncoder().encode(JSON.stringify(v) ?? '').length;
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
function readStore() { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; } }
function writeStore(v) { localStorage.setItem(storeKey, JSON.stringify(v)); showStore(); }
function showStore() { $('storage').textContent = JSON.stringify(readStore(), null, 2); }
function log(line) { $('log').textContent = `${new Date().toLocaleTimeString()} ${line}\n${$('log').textContent}`.slice(0, 8000); }
function pageContext() { const url = $('url').value.trim(); return url ? { url, title: $('title').value } : null; }

class BridgeError extends Error { constructor(code, message) { super(message); this.code = code; } }

async function handle(method, params) {
  switch (method) {
    case 'page.getContext': return pageContext();
    case 'user.getProfile': return { handle: 'preview', name: 'Preview user', avatarUrl: null };
    case 'storage.get': { const all = readStore(); return typeof params.key === 'string' ? (all[params.key] ?? null) : all; }
    case 'storage.set': {
      if (typeof params.key !== 'string' || !params.key || params.key.length > 100) throw new BridgeError('BAD_REQUEST', 'storage.set needs a key (1-100 chars)');
      const next = { ...readStore() };
      if (params.value === undefined || params.value === null) delete next[params.key]; else next[params.key] = plain(params.value);
      if (bytes(next) > STORAGE_LIMIT_BYTES) throw new BridgeError('QUOTA_EXCEEDED', `module storage is limited to ${STORAGE_LIMIT_BYTES} bytes`);
      writeStore(next);
      return true;
    }
    case 'theme.get': return theme;
    case 'ui.setBadge': {
      const text = params.text === null || params.text === undefined ? null : String(params.text).slice(0, 4);
      $('badge').hidden = !text; $('badge').textContent = text || '';
      return true;
    }
    case 'ui.openTab': {
      if (!/^[a-z0-9][a-z0-9.-]{1,63}$/.test(String(params.tabId || ''))) throw new BridgeError('BAD_REQUEST', 'bad tabId');
      log(`  (would switch the sidebar to ${params.tabId})`);
      return true;
    }
    case 'tags.compose': {
      if (!contains.has(String(params.tagType || ''))) throw new BridgeError('PERMISSION_DENIED', `this tablication does not contain tag type "${params.tagType}"`);
      log(`  (would open the Canopi composer for ${params.tagType} with ${JSON.stringify(params.data)}; the person posts)`);
      return { opened: true };
    }
    case 'tags.list': return [];
    default: throw new BridgeError('UNKNOWN_METHOD', `unknown method ${method}`);
  }
}

function serve(p) {
  let windowStart = Date.now();
  let count = 0;
  p.onmessage = async (event) => {
    const req = event.data || {};
    if (typeof req.id !== 'number' && typeof req.id !== 'string') return;
    try {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      if (++count > RATE_LIMIT_PER_SECOND) throw new BridgeError('RATE_LIMITED', 'too many bridge calls');
      if (bytes(req) > MESSAGE_LIMIT_BYTES) throw new BridgeError('TOO_LARGE', `bridge messages are limited to ${MESSAGE_LIMIT_BYTES} bytes`);
      const method = typeof req.method === 'string' ? req.method : '';
      const params = req.params && typeof req.params === 'object' ? req.params : {};
      if (!Object.prototype.hasOwnProperty.call(METHOD_PERMISSION, method)) throw new BridgeError('UNKNOWN_METHOD', `unknown method ${method}`);
      const rule = METHOD_PERMISSION[method];
      const needed = typeof rule === 'function' ? rule(params) : rule;
      if (needed && !granted.has(needed)) throw new BridgeError('PERMISSION_DENIED', `missing permission ${needed}`);
      const result = await handle(method, params);
      log(`${method} ${JSON.stringify(params)} -> ok`);
      p.postMessage({ id: req.id, result: result === undefined ? null : plain(result) });
    } catch (e) {
      const err = e instanceof BridgeError ? e : new BridgeError('HOST_ERROR', 'the host could not complete the call');
      log(`${req.method} -> ${err.code}: ${err.message}`);
      p.postMessage({ id: req.id, error: { code: err.code, message: err.message } });
    }
  };
}

function mount() {
  if (port) port.close();
  port = null;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', manifest.name);
  frame.src = `/module/${manifest.tablication.entry.html.replace(/^\/+/, '')}`;
  let loads = 0;
  frame.addEventListener('load', () => {
    // Like Canopi: the port goes to the first document only. If the app navigates itself, it is closed.
    if (++loads > 1) { frame.remove(); log('the app navigated away from its entry file: Canopi closes it'); return; }
    const channel = new MessageChannel();
    port = channel.port1;
    serve(port);
    frame.contentWindow.postMessage({ type: 'canopi.tab.init', v: 1, moduleId: manifest.id, permissions: manifest.permissions || [], theme }, '*', [channel.port2]);
    log(`canopi.tab.init sent (permissions: ${(manifest.permissions || []).join(', ') || 'none'})`);
  });
  $('slot').replaceChildren(frame);
}

$('tab').textContent = `${manifest.tablication.tab.icon || ''} ${manifest.tablication.tab.title}`;
$('appby').textContent = `${manifest.name} · App by ${manifest.author.name}`;
const push = () => { if (port && granted.has('page:context')) port.postMessage({ event: 'page.contextChanged', data: pageContext() }); };
$('navigate').addEventListener('click', push);
$('nopage').addEventListener('click', () => { $('url').value = ''; push(); });
$('theme').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; if (port) port.postMessage({ event: 'theme.changed', data: theme }); });
$('reload').addEventListener('click', mount);
$('clear').addEventListener('click', () => { localStorage.removeItem(storeKey); showStore(); });
showStore();
mount();
