# Your first Canopi tablication

This guide takes you from a clean clone of `canopi-sdk` to your own tab in the Canopi sidebar. A
**tablication** is a sidebar tab that you write in plain HTML, CSS and JavaScript. Canopi runs it in
a sandboxed frame next to the page the person is reading.

You will:

1. build the SDK (under a minute after the clone),
2. make a small tab, "Hello page", that shows the current page and remembers one page for you,
3. preview it on your machine,
4. build the submission, and
5. submit it, get it approved, and turn it on for yourself.

Sections 1 to 6 need nothing from Canopi. Section 7 needs a Canopi account that the Canopi team
has invited as a submitter (see [Before you start](#before-you-start)).

Everything you need is in this repo. The finished example is in
[`examples/first-module/hello-page`](../examples/first-module/hello-page).

---

## Before you start

- **Node 22 and npm 10.** CI uses Node 22 with npm 10.9.9. Check with `node -v` and `npm -v`.
- **git**, and read access to `Bridgit-DAO/canopi-sdk`.
- **For section 7 only:**
  - A Canopi account on the environment you will publish to:
    - staging: `https://staging.api.canopi.live`
    - production: `https://api.canopi.live`

    During the pilot, start on staging.
  - Your account invited as a submitter on that environment. Send the Canopi team your AppUser
    id (you will get it in [7.1](#71-get-a-token-for-your-account)) and ask them to invite you.
  - A Canopi sidebar that talks to the same environment:
    - production: the Canopi Chrome extension.
    - staging: a staging build of the extension. Ask the Canopi team for one, because the
      production extension only talks to production.

## 1. Clone, install, build

```bash
git clone https://github.com/Bridgit-DAO/canopi-sdk.git
cd canopi-sdk
npm ci --no-audit --no-fund
npm run build
```

`npm run build` compiles every package. You need two of them:

- `packages/manifest/dist`: the manifest validator.
- `packages/tab-bridge/dist`: the bridge client that your tab imports.

Run every command in this guide **from the repo root**. `scripts/build-module.mjs` reads
`packages/tab-bridge/dist/index.js` by a relative path. From any other directory it fails with
`ENOENT ... packages/tab-bridge/dist/index.js`.

Optional: run the test suite with `npm test`. You don't need the tests to build a module.

## 2. How a tablication works

Read this before you write code. Most surprises come from here.

- **Sandboxed frame.** Canopi loads your files into an `<iframe sandbox="allow-scripts">` with no
  `allow-same-origin`. The frame's origin is `null`. As a result your tab has:
  - no Canopi cookies, session or token;
  - no `localStorage`, `sessionStorage` or IndexedDB (they throw `SecurityError`);
  - no access to the page's DOM;
  - no forms, pop-ups or `alert()`.
- **Bundle host CSP.** Canopi serves your files from its bundle host
  (`https://apps.canopi.live/<sha>/…`, staging `https://staging.apps.canopi.live/<sha>/…`) with
  this Content-Security-Policy:

  ```
  sandbox allow-scripts; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src <your network.connect hosts, or 'none'>;
  base-uri 'none'; form-action 'none'; object-src 'none'
  ```

  In practice:
  - **No inline `<script>`, no `onclick="…"` attributes, no CDN scripts.** Put all JavaScript in
    files in your bundle. Inline styles are fine.
  - **`fetch` works only to hosts listed in `network.connect`.** No credentials are sent, and the
    other server must answer CORS for `Origin: null`. Canopi's own hosts (`*.canopi.live`) are
    refused there. You reach Canopi only through the bridge.
- **The bridge.** When your frame loads, Canopi posts one `canopi.tab.init` message that carries a
  private `MessagePort`. `connect()` from `tab-bridge.js` waits for it, for 10 seconds by default,
  and gives you a `canopi` object. Every call goes over that port. Each call is checked against
  the `permissions` in your manifest.
- **One document only.** If your frame navigates to another page, even one of your own files,
  Canopi closes the tab. Build a single-page app with one entry HTML file.
- **The person writes.** A tab never posts on anyone's behalf. `tags.compose` only opens Canopi's
  composer, pre-filled. The person decides whether to post.

### The bridge API (`canopi.tab` v1)

| Call | Permission | Notes |
|---|---|---|
| `canopi.page.getContext()` | `page:context` | `{ url, title }` of the page, or `null`. Canopi cleans the URL first (it drops tracking parameters), so it can differ from the address bar |
| `canopi.page.onContextChange(cb)` | `page:context` | Fires when the person moves to another page. Returns an unsubscribe function |
| `canopi.user.getProfile()` | `user:profile` | `{ handle, name, avatarUrl }`, or `null` when signed out |
| `canopi.storage.get(key?)` | `storage:module` | One value (`null` if unset), or the whole store when `key` is omitted |
| `canopi.storage.set(key, value)` | `storage:module` | Key 1–100 characters. The value must be plain JSON. `null` deletes the key. The whole store is capped at **100 KB** (`QUOTA_EXCEEDED`). It is kept on the person's device, not synced |
| `canopi.theme.get()` / `onChange(cb)` | none | `'light'` or `'dark'` |
| `canopi.ui.setBadge(text)` | `ui:badge` | Badge on your tab. At most 4 characters; `null` clears it |
| `canopi.ui.openTab(tabId)` | `ui:openTab` | Switches the sidebar to another tab |
| `canopi.tags.compose(tagType, data)` | `tags:compose` | Opens the composer for a smart tag your tab lists in `tablication.contains`. Must follow a click or key press (`USER_ACTION_REQUIRED`) |
| `canopi.tags.list(tagType, opts?)` | `tags:read:<tagType>` | Smart-tag posts as the viewer sees them; `limit` 1–50 (default 20), `scope: 'page' \| 'all'` |

Limits on every call:

- messages up to 64 KB (`TOO_LARGE`);
- at most 50 calls a second (`RATE_LIMITED`);
- each call times out after 15 seconds (`TIMEOUT`).

Errors reject with a `BridgeError` whose `code` is one of these:

- `PERMISSION_DENIED`, `BAD_REQUEST`, `QUOTA_EXCEEDED`, `RATE_LIMITED`, `TOO_LARGE`;
- `NOT_AVAILABLE`, `BUSY`, `USER_ACTION_REQUIRED`;
- `MODULE_DISABLED` (an admin switched your module off);
- `UNKNOWN_METHOD`, `HOST_ERROR`, `TIMEOUT`.

**Storage keys are capped at 100 characters, and URLs are often longer.** Don't use a raw page
URL as a key: hash it or shorten it first. The reference module `modules/page-notes` shows one
way: `modules/page-notes/note-key.js` keeps `note:<url>` when it fits and otherwise uses
`note:#<sha-256 of the URL>`.

## 3. Make your module

Copy the example to a working directory inside the repo (keep it out of your commits, or in your
own fork):

```bash
mkdir -p my-modules
cp -R examples/first-module/hello-page my-modules/hello-page
```

A module directory holds `manifest.json` plus the files of your tab:

```
my-modules/hello-page/
  manifest.json   the ManifestV2 that Canopi reviews
  index.html      entry file (tablication.entry.html)
  app.js          your code; imports ./tab-bridge.js
  style.css
```

You don't write `tab-bridge.js`. The build adds it (step 6), and the local preview serves it.

### 3.1 Make the manifest yours

Open `my-modules/hello-page/manifest.json`. Before you submit, change these fields:

| Field | Rule | Why it matters |
|---|---|---|
| `id` | `^[a-z0-9][a-z0-9.-]{2,63}$`, reverse-domain style (`dev.yourname.hello-page`) | The first account that submits an id owns it for good. Anyone else gets `module_owned_by_someone_else`. `live.canopi.*` is Canopi's own namespace |
| `tablication.tab.id` | Same pattern; end it in `-tab` (`yourname-hello-tab`) | A tab id is unique across every module: if another module has ever submitted it, you get `tab_id_taken`. Built-in ids are reserved (see the list below) |
| `author.name` | 1–80 chars, must **not** contain "canopi" in any case | Canopi refuses it (`author_name_reserved`), so a fake "Canopi" author can't be shown on your tab |
| `name`, `description` | 1–60 and 1–500 chars | Shown to the person, and to the admin who reviews it |
| `version` | semver (`0.1.0`) | Each submitted version is immutable. Every new submission needs a new version, even after a rejection |

Reserved tab ids: `discuss-tab`, `live-tab`, `visibility-tab`, `people-tab`, `agent-tab`,
`bookmarks-tab`, `patches-tab`, `settings-tab`, `manage-tab`, `rooms-tab`, `timelines-tab`,
`wayback-tab`, `vault-tab`, `sdk-tab`, `sidebar-tab`, `current-tab`, `data-tab`. The same names
without `-tab` are refused too (`discuss`, `live`, …).

The full manifest for a tablication:

```json
{
  "manifestVersion": 2,
  "kind": "tablication",
  "id": "dev.yourname.hello-page",
  "name": "Hello page",
  "version": "0.1.0",
  "description": "Shows the page you are on and remembers one page for you.",
  "author": { "name": "Your Name", "url": "https://your.site", "canopiHandle": "yourhandle" },
  "permissions": ["page:context", "storage:module", "ui:badge"],
  "network": { "connect": ["api.example.com"] },
  "tablication": {
    "tab": { "id": "yourname-hello-tab", "title": "Hello", "icon": "👋", "order": 70 },
    "entry": { "html": "index.html" },
    "contains": []
  }
}
```

Field limits:

- `author.url` must be `https://`.
- `canopiHandle` matches `^[a-z0-9_]{2,30}$`.
- `tab.title` is up to 30 characters, `icon` up to 8 characters (an emoji works), and `order` is
  0–1000 (default 50).
- `network.connect` takes up to 10 bare host names, with no scheme or path.
- `contains` lists up to 20 smart-tag types that you own. Leave `network` and `contains` out if
  you don't need them.
- No other keys are allowed (`additionalProperties: false`).

Permissions: `page:context`, `user:profile`, `storage:module`, `ui:badge`, `ui:openTab`,
`tags:compose`, `tags:read:<tagType>`. Ask only for what you call. Each one is shown to the
reviewer, and a call without its permission fails with `PERMISSION_DENIED`.

### 3.2 The code

`app.js` from the example, shortened:

```js
import { connect } from './tab-bridge.js';

const canopi = await connect();                     // waits for canopi.tab.init
setTheme(await canopi.theme.get());
canopi.theme.onChange(setTheme);
showPage(await canopi.page.getContext());           // { url, title } or null
canopi.page.onContextChange(showPage);

rememberButton.addEventListener('click', async () => {
  await canopi.storage.set('remembered', { url: page.url, title: page.title, savedAt: Date.now() });
  await canopi.ui.setBadge('1');
});
```

`index.html` loads it with `<script type="module" src="app.js"></script>`. Wrap `connect()` in
`try/catch` and show `e.code` on failure. It is the quickest way to see what went wrong.

## 4. Validate the manifest

`build-module.mjs` (step 6) validates the manifest before it builds. To validate on its own:

```bash
node -e "import('./packages/manifest/dist/index.js').then(({ validateManifest }) => { const r = validateManifest(JSON.parse(require('fs').readFileSync('my-modules/hello-page/manifest.json', 'utf8'))); console.log(JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings }, null, 2)); process.exit(r.ok ? 0 : 1); })"
```

`validateManifest` checks the schema and the rules every host enforces:

- no Canopi hosts in `network.connect`;
- no built-in tab ids (except for `live.canopi.*` ids).

**Canopi applies more rules on submit than `validateManifest` does.** The validator passes a
manifest with author "Canopi Labs" or an id under `live.canopi.`. It also lets the build pack a
`README.md` into the bundle. Canopi refuses all three. Run the precheck in step 6 before every
submit.

## 5. Preview it locally

No Canopi page loads your tab locally, so the repo ships a small stand-in host:

```bash
node examples/first-module/preview/serve.mjs my-modules/hello-page
# Previewing dev.yourname.hello-page@0.1.0 from …/my-modules/hello-page
# Open http://127.0.0.1:8790/  (Ctrl+C to stop)
```

Open `http://127.0.0.1:8790/`. You get a mock sidebar with your tab in it, and controls to:

- change the page URL and title (this fires `page.onContextChange`);
- toggle the theme;
- reload the app;
- see and clear module storage;
- watch every bridge call and its result.

What it copies from Canopi:

- the same `sandbox="allow-scripts"` frame;
- the bundle host's CSP, built from your `network.connect`, so an inline script fails here just
  like in Canopi;
- the bridge handshake;
- permission checks, storage key and 100 KB limits, badge truncation, message size and rate
  limits;
- closing the app if it navigates away;
- serving `tab-bridge.js` from `packages/tab-bridge/dist`;
- refusing file names or types that the bundle host would refuse.

What it doesn't do:

- there is no real Canopi: no sign-in, no smart-tag data (`tags.list` answers `[]`), and no
  composer (`tags.compose` logs what it would have opened);
- `user.getProfile` is always `@preview`;
- storage lives in the preview page's `localStorage`.

It's a fast loop for layout and bridge logic. The only proof that the tab works is
[7.6](#76-see-it-in-your-sidebar).

Other options:

- `--port 8791` serves on a different port.
- The same command previews the reference module:
  `node examples/first-module/preview/serve.mjs modules/page-notes`.

Opening `index.html` directly from disk does not work. The browser blocks module scripts on
`file://`, and even over `http://` nothing sends `canopi.tab.init`, so `connect()` rejects with
`TIMEOUT` after 10 seconds.

For unit tests, `@canopi-sdk/studio-kit` exports `createMockTab()`, an in-memory `CanopiTab`
built for tests. It doesn't go through `connect()`, so structure your code to accept a `canopi`
object if you want to use it. Unless you pass `enforcePermissions: true` it allows every call. It
does not apply the storage key or quota limits.

## 6. Build the submission

```bash
node scripts/build-module.mjs my-modules/hello-page
# dev.yourname.hello-page@0.1.0: 4 files -> my-modules/hello-page/dist/submission.json

node examples/first-module/preview/precheck.mjs my-modules/hello-page/dist/submission.json
# dev.yourname.hello-page@0.1.0: passes the submit-time rules checked here (11.3 KB request body)
```

`build-module.mjs` validates the manifest. It then base64-encodes every file at the **top level**
of the directory, except `manifest.json`, `dist/` and dotfiles, adds `tab-bridge.js`, and writes:

```json
{ "manifest": { … }, "bundle": { "files": { "app.js": "<base64>", "index.html": "…", "style.css": "…", "tab-bridge.js": "…" } } }
```

That file is the exact request body for submit (7.2).

Bundle rules (Canopi checks them on submit; `precheck.mjs` checks them locally):

- **Top-level files only.** `build-module.mjs` stops with `EISDIR` if the directory has a
  subdirectory, so keep images next to `index.html`.
- **Allowed types:** `html js mjs css json txt svg png jpg jpeg webp woff2`. Anything else, such
  as a `README.md`, `.map`, `.ico` or `.gif` file, is refused. Keep notes and source maps outside
  the module directory.
- **File names:** letters, digits, `_`, `-`, and exactly one extension. `app.min.js` is refused.
- At most 50 files and 1.5 MB of content. The JSON request body is limited to 2 MB, and base64
  adds a third to the size, so keep the bundle under about 1.4 MB.
- The entry file named in `tablication.entry.html` must be in the bundle.

`precheck.mjs` can't check what needs Canopi's data:

- whether you are invited;
- whether your module id or tab id is already taken;
- whether this version was already submitted;
- whether a smart tag in `contains` belongs to someone else.

## 7. Get it live

> **Status: verified against the code at canopi `850ccb8afdc3df6f9bcfc211e68cb4984cd65923`
> (staging, 2026-11-18), not run end to end yet.** No tablication has been published on staging
> or production yet. If a step doesn't behave as written, tell the Canopi team what you sent and
> the exact response.

The flow:

1. You **submit** a version. It is stored, immutable, as `pending`.
2. A Canopi admin **approves** it, and it becomes `published`.
3. You **enable** it for yourself.
4. Your sidebar shows it the next time it starts.

Nobody else sees your tab until they enable it themselves.

There is no web UI for these steps yet. Every call is plain HTTPS with a Bearer token, shown
here with `curl`.

### 7.1 Get a token for your account

The module API takes a **person's** token: an embed token from "Sign in with Canopi". Agent
tokens (`cag_…`) are refused with `403 {"error":"people_only"}`. Get an embed token with the
Canopi CLI. The second line keeps it in its own file, so it doesn't overwrite another login:

```bash
export CANOPI_API=https://staging.api.canopi.live          # or https://api.canopi.live
export CANOPI_CONFIG_FILE=$HOME/.config/canopi/sdk-staging.json
npx -y @canopi-sdk/cli@0.2.0 --base-url "$CANOPI_API" auth login
```

The CLI opens a browser window. Sign in there. It then prints your `userId` (your AppUser id;
send that to the Canopi team to be invited) and saves the token in `$CANOPI_CONFIG_FILE`. Load it
into your shell without printing it:

```bash
export CANOPI_TOKEN="$(node -p "require(process.env.CANOPI_CONFIG_FILE).token")"
```

Embed tokens expire. Run `npx -y @canopi-sdk/cli@0.2.0 auth refresh` (with the same
`CANOPI_CONFIG_FILE`), then reload the variable. Never commit the token or paste it into an issue.

### 7.2 Submit a version

```bash
curl -sS -X POST "$CANOPI_API/v1/sdk/modules/versions" \
  -H "Authorization: Bearer $CANOPI_TOKEN" -H "Content-Type: application/json" \
  --data-binary @my-modules/hello-page/dist/submission.json
```

- **Auth:** your embed token, and your account must be an invited submitter.
- **Body:** `{ "manifest": {…}, "bundle": { "files": { "<path>": "<base64>" } } }`, exactly what
  `build-module.mjs` wrote. Don't send your own hash: Canopi computes the bundle's sha256 itself.
- **201 Created:**

  ```json
  { "version": { "id": "<versionId uuid>", "moduleId": "dev.yourname.hello-page", "version": "0.1.0",
                 "status": "pending", "manifestSha256": "…", "parentVersionId": null, "provenanceHash": "…" },
    "warnings": [] }
  ```

  Keep `version.id`. The admin needs it to approve, and you need it to enable.

Errors are JSON `{ "error": "<code>", …details }`:

| Status | `error` | What it means / what to do |
|---|---|---|
| 401 | `Missing or invalid Authorization header`, or a token error | No token, or it expired: refresh it (7.1) |
| 403 | `people_only` | You sent an agent token (`cag_…`). Use your embed token |
| 403 | `not_an_invited_submitter` | Your account isn't invited on this environment. Ask the Canopi team, and give them your `userId` |
| 400 | `invalid_manifest` (+ `errors`) | Same errors as `validateManifest`. Run step 4 |
| 400 | `network_connect_canopi_host` (+ `host`) | A `*.canopi.live` host is in `network.connect`. Use the bridge |
| 400 | `a tablication version needs its bundle (bundle.files)` | You sent only the manifest. Send `dist/submission.json` |
| 400 | `invalid_bundle` (+ `detail`, `file`) | Bundle rule broken: bad path, type not allowed, too many files or bytes, missing entry, not base64. Run `precheck.mjs` |
| 403 | `module_id_reserved` | Your id starts with `live.canopi.` |
| 409 | `tab_id_reserved` (+ `tabId`) | Built-in tab id (see 3.1) |
| 400 | `author_name_reserved` | `author.name` contains "canopi" |
| 409 | `tab_id_taken` (+ `tabId`) | Another module has already submitted this tab id. Pick another |
| 403 | `contains_tag_of_another_owner` (+ `tagType`) | `contains` lists a smart tag that someone else publishes |
| 403 | `module_owned_by_someone_else` | Another account submitted this module id first. Use your own id (or fork with `lineage.forkedFrom`) |
| 409 | `module_kind_mismatch` | This id was first submitted as a different `kind` |
| 409 | `version_exists` (+ `version`) | This version was already submitted, even if it was rejected. Bump `version` |
| 413 | (body too large) | The request is over 2 MB. Shrink the bundle |
| 500 | `sdk_modules_failed` | Server error. Report it with the time |

### 7.3 Check its status

```bash
curl -sS "$CANOPI_API/v1/sdk/modules/dev.yourname.hello-page" -H "Authorization: Bearer $CANOPI_TOKEN"
```

The response lists `versions` (`id`, `version_label`, `status`, `manifest_sha256`, `bundle_sha256`,
`created_at`) and an append-only `events` log (`submitted`, `approved`, `rejected`, …, each with a
provenance hash). Statuses:

- `pending`: waiting for review.
- `published`: live.
- `rejected`.
- `superseded`: an older version after a newer one was approved.
- `disabled`: switched off by an admin.

Only the owner and Canopi admins see `pending` and `rejected` versions. This endpoint never
returns 401. If your token has expired, it answers as if you were anonymous, so your pending
version seems to be missing. Refresh the token and ask again.

`GET $CANOPI_API/v1/sdk/modules` (no auth) is the public catalogue of published modules.

### 7.4 Review (done by a Canopi admin)

Tell the Canopi team your module id and `version.id`. A Canopi super admin then does one of
these:

- **Approve:** `POST /v1/sdk/modules/versions/<versionId>/approve`, body `{ "note": "…" }`
  (optional). The version becomes `published`, and the module's previous published version
  becomes `superseded`.
- **Reject:** `POST /v1/sdk/modules/versions/<versionId>/reject`, body `{ "note": "…" }`. Fix
  the problem and submit a new version.

Both answer `409 version_<status>` if the version is no longer `pending`.

### 7.5 Enable it for yourself

```bash
curl -sS -X POST "$CANOPI_API/v1/sdk/modules/versions/<versionId>/acceptance" \
  -H "Authorization: Bearer $CANOPI_TOKEN" -H "Content-Type: application/json" \
  -d '{"state":"accepted"}'
```

- **Body:** `{ "state": "accepted" }` turns the module on for you, and `{ "state": "rejected" }`
  turns it off. You enable for yourself only (`overlayKind` defaults to `"person"`). Enabling for
  a community is Canopi-admin only for now (`403 community_acceptance_requires_admin`).
- **200:**

  ```json
  { "acceptance": { "moduleId": "…", "versionId": "…", "overlayKind": "person", "overlayId": "<your userId>", "state": "accepted" } }
  ```

- **Errors:**
  - `409 version_pending` (not approved yet), `version_rejected`, `version_disabled`;
  - `404 version_not_found`;
  - `400 state must be accepted or rejected`.

To check what your sidebar will load:

```bash
curl -sS "$CANOPI_API/v1/sdk/modules/mine" -H "Authorization: Bearer $CANOPI_TOKEN"
```

It lists the published tablications you enabled, each with its `bundleSha256` and `manifest`.

### 7.6 See it in your sidebar

The sidebar asks for `GET /v1/sdk/modules/mine` **once, when it starts**. After you enable a
module, close and reopen the Canopi side panel. Use a
sidebar that talks to the same environment you published to, and sign it in with the same
account.

Your tab appears in the tab ribbon with your `title` and `icon`, at your `order` (default 50).
Opening it shows the label `<name> · App by <author.name>` above your frame. The frame loads from
`https://apps.canopi.live/<bundleSha256>/index.html` (staging:
`https://staging.apps.canopi.live/…`).

If the tab doesn't appear:

- `GET /v1/sdk/modules/mine` is empty: the version isn't approved, or you enabled a different
  account than the one the sidebar is signed in with.
- The module or tab id is on the kill list.
- The tab id clashes with a built-in tab.
- The sidebar talks to a different environment.

### 7.7 Ship an update

1. Bump `version`, rebuild, run the precheck, and submit again.
2. When the admin approves the new version, it replaces the old one for **everyone who enabled
   the module**. They don't need to enable it again. Approval is per version, so every update
   goes through review.

The bundle host caches files for up to 5 minutes.

### 7.8 Kill switch (Canopi admin)

A Canopi admin can switch a module off everywhere:

- **Disable:** `POST /v1/sdk/modules/<moduleId>/disable`, body `{ "reason": "…" }`. This marks the
  published version `disabled` and puts the module id and its tab id on the kill list. The bundle
  stops being served. Open sidebars close the tab within about 45 seconds, and bridge calls answer
  `MODULE_DISABLED`.
- **Enable:** `POST /v1/sdk/modules/<moduleId>/enable` brings back the latest disabled version.

While a module is disabled, a newly approved version stays hidden too. Talk to the Canopi team.

## 8. Trust rules you must know

- **Invited submitters only.** During the pilot, each environment has its own invite list, kept
  by Canopi admins. Every version is reviewed before anyone can turn it on.
- **Ids are claimed on first submit.** The account that first submits a module id owns it, and
  only that account can submit new versions. A tab id belongs to the first module that submits
  it. Anyone else forks under a new id (`lineage.forkedFrom`).
- **Versions are immutable and pinned.** Canopi stores the manifest's sha256 and computes the
  bundle's content address itself. The bundle host serves only the files of a currently published
  version. Each action (submit, approve, reject, supersede, disable, enable, accept) is written to
  an append-only event log with a provenance hash.
- **Canopi's name is Canopi's.** You can't use `live.canopi.*` ids, an author name containing
  "canopi", or built-in tab ids. You also can't claim Canopi's tag types (`post`, `patch`,
  `insert`, `bridge`, `pro-human-ai`, `discuss`, `task`, `quote`, `question`, `tag`, `reply`).
- **Your tab gets no credentials.** Nothing that can authenticate as the person ever crosses the
  bridge. Don't ask people to paste Canopi tokens into your tab.
- **Privacy:** who enabled your module is private, even from you. The event log shows other
  people only the kind of decision.
- **Kill switch:** Canopi can switch any module off at once (7.8).

## 9. Troubleshooting

| You see | Cause |
|---|---|
| `Could not connect to Canopi (TIMEOUT)` | Nothing sent `canopi.tab.init`: you opened the file outside a host. Use the preview (step 5) |
| `PERMISSION_DENIED` from a call | The permission for that call is missing from `manifest.permissions` |
| `BAD_REQUEST: storage.set needs a key (1-100 chars)` | Empty key, or longer than 100 characters (often a URL used as a key) |
| Script doesn't run, console shows a CSP error | Inline `<script>` or `on…=` attribute, or a script from another host |
| `fetch` fails with a CSP or CORS error | Host not in `network.connect`, or the server doesn't allow `Origin: null` |
| `SecurityError` on `localStorage` | Expected in the sandbox: use `canopi.storage` |
| Tab closes with "left its page and was closed" | Your frame navigated (a link without `target="_blank"`, `location.href = …`, a form) |
| `build-module.mjs`: `ENOENT … packages/tab-bridge/dist/index.js` | Run it from the repo root, after `npm run build` |
| `build-module.mjs`: `EISDIR` | The module directory has a subdirectory: keep every file at the top level |

## 10. Optional: start from Canopi Studio

If you are adapting an existing web app, Canopi Studio can propose a tab design, build a clickable
preview with mock data, and scaffold a module directory for you. You can run it with Claude Code
in this repo (`.claude/skills/canopi-studio/SKILL.md`, `/canopi-studio <url>`), or use the helpers
directly:

```bash
S=.claude/skills/canopi-studio/scripts/studio.mjs
node $S scaffold <slug> --author "Your Name" --embedded   # writes studio/<slug>/draft/<slug>-tab/
```

The scaffold writes a `README.md` into the tab directory, and Canopi refuses `.md` files in a
bundle. Move the README out before you build:

```bash
mv studio/<slug>/draft/<slug>-tab/README.md studio/<slug>/<slug>-tab-README.md
node scripts/build-module.mjs studio/<slug>/draft/<slug>-tab
node examples/first-module/preview/precheck.mjs studio/<slug>/draft/<slug>-tab/dist/submission.json
```

Then continue from step 5 with that directory.

## Next steps

- Read `modules/page-notes`. It also reads smart-tag posts (`tags.list`) and opens the composer
  (`tags.compose`) for a smart tag it contains (`modules/page-note-tag`).
- The manifest schema is in `packages/manifest/src/schema.ts`, and the bridge client in
  `packages/tab-bridge/src/index.ts`.
