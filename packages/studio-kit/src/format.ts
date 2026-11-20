/**
 * Display formatting for the sidebar kit: field labels, numbers and timestamps. Pure functions
 * (no DOM), shared by the renderers. The label rule matches the Canopi host's popover labels.
 */
import { parseBindingPath } from './binding.js';

type JsonSchema = Record<string, unknown>;

/** What the renderer knows about the field a value came from. */
export interface FieldHint {
  /** The field name (last segment of a dotted field). */
  name?: string;
  /** The field's JSON Schema in the bound source's response schema, when known. */
  schema?: JsonSchema;
  /** An explicit `format` prop of the component. */
  format?: string;
}

const isObj = (v: unknown): v is JsonSchema => !!v && typeof v === 'object' && !Array.isArray(v);

const UNITS: Record<string, string> = { km: 'km', mi: 'mi', m: 'm', cm: 'cm', mm: 'mm', kg: 'kg', g: 'g', lb: 'lb', ms: 'ms', sec: 's', secs: 's', seconds: 's', min: 'min', mins: 'min', minutes: 'min', hours: 'h', hrs: 'h', days: 'days', pct: '%', percent: '%', percentage: '%', usd: 'USD', eur: 'EUR', gbp: 'GBP', kwh: 'kWh', mph: 'mph', kmh: 'km/h' };
const ACRONYMS = new Set(['id', 'url', 'uri', 'api', 'isbn', 'doi', 'sku', 'ip', 'gps', 'eta', 'faq', 'pdf', 'html', 'json', 'utc', 'vin', 'iata', 'icao', 'olid', 'oclc', 'lccn', 'http']);

function fieldWords(field: string): string[] {
  return String(field || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/**
 * A field name as a label, the same rule as the Canopi host: a schema title (+ unit) wins;
 * otherwise "lengthKm" → "Length (km)", "elevation_gain_m" → "Elevation gain (m)",
 * "isbn_13" → "ISBN 13", "updatedAt" → "Updated at".
 */
export function humanizeField(field: string, hint: { title?: unknown; unit?: unknown } = {}): string {
  const unit = typeof hint.unit === 'string' && hint.unit.trim() ? hint.unit.trim() : '';
  if (typeof hint.title === 'string' && hint.title.trim()) return `${hint.title.trim().slice(0, 60)}${unit ? ` (${unit})` : ''}`;
  const parts = fieldWords(field.split('.').pop() ?? '');
  if (!parts.length) return '';
  let u = unit;
  if (parts.length > 1 && UNITS[parts[parts.length - 1].toLowerCase()]) { const w = UNITS[parts.pop()!.toLowerCase()]; if (!u) u = w; }
  const words = parts.map((p, i) => (ACRONYMS.has(p.toLowerCase()) ? p.toUpperCase() : i === 0 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()));
  return `${words.join(' ')}${u ? ` (${u})` : ''}`.slice(0, 60);
}

/** The label for a field: an explicit label, else the schema's title/unit, else humanised. */
export function fieldLabel(field: string, label: unknown, schema?: JsonSchema): string {
  if (typeof label === 'string' && label.trim()) return label;
  return humanizeField(field, { title: schema?.title, unit: schema?.['x-unit'] ?? schema?.unit });
}

/** The sub-schema at a binding path (`$.items[*]`, `$.a.b[0]`), or undefined. */
export function schemaAtPath(schema: unknown, path: string): JsonSchema | undefined {
  let node: unknown = schema;
  let segs;
  try { segs = parseBindingPath(path || '$'); } catch { return undefined; }
  for (const s of segs) {
    if (!isObj(node)) return undefined;
    if (s.kind === 'key') node = isObj(node.properties) ? node.properties[s.key] : undefined;
    else node = isObj(node.items) ? node.items : isObj(node.additionalProperties) ? node.additionalProperties : undefined;
  }
  return isObj(node) ? node : undefined;
}

/** The schema of `field` (dots for nesting) inside an item schema; steps into arrays. */
export function schemaOfField(itemSchema: JsonSchema | undefined, field: string | undefined): JsonSchema | undefined {
  if (!itemSchema || !field) return undefined;
  let node: unknown = itemSchema;
  for (const key of field.split('.')) {
    if (isObj(node) && node.type === 'array' && isObj(node.items)) node = node.items;
    node = isObj(node) && isObj(node.properties) ? node.properties[key] : undefined;
  }
  return isObj(node) ? node : undefined;
}

// ---- timestamps ----

const COMPACT = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;

function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (y < 1900 || y > 2199 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

const DT_UTC = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * A readable date/time for values that are unambiguously timestamps: a 14-digit capture stamp
 * (YYYYMMDDhhmmss, UTC, as the Wayback Machine writes them) or an ISO 8601 date-time. Null otherwise.
 */
export function formatTimestamp(v: unknown): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  let m = COMPACT.exec(s);
  if (m) {
    const [y, mo, d, h, mi, sec] = m.slice(1).map(Number);
    if (!validParts(y, mo, d, h, mi, sec)) return null;
    return `${DT_UTC.format(Date.UTC(y, mo - 1, d, h, mi, sec))} UTC`;
  }
  if (typeof v !== 'string') return null;
  m = ISO_DATETIME.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const sec = Number(m[6] ?? 0);
  if (!validParts(y, mo, d, h, mi, sec)) return null;
  if (!m[7]) return DT_UTC.format(Date.UTC(y, mo - 1, d, h, mi, sec)); // no zone: show the wall-clock time as written
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : `${DT_UTC.format(t)} UTC`;
}

// ---- numbers ----

/** Words in a field name that mean "an identifier, not a quantity": never digit-grouped. */
const NO_GROUP_WORDS = new Set(['id', 'ids', 'year', 'years', 'yr', 'code', 'codes', 'zip', 'zipcode', 'postcode', 'postal', 'phone', 'tel', 'fax', 'isbn', 'issn', 'ean', 'upc', 'sku', 'olid', 'oclc', 'lccn', 'pin', 'ref', 'key', 'version', 'timestamp']);

/** The NO_GROUP_WORDS that name an identifier, not a time: a 14-digit id is never read as a capture stamp. */
const ID_WORDS = new Set([...NO_GROUP_WORDS].filter((w) => w !== 'timestamp'));

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 });
const groupedText = (v: number) => GROUPED.format(v);

/** True when a number from this field should be written without thousands separators. */
export function isPlainNumber(v: number, hint: FieldHint = {}): boolean {
  const own = hint.format === 'plain' || hint.format === 'year' || hint.format === 'integer' ? hint.format : '';
  const fromSchema = hint.schema?.['x-format'] ?? hint.schema?.format;
  const fmt = own || (typeof fromSchema === 'string' ? fromSchema : '');
  if (fmt === 'plain' || fmt === 'year') return true;
  if (fmt === 'integer') return false;
  const t = hint.schema?.type;
  if (t === 'string' || (Array.isArray(t) && t.includes('string') && !t.includes('number') && !t.includes('integer'))) return true;
  const words = hint.name ? fieldWords(hint.name) : [];
  if (words.some((w) => NO_GROUP_WORDS.has(w.toLowerCase()))) return true;
  // A measured field ("elevation_gain_m", "lengthKm") is a quantity even in the 1000–2999 range.
  if (words.length > 1 && UNITS[words[words.length - 1].toLowerCase()]) return false;
  return Number.isInteger(v) && v >= 1000 && v <= 2999;
}

/** A number as display text: digit-grouped only when it is a quantity (see isPlainNumber). */
export function formatNumber(v: number, hint: FieldHint = {}): string {
  if (!Number.isFinite(v)) return '';
  const fmt = hint.format;
  const idLike = !!hint.name && fieldWords(hint.name).some((w) => ID_WORDS.has(w.toLowerCase()));
  if (fmt !== 'integer' && fmt !== 'plain' && fmt !== 'year' && !idLike) {
    const ts = formatTimestamp(v);
    if (ts) return ts;
  }
  if (isPlainNumber(v, hint)) return String(v);
  return groupedText(fmt === 'integer' ? Math.round(v) : v);
}
