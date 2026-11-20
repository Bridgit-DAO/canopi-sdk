import { describe, expect, it } from 'vitest';
import { getField, isValidBindingPath, parseBindingPath, resolveBinding } from './binding.js';

const data = { items: [{ name: 'a', owner: { name: 'Ann' } }, { name: 'b' }], 'odd key': 7, account: { arr: 10 } };

describe('binding paths', () => {
  it('resolves the subset', () => {
    expect(resolveBinding(data, '$')).toBe(data);
    expect(resolveBinding(data, '$.account.arr')).toBe(10);
    expect(resolveBinding(data, "$['odd key']")).toBe(7);
    expect(resolveBinding(data, '$["account"]["arr"]')).toBe(10);
    expect(resolveBinding(data, '$.items[1].name')).toBe('b');
    expect(resolveBinding(data, '$.items[*]')).toEqual(data.items);
    expect(resolveBinding(data, '$.items[*].name')).toEqual(['a', 'b']);
    expect(resolveBinding(data, '$.items[*].owner.name')).toEqual(['Ann']);
    expect(resolveBinding(data, '$.account.*')).toEqual([10]);
  });

  it('missing values are undefined (or an empty array with a wildcard)', () => {
    expect(resolveBinding(data, '$.nope.deeper')).toBeUndefined();
    expect(resolveBinding(data, '$.items[9]')).toBeUndefined();
    expect(resolveBinding(null, '$.items[*]')).toEqual([]);
    expect(resolveBinding(data, '$.constructor')).toBeUndefined();
    expect(resolveBinding(data, '$.items.length')).toBeUndefined();
  });

  it('refuses anything outside the subset', () => {
    for (const p of ['items', '$..name', '$.items[?(@.x)]', '$.items[0:2]', '$.items[-1]', '$.', '$[x]', '$.a b']) {
      expect(isValidBindingPath(p), p).toBe(false);
    }
    expect(() => parseBindingPath('$..x')).toThrow(/property name/);
  });

  it('getField reads dotted own properties', () => {
    expect(getField(data.items[0], 'owner.name')).toBe('Ann');
    expect(getField(data.items[0], undefined)).toBe(data.items[0]);
    expect(getField({}, 'toString')).toBeUndefined();
  });
});
