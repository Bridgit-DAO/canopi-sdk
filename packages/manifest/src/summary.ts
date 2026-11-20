/**
 * Plain-text summary for a smart-tag instance (`messages.content`; spec §2.8). Search,
 * notifications, moderation and clients that don't know the tag show this text. Output is
 * plain text: no HTML is produced, and control characters are dropped.
 */
export const SUMMARY_MAX_CHARS = 2000;

export function renderSummary(template: string, data: Record<string, unknown>): string {
  const text = template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_m, name: string) => {
    const v = data[name];
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
    if (typeof v === 'object') return '';
    return String(v);
  });
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX_CHARS);
}
