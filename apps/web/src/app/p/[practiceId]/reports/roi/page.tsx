import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { Field } from '../../../../../components/field';
import { utc } from '../../../../../components/format';
import { proofLevelWords } from '../../../../../components/reconciliation/display';
import { Money, Pager } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { roiStatementsPage } from '../../../../../lib/routes/roi';
import { generateRoiFormAction } from './actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'ROI statements' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * ROI statements (PRD 13, ROI statement; PRD 5, J12; PRD 7, Reports): the quarterly statements the daily
 * reconcile writes and the ones generated on demand, newest first, each with its period, proof level and
 * recovered; and, for a person who reconciles postings, a statement on demand for any period.
 */
export default async function RoiStatementsPage(props: Props) {
  const page = await loadPage(roiStatementsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, statements, canGenerate, suggested } = page.data;
  const path = `/p/${practiceId}/reports/roi`;
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/reports`}>
          Reports
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">ROI statements</h1>
        <p className="text-base text-muted-foreground">
          Recovered cash net of recoupments against the fees paid, from the recovery ledger’s entries alone: each figure lists the entries it sums. The quarter before is written on the first day of each quarter.
        </p>
      </div>
      {canGenerate ? (
        <Card role="region" aria-label="Generate a statement">
          <CardHeader>
            <CardTitle>Generate a statement</CardTitle>
            <CardDescription>For any period, from the entries whose money moved in it; it is printed to PDF beside its CSV.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={generateRoiFormAction} submit="Generate the statement" className="flex flex-wrap items-end gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <Field label="First day" name="periodFrom" type="date" defaultValue={suggested.from} required />
              <Field label="Last day" name="periodTo" type="date" defaultValue={suggested.to} required />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      <section aria-label="Statements" className="flex flex-col gap-2">
        {statements.total === 0 ? (
          <EmptyState title="No ROI statement yet" nextStep="The quarter’s statement is written once its quarter ends; a billing manager can generate one for any period now." />
        ) : (
          <table aria-label="ROI statements" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-3">Period</th>
                <th className="py-1 pr-3">Kind</th>
                <th className="py-1 pr-3 text-right">Recovered (posted or deposited)</th>
                <th className="py-1 pr-3 text-right">Interest</th>
                <th className="py-1 pr-3">Proof level</th>
                <th className="py-1 pr-3">Generated</th>
                <th className="py-1">PDF</th>
              </tr>
            </thead>
            <tbody>
              {statements.items.map((statement) => (
                <tr key={statement.id} className="border-b" data-statement={statement.id}>
                  <td className="py-1 pr-3">
                    <Link className="underline" href={`${path}/${statement.id}`}>
                      {statement.periodFrom} to {statement.periodTo}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">{statement.quarterly ? <Badge variant="secondary">Quarterly</Badge> : <Badge variant="outline">On demand</Badge>}</td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={statement.recoveredCents} />
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={statement.interestCents} />
                  </td>
                  <td className="py-1 pr-3">{proofLevelWords(statement.proofLevel)}</td>
                  <td className="py-1 pr-3">
                    {utc(statement.generatedAt)} {statement.generatedBy === null ? 'by the reconcile job' : `by ${statement.generatedBy}`}
                  </td>
                  <td className="py-1" data-print={statement.print}>
                    {statement.print === 'printed' ? 'Printed' : statement.print === 'failed' ? 'Print failed; the operator was alerted' : 'Being printed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager path={path} query={{}} page={statements.page} pages={statements.pages} total={statements.total} noun="Statements" />
      </section>
    </AppShell>
  );
}
