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
 * (PREPARED_REFERENCES) takes it once created, and a row that only makes sense as a link in a chain of
 * rows (CHAINED_ROWS: the ledger's) is built with its chain; a table only a practice job writes
 * (JOB_WRITTEN: the export rows) is written as a job of the world. It first fills only NOT
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
  /** The actor the row is written as: the world's administrator, a holder of the role its table needs (ROLE_BOUND_ACTORS), or a job of the world for a table only jobs write (JOB_WRITTEN). */
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
 * is a person's, so its creator is filled in the first, minimal row too. A model call names its user or
 * job (only a synthetic evaluation call names no one), and the factory's call is its administrator's.
 */
const REQUIRED_ACTORS: ReadonlySet<string> = new Set(['pricing_run.created_by', 'line_status.set_by', 'payer_response.recorded_by', 'model_call.actor_id']);

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
  // A person opens a case, adds its lines and writes its notes only as a case worker (migration 20261024110000).
  case: 'billing_manager',
  case_line: 'billing_manager',
  case_activity: 'billing_manager',
  // A person's ledger match, entry or ROI statement is one who reconciles postings (migration 20261023120000).
  ledger_match: 'billing_manager',
  ledger_entry: 'billing_manager',
  roi_statement: 'billing_manager',
  // A person generates a coverage report or a monthly summary only as a case worker (migration 20261025090000).
  report_document: 'billing_manager',
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
  'packet_version.verifier_report': () => JSON.stringify({ format: 'tp-packet-verifier/2', passed: true, narrative_sha256: '0'.repeat(64), sentences: 0, checked: 0, mismatches: [] }),
  // A note: its words, and no owner or packet version (those are an assignment's and an approval request's).
  'case_activity.kind': () => 'note',
  'case_activity.owner_user_id': () => null,
  'case_activity.packet_version_id': () => null,
  // A denial that does not reopen the case: no amount, no next window.
  'payer_response.kind': () => 'denied',
  'payer_response.amount_cents': () => null,
  'payer_response.next_window_ends_on': () => null,
  // A coverage report (its kind names its format) with no figures, reading no run.
  'report_document.kind': () => 'coverage',
  'report_document.content': () => JSON.stringify({ format: 'tp-coverage-report/1' }),
  'report_document.period': () => null,
  // A completed call of the world's administrator, unreviewed, at no cost (migration 20261029090000).
  'model_call.outcome': () => 'completed',
  'model_call.output_sha256': () => 'a'.repeat(64),
  'model_call.verifier_passed': () => true,
  'model_call.error_code': () => null,
  'model_call.input_hashes': () => ['b'.repeat(64)],
  'model_call.cost_cents': () => '0',
  'model_call.cost_unrounded': () => '0',
  'model_call.citations': () => JSON.stringify([]),
  'model_call.attempts': () => 1,
  // A practice's example is a permitted one, under the data-rights agreement the factory signs for it.
  'eval_example.source': () => 'permitted',
  // A proposal of contract terms (its call's purpose) holds an object (migration 20261029190000).
  'model_proposal.proposal': () => JSON.stringify({}),
  // The factory's remittance is an 835 (its provenance's default), which carries its whole X12 envelope, and its
  // claims carry CLP06 (migration 20261102090000: these columns are nullable for an ERA export's rows only).
  'remittance.sender_id': () => 'SYNTHSENDER',
  'remittance.receiver_id': () => 'SYNTHRECEIVER',
  'remittance.isa13': () => '000000001',
  'remittance.gs06': () => '1',
  'remittance.st02': () => '0001',
  'remittance.trn03': () => '1SYNTHPAYR',
  'remittance.bpr_method': () => 'ACH',
  'remittance.payee_id_qualifier': () => 'XX',
  'claim.filing_indicator': () => 'CI',
};

/**
 * Columns the factory never writes: the database stamps them itself, and the application may not write them.
 * A practice's deleted_at is set as its status moves to deleted (migration 20261101090000).
 */
const DATABASE_STAMPED: ReadonlySet<string> = new Set(['practice.deleted_at']);

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
  // A submission sends an exported, attested version: a second billing manager approves the factory's version
  // (its drafter cannot), the export job records its files with the verifier's report over the narrative it
  // rendered (the version's own), and a reimbursement reviewer under a support grant downloads both files (the
  // two events the download routes record once a file's bytes match its SHA-256) and attests the export
  // (migration 20261103090000).
  'submission.packet_version_id': async (client, world, version) => {
    const approver = await createUser(client);
    await addMembership(client, world.organizationId, approver, 'billing_manager');
    await asOwner(client, [world.practiceId], () => client.query('UPDATE packet_version SET approved_by = $2, approved_sha256 = content_sha256 WHERE id = $1', [version.id, approver]), approver);
    const key = (file: string) => `practices/${world.practiceId}/packets/${String(version.packet_id)}/${randomUUID()}.${file}`;
    await asOwner(
      client,
      [world.practiceId],
      () =>
        client.query(
          'UPDATE packet_version SET export_pdf_key = $2, export_csv_key = $3, export_sha256 = $4, export_csv_sha256 = $4, export_verifier_report = verifier_report WHERE id = $1',
          [version.id, key('pdf'), key('csv'), 'e'.repeat(64)],
        ),
      randomUUID(),
    );
    const internal = await createOrganization(client, 'internal', 'row factory attestation');
    const reviewer = await createUser(client, { hardwareKeyRequired: true });
    await addMembership(client, internal, reviewer, 'reviewer');
    await asOwner(client, [world.practiceId], () =>
      client.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'RF-1', 'SYNTHETIC ATTESTATION', now() + interval '4 hours')`, [world.practiceId, reviewer]),
    );
    await asOwner(
      client,
      [world.practiceId],
      () =>
        client.query(
          `INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, purpose, request_id)
           SELECT $2::uuid, 'user', a.action, 'packet_version', $1::uuid, $3::uuid, 'line_export', 'row-factory'
             FROM unnest(ARRAY['packet_export_pdf_downloaded', 'packet_export_csv_downloaded']) AS a (action)`,
          [version.id, reviewer, world.practiceId],
        ),
      reviewer,
    );
    await asOwner(
      client,
      [world.practiceId],
      () =>
        client.query(
          `UPDATE packet_version SET attested_by = $2,
                  attestation = jsonb_build_object('format', 'tp-attestation/1', 'checklist', '[]'::jsonb, 'pdf_sha256', export_sha256, 'csv_sha256', export_csv_sha256)
            WHERE id = $1`,
          [version.id, reviewer],
        ),
      reviewer,
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

/**
 * The content of the factory's packet versions: tp-packet/2 with no lines (its case has none), so its deadline
 * is not applicable (the only version that asks for no line; @tp/packets never assembles one).
 */
const SYNTHETIC_PACKET_CONTENT = {
  format: 'tp-packet/2',
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
  deadline: { basis: 'line_windows', ends_on: null, status: 'not_applicable', lines_verified: 0, lines: 0, causes: [], sources: [] },
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
  'eval_example.permission_ref': (context) => dataRightsAgreement(context.client, context.world),
  // A proposal of contract terms names the version it was made for and the document it read.
  'model_proposal.contract_version_id': async (context) => (await context.create('contract_version')).id,
  'model_proposal.source_document_id': async (context) => (await context.create('source_document')).id,
};

/** A signed data-rights agreement of the world's practice: what a permitted evaluation example rests on (migration 20261029090000). */
async function dataRightsAgreement(client: OwnerClient, world: TenantWorld): Promise<string> {
  const id = randomUUID();
  await asOwner(client, [world.practiceId], () =>
    client.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'data_rights', '1', now(), 'SYNTHETIC SIGNER', $4, $5)`,
      [id, world.organizationId, world.practiceId, `agreements/${id}`, 'd'.repeat(64)],
    ),
  );
  return id;
}

/** What a chained row's builder is given: the world, the row's actor, and rows of other tables made in the same world. */
interface Chain {
  readonly client: OwnerClient;
  readonly world: TenantWorld;
  readonly actor: string;
  readonly create: (table: string) => Promise<Row>;
}

/**
 * Tables whose rows only make sense as a link in a chain of other rows the generic fill cannot line up
 * (migration 20261023120000): a ledger match names a claim of the remittance it matches, and a ledger
 * entry carries its standing match's evidence for a line of its case. Each builder makes the rows its
 * row needs in the world (kept) and returns the row's values; as the actor, a person who reconciles
 * postings matches, enters and generates in their own name.
 */
const CHAINED_ROWS: Readonly<Record<string, (chain: Chain) => Promise<Row>>> = {
  // A posting or EFT row is read from a stored export of its kind with a clean scan (migration 20261026090000).
  posting_row: async ({ client, world }) => ({
    practice_id: world.practiceId,
    source_document_id: await storedExport(client, world, 'posting_export'),
    row_no: 1,
    check_or_trace: 'SYNTHETIC-CHECK-1',
    posted_on: new Date().toISOString().slice(0, 10),
    amount_cents: '100',
    raw: JSON.stringify({}),
    template: 'synthetic_pm_export_v1',
    fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'),
  }),
  eft_row: async ({ client, world }) => ({
    practice_id: world.practiceId,
    source_document_id: await storedExport(client, world, 'eft_export'),
    row_no: 1,
    trace: 'SYNTHETIC-TRACE-1',
    deposited_on: new Date().toISOString().slice(0, 10),
    amount_cents: '100',
    fingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0'),
  }),
  ledger_match: async ({ world, actor, create }) => {
    const claim = await create('claim');
    const line = await create('service_line');
    return { practice_id: world.practiceId, kind: 'claim', claim_id: claim.id, remittance_id: claim.remittance_id, service_line_id: line.id, outcome: 'approved', matched_by: actor };
  },
  ledger_entry: async ({ client, world, actor, create }) => {
    const caseLine = await create('case_line');
    const claim = await create('claim');
    const match = await asOwner(
      client,
      [world.practiceId],
      () =>
        client.query(
          `INSERT INTO ledger_match (practice_id, kind, claim_id, remittance_id, service_line_id, outcome, matched_by) VALUES ($1, 'claim', $2, $3, $4, 'approved', $5) RETURNING id`,
          [world.practiceId, claim.id, claim.remittance_id, caseLine.service_line_id, actor],
        ),
      actor,
    );
    return {
      practice_id: world.practiceId,
      case_id: caseLine.case_id,
      service_line_id: caseLine.service_line_id,
      stage: 'approved',
      amount_cents: '100',
      evidence_kind: 'claim',
      evidence_id: claim.id,
      match_id: (match.rows[0] as Row).id,
      effective_on: new Date().toISOString().slice(0, 10),
      created_by: actor,
    };
  },
  roi_statement: ({ world, actor }) =>
    Promise.resolve({
      practice_id: world.practiceId,
      period_from: '2026-04-01',
      period_to: '2026-06-30',
      proof_level: 'posted',
      fees_cents: '0',
      recovered_cents: '0',
      interest_cents: '0',
      approved_unposted_cents: '0',
      actionable_open_cents: '0',
      pursuit_hours: '0.00',
      links: JSON.stringify({ recovered: [], interest: [], approved_unposted: [], actionable_open: [] }),
      generated_by: actor,
    }),
};

/** A posting or EFT export of the world as intake leaves one: uploaded by its administrator, scanned clean and stored. */
async function storedExport(client: OwnerClient, world: TenantWorld, kind: 'posting_export' | 'eft_export'): Promise<string> {
  const { rows } = await asOwner(
    client,
    [world.practiceId],
    () =>
      client.query(
        `INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status)
         VALUES ($1, $2, 100, 'text/csv', $3, $4, 'clean', now(), 'stored') RETURNING id`,
        [world.practiceId, kind, world.adminUserId, randomUUID().replaceAll('-', '').padEnd(64, '0')],
      ),
    world.adminUserId,
  );
  return (rows[0] as { id: string }).id;
}

/**
 * Tables only a practice job writes (no person may: migration 20261026090000): a posting or EFT row is
 * read from its export by the reconcile job. Their rows are written, and probed, as a job of the world.
 */
const JOB_WRITTEN: ReadonlySet<string> = new Set(['posting_row', 'eft_row']);

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

  /** Who writes a row of `table` for `world`: its administrator, a holder of the role the table needs, or a job of the world. */
  async actorFor(client: OwnerClient, table: string, world: TenantWorld): Promise<string> {
    if (JOB_WRITTEN.has(table)) {
      const key = `${world.practiceId} job`;
      const job = this.worldActors.get(key) ?? randomUUID();
      this.worldActors.set(key, job);
      return job;
    }
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
    const chained = CHAINED_ROWS[table];
    for (const full of [false, true, true, true]) {
      const values =
        chained === undefined ? await this.values(client, table, world, full, depth, actor) : await chained({ client, world, actor, create: (other) => this.create(client, other, world, depth + 1) });
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
      if (SAME_AS[`${table}.${column.name}`] !== undefined || DERIVED_VALUES[`${table}.${column.name}`] !== undefined || DATABASE_STAMPED.has(`${table}.${column.name}`)) {
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
