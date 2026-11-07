import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, PracticeCipher, databaseClient, openPool, withJobScope, workerDevLoginUrl } from '@tp/db';
import { endPool } from '@tp/db/testing';
import { partialShare } from '@tp/ledger';
import { type Cents, ZERO_CENTS, cents } from '@tp/money';
import { createLogger } from '@tp/observability';

import type { JobContext } from '../../jobs/handlers';
import type { Practice } from '../../price/test-support/pricing-world';
import { type Scope, ledgerEntries, ledgerMatches } from '../ledger';
import type { ReconcileServices, ReconcileSummary } from '../pass';
import { chainContext } from '../remittances';
import type { BuiltWorld } from './pass-world';
import { lineChain } from './per-line';

/**
 * CAS-49's comparison (SUITE-CAP-3 D13; docs/adr/0087; design section 7): a generated practice, built once, is cloned
 * (`CREATE DATABASE … TEMPLATE`) so that each side runs one pass from the same rows: the per-line reference
 * (test-support/per-line.ts, referencePass), the shipped pass (reconcilePractice), or a self-check mutant of the shipped
 * pass. Each side's pass runs on the worker's own login in a job scope whose statements a proxy records in issue order
 * with their parameters and returned rows; the test's wrapper over PracticeCipher.decrypt records which claim's patient
 * control number each side decrypted, and in which phase. Then the two sides' writes are compared, with:
 *
 * - every row a side wrote given an ordinal in insertion order, never by ctid (review round 2): ledger_entry and
 *   line_status by seq, whose values are compared too; posting_row and eft_row by their export and row number; every
 *   other table's single-row inserts by the order their RETURNING ids came back; the rest (audit_event's and the
 *   recoupment notification's multi-row inserts without RETURNING) as the issue-ordered sequence of their statements and
 *   a multiset of canonical rows; each new UUID anywhere replaced by its row's ordinal, timestamps by their presence;
 * - every encrypted value compared as the SHA-256 of its plaintext, decrypted in memory with the practice's cipher under
 *   its own column (review round 4), never by presence and never byte for byte; a null stays null;
 * - the posted and deposited entries settleMatches writes, which follow ledgerMatches' order (matched_at, then the random
 *   match id; section 5.2), compared as a set, with that order checked on each side; and for a check with two or more
 *   allocated check-level postings matched in the pass, whose amounts follow that order, each side's entries replayed
 *   against partialShare in its own order and the two sides' totals per line and stage compared (the settle rule). Two
 *   deviations from section 7's words, both recorded for slice 4: the totals per posting row are not compared, because
 *   a row's total is the sum of its partialShare over the lines, which follows the cumulative amount posted ahead of it
 *   and so the random order itself (only a line's total over all the rows telescopes to an order-free amount); and the
 *   replay applies no cap, because the generator keeps every cap from biting on a partial check, and a cap that bit
 *   would make the replay itself fail on both sides rather than pass unseen. What the rule cannot see, D6's running sum
 *   order for order (each match's `before`, which a row's total follows), settle-order.test.ts holds exactly (slice 4);
 * - the claims whose patient control numbers each side decrypted in the search, equal as sets, and in the postings phase
 *   within the reference's and never more often (review round 1), and each claim at most once (D7, slice 4: a pass reads
 *   and decrypts a remittance's claims once, however many posting rows name it); the reference compared with itself is
 *   held to the first two only (CompareOptions.postingsDecryptOnce), since the per-line postings decrypt a remittance's
 *   claims once for every row that names it.
 *
 * A difference names its table, the row's ordinal and the column, never a value: no identifier, plaintext or hash is
 * logged or printed.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const CIPHERTEXT = /^enc:v1:/;

/** One statement a side's pass issued, in issue order. */
export interface Statement {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly rows: readonly Record<string, unknown>[];
}

/** What a query resolves to, as the reconcile step reads it. */
export interface QueryResult {
  readonly rows: Record<string, unknown>[];
  readonly rowCount: number | null;
}

export type Query = (text: string, values: readonly unknown[]) => Promise<QueryResult>;

/** A fault injected at the statement boundary of the shipped pass: the self-check mutants (design section 7). */
export type Middleware = (next: Query) => Query;

/** Which part of the pass a decrypt fell in, from the statements issued before it. */
type Phase = 'before' | 'search' | 'postings';

interface Decrypt {
  readonly phase: Phase;
  readonly column: string;
  readonly ciphertext: string;
}

/** What one side of a comparison ran and wrote. */
export interface SideResult {
  readonly name: string;
  readonly summary: ReconcileSummary;
  readonly statements: readonly Statement[];
  readonly decrypts: readonly Decrypt[];
  /** Each practice table's rows after the pass, as JSON text. */
  readonly after: ReadonlyMap<string, readonly Record<string, unknown>[]>;
  /** The partial checks' entries replayed in this side's ledgerMatches order: the differences found. */
  readonly replay: readonly string[];
}

export type Pass = (context: JobContext, services: ReconcileServices, practiceId: string) => Promise<ReconcileSummary>;

/** What a side needs of a built world: its database, services and practice (a generated world, or CAS-49.6's fixed one). */
export type WorldOf = Pick<BuiltWorld, 'world' | 'practice'>;

/**
 * The side the decrypt wrapper is recording for, carried by the side's own async context rather than a module variable:
 * a side whose test timed out keeps running after vitest moves on, and its decrypts must never land in a later side's
 * record (a 25-run harness run showed one hung run turning every later run's decrypt comparison red).
 */
const recording = new AsyncLocalStorage<{ readonly decrypts: Decrypt[]; readonly phase: () => Phase }>();
let wrapped = false;

/** Wraps PracticeCipher.decrypt once for the process: each call is recorded for the side running, never logged. */
function wrapDecrypt(): void {
  if (wrapped) {
    return;
  }
  wrapped = true;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype's own method, called with its receiver below
  const original = PracticeCipher.prototype.decrypt;
  PracticeCipher.prototype.decrypt = function decrypt(this: PracticeCipher, column, ciphertext) {
    const side = recording.getStore();
    if (side !== undefined) {
      side.decrypts.push({ phase: side.phase(), column, ciphertext });
    }
    return original.call(this, column, ciphertext);
  };
}

/** A world's database, and the URLs of a clone of it. */
interface Database {
  readonly name: string;
  readonly url: string;
}

const withName = (url: string, name: string) => {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
};

/** The tables a pass writes and reads, whose autovacuum is held off in the template so neither side is vacuumed mid-run. */
async function practiceTables(client: DatabaseClient): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'practice_id' AND t.table_type = 'BASE TABLE' ORDER BY c.table_name`,
  );
  return rows.map((row) => row.table_name);
}

/**
 * Freezes a built world into a template: autovacuum off on its practice tables, statistics taken once, every
 * connection of the world's own closed (a template takes no other session), and returns the database to clone from.
 * The world's key provider and document store live in memory and stay usable.
 */
export async function template(built: WorldOf): Promise<Database> {
  const pricing = built.world.triage.pricing;
  for (const table of await practiceTables(pricing.owner)) {
    await pricing.owner.query(`ALTER TABLE public."${table}" SET (autovacuum_enabled = false)`);
  }
  // Statistics taken here, once, so every clone plans from the same ones: left to autoanalyze, whether a table had any
  // when the world was frozen depended on timing, and a world frozen before it ran planned the base's candidate search
  // with none at all, slowly enough to time a run out (two 25-run harness runs, each at the same run).
  await pricing.owner.query('ANALYZE');
  await endPool(pricing.app);
  await endPool(pricing.worker);
  await pricing.owner.end();
  return { name: pricing.database.name, url: pricing.database.url };
}

/** A clone of the template, and a drop for it. */
export async function clone(adminUrl: string, from: Database): Promise<Database & { drop: () => Promise<void> }> {
  const name = `tp_test_${randomUUID().replaceAll('-', '')}`;
  const admin = databaseClient(adminUrl);
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${from.name}`);
  } finally {
    await admin.end();
  }
  return {
    name,
    url: withName(from.url, name),
    drop: async () => {
      const dropper = databaseClient(adminUrl);
      await dropper.connect();
      try {
        await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}

/** Every practice table's rows, as JSON, read as the superuser (the practice's rows only). */
async function rowsOf(client: DatabaseClient, practiceId: string): Promise<Map<string, Record<string, unknown>[]>> {
  const result = new Map<string, Record<string, unknown>[]>();
  for (const table of await practiceTables(client)) {
    const { rows } = await client.query<{ j: Record<string, unknown> }>(`SELECT row_to_json(t) AS j FROM public."${table}" t WHERE t.practice_id = $1`, [practiceId]);
    result.set(
      table,
      rows.map((row) => row.j),
    );
  }
  return result;
}

/** The ids each practice table held before the pass (the template's; the same on every clone). */
export async function idsBefore(url: string, practiceId: string): Promise<Map<string, Set<string>>> {
  const client = databaseClient(url);
  await client.connect();
  try {
    const rows = await rowsOf(client, practiceId);
    return new Map([...rows].map(([table, list]) => [table, new Set(list.map((row) => String(row.id)))]));
  } finally {
    await client.end();
  }
}

/** caseLines' read: the remittances' step, and so the search, begins. */
const CASE_LINES = /FROM case_line cl JOIN "case" k/;
/** The first read of the posting rows themselves (never a column naming them): the postings' step begins. */
const POSTING_ROWS = /\b(FROM|JOIN)\s+posting_row\b/;

/**
 * Runs `pass` on the database at `url` in a job scope on the worker's login, through the statement proxy (and the
 * middleware, for a mutant), recording its statements and decrypts; then reads the practice's rows and replays the
 * partial checks' settle entries in this side's own order.
 */
export async function runSide(
  name: string,
  url: string,
  built: WorldOf,
  jobId: string,
  pass: Pass,
  options: { readonly middleware?: Middleware; readonly before?: (client: DatabaseClient) => Promise<void> } = {},
): Promise<SideResult> {
  wrapDecrypt();
  const pool: DatabasePool = openPool(workerDevLoginUrl(url), 4);
  const superuser = databaseClient(url);
  await superuser.connect();
  const statements: Statement[] = [];
  const decrypts: Decrypt[] = [];
  let phase: Phase = 'before';
  try {
    await options.before?.(superuser);
    const context: JobContext = {
      jobId,
      logger: createLogger({ sink: () => undefined }),
      enqueue: () => Promise.resolve(null),
      lastAttempt: false,
      transaction: (work) =>
        withJobScope(pool, { jobId, practiceId: built.practice.practiceId }, (scope) => {
          const client = scope.client;
          const issue: Query = async (text, values) => {
            if (phase === 'before' && CASE_LINES.test(text)) {
              phase = 'search';
            } else if (phase === 'search' && POSTING_ROWS.test(text)) {
              phase = 'postings';
            }
            const result = await client.query(text, values as unknown[]);
            statements.push({ text, values, rows: /^\s*INSERT/i.test(text) && /RETURNING/i.test(text) ? (result.rows as Record<string, unknown>[]) : [] });
            return result;
          };
          const query = options.middleware === undefined ? issue : options.middleware(issue);
          const proxied = new Proxy(client, {
            get(target, property, receiver) {
              if (property === 'query') {
                return (text: string | { text: string; values?: unknown[] }, values?: unknown[]) =>
                  typeof text === 'string' ? query(text, values ?? []) : query(text.text, text.values ?? []);
              }
              const value: unknown = Reflect.get(target, property, receiver);
              return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
            },
          });
          Object.defineProperty(scope, 'client', { value: proxied, configurable: true, writable: true });
          return work(scope);
        }),
    };
    const summary = await recording.run({ decrypts, phase: () => phase }, () =>
      pass(context, { documents: built.world.services.documents, keys: built.world.services.keys }, built.practice.practiceId),
    );
    const after = await rowsOf(superuser, built.practice.practiceId);
    const replay = await replayPartialChecks(pool, built.practice, after);
    return { name, summary, statements, decrypts, after, replay };
  } finally {
    await superuser.end();
    await endPool(pool);
  }
}

/** A remittance's check-level allocated posting matches (the partial ones) written by a pass. */
function partialChecks(after: ReadonlyMap<string, readonly Record<string, unknown>[]>, before: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const newMatches = (after.get('ledger_match') ?? []).filter((row) => !(before.get('ledger_match')?.has(String(row.id)) ?? false));
  const count = new Map<string, number>();
  for (const match of newMatches) {
    if (match.kind === 'posting' && match.level === 'check' && match.allocated === true && match.reversed_at === null) {
      count.set(String(match.remittance_id), (count.get(String(match.remittance_id)) ?? 0) + 1);
    }
  }
  return new Set([...count].filter(([, n]) => n >= 2).map(([remittanceId]) => remittanceId));
}

/**
 * The settle rule's replay (design section 7, 5.2): each partial check's posted entries, walked in this side's own
 * ledgerMatches order, are partialShare of each line's share of the check (what the line's chain nets on it, as
 * settleMatches' shares compute it) after the check's check-level postings ahead of each, uncapped (the generator keeps
 * every cap from biting on its partial checks, so a cap that bit fails the replay on both sides). The chain is walked
 * with the per-line reference's lineChain (the filter form), never the code under test's, which D5 changes. Returns the
 * differences, by match and line ordinal, never a value.
 */
async function replayPartialChecks(pool: DatabasePool, practice: Practice, after: ReadonlyMap<string, readonly Record<string, unknown>[]>): Promise<string[]> {
  const problems: string[] = [];
  await withJobScope(pool, { jobId: randomUUID(), practiceId: practice.practiceId }, async (inner) => {
    const scope = inner as Scope;
    const matches = await ledgerMatches(scope, practice.practiceId);
    const entries = await ledgerEntries(scope, practice.practiceId);
    const caseLines = (after.get('case_line') ?? []).map((row) => ({ serviceLineId: String(row.service_line_id) }));
    const claimOf = new Map((after.get('service_line') ?? []).map((row) => [String(row.id), String(row.claim_id)]));
    const context = await chainContext(
      scope,
      practice.practiceId,
      caseLines.map((line) => claimOf.get(line.serviceLineId) as string),
      entries,
    );
    const payments = new Map((after.get('remittance') ?? []).map((row) => [String(row.id), BigInt(String(row.bpr02_cents))]));
    const amounts = new Map((after.get('posting_row') ?? []).map((row) => [String(row.id), BigInt(String(row.amount_cents))]));
    const checkLevel = matches.filter((match) => match.standing && match.kind === 'posting' && match.level === 'check');
    const byRemittance = new Map<string, Set<string>>();
    for (const match of checkLevel) {
      byRemittance.set(match.remittanceId, new Set([...(byRemittance.get(match.remittanceId) ?? []), match.id]));
    }
    for (const [remittanceId, ids] of byRemittance) {
      if ([...ids].filter((id) => matches.find((match) => match.id === id)?.allocated === true).length < 2) {
        continue;
      }
      const share = new Map<string, Cents>();
      for (const line of caseLines) {
        const chain = lineChain(context, { serviceLineId: line.serviceLineId, claimId: claimOf.get(line.serviceLineId) as string });
        for (const claim of chain?.claims ?? []) {
          if (claim.match !== null && claim.match.remittanceId === remittanceId) {
            share.set(line.serviceLineId, cents((share.get(line.serviceLineId) ?? ZERO_CENTS) + (chain?.chain.net.get(claim.match.id) ?? ZERO_CENTS)));
          }
        }
      }
      let before = ZERO_CENTS;
      for (const [index, match] of checkLevel.filter((item) => item.remittanceId === remittanceId).entries()) {
        const amount = cents(amounts.get(match.postingRowId as string) ?? 0n);
        for (const [serviceLineId, lineShare] of share) {
          if (lineShare <= ZERO_CENTS) {
            continue;
          }
          const expected = match.allocated ? partialShare(lineShare, before, amount, cents(payments.get(remittanceId) ?? 0n)) : lineShare;
          const written = entries.filter((entry) => entry.matchId === match.id && entry.serviceLineId === serviceLineId && entry.stage === 'posted').reduce((sum, entry) => sum + entry.amountCents, 0n);
          if (written !== (expected > ZERO_CENTS ? expected : ZERO_CENTS)) {
            problems.push(`settle replay: check-level posting ${String(index)} of a partial check posts other than partialShare in this side's order`);
          }
        }
        before = cents(before + amount);
      }
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------------------------------------

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Each new row's label on one side: by seq, by export row, or by the order its insert returned its id. */
function labels(side: SideResult, before: ReadonlyMap<string, ReadonlySet<string>>): Map<string, string> {
  const label = new Map<string, string>();
  const isNew = (table: string, row: Record<string, unknown>) => !(before.get(table)?.has(String(row.id)) ?? false);
  for (const [table, rows] of side.after) {
    const fresh = rows.filter((row) => isNew(table, row) && row.id !== undefined);
    if (table === 'ledger_entry' || table === 'line_status') {
      fresh.sort((a, b) => Number(BigInt(String(a.seq)) - BigInt(String(b.seq))));
      fresh.forEach((row, index) => label.set(String(row.id), `${table}#${String(index)}`));
    } else if (table === 'posting_row' || table === 'eft_row') {
      fresh.sort((a, b) => String(a.source_document_id).localeCompare(String(b.source_document_id)) || Number(a.row_no) - Number(b.row_no));
      fresh.forEach((row, index) => label.set(String(row.id), `${table}#${String(index)}`));
    }
  }
  // Single-row inserts that return their id: their order of issue.
  const issued = new Map<string, number>();
  for (const statement of side.statements) {
    const table = /^\s*INSERT\s+INTO\s+"?(\w+)"?/i.exec(statement.text)?.[1];
    for (const row of statement.rows) {
      if (table !== undefined && typeof row.id === 'string' && !label.has(row.id)) {
        const n = issued.get(table) ?? 0;
        issued.set(table, n + 1);
        label.set(row.id, `${table}#${String(n)}`);
      }
    }
  }
  return label;
}

/** A row as both sides can compare it: new UUIDs by label, timestamps by presence, encrypted text by its plaintext's hash. */
function canonical(table: string, row: Record<string, unknown>, label: ReadonlyMap<string, string>, cipher: PracticeCipher, drop: readonly string[] = []): string {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (drop.includes(column)) {
      continue;
    }
    if (typeof value === 'string' && CIPHERTEXT.test(value)) {
      out[column] = `sha256:${sha(withoutRecording(() => cipher.decrypt(`${table}.${column}` as Parameters<PracticeCipher['decrypt']>[0], value)))}`;
    } else if (typeof value === 'string' && TIMESTAMP.test(value)) {
      out[column] = 'timestamp';
    } else {
      out[column] = value;
    }
  }
  return JSON.stringify(out).replace(UUID, (id) => label.get(id) ?? id);
}

/** Runs `run` outside any side's record: the comparison's own decrypts are not the pass's. */
function withoutRecording<T>(run: () => T): T {
  return recording.exit(run);
}

/** The posted and deposited entries settleMatches wrote in the pass: their order follows the random match ids. */
const isSettle = (row: Record<string, unknown>) => (row.stage === 'posted' || row.stage === 'deposited') && row.created_by === null;

const multiset = (items: readonly string[]) => [...items].sort();

export interface Comparison {
  /** Differences, each naming a table, an ordinal and a column (or what was compared), never a value. */
  readonly differences: readonly string[];
  /** Whether a partial check (two or more allocated check-level postings in the pass) was in the world. */
  readonly partialCheck: boolean;
  /** Whether the settle entries would have differed had they been compared row for row in seq order. */
  readonly strictSettleWouldDiffer: boolean;
}

/**
 * CAS-49.6's view of a side's stage rows (design section 7, review round 3): each line_status row the pass wrote has its
 * seq replaced by its label (its ordinal in seq order), and each head row pointing at one of them by that same label. A
 * statement rolled back keeps the sequence values it drew (the rows' defaults and the head rows' nextval; 5.2), so after
 * a deadlock's retry the values differ from the reference's while the order must not: the order is what is compared.
 */
function seqAsOrder(after: ReadonlyMap<string, readonly Record<string, unknown>[]>, label: ReadonlyMap<string, string>, before: ReadonlyMap<string, ReadonlySet<string>>): Map<string, readonly Record<string, unknown>[]> {
  const events = after.get('line_status') ?? [];
  const ordinal = new Map(events.filter((row) => !(before.get('line_status')?.has(String(row.id)) ?? false)).map((row) => [String(row.seq), label.get(String(row.id)) ?? '']));
  const bySeq = (row: Record<string, unknown>) => (ordinal.has(String(row.seq)) ? { ...row, seq: ordinal.get(String(row.seq)) } : row);
  const next = new Map(after);
  next.set('line_status', events.map(bySeq));
  next.set('line_status_head', (after.get('line_status_head') ?? []).map(bySeq));
  return next;
}

export interface CompareOptions {
  /** CAS-49.6: line_status and line_status_head compared by their seq order, not their seq values (seqAsOrder). */
  readonly seqByOrder?: boolean;
  /**
   * Whether the compared side must decrypt each claim's patient control number at most once in the postings phase
   * (design section 7; D7, slice 4): true unless the compared side is the per-line reference itself (the settle rule's
   * own proof), whose postings decrypt a remittance's claims once for every row that names it, as the base does.
   */
  readonly postingsDecryptOnce?: boolean;
}

/** Compares a side with the reference (design section 7, CAS-49.1; CAS-49.6 with seqByOrder). */
export function compare(reference: SideResult, side: SideResult, before: ReadonlyMap<string, ReadonlySet<string>>, practice: Practice, options: CompareOptions = {}): Comparison {
  const differences: string[] = [];
  const refLabel = labels(reference, before);
  const sideLabel = labels(side, before);
  const refAfter = options.seqByOrder === true ? seqAsOrder(reference.after, refLabel, before) : reference.after;
  const sideAfter = options.seqByOrder === true ? seqAsOrder(side.after, sideLabel, before) : side.after;
  const isNew = (table: string, row: Record<string, unknown>) => !(before.get(table)?.has(String(row.id)) ?? false);
  const partial = partialChecks(reference.after, before);
  const inPartial = (row: Record<string, unknown>, after: ReadonlyMap<string, readonly Record<string, unknown>[]>) => {
    const match = (after.get('ledger_match') ?? []).find((item) => item.id === row.match_id);
    return match !== undefined && partial.has(String(match.remittance_id));
  };
  let strictSettleWouldDiffer = false;

  const tables = new Set([...reference.after.keys(), ...side.after.keys()]);
  for (const table of tables) {
    const refRows = refAfter.get(table) ?? [];
    const sideRows = sideAfter.get(table) ?? [];
    if (table === 'ledger_entry') {
      const ordered = (rows: readonly Record<string, unknown>[], label: ReadonlyMap<string, string>) =>
        rows
          .filter((row) => isNew(table, row) && !isSettle(row))
          .sort((a, b) => Number(BigInt(String(a.seq)) - BigInt(String(b.seq))))
          .map((row) => canonical(table, row, label, practice.cipher));
      const a = ordered(refRows, refLabel);
      const b = ordered(sideRows, sideLabel);
      compareLists(table, a, b, differences);
      const settle = (rows: readonly Record<string, unknown>[], label: ReadonlyMap<string, string>, after: ReadonlyMap<string, readonly Record<string, unknown>[]>, partialToo: boolean) =>
        multiset(rows.filter((row) => isNew(table, row) && isSettle(row) && (partialToo || !inPartial(row, after))).map((row) => canonical(table, row, label, practice.cipher, ['id', 'seq'])));
      compareLists('ledger_entry (settled, as a set)', settle(refRows, refLabel, reference.after, false), settle(sideRows, sideLabel, side.after, false), differences);
      strictSettleWouldDiffer = JSON.stringify(settle(refRows, refLabel, reference.after, true)) !== JSON.stringify(settle(sideRows, sideLabel, side.after, true));
      const seqs = (rows: readonly Record<string, unknown>[]) => multiset(rows.filter((row) => isNew(table, row) && isSettle(row)).map((row) => String(row.seq)));
      compareLists('ledger_entry (settled seq values)', seqs(refRows), seqs(sideRows), differences);
      // The partial checks' entries: totals per line and stage (the replay checks each side's own order).
      const totals = (rows: readonly Record<string, unknown>[], after: ReadonlyMap<string, readonly Record<string, unknown>[]>) => {
        const sum = new Map<string, bigint>();
        for (const row of rows.filter((item) => isNew(table, item) && isSettle(item) && inPartial(item, after))) {
          const key = `${String(row.service_line_id)} ${String(row.stage)}`;
          sum.set(key, (sum.get(key) ?? 0n) + BigInt(String(row.amount_cents)));
        }
        return multiset([...sum].map(([key, total]) => `${key} ${String(total)}`));
      };
      compareLists('ledger_entry (partial checks, totals per line and stage)', totals(refRows, reference.after), totals(sideRows, side.after), differences);
      for (const [name, result] of [
        ['reference', reference],
        ['side', side],
      ] as const) {
        differences.push(...result.replay.map((problem) => `${name}: ${problem}`));
        differences.push(...settleOrder(result, before).map((problem) => `${name}: ${problem}`));
      }
      continue;
    }
    if (table === 'line_status' || table === 'ledger_match' || table === 'payer_response') {
      const ordered = (rows: readonly Record<string, unknown>[], label: ReadonlyMap<string, string>) =>
        rows
          .filter((row) => isNew(table, row))
          .map((row) => ({ label: label.get(String(row.id)) ?? '', text: canonical(table, row, label, practice.cipher) }))
          .sort((x, y) => Number(x.label.split('#')[1] ?? -1) - Number(y.label.split('#')[1] ?? -1))
          .map((item) => item.text);
      compareLists(table, ordered(refRows, refLabel), ordered(sideRows, sideLabel), differences);
      const old = (rows: readonly Record<string, unknown>[], label: ReadonlyMap<string, string>) => multiset(rows.filter((row) => !isNew(table, row)).map((row) => canonical(table, row, label, practice.cipher)));
      compareLists(`${table} (rows before the pass)`, old(refRows, refLabel), old(sideRows, sideLabel), differences);
      continue;
    }
    compareLists(`${table} (as a multiset)`, multiset(refRows.map((row) => canonical(table, row, refLabel, practice.cipher, ['id']))), multiset(sideRows.map((row) => canonical(table, row, sideLabel, practice.cipher, ['id']))), differences);
  }

  // Multi-row inserts without RETURNING (audit_event, the recoupment notification): the same statements in the same order.
  const multiRow = (result: SideResult, label: ReadonlyMap<string, string>) =>
    result.statements
      .filter((statement) => /^\s*INSERT\s+INTO\s+"?(audit_event|notification)\b/i.test(statement.text) && !/RETURNING/i.test(statement.text))
      .map((statement) => `${statement.text} ${JSON.stringify(statement.values, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value))}`.replace(UUID, (id) => label.get(id) ?? id));
  compareLists('multi-row inserts (issue order)', multiRow(reference, refLabel), multiRow(side, sideLabel), differences);

  // The summary counts.
  const summary = (result: SideResult, label: ReadonlyMap<string, string>) => JSON.stringify(result.summary, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value)).replace(UUID, (id) => label.get(id) ?? id);
  if (summary(reference, refLabel) !== summary(side, sideLabel)) {
    differences.push('the pass summary differs');
  }

  // The claims whose patient control numbers were decrypted: in the search, the same set; in the postings, within the
  // reference's and never more often.
  const claimOf = new Map((reference.after.get('claim') ?? []).map((row) => [String(row.patient_control_number), String(row.id)]));
  const claimsIn = (result: SideResult, phase: Phase) => {
    const counted = new Map<string, number>();
    for (const decrypt of result.decrypts) {
      if (decrypt.phase === phase && decrypt.column === 'claim.patient_control_number') {
        const claim = claimOf.get(decrypt.ciphertext) ?? 'a claim the reference never read';
        counted.set(claim, (counted.get(claim) ?? 0) + 1);
      }
    }
    return counted;
  };
  const refSearch = claimsIn(reference, 'search');
  if (refSearch.size === 0) {
    // The harness's own check: a world whose open lines have candidates decrypts some in the search.
    differences.push('search decrypts: none recorded on the reference side');
  }
  const sideSearch = claimsIn(side, 'search');
  const missing = [...refSearch.keys()].filter((claim) => !sideSearch.has(claim)).length;
  const extra = [...sideSearch.keys()].filter((claim) => !refSearch.has(claim)).length;
  if (missing > 0 || extra > 0) {
    differences.push(`search decrypts: the set of claims differs (${String(missing)} missing, ${String(extra)} extra)`);
  }
  const refPostings = claimsIn(reference, 'postings');
  for (const [claim, n] of claimsIn(side, 'postings')) {
    if (n > (refPostings.get(claim) ?? 0)) {
      differences.push('postings decrypts: a claim decrypted more often than the reference, or one it never read');
    }
    if (options.postingsDecryptOnce !== false && n > 1) {
      differences.push('postings decrypts: a claim decrypted more than once (D7)');
    }
  }
  return { differences, partialCheck: partial.size > 0, strictSettleWouldDiffer };
}

/** The settle entries in seq order follow this side's ledgerMatches order (matched_at, id): the rule both sides hold. */
function settleOrder(result: SideResult, before: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const matches = (result.after.get('ledger_match') ?? []).filter((row) => row.reversed_at === null);
  // matched_at as row_to_json writes it, its fraction padded to microseconds; then the id, compared as PostgreSQL compares UUIDs.
  const at = (row: Record<string, unknown>) => String(row.matched_at).replace(/^([^.+]*)(?:\.(\d+))?/, (_whole, head: string, fraction: string | undefined) => `${head}.${(fraction ?? '').padEnd(6, '0')}`);
  const order = [...matches].sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const position = new Map(order.map((row, index) => [String(row.id), index]));
  const settled = (result.after.get('ledger_entry') ?? [])
    .filter((row) => isSettle(row) && !(before.get('ledger_entry')?.has(String(row.id)) ?? false))
    .sort((a, b) => Number(BigInt(String(a.seq)) - BigInt(String(b.seq))));
  let last = -1;
  for (const row of settled) {
    const at = position.get(String(row.match_id)) ?? -1;
    if (at < last) {
      return ['the settle entries do not follow ledgerMatches order'];
    }
    last = at;
  }
  return [];
}

/** Records each position where two canonical lists part, by index only. */
function compareLists(name: string, a: readonly string[], b: readonly string[], differences: string[]): void {
  if (a.length !== b.length) {
    differences.push(`${name}: ${String(a.length)} rows against ${String(b.length)}`);
  }
  const n = Math.min(a.length, b.length);
  for (let index = 0; index < n; index += 1) {
    if (a[index] !== b[index]) {
      differences.push(`${name}: row ${String(index)} differs in ${differingKeys(a[index] as string, b[index] as string).join(', ') || 'its text'}`);
    }
  }
}

/** The columns two canonical rows differ in (names only). */
function differingKeys(a: string, b: string): string[] {
  try {
    const x = JSON.parse(a) as Record<string, unknown>;
    const y = JSON.parse(b) as Record<string, unknown>;
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((key) => JSON.stringify(x[key]) !== JSON.stringify(y[key]));
  } catch {
    return [];
  }
}

