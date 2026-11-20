import { describe, expect, it } from 'vitest';
import { StateManager, TimingUtils } from './index.js';

describe('@canopi-sdk/shared (F5: consumable as a package)', () => {
  it('exports TimingUtils and StateManager', () => {
    expect(typeof TimingUtils.safeInitialize).toBe('function');
    expect(typeof StateManager).toBe('function');
  });
});
