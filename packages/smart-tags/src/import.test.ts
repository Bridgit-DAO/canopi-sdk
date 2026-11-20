/** Audit F6/F7: smart-tags imports without throwing, sets no globals, and creates managers on demand. */
import { describe, expect, it } from 'vitest';

describe('smart-tags entry point', () => {
  it('imports cleanly and initializeSmartTags() returns a manager without touching window (F6, F7)', async () => {
    const mod = await import('./index.js');
    expect('CanopiSmartTags' in window).toBe(false);
    const m = mod.initializeSmartTags();
    expect(m).toBeInstanceOf(mod.SmartTagManager);
    expect('CanopiSmartTags' in window).toBe(false);
    expect(mod.getSmartTagById('discuss')?.id).toBe('discuss'); // host calls it 'post': registry drift F10, fixed when first-party tags move into the SDK
  });
});
