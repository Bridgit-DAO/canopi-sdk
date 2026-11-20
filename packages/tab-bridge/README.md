# @canopi-sdk/tab-bridge

The client a [Canopi](https://canopi.live) tablication (a sidebar tab) uses to talk to Canopi: the
`canopi.tab` bridge, version 1.

A tablication runs in a sandboxed frame with no access to Canopi's cookies, storage or page. The
host hands it a private message channel once; every call then goes over that channel and is
checked against the permissions in the module's manifest and what the person granted.

```bash
npm install @canopi-sdk/tab-bridge
```

```js
import { connect } from '@canopi-sdk/tab-bridge';

const canopi = await connect();                  // waits for the host's handshake
const page = await canopi.page.getContext();     // { url, title } or null
canopi.page.onContextChange((ctx) => render(ctx));
await canopi.storage.set('greeting', 'hello');   // keys are 1–100 characters
await canopi.ui.setBadge('1');
```

What `connect()` returns:

| Area | Calls |
|---|---|
| `page` | `getContext()`, `onContextChange(cb)` |
| `user` | `getProfile()` |
| `storage` | `get(key?)`, `set(key, value)` |
| `theme` | `get()`, `onChange(cb)` |
| `ui` | `setBadge(text)`, `openTab(tabId)` |
| `tags` | `compose(tagType, data)`, `list(tagType, opts?)` |

Failed calls reject with a `BridgeError` with a `code`, for example `PERMISSION_DENIED`,
`QUOTA_EXCEEDED`, `RATE_LIMITED`, `USER_ACTION_REQUIRED` (`tags.compose` must follow a click or key
press) or `MODULE_DISABLED` (Canopi switched the module off). The guide lists every code.

To build, preview and submit a module, follow
[Your first Canopi tablication](https://github.com/Bridgit-DAO/canopi-sdk/blob/master/docs/FIRST_MODULE.md).

Apache-2.0. Source: [Bridgit-DAO/canopi-sdk](https://github.com/Bridgit-DAO/canopi-sdk/tree/master/packages/tab-bridge).
