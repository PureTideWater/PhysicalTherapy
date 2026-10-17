/**
 * check-drizzle-and-catalog.ts: two cross-checks for the generated domain model, against a migrated database.
 *
 *  1. The Drizzle schema (packages/db/src/schema) against the live catalog: every table, every column,
 *     its type and nullability (the same comparison packages/db/src/migrate.db.test.ts makes, but run
 *     against a database we name, and reporting every difference instead of stopping at the first).
 *  2. The repository's own catalog test function (packages/db/src/catalog.ts catalogProblems) against
 *     the same database.
 *
 * Usage: <repo>/node_modules/.bin/tsx check-drizzle-and-catalog.ts --repo <clone> --database-url <url>
 */
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: { repo: { type: 'string' }, 'database-url': { type: 'string' } }, strict: true });
if (!values.repo || !values['database-url']) {
  process.stderr.write('usage: tsx check-drizzle-and-catalog.ts --repo DIR --database-url URL\n');
  process.exit(2);
}
const repo = path.resolve(values.repo);
const imp = (p: string) => import(pathToFileURL(path.join(repo, p)).href);

const schema = (await imp('packages/db/src/schema/index.ts')) as Record<string, unknown>;
const pgCore = await imp('packages/db/node_modules/drizzle-orm/pg-core/index.js');
const drizzle = await imp('packages/db/node_modules/drizzle-orm/index.js');
const pgMod = await imp('packages/db/node_modules/pg/lib/index.js');
const { catalogProblems } = await imp('packages/db/src/catalog.ts');

const pg = pgMod.default ?? pgMod;
const client = new pg.Client({ connectionString: values['database-url'] });
await client.connect();

const POSTGRES_TYPES: Record<string, string> = {
  PgUUID: 'uuid', PgInteger: 'integer', PgText: 'text', PgTimestamp: 'timestamp with time zone', PgJsonb: 'jsonb',
  PgDateString: 'date', PgBoolean: 'boolean', PgBigInt64: 'bigint', PgNumeric: 'numeric', PgArray: 'ARRAY',
};
const tables = Object.values(schema).filter((v) => drizzle.is(v, pgCore.PgTable));
const drizzleNames = tables.map((t) => pgCore.getTableConfig(t).name as string).sort();
const live = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY 1")).rows.map((r: { tablename: string }) => r.tablename);

const report: string[] = [];
const missingInDrizzle = live.filter((n: string) => !drizzleNames.includes(n));
const missingInDb = drizzleNames.filter((n) => !live.includes(n));
report.push(`Drizzle tables: ${drizzleNames.length}; migrated tables (excluding schema_migrations): ${live.length}`);
report.push(`In the database, not in Drizzle: ${missingInDrizzle.join(', ') || 'none'}`);
report.push(`In Drizzle, not in the database: ${missingInDb.join(', ') || 'none'}`);
let columnProblems = 0;
for (const table of tables) {
  const config = pgCore.getTableConfig(table);
  const cols = (
    await client.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      [config.name],
    )
  ).rows as { column_name: string; data_type: string; is_nullable: string }[];
  const byName = new Map(cols.map((c) => [c.column_name, c]));
  const dz = new Map<string, { type: string; nullable: string }>(
    config.columns.map((c: { name: string; columnType: string; notNull: boolean }) => [c.name, { type: POSTGRES_TYPES[c.columnType] ?? c.columnType, nullable: c.notNull ? 'NO' : 'YES' }]),
  );
  for (const [name, d] of dz) {
    const l = byName.get(name);
    if (!l) { report.push(`  ${config.name}.${name}: in Drizzle, not in the database`); columnProblems++; continue; }
    if (l.data_type !== d.type) { report.push(`  ${config.name}.${name}: Drizzle ${d.type}, database ${l.data_type}`); columnProblems++; }
    if (l.is_nullable !== d.nullable) { report.push(`  ${config.name}.${name}: Drizzle nullable=${d.nullable}, database nullable=${l.is_nullable}`); columnProblems++; }
  }
  for (const c of cols) if (!dz.has(c.column_name)) { report.push(`  ${config.name}.${c.column_name}: in the database, not in Drizzle`); columnProblems++; }
}
report.push(`Column differences (name, type, nullability): ${columnProblems}`);

const problems: string[] = await catalogProblems(client);
report.push(`catalogProblems() (packages/db/src/catalog.ts) on this database: ${problems.length} problem(s)`);
for (const p of problems) report.push(`  - ${p}`);
await client.end();
process.stdout.write(report.join('\n') + '\n');
