import { randomUUID } from 'node:crypto';

import { QUESTION_TOPICS } from '@tp/db/runtime';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../../components/action-form';
import { QuestionList } from '../../../../../../components/contracts/display';
import { documentLabel } from '../../../../../../components/contracts/forms';
import { ReviewBody, VersionFacts, VersionStateNotice, reviewHref } from '../../../../../../components/contracts/review';
import { Field, SelectField } from '../../../../../../components/field';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { TOPIC_NAMES } from '../../../../../../lib/contracts/display';
import { loadPage } from '../../../../../../lib/http/next';
import { abstractionVersionPage } from '../../../../../../lib/routes/abstraction';
import {
  addRateRecordFormAction,
  amendVersionFormAction,
  approveFieldFormAction,
  approveVersionFormAction,
  askQuestionFormAction,
  removeRateRecordFormAction,
  supersedeVersionFormAction,
  updateVersionFormAction,
  withdrawQuestionFormAction,
} from '../../actions';

export const metadata: Metadata = { title: 'Abstract a version' };

type Props = { readonly params: Promise<{ practiceId: string; versionId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const METHODS = [
  { value: 'FIXED_SCHEDULE', label: 'Fixed schedule (an amount per unit)' },
  { value: 'PERCENT_OF_MEDICARE', label: 'Percent of Medicare' },
  { value: 'LESSER_OF', label: 'Lesser of billed charges and a schedule' },
  { value: 'PER_VISIT', label: 'Per visit (once per claim and date)' },
  { value: 'UNSUPPORTED', label: 'Unsupported (capitation, undefined case rate)' },
];

function Checkbox({ name, label }: { readonly name: string; readonly label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value="on" />
      {label}
    </label>
  );
}

/**
 * The contract specialist's Rate record review (PRD 7; PRD 5, J5: "in v0 the specialist abstracts it
 * by hand into rate records with page references"): the cited page beside the abstracted fields, the
 * approval of each field, the form that enters a record with its document, page and quote (checked
 * against the page before it is stored), the version's window and windows while it is a draft, the
 * approval of the version once every record is verified and resolves, the amendment or correction of a
 * signed-off version (never an edit, CON-03), and questions to the practice.
 */
export default async function AbstractionVersionPage(props: Props) {
  const page = await loadPage(abstractionVersionPage, props);
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
  const { practiceId, review, questions } = page.data;
  const { version, documents } = review;
  const path = `/p/${practiceId}/abstraction/versions/${version.id}`;
  const editable = version.status === 'draft' || version.status === 'proposed';
  // Each form carries its own request key.
  const hidden = () => (
    <>
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name="practiceId" value={practiceId} />
    </>
  );
  return (
    <AppShell shell={page.shell} section="abstraction">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <Link className="underline" href={`/p/${practiceId}/abstraction`}>
            Contract abstraction
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {version.contractTitle}, version {version.versionNo}
        </h1>
        <p className="text-sm text-muted-foreground">With {version.payerName}.</p>
      </div>
      <VersionStateNotice review={review} />
      <VersionFacts review={review} versionHref={(versionId) => `/p/${practiceId}/abstraction/versions/${versionId}`} />
      <ReviewBody
        review={review}
        href={reviewHref(path)}
        controls={
          editable
            ? {
                field: (record, field) =>
                  field.approvedBy === null ? (
                    <ActionForm action={approveFieldFormAction} submit={`Approve ${field.label.toLowerCase()}`} variant="outline" className="flex flex-col gap-1">
                      {hidden()}
                      <input type="hidden" name="rateRecordId" value={record.id} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <input type="hidden" name="field" value={field.field} />
                    </ActionForm>
                  ) : null,
                record: (record) => (
                  <ActionForm action={removeRateRecordFormAction} submit="Remove this record" variant="outline">
                    {hidden()}
                    <input type="hidden" name="rateRecordId" value={record.id} />
                    <input type="hidden" name="versionId" value={version.id} />
                  </ActionForm>
                ),
              }
            : {}
        }
      />
      {editable ? (
        <>
          <Card role="region" aria-label="Enter a rate record">
            <CardHeader>
              <CardTitle>Enter a rate record</CardTitle>
              <CardDescription>
                One term of the contract: the codes it covers, the method and its parameters, the Medicare adjustments the contract incorporates (off unless it says so), its rounding,
                and the page and the exact words it comes from. The quote is checked against the page before the record is stored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">The version names no document to cite yet.</p>
              ) : (
                <ActionForm action={addRateRecordFormAction} submit="Add the rate record" className="grid gap-3 md:grid-cols-2">
                  {hidden()}
                  <input type="hidden" name="versionId" value={version.id} />
                  <Field label="Procedure codes" name="codes" required hint="Five characters each, separated by commas: 97110, 97140. Or the word any, for a term that covers every code." />
                  <Field label="Modifier sets (optional)" name="modifierSets" hint="Sets separated by semicolons, such as GP; GP 59; none. Blank matches any modifiers." />
                  <Field label="Places of service (optional)" name="placesOfService" hint="Two digits each, such as 11, 22. Blank matches any." />
                  <SelectField label="Method" name="method" options={METHODS} />
                  <Field label="Amount (fixed schedule, per visit, or a lesser-of schedule)" name="amount" hint="Dollars and cents, such as 32.00." />
                  <Field label="Percentage of Medicare" name="percentage" hint="110 means 110%." />
                  <SelectField
                    label="Medicare fee schedule year"
                    name="yearBasis"
                    options={[
                      { value: 'CURRENT', label: 'In effect on the date of service' },
                      { value: 'LOCKED', label: 'A stated year' },
                    ]}
                  />
                  <Field label="Stated year (when locked)" name="lockedYear" pattern="\d{4}" />
                  <SelectField
                    label="Locality"
                    name="localityBasis"
                    options={[
                      { value: 'PRACTICE', label: 'The practice’s locality' },
                      { value: 'NAMED', label: 'A carrier and locality the contract names' },
                    ]}
                  />
                  <Field label="Carrier (when named)" name="carrier" pattern="\d{5}" />
                  <Field label="Locality (when named)" name="locality" pattern="\d{2}" />
                  <SelectField
                    label="Conversion factor"
                    name="conversionFactor"
                    options={[
                      { value: 'non_qualifying_apm', label: 'Non-qualifying (the default for "the Medicare rate")' },
                      { value: 'qualifying_apm', label: 'Qualifying APM participant' },
                    ]}
                  />
                  <SelectField
                    label="Lesser-of schedule"
                    name="scheduleMethod"
                    options={[
                      { value: 'FIXED_SCHEDULE', label: 'A fixed amount' },
                      { value: 'PERCENT_OF_MEDICARE', label: 'A percentage of Medicare' },
                    ]}
                  />
                  <fieldset className="flex flex-col gap-1">
                    <legend className="text-sm font-medium">Medicare adjustments the contract incorporates</legend>
                    <Checkbox name="applyMppr" label="Multiple procedure payment reduction" />
                    <Checkbox name="applyAssistantReduction" label="Assistant modifier reduction (CQ, CO)" />
                    <Checkbox name="applySequestration" label="Sequestration" />
                    <Checkbox name="applyNcci" label="NCCI edits" />
                  </fieldset>
                  <SelectField
                    label="Timed units"
                    name="timedUnitsRule"
                    options={[
                      { value: 'UNKNOWN', label: 'Unknown (the contract is silent)' },
                      { value: 'MEDICARE_POOLED', label: 'Pooled, as Medicare counts them' },
                      { value: 'PER_CODE', label: 'Counted per code' },
                    ]}
                  />
                  <SelectField
                    label="Rounding"
                    name="rounding"
                    options={[
                      { value: '', label: 'The contract is silent (the practice’s default)' },
                      { value: 'HALF_UP_CENT', label: 'Half up to the cent' },
                      { value: 'HALF_EVEN_CENT', label: 'Half even to the cent' },
                      { value: 'TRUNCATE', label: 'Truncate to the cent' },
                    ]}
                  />
                  <Field label="Applies from (optional)" name="scopeFrom" type="date" />
                  <Field label="Applies through (optional)" name="scopeLastDay" type="date" />
                  <SelectField label="Cited document" name="documentId" id="record-document" options={documents.map((document) => ({ value: document.id, label: documentLabel(document) }))} />
                  <Field label="Page" name="page" type="number" min={1} required />
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label htmlFor="field-quote" className="text-sm font-medium">
                      Quote
                    </label>
                    <textarea id="field-quote" name="quote" required maxLength={2000} rows={3} className="rounded-md border bg-background p-2 text-sm" />
                    <p className="text-xs text-muted-foreground">The exact words on the page the term comes from.</p>
                  </div>
                </ActionForm>
              )}
            </CardContent>
          </Card>
          <Card role="region" aria-label="The version's window">
            <CardHeader>
              <CardTitle>The version’s window and windows</CardTitle>
              <CardDescription>As the contract states them; they never change once the version is approved.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateVersionFormAction} submit="Save the version's dates" className="grid gap-3 md:grid-cols-2">
                {hidden()}
                <input type="hidden" name="versionId" value={version.id} />
                <Field label="Effective from" name="effectiveFrom" id="version-from" type="date" required defaultValue={version.effectiveFrom} />
                <Field label="Last day (optional)" name="lastDay" id="version-last-day" type="date" />
                <Field label="Timely filing (days)" name="timelyFilingDays" type="number" min={1} defaultValue={version.timelyFilingDays ?? undefined} />
                <Field label="Dispute window (days)" name="disputeWindowDays" type="number" min={1} defaultValue={version.disputeWindowDays ?? undefined} />
                <Field label="Notice before an anniversary (days)" name="noticeDays" type="number" min={1} defaultValue={version.noticeDays ?? undefined} />
              </ActionForm>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Approve the version">
            <CardHeader>
              <CardTitle>Approve version {version.versionNo}</CardTitle>
              <CardDescription>
                Once every rate record is verified and every citation still resolves to its page, approve the version; the practice then signs it off.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {review.records.length === 0 || review.unresolved > 0 ? (
                <p className="text-sm text-destructive">Blocked: {review.records.length === 0 ? 'the version has no rate record yet.' : `${String(review.unresolved)} record(s) are not verified or no longer resolve.`}</p>
              ) : (
                <ActionForm action={approveVersionFormAction} submit="Approve the version">
                  {hidden()}
                  <input type="hidden" name="versionId" value={version.id} />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
      {version.status === 'signed_off' ? (
        <Card role="region" aria-label="Amend the version">
          <CardHeader>
            <CardTitle>Amend version {version.versionNo}</CardTitle>
            <CardDescription>
              A signed-off version never changes. An amendment is a new version from a later date with copies of these terms to verify again; once it is signed off, this version’s
              window closes at the amendment’s start (CON-02).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={amendVersionFormAction} submit="Draft the amendment" className="grid gap-3 md:grid-cols-2">
              {hidden()}
              <input type="hidden" name="versionId" value={version.id} />
              <Field label="Amendment effective from" name="effectiveFrom" id="amend-from" type="date" required />
              <Field label="Last day (optional)" name="lastDay" id="amend-last-day" type="date" />
              <SelectField
                label="The amendment's document (optional)"
                name="documentId"
                id="amend-document"
                options={[{ value: '', label: 'None yet' }, ...documents.map((document) => ({ value: document.id, label: documentLabel(document) }))]}
              />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      {version.status === 'signed_off' || version.status === 'approved' ? (
        <Card role="region" aria-label="Correct the version">
          <CardHeader>
            <CardTitle>Correct version {version.versionNo}</CardTitle>
            <CardDescription>A correction is a new version that, once signed off, supersedes this one from its start; this one stays as it was, read-only (CON-03).</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={supersedeVersionFormAction} submit="Draft the correction" className="grid gap-3 md:grid-cols-2">
              {hidden()}
              <input type="hidden" name="versionId" value={version.id} />
              <Field label="Effective from (optional)" name="effectiveFrom" id="correct-from" type="date" hint={`Blank keeps ${version.effectiveFrom}.`} />
              <Field label="Last day (optional)" name="lastDay" id="correct-last-day" type="date" />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      <Card role="region" aria-label="Ask the practice">
        <CardHeader>
          <CardTitle>Ask the practice</CardTitle>
          <CardDescription>When a page is missing, the fee schedule is not attached or a method is undefined, ask for what to obtain; the question shows on the practice’s Contracts and Coverage screens.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ActionForm action={askQuestionFormAction} submit="Ask the question" className="grid max-w-xl gap-3">
            {hidden()}
            <input type="hidden" name="contractId" value={version.contractId} />
            <input type="hidden" name="versionId" value={version.id} />
            <SelectField label="Topic" name="topic" options={QUESTION_TOPICS.map((topic) => ({ value: topic, label: TOPIC_NAMES[topic] }))} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="field-question" className="text-sm font-medium">
                Question
              </label>
              <textarea id="field-question" name="question" required maxLength={2000} rows={3} className="rounded-md border bg-background p-2 text-sm" />
              <p className="text-xs text-muted-foreground">About the contract’s terms only; never a patient detail.</p>
            </div>
          </ActionForm>
          {questions.length === 0 ? null : (
            <QuestionList
              questions={questions}
              practiceId={practiceId}
              link={(question) => (question.versionId === null ? null : `/p/${practiceId}/abstraction/versions/${question.versionId}`)}
              answer={(question) => (
                <ActionForm action={withdrawQuestionFormAction} submit="Withdraw the question" variant="outline">
                  {hidden()}
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
