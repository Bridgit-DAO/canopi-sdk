// Page notes: reference tablication for the canopi.tab bridge v1.
// Everything goes through the bridge; this frame has no Canopi cookies, storage or DOM.
import { connect } from './tab-bridge.js';
import { noteKeyFor } from './note-key.js';

const $ = (id) => document.getElementById(id);
const note = $('note');
let canopi;
let pageKey = null;
let saveTimer = null;

function setTheme(t) { document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark'); }

async function countNotes() {
  const all = await canopi.storage.get();
  return Object.keys(all || {}).filter((k) => k.startsWith('note:') && all[k]).length;
}

// Public page notes: the page-note smart tag. Read through tags.list (as the viewer); the host
// composer posts them, never this frame. textContent only: notes are other people's text.
async function showPublic() {
  const list = $('public');
  list.replaceChildren();
  try {
    const items = await canopi.tags.list('page-note', { limit: 20 });
    for (const it of items) {
      const li = document.createElement('li');
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = String(it.data && it.data.kind || 'note');
      const text = document.createElement('span');
      text.textContent = ` ${it.summary} — @${it.author && it.author.handle}`;
      li.append(kind, text);
      list.appendChild(li);
    }
    $('public-status').textContent = items.length ? '' : 'No public notes here yet.';
  } catch (e) {
    $('public-status').textContent = `Public notes unavailable (${e && e.code ? e.code : 'error'})`;
  }
}

$('share').addEventListener('click', async () => {
  try {
    await canopi.tags.compose('page-note', { kind: 'note', note: note.value.trim() });
    $('status').textContent = 'Review and post it in the Canopi composer.';
  } catch (e) {
    $('status').textContent = `Could not open the composer (${e && e.code ? e.code : 'error'})`;
  }
});

async function showPage(ctx) {
  pageKey = await noteKeyFor(ctx && ctx.url);
  $('page').textContent = ctx ? ctx.title || ctx.url : 'No page';
  if (ctx && ctx.url && !pageKey) $('status').textContent = 'Notes are unavailable for this page';
  note.disabled = !pageKey;
  $('share').disabled = !pageKey;
  void showPublic();
  note.value = pageKey ? (await canopi.storage.get(pageKey)) || '' : '';
  await canopi.ui.setBadge(String(await countNotes() || '') || null);
}

note.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await canopi.storage.set(pageKey, note.value.trim() ? note.value : null);
      $('status').textContent = 'Saved';
      await canopi.ui.setBadge(String(await countNotes() || '') || null);
    } catch (e) {
      $('status').textContent = e && e.code === 'QUOTA_EXCEEDED' ? 'Notes are full (100 KB)' : 'Could not save';
    }
  }, 400);
});

(async () => {
  try {
    canopi = await connect();
    setTheme(await canopi.theme.get());
    canopi.theme.onChange(setTheme);
    const me = await canopi.user.getProfile();
    $('who').textContent = me ? `Notes for @${me.handle}` : 'Sign in to Canopi to keep notes';
    await showPage(await canopi.page.getContext());
    canopi.page.onContextChange(showPage);
  } catch (e) {
    $('who').textContent = `Could not connect to Canopi (${e && e.code ? e.code : 'error'})`;
  }
})();
