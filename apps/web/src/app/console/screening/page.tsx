import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { FormKeys } from '../../../components/form-keys';
import { utc } from '../../../components/format';
import { ScrollTable } from '../../../components/scroll-table';
import { ScreeningSplitForm } from '../../../components/screening/split-form';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { type ScreeningSplitView, screeningSplitPage } from '../../../lib/screening/routes';
import { approveScreeningSplitAction } from './actions';

export const metadata: Metadata = { title: 'Place-of-service split' };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A split's codes of one setting, in code order, space-joined. */
function codesOf(split: ScreeningSplitView | null, setting: 'facility' | 'non_facility'): string {
  if (split === null) {
    return '';
  }
  return Object.entries(split.settings)
    .filter(([, value]) => value === setting)
    .map(([code]) => code)
    .sort()
    .join(' ');
}

/**
 * The place-of-service split (Change Order 001, CO-04; reconciliation-001, D20 a; since PR 6b every practice's default,
 * docs/adr/0064): the platform's default, which a contract specialist approves (a person, never a model; permission
 * rate_record.approve). The engine prices a row at the facility or non-facility rate by its place of service and
 * leaves a place outside the split unpriced; a practice's own setting comes first. Each approval is a new record, kept
 * with who approved it and when; the latest is in force for new screenings and each practice's next pricing run, and
 * a run keeps the split it was pinned to. Screening stays closed until a split is approved and a rule release is in
 * force.
 */
export default async function ScreeningSplitPage(props: Props) {
  const page = await loadPage(screeningSplitPage, { searchParams: props.searchParams });
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="screening_split" roles={page.roles} message={page.message} nextStep="The place-of-service split is approved by a contract specialist." />;
  }
  const { approved, releaseNo, inForce, history } = page.data;
  return (
    <AppShell shell={page.shell} section="screening_split">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Place-of-service split</h1>
        <p className="text-base text-muted-foreground">
          Each Medicare line and screening row prices at the facility or the non-facility rate by its place of service. A place in neither list is left unpriced, unless a practice has set it. Your approval
          is recorded under your account with the time; the latest approval is in force.
        </p>
        <p className="text-base" data-split-warning>
          Approving changes every place a practice has not set, from each practice’s next run, and the free screening’s split.
        </p>
      </div>
      {approved ? (
        <Alert data-state="approved">
          <AlertTitle>Split approved</AlertTitle>
          <AlertDescription>New screenings and each practice’s next pricing run use it; screenings already queued and runs already created keep the split they were given.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{inForce === null ? 'Approve the first split' : 'Approve a new split'}</CardTitle>
          <CardDescription>
            {inForce === null ? 'No split is approved, so screening is closed.' : 'The fields hold the split in force.'}{' '}
            {releaseNo === null ? 'No rule release is in force either, so screening stays closed after you approve.' : `Rule release ${String(releaseNo)} is in force.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScreeningSplitForm action={approveScreeningSplitAction} facility={codesOf(inForce, 'facility')} nonFacility={codesOf(inForce, 'non_facility')} formKeys={<FormKeys />} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle id="screening-splits">Approved splits</CardTitle>
          <CardDescription>The latest 50, newest first. A split never changes once approved.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState title="No split approved yet" nextStep="Approve the first split above to open screening." />
          ) : (
            <ScrollTable label="Approved splits">
              <table className="w-full min-w-[40rem] text-left text-sm" aria-labelledby="screening-splits">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Approved</th>
                    <th className="py-1 pr-3 font-medium">By</th>
                    <th className="py-1 pr-3 font-medium">Facility</th>
                    <th className="py-1 pr-3 font-medium">Non-facility</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((split) => (
                    <tr key={split.id} className="border-t align-top" data-split={split.inForce ? 'in-force' : 'earlier'}>
                      <td className="py-1 pr-3 whitespace-nowrap">{utc(split.approvedAt)}</td>
                      <td className="py-1 pr-3 wrap-anywhere">{split.approvedByEmail ?? 'A contract specialist'}</td>
                      <td className="py-1 pr-3 font-mono tabular-nums">{codesOf(split, 'facility') || '—'}</td>
                      <td className="py-1 pr-3 font-mono tabular-nums">{codesOf(split, 'non_facility') || '—'}</td>
                      <td className="py-1">{split.inForce ? 'In force' : 'Earlier'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
