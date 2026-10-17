import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { QuestionList, VersionStatusBadge } from '../../../../../components/contracts/display';
import { AnswerForm, TagForm, documentLabel } from '../../../../../components/contracts/forms';
import { utc } from '../../../../../components/format';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { windowText } from '../../../../../lib/contracts/display';
import { loadPage } from '../../../../../lib/http/next';
import { contractPage } from '../../../../../lib/routes/contracts';
import { answerQuestionFormAction, tagDocumentFormAction } from '../actions';

export const metadata: Metadata = { title: 'Contract' };

type Props = { readonly params: Promise<{ practiceId: string; contractId: string }> };

const CALENDAR_KIND_NAMES = { anniversary: 'Anniversary', notice_deadline: 'Notice deadline', fee_schedule_year: 'New Medicare fee schedule year', amendment: 'Amendment takes effect' } as const;

/**
 * One contract (PRD 7, Contracts): every version with its window and state (a superseded version
 * stays listed, read-only, and opens as it was), the plans mapped to it, its calendar, the contract
 * specialist's questions about it, and the uploaded documents that can be added to it (they join the
 * version being abstracted, or start a new version from their date; versions never overlap, CON-01).
 */
export default async function ContractPage(props: Props) {
  const page = await loadPage(contractPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="contracts" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, detail, calendar, questions, untagged, canUpload, canSignOff } = page.data;
  const { contract, versions, plans } = detail;
  const path = `/p/${practiceId}/contracts`;
  return (
    <AppShell shell={page.shell} section="contracts">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <Link className="underline" href={path}>
            Contracts
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-display">{contract.title}</h1>
        <p className="text-sm text-muted-foreground">
          With {contract.payerName}
          {contract.billingEntity === null ? '' : `; billing entity ${contract.billingEntity}`}.
        </p>
      </div>
      <section aria-label="Versions" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Versions</h2>
        {versions.length === 0 ? (
          <EmptyState title="No version yet" nextStep="Add an uploaded document to this contract below to start its first version." />
        ) : (
          <table className="w-full text-left text-sm" aria-label="Versions">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Version</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Effective</th>
                <th className="py-1 text-right font-medium">Rate records</th>
                <th className="py-1 font-medium">Approved</th>
                <th className="py-1 font-medium">Signed off</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-t align-top" data-version={version.id}>
                  <td className="py-1 pr-3">
                    <Link className="underline" href={`${path}/versions/${version.id}`}>
                      Version {version.versionNo}
                    </Link>
                    {version.supersedesNo === null ? null : <div className="text-xs text-muted-foreground">Follows version {version.supersedesNo}</div>}
                  </td>
                  <td className="py-1 pr-3">
                    <VersionStatusBadge status={version.status} />
                  </td>
                  <td className="py-1 pr-3">{windowText(version.effectiveFrom, version.effectiveTo)}</td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">
                    {version.verified} of {version.records} verified
                  </td>
                  <td className="py-1 pr-3">{version.approvedAt === null ? '—' : `${version.approvedBy ?? ''}, ${utc(version.approvedAt)}`}</td>
                  <td className="py-1">{version.signedOffAt === null ? '—' : `${version.signedOffBy ?? ''}, ${utc(version.signedOffAt)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section aria-label="Plans mapped" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Plans mapped to this contract</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No plan is mapped to it yet. Once a version is signed off, map the payer’s plans to it on{' '}
            <Link className="underline" href={`/p/${practiceId}/mapping`}>
              Payer and plan mapping
            </Link>
            .
          </p>
        ) : (
          <ul className="text-sm">
            {plans.map((plan) => (
              <li key={plan.mappingId}>
                <Link className="underline" href={`/p/${practiceId}/mapping/${plan.planId}`}>
                  {plan.planKey}
                </Link>{' '}
                <span className="text-muted-foreground">({windowText(plan.effectiveFrom, plan.effectiveTo)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Contract calendar" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Calendar</h2>
        {calendar.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dates ahead.</p>
        ) : (
          <ul className="text-sm">
            {calendar.map((event) => (
              <li key={event.id}>
                {event.onDate}: {CALENDAR_KIND_NAMES[event.kind]}
                {event.note === null ? '' : `. ${event.note}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="The specialist's questions" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">The contract specialist’s questions</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None about this contract.</p>
        ) : (
          <QuestionList
            questions={questions}
            practiceId={practiceId}
            answer={
              canSignOff
                ? (question) => <AnswerForm action={answerQuestionFormAction} practiceId={practiceId} questionId={question.id} />
                : undefined
            }
          />
        )}
      </section>
      <Card role="region" aria-label="Add a document">
        <CardHeader>
          <CardTitle>Add an uploaded document to this contract</CardTitle>
          <CardDescription>
            An exhibit or a page joins the version being abstracted. With no version being abstracted, the document starts a new version from its date; a window that overlaps a
            signed-off version is refused, because versions never overlap: the contract specialist drafts an amendment instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canUpload ? (
            <p className="text-sm text-muted-foreground">Whoever uploads files adds them to a contract.</p>
          ) : untagged.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No uploaded document is waiting. Upload one on the{' '}
              <Link className="underline" href={path}>
                Contracts
              </Link>{' '}
              screen first.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Untagged documents">
              {untagged.map((document) => (
                <li key={document.id} className="rounded-md border p-3" data-document={document.id}>
                  <p className="mb-2 text-sm font-medium">{documentLabel(document)}</p>
                  <TagForm
                    action={tagDocumentFormAction}
                    practiceId={practiceId}
                    document={document}
                    payers={[]}
                    contracts={[]}
                    fixedContract={{ id: contract.id, payerId: contract.payerId, title: contract.title }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
