import type { InvitationView } from '../../lib/routes/settings';
import { utcDate } from '../format';

/** A date kept on one line. */
function Day({ date }: { readonly date: Date }) {
  return <span className="whitespace-nowrap">{utcDate(date)}</span>;
}

/**
 * Where an invitation stands. An email reported undelivered (docs/adr/0065, D10): one that bounced or was rejected, the
 * administrator checks the address and invites again; one reported as spam reached the person, who is asked to find it,
 * and one SES held back with the account's suppression list (an earlier bounce or spam report) is not sent again from
 * here, since SES would hold another back too and a resend voids the temporary password of the one the person may still
 * find: PaidWhole's support releases the address and sends it again (docs/runbooks/deliverability.md, 3.4; the review of
 * 2026-10-27).
 */
export function InvitationStateText({ invitation }: { readonly invitation: InvitationView }) {
  if (invitation.acceptedAt !== null) {
    return (
      <span>
        accepted <Day date={invitation.acceptedAt} />
      </span>
    );
  }
  if (invitation.undeliveredAt !== null) {
    if (invitation.undeliveredReason === 'complained') {
      return invitation.expired ? (
        <span data-undelivered="complained">Reported as spam, and expired: ask PaidWhole support to release their address and send it again.</span>
      ) : (
        <span data-undelivered="complained">
          Reported as spam: ask the person to find this invitation in their spam folder before <Day date={invitation.expiresAt} />. If they cannot, ask PaidWhole support to release their
          address and send it again; until then another one will not reach them.
        </span>
      );
    }
    if (invitation.undeliveredReason === 'suppressed') {
      return (
        <span data-undelivered="suppressed">
          Not delivered <Day date={invitation.undeliveredAt} />: our mail service is holding this address back after an earlier bounce or spam report. If the address is right, ask PaidWhole
          support to release it and send it again.
        </span>
      );
    }
    return (
      <span data-undelivered="undelivered">
        Not delivered <Day date={invitation.undeliveredAt} />: check the address, then invite again
      </span>
    );
  }
  return invitation.expired ? (
    <span>expired</span>
  ) : (
    <span>
      open until <Day date={invitation.expiresAt} />
    </span>
  );
}
