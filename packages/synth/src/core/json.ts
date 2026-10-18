import { createHash } from 'node:crypto';

/** SHA-256 of bytes or UTF-8 text, as lowercase hex. */
export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonical(item));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

/**
 * Compact JSON with object keys sorted: the form both the TypeScript side and the Python oracle hash
 * (Python: json.dumps(value, sort_keys=True, separators=(',', ':'))). Fixture text is ASCII, so the
 * two serializations agree byte for byte.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

const INLINE_WIDTH = 100;

function pretty(value: unknown, indent: string): string {
  const inline = JSON.stringify(value);
  if (inline === undefined) {
    return 'null';
  }
  if (value === null || typeof value !== 'object' || indent.length + inline.length <= INLINE_WIDTH) {
    return inline;
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return `[\n${value.map((item) => `${inner}${pretty(item, inner)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
  if (entries.length === 0) {
    return '{}';
  }
  return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${pretty(item, inner)}`).join(',\n')}\n${indent}}`;
}

/**
 * JSON with a trailing newline, keys in the order the code built them, two-space indentation, and
 * any array or object that fits in a hundred columns kept on one line.
 */
export function prettyJson(value: unknown): string {
  return `${pretty(value, '')}\n`;
}
