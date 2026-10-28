import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { NotificationView } from '../../lib/monitoring/queries';
import { NotificationText } from './display';

/**
 * How an undelivered support-access notice reads in the practice's notifications (audit #76; docs/adr/0065, D10; test
 * matrix SEC-19): the in-app fallback for a break-glass notice that did not reach every administrator, linked to the
 * grant, with no count, total or address. SYNTHETIC identifiers.
 */

const PRACTICE = '00000000-0000-4000-8000-000000000001';
const GRANT = '00000000-0000-4000-8000-000000000002';

function undelivered(notice: 'support_grant_opened' | 'support_grant_closed'): NotificationView {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    kind: 'support_notice_undelivered',
    subjectId: '00000000-0000-4000-8000-000000000004',
    counts: {},
    totals: {},
    createdAt: '2026-11-07T09:00:00.000Z',
    readAt: null,
    periodFrom: null,
    periodTo: null,
    period: null,
    caseId: null,
    supportGrantId: GRANT,
    notice,
  };
}

describe('an undelivered support-access notice', () => {
  it('says which notice did not reach every administrator, links to its grant and asks for the addresses to be checked, and support to release a right one', () => {
    const opening = renderToStaticMarkup(<NotificationText practiceId={PRACTICE} notification={undelivered('support_grant_opened')} />);
    expect(opening).toContain('A support-access opening notice did not reach every administrator');
    expect(opening).toContain(`href="/p/${PRACTICE}/support-access/${GRANT}"`);
    expect(opening).toContain('Check your administrators&#x27; email addresses; if an address is right, ask PaidWhole support to release it.');
    const closing = renderToStaticMarkup(<NotificationText practiceId={PRACTICE} notification={undelivered('support_grant_closed')} />);
    expect(closing).toContain('A support-access closing notice did not reach every administrator');
    // No figure and no address: the grant's page says how many it reached.
    expect(opening).not.toMatch(/\$|@/);
  });
});
