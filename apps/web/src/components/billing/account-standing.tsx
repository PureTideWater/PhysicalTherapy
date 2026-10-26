import { Alert, AlertDescription, AlertTitle, Badge } from '@tp/ui';
import Link from 'next/link';

import type { AccountStanding } from '../../lib/routes/billing';

/**
 * The organization's one standing at the top of its billing page (docs/adr/0050; the UX baseline review's UX-004): the
 * badge from the standing's label (outlined in good standing, the danger variant otherwise, its words always beside
 * the color), and the notice with its next steps in one alert while runs are stopped or the organization is suspended
 * or closed, a status while it is only past due. One data-standing attribute names the kind for tests; the wrapper
 * adds no box of its own.
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
                    {step.href === null ? (
                      step.action
                    ) : (
                      <Link className="underline" href={step.href}>
                        {step.action}
                      </Link>
                    )}
                    {step.detail}
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
