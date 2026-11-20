import { describe, expect, it } from 'vitest';
import { connect, BridgeError } from './index.js';

function handshake(opts: { source?: unknown; v?: number; withPort?: boolean } = {}) {
  const ch = new MessageChannel();
  const init = { type: 'canopi.tab.init', v: opts.v ?? 1, moduleId: 'org.example.notes', permissions: ['page:context'], theme: 'dark' };
  window.dispatchEvent(new MessageEvent('message', { data: init, source: (opts.source ?? window.parent) as Window, ports: opts.withPort === false ? [] : [ch.port2] }));
  return ch.port1;
}

describe('@canopi-sdk/tab-bridge connect()', () => {
  it('accepts the handshake only from the parent window, with a port', async () => {
    const p = connect({ timeoutMs: 200 });
    handshake({ source: {} as Window }); // some other window: ignored
    handshake({ withPort: false });       // no port: ignored
    const host = handshake();
    const canopi = await p;
    expect(canopi.moduleId).toBe('org.example.notes');
    expect(canopi.permissions).toEqual(['page:context']);
    canopi.close(); host.close();
  });

  it('refuses a host speaking another bridge version', async () => {
    const p = connect({ timeoutMs: 200 });
    handshake({ v: 2 });
    await expect(p).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('round-trips calls, errors and events over the port', async () => {
    const p = connect({ timeoutMs: 200 });
    const host = handshake();
    host.onmessage = (e) => {
      const { id, method } = e.data;
      if (method === 'page.getContext') host.postMessage({ id, result: { url: 'https://example.org/a', title: 'A' } });
      else host.postMessage({ id, error: { code: 'PERMISSION_DENIED', message: 'missing permission user:profile' } });
    };
    const canopi = await p;
    expect(await canopi.page.getContext()).toEqual({ url: 'https://example.org/a', title: 'A' });
    const err = await canopi.user.getProfile().catch((x) => x);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.code).toBe('PERMISSION_DENIED');
    const seen: unknown[] = [];
    canopi.page.onContextChange((c) => seen.push(c));
    host.postMessage({ event: 'page.contextChanged', data: { url: 'https://example.org/b', title: 'B' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([{ url: 'https://example.org/b', title: 'B' }]);
    canopi.close(); host.close();
  });

  it('times out when no host answers', async () => {
    await expect(connect({ timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
