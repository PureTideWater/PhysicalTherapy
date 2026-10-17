import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DUNNING_SCHEDULE, SUSPENSION_DAYS, nextDunningStep, noticeDue, suspendsAt, suspensionAt } from './dunning';

const failed = new Date('2026-03-02T15:00:00Z');
const day = (n: number, extraMs = 0) => new Date(failed.getTime() + n * 86_400_000 + extraMs);

describe('the dunning schedule', () => {
  it('suspends 30 days after the first failed payment, to the millisecond', () => {
    expect(SUSPENSION_DAYS).toBe(30);
    expect(suspensionAt(failed).toISOString()).toBe('2026-04-01T15:00:00.000Z');
    expect(suspendsAt(failed, day(30, -1))).toBe(false);
    expect(suspendsAt(failed, day(30))).toBe(true);
  });

  it('names the notice due on each day of the schedule', () => {
    expect(DUNNING_SCHEDULE.map((step) => [step.notice, step.day])).toEqual([
      ['payment_failed', 0],
      ['second_notice', 7],
      ['third_notice', 14],
      ['final_notice', 23],
      ['suspended', 30],
    ]);
    expect(noticeDue(failed, day(0))).toBe('payment_failed');
    expect(noticeDue(failed, day(6))).toBe('payment_failed');
    expect(noticeDue(failed, day(7))).toBe('second_notice');
    expect(noticeDue(failed, day(14))).toBe('third_notice');
    expect(noticeDue(failed, day(23))).toBe('final_notice');
    expect(noticeDue(failed, day(29, 86_399_999))).toBe('final_notice');
    expect(noticeDue(failed, day(30))).toBe('suspended');
    expect(noticeDue(failed, day(400))).toBe('suspended');
  });

  it('sends each notice once, the latest due, and never a missed one late', () => {
    const unpaid = { unpaid: true, paid: false, firstFailedAt: failed };
    expect(nextDunningStep({ ...unpaid, stage: null }, day(0))).toBe('payment_failed');
    expect(nextDunningStep({ ...unpaid, stage: 'payment_failed' }, day(3))).toBeNull();
    expect(nextDunningStep({ ...unpaid, stage: 'payment_failed' }, day(7))).toBe('second_notice');
    // The job did not run between day 7 and day 15: the third notice, not the second.
    expect(nextDunningStep({ ...unpaid, stage: 'payment_failed' }, day(15))).toBe('third_notice');
    expect(nextDunningStep({ ...unpaid, stage: 'final_notice' }, day(30))).toBe('suspended');
    expect(nextDunningStep({ ...unpaid, stage: 'suspended' }, day(45))).toBeNull();
  });

  it('ends with reinstated after a suspension and resolved before one, once', () => {
    const paid = { unpaid: false, paid: true, firstFailedAt: failed };
    expect(nextDunningStep({ ...paid, stage: 'suspended' }, day(31))).toBe('reinstated');
    expect(nextDunningStep({ ...paid, stage: 'second_notice', paidAt: day(8) }, day(9))).toBe('resolved');
    expect(nextDunningStep({ ...paid, stage: 'reinstated' }, day(32))).toBeNull();
    expect(nextDunningStep({ ...paid, stage: 'resolved' }, day(32))).toBeNull();
    // Paid before any notice went out: nothing to say.
    expect(nextDunningStep({ ...paid, stage: null }, day(1))).toBeNull();
    expect(nextDunningStep({ ...paid, stage: null, paidAt: day(29, 86_399_999) }, day(31))).toBeNull();
  });

  it('decides reinstated from when it was paid, not from the last notice recorded', () => {
    const paid = { unpaid: false, paid: true, firstFailedAt: failed };
    // Suspended at 15:00 on day 30 and paid before the next daily job: the last notice was the final one,
    // but runs were refused, so the organization hears that they started again.
    expect(nextDunningStep({ ...paid, stage: 'final_notice', paidAt: day(30, 3_600_000) }, day(30, 7_200_000))).toBe('reinstated');
    expect(nextDunningStep({ ...paid, stage: 'final_notice', paidAt: day(30) }, day(31))).toBe('reinstated');
    expect(nextDunningStep({ ...paid, stage: 'final_notice', paidAt: day(30, -1) }, day(31))).toBe('resolved');
    // No notice had gone out at all, but the suspension had taken effect.
    expect(nextDunningStep({ ...paid, stage: null, paidAt: day(40) }, day(41))).toBe('reinstated');
  });

  it('says nothing for an invoice whose payment never failed, a voided one, or one already ended', () => {
    expect(nextDunningStep({ unpaid: true, paid: false, firstFailedAt: null, stage: null }, day(40))).toBeNull();
    expect(nextDunningStep({ unpaid: false, paid: false, firstFailedAt: failed, stage: 'second_notice' }, day(40))).toBeNull();
    expect(nextDunningStep({ unpaid: true, paid: false, firstFailedAt: failed, stage: 'resolved' }, day(40))).toBeNull();
    expect(nextDunningStep({ unpaid: true, paid: false, firstFailedAt: failed, stage: 'reinstated' }, day(40))).toBeNull();
  });

  it('never goes back: the notices for an unpaid invoice only move forward with time (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 60 * 24 }), { minLength: 1, maxLength: 30 }), (hours) => {
        let stage: ReturnType<typeof nextDunningStep> = null;
        const sent: string[] = [];
        for (const hour of [...hours].sort((a, b) => a - b)) {
          const next = nextDunningStep({ unpaid: true, paid: false, firstFailedAt: failed, stage }, new Date(failed.getTime() + hour * 3_600_000));
          if (next !== null) {
            sent.push(next);
            stage = next;
          }
        }
        const order = DUNNING_SCHEDULE.map((step) => step.notice as string);
        expect(sent.map((notice) => order.indexOf(notice))).toEqual([...new Set(sent.map((notice) => order.indexOf(notice)))].sort((a, b) => a - b));
        // The suspension notice goes out exactly when the suspension takes effect, never before.
        const last = Math.max(...hours);
        expect(sent.includes('suspended')).toBe(suspendsAt(failed, new Date(failed.getTime() + last * 3_600_000)));
      }),
    );
  });
});
