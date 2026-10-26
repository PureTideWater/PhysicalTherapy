import { Alert, AlertDescription, AlertTitle, Badge } from '@tp/ui';

import type { AccountStanding } from '../../lib/routes/billing';

/** Stub for the failing tests: the badge and the alert as the page drew them before. */
export function AccountStandingSummary({ standing }: { readonly standing: AccountStanding }) {
  return (
    <div className="contents" data-standing={standing.kind}>
      <p className="text-base text-muted-foreground">
        Standing: <Badge variant={standing.tone === 'neutral' ? 'outline' : 'destructive'}>{standing.label}</Badge>
      </p>
      {standing.notice === null ? null : (
        <Alert variant="destructive" data-notice="suspended" role="alert">
          <AlertTitle>New runs have stopped</AlertTitle>
          <AlertDescription>{standing.notice}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
