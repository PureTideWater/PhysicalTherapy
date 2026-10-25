import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURES, type Practice } from '../price/test-support/pricing-world';
import type { Scope } from './ledger';
import { matchPostingByHand, reverseMatch } from './manual';
import { practiceLedgerTotals } from './statements';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';
import { unmatchedItems } from './unmatched';

/**
 * The ledger oracle (PRD 18, "Three oracles", 3): synthetic posting and EFT exports with known
 * outcomes (a recovery, a partial, a recoupment after deposit, a reversal a forward balance offsets, a
 * reversed match, a duplicate export),
 * driven through the reconcile step against a scratch database, and the ledger's totals compared with
 * the known outcomes. The known totals are stated here by hand from the SYNTHETIC fixtures (a 30.00
 * difference approved on one 97110 line, the practice proving recovery by deposit, as each fixture's
 * scenario says) and checked against each fixture's expected.json; the ledger's totals are read with
 * plain SQL sums by stage, sharing no code with packages/ledger, and then through the reconcile's
 * own totals.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

interface Known {
  readonly approved: bigint;
  /** Posted, net of its reversals. */
  readonly posted: bigint;
  readonly deposited: bigint;
  readonly recouped: bigint;
  readonly interest: bigint;
  /** At the practice's proof level, deposited: deposits less recoupments and the reversals of deposits. */
  readonly recovered: bigint;
  readonly postedEntries: number;
  readonly lineStage: string;
}

type Step =
  | { readonly kind: 'export'; readonly file: string; readonly as: 'posting_export' | 'eft_export' }
  | { readonly kind: 'duplicate'; readonly file: string }
  | { readonly kind: 'remittance'; readonly file: string }
  | { readonly kind: 'match_by_hand_then_reverse'; readonly reason: string };

interface OracleCase {
  readonly name: string;
  readonly fixture: string;
  readonly steps: readonly Step[];
  readonly known: Known;
}

const CASES: readonly OracleCase[] = [
  {
    name: 'a recovery',
    fixture: 'LED-05',
    steps: [{ kind: 'export', file: 'eft-export.csv', as: 'eft_export' }],
    known: { approved: 3000n, posted: 0n, deposited: 3000n, recouped: 0n, interest: 0n, recovered: 3000n, postedEntries: 0, lineStage: 'recovered' },
  },
  {
    name: 'a partial posting at check level',
    fixture: 'LED-09',
    steps: [{ kind: 'export', file: 'posting-export.csv', as: 'posting_export' }],
    // 30.00 of the 130.00 check, of which 78.00 is posted: 30.00 x 78.00 / 130.00 = 18.00.
    known: { approved: 3000n, posted: 1800n, deposited: 0n, recouped: 0n, interest: 0n, recovered: 0n, postedEntries: 1, lineStage: 'payer_approved' },
  },
  {
    name: 'a recoupment after deposit',
    fixture: 'LED-06',
    steps: [
      { kind: 'export', file: 'posting-export.csv', as: 'posting_export' },
      { kind: 'export', file: 'eft-export.csv', as: 'eft_export' },
      { kind: 'remittance', file: 'recoupment.835' },
    ],
    known: { approved: 3000n, posted: 3000n, deposited: 3000n, recouped: -1800n, interest: 0n, recovered: 1200n, postedEntries: 1, lineStage: 'actionable' },
  },
  {
    name: 'a reversal a forward balance offsets, after deposit, and the forward balance withheld later',
    fixture: 'LED-12',
    steps: [
      { kind: 'export', file: 'posting-export.csv', as: 'posting_export' },
      { kind: 'export', file: 'eft-export.csv', as: 'eft_export' },
      { kind: 'remittance', file: 'reversal.835' },
      { kind: 'remittance', file: 'forward-balance-withheld.835' },
    ],
    // The totals at the end: the 30.00 the corrected claim approved taken back once, and neither forward balance moving a figure (that it is taken back at once, at the reversal, is ledger.db.test.ts's).
    known: { approved: 3000n, posted: 3000n, deposited: 3000n, recouped: -3000n, interest: 0n, recovered: 0n, postedEntries: 1, lineStage: 'actionable' },
  },
  {
    name: 'a reversed manual match',
    fixture: 'LED-07',
    steps: [{ kind: 'export', file: 'posting-export.csv', as: 'posting_export' }, { kind: 'match_by_hand_then_reverse', reason: 'SYNTHETIC matched to the wrong check' }],
    known: { approved: 3000n, posted: 0n, deposited: 0n, recouped: 0n, interest: 0n, recovered: 0n, postedEntries: 1, lineStage: 'payer_approved' },
  },
  {
    name: 'a duplicate posting export',
    fixture: 'LED-08',
    steps: [
      { kind: 'export', file: 'posting-export.csv', as: 'posting_export' },
      { kind: 'duplicate', file: 'posting-export.csv' },
      { kind: 'export', file: 'posting-export-again.csv', as: 'posting_export' },
    ],
    known: { approved: 3000n, posted: 3000n, deposited: 0n, recouped: 0n, interest: 0n, recovered: 0n, postedEntries: 1, lineStage: 'payer_approved' },
  },
];

interface Expected {
  readonly scenario: { readonly proofLevel?: string } | null;
  readonly uploads?: readonly { readonly step: number; readonly file: string; readonly outcome: string }[];
  readonly outcome: { readonly entries?: readonly { readonly stage: string; readonly amountCents: string }[]; readonly recoveredCents?: string; readonly postedEntries?: number; readonly matches?: number } | null;
}

const expectedOf = (fixture: string): Expected => JSON.parse(readFileSync(path.join(FIXTURES, fixture, 'expected.json'), 'utf8')) as Expected;

/** The sum of a stage's entries in the fixture's own expected outcome. */
function expectedStageSum(expected: Expected, stage: string): bigint {
  return (expected.outcome?.entries ?? []).filter((entry) => entry.stage === stage).reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n);
}

/** An upload intake takes as the duplicate of an earlier document of the same bytes (PAR-30): recorded, never stored. */
async function stageDuplicate(practice: Practice, file: string): Promise<string> {
  const content = readFileSync(path.join(FIXTURES, file));
  const id = randomUUID();
  await withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'posting_export', $3, 'text/csv', $4)", [
      id,
      practice.practiceId,
      content.length,
      practice.manager,
    ]),
  );
  await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'duplicate' WHERE id = $1", [id, createHash('sha256').update(content).digest('hex')]),
  );
  return id;
}

async function run(practice: Practice, fixture: string, step: Step): Promise<void> {
  switch (step.kind) {
    case 'export': {
      const documentId = await w.stageExport(practice, `${fixture}/${step.file}`, step.as);
      expect((await w.reconcile(practice, { documentId })).exports).toMatchObject([{ documentId, outcome: 'loaded' }]);
      return;
    }
    case 'duplicate': {
      const documentId = await stageDuplicate(practice, `${fixture}/${step.file}`);
      expect((await w.reconcile(practice, { documentId })).exports).toEqual([]);
      return;
    }
    case 'remittance':
      await w.load(practice, `${fixture}/${step.file}`);
      await w.reconcile(practice);
      return;
    case 'match_by_hand_then_reverse': {
      const items = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => unmatchedItems(scope as Scope, practice.practiceId));
      const [row] = items.postings;
      const [remittance] = await w.rows<{ remittance_id: string }>(practice, "SELECT remittance_id FROM ledger_match WHERE kind = 'claim'");
      const { matchId } = await w.manual(practice, (context) => matchPostingByHand(context, { practiceId: practice.practiceId, postingRowId: row?.postingRowId ?? '', remittanceId: remittance?.remittance_id ?? '' }));
      await w.manual(practice, (context) => reverseMatch(context, { practiceId: practice.practiceId, matchId, reason: step.reason }));
      return;
    }
  }
}

describe('the ledger oracle (PRD 18)', () => {
  it.each(CASES)('$name ($fixture): the ledger’s totals equal the known outcome', async ({ fixture, steps, known }) => {
    const expected = expectedOf(fixture);
    expect(expected.scenario?.proofLevel).toBe('deposited');
    // The known outcome agrees with the fixture's own.
    for (const [stage, cents] of [
      ['approved', known.approved],
      ['deposited', known.deposited],
      ['recouped', known.recouped],
    ] as const) {
      if ((expected.outcome?.entries ?? []).length > 0) {
        expect(expectedStageSum(expected, stage)).toBe(cents);
      }
    }
    if (expected.outcome?.recoveredCents !== undefined) {
      expect(BigInt(expected.outcome.recoveredCents)).toBe(known.recovered);
    }
    if (expected.outcome?.postedEntries !== undefined) {
      expect(expected.outcome.postedEntries).toBe(known.postedEntries);
    }

    const practice = await w.practice(`oracle ${fixture} ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
    const { serviceLineId } = await w.caseFor(practice, `${fixture}/original.835`);
    await w.load(practice, `${fixture}/adjusted.835`);
    await w.reconcile(practice);
    for (const step of steps) {
      await run(practice, fixture, step);
    }
    // And a replay of the whole reconcile changes nothing.
    await w.reconcile(practice);

    const stageSum = (stage: string) => w.sum(practice, 'SELECT sum(amount_cents)::text AS total FROM ledger_entry WHERE stage = $1', [stage]);
    const reversalsOf = (stage: string) =>
      w.sum(practice, 'SELECT sum(r.amount_cents)::text AS total FROM ledger_entry r JOIN ledger_entry t ON t.id = r.evidence_id WHERE r.stage = $1 AND t.stage = $2', ['reversed', stage]);
    const sql = {
      approved: (await stageSum('approved')) + (await reversalsOf('approved')),
      posted: (await stageSum('posted')) + (await reversalsOf('posted')),
      deposited: (await stageSum('deposited')) + (await reversalsOf('deposited')),
      recouped: await stageSum('recouped'),
      interest: await stageSum('interest'),
    };
    expect(sql).toEqual({ approved: known.approved, posted: known.posted, deposited: known.deposited, recouped: known.recouped, interest: known.interest });
    expect(sql.deposited + sql.recouped).toBe(known.recovered);
    expect(await w.rows(practice, "SELECT count(*)::int AS n FROM ledger_entry WHERE stage = 'posted'")).toEqual([{ n: known.postedEntries }]);
    if (expected.outcome?.matches !== undefined) {
      expect(await w.rows(practice, "SELECT count(*)::int AS n FROM ledger_match WHERE kind = 'posting'")).toEqual([{ n: expected.outcome.matches }]);
    }

    // The reconcile's own totals say the same.
    const totals = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => practiceLedgerTotals(scope as Scope, practice.practiceId));
    expect(totals).toMatchObject({
      approvedCents: known.approved,
      postedCents: known.posted,
      depositedCents: known.deposited,
      recoupedCents: known.recouped,
      interestCents: known.interest,
      recoveredCents: known.recovered,
    });
    expect(await w.lineStage(practice, serviceLineId)).toBe(known.lineStage);
  });
});
