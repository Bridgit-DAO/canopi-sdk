// Storage keys for page notes. The host's storage.set takes keys of 1-100 characters
// (canopi presence/src/sdk/tablicationHost.ts), and page URLs are often longer.
//
// - A URL whose `note:<url>` key fits stays readable and keeps the key Page notes 1.0/1.1 used.
// - A longer URL gets `note:#<sha-256 of the URL, 64 hex>` (70 characters). URLs never start
//   with '#', so the two forms cannot collide. Older versions could never save these notes,
//   so there is nothing to migrate.
export const MAX_KEY_LENGTH = 100;

export async function noteKeyFor(url) {
  if (!url) return null;
  const readable = `note:${url}`;
  if (readable.length <= MAX_KEY_LENGTH) return readable;
  if (!globalThis.crypto || !globalThis.crypto.subtle) return null; // no secure context: cannot key it
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `note:#${hex}`;
}
