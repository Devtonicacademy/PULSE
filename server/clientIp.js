import net from 'node:net';

const stripV4Mapped = (ip) => ip.replace(/^::ffff:/i, '');

/** Addresses that mean "this machine / this network": never a visitor's real, public address */
export function isPrivateAddress(ip) {
  if (!ip || !net.isIP(ip)) return true;
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

const asIp = (value) => {
  if (typeof value !== 'string') return null;
  const ip = stripV4Mapped(value.trim());
  return net.isIP(ip) ? ip : null;
};

/**
 * The visitor's own address. Behind Railway (or any proxy) `req.ip` is the proxy's hop, not the
 * visitor, so: Railway's X-Real-IP first, then the first public address in X-Forwarded-For, then
 * whatever Express worked out. A non-public result is returned as is so callers can refuse it.
 */
export function clientIp(req) {
  const real = asIp(req.headers?.['x-real-ip']);
  if (real && !isPrivateAddress(real)) return real;

  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '')
    .split(',')
    .map(asIp)
    .find((ip) => ip && !isPrivateAddress(ip));
  if (forwarded) return forwarded;

  return asIp(req.ip) ?? real ?? '';
}
