import { describe, expect, it } from 'vitest';

import { type BillingStanding, type OrganizationKind, type OrganizationStatus, STANDING_ORDER, type StandingKind, standingKind } from './standing';

/**
 * One standing from the organization's record and billing (test matrix BIL-05; docs/adr/0050): every status, billing
 * standing and kind. The record wins: a suspended or closed organization never reads good. A firm's unpaid invoice
 * refuses no run before milestone 12, so billing's suspension of a firm reads past due.
 */

const STATUSES: readonly OrganizationStatus[] = ['active', 'suspended', 'closed'];
const STANDINGS: readonly BillingStanding[] = ['good', 'past_due', 'suspended'];
const KINDS: readonly OrganizationKind[] = ['group', 'firm', 'internal'];

const EXPECTED: Readonly<Record<OrganizationKind, Readonly<Record<OrganizationStatus, Readonly<Record<BillingStanding, StandingKind>>>>>> = {
  group: {
    active: { good: 'good', past_due: 'past_due', suspended: 'suspended_nonpayment' },
    suspended: { good: 'suspended_by_paidwhole', past_due: 'suspended_by_paidwhole', suspended: 'suspended_by_paidwhole' },
    closed: { good: 'closed', past_due: 'closed', suspended: 'closed' },
  },
  firm: {
    active: { good: 'good', past_due: 'past_due', suspended: 'past_due' },
    suspended: { good: 'suspended_by_paidwhole', past_due: 'suspended_by_paidwhole', suspended: 'suspended_by_paidwhole' },
    closed: { good: 'closed', past_due: 'closed', suspended: 'closed' },
  },
  internal: {
    active: { good: 'good', past_due: 'past_due', suspended: 'suspended_nonpayment' },
    suspended: { good: 'suspended_by_paidwhole', past_due: 'suspended_by_paidwhole', suspended: 'suspended_by_paidwhole' },
    closed: { good: 'closed', past_due: 'closed', suspended: 'closed' },
  },
};

describe('standingKind', () => {
  for (const kind of KINDS) {
    for (const status of STATUSES) {
      for (const standing of STANDINGS) {
        it(`reads ${kind === 'internal' ? 'an' : 'a'} ${kind} ${status} in billing standing ${standing} as ${EXPECTED[kind][status][standing]}`, () => {
          expect(standingKind(status, standing, kind)).toBe(EXPECTED[kind][status][standing]);
        });
      }
    }
  }

  it('is good only for an active record in good billing standing', () => {
    for (const kind of KINDS) {
      for (const status of STATUSES) {
        for (const standing of STANDINGS) {
          expect(standingKind(status, standing, kind) === 'good', `${kind} ${status} ${standing}`).toBe(status === 'active' && standing === 'good');
        }
      }
    }
  });

  it('orders what stops runs first, then what will, then the rest', () => {
    expect(STANDING_ORDER).toEqual(['suspended_by_paidwhole', 'suspended_nonpayment', 'past_due', 'good', 'closed']);
  });
});
