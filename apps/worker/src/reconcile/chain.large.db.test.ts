import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import type { Scope } from './ledger';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * LED-25 at size (docs/adr/0084; migration 20261110090000_ledger_interest_once.sql): the lookups of a line's chain and
 * of interest read their indexes at 50,000 claims. CLAIMS SYNTHETIC claims (one in twenty superseded by a later claim
 * of its practice), as many claim matches over LINES lines and twice as many ledger entries (half of them interest
 * from PLB_L6S PLB L6s) are spread over PRACTICES practices, copied from LED-02's SYNTHETIC case as a superuser with
 * triggers off (only the plans are read, so the copies need no consistency beyond their indexes' keys), and analysed.
 * Each plan is read in a practice's job scope, under its tenant policies, as the reconcile and the ledger triggers
 * read them:
 * - the correction chain's walk from a correction to the claims it supersedes (claimLines' recursive lookup and the
 *   claim each corrects, apps/worker/src/reconcile/remittances.ts; the adjusted payments' EXISTS,
 *   apps/worker/src/reconcile/unmatched.ts) by claim_by_superseded (migration 20261109090000);
 * - a practice's matches in the order the ledger made them by an index on its practice, never a scan of the table: at
 *   2,500 matches a practice the planner reads them by ledger_match_by_remittance and sorts them by seq (about 400 cost
 *   units), cheaper than walking ledger_match_by_seq, which keeps seq unique within the practice;
 * - ledger_entry_within_interest()'s reads: a PLB L6's interest entries by ledger_entry_by_evidence, its remittance's
 *   reported interest by claim_once and a line's interest by ledger_entry_by_line; and ledger_match_rules()' claim
 *   reaching a line by ledger_match_by_line.
 * The statements are the functions' own, with their parameters.
 */

const CLAIMS = 50_000;
const LINES = 10_000;
const PRACTICES = 20;
const REMITTANCES = 1_000;
const PLB_L6S = 5_000;

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

/**
 * Copies of one stored row of `table`, `count` of them, with the columns named computed from g (1 to count); identity and
 * generated columns are left to the table. Each practice's copies are written together, as each practice's loads and
 * reconciles write its rows (one practice per reconcile job), so a practice's matches are numbered in runs.
 */
async function copies(table: string, templateId: string, count: number, computed: Readonly<Record<string, string>>, values: readonly unknown[]): Promise<void> {
  const { rows } = await w.owner.query<{ attname: string }>(
    "SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '' AND attidentity = '' ORDER BY attnum",
    [table],
  );
  const columns = rows.map((row) => row.attname);
  const select = columns.map((column) => computed[column] ?? `t.${column}`);
  await w.superuser(
    `INSERT INTO ${table} (${columns.join(', ')}) SELECT ${select.join(', ')} FROM ${table} t, generate_series(1, ${String(count)}) g WHERE t.id = $1 ORDER BY g % ${String(PRACTICES)}, g`,
    [templateId, ...values],
  );
}

/** A SYNTHETIC identifier from a label and a number, the same for the same pair. */
const id = (label: string, n: string) => `md5('${label}' || (${n}))::uuid`;

/** The plan of one statement, read in the practice's job scope, as one string. */
async function plan(practice: Practice, text: string, values: readonly unknown[]): Promise<string> {
  return withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, async (scope) => {
    const { rows } = await (scope as Scope).client.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${text}`, values as unknown[]);
    return rows.map((row) => row['QUERY PLAN']).join('\n');
  });
}

/** claimLines' statement (apps/worker/src/reconcile/remittances.ts). */
const CLAIM_LINES = `WITH RECURSIVE named (id) AS (
       SELECT unnest($1::uuid[])
        UNION
       SELECT k.id FROM claim k JOIN named n ON k.superseded_by_claim_id = n.id)
     SELECT s.id, s.claim_id, s.line_no, s.procedure_code, s.modifiers, s.units::text AS units, s.service_date::text AS service_date,
            s.observed_allowed_cents::text AS observed_allowed_cents, s.charge_cents::text AS charge_cents, s.paid_cents::text AS paid_cents,
            c.paid_cents::text AS claim_paid_cents, EXISTS (SELECT 1 FROM adjustment a WHERE a.service_line_id = s.id) AS carries_adjustments,
            (SELECT COALESCE(sum(a.amount_cents), 0) FROM adjustment a WHERE a.service_line_id = s.id AND a.group_code <> 'PR')::text AS line_reduction_cents,
            (SELECT k.id FROM claim k WHERE k.superseded_by_claim_id = s.claim_id ORDER BY k.created_at DESC, k.id LIMIT 1) AS corrects_claim_id
       FROM service_line s JOIN claim c ON c.id = s.claim_id WHERE s.claim_id IN (SELECT id FROM named) ORDER BY s.claim_id, s.line_no`;

/** The claims a correction supersedes, walked back from it (the walk claimLines' recursion and the claim each corrects take). */
const SUPERSEDED = 'SELECT k.id FROM claim k WHERE k.superseded_by_claim_id = $1 ORDER BY k.created_at DESC, k.id LIMIT 1';

/** The adjusted payments' statement (apps/worker/src/reconcile/unmatched.ts). */
const ADJUSTED_PAYMENTS = `SELECT c.id, c.remittance_id, r.trn02, r.bpr16_date::text AS payment_date, r.payer_name, c.paid_cents::text AS paid_cents
       FROM claim c JOIN remittance r ON r.id = c.remittance_id
      WHERE c.practice_id = $1 AND r.status = 'loaded' AND c.claim_status_code <> '22'
        AND (c.frequency_code = '7' OR EXISTS (SELECT 1 FROM claim o WHERE o.superseded_by_claim_id = c.id))
        AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.reversed_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM case_line x JOIN service_line xl ON xl.id = x.service_line_id WHERE xl.claim_id = c.id)
      ORDER BY r.bpr16_date, c.created_at, c.id`;

describe('a line’s chain and its interest read by index at 50,000 claims (LED-25)', () => {
  it('walks corrections by claim_by_superseded, reads a practice’s matches in order by index, and serves each interest rule by its index', async () => {
    const practices: Practice[] = [];
    for (let n = 0; n < PRACTICES; n += 1) {
      practices.push(await w.practice(`LED-25 large ${String(n)} ${randomUUID().slice(0, 8)}`, ledSettings()));
    }
    const [template] = practices as [Practice];
    const { serviceLineId } = await w.caseFor(template, 'LED-02/original.835');
    await w.load(template, 'LED-02/adjusted.835');
    await w.reconcile(template);
    const [match] = await w.rows<{ id: string; claim_id: string }>(template, "SELECT id, claim_id FROM ledger_match WHERE kind = 'claim' AND service_line_id = $1", [serviceLineId]);
    const [entry] = await w.rows<{ id: string }>(template, "SELECT id FROM ledger_entry WHERE stage = 'approved' AND service_line_id = $1", [serviceLineId]);
    const ids = practices.map((practice) => practice.practiceId);
    // The g-th copy belongs to practice g mod PRACTICES; line l to practice l mod PRACTICES (LINES is a multiple of it).
    const practiceOf = (g: string) => `($2::uuid[])[1 + (${g}) % ${String(PRACTICES)}]`;
    await copies(
      'claim',
      match?.claim_id ?? '',
      CLAIMS,
      {
        id: id('claim', 'g'),
        practice_id: practiceOf('g'),
        remittance_id: id('remittance', `g % ${String(REMITTANCES)}`),
        claim_no: 'g',
        reversal_of_claim_id: 'NULL',
        // One in twenty superseded by a later claim of its practice.
        superseded_by_claim_id: `CASE WHEN g % 20 = 0 THEN ${id('claim', `g + ${String(PRACTICES)}`)} END`,
        interest_cents: 'CASE WHEN g % 10 = 0 THEN 540 END',
      },
      [ids],
    );
    await copies(
      'ledger_match',
      match?.id ?? '',
      CLAIMS,
      {
        id: id('match', 'g'),
        practice_id: practiceOf('g'),
        claim_id: id('claim', 'g'),
        remittance_id: id('remittance', `g % ${String(REMITTANCES)}`),
        service_line_id: id('line', `g % ${String(LINES)}`),
      },
      [ids],
    );
    await copies(
      'ledger_entry',
      entry?.id ?? '',
      2 * CLAIMS,
      {
        id: id('entry', 'g'),
        practice_id: practiceOf('g'),
        service_line_id: id('line', `g % ${String(LINES)}`),
        stage: "CASE WHEN g % 2 = 0 THEN 'interest' ELSE t.stage END",
        evidence_kind: "CASE WHEN g % 2 = 0 THEN 'provider_adjustment' ELSE t.evidence_kind END",
        evidence_id: `CASE WHEN g % 2 = 0 THEN ${id('l6', `g % ${String(PLB_L6S)}`)} ELSE ${id('claim', `g % ${String(CLAIMS)}`)} END`,
        match_id: id('match', 'g'),
        amount_cents: '100',
      },
      [ids],
    );
    await w.owner.query('ANALYZE claim, ledger_match, ledger_entry');

    // Copy g is practices[g mod 20]'s. Claim 100 is superseded by claim 120, both practices[0]'s; the reader,
    // practices[10], holds claim, line, remittance and PLB L6 number 10 (its interest entries are copies with even g).
    const of = async (sql: string) => (await w.owner.query<{ v: string }>(`SELECT (${sql})::text AS v`)).rows[0]?.v ?? '';
    const correction = await of(id('claim', '120'));
    expect(await plan(template, CLAIM_LINES, [[correction]])).toContain('claim_by_superseded');
    expect(await plan(template, SUPERSEDED, [correction])).toContain('claim_by_superseded');
    const reader = practices[10] as Practice;
    expect(await plan(reader, ADJUSTED_PAYMENTS, [reader.practiceId])).toContain('claim_by_superseded');

    // The practice's matches in the order the ledger made them (ledgerMatches, the chain's order and the web's lists).
    const ordered = await plan(reader, 'SELECT m.id FROM ledger_match m WHERE m.practice_id = $1 ORDER BY m.seq', [reader.practiceId]);
    expect(ordered).not.toContain('Seq Scan on ledger_match');
    expect(ordered).toMatch(/Index Scan (using|on) ledger_match_by_(seq|remittance) /);

    // ledger_entry_within_interest()'s reads, as its body makes them.
    const l6 = await of(id('l6', '10'));
    expect(
      await plan(
        reader,
        "SELECT coalesce(sum(e.amount_cents) FILTER (WHERE e.amount_cents > 0), 0), coalesce(-sum(e.amount_cents) FILTER (WHERE e.amount_cents < 0), 0) FROM ledger_entry e WHERE e.practice_id = $1 AND e.evidence_id = $2 AND e.stage = 'interest'",
        [reader.practiceId, l6],
      ),
    ).toContain('ledger_entry_by_evidence');
    const remittance = await of(id('remittance', '10'));
    expect(
      await plan(
        reader,
        'SELECT coalesce(sum(c.interest_cents) FILTER (WHERE c.interest_cents > 0), 0), coalesce(-sum(c.interest_cents) FILTER (WHERE c.interest_cents < 0), 0) FROM claim c WHERE c.remittance_id = $1 AND c.practice_id = $2',
        [remittance, reader.practiceId],
      ),
    ).toContain('claim_once');
    const line = await of(id('line', '10'));
    expect(
      await plan(reader, "SELECT e.amount_cents FROM ledger_entry e WHERE e.practice_id = $1 AND e.service_line_id = $2 AND e.stage = 'interest'", [reader.practiceId, line]),
    ).toContain('ledger_entry_by_line');
    // ledger_match_rules()' claim reaching a line.
    expect(
      await plan(
        reader,
        "SELECT 1 FROM ledger_match c WHERE c.practice_id = $1 AND c.service_line_id = $2 AND c.claim_id = $3 AND c.kind IN ('claim', 'interest') AND c.reversed_at IS NULL",
        [reader.practiceId, line, await of(id('claim', '10'))],
      ),
    ).toContain('ledger_match_by_line');
  }, 600_000);
});
