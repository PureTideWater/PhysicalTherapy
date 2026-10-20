import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { SubmissionUnattestedReason } from '@tp/worker/packets';
import type { PricingCheckCause } from '@tp/worker/pricing';
import Link from 'next/link';

import { CHANNEL_TEXT, RESPONSE_TEXT } from '../../lib/cases/timeline';
import { PRICING_CAUSE_TEXT } from '../../lib/packets/pricing';
import { RECONCILIATION_UNATTESTED, SENT_WITHOUT_SIGN_OFF, STALE_EXPORT_REVIEW, type UnattestedSubmissionView, staleExportSteps, unattestedReasonText } from '../../lib/packets/unattested';
import { StatusChip } from '../status';

/**
 * Why the review refuses to attest an export whose pricing went stale after it was made, and what to do instead
 * (the founder's ruling of 2026-10-20; docs/adr/0061): the cause, that the export is never attested, the three steps
 * that replace it (re-price, a new version, a new export), and, when it may already have gone to the payer, how the
 * practice logs it sent without sign-off; once it has been logged so, that instead.
 */
export function StaleExportReview({
  cause,
  unattestedReason,
  sent,
}: {
  readonly cause: PricingCheckCause;
  /** Whether a submission of this export may be logged sent without sign-off (its pricing went stale after the export). */
  readonly unattestedReason: SubmissionUnattestedReason | null;
  /** The submission of this export already logged sent without sign-off, if any. */
  readonly sent: { readonly submittedOn: string } | null;
}) {
  return (
    <Alert variant="destructive" data-stale-export={cause} data-sent={sent === null ? 'no' : 'without_sign_off'}>
      <AlertTitle>{STALE_EXPORT_REVIEW.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{STALE_EXPORT_REVIEW.why(cause)}</p>
        {sent === null ? null : <p data-sent-without-sign-off={sent.submittedOn}>{STALE_EXPORT_REVIEW.sent(sent.submittedOn)}</p>}
        <p>{STALE_EXPORT_REVIEW.whatToDo}</p>
        <ol className="flex list-decimal flex-col gap-1 pl-5" aria-label="What to do instead">
          {staleExportSteps(cause).map((step) => (
            <li key={step.id} data-step={step.id}>
              {step.text}
            </li>
          ))}
        </ol>
        {sent === null && unattestedReason !== null ? <p data-if-sent="without_sign_off">{STALE_EXPORT_REVIEW.ifSent}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The submissions sent without sign-off, plainly, on Reconciliation (the founder's ruling of 2026-10-20): each with its
 * case, its date and channel, its reason in the founder's words, the cause the database recorded, and the payer's
 * latest answer, which reconciliation tracks as for any submission. Nothing shows when there are none.
 */
export function UnattestedSubmissions({ practiceId, unattested }: { readonly practiceId: string; readonly unattested: { readonly total: number; readonly items: readonly UnattestedSubmissionView[] } }) {
  if (unattested.total === 0) {
    return null;
  }
  return (
    <Card role="region" aria-label={RECONCILIATION_UNATTESTED.title} data-unattested-total={String(unattested.total)}>
      <CardHeader>
        <CardTitle>{RECONCILIATION_UNATTESTED.title}</CardTitle>
        <CardDescription>{RECONCILIATION_UNATTESTED.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {unattested.items.map((item) => (
            <li key={item.submissionId} className="flex flex-col gap-1 rounded-md border p-3 text-sm" data-submission={item.submissionId} data-unattested-reason={item.reason}>
              <p className="flex flex-wrap items-center gap-2">
                <StatusChip tone="danger">{SENT_WITHOUT_SIGN_OFF}</StatusChip>
                <span className="font-medium">
                  {item.submittedOn}, {CHANNEL_TEXT[item.channel]}
                </span>
                <span>
                  packet version {item.versionNo}, dispute level {item.disputeLevel}
                </span>
                <Link className="underline" href={`/p/${practiceId}/cases/${item.caseId}/submissions`}>
                  Submissions
                </Link>
                <Link className="underline" href={`/p/${practiceId}/reconciliation?case=${item.caseId}`}>
                  Case ledger
                </Link>
              </p>
              <p>
                {unattestedReasonText(item.reason)}.{item.pricingCheck === null || item.pricingCheck === 'current' ? '' : ` The cause, when it was logged: ${PRICING_CAUSE_TEXT[item.pricingCheck]}.`}
              </p>
              <p data-latest-response={item.latestResponse?.kind ?? 'none'}>
                {item.latestResponse === null ? 'The payer has not answered it yet.' : `The payer’s latest answer: ${RESPONSE_TEXT[item.latestResponse.kind]}, received ${item.latestResponse.receivedOn}.`}
              </p>
            </li>
          ))}
        </ul>
        {unattested.total > unattested.items.length ? (
          <p className="pt-2 text-sm text-muted-foreground">
            The newest {unattested.items.length} of {unattested.total} are listed; each case’s ledger lists its own.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
