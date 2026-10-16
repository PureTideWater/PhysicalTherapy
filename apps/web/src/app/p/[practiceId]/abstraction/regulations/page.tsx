import { randomUUID } from 'node:crypto';

import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { Money } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { CONFIRMATION_CONSEQUENCE, regulationsPage } from '../../../../../lib/routes/specialist';
import { confirmRegulationFormAction } from './actions';

export const metadata: Metadata = { title: 'Regulations to confirm' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The regulations a contract specialist confirms (PRD 2, step 5; Rules reference, Medicare Advantage
 * non-contracting): each packet's current version that cites the regulation, with the case's pattern in
 * counts and dollars and the regulation's words, and the confirmation the database requires before anyone
 * approves the packet. Opaque IDs only; the version holds no identifier.
 */
export default async function RegulationsPage(props: Props) {
  const page = await loadPage(regulationsPage, props);
  if (page.kind === 'forbidden') {
    return (
      <Forbidden
        shell={page.shell}
        section="abstraction"
        roles={page.roles}
        message={page.message}
        nextStep="Confirming a regulation is the contract specialist's, under a support grant the platform administrator opens from a ticket."
      />
    );
  }
  const { practiceId, waiting, notice } = page.data;
  return (
    <AppShell shell={page.shell} section="abstraction">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <Link className="underline" href={`/p/${practiceId}/abstraction`}>
            Contract abstraction
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Regulations to confirm</h1>
        <p className="text-sm text-muted-foreground">
          A Medicare Advantage plan the practice has no contract with owes what Original Medicare would pay. Each packet that says so waits for you to confirm the regulation applies to its case
          before anyone can approve it.
        </p>
      </div>
      {notice === 'confirmed' ? (
        <Alert>
          <AlertTitle>Confirmed</AlertTitle>
          <AlertDescription>The confirmation is recorded in your name on that version; a person who approves packets can now approve it.</AlertDescription>
        </Alert>
      ) : null}
      {waiting.length === 0 ? (
        <EmptyState title="No regulation waits for confirmation" nextStep="A packet citing the Medicare Advantage regulation appears here once its version is written." />
      ) : (
        <ul aria-label="Regulations to confirm" className="flex flex-col gap-3">
          {waiting.map((item) => (
            <li key={item.versionId} data-version={item.versionId}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {item.reference}: version {item.versionNo}, written {utc(item.writtenAt)}
                  </CardTitle>
                  <CardDescription>
                    {item.payerName} ({item.planKey}): {item.lines} lines on {item.claims} claims, a shortfall of <Money value={item.varianceCents} /> against the Original Medicare amount.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <blockquote className="border-l-2 pl-3 text-sm">{item.statement}</blockquote>
                  <ActionForm action={confirmRegulationFormAction} submit="Confirm the regulation applies" className="flex max-w-xl flex-col gap-2">
                    <input type="hidden" name="requestKey" value={randomUUID()} />
                    <input type="hidden" name="practiceId" value={practiceId} />
                    <input type="hidden" name="versionId" value={item.versionId} />
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="confirm" required className="mt-1" />
                      <span>{CONFIRMATION_CONSEQUENCE} Confirm it.</span>
                    </label>
                  </ActionForm>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
