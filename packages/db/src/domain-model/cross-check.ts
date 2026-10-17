import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';

import { catalogProblems } from '../catalog';
import * as schema from '../schema';
import { type Queryable } from './catalog-reads';

/**
 * The domain model's cross-checks, against the same migrated database: the Drizzle schema
 * (packages/db/src/schema) against the live tables and columns, with type and nullability (the
 * comparison packages/db/src/migrate.db.test.ts makes, reporting every difference instead of stopping
 * at the first), and the repository's own catalog test function, catalogProblems() (catalog.ts).
 */

/** How PostgreSQL's information_schema names each Drizzle column type (as migrate.db.test.ts maps them). */
const POSTGRES_TYPES: Readonly<Record<string, string>> = {
  PgUUID: 'uuid',
  PgInteger: 'integer',
  PgText: 'text',
  PgTimestamp: 'timestamp with time zone',
  PgJsonb: 'jsonb',
  PgDateString: 'date',
  PgBoolean: 'boolean',
  PgBigInt64: 'bigint',
  PgNumeric: 'numeric',
  PgArray: 'ARRAY',
};

export async function crossCheck(client: Queryable): Promise<string> {
  const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));
  const drizzleNames = tables.map((t) => getTableConfig(t).name).sort();
  const live = ((await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY tablename COLLATE "C"`)).rows as { tablename: string }[]).map(
    (r) => r.tablename,
  );

  const report: string[] = [];
  const missingInDrizzle = live.filter((name) => !drizzleNames.includes(name));
  const missingInDb = drizzleNames.filter((name) => !live.includes(name));
  report.push(`Drizzle tables: ${String(drizzleNames.length)}; migrated tables (excluding schema_migrations): ${String(live.length)}`);
  report.push(`In the database, not in Drizzle: ${missingInDrizzle.join(', ') || 'none'}`);
  report.push(`In Drizzle, not in the database: ${missingInDb.join(', ') || 'none'}`);
  let columnProblems = 0;
  for (const table of tables) {
    const config = getTableConfig(table);
    const cols = (
      await client.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [config.name],
      )
    ).rows as { column_name: string; data_type: string; is_nullable: string }[];
    const byName = new Map(cols.map((c) => [c.column_name, c]));
    const drizzle = new Map(config.columns.map((c) => [c.name, { type: POSTGRES_TYPES[c.columnType] ?? c.columnType, nullable: c.notNull ? 'NO' : 'YES' }]));
    for (const [name, d] of drizzle) {
      const l = byName.get(name);
      if (!l) {
        report.push(`  ${config.name}.${name}: in Drizzle, not in the database`);
        columnProblems++;
        continue;
      }
      if (l.data_type !== d.type) {
        report.push(`  ${config.name}.${name}: Drizzle ${d.type}, database ${l.data_type}`);
        columnProblems++;
      }
      if (l.is_nullable !== d.nullable) {
        report.push(`  ${config.name}.${name}: Drizzle nullable=${d.nullable}, database nullable=${l.is_nullable}`);
        columnProblems++;
      }
    }
    for (const c of cols) {
      if (!drizzle.has(c.column_name)) {
        report.push(`  ${config.name}.${c.column_name}: in the database, not in Drizzle`);
        columnProblems++;
      }
    }
  }
  report.push(`Column differences (name, type, nullability): ${String(columnProblems)}`);

  const problems = await catalogProblems(client);
  report.push(`catalogProblems() (packages/db/src/catalog.ts) on this database: ${String(problems.length)} problem(s)`);
  for (const p of problems) report.push(`  - ${p}`);
  return report.join('\n');
}
