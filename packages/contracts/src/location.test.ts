import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCATION_NOT_READY_STATUSES, LOCATION_SETTLED_STATUSES, LOCATION_STATUSES, isLocationStatus, locationStatusText } from './location';

const MIGRATION = path.resolve(import.meta.dirname, '../../db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql');

/** The body of a function the migration creates, from its CREATE to the end of its $$ body. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE FUNCTION ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open, close);
}

describe('the pricing location statuses (audit #33; docs/adr/0064)', () => {
  it('are the closed list locality_status() and practice_location_status() return, no more and no fewer', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const returned = new Set<string>();
    for (const name of ['locality_status', 'practice_location_status']) {
      for (const match of functionBody(sql, name).matchAll(/\b(?:THEN|ELSE) '([a-z_]+)'/g)) {
        returned.add(match[1] as string);
      }
    }
    expect([...returned].sort()).toEqual([...LOCATION_STATUSES].sort());
  });

  it('splits the statuses a line cannot be priced at from those that leave the customer nothing to change', () => {
    expect(LOCATION_NOT_READY_STATUSES).toEqual(['zip_unknown', 'zip_plus_four_needed', 'zip_plus_four_unknown']);
    expect(LOCATION_SETTLED_STATUSES).toEqual(['ready', 'locality_not_loaded']);
    expect(LOCATION_NOT_READY_STATUSES.some((status) => (LOCATION_SETTLED_STATUSES as readonly string[]).includes(status))).toBe(false);
  });

  it('knows its own statuses and nothing else', () => {
    expect(LOCATION_STATUSES.every(isLocationStatus)).toBe(true);
    expect(isLocationStatus('ok')).toBe(false);
    expect(isLocationStatus(null)).toBe(false);
    expect(isLocationStatus(3)).toBe(false);
  });

  it('gives each status one sentence, naming the location and, when ready, the locality and release', () => {
    const facts = { zip: '00012', zipPlusFour: '9100', carrier: '99999', locality: '02', releaseNo: 900006 };
    expect(Object.fromEntries(LOCATION_STATUSES.map((status) => [status, locationStatusText(status, facts)]))).toEqual({
      ready: 'Medicare prices this location in locality 99999-02 under rule release 900006.',
      no_release: 'No Medicare rule release is in force yet.',
      zip_missing: 'Add the practice’s billing ZIP code.',
      zip_unknown: 'Medicare’s ZIP code list in force does not include 00012. Check the ZIP code.',
      locality_not_loaded: 'PaidWhole has not loaded Medicare’s locality list for these dates yet. There is nothing to change here.',
      zip_plus_four_needed: 'Medicare splits ZIP 00012 between payment localities. Add its ZIP+4.',
      zip_plus_four_unknown: 'Medicare’s ZIP+4 list in force does not include 00012-9100. Check the four digits.',
    });
    expect(new Set(LOCATION_STATUSES.map((status) => locationStatusText(status, facts))).size).toBe(LOCATION_STATUSES.length);
    expect(locationStatusText('zip_unknown')).toBe('Medicare’s ZIP code list in force does not include this ZIP code. Check the ZIP code.');
  });
});
