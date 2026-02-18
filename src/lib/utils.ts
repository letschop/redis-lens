import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Mask the middle portion of a hostname for display.
 * "redis-prod-9opg54eb9hcx.letschop.io" → "red****cx.letschop.io"
 * "192.168.1.100" → "192****100"
 * "localhost" → "loc****st"
 */
export function maskHost(host: string): string {
  // IP addresses: mask the middle octets
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const octets = host.split('.');
    return octets[0] + '.***.***.' + octets[3];
  }

  const parts = host.split('.');

  // Simple hostname like "localhost" — mask middle
  if (parts.length <= 1) {
    if (host.length <= 6) return host;
    return host.slice(0, 3) + '****' + host.slice(-2);
  }

  // Two parts like "example.com" — mask first part
  if (parts.length === 2) {
    const name = parts[0] ?? '';
    const tld = parts[1] ?? '';
    if (name.length <= 4) return name.slice(0, 1) + '***.' + tld;
    return name.slice(0, 3) + '****.' + tld;
  }

  // Three+ parts: keep the last two as domain, mask the subdomain
  const domain = parts.slice(-2).join('.');
  const subdomain = parts.slice(0, -2).join('.');

  if (subdomain.length <= 4) {
    return subdomain.slice(0, 1) + '****.' + domain;
  }

  return subdomain.slice(0, 3) + '****' + subdomain.slice(-2) + '.' + domain;
}
