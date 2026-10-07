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
 * (blocks javascript:, data: and malformed URLs).
 */
export function safeImageUrl(url: string | undefined, fallback: string): string {
  try {
    const parsed = new URL(url ?? '');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escapeHtml(parsed.href);
    }
  } catch {
    // fall through to fallback
  }
  return escapeHtml(fallback);
}
