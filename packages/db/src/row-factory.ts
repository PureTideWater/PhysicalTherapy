import { randomUUID } from 'node:crypto';

import fc from 'fast-check';

import { TENANT_TABLE } from './catalog';
import { OWNER_ROLE } from './roles';
import { type OwnerClient, type TenantWorld, asOwner, worldRefs } from './tenant-world';

/**
 * A generic row factory driven by PostgreSQL's catalog, for the generated cross-tenant tests ("add
 * a table, get a test"). For any table it builds a row that belongs to one tenant world: practice_id
 * is the world's practice; a foreign key points at the world's practice, organization, user or
 * agreement, or at a row the factory creates first in the same world; an enum takes its first label;
 * a check of the form `col IN (...)` takes its first value and `col ~ 'pattern'` a sample matching
 * the pattern; anything else gets a synthetic value of its type. It first fills only NOT NULL columns
 * without defaults, and if a constraint refuses that row, fills every column it can. Rows are written
 * as the owner role inside the world's practice scope.
 *
 * A table the factory cannot fill raises a RowFactoryError naming the table and constraint, which is
 * the cue to extend the factory, not to skip the table.
 */

export type Row = Record<string, unknown>;

export interface BuiltRow {
  readonly table: string;
  readonly values: Readonly<Row>;
}

export class RowFactoryError extends Error {
  override readonly name = 'RowFactoryError';
}

interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly notNull: boolean;
  readonly hasDefault: boolean;
  readonly generated: boolean;
  readonly enumLabels: readonly string[] | null;
}

interface ForeignKey {
  readonly refTable: string;
  readonly refColumn: string;
}

interface TableInfo {
  readonly name: string;
  readonly columns: readonly ColumnInfo[];
  readonly foreignKeys: ReadonlyMap<string, ForeignKey>;
  /** Check constraint definitions by the columns they mention. */
  readonly checks: ReadonlyMap<string, readonly string[]>;
  readonly primaryKey: readonly string[];
}

const COLUMNS = `
  SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
         a.atthasdef AS has_default, (a.attgenerated <> '' OR a.attidentity <> '') AS generated,
         (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = a.atttypid) AS enum_labels
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY c.relname, a.attnum`;

const CONSTRAINTS = `
  SELECT c.relname AS table_name, con.contype AS kind, pg_get_constraintdef(con.oid) AS definition,
         ARRAY(SELECT a.attname::text FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k ORDER BY a.attnum) AS columns,
         rc.relname AS ref_table,
         ARRAY(SELECT a.attname::text FROM unnest(con.confkey) k JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k) AS ref_columns
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_class rc ON rc.oid = con.confrelid
   WHERE n.nspname = 'public' AND con.contype IN ('c', 'f', 'p')`;

/** SQLSTATEs that mean "this row breaks a constraint": try a fuller row, or fresh unique values. */
const CONSTRAINT_FAILURES = new Set(['23514', '23502', '23505', '23P01']);

function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const IN_LIST = /^CHECK \(\(\(?"?(\w+)"?\)? = ANY \(\(?ARRAY\[(.*)\]\)?(?:::\w+\[\])?\)\)\)$/;
const LITERAL = /'((?:[^']|'')*)'::[\w ]+/g;
const MATCHES = /^CHECK \(\("?(\w+)"? ~ '((?:[^']|'')*)'::text\)\)$/;
const PRINTABLE = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;

export class RowFactory {
  private sequence = 0;

  private constructor(private readonly tables: ReadonlyMap<string, TableInfo>) {}

  /** Reads the catalog of schema public. */
  static async load(client: OwnerClient): Promise<RowFactory> {
    const columns = (await client.query(COLUMNS)).rows as { table_name: string; name: string; type: string; not_null: boolean; has_default: boolean; generated: boolean; enum_labels: string[] | null }[];
    const constraints = (await client.query(CONSTRAINTS)).rows as { table_name: string; kind: string; definition: string; columns: string[]; ref_table: string | null; ref_columns: string[] }[];
    const tables = new Map<string, { columns: ColumnInfo[]; foreignKeys: Map<string, ForeignKey>; checks: Map<string, string[]>; primaryKey: string[] }>();
    const entry = (name: string) => {
      let table = tables.get(name);
      if (table === undefined) {
        table = { columns: [], foreignKeys: new Map(), checks: new Map(), primaryKey: [] };
        tables.set(name, table);
      }
      return table;
    };
    for (const column of columns) {
      entry(column.table_name).columns.push({
        name: column.name,
        type: column.type,
        notNull: column.not_null,
        hasDefault: column.has_default,
        generated: column.generated,
        enumLabels: column.enum_labels,
      });
    }
    for (const constraint of constraints) {
      const table = entry(constraint.table_name);
      if (constraint.kind === 'p') {
        table.primaryKey.push(...constraint.columns);
      } else if (constraint.kind === 'f') {
        const [column] = constraint.columns;
        const [refColumn] = constraint.ref_columns;
        if (constraint.columns.length !== 1 || column === undefined || refColumn === undefined || constraint.ref_table === null) {
          throw new RowFactoryError(`${constraint.table_name}: the factory handles single-column foreign keys only (${constraint.definition})`);
        }
        table.foreignKeys.set(column, { refTable: constraint.ref_table, refColumn });
      } else {
        for (const column of constraint.columns) {
          table.checks.set(column, [...(table.checks.get(column) ?? []), constraint.definition]);
        }
      }
    }
    return new RowFactory(
      new Map(
        [...tables].map(([name, table]) => [
          name,
          { name, columns: table.columns, foreignKeys: table.foreignKeys, checks: table.checks, primaryKey: table.primaryKey },
        ]),
      ),
    );
  }

  /** The table's single-column primary key. */
  primaryKey(table: string): string {
    const [key, ...rest] = this.info(table).primaryKey;
    if (key === undefined || rest.length > 0) {
      throw new RowFactoryError(`${table}: the cross-tenant tests need a single-column primary key`);
    }
    return key;
  }

  private info(table: string): TableInfo {
    const info = this.tables.get(table);
    if (info === undefined) {
      throw new RowFactoryError(`${table} is not a table in schema public`);
    }
    return info;
  }

  /**
   * Creates and commits one row of `table` for `world`, returning it as stored. For the tenant
   * table itself, "a row for the practice" is the world's own practice.
   */
  async create(client: OwnerClient, table: string, world: TenantWorld, depth = 0): Promise<Row> {
    if (table === TENANT_TABLE) {
      const found = await asOwner(client, [world.practiceId], () => client.query(`SELECT * FROM ${quote(TENANT_TABLE)} WHERE id = $1`, [world.practiceId]));
      return found.rows[0] as Row;
    }
    return this.attempt(client, table, world, depth, true);
  }

  /**
   * Builds a new row of `table` for `world` that the owner could insert (it is inserted and rolled
   * back to prove it), without keeping it: the probe a cross-tenant INSERT test attempts.
   */
  async build(client: OwnerClient, table: string, world: TenantWorld): Promise<BuiltRow> {
    const values = await this.attempt(client, table, world, 0, false);
    return { table, values };
  }

  private async attempt(client: OwnerClient, table: string, world: TenantWorld, depth: number, keep: boolean): Promise<Row> {
    if (depth > 8) {
      throw new RowFactoryError(`${table}: foreign keys nest deeper than the factory follows`);
    }
    let failure: unknown;
    for (const full of [false, true, true, true]) {
      const values = await this.values(client, table, world, full, depth);
      const scope = table === TENANT_TABLE ? [world.practiceId, String(values.id)] : [world.practiceId];
      const columns = Object.keys(values);
      const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')}) RETURNING *`;
      try {
        if (keep) {
          const inserted = await asOwner(client, scope, () => client.query(sql, Object.values(values)), world.adminUserId);
          return inserted.rows[0] as Row;
        }
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
          await client.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${scope.join(',')}}`, world.adminUserId]);
          await client.query(sql, Object.values(values));
        } finally {
          await client.query('ROLLBACK');
        }
        return values;
      } catch (error) {
        if (!CONSTRAINT_FAILURES.has(sqlState(error) ?? '')) {
          throw error;
        }
        failure = error;
      }
    }
    throw new RowFactoryError(`${table}: no generated row satisfied its constraints (${failure instanceof Error ? failure.message : 'unknown error'})`);
  }

  private async values(client: OwnerClient, table: string, world: TenantWorld, full: boolean, depth: number): Promise<Row> {
    const info = this.info(table);
    const refs = worldRefs(world);
    const row: Row = {};
    let hours = 0;
    for (const column of info.columns) {
      if (column.generated) {
        continue;
      }
      if (table === TENANT_TABLE && column.name === 'id') {
        row.id = randomUUID();
        continue;
      }
      if (column.name === 'practice_id') {
        row.practice_id = world.practiceId;
        continue;
      }
      const foreignKey = info.foreignKeys.get(column.name);
      if (foreignKey !== undefined) {
        if (!column.notNull && !full) {
          continue;
        }
        const ref = refs[foreignKey.refTable];
        if (ref !== undefined && foreignKey.refColumn === 'id') {
          row[column.name] = ref;
        } else if (column.notNull) {
          row[column.name] = (await this.create(client, foreignKey.refTable, world, depth + 1))[foreignKey.refColumn];
        }
        continue;
      }
      if (column.hasDefault || (!column.notNull && !full)) {
        continue;
      }
      if (/^timestamp/.test(column.type)) {
        hours += 1;
      }
      row[column.name] = this.scalar(info, column, hours);
    }
    return row;
  }

  private scalar(table: TableInfo, column: ColumnInfo, hours: number): unknown {
    this.sequence += 1;
    const sequence = this.sequence;
    if (column.enumLabels !== null && column.enumLabels.length > 0) {
      return column.enumLabels[0];
    }
    for (const check of table.checks.get(column.name) ?? []) {
      const list = IN_LIST.exec(check);
      if (list?.[1] === column.name) {
        const first = [...(list[2] ?? '').matchAll(LITERAL)][0]?.[1];
        if (first !== undefined) {
          return first.replaceAll("''", "'");
        }
      }
      const matches = MATCHES.exec(check);
      if (matches?.[1] === column.name) {
        return this.sample(table.name, column.name, (matches[2] ?? '').replaceAll("''", "'"), sequence);
      }
    }
    const checks = (table.checks.get(column.name) ?? []).join(' ');
    const { type } = column;
    if (type === 'uuid') {
      return randomUUID();
    }
    if (type === 'text' || type.startsWith('character')) {
      return `SYNTHETIC ${table.name}.${column.name} ${String(sequence)}`;
    }
    if (type === 'boolean') {
      return false;
    }
    if (['smallint', 'integer', 'bigint'].includes(type)) {
      return sequence;
    }
    if (type.startsWith('numeric')) {
      return '1';
    }
    if (type === 'date') {
      return new Date().toISOString().slice(0, 10);
    }
    if (type.startsWith('timestamp')) {
      return new Date(Date.now() + hours * 3_600_000).toISOString();
    }
    if (type === 'jsonb' || type === 'json') {
      return checks.includes(`jsonb_typeof(${column.name}) = 'array'`) ? '[]' : '{}';
    }
    if (type.endsWith('[]')) {
      return '{}';
    }
    throw new RowFactoryError(`${table.name}.${column.name}: the factory cannot generate a ${type}`);
  }

  private sample(table: string, column: string, pattern: string, seed: number): string {
    const candidates = fc.sample(fc.stringMatching(new RegExp(pattern)), { numRuns: 200, seed });
    const found = candidates.find((candidate) => PRINTABLE.test(candidate));
    if (found === undefined) {
      throw new RowFactoryError(`${table}.${column}: no printable sample matches its pattern`);
    }
    return found;
  }
}
