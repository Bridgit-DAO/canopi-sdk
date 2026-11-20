/** Audit F7: importing the sidebar SDK must not start anything, set globals or leave timers. */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('sidebar-sdk import has no side effects (F7)', () => {
  it('no window globals, no listeners, no timers at import', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const mod = await import('./index.js');
    expect('CanopiSDK' in window).toBe(false);
    expect(add).not.toHaveBeenCalled();
    expect(docAdd).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(typeof mod.initializeSidebarSDK).toBe('function');
    expect(mod.getPageContextManager()).toBe(mod.getPageContextManager()); // lazy singleton
  });

  it('cleanup() clears the 30 s health-check interval', async () => {
    const { SDKInitializer } = await import('./SDKInitializer.js');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const init = new SDKInitializer({ enableTabController: false, enableMessageListeners: false, initializationDelay: 0 });
    await init.initialize();
    init.cleanup();
    expect(clear).toHaveBeenCalled();
  });
});
