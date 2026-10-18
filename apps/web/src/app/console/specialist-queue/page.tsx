import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../../components/format';
import { Pager } from '../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { specialistQueuePage } from '../../../lib/routes/console';

export const metadata: Metadata = { title: 'Specialist queue' };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The specialist queue (PRD 7, Internal console): per practice, the documents awaiting abstraction,
 * the drafts, the proposals awaiting verification (the model's or a specialist's), the versions
 * awaiting the practice's sign-off and the questions to the practice, as counts. A
 * contract specialist opens a practice's records only under a support grant the platform
 * administrator opens from a ticket (docs/adr/0028); with one open, the practice's abstraction opens
 * from here.
 */
export default async function SpecialistQueuePage(props: Props) {
  const page = await loadPage(specialistQueuePage, { searchParams: props.searchParams });
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="specialist_queue" roles={page.roles} message={page.message} nextStep="The specialist queue is the contract specialists'." />;
  }
  const { practices, totals, showAll, page: current, pages, total } = page.data;
  return (
    <AppShell shell={page.shell} section="specialist_queue">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Specialist queue</h1>
        <p className="text-base text-muted-foreground">
          Counts only: a practice’s documents and contracts open only under its support grant, which a platform administrator opens from a ticket for four hours.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Documents awaiting abstraction</CardDescription>
            <CardTitle className="text-3xl font-mono tabular-nums">{totals.documentsAwaiting}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Proposals awaiting verification</CardDescription>
            <CardTitle className="text-3xl font-mono tabular-nums">{totals.proposalsAwaiting}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Versions whose proposed rate records, the model&apos;s or a specialist&apos;s, wait to be verified field by field against their cited pages.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Questions to customers</CardDescription>
            <CardTitle className="text-3xl font-mono tabular-nums">{totals.openQuestions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Regulations to confirm</CardDescription>
            <CardTitle className="text-3xl font-mono tabular-nums">{totals.regulationsAwaiting}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Medicare Advantage packets wait for your confirmation before anyone can approve them.</CardContent>
        </Card>
      </div>
      <p className="text-sm">
        {showAll ? (
          <Link className="underline" href="/console/specialist-queue">
            Show only practices with work waiting
          </Link>
        ) : (
          <Link className="underline" href="/console/specialist-queue?all=1">
            Show every practice
          </Link>
        )}
      </p>
      {total === 0 ? (
        <EmptyState mark title="Nothing waiting" nextStep="Practices appear here when they upload contracts or exhibits, or when a version or question waits." />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Practices">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Practice</th>
              <th className="py-1 text-right font-medium">Awaiting abstraction</th>
              <th className="py-1 text-right font-medium">Drafts</th>
              <th className="py-1 text-right font-medium">Proposals</th>
              <th className="py-1 text-right font-medium">Awaiting sign-off</th>
              <th className="py-1 text-right font-medium">Open questions</th>
              <th className="py-1 text-right font-medium">Regulations to confirm</th>
              <th className="py-1 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {practices.map((practice) => (
              <tr key={practice.practiceId} className="border-t" data-practice={practice.practiceId}>
                <td className="py-1 pr-3">{practice.name}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{practice.documentsAwaiting}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{practice.drafts}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{practice.proposalsAwaiting}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{practice.awaitingSignOff}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{practice.openQuestions}</td>
                <td className="py-1 pr-3 text-right font-mono tabular-nums">{practice.regulationsAwaiting}</td>
                <td className="py-1">
                  {practice.grantEndsAt === null ? (
                    <span className="text-muted-foreground">No support grant: ask a platform administrator for one from the ticket</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <Link className="underline" href={`/p/${practice.practiceId}/abstraction`}>
                        Open the practice’s abstraction
                      </Link>
                      <Link className="underline" href={`/p/${practice.practiceId}/abstraction/regulations`}>
                        Regulations
                      </Link>
                      <Link className="underline" href={`/p/${practice.practiceId}/abstraction/ledger`}>
                        Ledger corrections
                      </Link>
                      <Badge variant="secondary">Grant ends {utc(practice.grantEndsAt)}</Badge>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager path="/console/specialist-queue" query={{ all: showAll ? '1' : undefined }} page={current} pages={pages} total={total} noun="practices" />
    </AppShell>
  );
}
