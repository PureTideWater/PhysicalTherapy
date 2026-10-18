import { describe, expect, it } from 'vitest';

import { readDatabaseUrl } from './config';

describe('readDatabaseUrl', () => {
  it('returns DATABASE_URL', () => {
    expect(readDatabaseUrl({ DATABASE_URL: 'postgres://u:p@h:5432/d' })).toBe('postgres://u:p@h:5432/d');
  });

  it.each([{}, { DATABASE_URL: '' }, { DATABASE_URL: '   ' }])('refuses a missing value %j', (env) => {
    expect(() => readDatabaseUrl(env)).toThrow(/DATABASE_URL is not set/);
  });

  it('never echoes the connection string in its error', () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: ' ' })).not.toThrow(/postgres:/);
  });
});
