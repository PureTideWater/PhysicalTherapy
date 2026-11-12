import { Badge } from '@tp/ui';

import { cancelKeyRemovalAction, confirmKeyRemovalAction, requestKeyRemovalAction } from '../../app/console/actions';
import type { MemberSummary } from '../../lib/routes/console';
import { ActionForm } from '../action-form';
import { FormKeys } from '../form-keys';
import { utc } from '../format';
import { OpenRegistration } from './open-registration';

/**
 * A member's hardware keys in the internal console (docs/adr/0095): what stands for the account (a removal requested,
 * its keys removed, registration open) and what this administrator may do next. Two platform administrators remove an
 * account's keys, never the account itself; the database decides again, whatever this shows.
 */
export function KeyRemovalState({ member, now }: { readonly member: MemberSummary; readonly now: Date }) {
  const removal = member.keyRemoval;
  if (removal === null) {
    return null;
  }
  if (removal.state === 'requested') {
    return (
      <Badge variant="destructive">key removal requested</Badge>
    );
  }
  if (removal.registrationClosed) {
    return removal.registrationOpenUntil !== null && removal.registrationOpenUntil > now ? <Badge variant="outline">registration open</Badge> : <Badge variant="destructive">keys removed</Badge>;
  }
  return null;
}

export function KeyRemovalActions({ member, organizationId, now }: { readonly member: MemberSummary; readonly organizationId: string; readonly now: Date }) {
  const removal = member.keyRemoval;
  if (member.self) {
    // No one acts on the keys of their own account, and the page does not offer it.
    return removal?.state === 'requested' ? <p className="max-w-xs text-sm text-muted-foreground">Another administrator asked to remove your hardware keys. Two others decide it.</p> : null;
  }
  if (removal?.state === 'requested') {
    return (
      <div className="flex max-w-sm flex-col gap-2">
        <p className="text-sm">
          {removal.mine ? 'You' : removal.requestedByEmail} asked to remove this account’s hardware keys at {utc(removal.requestedAt)}. The request ends at {utc(removal.expiresAt)}.
        </p>
        {removal.mine ? (
          <p className="text-sm text-muted-foreground">Another platform administrator confirms it. You cannot confirm your own request.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Confirming removes every hardware key of {member.email}, ends their sessions at once and closes the account to sign-in until an administrator opens registration of a new key. It cannot be undone.
            </p>
            <ActionForm action={confirmKeyRemovalAction} submit="Confirm key removal" variant="destructive" className="flex flex-col gap-1">
              <FormKeys />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="removalId" value={removal.removalId} />
            </ActionForm>
          </>
        )}
        <ActionForm action={cancelKeyRemovalAction} submit="Cancel request" variant="outline" className="flex flex-col gap-1">
          <FormKeys />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="removalId" value={removal.removalId} />
        </ActionForm>
      </div>
    );
  }
  if (removal?.state === 'confirmed' && removal.registrationClosed) {
    if (removal.registrationOpenUntil !== null && removal.registrationOpenUntil > now) {
      return <p className="max-w-xs text-sm">Registration of a new key is open until {utc(removal.registrationOpenUntil)}. The code was shown once to the administrator who opened it.</p>;
    }
    return (
      <div className="flex max-w-sm flex-col gap-2">
        <p className="text-sm text-muted-foreground">Keys removed {removal.decidedAt === null ? '' : `at ${utc(removal.decidedAt)}`}. Open registration only when you are speaking with the person and are sure it is them: it lasts one hour and gives you a code to read to them.</p>
        <OpenRegistration organizationId={organizationId} removalId={removal.removalId} email={member.email}>
          <FormKeys />
        </OpenRegistration>
      </div>
    );
  }
  return (
    <ActionForm action={requestKeyRemovalAction} submit="Request key removal" variant="outline" className="flex flex-col gap-1">
      <FormKeys />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="userId" value={member.userId} />
    </ActionForm>
  );
}
