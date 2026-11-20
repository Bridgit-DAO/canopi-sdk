/**
 * The JSONPath subset used in `component.binding.path`:
 *   $            the whole response
 *   .name        a property (letters, digits, _ $ -)
 *   ['name']     a property, quoted (single or double quotes)
 *   [0]          an array index (non-negative)
 *   [*] or .*    every element / value (the result is then always an array)
 * Nothing else (no filters, slices, recursive descent or scripts).
 */

export type PathSegment = { kind: 'key'; key: string } | { kind: 'index'; index: number } | { kind: 'wildcard' };

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$-]*/;

/** Parse a binding path. Throws an Error naming the position for anything outside the subset. */
export function parseBindingPath(path: string): PathSegment[] {
  if (typeof path !== 'string' || !path.startsWith('$')) throw new Error('binding path must start with "$"');
  const out: PathSegment[] = [];
  let i = 1;
  while (i < path.length) {
    const rest = path.slice(i);
    if (rest.startsWith('.*')) { out.push({ kind: 'wildcard' }); i += 2; continue; }
    if (rest[0] === '.') {
      const m = IDENT.exec(rest.slice(1));
      if (!m) throw new Error(`bad property name at ${i + 1} in "${path}"`);
      out.push({ kind: 'key', key: m[0] });
      i += 1 + m[0].length;
      continue;
    }
    if (rest[0] === '[') {
      const m = /^\[(?:(\*)|(\d+)|'([^'\\]*)'|"([^"\\]*)")\]/.exec(rest);
      if (!m) throw new Error(`unsupported bracket at ${i} in "${path}"`);
      if (m[1]) out.push({ kind: 'wildcard' });
      else if (m[2] !== undefined) out.push({ kind: 'index', index: Number(m[2]) });
      else out.push({ kind: 'key', key: (m[3] ?? m[4]) as string });
      i += m[0].length;
      continue;
    }
    throw new Error(`unexpected "${rest[0]}" at ${i} in "${path}"`);
  }
  return out;
}

/** True when the path is inside the subset. */
export function isValidBindingPath(path: string): boolean {
  try { parseBindingPath(path); return true; } catch { return false; }
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Resolve a binding path against data. Without a wildcard: the value, or undefined.
 * With a wildcard: an array of every match (missing matches are dropped).
 */
export function resolveBinding(data: unknown, path: string): unknown {
  const segs = parseBindingPath(path);
  const multi = segs.some((s) => s.kind === 'wildcard');
  let current: unknown[] = [data];
  for (const s of segs) {
    const next: unknown[] = [];
    for (const v of current) {
      if (v === null || typeof v !== 'object') continue;
      if (s.kind === 'wildcard') next.push(...(Array.isArray(v) ? v : Object.values(v)));
      else if (s.kind === 'index') { if (Array.isArray(v) && s.index < v.length) next.push(v[s.index]); }
      else if (!Array.isArray(v) && own(v, s.key)) next.push((v as Record<string, unknown>)[s.key]);
    }
    current = next;
  }
  return multi ? current : current[0];
}

/** A field inside one bound item: "name" or a dotted path "owner.name" (own properties only). */
export function getField(item: unknown, field: string | undefined): unknown {
  if (!field) return item;
  let v: unknown = item;
  for (const part of field.split('.')) {
    if (v === null || typeof v !== 'object' || Array.isArray(v) || !own(v, part)) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}
