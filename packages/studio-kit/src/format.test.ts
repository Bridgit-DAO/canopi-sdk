import { describe, expect, it } from 'vitest';
import { fieldLabel, formatNumber, formatTimestamp, humanizeField, schemaAtPath, schemaOfField } from './format.js';

describe('humanizeField', () => {
  it('reads like the Canopi host popover labels', () => {
    expect(humanizeField('lengthKm')).toBe('Length (km)');
    expect(humanizeField('elevation_gain_m')).toBe('Elevation gain (m)');
    expect(humanizeField('vehicleDeckPercent')).toBe('Vehicle deck (%)');
    expect(humanizeField('isbn_13')).toBe('ISBN 13');
    expect(humanizeField('updatedAt')).toBe('Updated at');
    expect(humanizeField('owner.name')).toBe('Name');
    expect(humanizeField('len', { title: 'Route length', unit: 'km' })).toBe('Route length (km)');
  });
  it('an explicit label wins, then the schema title', () => {
    expect(fieldLabel('lengthKm', 'Distance')).toBe('Distance');
    expect(fieldLabel('len', undefined, { title: 'Length', 'x-unit': 'mi' })).toBe('Length (mi)');
    expect(fieldLabel('lengthKm', '')).toBe('Length (km)');
  });
});

describe('formatNumber', () => {
  it('groups quantities', () => {
    expect(formatNumber(186000)).toBe('186,000');
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(12, { name: 'captures' })).toBe('12');
    expect(formatNumber(1250, { name: 'elevation_gain_m' })).toBe('1,250');
  });
  it('leaves year-like integers, ids, codes and string-typed fields alone', () => {
    expect(formatNumber(1897)).toBe('1897');
    expect(formatNumber(2026, { name: 'count' })).toBe('2026');
    expect(formatNumber(48213, { name: 'userId' })).toBe('48213');
    expect(formatNumber(94110, { name: 'zip_code' })).toBe('94110');
    expect(formatNumber(4155550100, { name: 'phone' })).toBe('4155550100');
    expect(formatNumber(1897123, { name: 'firstPublishYear' })).toBe('1897123');
    expect(formatNumber(123456, { name: 'n', schema: { type: 'string' } })).toBe('123456');
  });
  it('respects an explicit format, in props or the schema', () => {
    expect(formatNumber(5000, { format: 'integer' })).toBe('5,000');
    expect(formatNumber(1999.6, { format: 'integer' })).toBe('2,000');
    expect(formatNumber(123456, { format: 'plain' })).toBe('123456');
    expect(formatNumber(123456, { schema: { type: 'integer', format: 'plain' } })).toBe('123456');
    expect(formatNumber(1999, { format: 'number', name: 'year' })).toBe('1999');
  });
  it('a 14-digit capture stamp reads as a date unless the field is an id', () => {
    expect(formatNumber(20261111014936)).toBe('Nov 11, 2026, 01:49 UTC');
    expect(formatNumber(20261111014936, { name: 'orderId' })).toBe('20261111014936');
  });
});

describe('formatTimestamp', () => {
  it('formats compact capture stamps and ISO date-times', () => {
    expect(formatTimestamp('20261111014936')).toBe('Nov 11, 2026, 01:49 UTC');
    expect(formatTimestamp('20040617175454')).toBe('Jun 17, 2004, 17:54 UTC');
    expect(formatTimestamp('2026-11-01T09:30:00Z')).toBe('Nov 1, 2026, 09:30 UTC');
    expect(formatTimestamp('2026-11-01T09:30:00+02:00')).toBe('Nov 1, 2026, 07:30 UTC');
    expect(formatTimestamp('2026-11-01T09:30')).toBe('Nov 1, 2026, 09:30');
  });
  it('leaves anything ambiguous alone', () => {
    for (const v of ['19960101', '2026-11-01', '20261340014936', '20260230120000', '12345678901234', 'v20261111014936', '2026-11-01T25:00:00Z', 'hello', 1897])
      expect(formatTimestamp(v)).toBeNull();
  });
});

describe('schema lookup', () => {
  const schema = { type: 'object', properties: { years: { type: 'array', items: { type: 'object', properties: { year: { type: 'string' }, owner: { type: 'object', properties: { id: { type: 'integer' } } } } } } } };
  it('follows binding paths and dotted fields', () => {
    const item = schemaAtPath(schema, '$.years[*]');
    expect(schemaOfField(item, 'year')).toEqual({ type: 'string' });
    expect(schemaOfField(item, 'owner.id')).toEqual({ type: 'integer' });
    expect(schemaOfField(schemaAtPath(schema, '$.years'), 'year')).toEqual({ type: 'string' });
    expect(schemaAtPath(schema, '$.nope.x')).toBeUndefined();
    expect(schemaAtPath(undefined, '$')).toBeUndefined();
  });
});
