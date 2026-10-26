import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type AccountStanding, type NextStep, accountStanding } from '../../lib/routes/billing';
import { AccountStandingSummary } from './account-standing';

/**
 * The organization's one standing on its billing page (test matrix BIL-05; docs/adr/0050; the UX baseline review's
 * UX-004): accountStanding's words for each of a group's nine record status and billing standing pairs, a firm's rows,
 * a closed organization's, the billing hold beside a suspension by PaidWhole and the invoice holding it, and the
 * badge and the alert drawn from them. A suspended or closed organization never reads "In good standing". SYNTHETIC
 * values; no database.
 */

const INVOICE = { id: '00000000-0000-4000-8000-0000000000c1', number: 'SIM-0002', amountRemainingCents: '250000' } as const;
/** A payment that failed nine days before the dates below: past due, with runs stopping at 2026-11-09 15:00 UTC. */
const PAST_DUE = { standing: 'past_due', pastDueSince: new Date('2026-10-10T15:00:00Z'), suspendedSince: null, holdingInvoice: INVOICE, holdingCount: 0 } as const;
/** A payment that failed more than 30 days ago: billing suspended the organization on 2026-10-01. */
const SUSPENDED = { standing: 'suspended', pastDueSince: new Date('2026-09-01T15:00:00Z'), suspendedSince: new Date('2026-10-01T15:00:00Z'), holdingInvoice: INVOICE, holdingCount: 1 } as const;
const GOOD = { standing: 'good', pastDueSince: null, suspendedSince: null, holdingInvoice: null, holdingCount: 0 } as const;
const BILLING = { good: GOOD, past_due: PAST_DUE, suspended: SUSPENDED } as const;

const TICKET = '/support?from=billing';
const PAID_WHOLE =
  'PaidWhole has suspended the organization: new runs have stopped until PaidWhole reinstates it, and its data stays readable. Paying an invoice does not reinstate it.';
const FORMS_NOTE = 'Changing the plan or payment method does not reinstate an organization suspended by PaidWhole.';
const CLOSED = 'Its data stays readable, and no new run starts.';
const PLAN_REFUSAL = 'A closed organization takes no new plan.';
const ACH = ' below. A card payment restarts runs at once; a bank (ACH) payment restarts them once the bank settles it, usually within a few days.';
const SETTLES = 'a bank (ACH) payment counts once the bank settles it, usually within a few days';
const WHY = ' to find out why and what reinstates it.';
const CLOSURE = ' if you have a question about the closure.';

const ticket = (detail: string): NextStep => ({ action: 'Open a support ticket', href: TICKET, detail });
const pay = (detail: string): NextStep => ({ action: 'Pay SIM-0002', href: `#pay-${INVOICE.id}`, detail });

function standingOf(kind: 'group' | 'firm', status: 'active' | 'suspended' | 'closed', standing: keyof typeof BILLING): AccountStanding {
  return accountStanding({ kind, status, ...BILLING[standing] });
}

/** What every non-good standing carries: a notice and a next step. */
function expectExplained(standing: AccountStanding): void {
  expect(standing.notice).not.toBeNull();
  expect(standing.nextSteps.length).toBeGreaterThan(0);
}

describe('accountStanding, a group (BIL-05)', () => {
  it('reads good only for an active record in good billing standing', () => {
    expect(standingOf('group', 'active', 'good')).toEqual({
      kind: 'good',
      label: 'In good standing',
      tone: 'neutral',
      title: null,
      notice: null,
      alert: false,
      nextSteps: [],
      billingHold: null,
      formsNote: null,
      planRefusal: null,
    });
    for (const status of ['active', 'suspended', 'closed'] as const) {
      for (const standing of ['good', 'past_due', 'suspended'] as const) {
        const read = standingOf('group', status, standing);
        expect(read.kind === 'good', `${status} ${standing}`).toBe(status === 'active' && standing === 'good');
        expect(read.label === 'In good standing', `${status} ${standing}`).toBe(status === 'active' && standing === 'good');
        if (read.kind !== 'good') {
          // Closed is a system state: neutral unless an invoice is still owed.
          expect(read.tone, `${status} ${standing}`).toBe(status === 'closed' && standing === 'good' ? 'neutral' : 'danger');
          expectExplained(read);
        }
      }
    }
  });

  it('names the date runs stop when past due, and asks for a payment method or the holding invoice paid', () => {
    const read = standingOf('group', 'active', 'past_due');
    expect(read).toMatchObject({ kind: 'past_due', label: 'Past due since 2026-10-10', title: 'A payment failed', alert: false, billingHold: null, formsNote: null, planRefusal: null });
    expect(read.notice).toBe(`New runs stop at 2026-11-09 15:00 UTC, 30 days after the failed payment, until the invoice is paid; ${SETTLES}. Your data stays readable.`);
    expect(read.nextSteps).toEqual([{ action: 'Update the payment method', href: null, detail: ' above.' }, pay(' below.')]);
  });

  it('dates a suspension for nonpayment from billing, names the holding invoice, and says a bank (ACH) payment restarts runs only once it settles', () => {
    const read = standingOf('group', 'active', 'suspended');
    expect(read).toMatchObject({ kind: 'suspended_nonpayment', label: 'Suspended for nonpayment since 2026-10-01', title: 'New runs have stopped', alert: true, billingHold: null, formsNote: null });
    expect(read.notice).toBe('New runs have stopped because an invoice has been unpaid for 30 days since its payment failed; your data stays readable.');
    expect(read.nextSteps).toEqual([pay(ACH), ticket(' if you have a question about the invoice.')]);
  });

  it('with several invoices unpaid for 30 days, asks for all of them paid and restarts runs only then', () => {
    const read = accountStanding({ kind: 'group', status: 'active', ...SUSPENDED, holdingCount: 2 });
    expect(read.notice).toBe('New runs have stopped because 2 invoices have been unpaid for 30 days since their payments failed; your data stays readable.');
    expect(read.nextSteps[0]).toEqual(
      pay(' and the other invoice unpaid for 30 days below. Runs restart once all of them are paid: at once by card, or once the bank settles a bank (ACH) payment, usually within a few days.'),
    );
    expect(accountStanding({ kind: 'group', status: 'active', ...SUSPENDED, holdingCount: 3 }).nextSteps[0]?.detail).toMatch(/^ and the other 2 invoices unpaid for 30 days below\. /);
    expect(accountStanding({ kind: 'group', status: 'suspended', ...SUSPENDED, holdingCount: 2 }).notice).toBe(
      `${PAID_WHOLE} 2 invoices are also unpaid 30 days after their payments failed, the oldest since 2026-09-01; new runs stay stopped until all of them are paid as well.`,
    );
  });

  it('reads "Suspended by PaidWhole" whatever billing says, with no date, the ticket as the next step and the note that payment does not reinstate it', () => {
    const read = standingOf('group', 'suspended', 'good');
    expect(read).toEqual({
      kind: 'suspended_by_paidwhole',
      label: 'Suspended by PaidWhole',
      tone: 'danger',
      title: 'New runs have stopped',
      notice: PAID_WHOLE,
      alert: true,
      nextSteps: [ticket(WHY)],
      billingHold: null,
      formsNote: FORMS_NOTE,
      planRefusal: null,
    });
    for (const standing of ['past_due', 'suspended'] as const) {
      expect(standingOf('group', 'suspended', standing)).toMatchObject({ kind: 'suspended_by_paidwhole', label: 'Suspended by PaidWhole', formsNote: FORMS_NOTE, alert: true });
    }
  });

  it('adds billing’s own hold to a suspension by PaidWhole: the unpaid invoice, what it keeps stopped, and paying it as a second step', () => {
    const pastDue = standingOf('group', 'suspended', 'past_due');
    // Billing's view is live: lifting the suspension before the stop restarts runs, so the words say only what happens at the stop.
    expect(pastDue.notice).toBe(
      `${PAID_WHOLE} An invoice is also unpaid since 2026-10-10; if it is still unpaid at 2026-11-09 15:00 UTC, new runs stop then, even if PaidWhole has reinstated the organization; ${SETTLES}.`,
    );
    expect(pastDue.billingHold).toEqual({ kind: 'past_due', since: PAST_DUE.pastDueSince, invoice: INVOICE });
    expect(pastDue.nextSteps).toEqual([ticket(WHY), pay(' below.')]);

    const suspended = standingOf('group', 'suspended', 'suspended');
    expect(suspended.notice).toBe(`${PAID_WHOLE} An invoice is also unpaid since 2026-09-01; new runs stay stopped until it is paid as well.`);
    expect(suspended.billingHold).toEqual({ kind: 'suspended_nonpayment', since: SUSPENDED.pastDueSince, invoice: INVOICE });
    // Paying restarts nothing while PaidWhole's suspension lasts, so the step makes no promise about runs.
    expect(suspended.nextSteps).toEqual([ticket(WHY), pay(' below.')]);
  });

  it('reads a closed organization "Closed" whatever billing says, in the neutral tone with nothing owed: no reopening promised, no new plan, no suspension note', () => {
    const read = standingOf('group', 'closed', 'good');
    expect(read).toEqual({
      kind: 'closed',
      label: 'Closed',
      tone: 'neutral',
      title: 'The organization is closed',
      notice: CLOSED,
      alert: false,
      nextSteps: [ticket(CLOSURE)],
      billingHold: null,
      formsNote: null,
      planRefusal: PLAN_REFUSAL,
    });
    // An invoice still owed: named as owed, with no clause about runs (nothing restarts them), in an alert.
    for (const [standing, since, hold] of [
      ['past_due', '2026-10-10', 'past_due'],
      ['suspended', '2026-09-01', 'suspended_nonpayment'],
    ] as const) {
      expect(standingOf('group', 'closed', standing)).toMatchObject({
        kind: 'closed',
        label: 'Closed',
        tone: 'danger',
        alert: true,
        notice: `${CLOSED} An invoice is also unpaid since ${since}; it is still owed.`,
        nextSteps: [ticket(CLOSURE), pay(' below.')],
        billingHold: { kind: hold },
        formsNote: null,
        planRefusal: PLAN_REFUSAL,
      });
    }
    for (const kind of ['group', 'firm'] as const) {
      for (const standing of ['good', 'past_due', 'suspended'] as const) {
        const read = standingOf(kind, 'closed', standing);
        const words = [read.title, read.notice, read.planRefusal, ...read.nextSteps.map((step) => step.action + step.detail)].join(' ');
        expect(words, `${kind} ${standing}`).not.toMatch(/reopen/i);
      }
    }
  });

  it('asks for the open invoice paid when no invoice holds the standing in view', () => {
    const read = accountStanding({ kind: 'group', status: 'active', ...SUSPENDED, holdingInvoice: null });
    expect(read.nextSteps[0]).toEqual({ action: 'Pay the open invoice', href: null, detail: ACH });
    expect(accountStanding({ kind: 'group', status: 'active', ...PAST_DUE, holdingInvoice: { ...INVOICE, number: null } }).nextSteps[1]).toEqual({
      action: 'Pay the open invoice',
      href: `#pay-${INVOICE.id}`,
      detail: ' below.',
    });
  });
});

describe('accountStanding, a firm (BIL-05)', () => {
  // A firm's suspension refuses no run before milestone 12 (practice_run_refusal reads a practice's owning group only;
  // docs/adr/0050), so nothing here says runs have stopped or will.
  it('says PaidWhole suspended the firm and how to find out why, and nothing about runs', () => {
    const read = standingOf('firm', 'suspended', 'good');
    expect(read).toMatchObject({ kind: 'suspended_by_paidwhole', label: 'Suspended by PaidWhole', title: 'The organization is suspended', notice: 'PaidWhole has suspended the organization.', formsNote: FORMS_NOTE });
    expect(read.nextSteps).toEqual([ticket(' to find out why.')]);
    expect(standingOf('firm', 'suspended', 'suspended')).toMatchObject({
      notice: 'PaidWhole has suspended the organization. An invoice is also unpaid since 2026-09-01.',
      nextSteps: [ticket(' to find out why.'), pay(' below.')],
      billingHold: { kind: 'past_due', since: SUSPENDED.pastDueSince },
    });
  });

  it('reads a firm’s unpaid invoice as past due, however long unpaid, with no stop date', () => {
    for (const standing of ['past_due', 'suspended'] as const) {
      const read = standingOf('firm', 'active', standing);
      const since = standing === 'past_due' ? '2026-10-10' : '2026-09-01';
      expect(read).toMatchObject({ kind: 'past_due', label: `Past due since ${since}`, title: 'A payment failed', alert: false });
      expect(read.notice).toBe(`An invoice is unpaid since its payment failed on ${since}.`);
      expect(read.nextSteps).toEqual([{ action: 'Update the payment method', href: null, detail: ' above.' }, pay(' below.')]);
    }
    expect(standingOf('firm', 'active', 'good').kind).toBe('good');
  });

  it('reads a closed firm "Closed" with no claim about runs', () => {
    expect(standingOf('firm', 'closed', 'good')).toMatchObject({ kind: 'closed', label: 'Closed', notice: 'Its data stays readable.', planRefusal: PLAN_REFUSAL });
    expect(standingOf('firm', 'closed', 'suspended').notice).toBe('Its data stays readable. An invoice is also unpaid since 2026-09-01; it is still owed.');
  });

  it('never says runs have stopped or will stop for a firm', () => {
    for (const status of ['active', 'suspended', 'closed'] as const) {
      for (const standing of ['good', 'past_due', 'suspended'] as const) {
        const read = standingOf('firm', status, standing);
        const words = [read.title, read.notice, ...read.nextSteps.map((step) => step.action + step.detail)].join(' ');
        expect(words, `${status} ${standing}`).not.toMatch(/\bruns?\b/);
      }
    }
  });
});

describe('the standing on the billing page (BIL-05)', () => {
  const markup = (standing: AccountStanding) => renderToStaticMarkup(<AccountStandingSummary standing={standing} />);

  it('draws a suspension by PaidWhole as its label, an alert with the notice and the ticket’s link, and one data-standing', () => {
    const html = markup(standingOf('group', 'suspended', 'good'));
    expect(html.match(/data-standing="/g)).toHaveLength(1);
    expect(html).toContain('data-standing="suspended_by_paidwhole"');
    expect(html).toContain('Suspended by PaidWhole');
    expect(html).not.toContain('In good standing');
    expect(html).toContain('role="alert"');
    expect(html).toContain(PAID_WHOLE);
    expect(html).toContain(`<a class="underline" href="${TICKET}">Open a support ticket</a> to find out why and what reinstates it.`);
  });

  it('prints one date, the label’s, for a suspension for nonpayment, and links the Pay form of the holding invoice', () => {
    const html = markup(standingOf('group', 'active', 'suspended'));
    expect(html.match(/\d{4}-\d{2}-\d{2}/g)).toEqual(['2026-10-01']);
    expect(html).toContain('Suspended for nonpayment since 2026-10-01');
    expect(html).toContain(`<a class="underline" href="#pay-${INVOICE.id}">Pay SIM-0002</a>`);
    expect(html).toContain('a bank (ACH) payment restarts them once the bank settles it');
  });

  it('draws a past-due standing as a status, not an alert, and good standing with no notice', () => {
    const pastDue = markup(standingOf('group', 'active', 'past_due'));
    expect(pastDue).toContain('role="status"');
    expect(pastDue).not.toContain('role="alert"');
    expect(pastDue).toContain('Update the payment method above.');
    const good = markup(standingOf('group', 'active', 'good'));
    expect(good).toContain('data-standing="good"');
    expect(good).toContain('In good standing');
    expect(good).not.toContain('data-slot="alert"');
  });

  it('draws a closed organization with nothing owed as an outlined badge and a status, and with an invoice owed as an alert', () => {
    const closed = markup(standingOf('group', 'closed', 'good'));
    expect(closed).toContain('role="status"');
    expect(closed).not.toContain('role="alert"');
    expect(closed).toContain(`<a class="underline" href="${TICKET}">Open a support ticket</a> if you have a question about the closure.`);
    const owed = markup(standingOf('group', 'closed', 'suspended'));
    expect(owed).toContain('role="alert"');
    expect(owed).toContain(`<a class="underline" href="#pay-${INVOICE.id}">Pay SIM-0002</a>`);
  });
});
