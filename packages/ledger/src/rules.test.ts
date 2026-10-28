import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { allocateByWeight, cumulativeShare, partialShare, takeInOrder } from './allocation';
import { parseCsv } from './csv';
import { attributeInterest, interestWrites } from './interest';
import { reprocessing } from './matching';
import { quarterOf, quarterPeriod, roiStatement } from './roi';
import { LedgerSettingsError, ledgerSettings } from './settings';
import { ALLOCATABLE_STAGES, CORRECTING_STAGES, COUNTED_STAGES, type LedgerEntry, LedgerError, STAGE_EVIDENCE, STAGE_SIGN, correctedEntry } from './stages';
import { type StoredStatement, recomputeStatement } from './statement';

/**
 * The ledger's rules stated exactly: the stage tables PRD 13 gives, and each refusal's class, name and message,
 * so a refusal a person or a log reads always says which rule the input broke.
 */

/** The error `run` throws, so a test can hold its class, its name and its exact message. */
function refusalOf(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error('the refusal is not an Error', { cause: error });
  }
  throw new Error('expected a refusal, and nothing was thrown');
}

const reversal: LedgerEntry = {
  id: 'r',
  caseId: 'case-1',
  serviceLineId: 'line-1',
  stage: 'reversed',
  amountCents: cents(-3000n),
  evidenceKind: 'ledger_entry',
  evidenceId: 'p',
  allocated: false,
  effectiveOn: '2026-06-08',
};

const statement: StoredStatement = {
  periodFrom: '2026-04-01',
  periodTo: '2026-06-30',
  proofLevel: 'posted',
  feesCents: cents(0n),
  recoveredCents: cents(0n),
  interestCents: cents(0n),
  approvedUnpostedCents: cents(0n),
  actionableOpenCents: cents(0n),
  pursuitHours: '0.00',
  links: { recovered: ['missing'], interest: [], approvedUnposted: [], actionableOpen: [] },
};

const l6 = (id: string) => ({ id, remittanceId: 'r', position: 1, cashCents: cents(540n), namedChain: null, namedClaimIds: [] });
const draw = (adjustmentId: string, chain: string) => ({ adjustmentId, chain, cents: cents(540n), shared: false, claimIds: ['claim'] });
const paidLine = (serviceLineId: string) => ({ serviceLineId, claimId: 'claim', approved: true, weightCents: cents(2400n) });

const period = { periodFrom: '2026-04-01', periodTo: '2026-06-30', proofLevel: 'posted' as const, entries: [], feesCents: cents(0n), pursuitHours: '0.00', openCases: [] };

describe('the stage tables (PRD 13, Entries)', () => {
  it('gives each stage its sign', () => {
    expect(STAGE_SIGN).toEqual({
      approved: 'positive',
      posted: 'positive',
      deposited: 'positive',
      interest: 'signed',
      recouped: 'negative',
      reversed: 'offsetting',
      adjusted: 'signed',
    });
  });

  it('gives each stage its evidence, and names the counted, correcting and allocatable stages', () => {
    expect(STAGE_EVIDENCE).toEqual({
      approved: ['claim', 'payer_response'],
      posted: ['posting_row'],
      deposited: ['eft_row'],
      recouped: ['provider_adjustment', 'claim'],
      interest: ['provider_adjustment', 'claim'],
      reversed: ['ledger_entry'],
      adjusted: ['ledger_entry'],
    });
    expect(COUNTED_STAGES).toEqual(['approved', 'posted', 'deposited', 'recouped', 'interest']);
    expect(CORRECTING_STAGES).toEqual(['reversed', 'adjusted']);
    expect(ALLOCATABLE_STAGES).toEqual(['approved', 'posted', 'deposited', 'interest']);
  });
});

describe('every ledger refusal is a LedgerError that names the rule broken', () => {
  it('names itself, so a log line or a caught error reads as a ledger refusal', () => {
    const error = new LedgerError('a refusal');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LedgerError');
    expect(String(error)).toBe('LedgerError: a refusal');
  });

  it.each([
    ['a share of a check of nothing', () => cumulativeShare(cents(100n), cents(0n), cents(0n)), 'a share is allocated from a positive check, a share of zero or more, and postings within the check'],
    ['a partial posting of nothing', () => partialShare(cents(1n), cents(0n), cents(0n), cents(10n)), 'a partial posting posts a positive amount'],
    ['weights that are all zero', () => allocateByWeight(cents(1n), [cents(0n)]), 'an amount is allocated by weights of zero or more that are not all zero'],
    ['a negative capacity', () => takeInOrder(cents(1n), [cents(-1n)]), 'an amount is taken from capacities of zero or more'],
    ['text after a closing quote', () => parseCsv('"a"b,c'), 'the export has text after a closing quote at character 3'],
    ['a quote never closed', () => parseCsv('"open'), 'the export ends inside a quoted field'],
    [
      'a negative unpaid approval',
      () => reprocessing({ remittanceAllowedCents: cents(7000n), unpaidApprovalCents: cents(-1n), newAllowedCents: cents(10000n), approvedRemainingCents: cents(0n) }),
      'a reprocessing is compared with an unpaid approval and an approval remaining of zero or more',
    ],
    ['a period that ends before it starts', () => roiStatement({ ...period, periodFrom: '2026-07-01' }), 'an ROI statement covers a period of calendar dates, its start not after its end'],
    ['negative fees', () => roiStatement({ ...period, feesCents: cents(-1n) }), 'fees are zero or more and pursuit hours are hours with two places'],
    ['a quarter that is not one', () => quarterPeriod('2026-Q5'), 'a quarter is written YYYY-Qn'],
    ['a day that is not one', () => quarterOf('2026-7-1'), 'a day is written YYYY-MM-DD'],
    ['a correction whose target is gone', () => correctedEntry(reversal, new Map()), 'a correction counts toward the stage of the entry it corrects, which the ledger must hold'],
    ['a statement linking an entry the ledger lacks', () => recomputeStatement(statement, new Map()), 'a statement links an entry the ledger does not hold'],
    [
      'a PLB L6 given twice',
      () => attributeInterest({ remittances: [{ id: 'r', claims: [] }], adjustments: [l6('a'), l6('a')] }),
      'interest is attributed from each PLB L6, claim and remittance once',
    ],
    ['the draws of two PLB L6s at once', () => interestWrites({ draws: [draw('a', 'c'), draw('b', 'd')], written: [], lines: new Map() }), "interest is written from one PLB L6's draws, each chain once"],
    [
      'one line twice in a chain’s list',
      () => interestWrites({ draws: [draw('a', 'c')], written: [], lines: new Map([['c', { paid: [paidLine('l'), paidLine('l')], takenBack: [] }]]) }),
      "interest reaches a line once in each chain's list",
    ],
    [
      'a negative approval remaining',
      () => interestWrites({ draws: [draw('a', 'c')], written: [], lines: new Map([['c', { paid: [{ ...paidLine('l'), weightCents: cents(-1n) }], takenBack: [] }]]) }),
      'interest is split by approvals remaining of zero or more',
    ],
  ])('refuses %s with its own message', (_name, run, message) => {
    const error = refusalOf(run);
    expect(error).toBeInstanceOf(LedgerError);
    expect(error.name).toBe('LedgerError');
    expect(error.message).toBe(message);
  });

  it('refuses a malformed practice setting with a LedgerSettingsError naming its key', () => {
    for (const [stored, key] of [
      [{ proof_level: 'approved' }, 'proof_level'],
      [{ posting_export_template: { template: 'no_such_template' } }, 'posting_export_template'],
    ] as const) {
      const error = refusalOf(() => ledgerSettings(stored));
      expect(error).toBeInstanceOf(LedgerSettingsError);
      expect(error).toBeInstanceOf(LedgerError);
      expect(error.name).toBe('LedgerSettingsError');
      expect(error.message).toBe(`the practice setting ${key} is malformed`);
      expect((error as LedgerSettingsError).key).toBe(key);
    }
  });
});
