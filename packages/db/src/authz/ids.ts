/** A UUID in its canonical text form, as PostgreSQL prints it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Refused input to a scope or an audit helper. The message names what was wrong, never the value:
 * identifiers do not appear in thrown errors (CLAUDE.md).
 */
export class ScopeError extends Error {
  override readonly name: string = 'ScopeError';
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** The value as a lowercase UUID, or a ScopeError naming `what`. */
export function requireUuid(value: unknown, what: string): string {
  const text = typeof value === 'string' ? value.toLowerCase() : value;
  if (!isUuid(text)) {
    throw new ScopeError(`${what} must be a UUID`);
  }
  return text;
}
