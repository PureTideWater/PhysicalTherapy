import type { Cents } from '@tp/money';
import { type LineFacts, type PricingTrace, type TraceWindow, price } from '@tp/pricing';
import { contractAgreement, lineFacts, maAgreement, percentTerms, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { VERIFICATION_LEVELS, type VerificationLevel } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  COMPUTED_CONTRACT_WINDOW,
  type ContractWindowFacts,
  DEADLINE_STATUSES,
  DEADLINE_UNVERIFIED_CAUSES,
  type DeadlineMinimumLevel,
  type DeadlineVerification,
  deadlineVerification,
  MA_DISPUTE_ROUTE_CONFIRMED,
  contractWindowRuleComputed,
  levelAtLeast,
  nextLevelDeadlineVerification,
  packetDeadlineStatus,
  windowEvidenceComplete,
} from './deadline';

/**
 * D17 (a) over every window source and level (reconciliation-001; docs/adr/0061). The traces are the engine's
 * own (@tp/pricing under SYNTHETIC releases 900001 and 900003): a Medicare Advantage non-contracted line (Medicare
 * redetermination from the release), a contract line silent on its window (900003's commercial_default) and a
 * contract line with its own 30-day window; the properties vary the window step and the facts beside it. A contract
 * window is verified only when its cited rule is the one the engine computes (calendar days after the remittance
 * date), and no Medicare Advantage window is verified until the specialist confirms the route (Q34; best-option
 * audit #5).
 */

const RELEASE = syntheticRelease(900001);
/** The release that holds a commercial_default dispute window. */
const DEFAULTS_RELEASE = syntheticRelease(900003);
const VERSION_ID = 'cv-synth-1';
const DOCUMENT_ID = '0b9a7c55-5f0e-4d43-8d2c-6a1f00000001';
const EVIDENCE = {
  documentId: DOCUMENT_ID,
  page: 1,
  quote: 'Disputes are raised within 30 days of the remittance.',
  hash: 'a'.repeat(64),
  unit: 'calendar_days',
  measuredFrom: 'remittance_date',
};
const UNITS = ['calendar_days', 'business_days', 'months'] as const;
const STARTS = ['date_of_service', 'remittance_date', 'payment_date', 'receipt_date'] as const;

function traceOf(agreement: LineFacts['agreement'], release = RELEASE): PricingTrace {
  const [result] = price(pricingInput(release, [lineFacts({ observedAllowedCents: 1n as Cents, agreement })]));
  if (result === undefined || result.outcome !== 'priced') {
    throw new Error('the synthetic line did not price');
  }
  return result.trace;
}

const MA_TRACE = traceOf(maAgreement());
const SILENT_CONTRACT_TRACE = traceOf(contractAgreement({ terms: percentTerms() }), DEFAULTS_RELEASE);
const CONTRACT_TRACE = traceOf(contractAgreement({ terms: percentTerms(), windows: { timely_filing_days: null, dispute_window_days: 30, appeal_levels: [{ level: 1, days: 60 }] } }));

const signedOff = (overrides: Partial<ContractWindowFacts> = {}): ContractWindowFacts => ({
  contractVersionId: VERSION_ID,
  status: 'signed_off',
  disputeWindowDays: 30,
  evidence: EVIDENCE,
  verifiedBy: '0b9a7c55-5f0e-4d43-8d2c-6a1f00000002',
  verifiedAt: '2026-10-01T12:00:00.000Z',
  ...overrides,
});

function withWindow(trace: PricingTrace, window: TraceWindow | null): PricingTrace {
  return { ...trace, steps: { ...trace.steps, window } };
}

const level = fc.option(fc.constantFrom<VerificationLevel>(...VERIFICATION_LEVELS), { nil: null });
const minimum = fc.constantFrom<DeadlineMinimumLevel>('L2', 'L3');

function expectShape(result: DeadlineVerification): void {
  expect(DEADLINE_STATUSES).toContain(result.status);
  if (result.status === 'unverified') {
    expect(DEADLINE_UNVERIFIED_CAUSES).toContain(result.cause);
  } else {
    expect(result.cause).toBeNull();
  }
}

describe('the traces the engine writes', () => {
  it('name Medicare redetermination for a Medicare Advantage non-contracted line, commercial_default for a silent contract and the contract for its own window', () => {
    expect(MA_TRACE.steps.window).toMatchObject({ source: 'release', record: { key: { program: 'medicare', window: 'redetermination' } } });
    expect(SILENT_CONTRACT_TRACE.steps.window).toMatchObject({ source: 'release', record: { key: { program: 'commercial_default', window: 'redetermination' } } });
    expect(CONTRACT_TRACE.steps.window).toMatchObject({ source: 'contract', record: null, length: 30, unit: 'days' });
    expect(CONTRACT_TRACE.agreement?.contract_version_id).toBe(VERSION_ID);
  });
});

describe('deadlineVerification (D17 a)', () => {
  it('is not applicable without a window, whatever else is known', () => {
    fc.assert(
      fc.property(fc.constantFrom(MA_TRACE, SILENT_CONTRACT_TRACE, CONTRACT_TRACE), level, minimum, fc.boolean(), fc.boolean(), (trace, recordLevel, minimumLevel, noStep, withFacts) => {
        const window = noStep ? null : { ...(trace.steps.window as TraceWindow), source: null, record: null, ends_on: null, status: 'NO_WINDOW' as const };
        const result = deadlineVerification({ trace: withWindow(trace, window), recordLevel, releaseWithdrawn: false, contractWindow: withFacts ? signedOff() : null, minimumLevel });
        expect(result).toEqual({ status: 'not_applicable', source: null, endsOn: null, level: null, cause: null });
      }),
    );
  });

  it('leaves every Medicare release window unverified until the specialist confirms the Medicare Advantage route (Q34), after its record’s own checks', () => {
    expect(MA_DISPUTE_ROUTE_CONFIRMED).toBe(false);
    fc.assert(
      fc.property(level, fc.option(minimum, { nil: undefined }), fc.boolean(), fc.boolean(), (recordLevel, minimumLevel, withFacts, releaseWithdrawn) => {
        const result = deadlineVerification({ trace: MA_TRACE, recordLevel, releaseWithdrawn, contractWindow: withFacts ? signedOff() : null, minimumLevel });
        expectShape(result);
        const wanted = minimumLevel ?? 'L2';
        expect(result.status).toBe('unverified');
        // A withdrawn release's record verifies nothing, at any level; a record at the level waits for the route.
        const atLevel = recordLevel !== null && VERIFICATION_LEVELS.indexOf(recordLevel) >= VERIFICATION_LEVELS.indexOf(wanted);
        expect(result.cause).toBe(recordLevel === null ? 'RECORD_NOT_IN_RELEASE' : releaseWithdrawn ? 'RELEASE_WITHDRAWN' : atLevel ? 'MA_ROUTE_UNCONFIRMED' : 'RECORD_BELOW_LEVEL');
        expect(result).toMatchObject({ source: 'release', endsOn: MA_TRACE.steps.window?.ends_on, level: recordLevel });
      }),
    );
    // The L1 records of releases 900001 to 900004 stay below the level; 900005's L2 records wait for the route.
    expect(deadlineVerification({ trace: MA_TRACE, recordLevel: 'L1', releaseWithdrawn: false, contractWindow: null }).cause).toBe('RECORD_BELOW_LEVEL');
    expect(deadlineVerification({ trace: MA_TRACE, recordLevel: 'L2', releaseWithdrawn: false, contractWindow: null }).cause).toBe('MA_ROUTE_UNCONFIRMED');
  });

  it('never verifies a release commercial_default window, at any level', () => {
    fc.assert(
      fc.property(level, minimum, fc.boolean(), (recordLevel, minimumLevel, withFacts) => {
        const result = deadlineVerification({ trace: SILENT_CONTRACT_TRACE, recordLevel, releaseWithdrawn: false, contractWindow: withFacts ? signedOff() : null, minimumLevel });
        expect(result).toEqual({ status: 'unverified', source: 'release', endsOn: SILENT_CONTRACT_TRACE.steps.window?.ends_on, level: recordLevel, cause: 'COMMERCIAL_DEFAULT' });
      }),
    );
    expect(deadlineVerification({ trace: SILENT_CONTRACT_TRACE, recordLevel: 'L3', releaseWithdrawn: false, contractWindow: null }).status).toBe('unverified');
  });

  it('verifies a contract window only from a signed-off version whose window is cited with the computed rule, verified and the trace’s length in days from the remittance date', () => {
    const facts = fc.record({
      contractVersionId: fc.constantFrom(VERSION_ID, 'cv-synth-other'),
      status: fc.constantFrom('signed_off', 'approved', 'superseded', 'draft'),
      disputeWindowDays: fc.constantFrom(30, 31, null),
      evidence: fc.constantFrom(EVIDENCE, null, { ...EVIDENCE, quote: '   ' }, { ...EVIDENCE, hash: 'nothex' }, { ...EVIDENCE, page: 0 }, { ...EVIDENCE, documentId: 'not-a-uuid' }),
      unit: fc.constantFrom(...UNITS),
      measuredFrom: fc.constantFrom(...STARTS),
      verified: fc.boolean(),
    });
    const traceStart = fc.constantFrom<'remittance_date' | 'date_of_service'>('remittance_date', 'date_of_service');
    fc.assert(
      fc.property(
        fc.option(facts, { nil: null }),
        level,
        minimum,
        fc.constantFrom<'days' | 'months'>('days', 'months'),
        traceStart,
        fc.boolean(),
        (drawn, recordLevel, minimumLevel, unit, measuredFrom, releaseWithdrawn) => {
          const contractWindow =
            drawn === null
              ? null
              : {
                  contractVersionId: drawn.contractVersionId,
                  status: drawn.status,
                  disputeWindowDays: drawn.disputeWindowDays,
                  evidence: drawn.evidence === null ? null : { ...drawn.evidence, unit: drawn.unit, measuredFrom: drawn.measuredFrom },
                  verifiedBy: drawn.verified ? 'reviewer' : null,
                  verifiedAt: drawn.verified ? '2026-10-01T12:00:00.000Z' : null,
                };
          const trace = withWindow(CONTRACT_TRACE, { ...(CONTRACT_TRACE.steps.window as TraceWindow), unit, measured_from: measuredFrom });
          // A contract window rests on the version, never on a release: a withdrawn release changes nothing here.
          const result = deadlineVerification({ trace, recordLevel, releaseWithdrawn, contractWindow, minimumLevel });
          expectShape(result);
          const cited = contractWindow !== null && contractWindow.contractVersionId === VERSION_ID && contractWindow.evidence !== null && windowEvidenceComplete(contractWindow.evidence);
          const expectedCause = !cited
            ? 'CONTRACT_WINDOW_UNCITED'
            : contractWindow.evidence?.unit !== 'calendar_days' || contractWindow.evidence.measuredFrom !== 'remittance_date'
              ? 'CONTRACT_WINDOW_RULE_NOT_COMPUTED'
              : contractWindow.verifiedBy === null
                ? 'CONTRACT_WINDOW_UNVERIFIED'
                : contractWindow.status !== 'signed_off'
                  ? 'CONTRACT_VERSION_NOT_SIGNED_OFF'
                  : unit !== 'days' || measuredFrom !== 'remittance_date' || contractWindow.disputeWindowDays !== 30
                    ? 'CONTRACT_WINDOW_DIFFERS'
                    : null;
          expect(result).toEqual({ status: expectedCause === null ? 'verified' : 'unverified', source: 'contract', endsOn: CONTRACT_TRACE.steps.window?.ends_on, level: null, cause: expectedCause });
        },
      ),
    );
  });

  it('never verifies “within 180 days of the date of service” as a remittance-date window, though a specialist verified it and the days match', () => {
    const trace = withWindow(CONTRACT_TRACE, { ...(CONTRACT_TRACE.steps.window as TraceWindow), length: 180 });
    const fromService = signedOff({ disputeWindowDays: 180, evidence: { ...EVIDENCE, quote: 'within 180 days of the date of service', measuredFrom: 'date_of_service' } });
    expect(deadlineVerification({ trace, recordLevel: null, releaseWithdrawn: false, contractWindow: fromService })).toMatchObject({ status: 'unverified', cause: 'CONTRACT_WINDOW_RULE_NOT_COMPUTED' });
    const businessDays = signedOff({ disputeWindowDays: 180, evidence: { ...EVIDENCE, unit: 'business_days' } });
    expect(deadlineVerification({ trace, recordLevel: null, releaseWithdrawn: false, contractWindow: businessDays })).toMatchObject({ status: 'unverified', cause: 'CONTRACT_WINDOW_RULE_NOT_COMPUTED' });
    expect(deadlineVerification({ trace, recordLevel: null, releaseWithdrawn: false, contractWindow: signedOff({ disputeWindowDays: 180 }) })).toMatchObject({ status: 'verified', cause: null });
  });

  it('computes exactly one rule, the engine’s: calendar days after the remittance date', () => {
    expect(COMPUTED_CONTRACT_WINDOW).toEqual({ unit: 'calendar_days', measuredFrom: 'remittance_date' });
    for (const unit of UNITS) {
      for (const measuredFrom of STARTS) {
        expect(contractWindowRuleComputed({ unit, measuredFrom })).toBe(unit === 'calendar_days' && measuredFrom === 'remittance_date');
      }
    }
  });

  it('orders its causes: the release’s, the route, then the contract window’s, then the next level’s', () => {
    expect(DEADLINE_UNVERIFIED_CAUSES).toEqual([
      'COMMERCIAL_DEFAULT',
      'RECORD_NOT_IN_RELEASE',
      'RELEASE_WITHDRAWN',
      'RECORD_BELOW_LEVEL',
      'MA_ROUTE_UNCONFIRMED',
      'CONTRACT_WINDOW_UNCITED',
      'CONTRACT_WINDOW_RULE_NOT_COMPUTED',
      'CONTRACT_WINDOW_UNVERIFIED',
      'CONTRACT_VERSION_NOT_SIGNED_OFF',
      'CONTRACT_WINDOW_DIFFERS',
      'NEXT_LEVEL_UNCITED',
      'NEXT_LEVEL_DIFFERS',
    ]);
    for (const cause of DEADLINE_UNVERIFIED_CAUSES) {
      expect(cause).toMatch(/^[A-Z][A-Z_]{0,39}$/);
    }
  });

  it('never turns unverified into verified by raising the level asked for, and keeps the trace’s source and end', () => {
    fc.assert(
      fc.property(fc.constantFrom(MA_TRACE, SILENT_CONTRACT_TRACE, CONTRACT_TRACE), level, fc.option(fc.constant(signedOff()), { nil: null }), (trace, recordLevel, contractWindow) => {
        const atTwo = deadlineVerification({ trace, recordLevel, releaseWithdrawn: false, contractWindow, minimumLevel: 'L2' });
        const atThree = deadlineVerification({ trace, recordLevel, releaseWithdrawn: false, contractWindow, minimumLevel: 'L3' });
        if (atTwo.status !== 'verified') {
          expect(atThree.status).toBe(atTwo.status);
        }
        for (const result of [atTwo, atThree]) {
          expect(result.source).toBe(trace.steps.window?.source ?? null);
          expect(result.endsOn).toBe(trace.steps.window?.ends_on ?? null);
        }
      }),
    );
  });

  it('reads a line with no agreement in its trace as uncited', () => {
    const trace = { ...CONTRACT_TRACE, agreement: null };
    expect(deadlineVerification({ trace, recordLevel: null, releaseWithdrawn: false, contractWindow: signedOff() })).toMatchObject({ status: 'unverified', cause: 'CONTRACT_WINDOW_UNCITED' });
    const noRecord = withWindow(MA_TRACE, { ...(MA_TRACE.steps.window as TraceWindow), record: null });
    expect(deadlineVerification({ trace: noRecord, recordLevel: 'L3', releaseWithdrawn: false, contractWindow: null })).toMatchObject({ status: 'unverified', cause: 'RECORD_NOT_IN_RELEASE' });
  });
});

describe('the level order and the evidence', () => {
  it('orders L1 < L2 < L3', () => {
    expect(levelAtLeast('L1', 'L2')).toBe(false);
    expect(levelAtLeast('L2', 'L2')).toBe(true);
    expect(levelAtLeast('L3', 'L2')).toBe(true);
    expect(levelAtLeast('L2', 'L3')).toBe(false);
    expect(levelAtLeast('L3', 'L3')).toBe(true);
    expect(levelAtLeast(null, 'L2')).toBe(false);
  });

  it('reads evidence as rate_record_evidence_complete() does', () => {
    expect(windowEvidenceComplete(EVIDENCE)).toBe(true);
    expect(windowEvidenceComplete({ ...EVIDENCE, page: 1_000_000 })).toBe(false);
    expect(windowEvidenceComplete({ ...EVIDENCE, page: 3 / 2 })).toBe(false);
    expect(windowEvidenceComplete({ ...EVIDENCE, documentId: DOCUMENT_ID.toUpperCase() })).toBe(false);
    // PostgreSQL's btrim takes spaces only: a quote of a tab is not blank to it.
    expect(windowEvidenceComplete({ ...EVIDENCE, quote: '\t' })).toBe(true);
    expect(windowEvidenceComplete({ ...EVIDENCE, quote: '  ' })).toBe(false);
  });
});

describe('nextLevelDeadlineVerification', () => {
  it('never verifies a contract’s appeal level, and verifies the regulation’s reconsideration window as a release window, from the record that gives its end', () => {
    const date = fc.option(fc.constantFrom('2026-12-01', '2027-01-30'), { nil: null });
    fc.assert(
      fc.property(fc.constantFrom<'contract' | 'regulation'>('contract', 'regulation'), level, fc.option(minimum, { nil: undefined }), date, date, (basis, recordLevel, minimumLevel, endsOn, recordEndsOn) => {
        const result = nextLevelDeadlineVerification({ basis, recordLevel, recordEndsOn, endsOn, minimumLevel });
        expectShape(result);
        expect(result.endsOn).toBe(endsOn);
        if (basis === 'contract') {
          expect(result).toEqual({ status: 'unverified', source: 'contract', endsOn, level: null, cause: 'NEXT_LEVEL_UNCITED' });
        } else {
          // Never verified until the route is confirmed (Q34); before that, the record in force must give exactly the
          // stored end, at the level asked for or above.
          const same = endsOn !== null && recordEndsOn === endsOn;
          expect(result.status).toBe('unverified');
          expect(result.cause).toBe(
            recordLevel === null ? 'RECORD_NOT_IN_RELEASE' : !same ? 'NEXT_LEVEL_DIFFERS' : levelAtLeast(recordLevel, minimumLevel ?? 'L2') ? 'MA_ROUTE_UNCONFIRMED' : 'RECORD_BELOW_LEVEL',
          );
          expect(result.source).toBe('release');
        }
      }),
    );
  });

  it('leaves a date that another record gave unverified, though the record in force now is at L2 or L3', () => {
    for (const recordLevel of ['L2', 'L3'] as const) {
      expect(nextLevelDeadlineVerification({ basis: 'regulation', recordLevel, recordEndsOn: '2026-12-01', endsOn: '2027-04-10' })).toEqual({
        status: 'unverified',
        source: 'release',
        endsOn: '2027-04-10',
        level: recordLevel,
        cause: 'NEXT_LEVEL_DIFFERS',
      });
    }
  });
});

describe('packetDeadlineStatus', () => {
  it('is not applicable with no line, verified when every line is, unverified otherwise', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...DEADLINE_STATUSES).map((status) => ({ status }))), (lines) => {
        const status = packetDeadlineStatus(lines);
        expect(status).toBe(lines.length === 0 ? 'not_applicable' : lines.every((line) => line.status === 'verified') ? 'verified' : 'unverified');
      }),
    );
  });
});
