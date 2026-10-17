import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label, PermissionState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { QuestionList, VersionStatusBadge } from '../../../../components/contracts/display';
import { AnswerForm, TagForm, documentLabel } from '../../../../components/contracts/forms';
import { roleNames } from '../../../../components/format';
import { Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { Uploader } from '../../../../components/uploads/uploader';
import { METHOD_NAMES, VERSION_STATUS_NAMES, windowText } from '../../../../lib/contracts/display';
import { loadPage } from '../../../../lib/http/next';
import { contractsPage } from '../../../../lib/routes/contracts';
import { KIND_NAMES } from '../../../../lib/uploads/receipt-labels';
import { answerQuestionFormAction, tagDocumentFormAction } from './actions';
import { pageCsrfToken } from '../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Contracts' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const CALENDAR_KIND_NAMES = { anniversary: 'Anniversary', notice_deadline: 'Notice deadline', fee_schedule_year: 'New Medicare fee schedule year', amendment: 'Amendment takes effect' } as const;

/**
 * The Contracts screen (PRD 7): each contract with its payer, the plans mapped to it, the version in
 * force (or the latest), its effective window, method and status, and its coverage share (from pricing
 * runs, none yet); the contract calendar; the upload of contracts, exhibits and payer letters through
 * the intake flow, and the tag that gives each uploaded document its payer (J5); and the contract
 * specialist's open questions, which the practice answers here.
 */
export default async function ContractsPage(props: Props) {
  const page = await loadPage(contractsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="contracts" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, filters, payers, list, calendar, untagged, contracts, questions, upload, canSignOff, roles } = page.data;
  const path = `/p/${practiceId}/contracts`;
  const filtered = filters.payer !== undefined || filters.status !== undefined;
  return (
    <AppShell shell={page.shell} section="contracts">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Contracts</h1>
        <p className="text-base text-muted-foreground">
          The practice’s agreements with its payers. A version prices lines only once the contract specialist has verified every term against its page and the practice has signed it
          off.
        </p>
      </div>
      <form method="get" action={path} className="flex flex-wrap items-end gap-3" aria-label="Filter contracts">
        <div className="flex flex-col gap-1">
          <Label htmlFor="payer">Payer</Label>
          <select id="payer" name="payer" defaultValue={filters.payer ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">All payers</option>
            {payers.map((payer) => (
              <option key={payer.id} value={payer.id}>
                {payer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="status">Latest version</Label>
          <select id="status" name="status" defaultValue={filters.status ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Any status</option>
            {Object.entries(VERSION_STATUS_NAMES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {filtered ? (
          <Link className="text-sm underline" href={path}>
            Clear filters
          </Link>
        ) : null}
      </form>
      {list.total === 0 ? (
        <EmptyState
          mark
          title={filtered ? 'No contracts match these filters' : 'No contracts yet'}
          nextStep={filtered ? 'Choose all payers or any status.' : 'Upload a contract or a fee-schedule exhibit below and tag it to its payer; the contract specialist abstracts it.'}
        />
      ) : (
        <Card>
          <CardContent>
            <table className="w-full text-left text-sm" aria-label="Contracts">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Payer</th>
                  <th className="py-1 font-medium">Contract</th>
                  <th className="py-1 font-medium">Plans</th>
                  <th className="py-1 font-medium">Version</th>
                  <th className="py-1 font-medium">Effective</th>
                  <th className="py-1 font-medium">Method</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">Coverage share</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((contract) => (
                  <tr key={contract.id} className="border-t align-top" data-contract={contract.id}>
                    <td className="py-2 pr-3">{contract.payerName}</td>
                    <td className="py-2 pr-3">
                      <Link className="underline" href={`${path}/${contract.id}`}>
                        {contract.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{contract.plans.length === 0 ? <span className="text-muted-foreground">None mapped</span> : contract.plans.join(', ')}</td>
                    <td className="py-2 pr-3">
                      {contract.shown === null ? (
                        '—'
                      ) : (
                        <Link className="underline" href={`${path}/versions/${contract.shown.versionId}`}>
                          Version {contract.shown.versionNo}
                          {contract.shown.inForce ? ' (in force)' : ''}
                        </Link>
                      )}
                    </td>
                    <td className="py-2 pr-3">{contract.shown === null ? '—' : windowText(contract.shown.effectiveFrom, contract.shown.effectiveTo)}</td>
                    <td className="py-2 pr-3">{contract.methods.length === 0 ? '—' : contract.methods.map((method) => METHOD_NAMES[method]).join(', ')}</td>
                    <td className="py-2 pr-3">{contract.latestStatus === null ? '—' : <VersionStatusBadge status={contract.latestStatus} />}</td>
                    <td className="py-2 text-muted-foreground">No pricing run yet</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <Pager path={path} query={{ payer: filters.payer, status: filters.status }} page={list.page} pages={list.pages} total={list.total} noun="contracts" />

      <section aria-label="Contract calendar" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Contract calendar</h2>
        {calendar.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dates ahead. Signing off a version records its anniversary, notice deadline, fee-schedule year and amendment dates here.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Calendar">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 font-medium">What</th>
                <th className="py-1 font-medium">Contract</th>
                <th className="py-1 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {calendar.map((event) => (
                <tr key={event.id} className="border-t">
                  <td className="py-1 pr-3 whitespace-nowrap">{event.onDate}</td>
                  <td className="py-1 pr-3">{CALENDAR_KIND_NAMES[event.kind]}</td>
                  <td className="py-1 pr-3">
                    <Link className="underline" href={`${path}/${event.contractId}`}>
                      {event.contractTitle}
                    </Link>
                  </td>
                  <td className="py-1">{event.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="The specialist's questions" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">The contract specialist’s questions</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open questions.</p>
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

      <Card role="region" aria-label="Upload a contract or exhibit">
        <CardHeader>
          <CardTitle>Upload a contract, exhibit or payer letter</CardTitle>
          <CardDescription>
            Each file goes through the same scanned intake as an 835. Once it is stored, tag it to its payer below; it then enters the contract specialist’s queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Uploader
            csrfToken={await pageCsrfToken()}
            practiceId={practiceId}
            canUpload={upload.canUpload}
            roleNames={roleNames(roles)}
            gate={upload.gate}
            limits={{ ...upload.limits, contentTypes: upload.kinds[0]?.contentTypes ?? [] }}
            kinds={upload.kinds.map((kind) => ({ kind: kind.kind, label: KIND_NAMES[kind.kind].replace(/^./, (first) => first.toUpperCase()), contentTypes: kind.contentTypes }))}
            heading="Drop contracts, exhibits or payer letters here"
            description="PDFs (a fee-schedule exhibit may also be a spreadsheet), one at a time or a batch, up to 2 GiB each."
            uploaders="Billing managers, analysts and firm principals upload contracts."
            showReceipts={false}
          />
        </CardContent>
      </Card>

      <section aria-label="Documents to tag" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Documents to tag to a payer</h2>
        {untagged.total === 0 ? (
          <p className="text-sm text-muted-foreground">Every uploaded contract document is tagged.</p>
        ) : !upload.canUpload ? (
          <>
            <PermissionState role={roleNames(roles)} cannot="tag documents to a payer" nextStep="Whoever uploads files tags them; the contract specialist can too." />
            <ul className="text-sm">
              {untagged.items.map((document) => (
                <li key={document.id}>{documentLabel(document)}</li>
              ))}
            </ul>
          </>
        ) : payers.length === 0 ? (
          <EmptyState title="No payer to tag to yet" nextStep="Payers come from the practice's 835s. Upload the payer's remittances first; then tag its contract here." />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Untagged documents">
            {untagged.items.map((document) => (
              <li key={document.id} className="rounded-md border p-3" data-document={document.id}>
                <p className="mb-2 text-sm font-medium">{documentLabel(document)}</p>
                <TagForm action={tagDocumentFormAction} practiceId={practiceId} document={document} payers={payers} contracts={contracts} />
              </li>
            ))}
          </ul>
        )}
        <Pager
          path={path}
          query={{ payer: filters.payer, status: filters.status, page: String(list.page) }}
          page={untagged.page}
          pages={untagged.pages}
          total={untagged.total}
          noun="documents"
          param="documents"
        />
      </section>
    </AppShell>
  );
}
