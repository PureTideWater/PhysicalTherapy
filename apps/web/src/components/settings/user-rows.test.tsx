import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import type { InvitationView, MemberView } from '../../lib/routes/settings';
import type { FormState } from '../form-issues';
import { InvitationItem, InvitationRow, MemberRow } from './user-rows';

/**
 * The users page's rows (WCAG 1.3.1, 2.4.4, 2.5.3; UX-UX-3): the email is each row's header, and every control in a row
 * keeps its visible words and adds the member's or invitee's email to its name, so one row's "Change role" is told from
 * the next row's. SYNTHETIC values.
 */

/** The state each ActionForm renders: none, unless a test sets the refusal a press returned. */
const shown = vi.hoisted(() => ({ state: undefined as FormState | undefined }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useActionState: <S,>(action: unknown, initial: S): [S, () => void, boolean] => [(shown.state as S | undefined) ?? initial, () => undefined, false],
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock('../form-keys', () => ({ FormKeys: () => <input type="hidden" name="requestKey" value="synthetic-request-key" /> }));
afterEach(() => {
  shown.state = undefined;
});

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
const ORGANIZATION = '00000000-0000-4000-8000-0000000000e1';
const member: MemberView = {
  membershipId: '00000000-0000-4000-8000-0000000000e2',
  userId: '00000000-0000-4000-8000-0000000000e3',
  email: 'biller@synthetic.test',
  role: 'billing_manager',
  status: 'active',
  mfaEnrolled: true,
  self: false,
};
const invitation: InvitationView = {
  id: '00000000-0000-4000-8000-0000000000e4',
  email: 'invitee@synthetic.test',
  role: 'viewer',
  sentAt: new Date('2026-10-20T10:00:00Z'),
  expiresAt: new Date('2026-10-27T10:00:00Z'),
  sends: 1,
  acceptedAt: null,
  expired: false,
  undeliveredAt: null,
  undeliveredReason: null,
};
const OPTIONS = [
  { value: 'billing_manager', label: 'Billing manager' },
  { value: 'viewer', label: 'Viewer' },
];

const row = (view: MemberView = member) =>
  renderToStaticMarkup(
    <table>
      <tbody>
        <MemberRow member={view} organizationId={ORGANIZATION} roleOptions={OPTIONS} changeRole={action} endMembership={action} />
      </tbody>
    </table>,
  );
const plain = (html: string) => html.replace(/<!-- -->/g, '');

describe('a member’s row on the users page', () => {
  it('heads the row with the member’s email', () => {
    expect(plain(row())).toMatch(/<th scope="row"[^>]*>biller@synthetic\.test<\/th>/);
    expect(plain(row({ ...member, self: true }))).toMatch(/<th scope="row"[^>]*>biller@synthetic\.test<span[^>]*> \(you\)<\/span><\/th>/);
  });

  it('names each control by its visible words and the member’s email', () => {
    const html = plain(row());
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Change role<span class="sr-only"> for biller@synthetic\.test<\/span><\/button>/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>End membership<span class="sr-only"> of biller@synthetic\.test<\/span><\/button>/);
    expect(html).toMatch(/<select[^>]*aria-label="Role for biller@synthetic\.test"/);
    expect(html).toContain('>Role</label>');
    expect(html).toMatch(/<label[^>]*>They lose access now\. End their membership\.<span class="sr-only"> \(biller@synthetic\.test\)<\/span><\/label>/);
  });

  it('says the button’s words once in a refusal, with the email hidden, never twice', () => {
    // A dropped connection: the lead asks for a press again, naming the button by its words.
    shown.state = { unconfirmed: true };
    const html = plain(row());
    expect(html).toContain('press “Change role<span class="sr-only"> for biller@synthetic.test</span>” again');
    expect(html).not.toMatch(/for biller@synthetic\.test<\/span> for biller/);
  });

  it('has no controls on the administrator’s own row', () => {
    expect(row({ ...member, self: true })).not.toContain('<button');
  });
});

describe('an invitation on the users page', () => {
  it('heads its table row with the email and names “Send again” with it, in the table and in the phone list', () => {
    const table = plain(
      renderToStaticMarkup(
        <table>
          <tbody>
            <InvitationRow invitation={invitation} organizationId={ORGANIZATION} resend={action} />
          </tbody>
        </table>,
      ),
    );
    expect(table).toMatch(/<th scope="row"[^>]*>invitee@synthetic\.test<\/th>/);
    expect(table).toMatch(/<button[^>]*type="submit"[^>]*>Send again<span class="sr-only"> to invitee@synthetic\.test<\/span><\/button>/);
    const item = plain(
      renderToStaticMarkup(
        <ul>
          <InvitationItem invitation={invitation} organizationId={ORGANIZATION} resend={action} />
        </ul>,
      ),
    );
    expect(item).toMatch(/<button[^>]*type="submit"[^>]*>Send again<span class="sr-only"> to invitee@synthetic\.test<\/span><\/button>/);
  });

  it('offers no “Send again” for an accepted invitation', () => {
    const html = renderToStaticMarkup(
      <ul>
        <InvitationItem invitation={{ ...invitation, acceptedAt: new Date('2026-10-21T10:00:00Z') }} organizationId={ORGANIZATION} resend={action} />
      </ul>,
    );
    expect(html).not.toContain('<button');
  });
});
