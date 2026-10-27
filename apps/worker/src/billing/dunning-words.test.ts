import { DUNNING_SCHEDULE } from '@tp/billing';
import { describe, expect, it } from 'vitest';

import { type DunningEffect, type DunningInvoice, dunningEffect, dunningMessage } from './dunning';

/**
 * BIL-10: the dunning mail never claims runs started or stopped when they did not (SS-01, docs/adr/0080; the design's
 * section 7). The words are chosen when the message is sent, from the organization's kind and status and its billing
 * standing: `runs` keeps today's words, `billing_held` says another unpaid invoice holds runs, `held` says PaidWhole's
 * suspension does, and `none` (every firm, a closed group) says nothing about runs.
 */

const EFFECTS: readonly DunningEffect[] = ['runs', 'billing_held', 'held', 'none'];
type Step = Parameters<typeof dunningMessage>[0];
const STEPS: readonly Step[] = ['payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated'];

const numbered: DunningInvoice = { id: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b10', number: 'SIM-0002', amount_remaining_cents: '250000', first_failed_at: new Date('2026-03-01T09:30:00Z') };
const unnumbered: DunningInvoice = { ...numbered, number: null };

const message = (step: Step, effect: DunningEffect, row: DunningInvoice = numbered) => dunningMessage(step, 'owner@synthetic.test', '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382710', row, 'http://localhost:3000/settings/billing/1', effect);

/** Section 7's lines and subjects, exactly, for invoice SIM-0002 ($2,500.00) whose payment failed on 2026-03-01 at 09:30 UTC. */
const WORDS: Readonly<Record<Step, Readonly<Record<DunningEffect, { readonly subject: string; readonly lines: readonly string[] }>>>> = {
  payment_failed: {
    runs: {
      subject: 'A payment failed',
      lines: ['The payment for invoice SIM-0002 ($2,500.00) failed.', 'Update the payment method or pay the invoice before 2026-03-31 at 09:30 UTC; from then new runs stop until it is paid.'],
    },
    billing_held: {
      subject: 'A payment failed',
      lines: [
        'The payment for invoice SIM-0002 ($2,500.00) failed.',
        'Update the payment method or pay the invoice from the billing page.',
        'New runs are already stopped until another unpaid invoice is paid.',
      ],
    },
    held: {
      subject: 'A payment failed',
      lines: [
        'The payment for invoice SIM-0002 ($2,500.00) failed.',
        'Update the payment method or pay the invoice from the billing page.',
        "New runs are already stopped while PaidWhole's suspension of the organization lasts.",
      ],
    },
    none: { subject: 'A payment failed', lines: ['The payment for invoice SIM-0002 ($2,500.00) failed.', 'Update the payment method or pay the invoice from the billing page.'] },
  },
  second_notice: {
    runs: { subject: 'An invoice is still unpaid', lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'New runs stop on 2026-03-31 at 09:30 UTC unless it is paid.'] },
    billing_held: {
      subject: 'An invoice is still unpaid',
      lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'Pay it, or update the payment method, from the billing page.', 'New runs are already stopped until another unpaid invoice is paid.'],
    },
    held: {
      subject: 'An invoice is still unpaid',
      lines: [
        'Invoice SIM-0002 ($2,500.00) is still unpaid.',
        'Pay it, or update the payment method, from the billing page.',
        "New runs are already stopped while PaidWhole's suspension of the organization lasts.",
      ],
    },
    none: { subject: 'An invoice is still unpaid', lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'Pay it, or update the payment method, from the billing page.'] },
  },
  third_notice: {
    runs: { subject: 'An invoice is still unpaid', lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'New runs stop on 2026-03-31 at 09:30 UTC unless it is paid.'] },
    billing_held: {
      subject: 'An invoice is still unpaid',
      lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'Pay it, or update the payment method, from the billing page.', 'New runs are already stopped until another unpaid invoice is paid.'],
    },
    held: {
      subject: 'An invoice is still unpaid',
      lines: [
        'Invoice SIM-0002 ($2,500.00) is still unpaid.',
        'Pay it, or update the payment method, from the billing page.',
        "New runs are already stopped while PaidWhole's suspension of the organization lasts.",
      ],
    },
    none: { subject: 'An invoice is still unpaid', lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'Pay it, or update the payment method, from the billing page.'] },
  },
  final_notice: {
    runs: {
      subject: 'Final notice before new runs stop',
      lines: ['Final notice: invoice SIM-0002 ($2,500.00) is unpaid.', 'New runs stop on 2026-03-31 at 09:30 UTC: pricing, monitoring, packet exports and reports. Your data stays readable.'],
    },
    billing_held: {
      subject: 'An invoice is still unpaid',
      lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'Pay it, or update the payment method, from the billing page.', 'New runs are already stopped until another unpaid invoice is paid.'],
    },
    held: {
      subject: 'An invoice is still unpaid',
      lines: [
        'Invoice SIM-0002 ($2,500.00) is still unpaid.',
        'Pay it, or update the payment method, from the billing page.',
        "New runs are already stopped while PaidWhole's suspension of the organization lasts.",
      ],
    },
    none: { subject: 'An invoice is still unpaid', lines: ['Invoice SIM-0002 ($2,500.00) is still unpaid.', 'Pay it, or update the payment method, from the billing page.'] },
  },
  suspended: {
    runs: {
      subject: 'New runs have stopped until an invoice is paid',
      lines: ['Invoice SIM-0002 ($2,500.00) has been unpaid for 30 days since its payment failed, so new runs have stopped.', 'Your data stays readable. Runs start again as soon as the invoice is paid.'],
    },
    billing_held: {
      subject: 'New runs have stopped until an invoice is paid',
      lines: ['Invoice SIM-0002 ($2,500.00) has been unpaid for 30 days since its payment failed, so new runs have stopped.', 'Your data stays readable. Runs start again as soon as the invoice is paid.'],
    },
    held: {
      subject: 'An invoice has been unpaid for 30 days',
      lines: ['Invoice SIM-0002 ($2,500.00) has been unpaid for 30 days since its payment failed.', 'New runs stay stopped until it is paid and PaidWhole reinstates the organization.'],
    },
    none: { subject: 'An invoice has been unpaid for 30 days', lines: ['Invoice SIM-0002 ($2,500.00) has been unpaid for 30 days since its payment failed.', 'Pay it from the billing page.'] },
  },
  reinstated: {
    runs: { subject: 'New runs have started again', lines: ['Invoice SIM-0002 is paid. New runs have started again.'] },
    billing_held: { subject: 'Invoice SIM-0002 is paid', lines: ['Invoice SIM-0002 is paid.', 'Another invoice is still unpaid, so new runs stay stopped until it is paid.'] },
    held: {
      subject: 'Invoice SIM-0002 is paid',
      lines: ['Invoice SIM-0002 is paid.', 'PaidWhole has also suspended the organization, so new runs stay stopped until PaidWhole reinstates it. The billing page says why and what to do next.'],
    },
    none: { subject: 'Invoice SIM-0002 is paid', lines: ['Invoice SIM-0002 is paid.'] },
  },
};

describe('the dunning notice’s words, by stage and by what holds runs (BIL-10)', () => {
  it('covers every stage the schedule and the ending send', () => {
    expect([...new Set([...DUNNING_SCHEDULE.map((step) => step.notice), 'reinstated'])].sort()).toEqual([...STEPS].sort());
  });

  for (const step of STEPS) {
    for (const effect of EFFECTS) {
      it(`${step}, ${effect}: section 7's subject and lines, exactly`, () => {
        const sent = message(step, effect);
        expect({ subject: sent.subject, lines: sent.lines }).toEqual(WORDS[step][effect]);
        // The link and the identity never depend on the words.
        expect(sent.links).toEqual(['http://localhost:3000/settings/billing/1']);
        expect(sent.identity).toEqual({ stream: 'notices', kind: 'dunning', subjectId: numbered.id, recipientUserId: '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382710' });
      });
    }
  }

  it('names an invoice without a number as an invoice, in the subject as in the lines', () => {
    expect(message('reinstated', 'held').subject).toBe('Invoice SIM-0002 is paid');
    expect(message('reinstated', 'held', unnumbered).subject).toBe('An invoice is paid');
    expect(message('reinstated', 'billing_held', unnumbered).lines).toEqual(['An invoice is paid.', 'Another invoice is still unpaid, so new runs stay stopped until it is paid.']);
    expect(message('payment_failed', 'none', unnumbered).lines[0]).toBe('The payment for an invoice ($2,500.00) failed.');
    expect(message('suspended', 'held', unnumbered).lines[0]).toBe('An invoice ($2,500.00) has been unpaid for 30 days since its payment failed.');
  });

  it('says runs started again only when nothing else holds them, and promises no runs at all where nonpayment stops none', () => {
    for (const step of STEPS) {
      for (const effect of EFFECTS) {
        const text = [message(step, effect).subject, ...message(step, effect).lines].join('\n');
        expect(text.includes('started again'), `${step}, ${effect}`).toBe(step === 'reinstated' && effect === 'runs');
        if (effect === 'none') {
          expect(text, `${step}, ${effect}`).not.toMatch(/runs?\b/i);
        }
        // Never "a platform administrator": PaidWhole by name (docs/adr/0080).
        expect(text).not.toMatch(/platform administrator/i);
        if (effect !== 'runs') {
          // A hold that does not lift with this invoice is never given a date runs stop on.
          expect(text, `${step}, ${effect}`).not.toContain('2026-03-31');
        }
      }
    }
  });
});

describe('what holds runs, decided at send time (D13)', () => {
  it('is nothing to promise for every firm and a closed group, PaidWhole’s suspension, billing’s own hold, or runs', () => {
    for (const status of ['active', 'suspended', 'closed'] as const) {
      for (const standing of ['good', 'past_due', 'suspended'] as const) {
        // A firm's nonpayment refuses nothing before milestone 12 (docs/adr/0050), whatever holds it.
        expect(dunningEffect({ kind: 'firm', status, standing })).toBe('none');
        expect(dunningEffect({ kind: 'group', status, standing })).toBe(status === 'closed' ? 'none' : status === 'suspended' ? 'held' : standing === 'suspended' ? 'billing_held' : 'runs');
      }
    }
    expect(dunningEffect({ kind: 'internal', status: 'active', standing: 'good' })).toBe('none');
  });
});
