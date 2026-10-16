import { randomUUID } from 'node:crypto';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { QuestionList, VersionStatusBadge } from '../../../../components/contracts/display';
import { TagForm, documentLabel } from '../../../../components/contracts/forms';
import { Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { windowText } from '../../../../lib/contracts/display';
import { loadPage } from '../../../../lib/http/next';
import { abstractionPage } from '../../../../lib/routes/abstraction';
import { startAbstractionFormAction, withdrawQuestionFormAction } from './actions';

export const metadata: Metadata = { title: 'Contract abstraction' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The practice's part of the specialist queue (PRD 7, Specialist queue; PRD 5, J5), for a contract
 * specialist under the practice's support grant: the contract documents awaiting abstraction (a
 * document no approved or signed-off version names), the versions in draft, under review or awaiting
 * the customer's sign-off, and the questions asked of the practice. A document not yet tagged starts
 * its contract here; a tagged one opens its version, where the specialist enters its rate records by
 * hand with page and quote.
 */
export default async function AbstractionPage(props: Props) {
  const page = await loadPage(abstractionPage, props);
  if (page.kind === 'forbidden') {
    return (
      <Forbidden
        shell={page.shell}
        section="abstraction"
        roles={page.roles}
        message={page.message}
        nextStep="Abstraction is the contract specialist's, under a support grant the platform administrator opens from a ticket."
      />
    );
  }
  const { practiceId, documents, versions, questions, payers, contracts } = page.data;
  const path = `/p/${practiceId}/abstraction`;
  return (
    <AppShell shell={page.shell} section="abstraction">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap gap-3 text-sm">
          <Link className="underline" href="/console/specialist-queue">
            Specialist queue
          </Link>
          <Link className="underline" href={`/p/${practiceId}/abstraction/regulations`}>
            Regulations to confirm
          </Link>
          <Link className="underline" href={`/p/${practiceId}/abstraction/ledger`}>
            Ledger corrections
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Contract abstraction</h1>
        <p className="text-sm text-muted-foreground">
          Enter each term by hand with the document, page and quote it comes from, approve it field by field against that page, then approve the version for the practice to sign
          off.
        </p>
      </div>
      <section aria-label="Documents awaiting abstraction" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Documents awaiting abstraction</h2>
        {documents.total === 0 ? (
          <EmptyState title="Nothing awaiting abstraction" nextStep="Contracts, exhibits and payer letters appear here once the practice uploads them and their scan is clean." />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Awaiting abstraction">
            {documents.items.map((document) => (
              <li key={document.id} className="rounded-md border p-3" data-document={document.id}>
                <p className="mb-2 text-sm font-medium">{documentLabel(document)}</p>
                {document.openVersions.length > 0 ? (
                  <p className="text-sm">
                    In{' '}
                    {document.openVersions.map((version, index) => (
                      <span key={version.versionId}>
                        {index > 0 ? ', ' : ''}
                        <Link className="underline" href={`${path}/versions/${version.versionId}`}>
                          {version.contractTitle}, version {version.versionNo}
                        </Link>
                      </span>
                    ))}
                  </p>
                ) : payers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">The practice has no payer yet: its 835s name its payers.</p>
                ) : (
                  <TagForm action={startAbstractionFormAction} practiceId={practiceId} document={document} payers={payers} contracts={contracts} />
                )}
              </li>
            ))}
          </ul>
        )}
        <Pager path={path} query={{}} page={documents.page} pages={documents.pages} total={documents.total} noun="documents" />
      </section>
      <section aria-label="Versions in progress" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Versions in progress</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No version is being abstracted, reviewed or awaiting sign-off.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Versions in progress">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Contract</th>
                <th className="py-1 font-medium">Version</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Effective</th>
                <th className="py-1 text-right font-medium">Rate records</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-t" data-version={version.id}>
                  <td className="py-1 pr-3">
                    {version.contractTitle} <span className="text-muted-foreground">({version.payerName})</span>
                  </td>
                  <td className="py-1 pr-3">
                    <Link className="underline" href={`${path}/versions/${version.id}`}>
                      Version {version.versionNo}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">
                    <VersionStatusBadge status={version.status} />
                  </td>
                  <td className="py-1 pr-3">{windowText(version.effectiveFrom, version.effectiveTo)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {version.verified} of {version.records} verified
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Card role="region" aria-label="Questions to the practice">
        <CardHeader>
          <CardTitle>Questions to the practice</CardTitle>
          <CardDescription>Open questions show on the practice’s Contracts screen; those asking for a document show on its Coverage screen as what to obtain. Ask one from a version.</CardDescription>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open questions.</p>
          ) : (
            <QuestionList
              questions={questions}
              practiceId={practiceId}
              link={(question) => (question.versionId === null ? null : `${path}/versions/${question.versionId}`)}
              answer={(question) => (
                <ActionForm action={withdrawQuestionFormAction} submit="Withdraw the question" variant="outline">
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <input type="hidden" name="practiceId" value={practiceId} />
                  <input type="hidden" name="questionId" value={question.id} />
                </ActionForm>
              )}
            />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
