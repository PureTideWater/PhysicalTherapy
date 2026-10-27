import { REINSTATEMENT_REASONS, SUSPENSION_REASONS } from '@tp/db/runtime';
import { describe, expect, it } from 'vitest';

import {
  HISTORY_CHANGES,
  HISTORY_COLUMNS,
  HISTORY_EMPTY,
  REINSTATE_SUBMITS,
  SUSPENSION_NOTE_HINT,
  SUSPENSION_REASON_HINT,
  SUSPENSION_REASON_OPTIONS,
  grantState,
  reasonLabel,
  suspendedByPaidWhole,
  suspendedEffect,
  suspendedLines,
  suspendedNote,
  suspensionDescription,
  suspensionTick,
  suspensionTitle,
} from './suspension-text';

/** The console's suspension words, exactly (SS-01 section 6.5, C1 to C12 and O1; docs/adr/0080; test matrix BIL-08). */

const at = new Date('2026-11-02T14:05:09Z');
const later = new Date('2026-11-03T09:30:00Z');

describe('the active card (C1 to C6)', () => {
  it('says what suspending stops, per kind', () => {
    expect(suspensionTitle('active')).toBe('Suspension');
    expect(suspensionDescription('group')).toBe(
      "Suspending stops all new work at this organization's practices, whoever starts it: pricing runs, triage, reports, packet exports, uploads and monitoring. Its people also start no new work through any grant it holds at another practice. Every record stays readable. Billing's own hold for an unpaid invoice is separate.",
    );
    expect(suspensionDescription('firm')).toBe(
      "Suspending stops this firm's people from starting new work through its grants: pricing runs, triage, reports, packet exports and uploads at the practices it is granted. Work a person starts through their own practice or another firm's grant is not stopped. The practices' own staff and their monitoring carry on, and every record stays readable.",
    );
  });

  it('offers the three reasons, starting empty, with no nonpayment, and says why in the hint (D9; review findings F2, F7)', () => {
    expect(SUSPENSION_REASON_OPTIONS).toEqual([
      { value: '', label: 'Choose a reason' },
      { value: 'customer_request', label: "At the customer's request" },
      { value: 'security_hold', label: 'Security hold' },
      { value: 'agreement_ended', label: 'Agreement ended' },
    ]);
    expect(SUSPENSION_REASON_OPTIONS.slice(1).map((option) => option.value)).toEqual([...SUSPENSION_REASONS]);
    expect(SUSPENSION_REASON_HINT).toBe(
      'Nonpayment is not a reason here: billing holds an organization whose invoice has been unpaid for 30 days, and lifts the hold when it is paid. A security hold stops new work only: its people still read and download everything. To stop their access, end their memberships.',
    );
    expect(SUSPENSION_NOTE_HINT).toBe("Seen only by PaidWhole's platform administrators. No patient details. At most 500 characters.");
  });

  it('confirms with the real counts (C6, D10)', () => {
    expect(suspensionTick('group', 'SYNTHETIC GROUP', { practices: 3, grants: 0 })).toBe('Suspend SYNTHETIC GROUP: new work stops at its 3 practices for everyone; every record stays readable.');
    expect(suspensionTick('group', 'SYNTHETIC GROUP', { practices: 1, grants: 2 })).toBe(
      'Suspend SYNTHETIC GROUP: new work stops at its 1 practice for everyone, and its people start no new work through the 2 grants it holds; every record stays readable.',
    );
    expect(suspensionTick('group', 'SYNTHETIC GROUP', { practices: 0, grants: 0 })).toBe('Suspend SYNTHETIC GROUP: it has no active practice now; every record stays readable.');
    expect(suspensionTick('group', 'SYNTHETIC GROUP', { practices: 0, grants: 1 })).toBe(
      'Suspend SYNTHETIC GROUP: it has no active practice now, and its people start no new work through the 1 grant it holds; every record stays readable.',
    );
    expect(suspensionTick('firm', 'SYNTHETIC FIRM', { practices: 2, grants: 2 })).toBe(
      'Suspend SYNTHETIC FIRM: its people start no new work through its grants at the 2 practices it is granted; every record stays readable.',
    );
    expect(suspensionTick('firm', 'SYNTHETIC FIRM', { practices: 0, grants: 0 })).toBe('Suspend SYNTHETIC FIRM: it holds no grant in force now; every record stays readable.');
  });
});

describe('the suspended card (C7 to C9)', () => {
  it('names who suspended it from the suspension’s own row, and who changed the reason since (C7; review finding F6)', () => {
    expect(suspensionTitle('suspended')).toBe('Suspended');
    expect(suspendedLines({ reason: 'security_hold', since: at, suspendedBy: { email: 'first@synthetic.test', at }, reasonChangedBy: null })).toEqual([
      'Suspended by first@synthetic.test on 2026-11-02 14:05 UTC.',
      'Reason: Security hold.',
    ]);
    expect(suspendedLines({ reason: 'agreement_ended', since: at, suspendedBy: { email: 'first@synthetic.test', at }, reasonChangedBy: { email: 'second@synthetic.test', at: later } })).toEqual([
      'Suspended by first@synthetic.test on 2026-11-02 14:05 UTC.',
      'Reason: Agreement ended.',
      'Reason changed by second@synthetic.test on 2026-11-03 09:30 UTC.',
    ]);
  });

  it('says what was not recorded of a suspension the previous image wrote (D11)', () => {
    expect(suspendedLines({ reason: null, since: at, suspendedBy: null, reasonChangedBy: null })).toEqual(['Suspended on 2026-11-02 14:05 UTC; who suspended it was not recorded.', 'No reason was recorded.']);
    expect(suspendedLines({ reason: null, since: null, suspendedBy: null, reasonChangedBy: null })).toEqual(['Suspended; when and by whom were not recorded.', 'No reason was recorded.']);
  });

  it('says what the suspension stops, per kind, and offers the actions (C8, C9)', () => {
    expect(suspendedEffect('group', { practices: 2, grants: 0 })).toBe('New work is refused at its 2 practices for everyone; every record stays readable. Reinstating lifts it at once.');
    expect(suspendedEffect('group', { practices: 1, grants: 1 })).toBe(
      'New work is refused at its 1 practice for everyone, and its people start no new work through the 1 grant it holds; every record stays readable. Reinstating lifts it at once.',
    );
    expect(suspendedEffect('firm', { practices: 4, grants: 4 })).toBe(
      "Its people start no new work through its grants at the 4 practices it is granted; the practices' own staff carry on. Reinstating lifts it at once.",
    );
    expect(suspendedNote('SYNTHETIC NOTE')).toBe('Note: SYNTHETIC NOTE');
    expect(REINSTATE_SUBMITS).toEqual({ resolved: 'Reinstate: the cause is resolved', in_error: 'Reinstate: suspended in error' });
    expect(Object.keys(REINSTATE_SUBMITS)).toEqual([...REINSTATEMENT_REASONS]);
  });
});

describe('the history, the grants and the billing status (C10 to C12, O1)', () => {
  it('reads each change and reason in words', () => {
    expect(HISTORY_COLUMNS).toEqual(['When (UTC)', 'Change', 'Reason', 'By', 'Note']);
    expect(HISTORY_EMPTY).toBe('No suspension recorded.');
    expect(HISTORY_CHANGES).toEqual({ suspended: 'Suspended', reinstated: 'Reinstated', reason_changed: 'Reason changed' });
    expect(['customer_request', 'security_hold', 'agreement_ended', 'resolved', 'in_error'].map(reasonLabel)).toEqual([
      "At the customer's request",
      'Security hold',
      'Agreement ended',
      'The cause is resolved',
      'Suspended in error',
    ]);
  });

  it('says a grant in force stops its people’s work while its grantee is held (C11, C12)', () => {
    const endsAt = new Date('2026-12-01T00:00:00Z');
    expect(grantState({ revokedAt: null, endsAt, granteeStatus: 'active' }, at)).toBe('in force');
    expect(grantState({ revokedAt: null, endsAt, granteeStatus: 'suspended' }, at)).toBe('in force; its people start no new work through it while their organization is suspended');
    expect(grantState({ revokedAt: null, endsAt, granteeStatus: 'closed' }, at)).toBe('in force; its people start no new work through it, since their organization is closed');
    expect(grantState({ revokedAt: null, endsAt: at, granteeStatus: 'suspended' }, later)).toBe('expired');
    expect(grantState({ revokedAt: later, endsAt, granteeStatus: 'suspended' }, later)).toBe('revoked 2026-11-03');
  });

  it('adds PaidWhole’s reason to the Standing cell when one is stored (O1)', () => {
    expect(suspendedByPaidWhole('customer_request')).toBe("Suspended by PaidWhole: At the customer's request");
    expect(suspendedByPaidWhole(null)).toBe('Suspended by PaidWhole');
  });
});
