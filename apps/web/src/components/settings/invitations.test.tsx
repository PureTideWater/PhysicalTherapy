import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { InvitationView } from '../../lib/routes/settings';
import { InvitationStateText } from './invitations';

/**
 * The users page's word on each invitation (docs/adr/0065, D10; the review of 2026-10-27): an email held back by SES's
 * suppression list, or reported as spam, names its way out, PaidWhole's support, and never "invite again", which SES
 * would hold back too; dates stay on one line. SYNTHETIC values.
 */
const invitation = (fields: Partial<InvitationView>): InvitationView => ({
  id: '00000000-0000-4000-8000-0000000000d1',
  email: 'invitee@synthetic.test',
  role: 'viewer',
  sentAt: new Date('2026-10-20T10:00:00Z'),
  expiresAt: new Date('2026-10-27T10:00:00Z'),
  sends: 1,
  acceptedAt: null,
  expired: false,
  undeliveredAt: null,
  undeliveredReason: null,
  ...fields,
});
const text = (view: InvitationView) => renderToStaticMarkup(<InvitationStateText invitation={view} />).replace(/<[^>]+>/g, '');

describe('an invitation’s state on the users page', () => {
  it('words each reason its email was not delivered, with the step that can work', () => {
    const at = new Date('2026-10-20T10:00:05Z');
    expect(text(invitation({ undeliveredAt: at, undeliveredReason: 'complained' }))).toBe(
      'Reported as spam: ask the person to find this invitation in their spam folder before 2026-10-27. If they cannot, ask PaidWhole support to release their address and send it again; until then another one will not reach them.',
    );
    expect(text(invitation({ undeliveredAt: at, undeliveredReason: 'complained', expired: true }))).toBe(
      'Reported as spam, and expired: ask PaidWhole support to release their address and send it again.',
    );
    expect(text(invitation({ undeliveredAt: at, undeliveredReason: 'suppressed' }))).toBe(
      'Not delivered 2026-10-20: our mail service is holding this address back after an earlier bounce or spam report. If the address is right, ask PaidWhole support to release it and send it again.',
    );
    expect(text(invitation({ undeliveredAt: at, undeliveredReason: 'undelivered' }))).toBe('Not delivered 2026-10-20: check the address, then invite again');
    expect(text(invitation({}))).toBe('open until 2026-10-27');
    expect(text(invitation({ expired: true }))).toBe('expired');
    expect(text(invitation({ acceptedAt: at }))).toBe('accepted 2026-10-20');
  });

  it('keeps each date on one line', () => {
    const markup = renderToStaticMarkup(<InvitationStateText invitation={invitation({ undeliveredAt: new Date('2026-10-20T10:00:05Z'), undeliveredReason: 'suppressed' })} />);
    expect(markup).toContain('<span class="whitespace-nowrap">2026-10-20</span>');
  });
});
