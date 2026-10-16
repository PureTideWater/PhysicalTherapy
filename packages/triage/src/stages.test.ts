import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { LINE_STAGES, type LineStage, StageTransitionError, advanceTo, checkStageEvent, deriveCaseState, isLineStage, stageRank } from './stages';

const triageStages: readonly LineStage[] = ['flagged', 'validated', 'actionable'];

describe('line stages (PRD 8, The status machine)', () => {
  it('ranks the stages in their order and recognizes only them', () => {
    expect(LINE_STAGES.map(stageRank)).toEqual([0, 1, 2, 3, 4]);
    expect(isLineStage('actionable')).toBe(true);
    expect(isLineStage('closed')).toBe(false);
    expect(isLineStage(3)).toBe(false);
  });

  it('accepts a first event at any stage triage sets, and later forward moves', () => {
    for (const stage of triageStages) {
      expect(() => checkStageEvent(null, { stage, reopenedFrom: null, reason: null })).not.toThrow();
    }
    expect(() => checkStageEvent('flagged', { stage: 'validated', reopenedFrom: null, reason: null })).not.toThrow();
    expect(() => checkStageEvent('flagged', { stage: 'actionable', reopenedFrom: null, reason: null })).not.toThrow();
  });

  it('refuses a move back or a repeat that is not an explicit reopen', () => {
    expect(() => checkStageEvent('actionable', { stage: 'validated', reopenedFrom: null, reason: null })).toThrow(StageTransitionError);
    expect(() => checkStageEvent('validated', { stage: 'validated', reopenedFrom: null, reason: 'again' })).toThrow(/move forward only/);
  });

  it('accepts a reopen at the current stage or an earlier one, with a reason (CAS-07)', () => {
    expect(() => checkStageEvent('actionable', { stage: 'actionable', reopenedFrom: 'actionable', reason: 'payer letter found' })).not.toThrow();
    expect(() => checkStageEvent('actionable', { stage: 'validated', reopenedFrom: 'actionable', reason: 'evidence missing' })).not.toThrow();
  });

  it('refuses a reopen without a reason, from another stage, before any stage, or forward', () => {
    expect(() => checkStageEvent('actionable', { stage: 'actionable', reopenedFrom: 'actionable', reason: null })).toThrow(/says why/);
    expect(() => checkStageEvent('actionable', { stage: 'actionable', reopenedFrom: 'actionable', reason: '  ' })).toThrow(/says why/);
    expect(() => checkStageEvent('validated', { stage: 'flagged', reopenedFrom: 'actionable', reason: 'x' })).toThrow(/stage the line is at/);
    expect(() => checkStageEvent(null, { stage: 'flagged', reopenedFrom: 'flagged', reason: 'x' })).toThrow(/stage the line is at/);
    expect(() => checkStageEvent('flagged', { stage: 'validated', reopenedFrom: 'flagged', reason: 'x' })).toThrow(/not a reopen/);
  });

  it('leaves payer approved and recovered to the recovery ledger (milestone 9)', () => {
    expect(() => checkStageEvent('actionable', { stage: 'payer_approved', reopenedFrom: null, reason: null })).toThrow(/recovery ledger/);
    expect(() => checkStageEvent('actionable', { stage: 'recovered', reopenedFrom: null, reason: null })).toThrow(/recovery ledger/);
  });

  it('advances a line only forward, and not at all when it is there already (property)', () => {
    fc.assert(
      fc.property(fc.option(fc.constantFrom(...triageStages), { nil: null }), fc.constantFrom(...triageStages), (current, target) => {
        const event = advanceTo(current, target);
        if (current !== null && stageRank(current) >= stageRank(target)) {
          expect(event).toBeNull();
        } else {
          expect(event).toEqual({ stage: target, reopenedFrom: null, reason: null });
          expect(() => checkStageEvent(current, event as NonNullable<typeof event>)).not.toThrow();
        }
      }),
    );
  });

  it('keeps every sequence of accepted events monotonic between reopens (property)', () => {
    const event = fc.record({ stage: fc.constantFrom(...triageStages), reopen: fc.boolean(), reason: fc.constantFrom(null, 'checked') });
    fc.assert(
      fc.property(fc.array(event, { maxLength: 20 }), (events) => {
        let current: LineStage | null = null;
        for (const item of events) {
          const candidate = { stage: item.stage, reopenedFrom: item.reopen ? current : null, reason: item.reason };
          let accepted = true;
          try {
            checkStageEvent(current, candidate);
          } catch {
            accepted = false;
          }
          if (accepted) {
            if (!item.reopen && current !== null) {
              expect(stageRank(item.stage)).toBeGreaterThan(stageRank(current));
            }
            current = item.stage;
          }
        }
      }),
    );
  });
});

describe('case states (PRD 8)', () => {
  it('is open while any line is not written off, and closed written off once every line is', () => {
    expect(deriveCaseState([])).toBe('open');
    expect(deriveCaseState([{ writtenOff: false }, { writtenOff: true }])).toBe('open');
    expect(deriveCaseState([{ writtenOff: true }, { writtenOff: true }])).toBe('closed_written_off');
  });

  it('follows the latest submission and its latest response (docs/adr/0041)', () => {
    const lines = [{ writtenOff: false, stage: 'actionable' as const }, { writtenOff: true }];
    expect(deriveCaseState(lines, { response: null, reopened: false })).toBe('submitted');
    expect(deriveCaseState(lines, { response: 'info_requested', reopened: false })).toBe('awaiting_response');
    expect(deriveCaseState(lines, { response: 'denied', reopened: true })).toBe('awaiting_response');
    expect(deriveCaseState(lines, { response: 'denied', reopened: false })).toBe('resolved');
    expect(deriveCaseState(lines, { response: 'partial', reopened: false })).toBe('partially_resolved');
    expect(deriveCaseState(lines, { response: 'accepted', reopened: false })).toBe('resolved');
    expect(deriveCaseState(lines, { response: 'reprocessed_no_change', reopened: false })).toBe('resolved');
    expect(deriveCaseState([{ writtenOff: true }], { response: null, reopened: false })).toBe('closed_written_off');
  });

  it('is resolved once every line not written off is payer approved or recovered, partially while some are', () => {
    expect(deriveCaseState([{ writtenOff: false, stage: 'payer_approved' }, { writtenOff: false, stage: 'recovered' }, { writtenOff: true }])).toBe('resolved');
    expect(deriveCaseState([{ writtenOff: false, stage: 'payer_approved' }, { writtenOff: false, stage: 'actionable' }], { response: null, reopened: false })).toBe('partially_resolved');
    expect(deriveCaseState([{ writtenOff: false, stage: null }, { writtenOff: false }])).toBe('open');
  });

  it('waits on the payer again once a line is moved back from payer approved or recovered, whatever the payer answered (docs/adr/0042)', () => {
    const reopened = [{ writtenOff: false, stage: 'actionable' as const, reopenedFromApproval: true }, { writtenOff: false, stage: 'actionable' as const }];
    expect(deriveCaseState(reopened)).toBe('awaiting_response');
    expect(deriveCaseState(reopened, { response: 'accepted', reopened: false })).toBe('awaiting_response');
    expect(deriveCaseState(reopened, { response: 'reprocessed_no_change', reopened: false })).toBe('awaiting_response');
    // Lines still approved or recovered beside it: partly resolved; a written-off reopened line counts nothing.
    expect(deriveCaseState([...reopened, { writtenOff: false, stage: 'recovered' }], { response: 'accepted', reopened: false })).toBe('partially_resolved');
    expect(deriveCaseState([{ writtenOff: true, reopenedFromApproval: true }, { writtenOff: false }], { response: 'accepted', reopened: false })).toBe('resolved');
  });
});
