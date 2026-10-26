import { Alert, AlertDescription, AlertTitle, Badge } from '@tp/ui';
import Link from 'next/link';

import type { AccountStanding, NextStep } from '../../lib/routes/billing';

/**
 * The organization's one standing at the top of its billing page (docs/adr/0050; the UX baseline review's UX-004): the
 * badge from the standing's label (outlined in the neutral tone, good standing or closed with nothing owed; the danger
 * variant otherwise, its words always beside the color), and the notice with its next steps in one alert while runs
 * are stopped, the organization is suspended or a closed organization still owes an invoice, a status otherwise. One
 * data-standing attribute names the kind for tests; the wrapper adds no box of its own.
 */
export function AccountStandingSummary({ standing }: { readonly standing: AccountStanding }) {
  return (
    <div className="contents" data-standing={standing.kind}>
      <p className="text-base text-muted-foreground">
        Standing: <Badge variant={standing.tone === 'neutral' ? 'outline' : 'destructive'}>{standing.label}</Badge>
      </p>
      {standing.notice === null ? null : (
        <Alert variant={standing.alert ? 'destructive' : 'default'} data-notice="standing" role={standing.alert ? 'alert' : 'status'}>
          <AlertTitle>{standing.title}</AlertTitle>
          <AlertDescription>
            <p>{standing.notice}</p>
            {standing.nextSteps.length === 0 ? null : (
              <p>
                {standing.nextSteps.map((step, index) => (
                  <span key={step.action}>
                    {index === 0 ? null : ' '}
                    <NextStepText step={step} />
                  </span>
                ))}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** A next step as one sentence: its action, a link when it has an address, then the rest of the sentence. */
export function NextStepText({ step }: { readonly step: NextStep }) {
  return (
    <>
      {step.href === null ? (
        step.action
      ) : (
        <Link className="underline" href={step.href}>
          {step.action}
        </Link>
      )}
      {step.detail}
    </>
  );
}
