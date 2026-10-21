import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { POSTGRES_TYPES } from './cross-check';

/**
 * The cross-check names a Drizzle column's type the way information_schema does. A column type missing from
 * POSTGRES_TYPES would be compared under its Drizzle name and counted as a difference in the document the founder
 * signs (CO-02), so every type the schema uses must be in the map.
 */
describe('the cross-check type map', () => {
  it('names every column type the Drizzle schema uses', () => {
    const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));
    const unmapped = tables.flatMap((table) => {
      const config = getTableConfig(table);
      return config.columns.filter((column) => !(column.columnType in POSTGRES_TYPES)).map((column) => `${config.name}.${column.name} (${column.columnType})`);
    });
    expect(unmapped).toEqual([]);
  });
});
