import { createHash, randomBytes } from 'node:crypto';

/**
 * Session and device cookies carry 256 random bits; the database keeps only their SHA-256, so a
 * leaked table opens no session.
 */

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A token as the cookies carry it, or undefined for anything else. */
export function cookieToken(value: string | undefined): string | undefined {
  return value !== undefined && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * The device list's label: the browser and system named in the User-Agent ("Chrome on Linux"). The
 * raw header is never stored.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const text = userAgent ?? '';
  const browser = BROWSERS.find(([pattern]) => pattern.test(text))?.[1] ?? 'Browser';
  const system = SYSTEMS.find(([pattern]) => pattern.test(text))?.[1];
  return system === undefined ? browser : `${browser} on ${system}`;
}
