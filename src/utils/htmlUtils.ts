/**
 * Helpers for building map marker markup with innerHTML.
 * Moment fields come from other users (Firestore), so never interpolate them raw.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Returns an escaped http(s) URL safe for a src attribute, or the fallback
 * (blocks javascript:, data: and malformed URLs). Photos uploaded to the PULSE server are
 * relative `/photos/...` paths and resolve against the current origin.
 */
export function safeImageUrl(url: string | undefined, fallback: string): string {
  try {
    const isOwnPhoto = typeof url === 'string' && /^\/photos\/[A-Za-z0-9]+\/[0-9a-f-]{36}\.(webp|jpg)$/.test(url);
    const parsed = isOwnPhoto ? new URL(url as string, window.location.origin) : new URL(url ?? '');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escapeHtml(parsed.href);
    }
  } catch {
    // fall through to fallback
  }
  return escapeHtml(fallback);
}
