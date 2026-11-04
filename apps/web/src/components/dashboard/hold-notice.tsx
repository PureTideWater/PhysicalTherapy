import { Alert, AlertDescription, AlertTitle, Badge } from '@tp/ui';
import Link from 'next/link';

import { type HoldNotice, JOB_REFUSED_LABEL } from '../../lib/billing/suspension-words';
import { WholeDates } from '../dates';

/**
 * The practice home's notice of a hold on new work (H1 to H13, with its next step H8 to H12; docs/adr/0080; design
 * SS-01, section 6.2), its words holdNotice's. Each date in the body is kept whole, since a browser breaks a line
 * after a date's hyphen and a phone read "on 2026- / 11-04" (PR #104 review UX-SS01-6; docs/adr/0078 Decision 1).
 */
export function HoldAlert({ hold }: { readonly hold: HoldNotice }) {
  return (
    <Alert variant="destructive" data-notice="suspended" data-hold-source={hold.source} role="alert">
      <AlertTitle>{hold.title}</AlertTitle>
      <AlertDescription>
        <p>
          <WholeDates text={hold.body} />
        </p>
        {hold.nextStep === null ? null : (
          <p data-next-step>
            {hold.nextStep.link === null ? null : hold.nextStep.href === null ? (
              hold.nextStep.link
            ) : (
              <Link className="underline" href={hold.nextStep.href}>
                {hold.nextStep.link}
              </Link>
            )}
            {hold.nextStep.text}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** The last run's outcome in words: J1 for a job the worker's gate refused (design SS-01, section 6.3). */
const OUTCOME_NAMES: Readonly<Record<string, string>> = {
  running: 'Running',
  retrying: 'Failed; retrying',
  succeeded: 'Succeeded',
  failed: 'Failed three times',
  refused: JOB_REFUSED_LABEL,
};

/**
 * The last run's outcome on the Data freshness card. The badge wraps inside its card, as ActionForm's wrapSubmit does
 * for a long button: J1 is longer than a phone's line leaves it, and a badge kept on one line made the practice home
 * scroll sideways at 390 px (PR #104 review UX-SS01-2; docs/adr/0056: no page scrolls sideways at a phone's width).
 */
export function RunOutcomeBadge({ outcome }: { readonly outcome: string }) {
  return (
    <Badge variant={outcome === 'failed' ? 'destructive' : outcome === 'succeeded' ? 'default' : 'secondary'} className="h-auto whitespace-normal text-left" data-outcome={outcome}>
      {OUTCOME_NAMES[outcome] ?? outcome}
    </Badge>
  );
}
