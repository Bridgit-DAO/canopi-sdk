// Hello page: the first-module example (docs/FIRST_MODULE.md).
// This frame is sandboxed: no Canopi cookies, no localStorage, no DOM of the page. Everything
// goes through the canopi.tab bridge. tab-bridge.js is added by scripts/build-module.mjs.
import { connect } from './tab-bridge.js';

const $ = (id) => document.getElementById(id);
let canopi;
let page = null;

function setTheme(t) { document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark'); }

function showPage(ctx) {
  page = ctx;
  $('title').textContent = ctx ? ctx.title || '(untitled page)' : 'No page';
  $('url').textContent = ctx ? ctx.url : '';
  $('remember').disabled = !ctx;
}

async function showRemembered() {
  // storage.get(key) answers null for a key that was never set.
  const saved = await canopi.storage.get('remembered');
  $('remembered').textContent = saved ? `${saved.title || saved.url} (saved ${new Date(saved.savedAt).toLocaleString()})` : 'Nothing yet.';
  await canopi.ui.setBadge(saved ? '1' : null);
}

$('remember').addEventListener('click', async () => {
  if (!page) return;
  try {
    // Keys are 1-100 characters; the whole module store is capped at 100 KB. Values are plain JSON.
    await canopi.storage.set('remembered', { url: page.url, title: page.title, savedAt: Date.now() });
    $('status').textContent = 'Saved.';
    await showRemembered();
  } catch (e) {
    $('status').textContent = `Could not save (${e && e.code ? e.code : 'error'})`;
  }
});

(async () => {
  try {
    canopi = await connect();
    setTheme(await canopi.theme.get());
    canopi.theme.onChange(setTheme);
    showPage(await canopi.page.getContext());
    canopi.page.onContextChange(showPage);
    await showRemembered();
    $('status').textContent = `Connected (${canopi.moduleId})`;
  } catch (e) {
    // TIMEOUT here means nothing sent canopi.tab.init: the file was opened outside a host.
    $('status').textContent = `Could not connect to Canopi (${e && e.code ? e.code : 'error'})`;
  }
})();
