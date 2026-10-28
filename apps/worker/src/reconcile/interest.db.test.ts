import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { cents } from '@tp/money';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { adjustEntry, reverseMatch } from './manual';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * Interest credited once, from the PLB L6 that pays or takes it back (test matrix LED-24; docs/adr/0084;
 * migration 20261110090000_ledger_interest_once.sql). This block holds what Postgres keeps by itself, by hand, whoever
 * writes: the reconcile job's interest match carrying one record (the image before this change) skipped, a person's
 * refused; an interest match only from a PLB L6 of its remittance, for a claim the line has a standing claim or
 * interest match to; a PLB L6's interest entries of each sign never past what it moved, netted only against what its
 * remittance's claims report the other way; and a line's interest never below zero. Each case is LED-02's SYNTHETIC
 * case line (fixtures/synthetic/LED-02): its correction C approves the line, its reversal V reverses the original O,
 * and neither reports interest (no AMT I); the PLB L6s are added to its stored remittances as the owner, SYNTHETIC.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Held {
  readonly practice: Practice;
  readonly caseId: string;
  readonly serviceLineId: string;
  /** The correction that approved the line, and its remittance (the adjusted payment). */
  readonly correction: { readonly id: string; readonly remittanceId: string };
  /** The reversal beside it, in the same remittance: no claim match can name it. */
  readonly reversalId: string;
  /** The original payment's remittance. */
  readonly originalRemittanceId: string;
}

/** LED-02's case line, approved by the correction of its adjusted remittance. */
async function held(): Promise<Held> {
  const practice = await w.practice(`LED-24 ${randomUUID().slice(0, 8)}`, ledSettings());
  const { caseId, serviceLineId } = await w.caseFor(practice, 'LED-02/original.835');
  await w.load(practice, 'LED-02/adjusted.835');
  await w.reconcile(practice);
  const [correction] = await w.rows<{ claim_id: string; remittance_id: string }>(practice, "SELECT claim_id, remittance_id FROM ledger_match WHERE kind = 'claim' AND service_line_id = $1", [serviceLineId]);
  const [reversal] = await w.rows<{ id: string }>(practice, "SELECT id FROM claim WHERE claim_status_code = '22' AND remittance_id = $1", [correction?.remittance_id]);
  const [original] = await w.rows<{ id: string }>(practice, 'SELECT id FROM remittance WHERE id <> $1', [correction?.remittance_id]);
  if (correction === undefined || reversal === undefined || original === undefined) {
    throw new Error('LED-02 did not load as its fixture says');
  }
  return { practice, caseId, serviceLineId, correction: { id: correction.claim_id, remittanceId: correction.remittance_id }, reversalId: reversal.id, originalRemittanceId: original.id };
}

/** A SYNTHETIC PLB L6 in the remittance named: `amountCents` as the 835 carries it (negative pays interest, positive takes it back). */
async function plbL6(h: Held, remittanceId: string, amountCents: number): Promise<string> {
  const { rows } = await asOwner(w.owner, [h.practice.practiceId], () =>
    w.owner.query<{ id: string }>(
      `INSERT INTO provider_adjustment (practice_id, remittance_id, position, provider_id, reason_code, reference, amount_cents, fiscal_period_date, category)
       VALUES ($1, $2, (SELECT coalesce(max(position), 0) + 1 FROM provider_adjustment WHERE remittance_id = $2), 'SYNTHETIC', 'L6', NULL, $3, '2026-12-31', 'interest') RETURNING id`,
      [h.practice.practiceId, remittanceId, amountCents],
    ),
  );
  return (rows[0] as { id: string }).id;
}

const INSERT_MATCH =
  "INSERT INTO ledger_match (practice_id, kind, claim_id, provider_adjustment_id, remittance_id, service_line_id, matched_by) VALUES ($1, 'interest', $2, $3, $4, $5, $6) RETURNING id, evidence_id";
const INSERT_ENTRY =
  "INSERT INTO ledger_entry (practice_id, case_id, service_line_id, stage, amount_cents, evidence_kind, evidence_id, match_id, effective_on) VALUES ($1, $2, $3, 'interest', $4, $5, $6, $7, '2026-06-08') RETURNING id";

/** Runs one statement as the reconcile job of the practice (tp_job; in no one's name). */
const asJob = (h: Held, text: string, values: readonly unknown[]) =>
  withJobScope(w.app, { jobId: randomUUID(), practiceId: h.practice.practiceId }, async (scope) => (await scope.client.query<Record<string, string>>(text, values as unknown[])).rows);

/** Runs one statement as the practice's billing manager, who reconciles postings. */
const asManager = (h: Held, text: string, values: readonly unknown[]) =>
  withPracticeScope(w.app, { actorId: h.practice.manager, practiceIds: [h.practice.practiceId] }, async (scope) => (await scope.client.query<Record<string, string>>(text, values as unknown[])).rows);

/** The job's interest match of the PLB L6 and the claim on the line; its ID. */
async function jobMatch(h: Held, claimId: string | null, l6: string | null, remittanceId = h.correction.remittanceId): Promise<string> {
  const [row] = await asJob(h, INSERT_MATCH, [h.practice.practiceId, claimId, l6, remittanceId, h.serviceLineId, null]);
  return (row as { id: string }).id;
}

/** The job's interest entry on the line from the PLB L6, under the match named. */
const jobEntry = (h: Held, l6: string, matchId: string, amountCents: number) =>
  asJob(h, INSERT_ENTRY, [h.practice.practiceId, h.caseId, h.serviceLineId, String(amountCents), 'provider_adjustment', l6, matchId]);

const interestMatches = async (h: Held) => (await w.rows<{ n: number }>(h.practice, "SELECT count(*)::int AS n FROM ledger_match WHERE kind = 'interest'"))[0]?.n;

describe('what Postgres holds for interest, whoever writes it, by hand (LED-24; docs/adr/0084)', () => {
  it('skips the reconcile job’s interest match carrying only the claim or only the PLB L6, with no error, and refuses a person’s', async () => {
    const h = await held();
    const l6 = await plbL6(h, h.correction.remittanceId, -540);
    // The image before this change, during a deploy or after a rollback: AMT I's shape (the claim alone) and the PLB
    // L6's shape (the L6 alone). No row, no error, so the rest of its reconcile stands.
    expect(await asJob(h, INSERT_MATCH, [h.practice.practiceId, h.correction.id, null, h.correction.remittanceId, h.serviceLineId, null])).toEqual([]);
    expect(await asJob(h, INSERT_MATCH, [h.practice.practiceId, null, l6, h.correction.remittanceId, h.serviceLineId, null])).toEqual([]);
    expect(await interestMatches(h)).toBe(0);
    // A person's insert of that shape reaches the interest rules and is refused.
    await expect(asManager(h, INSERT_MATCH, [h.practice.practiceId, h.correction.id, null, h.correction.remittanceId, h.serviceLineId, h.practice.manager])).rejects.toThrow(
      'interest is matched from a PLB L6 of its remittance, for a claim',
    );
    await expect(asManager(h, INSERT_MATCH, [h.practice.practiceId, null, l6, h.correction.remittanceId, h.serviceLineId, h.practice.manager])).rejects.toThrow(
      'interest is matched from a PLB L6 of its remittance, for a claim',
    );
    expect(await interestMatches(h)).toBe(0);
  });

  it('matches interest only from a PLB L6 of its remittance, for a claim the line has a standing match to, and keeps the match’s order and evidence', async () => {
    const h = await held();
    const l6 = await plbL6(h, h.correction.remittanceId, -540);
    const ofOriginal = await plbL6(h, h.originalRemittanceId, -540);
    // A PLB L6 of another remittance than the match's.
    await expect(jobMatch(h, h.correction.id, ofOriginal)).rejects.toThrow('interest is matched from a PLB L6 of its remittance, for a claim');
    // A claim of the L6's remittance that the line has no standing match to: the reversal beside the correction.
    await expect(jobMatch(h, h.reversalId, l6)).rejects.toThrow('interest reaches a line only through a claim the line has a standing match to');
    // The L6 and the correction that approved the line: one match, numbered after the line's claim match, whose
    // evidence is the L6.
    const [made] = await asJob(h, INSERT_MATCH, [h.practice.practiceId, h.correction.id, l6, h.correction.remittanceId, h.serviceLineId, null]);
    expect(made).toMatchObject({ evidence_id: l6 });
    const order = await w.rows<{ kind: string }>(h.practice, 'SELECT kind FROM ledger_match WHERE service_line_id = $1 ORDER BY seq', [h.serviceLineId]);
    expect(order.map((match) => match.kind)).toEqual(['claim', 'interest']);
    // Once per L6 and line, as every match of its evidence.
    await expect(jobMatch(h, h.correction.id, l6)).rejects.toMatchObject({ code: '23505' });
  });

  it('keeps a PLB L6’s interest entries of each sign within what it moved, and refuses an interest entry whose evidence is not a PLB L6', async () => {
    const h = await held();
    const l6 = await plbL6(h, h.correction.remittanceId, -540);
    const matchId = await jobMatch(h, h.correction.id, l6);
    // Its remittance reports no interest taken back, so it pays at most its 5.40.
    await expect(jobEntry(h, l6, matchId, 541)).rejects.toThrow('interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back');
    // Nor does it take any back: it took nothing back, and its remittance reports no interest paid.
    await expect(jobEntry(h, l6, matchId, -1)).rejects.toThrow('interest a PLB L6 takes back never sums past what it took back, plus the interest its remittance reports paid');
    // An interest entry carrying the claim as its evidence carries no match's evidence: the frozen rules refuse it.
    await expect(asJob(h, INSERT_ENTRY, [h.practice.practiceId, h.caseId, h.serviceLineId, '540', 'claim', h.correction.id, matchId])).rejects.toThrow(
      "an entry carries its match's evidence, for its match's line",
    );
    expect(await jobEntry(h, l6, matchId, 540)).toHaveLength(1);
    // 5.40 of 5.40 paid: one cent more is past it, on another line's match or this one's.
    await expect(jobEntry(h, l6, matchId, 1)).rejects.toThrow('interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back');
    // A match written before this change, from the claim alone (its rows stay valid), reaches the new trigger, which
    // credits interest only from a PLB L6.
    const legacy = randomUUID();
    await w.superuser(
      "INSERT INTO ledger_match (id, practice_id, kind, claim_id, remittance_id, service_line_id, matched_at) VALUES ($1, $2, 'interest', $3, $4, $5, now())",
      [legacy, h.practice.practiceId, h.correction.id, h.correction.remittanceId, h.serviceLineId],
    );
    await expect(asJob(h, INSERT_ENTRY, [h.practice.practiceId, h.caseId, h.serviceLineId, '100', 'claim', h.correction.id, legacy])).rejects.toThrow(
      'interest is credited from the PLB L6 that pays or takes it back',
    );
  });

  it('takes interest back as a negative entry, never below zero on a line, and reaches a line through its standing interest match once a person reversed its approval', async () => {
    const h = await held();
    const pays = await plbL6(h, h.correction.remittanceId, -540);
    await jobEntry(h, pays, await jobMatch(h, h.correction.id, pays), 540);
    // A PLB L6 taking back 6.00: the line holds 5.40, so 5.41 would leave it below zero.
    const takes = await plbL6(h, h.correction.remittanceId, 600);
    const back = await jobMatch(h, h.correction.id, takes);
    await expect(jobEntry(h, takes, back, -541)).rejects.toMatchObject({
      message: "a line's interest, net of what the payer took back, never goes below zero",
      code: '23514',
      constraint: 'ledger_interest_line_floor',
    });
    expect(await jobEntry(h, takes, back, -540)).toHaveLength(1);
    const interest = await w.sum(h.practice, "SELECT sum(amount_cents)::text AS total FROM ledger_entry WHERE stage = 'interest'");
    expect(interest).toBe(0n);
    // A contract specialist's adjustment lowering the paid entry would take the line below zero: refused.
    const [paid] = await w.rows<{ id: string }>(h.practice, "SELECT id FROM ledger_entry WHERE stage = 'interest' AND amount_cents > 0");
    await expect(
      w.manual(h.practice, (context) => adjustEntry(context, { practiceId: h.practice.practiceId, entryId: paid?.id ?? '', amountCents: cents(-100n), reason: 'SYNTHETIC' }), w.specialist),
    ).rejects.toMatchObject({ constraint: 'ledger_interest_line_floor' });
    // A person reverses the line's approval by the correction; the correction still reaches the line through its
    // standing interest match, so a later PLB L6 can take back what the line holds of it. The reversal never could.
    const [approval] = await w.rows<{ id: string }>(h.practice, "SELECT id FROM ledger_match WHERE kind = 'claim' AND service_line_id = $1", [h.serviceLineId]);
    await w.manual(h.practice, (context) => reverseMatch(context, { practiceId: h.practice.practiceId, matchId: approval?.id ?? '', reason: 'SYNTHETIC matched in error' }));
    const later = await plbL6(h, h.correction.remittanceId, 200);
    await expect(jobMatch(h, h.reversalId, later)).rejects.toThrow('interest reaches a line only through a claim the line has a standing match to');
    expect(await jobMatch(h, h.correction.id, later)).toEqual(expect.any(String));
  });
});
