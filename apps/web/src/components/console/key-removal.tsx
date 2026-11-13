import { Badge } from '@tp/ui';

import { cancelKeyRemovalAction, confirmKeyRemovalAction, requestKeyRemovalAction } from '../../app/console/actions';
import type { MemberSummary } from '../../lib/routes/console';
import { ActionForm } from '../action-form';
import { FormKeys } from '../form-keys';
import { utc } from '../format';
import { KeyGroup, KeyStateText, OpenRegistration } from './open-registration';

/**
 * A member's hardware keys in the internal console (docs/adr/0095): what stands for the account (a removal requested,
 * its keys removed, registration open) and what this administrator may do next. Two platform administrators remove an
 * account's keys, never the account itself; the database decides again, whatever this shows.
 *
 * A pending request is a state, so its badge is neutral; removed keys close the account, so theirs is danger, as
 * "locked" is. Every button names its account after its visible words, in a span only a screen reader meets, so a list
 * of the page's buttons tells the rows apart (WCAG 2.4.6). After a request, a cancellation or a confirmation the focus
 * lands on the row's new state (KeyGroup notes the press, KeyStateText takes the focus: no new input and nothing in the
 * URL); a Confirm or Cancel that another person's decision overtook reads the page again (`refreshOnError`) and the
 * focus lands there the same way.
 */
export function KeyRemovalState({ member, now }: { readonly member: MemberSummary; readonly now: Date }) {
  const removal = member.keyRemoval;
  if (removal === null) {
    return null;
  }
  if (removal.state === 'requested') {
    return <Badge variant="outline">key removal requested</Badge>;
  }
  if (removal.registrationClosed) {
    return removal.registrationOpenUntil !== null && removal.registrationOpenUntil > now ? <Badge variant="outline">registration open</Badge> : <Badge variant="destructive">keys removed</Badge>;
  }
  return null;
}

/** The account a row's button acts on, after its visible words: heard, not seen. */
function Account({ word = 'for', email }: { readonly word?: string; readonly email: string }) {
  return (
    <span className="sr-only">
      {' '}
      {word} {email}
    </span>
  );
}

export function KeyRemovalActions({ member, organizationId, now }: { readonly member: MemberSummary; readonly organizationId: string; readonly now: Date }) {
  const removal = member.keyRemoval;
  if (member.self) {
    // No one acts on the keys of their own account, and the page does not offer it.
    return removal?.state === 'requested' ? (
      <p className="max-w-xs text-sm text-muted-foreground">
        Another platform administrator asked to remove your hardware keys at {utc(removal.requestedAt)}. A second administrator confirms or cancels it; no one acts on the keys of their own account.
      </p>
    ) : null;
  }
  if (removal?.state === 'requested') {
    // A Confirm or Cancel another person's decision overtook reads the page again; the row's new state then takes the focus.
    const overtaken = `key-removal-${removal.removalId}`;
    return (
      <KeyGroup account={member.userId} email={member.email}>
        <KeyStateText key="requested" account={member.userId} state="requested" className="text-sm">
          {removal.mine ? 'You' : removal.requestedByEmail} asked to remove this account’s hardware keys at {utc(removal.requestedAt)}. The request ends at {utc(removal.expiresAt)}.
        </KeyStateText>
        {removal.mine ? (
          <p className="text-sm text-muted-foreground">Another platform administrator confirms it. You cannot confirm your own request.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Confirming removes every hardware key of {member.email} and ends their sessions at once. They cannot sign in until an administrator opens registration and they register a new key; the removed keys cannot be restored.
            </p>
            <ActionForm
              action={confirmKeyRemovalAction}
              submit={
                <>
                  Confirm key removal
                  <Account email={member.email} />
                </>
              }
              variant="destructive"
              className="flex flex-col gap-1"
              refreshOnError={overtaken}
            >
              <FormKeys />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="removalId" value={removal.removalId} />
            </ActionForm>
          </>
        )}
        <ActionForm
          action={cancelKeyRemovalAction}
          submit={
            <>
              Cancel removal request
              <Account email={member.email} />
            </>
          }
          variant="outline"
          className="flex flex-col gap-1"
          refreshOnError={overtaken}
        >
          <FormKeys />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="removalId" value={removal.removalId} />
        </ActionForm>
      </KeyGroup>
    );
  }
  if (removal?.state === 'confirmed' && removal.registrationClosed) {
    if (removal.registrationOpenUntil !== null && removal.registrationOpenUntil > now) {
      const until = utc(removal.registrationOpenUntil);
      return (
        <KeyGroup account={member.userId} email={member.email}>
          <KeyStateText key="open" account={member.userId} state="open" className="text-sm">
            Registration of a new key is open until {until}. The code was shown once to the administrator who opened it. If it was lost, open registration again after {until}.
          </KeyStateText>
        </KeyGroup>
      );
    }
    return (
      <KeyGroup account={member.userId} email={member.email}>
        <OpenRegistration
          organizationId={organizationId}
          removalId={removal.removalId}
          email={member.email}
          lead={
            <KeyStateText key="removed" account={member.userId} state="removed" className="text-sm text-muted-foreground">
              Keys removed{removal.decidedAt === null ? '' : ` at ${utc(removal.decidedAt)}`}. Open registration only when you are speaking with the person and are sure it is them: it lasts one hour and gives you a code to read to them.
            </KeyStateText>
          }
        >
          <FormKeys />
        </OpenRegistration>
      </KeyGroup>
    );
  }
  return (
    <KeyGroup account={member.userId} email={member.email}>
      {removal?.state === 'cancelled' || removal?.state === 'expired' ? (
        <KeyStateText key={removal.state} account={member.userId} state={removal.state} className="text-sm text-muted-foreground">
          No key removal stands for this account: the request of {utc(removal.requestedAt)} {removal.state === 'cancelled' ? 'was cancelled' : 'expired'}.
        </KeyStateText>
      ) : null}
      <ActionForm
        action={requestKeyRemovalAction}
        submit={
          <>
            Request key removal
            <Account email={member.email} />
          </>
        }
        variant="outline"
        className="flex flex-col gap-1"
      >
        <FormKeys />
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="userId" value={member.userId} />
      </ActionForm>
    </KeyGroup>
  );
}
