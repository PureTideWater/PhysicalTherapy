import { randomUUID } from 'node:crypto';

import fc from 'fast-check';

import { TENANT_TABLE } from './catalog';
import { OWNER_ROLE } from './roles';
import { type OwnerClient, type TenantWorld, addMembership, asOwner, createOrganization, createUser, worldRefs } from './tenant-world';

/**
 * A generic row factory driven by PostgreSQL's catalog, for the generated cross-tenant tests ("add
 * a table, get a test"). For any table it builds a row that belongs to one tenant world: practice_id
 * is the world's practice; a foreign key points at the world's practice, organization, user or
 * agreement, or at a row the factory creates first in the same world; an enum takes its first label;
 * a check of the form `col IN (...)` takes its first value and `col ~ 'pattern'` a sample matching
 * the pattern; anything else gets a synthetic value of its type. A column that names the row's actor
 * (actor_id, *_by, *_by_user_id) is the world's administrator, who is also the actor the rows are
 * written as, so a cross-tenant probe differs from an accepted row in its practice only. A user column
 * whose user must hold a role (ROLE_BOUND_USERS) gets a user who holds it, and a column whose value the
 * row's other constraints decide (FIXED_VALUES) gets that value, and one that must match a column of a
 * row another column references (SAME_AS) is read from that row, or from rows further along or made for
 * it (DERIVED_VALUES); a row a column references that must have taken a further step first
 * (PREPARED_REFERENCES) takes it once created. It first fills only NOT
 * NULL columns without defaults, and if a constraint refuses that row, fills every column it can. Rows
 * are written as the owner role inside the world's practice scope.
 *
 * A table the factory cannot fill raises a RowFactoryError naming the table and constraint, which is
 * the cue to extend the factory, not to skip the table.
 */

export type Row = Record<string, unknown>;

export interface BuiltRow {
  readonly table: string;
  readonly values: Readonly<Row>;
  /** The user the row is written as: the world's administrator, or a holder of the role its table needs (ROLE_BOUND_ACTORS). */
  readonly actorId: string;
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

/** Columns that name who did what the row records. */
const ACTOR_COLUMN = /^(actor_id|[a-z_]+_by|[a-z_]+_by_user_id)$/;

/**
 * Nullable actor columns that a row's other constraints require all the same: a pricing run is created
 * by a person (created_by) or by the monitoring job (created_by_job_id), exactly one; the factory's run
 * is a person's, so its creator is filled in the first, minimal row too.
 */
const REQUIRED_ACTORS: ReadonlySet<string> = new Set(['pricing_run.created_by', 'line_status.set_by', 'payer_response.recorded_by']);

/** User columns whose user must hold a role, which the database checks (support grants go to support engineers). */
const ROLE_BOUND_USERS: Readonly<Record<string, 'support'>> = { 'support_grant.user_id': 'support' };

/**
 * Tables whose rows a person writes only with a role the database checks (migration 20261022090000):
 * a person's stage event is a case worker's, a pricing run a mapper's, an audit report request a case
 * worker's. Their actor columns name, and the row is written by, a user of the world's organization
 * who holds the role, so the probe differs from an accepted row in its practice only.
 */
const ROLE_BOUND_ACTORS: Readonly<Record<string, 'billing_manager'>> = {
  line_status: 'billing_manager',
  pricing_run: 'billing_manager',
  audit_report: 'billing_manager',
  // Packets are drafted, submissions logged and responses recorded by people with those roles (migration 20261023090000).
  packet: 'billing_manager',
  packet_version: 'billing_manager',
  submission: 'billing_manager',
  payer_response: 'billing_manager',
};

/**
 * Columns whose value the row's other constraints decide, so no generic value fits: a priced line is
 * priced (with its amounts) or carries a reason, and the factory's row is the unpriced one; a pricing
 * run pins a published release, so the release the factory creates for one is published.
 */
const FIXED_VALUES: Readonly<Record<string, () => unknown>> = {
  'priced_line.unpriced_reason': () => 'NO_MAPPING',
  // A run has one creator, a person or the monitoring job; the factory's run is a person's.
  'pricing_run.created_by_job_id': () => null,
  'rule_release.published_at': () => new Date().toISOString(),
  // One open case per pattern: each factory case is its own pattern.
  'case.pattern_key': () => JSON.stringify({ synthetic: randomUUID() }),
  // A packet's first version, asking for the factory case's lines (it has none), passing the verifier.
  'packet_version.version_no': () => 1,
  'packet_version.content': () => JSON.stringify(SYNTHETIC_PACKET_CONTENT),
  'packet_version.verifier_passed': () => true,
  'packet_version.verifier_report': () => JSON.stringify({ format: 'tp-packet-verifier/1', passed: true, narrative_sha256: '0'.repeat(64), sentences: 0, checked: 0, mismatches: [] }),
  // A denial that does not reopen the case: no amount, no next window.
  'payer_response.kind': () => 'denied',
  'payer_response.amount_cents': () => null,
  'payer_response.next_window_ends_on': () => null,
};

/**
 * Columns that must equal a column of the row another of their columns references: a case's payer is
 * its plan's payer, and a case line's service line is its priced line's. Filled after the reference.
 */
const SAME_AS: Readonly<Record<string, { readonly via: string; readonly column: string }>> = {
  'case.payer_id': { via: 'plan_id', column: 'payer_id' },
  'case_line.service_line_id': { via: 'priced_line_id', column: 'service_line_id' },
};

/**
 * Referenced rows that must take a step after they are created before the referring row is accepted: an
 * audit report is of the pricing run in effect for its period (docs/adr/0037), so the factory's run for
 * one completes, as the price job completes a run that priced no lines (its coverage counts none).
 */
const PREPARED_REFERENCES: Readonly<Record<string, (client: OwnerClient, world: TenantWorld, referenced: Row) => Promise<void>>> = {
  // A submission sends an exported version: a second billing manager approves the factory's version
  // (its drafter cannot) and the export job records its files.
  'submission.packet_version_id': async (client, world, version) => {
    const approver = await createUser(client);
    await addMembership(client, world.organizationId, approver, 'billing_manager');
    await asOwner(client, [world.practiceId], () => client.query('UPDATE packet_version SET approved_by = $2, approved_sha256 = content_sha256 WHERE id = $1', [version.id, approver]), approver);
    const key = (file: string) => `practices/${world.practiceId}/packets/${String(version.packet_id)}/${randomUUID()}.${file}`;
    await asOwner(
      client,
      [world.practiceId],
      () =>
        client.query('UPDATE packet_version SET export_pdf_key = $2, export_csv_key = $3, export_sha256 = $4, export_csv_sha256 = $4 WHERE id = $1', [version.id, key('pdf'), key('csv'), 'e'.repeat(64)]),
      randomUUID(),
    );
  },
  'audit_report.pricing_run_id': async (client, world, run) => {
    await asOwner(
      client,
      [world.practiceId],
      () => client.query("UPDATE pricing_run SET status = 'complete', completed_at = now(), coverage = $2 WHERE id = $1", [run.id, JSON.stringify({ lines: 0 })]),
      world.adminUserId,
    );
  },
};

/** The content of the factory's packet versions: tp-packet/1 with no lines (its case has none). */
const SYNTHETIC_PACKET_CONTENT = {
  format: 'tp-packet/1',
  as_of: '2026-01-01',
  dispute_level: 1,
  practice: {},
  payer: {},
  citation: { kind: 'contract' },
  rule_releases: [],
  pattern: {},
  lines: [],
  interest: null,
  evidence: [],
  evidence_gaps: [],
  requested_action: 'SYNTHETIC',
  sources: [],
};

/** What a derived column reads from or makes with. */
interface DeriveContext {
  readonly client: OwnerClient;
  readonly world: TenantWorld;
  readonly row: Row;
  /** Makes a row of a table for the world, as a foreign key would. */
  readonly create: (table: string) => Promise<Row>;
}

async function exportedVersion(context: DeriveContext): Promise<Row> {
  const found = await asOwner(context.client, [context.world.practiceId], () =>
    context.client.query('SELECT p.case_id, v.export_sha256, v.export_csv_sha256 FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE v.id = $1', [context.row.packet_version_id]),
  );
  return (found.rows[0] ?? {}) as Row;
}

/**
 * Columns whose value is read from, or made for, the rows the row's other columns reference, once they
 * exist: a submission's case and export hashes are its packet version's; a payer response's document
 * is one the factory makes. Filled after the references, in every attempt.
 */
const DERIVED_VALUES: Readonly<Record<string, (context: DeriveContext) => Promise<unknown>>> = {
  'submission.case_id': async (context) => (await exportedVersion(context)).case_id,
  'submission.export_sha256': async (context) => (await exportedVersion(context)).export_sha256,
  'submission.export_csv_sha256': async (context) => (await exportedVersion(context)).export_csv_sha256,
  'payer_response.document_id': async (context) => (await context.create('source_document')).id,
};

const IN_LIST = /^CHECK \(\(\(?"?(\w+)"?\)? = ANY \(\(?ARRAY\[(.*)\]\)?(?:::\w+\[\])?\)\)\)$/;
const LITERAL = /'((?:[^']|'')*)'::[\w ]+/g;
const MATCHES = /^CHECK \(\("?(\w+)"? ~ '((?:[^']|'')*)'::text\)\)$/;
const PRINTABLE = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;

export class RowFactory {
  private sequence = 0;
  private readonly roleHolders = new Map<string, string>();
  private readonly worldActors = new Map<string, string>();

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
    return { table, values, actorId: await this.actorFor(client, table, world) };
  }

  /** Who writes a row of `table` for `world`: its administrator, or a holder of the role the table needs. */
  async actorFor(client: OwnerClient, table: string, world: TenantWorld): Promise<string> {
    const role = ROLE_BOUND_ACTORS[table];
    if (role === undefined) {
      return world.adminUserId;
    }
    const key = `${world.practiceId} ${role}`;
    let actor = this.worldActors.get(key);
    if (actor === undefined) {
      actor = await createUser(client);
      await addMembership(client, world.organizationId, actor, role);
      this.worldActors.set(key, actor);
    }
    return actor;
  }

  private async attempt(client: OwnerClient, table: string, world: TenantWorld, depth: number, keep: boolean): Promise<Row> {
    if (depth > 8) {
      throw new RowFactoryError(`${table}: foreign keys nest deeper than the factory follows`);
    }
    let failure: unknown;
    const actor = await this.actorFor(client, table, world);
    for (const full of [false, true, true, true]) {
      const values = await this.values(client, table, world, full, depth, actor);
      const scope = table === TENANT_TABLE ? [world.practiceId, String(values.id)] : [world.practiceId];
      const columns = Object.keys(values);
      const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map((_, index) => `$${String(index + 1)}`).join(', ')}) RETURNING *`;
      try {
        if (keep) {
          const inserted = await asOwner(client, scope, () => client.query(sql, Object.values(values)), actor);
          return inserted.rows[0] as Row;
        }
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
          await client.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${scope.join(',')}}`, actor]);
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

  /** A user who holds `role` (an internal role), created once per factory. */
  private async roleHolder(client: OwnerClient, role: 'support'): Promise<string> {
    let holder = this.roleHolders.get(role);
    if (holder === undefined) {
      const organization = await createOrganization(client, 'internal', `row factory ${role}`);
      holder = await createUser(client, { hardwareKeyRequired: true });
      await addMembership(client, organization, holder, role);
      this.roleHolders.set(role, holder);
    }
    return holder;
  }

  private async values(client: OwnerClient, table: string, world: TenantWorld, full: boolean, depth: number, actor: string): Promise<Row> {
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
      if (SAME_AS[`${table}.${column.name}`] !== undefined || DERIVED_VALUES[`${table}.${column.name}`] !== undefined) {
        continue;
      }
      const fixed = FIXED_VALUES[`${table}.${column.name}`];
      if (fixed !== undefined) {
        row[column.name] = fixed();
        continue;
      }
      const bound = ROLE_BOUND_USERS[`${table}.${column.name}`];
      if (bound !== undefined) {
        row[column.name] = await this.roleHolder(client, bound);
        continue;
      }
      if (column.type === 'uuid' && ACTOR_COLUMN.test(column.name) && (column.notNull || full || REQUIRED_ACTORS.has(`${table}.${column.name}`))) {
        row[column.name] = actor;
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
          const referenced = await this.create(client, foreignKey.refTable, world, depth + 1);
          await PREPARED_REFERENCES[`${table}.${column.name}`]?.(client, world, referenced);
          row[column.name] = referenced[foreignKey.refColumn];
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
    for (const column of info.columns) {
      const same = SAME_AS[`${table}.${column.name}`];
      const foreignKey = same === undefined ? undefined : info.foreignKeys.get(same.via);
      if (same === undefined || foreignKey === undefined) {
        continue;
      }
      const found = await asOwner(client, [world.practiceId], () =>
        client.query(`SELECT ${quote(same.column)} AS value FROM ${quote(foreignKey.refTable)} WHERE ${quote(foreignKey.refColumn)} = $1`, [row[same.via]]),
      );
      row[column.name] = (found.rows[0] as { value?: unknown } | undefined)?.value;
    }
    for (const column of info.columns) {
      const derive = DERIVED_VALUES[`${table}.${column.name}`];
      if (derive !== undefined) {
        row[column.name] = await derive({ client, world, row, create: (referenced) => this.create(client, referenced, world, depth + 1) });
      }
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
