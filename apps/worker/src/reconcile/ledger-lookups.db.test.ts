import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { reverseMatch } from './manual';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * The ledger's two lookups (migration 20261113090000; docs/adr/0087, the note of 2026-11-11): `ledger_line_net` reads
 * one line's entries, and `ledger_entry_rules` reads an entry's one match. The founder's ledger freeze exception of
 * 2026-11-06 lets their bodies change only if every answer and every refusal stays what it was, so each case here is
 * true of the bodies before the migration and of the bodies after it, except the last group, which is what the
 * migration is for: on a ledger the planner has no statistics for, each lookup reads through the index that finds its
 * row. Every practice is a SYNTHETIC LED-04 world: its original payment priced and triaged into a case, the adjusted
 * remittance approving the line, and the posting export posting it, so the ledger holds a claim match and a posting
 * match with an entry from each.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
  // Before the first ledger row: nothing analyzes the two ledger tables in this file's own database, so the last
  // group plans on a ledger with rows and no statistics, as a reconcile pass does inside its own transaction.
  await w.owner.query('ALTER TABLE ledger_entry SET (autovacuum_enabled = false)');
  await w.owner.query('ALTER TABLE ledger_match SET (autovacuum_enabled = false)');
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Posted {
  readonly practice: Practice;
  readonly caseId: string;
  readonly serviceLineId: string;
  /** The posted entry, its posting match and the posting row both carry. */
  readonly entryId: string;
  readonly matchId: string;
  readonly rowId: string;
  readonly amountCents: string;
}

/** A practice whose LED-04 line is approved and then posted (proof at the posting). */
async function posted(label: string): Promise<Posted> {
  const practice = await w.practice(`${label} ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
  const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-04/original.835');
  await w.load(practice, 'LED-04/adjusted.835');
  await w.reconcile(practice);
  await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export') });
  const entries = await w.rows<{ id: string; match_id: string; evidence_id: string; amount_cents: string }>(
    practice,
    "SELECT id, match_id, evidence_id, amount_cents::text AS amount_cents FROM ledger_entry WHERE stage = 'posted'",
  );
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  return { practice, caseId, serviceLineId, entryId: entry?.id ?? '', matchId: entry?.match_id ?? '', rowId: entry?.evidence_id ?? '', amountCents: entry?.amount_cents ?? '' };
}

/** What a statement came to: accepted, or the refusal's SQLSTATE and message. */
function settle(attempt: Promise<unknown>): Promise<'accepted' | { readonly code: string | undefined; readonly message: string }> {
  return attempt.then(
    () => 'accepted' as const,
    (error: unknown) => ({ code: (error as { code?: string }).code, message: (error as Error).message }),
  );
}

const NOT_STANDING = { code: '23514', message: 'an entry comes from a standing match' };
const NOT_CORRECTED = { code: '23514', message: "a correction is of an entry whose match stands; a reversed match's entries are never corrected again" };

const INSERT_POSTED =
  "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on) VALUES ($1, $2, $3, 'posted', $4, 'posting_row', $5, $6, '2026-06-11')";
const INSERT_ADJUSTED =
  "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, created_by, reason) VALUES ($1, $2, $3, 'adjusted', -500, 'ledger_entry', $4, $5, $6, $7)";

/**
 * A posted entry written by a job in `of`'s scope, naming `matchId` and the row `rowId` as its evidence. `alsoInScope`
 * widens the transaction's scope to further practices first, which no job does (a job runs for one practice): it is how
 * another practice's match becomes a row the lookup can see.
 */
function jobPosts(of: Posted, matchId: string | null, rowId: string, alsoInScope: readonly Practice[] = []) {
  return settle(
    withJobScope(w.app, { jobId: randomUUID(), practiceId: of.practice.practiceId }, async (scope) => {
      if (alsoInScope.length > 0) {
        await scope.client.query("SELECT set_config('app.practice_ids', $1::uuid[]::text, true)", [[of.practice.practiceId, ...alsoInScope.map((other) => other.practiceId)]]);
      }
      await scope.client.query(INSERT_POSTED, [of.practice.practiceId, of.caseId, of.serviceLineId, of.amountCents, rowId, matchId]);
    }),
  );
}

/** An adjustment of `of`'s posted entry written by the specialist, naming `matchId` as the entry's match. */
function specialistAdjusts(of: Posted, matchId: string) {
  return settle(
    withPracticeScope(w.app, { actorId: w.specialist, practiceIds: [of.practice.practiceId] }, (scope) =>
      scope.client.query(INSERT_ADJUSTED, [of.practice.practiceId, of.caseId, of.serviceLineId, of.entryId, matchId, w.specialist, of.practice.cipher.encrypt('ledger_entry.reason', 'SYNTHETIC review')]),
    ),
  );
}

const reverse = (of: Posted) => w.manual(of.practice, (context) => reverseMatch(context, { practiceId: of.practice.practiceId, matchId: of.matchId, reason: 'SYNTHETIC wrong check' }));

describe('an entry’s match, as ledger_entry_rules reads it: the same entries refused with the same error', () => {
  it('refuses an entry that names no match, or a match that is no row', async () => {
    const a = await posted('no match');
    expect(await jobPosts(a, null, a.rowId)).toEqual(NOT_STANDING);
    expect(await jobPosts(a, randomUUID(), a.rowId)).toEqual(NOT_STANDING);
  });

  it('refuses an entry that names another practice’s standing match, even with both practices in scope and that match’s own row as its evidence', async () => {
    const a = await posted('own practice');
    const b = await posted('other practice');
    // With one practice in scope the tenant policy hides the other practice's match: no row.
    expect(await jobPosts(a, b.matchId, b.rowId)).toEqual(NOT_STANDING);
    // With both in scope the match is a row the lookup reads (one row, standing), and it is refused as another practice's.
    const seen = await withJobScope(w.app, { jobId: randomUUID(), practiceId: a.practice.practiceId }, async (scope) => {
      await scope.client.query("SELECT set_config('app.practice_ids', $1::uuid[]::text, true)", [[a.practice.practiceId, b.practice.practiceId]]);
      return (await scope.client.query<{ practice_id: string; standing: boolean }>('SELECT practice_id, reversed_at IS NULL AS standing FROM ledger_match WHERE id = $1', [b.matchId])).rows;
    });
    expect(seen).toEqual([{ practice_id: b.practice.practiceId, standing: true }]);
    expect(await jobPosts(a, b.matchId, b.rowId, [b.practice])).toEqual(NOT_STANDING);
    // The practice's own standing match, in the same widened scope, is read and passes this check: the next refusal
    // is the row's own bound (the row is already posted in full), so the widened scope alone refuses nothing here.
    const own = await jobPosts(a, a.matchId, a.rowId, [b.practice]);
    expect(own).not.toBe('accepted');
    expect(own).not.toEqual(NOT_STANDING);
  });

  it('refuses an entry that names a reversed match', async () => {
    const a = await posted('reversed, entry');
    expect(await reverse(a)).toEqual({ reversedEntries: 1 });
    expect(await jobPosts(a, a.matchId, a.rowId)).toEqual(NOT_STANDING);
  });
});

describe('a correction’s match, as ledger_entry_rules reads it: the same corrections refused with the same error', () => {
  it('lets the specialist adjust an entry whose match stands, and refuses the same adjustment once the match is reversed', async () => {
    const a = await posted('reversed, correction');
    // Standing: the adjustment is written (rolled back with its transaction's probe below, so the entry stays whole).
    const standing = await settle(
      withPracticeScope(w.app, { actorId: w.specialist, practiceIds: [a.practice.practiceId] }, async (scope) => {
        await scope.client.query(INSERT_ADJUSTED, [a.practice.practiceId, a.caseId, a.serviceLineId, a.entryId, a.matchId, w.specialist, a.practice.cipher.encrypt('ledger_entry.reason', 'SYNTHETIC review')]);
        throw new Error('written; rolled back');
      }),
    );
    expect(standing).toEqual({ code: undefined, message: 'written; rolled back' });
    expect(await reverse(a)).toEqual({ reversedEntries: 1 });
    expect(await specialistAdjusts(a, a.matchId)).toEqual(NOT_CORRECTED);
  });

  it('refuses a correction whose match the scope cannot read (a state only a superuser can store: the entry moved onto another practice’s match)', async () => {
    const a = await posted('unreadable, correction');
    const b = await posted('unreadable, other practice');
    // No role but a superuser can write this: the rules and the tenant policy refuse an entry on another practice's
    // match, and an entry never changes. It is the only way a correction's match lookup finds no row.
    await w.superuser('UPDATE ledger_entry SET match_id = $2 WHERE id = $1', [a.entryId, b.matchId]);
    expect(await specialistAdjusts(a, b.matchId)).toEqual(NOT_CORRECTED);
  });
});

describe('a line’s net, as ledger_line_net gives it to the application role', () => {
  const net = (inScope: Practice, serviceLineId: string, counted: string) =>
    withJobScope(w.app, { jobId: randomUUID(), practiceId: inScope.practiceId }, async (scope) => (await scope.client.query<{ net: string }>('SELECT ledger_line_net($1, $2)::text AS net', [serviceLineId, counted])).rows[0]?.net);

  it('gives 0 for another practice’s line, for a line that is no row and for no line, and the line’s own sums in its own scope', async () => {
    const a = await posted('own line');
    const b = await posted('other line');
    expect(await net(a.practice, a.serviceLineId, 'approved')).toBe(a.amountCents);
    expect(await net(a.practice, a.serviceLineId, 'posted')).toBe(a.amountCents);
    expect(await net(a.practice, a.serviceLineId, 'deposited')).toBe('0');
    for (const counted of ['approved', 'posted', 'deposited', 'recouped', 'interest']) {
      expect(await net(a.practice, b.serviceLineId, counted), counted).toBe('0');
      expect(await net(a.practice, randomUUID(), counted), counted).toBe('0');
    }
    const none = await withJobScope(w.app, { jobId: randomUUID(), practiceId: a.practice.practiceId }, async (scope) => (await scope.client.query<{ net: string }>("SELECT ledger_line_net(NULL, 'posted')::text AS net")).rows[0]?.net);
    expect(none).toBe('0');
  });

  it('counts a reversal and an adjustment as the stage of the entry each finally corrects, and nothing for another stage', async () => {
    const a = await posted('corrections');
    expect(await specialistAdjusts(a, a.matchId)).toBe('accepted');
    // The posting less the adjustment of -5.00.
    expect(await net(a.practice, a.serviceLineId, 'posted')).toBe(String(BigInt(a.amountCents) - 500n));
    expect(await reverse(a)).toEqual({ reversedEntries: 2 });
    // The posting, its adjustment, and the reversal of each (the adjustment's reversal corrects an adjustment of a posting).
    expect(await net(a.practice, a.serviceLineId, 'posted')).toBe('0');
    expect(await net(a.practice, a.serviceLineId, 'approved')).toBe(a.amountCents);
    expect(await net(a.practice, a.serviceLineId, 'reversed')).toBe('0');
    expect(await net(a.practice, a.serviceLineId, 'adjusted')).toBe('0');
  });
});

// ----------------------------------------------------------------------------------------------------------------
// The plan guard
// ----------------------------------------------------------------------------------------------------------------

type PlanNode = { readonly 'Node Type': string; readonly 'Relation Name'?: string; readonly Alias?: string; readonly 'Index Name'?: string; readonly 'Index Cond'?: string; readonly Plans?: readonly PlanNode[] };

/** Every node of a plan that reads a table, under its alias. */
function scans(node: PlanNode, found: PlanNode[] = []): PlanNode[] {
  if (node['Relation Name'] !== undefined) {
    found.push(node);
  }
  for (const child of node.Plans ?? []) {
    scans(child, found);
  }
  return found;
}

/** `text` with every string literal's and line comment's characters blanked, so a bracket or a semicolon in one is never read as code. */
function codeOnly(text: string): string {
  return text.replace(/'(?:[^']|'')*'|--[^\n]*/g, (quoted) => ' '.repeat(quoted.length));
}

/**
 * Each statement of a function body that reads `table`, as the body writes it: the innermost bracketed query that
 * holds the read, or the whole plpgsql statement when no bracket does (its INTO target taken out).
 */
function readsOf(body: string, table: string): string[] {
  const code = codeOnly(body);
  const statements: string[] = [];
  for (const read of code.matchAll(new RegExp(`\\bFROM ${table}\\b`, 'g'))) {
    let open = -1;
    for (let at = read.index, depth = 0; at >= 0 && open < 0; at -= 1) {
      const character = code[at];
      if (character === ')') {
        depth += 1;
      } else if (character === '(') {
        if (depth === 0) {
          open = at;
        }
        depth -= 1;
      } else if (character === ';' && depth === 0) {
        break;
      }
    }
    if (open < 0) {
      statements.push(body.slice(code.lastIndexOf(';', read.index) + 1, code.indexOf(';', read.index)).replace(/\bINTO\s+\w+\s+/, ''));
      continue;
    }
    let close = open;
    for (let depth = 0; close < code.length; close += 1) {
      depth += code[close] === '(' ? 1 : code[close] === ')' ? -1 : 0;
      if (depth === 0) {
        break;
      }
    }
    statements.push(body.slice(open + 1, close));
  }
  return statements.map((statement) => statement.trim());
}

/** A statement with each of the function's own values (a trigger's NEW columns, or its named arguments) written as a parameter, in the order they appear. */
function parameterized(statement: string, names: readonly string[]): string {
  const numbers = new Map<string, number>();
  const pattern = new RegExp(`(?<![.\\w])(?:NEW\\.\\w+${names.map((name) => `|${name}`).join('')})(?!\\w)`, 'g');
  return statement.replace(pattern, (name) => {
    const number = numbers.get(name) ?? numbers.size + 1;
    numbers.set(name, number);
    return `$${String(number)}`;
  });
}

describe('the plans of the ledger’s lookups on a ledger with rows and no statistics (the reason for migration 20261113090000)', () => {
  let a: Posted;

  /** The body the database holds for a function (the text between its dollar quotes) and its argument names. */
  async function installed(signature: string): Promise<{ readonly body: string; readonly names: readonly string[] }> {
    const { rows } = await w.owner.query<{ body: string; names: string[] | null }>('SELECT prosrc AS body, proargnames AS names FROM pg_proc WHERE oid = $1::regprocedure', [signature]);
    expect(rows, signature).toHaveLength(1);
    return { body: rows[0]?.body ?? '', names: rows[0]?.names ?? [] };
  }

  /** The generic plan of a statement as the trigger's caller plans it: the application role, in a job's scope of the practice. */
  async function planned(statement: string): Promise<PlanNode[]> {
    return withJobScope(w.app, { jobId: randomUUID(), practiceId: a.practice.practiceId }, async (scope) => {
      const { rows } = await scope.client.query<{ 'QUERY PLAN': readonly { readonly Plan: PlanNode }[] }>(`EXPLAIN (GENERIC_PLAN, FORMAT JSON) ${statement}`);
      const plan = rows[0]?.['QUERY PLAN'][0]?.Plan;
      if (plan === undefined) {
        throw new Error('EXPLAIN returned no plan');
      }
      return scans(plan);
    });
  }

  beforeAll(async () => {
    a = await posted('plans');
  }, 60_000);

  it('plans on a ledger that holds rows and was never analyzed or vacuumed', async () => {
    const { rows } = await w.owner.query<{ relname: string; reltuples: number; n: number; maintained: number }>(
      `SELECT c.relname, c.reltuples::float8 AS reltuples, s.n_live_tup::int AS n,
              num_nonnulls(s.last_analyze, s.last_autoanalyze, s.last_vacuum, s.last_autovacuum) AS maintained
         FROM pg_class c JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE c.oid IN ('ledger_entry'::regclass, 'ledger_match'::regclass) ORDER BY 1`,
    );
    expect(rows.map(({ relname, reltuples, maintained }) => ({ relname, reltuples, maintained }))).toEqual([
      { relname: 'ledger_entry', reltuples: -1, maintained: 0 },
      { relname: 'ledger_match', reltuples: -1, maintained: 0 },
    ]);
    const held = await w.owner.query<{ entries: number; matches: number }>('SELECT (SELECT count(*)::int FROM ledger_entry) AS entries, (SELECT count(*)::int FROM ledger_match) AS matches');
    expect(held.rows[0]?.entries).toBeGreaterThan(0);
    expect(held.rows[0]?.matches).toBeGreaterThan(0);
  });

  it('reads a line’s entries through the line index, by the line’s practice and the line, and a correction’s target by its primary key (ledger_line_net as installed)', async () => {
    const { body, names } = await installed('ledger_line_net(uuid, text)');
    expect(names).toEqual(['line', 'counted']);
    const byAlias = new Map((await planned(parameterized(body, names))).map((scan) => [scan.Alias, scan]));
    const entries = byAlias.get('e');
    expect(entries?.['Relation Name']).toBe('ledger_entry');
    expect(entries?.['Node Type']).toBe('Index Scan');
    expect(entries?.['Index Name']).toBe('ledger_entry_by_line');
    expect(entries?.['Index Cond']).toMatch(/\bpractice_id = \(/);
    expect(entries?.['Index Cond']).toMatch(/\bservice_line_id = \$1/);
    for (const alias of ['t', 'r']) {
      expect(byAlias.get(alias)?.['Relation Name'], alias).toBe('ledger_entry');
      expect(byAlias.get(alias)?.['Index Name'], alias).toBe('ledger_entry_pkey');
    }
  });

  it('reads an entry’s match and a correction’s match by the match’s primary key alone (ledger_entry_rules as installed)', async () => {
    const { body } = await installed('ledger_entry_rules()');
    const reads = readsOf(body, 'ledger_match');
    // The correction's match and the entry's match. A third read of ledger_match in this function needs its plan read here too.
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      const statement = parameterized(read, []);
      expect(statement, read).not.toMatch(/\bNEW\b/);
      const matches = (await planned(statement)).filter((scan) => scan['Relation Name'] === 'ledger_match');
      expect(matches, read).toHaveLength(1);
      expect(matches[0]?.['Node Type'], read).toBe('Index Scan');
      expect(matches[0]?.['Index Name'], read).toBe('ledger_match_pkey');
      expect(matches[0]?.['Index Cond'], read).toMatch(/^\(id = \$1\)$/);
    }
  });
});
