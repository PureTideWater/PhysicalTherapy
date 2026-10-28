import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { cents } from '@tp/money';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { type InterestReading, adjustmentMoment, interestAttribution, reportedInterest } from './interest-chains';
import type { Scope } from './ledger';
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

interface Line {
  readonly caseId: string;
  readonly serviceLineId: string;
}

/** A practice with LED-23's or LED-24's case lines open from `original` (the fixture's original.835 unless named), in claim and line order. */
async function opened(id: 'LED-23' | 'LED-24', original = 'original.835'): Promise<{ readonly practice: Practice; readonly lines: Line[] }> {
  const practice = await w.practice(`${id} ${randomUUID().slice(0, 8)}`, ledSettings());
  await w.caseFor(practice, `${id}/${original}`);
  const rows = await w.rows<{ case_id: string; service_line_id: string }>(
    practice,
    'SELECT cl.case_id, cl.service_line_id FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id JOIN claim c ON c.id = l.claim_id ORDER BY c.claim_no, l.line_no',
  );
  return { practice, lines: rows.map((row) => ({ caseId: row.case_id, serviceLineId: row.service_line_id })) };
}

/** Loads each fixture of the case and reconciles after each. */
async function upload(practice: Practice, id: string, ...files: readonly string[]): Promise<void> {
  for (const file of files) {
    await w.load(practice, `${id}/${file}`);
    await w.reconcile(practice);
  }
}

/** A line's interest entries in ledger order: amount and allocated. */
const interestOf = async (practice: Practice, serviceLineId: string) =>
  (await w.entries(practice)).filter((entry) => entry.stage === 'interest' && entry.service_line_id === serviceLineId).map((entry) => ({ amountCents: entry.amount_cents, allocated: entry.allocated }));

/** A line's principal entries of one stage, in ledger order. */
const stageOf = async (practice: Practice, serviceLineId: string, stage: string) =>
  (await w.entries(practice)).filter((entry) => entry.stage === stage && entry.service_line_id === serviceLineId).map((entry) => entry.amount_cents);

/** The PLB L6s of the remittance with trace `trace`, by position. */
const l6sOf = async (practice: Practice, trace: string) =>
  (await w.rows<{ id: string }>(practice, "SELECT a.id FROM provider_adjustment a JOIN remittance r ON r.id = a.remittance_id WHERE r.trn02 = $1 AND a.category = 'interest' ORDER BY a.position", [trace])).map((row) => row.id);

/** The claim `claimNo` of the remittance with trace `trace`: its ID and links. */
async function claimOf(practice: Practice, trace: string, claimNo: number): Promise<{ readonly id: string; readonly reversal_of_claim_id: string | null; readonly superseded_by_claim_id: string | null }> {
  const [row] = await w.rows<{ id: string; reversal_of_claim_id: string | null; superseded_by_claim_id: string | null }>(
    practice,
    'SELECT c.id, c.reversal_of_claim_id, c.superseded_by_claim_id FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE r.trn02 = $1 AND c.claim_no = $2',
    [trace, claimNo],
  );
  if (row === undefined) {
    throw new Error(`no claim ${String(claimNo)} in ${trace}`);
  }
  return row;
}

/**
 * The guard that the deploy window's skip (D16) can never hide the current image's own interest: every interest match
 * the reconcile wrote carries the PLB L6 and a claim, and every interest entry's evidence is that PLB L6.
 */
async function expectInterestFromItsL6(practice: Practice): Promise<void> {
  expect(await w.rows(practice, "SELECT id FROM ledger_match WHERE kind = 'interest' AND num_nonnulls(claim_id, provider_adjustment_id) < 2")).toEqual([]);
  const rows = await w.rows<{ evidence_kind: string; evidence_id: string; provider_adjustment_id: string; category: string }>(
    practice,
    "SELECT e.evidence_kind, e.evidence_id, m.provider_adjustment_id, a.category FROM ledger_entry e JOIN ledger_match m ON m.id = e.match_id JOIN provider_adjustment a ON a.id = m.provider_adjustment_id WHERE e.stage = 'interest'",
  );
  expect(rows.length).toBe((await w.rows(practice, "SELECT id FROM ledger_entry WHERE stage = 'interest'")).length);
  for (const row of rows) {
    expect(row).toEqual({ evidence_kind: 'provider_adjustment', evidence_id: row.provider_adjustment_id, provider_adjustment_id: row.provider_adjustment_id, category: 'interest' });
  }
}

/** Reconciles twice more: each completes and writes nothing. */
async function replayed(practice: Practice): Promise<void> {
  const before = await w.entries(practice);
  await w.reconcile(practice);
  await w.reconcile(practice);
  expect(await w.entries(practice)).toEqual(before);
}

/** Whom each PLB L6 of the practice is for now, read as the reconcile reads it: one moment (D17). */
const attributionNow = (practice: Practice): Promise<InterestReading> =>
  withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, async (scope) =>
    interestAttribution(scope as Scope, practice.cipher, practice.practiceId, await adjustmentMoment(scope as Scope, practice.practiceId)),
  );

/** Each PLB L6's interest entries of each sign stay within what `first` (an attribution read after its first reconcile) gives it of that sign. */
async function expectWithinFirst(practice: Practice, first: InterestReading): Promise<void> {
  const entries = await w.rows<{ evidence_id: string; amount_cents: string }>(practice, "SELECT evidence_id, amount_cents::text FROM ledger_entry WHERE stage = 'interest'");
  const bySign = (amounts: readonly bigint[], sign: bigint) => amounts.filter((amount) => amount * sign > 0n).reduce((sum, amount) => sum + amount * sign, 0n);
  for (const l6 of new Set(entries.map((entry) => entry.evidence_id))) {
    const written = entries.filter((entry) => entry.evidence_id === l6).map((entry) => BigInt(entry.amount_cents));
    const drawn = (first.draws.get(l6) ?? []).map((draw) => draw.cents as bigint);
    for (const sign of [1n, -1n]) {
      expect(bySign(written, sign)).toBeLessThanOrEqual(bySign(drawn, sign));
    }
  }
}

const PAIRED = [
  { amountCents: '240', allocated: true },
  { amountCents: '300', allocated: true },
] as const;

describe('a remittance’s interest reported on its claims and paid by a PLB L6, credited once per line (LED-23; docs/adr/0084)', () => {
  it('credits the PLB L6 naming the correction, never its AMT I as well (paired.835)', async () => {
    const { practice, lines } = await opened('LED-23');
    await upload(practice, 'LED-23', 'paired.835');
    const [l1, l2] = lines as [Line, Line];
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0]]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    const [l6] = await l6sOf(practice, 'SYNEFTLED23002');
    const correction = await claimOf(practice, 'SYNEFTLED23002', 2);
    expect(await w.rows(practice, "SELECT claim_id, provider_adjustment_id, allocated FROM ledger_match WHERE kind = 'interest' ORDER BY seq")).toEqual([
      { claim_id: correction.id, provider_adjustment_id: l6, allocated: true },
      { claim_id: correction.id, provider_adjustment_id: l6, allocated: true },
    ]);
    expect(await w.sum(practice, "SELECT sum(amount_cents)::text AS total FROM ledger_entry WHERE stage = 'interest'")).toBe(540n);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
  });

  it.each([
    ['unnamed.835', 'shares a PLB L6 naming nothing by the remittance’s AMT I, the other patient’s 2.00 on no case line'],
    ['named-net.835', 'covers the named claim’s AMT I first, the rest of a net PLB L6 the other claim’s'],
    ['identifiers.835', 'names the claim by its control number among the reference’s identifiers'],
    ['zero-l6.835', 'moves nothing for a PLB L6 of zero, and every reconcile completes'],
  ])('%s: %s', async (file) => {
    const { practice, lines } = await opened('LED-23');
    await upload(practice, 'LED-23', file);
    const [l1, l2] = lines as [Line, Line];
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0]]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
  });

  it('counts AMT I with no PLB L6 in its check nowhere, and credits a later PLB L6 naming the claim once, dated by its remittance', async () => {
    const { practice, lines } = await opened('LED-23');
    const [l1, l2] = lines as [Line, Line];
    await upload(practice, 'LED-23', 'reported-only.835');
    expect(await stageOf(practice, l1.serviceLineId, 'approved')).toEqual(['2400']);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([]);
    await upload(practice, 'LED-23', 'later-l6.835');
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0]]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    expect(await w.rows(practice, "SELECT DISTINCT effective_on::text AS on FROM ledger_entry WHERE stage = 'interest'")).toEqual([{ on: '2026-08-03' }]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
  });

  it.each([
    ['net-zero.835', 'alone'],
    ['net-zero-beside.835', 'beside another patient’s claim and a PLB L6 naming nothing'],
  ])('adds no interest for a reversal and correction whose AMT I nets to zero (%s, %s)', async (file) => {
    const { practice, lines } = await opened('LED-23');
    const [l1, l2] = lines as [Line, Line];
    await upload(practice, 'LED-23', 'paired.835', file);
    expect(await stageOf(practice, l1.serviceLineId, 'approved')).toEqual(['2400', '200']);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0]]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
  });

  it('pins the known gap of a reversal the payer renumbered: unlinked, so its correction’s interest counts again', async () => {
    const { practice, lines } = await opened('LED-23');
    const [l1, l2] = lines as [Line, Line];
    await upload(practice, 'LED-23', 'paired.835');
    await w.load(practice, 'LED-23/renumbered-reversal.835');
    // Before its reconcile: the renumbered reversal is linked to nothing, and the correction it pairs with supersedes C.
    expect((await claimOf(practice, 'SYNEFTLED23011', 1)).reversal_of_claim_id).toBeNull();
    expect((await claimOf(practice, 'SYNEFTLED23002', 2)).superseded_by_claim_id).toBe((await claimOf(practice, 'SYNEFTLED23011', 2)).id);
    await w.reconcile(practice);
    expect(await stageOf(practice, l1.serviceLineId, 'approved')).toEqual(['2400', '200']);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0], { amountCents: '540', allocated: false }]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
  });
});

describe('one PLB L6 attributed once, whatever later uploads change, and interest taken back (LED-24; docs/adr/0084)', () => {
  it('never splits a PLB L6 again when a line approved later gains a weight (first.835, second.835)', async () => {
    const { practice, lines } = await opened('LED-24');
    const [l1, l2] = lines as [Line, Line];
    await upload(practice, 'LED-24', 'first.835');
    const first = await attributionNow(practice);
    // Line 2's allowed amount rose and its payment did not: approved, with no approval remaining, so line 1 takes all, not allocated.
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([{ amountCents: '540', allocated: false }]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([]);
    await w.load(practice, 'LED-24/second.835');
    // One chain: the first correction is superseded by the second (REF F8), so the PLB L6's reference still names one chain.
    expect((await claimOf(practice, 'SYNEFTLED24003', 2)).superseded_by_claim_id).toBe((await claimOf(practice, 'SYNEFTLED24004', 2)).id);
    await w.reconcile(practice);
    expect(await stageOf(practice, l2.serviceLineId, 'approved')).toEqual(['3000']);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([{ amountCents: '540', allocated: false }]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
    await expectWithinFirst(practice, first);
  });

  it.each([
    [['paired.835', 'taken-back.835'], 'by the reversal of the correction alone'],
    [['paired.835', 'restated.835', 'restated-taken-back.835'], 'after a restatement, from the lines holding the chain’s interest'],
    [['paired.835', 'both-ways.835'], 'netted in one PLB L6 with interest paid on another claim'],
  ])('takes interest back as negative entries on the lines holding it, never below zero (%j, %s)', async (files) => {
    const { practice, lines } = await opened('LED-24');
    const [l1, l2] = lines as [Line, Line];
    await upload(practice, 'LED-24', ...files);
    const first = await attributionNow(practice);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0], { amountCents: '-240', allocated: true }]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1], { amountCents: '-300', allocated: true }]);
    expect(await w.sum(practice, "SELECT sum(amount_cents)::text AS total FROM ledger_entry WHERE stage = 'interest'")).toBe(0n);
    if (files.includes('taken-back.835')) {
      // The principal the reversal takes back, as LED-12's.
      expect(await w.sum(practice, "SELECT sum(amount_cents)::text AS total FROM ledger_entry WHERE stage = 'recouped'")).toBe(-5400n);
    }
    const totals = (await w.reconcile(practice)).remittances;
    expect(totals).toMatchObject({ interest: 0, interestTakenBack: 0 });
    await expectInterestFromItsL6(practice);
    await replayed(practice);
    await expectWithinFirst(practice, first);
  });

  it('shares a short PLB L6 by AMT I, the correction’s part split by payment and flagged allocated (short.835)', async () => {
    const { practice, lines } = await opened('LED-24');
    const [l1, l2] = lines as [Line, Line];
    const summary = await (async () => {
      await w.load(practice, 'LED-24/short.835');
      return (await w.reconcile(practice)).remittances;
    })();
    expect(summary).toMatchObject({ interest: 2, interestTakenBack: 0 });
    const first = await attributionNow(practice);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([{ amountCents: '162', allocated: true }]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([{ amountCents: '203', allocated: true }]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
    await expectWithinFirst(practice, first);
  });

  it('gives another patient’s line, whose claim is named after an earlier upload of it lands, nothing (out-of-order-*.835)', async () => {
    const { practice, lines } = await opened('LED-24', 'out-of-order-original.835');
    // The two-line claim's lines and the second patient's line (one case: triage groups them by payer pattern).
    expect(lines).toHaveLength(3);
    const [l1, l2, other] = lines as [Line, Line, Line];
    await upload(practice, 'LED-24', 'out-of-order-2.835');
    const first = await attributionNow(practice);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0]]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    await w.load(practice, 'LED-24/out-of-order-1.835');
    // Z, which the PLB L6 names, supersedes the second patient's claim.
    expect((await claimOf(practice, 'SYNEFTLED24010', 2)).superseded_by_claim_id).toBe((await claimOf(practice, 'SYNEFTLED24012', 2)).id);
    await w.reconcile(practice);
    expect(await stageOf(practice, other.serviceLineId, 'approved')).toEqual(['2400']);
    expect(await interestOf(practice, other.serviceLineId)).toEqual([]);
    expect(await interestOf(practice, l1.serviceLineId)).toEqual([PAIRED[0]]);
    expect(await interestOf(practice, l2.serviceLineId)).toEqual([PAIRED[1]]);
    await expectInterestFromItsL6(practice);
    await replayed(practice);
    await expectWithinFirst(practice, first);
  });

  it('reads whom each PLB L6 is for as of one moment: an upload committed after it changes nothing (D17)', async () => {
    // R1 (the original payments) and R2 (the PLB L6 naming Z, which no upload holds yet) are the moment's.
    const { practice } = await opened('LED-24', 'out-of-order-original.835');
    await w.load(practice, 'LED-24/out-of-order-2.835');
    const job = <T>(run: (scope: Scope) => Promise<T>) => withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => run(scope as Scope));
    const moment = await job((scope) => adjustmentMoment(scope, practice.practiceId));
    const before = await job((scope) => interestAttribution(scope, practice.cipher, practice.practiceId, moment));
    const [l6] = await l6sOf(practice, 'SYNEFTLED24011');
    const original = await claimOf(practice, 'SYNEFTLED24010', 1);
    const correction = await claimOf(practice, 'SYNEFTLED24011', 2);
    // Named by nothing yet, the PLB L6 is the AMT I's: the first patient's correction, whose chain's root is the original.
    // (Its claims there include the reversal beside the correction, which no claim match can name.)
    expect(before.attribution).toEqual({ draws: [{ adjustmentId: l6, chain: original.id, cents: 540n, shared: false, claimIds: expect.arrayContaining([correction.id]) }], unattributed: [] });
    // R3 commits: it holds Z, which the PLB L6 names, and its loader links the second patient's claim (in R1) to Z.
    await w.load(practice, 'LED-24/out-of-order-1.835');
    const second = await claimOf(practice, 'SYNEFTLED24010', 2);
    const z = await claimOf(practice, 'SYNEFTLED24012', 2);
    expect(second.superseded_by_claim_id).toBe(z.id);
    // Read as of the earlier moment, the attribution is exactly what it was.
    expect((await job((scope) => interestAttribution(scope, practice.cipher, practice.practiceId, moment))).attribution).toEqual(before.attribution);
    // As of now, the PLB L6 names Z's chain, which has no claim in R2, so all of it is Z's chain's.
    expect((await attributionNow(practice)).attribution).toEqual({ draws: [{ adjustmentId: l6, chain: second.id, cents: 540n, shared: false, claimIds: [z.id] }], unattributed: [] });
  });
});

describe('the interest a line’s chains report in AMT I, as the screen shows it (LED-23, LED-24; docs/adr/0084)', () => {
  /** reportedInterest for the lines, read in the practice's job scope. */
  const reported = (practice: Practice, lines: readonly Line[]) =>
    withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => reportedInterest(scope as Scope, practice.practiceId, lines.map((line) => line.serviceLineId)));
  const remittanceOf = async (practice: Practice, trace: string) => (await w.rows<{ id: string }>(practice, 'SELECT id FROM remittance WHERE trn02 = $1', [trace]))[0]?.id;

  it('nets a chain’s claims in each remittance, so a restatement adds no row and a chain shows its interest once', async () => {
    const { practice, lines } = await opened('LED-23');
    await upload(practice, 'LED-23', 'paired.835', 'net-zero.835');
    const original = await claimOf(practice, 'SYNEFTLED23001', 1);
    const paired = await remittanceOf(practice, 'SYNEFTLED23002');
    expect(await reported(practice, lines)).toEqual(
      lines.map((line) => ({ serviceLineId: line.serviceLineId, chain: original.id, remittanceId: paired, trace: 'SYNEFTLED23002', payerName: 'SYNTHETIC PAYER L', paidOn: '2026-06-08', netCents: 540n })),
    );
  });

  it('shows interest a remittance reports taken back as a negative net, in payment order', async () => {
    const { practice, lines } = await opened('LED-24');
    await upload(practice, 'LED-24', 'paired.835', 'taken-back.835');
    const original = await claimOf(practice, 'SYNEFTLED24001', 1);
    const [paired, takenBack] = [await remittanceOf(practice, 'SYNEFTLED24002'), await remittanceOf(practice, 'SYNEFTLED24005')];
    const [l1] = lines as [Line, Line];
    expect(await reported(practice, [l1])).toEqual([
      { serviceLineId: l1.serviceLineId, chain: original.id, remittanceId: paired, trace: 'SYNEFTLED24002', payerName: 'SYNTHETIC PAYER L', paidOn: '2026-06-08', netCents: 540n },
      { serviceLineId: l1.serviceLineId, chain: original.id, remittanceId: takenBack, trace: 'SYNEFTLED24005', payerName: 'SYNTHETIC PAYER L', paidOn: '2026-08-03', netCents: -540n },
    ]);
  });
});
