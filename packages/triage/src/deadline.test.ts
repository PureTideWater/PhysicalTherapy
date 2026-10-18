import type { Cents } from '@tp/money';
import { type LineFacts, type PricingTrace, type TraceWindow, price } from '@tp/pricing';
import { contractAgreement, lineFacts, maAgreement, percentTerms, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { VERIFICATION_LEVELS, type VerificationLevel } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type ContractWindowFacts,
  DEADLINE_STATUSES,
  DEADLINE_UNVERIFIED_CAUSES,
  type DeadlineMinimumLevel,
  type DeadlineVerification,
  deadlineVerification,
  levelAtLeast,
  nextLevelDeadlineVerification,
  packetDeadlineStatus,
  windowEvidenceComplete,
} from './deadline';

/**
 * D17 (a) over every window source and level (reconciliation-001; docs/adr/0061). The traces are the engine's
 * own (@tp/pricing under SYNTHETIC releases 900001 and 900003): a Medicare Advantage non-contracted line (Medicare
 * redetermination from the release), a contract line silent on its window (900003's commercial_default) and a
 * contract line with its own 30-day window; the properties vary the window step and the facts beside it.
 */

const RELEASE = syntheticRelease(900001);
/** The release that holds a commercial_default dispute window. */
const DEFAULTS_RELEASE = syntheticRelease(900003);
const VERSION_ID = 'cv-synth-1';
const DOCUMENT_ID = '0b9a7c55-5f0e-4d43-8d2c-6a1f00000001';
const EVIDENCE = { documentId: DOCUMENT_ID, page: 1, quote: 'Disputes are raised within 30 days of the remittance.', hash: 'a'.repeat(64) };

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

  it('verifies a Medicare release window exactly when its record is at the minimum level or higher (L2 by default, L3 for E3)', () => {
    fc.assert(
      fc.property(level, fc.option(minimum, { nil: undefined }), fc.boolean(), fc.boolean(), (recordLevel, minimumLevel, withFacts, releaseWithdrawn) => {
        const result = deadlineVerification({ trace: MA_TRACE, recordLevel, releaseWithdrawn, contractWindow: withFacts ? signedOff() : null, minimumLevel });
        expectShape(result);
        const wanted = minimumLevel ?? 'L2';
        // A withdrawn release's record verifies nothing, at any level.
        expect(result.status).toBe(recordLevel !== null && !releaseWithdrawn && VERIFICATION_LEVELS.indexOf(recordLevel) >= VERIFICATION_LEVELS.indexOf(wanted) ? 'verified' : 'unverified');
        expect(result.cause).toBe(recordLevel === null ? 'RECORD_NOT_IN_RELEASE' : releaseWithdrawn ? 'RELEASE_WITHDRAWN' : result.status === 'verified' ? null : 'RECORD_BELOW_LEVEL');
        expect(result).toMatchObject({ source: 'release', endsOn: MA_TRACE.steps.window?.ends_on, level: recordLevel });
      }),
    );
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

  it('verifies a contract window only from a signed-off version whose window is cited, verified and the trace’s length in days', () => {
    const facts = fc.record({
      contractVersionId: fc.constantFrom(VERSION_ID, 'cv-synth-other'),
      status: fc.constantFrom('signed_off', 'approved', 'superseded', 'draft'),
      disputeWindowDays: fc.constantFrom(30, 31, null),
      evidence: fc.constantFrom(EVIDENCE, null, { ...EVIDENCE, quote: '   ' }, { ...EVIDENCE, hash: 'nothex' }, { ...EVIDENCE, page: 0 }, { ...EVIDENCE, documentId: 'not-a-uuid' }),
      verified: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.option(facts, { nil: null }), level, minimum, fc.constantFrom<'days' | 'months'>('days', 'months'), fc.boolean(), (drawn, recordLevel, minimumLevel, unit, releaseWithdrawn) => {
        const contractWindow =
          drawn === null
            ? null
            : {
                contractVersionId: drawn.contractVersionId,
                status: drawn.status,
                disputeWindowDays: drawn.disputeWindowDays,
                evidence: drawn.evidence,
                verifiedBy: drawn.verified ? 'reviewer' : null,
                verifiedAt: drawn.verified ? '2026-10-01T12:00:00.000Z' : null,
              };
        const trace = withWindow(CONTRACT_TRACE, { ...(CONTRACT_TRACE.steps.window as TraceWindow), unit });
        // A contract window rests on the version, never on a release: a withdrawn release changes nothing here.
        const result = deadlineVerification({ trace, recordLevel, releaseWithdrawn, contractWindow, minimumLevel });
        expectShape(result);
        const cited = contractWindow !== null && contractWindow.contractVersionId === VERSION_ID && contractWindow.evidence !== null && windowEvidenceComplete(contractWindow.evidence);
        const expectedCause = !cited
          ? 'CONTRACT_WINDOW_UNCITED'
          : contractWindow.verifiedBy === null
            ? 'CONTRACT_WINDOW_UNVERIFIED'
            : contractWindow.status !== 'signed_off'
              ? 'CONTRACT_VERSION_NOT_SIGNED_OFF'
              : unit !== 'days' || contractWindow.disputeWindowDays !== 30
                ? 'CONTRACT_WINDOW_DIFFERS'
                : null;
        expect(result).toEqual({ status: expectedCause === null ? 'verified' : 'unverified', source: 'contract', endsOn: CONTRACT_TRACE.steps.window?.ends_on, level: null, cause: expectedCause });
      }),
    );
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
          // Verified only when the record in force gives exactly the stored end, at the level asked for or above.
          const same = endsOn !== null && recordEndsOn === endsOn;
          expect(result.status).toBe(same && levelAtLeast(recordLevel, minimumLevel ?? 'L2') ? 'verified' : 'unverified');
          expect(result.cause).toBe(recordLevel === null ? 'RECORD_NOT_IN_RELEASE' : !same ? 'NEXT_LEVEL_DIFFERS' : result.status === 'verified' ? null : 'RECORD_BELOW_LEVEL');
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
