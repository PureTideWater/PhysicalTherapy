import { SUSPENSION_REASONS } from '@tp/db/runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type HoldNotice,
  JOB_REFUSED_LABEL,
  type PracticeHold,
  RUN_STARTING_PERMISSIONS,
  type RunStartingPermission,
  grantHoldState,
  holdNotice,
  stoppedWork,
} from './suspension-words';

/**
 * The practice home's notice of a hold on new work, the job outcome label and the grant states (test matrix BIL-09;
 * docs/adr/0080; design SS-01, section 6.2, 6.3 and 6.6: H1 to H13, J1, G1 and G2): exactly, for each source, cause,
 * reason or none, date or none, viewer and the work stopped; and over every combination, what someone outside the held
 * organization may never read (D6). SYNTHETIC names; no database.
 */

const DAY = new Date('2026-10-20T15:30:00Z');
const BILLING = '/settings/billing/00000000-0000-4000-8000-0000000000f1';
const FIRM = 'SYNTHETIC FIRM';
const ALL_WORK = 'Pricing runs, triage, reports, packet exports, uploads and monitoring';
const all_work = 'pricing runs, triage, reports, packet exports, uploads and monitoring';

const H8 = { link: 'Settings, Billing', href: BILLING, text: ' shows why and what to do next.' };
const H9 = { link: null, href: null, text: "Your organization's administrator sees why and what to do next in Settings, Billing." };
const H10 = { link: null, href: null, text: "The practice's administrator sees why and what to do next in Settings, Billing." };
const H11 = { link: 'Open a support ticket', href: '/support?from=billing', text: ' if you have a question about the closure.' };

const owner = (cause: PracticeHold['cause'], fields: Partial<PracticeHold> = {}): PracticeHold => ({
  source: 'owner',
  cause,
  reason: null,
  since: null,
  stopped: [],
  name: null,
  viewer: cause === 'on_hold' ? 'other' : 'member',
  billingHref: null,
  ...fields,
});
const grantee = (cause: 'suspended' | 'closed', stopped: readonly RunStartingPermission[], fields: Partial<PracticeHold> = {}): PracticeHold => ({
  source: 'grantee',
  cause,
  reason: null,
  since: null,
  stopped,
  name: FIRM,
  viewer: 'member',
  billingHref: null,
  ...fields,
});

const REASON_CLAUSES = {
  customer_request: ", at your organization's request",
  security_hold: ', while it looks into a security concern',
  agreement_ended: ", because your organization's agreement with PaidWhole has ended",
} as const;

describe('the work a grantee’s hold stops (section 6, the work list)', () => {
  it('lists the stopped permissions in their order, in their words, with "or" before the last', () => {
    expect(RUN_STARTING_PERMISSIONS).toEqual(['mapping.edit', 'case.work', 'posting.reconcile', 'phi.export', 'file.upload']);
    expect(stoppedWork(RUN_STARTING_PERMISSIONS)).toBe('pricing runs, triage, reports, ROI statements, packet exports or uploads');
    expect(stoppedWork(['mapping.edit', 'posting.reconcile', 'phi.export'])).toBe('pricing runs, ROI statements or packet exports');
    expect(stoppedWork(['case.work'])).toBe('triage or reports');
    expect(stoppedWork(['file.upload'])).toBe('uploads');
    expect(stoppedWork(['phi.export', 'mapping.edit'])).toBe('pricing runs or packet exports');
    expect(stoppedWork([])).toBe('');
  });
});

describe('the practice home’s notice (H1 to H13)', () => {
  it('H1 and H2: the owner suspended by PaidWhole, to its members, with the reason clause and the date when one is stored', () => {
    expect(holdNotice(owner('suspended', { since: DAY, billingHref: BILLING }))).toEqual({
      source: 'owner',
      title: 'New runs have stopped',
      body: `PaidWhole suspended your organization on 2026-10-20. ${ALL_WORK} do not start here until PaidWhole reinstates your organization. Everything here stays readable.`,
      nextStep: H8,
    });
    for (const reason of SUSPENSION_REASONS) {
      expect(holdNotice(owner('suspended', { since: DAY, reason })).body).toBe(
        `PaidWhole suspended your organization on 2026-10-20${REASON_CLAUSES[reason]}. ${ALL_WORK} do not start here until PaidWhole reinstates your organization. Everything here stays readable.`,
      );
      expect(holdNotice(owner('suspended', { reason })).body).toBe(
        `PaidWhole has suspended your organization${REASON_CLAUSES[reason]}. ${ALL_WORK} do not start here until PaidWhole reinstates your organization. Everything here stays readable.`,
      );
    }
    expect(holdNotice(owner('suspended'))).toEqual({
      source: 'owner',
      title: 'New runs have stopped',
      body: `PaidWhole has suspended your organization. ${ALL_WORK} do not start here until PaidWhole reinstates your organization. Everything here stays readable.`,
      nextStep: H9,
    });
  });

  it('H3: the owner closed, to anyone, naming whose organization it is; the ticket to its members only', () => {
    expect(holdNotice(owner('closed', { since: DAY }))).toEqual({
      source: 'owner',
      title: 'No new runs start',
      body: `Your organization is closed, so ${all_work} do not start here. Everything here stays readable.`,
      nextStep: H11,
    });
    expect(holdNotice(owner('closed', { since: DAY, viewer: 'other' }))).toEqual({
      source: 'owner',
      title: 'No new runs start',
      body: `The practice's organization is closed, so ${all_work} do not start here. Everything here stays readable.`,
      nextStep: null,
    });
  });

  it('H4: the owner held for nonpayment, to its members', () => {
    expect(holdNotice(owner('nonpayment', { since: DAY, billingHref: BILLING }))).toEqual({
      source: 'owner',
      title: 'New runs have stopped',
      body: `An invoice of your organization has been unpaid for 30 days since its payment failed, so ${all_work} do not start here until it is paid. Everything here stays readable.`,
      nextStep: H8,
    });
    expect(holdNotice(owner('nonpayment')).nextStep).toEqual(H9);
  });

  it('H13: the owner on hold, to anyone outside it, with the date or without, and never why', () => {
    expect(holdNotice(owner('on_hold', { since: DAY }))).toEqual({
      source: 'owner',
      title: 'New work has stopped here',
      body: `The PaidWhole account of the practice's organization has been on hold since 2026-10-20, so ${all_work} do not start here. Everything here stays readable.`,
      nextStep: H10,
    });
    expect(holdNotice(owner('on_hold')).body).toBe(`The PaidWhole account of the practice's organization is on hold, so ${all_work} do not start here. Everything here stays readable.`);
    // A reason or a billing link given by mistake is never printed to someone outside the organization.
    expect(holdNotice(owner('on_hold', { reason: 'security_hold', billingHref: BILLING }))).toEqual(holdNotice(owner('on_hold')));
  });

  it('H5 and H6: a grantee suspended by PaidWhole, to its members, naming their organization and the work stopped through its grant', () => {
    expect(holdNotice(grantee('suspended', RUN_STARTING_PERMISSIONS, { since: DAY, reason: 'security_hold', billingHref: BILLING }))).toEqual({
      source: 'grantee',
      title: "Work through your organization's grant has stopped",
      body:
        'PaidWhole suspended SYNTHETIC FIRM on 2026-10-20, while it looks into a security concern, so you start no new pricing runs, triage, reports, ROI statements, packet exports or uploads at this practice through its grant until PaidWhole reinstates SYNTHETIC FIRM. You can still read everything here, and the practice\'s own staff carry on.',
      nextStep: H8,
    });
    expect(holdNotice(grantee('suspended', ['mapping.edit', 'posting.reconcile', 'phi.export']))).toEqual({
      source: 'grantee',
      title: "Work through your organization's grant has stopped",
      body: "PaidWhole has suspended SYNTHETIC FIRM, so you start no new pricing runs, ROI statements or packet exports at this practice through its grant until PaidWhole reinstates SYNTHETIC FIRM. You can still read everything here, and the practice's own staff carry on.",
      nextStep: H9,
    });
    for (const reason of SUSPENSION_REASONS) {
      expect(holdNotice(grantee('suspended', ['file.upload'], { reason })).body).toMatch(new RegExp(`^PaidWhole has suspended SYNTHETIC FIRM${REASON_CLAUSES[reason]}, so you start no new uploads at this practice`));
    }
  });

  it('H7: a closed grantee, to its members, with no restart promised', () => {
    expect(holdNotice(grantee('closed', ['case.work'], { since: DAY, billingHref: BILLING }))).toEqual({
      source: 'grantee',
      title: "Work through your organization's grant has stopped",
      body: 'SYNTHETIC FIRM is closed, so you start no new triage or reports at this practice through its grant.',
      nextStep: H11,
    });
  });
});

describe('the job outcome and the grant states (J1, G1, G2)', () => {
  it('words a refused job as new work having stopped for the practice’s organization', () => {
    expect(JOB_REFUSED_LABEL).toBe("Refused: new work had stopped for the practice's organization");
  });

  it('says a grant in force to a held grantee is on hold, or closed, and never why', () => {
    expect(grantHoldState('suspended', FIRM)).toBe(
      'In force. The PaidWhole account of SYNTHETIC FIRM is on hold, so its people start no new work here through this grant; your own staff carry on.',
    );
    expect(grantHoldState('closed', FIRM)).toBe('In force. SYNTHETIC FIRM is closed, so its people start no new work here through this grant.');
    expect(grantHoldState('active', FIRM)).toBeNull();
  });
});

/** Every hold Postgres can give (practice_run_hold), and some it cannot: the page must not say more for either. */
const permissions = fc.subarray([...RUN_STARTING_PERMISSIONS], { minLength: 1 });
const reason = fc.option(fc.constantFrom(...SUSPENSION_REASONS), { nil: null });
const since = fc.option(fc.date({ min: new Date('2025-01-01T00:00:00Z'), max: new Date('2027-12-31T00:00:00Z'), noInvalidDate: true }), { nil: null });
const billingHref = fc.option(fc.constant(BILLING), { nil: null });
const ownerHold: fc.Arbitrary<PracticeHold> = fc.record({
  source: fc.constant('owner' as const),
  cause: fc.constantFrom('suspended', 'nonpayment', 'on_hold', 'closed'),
  reason,
  since,
  stopped: fc.constant([]),
  name: fc.constant(null),
  viewer: fc.constantFrom('member', 'other'),
  billingHref,
});
const granteeHold: fc.Arbitrary<PracticeHold> = fc.record({
  source: fc.constant('grantee' as const),
  cause: fc.constantFrom('suspended', 'closed'),
  reason,
  since,
  stopped: permissions,
  name: fc.constantFrom(FIRM, 'SYNTHETIC SECOND FIRM'),
  viewer: fc.constant('member' as const),
  billingHref,
});
const anyHold = fc.oneof(ownerHold, granteeHold);

const words = (notice: HoldNotice): string => [notice.title, notice.body, notice.nextStep === null ? '' : `${notice.nextStep.link ?? ''}${notice.nextStep.text}`].join(' ');
/** A member of the held organization reads the cause; anyone else reads that the account is on hold, or closed. */
const member = (hold: PracticeHold): boolean => hold.viewer === 'member';

describe('the notice over every hold (BIL-09, property)', () => {
  it('says "PaidWhole has suspended" or "PaidWhole suspended" exactly when PaidWhole suspended the reader’s own organization', () => {
    fc.assert(
      fc.property(anyHold, (hold) => {
        expect(/PaidWhole (has )?suspended/.test(words(holdNotice(hold)))).toBe(hold.cause === 'suspended' && member(hold));
      }),
    );
  });

  it('never says "platform administrator", and never tells someone outside the held organization why (D6)', () => {
    fc.assert(
      fc.property(anyHold, (hold) => {
        const text = words(holdNotice(hold));
        expect(text).not.toMatch(/platform administrator/i);
        if (!member(hold)) {
          expect(text).not.toMatch(/invoice|unpaid|PaidWhole (has )?suspended|your organization/i);
          for (const clause of Object.values(REASON_CLAUSES)) {
            expect(text).not.toContain(clause);
          }
        }
      }),
    );
  });

  it('gives a grantee’s notice exactly the work stopped, through its grant', () => {
    fc.assert(
      fc.property(granteeHold, (hold) => {
        const { body } = holdNotice(hold);
        expect(body).toContain(`you start no new ${stoppedWork(hold.stopped)} at this practice through its grant`);
        for (const [permission, work] of [
          ['mapping.edit', 'pricing runs'],
          ['case.work', 'triage'],
          ['posting.reconcile', 'ROI statements'],
          ['phi.export', 'packet exports'],
          ['file.upload', 'uploads'],
        ] as const) {
          expect(body.includes(work), permission).toBe(hold.stopped.includes(permission));
        }
        expect(body).not.toContain('monitoring');
      }),
    );
  });

  it('promises no restart when closed, and otherwise names what restarts the work, or that it is on hold', () => {
    fc.assert(
      fc.property(anyHold, (hold) => {
        const text = words(holdNotice(hold));
        if (hold.cause === 'closed') {
          expect(text).not.toMatch(/until|again|reinstat|restart|on hold/i);
        } else if (member(hold)) {
          expect(text).toMatch(/until (PaidWhole reinstates|it is paid)/);
        } else {
          expect(text).toMatch(/is on hold|has been on hold since \d{4}-\d{2}-\d{2}/);
        }
      }),
    );
  });

  it('links Settings, Billing only for a member who holds the organization’s billing, and never for a closure', () => {
    fc.assert(
      fc.property(anyHold, (hold) => {
        const { nextStep } = holdNotice(hold);
        expect(nextStep?.href === BILLING).toBe(hold.cause !== 'closed' && member(hold) && hold.billingHref !== null);
      }),
    );
  });
});
