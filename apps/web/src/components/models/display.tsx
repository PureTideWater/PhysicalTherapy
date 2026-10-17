import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import type { ProposalView, StoredCandidate } from '../../lib/models/contract-proposals';
import type { ChecklistView } from '../../lib/models/evidence-checklist';
import type { DraftView } from '../../lib/models/narrative-drafts';
import { type ModelNotice, isModelProblem, modelNoticeText } from '../../lib/models/notices';
import { utc } from '../format';

/**
 * What the screens show of the model features (PRD 14; docs/adr/0052): the notice after a model step,
 * the contract proposals with each field's check against its cited page, the narrative drafts and the
 * coverage checklist. Each is a proposal a person verifies; none approves anything. The forms come in
 * through render props.
 */

export function ModelNoticeAlert({ notice }: { readonly notice: ModelNotice | null }) {
  if (notice === null) {
    return null;
  }
  const problem = isModelProblem(notice);
  return (
    <Alert data-state={problem ? 'model-hand-entry' : 'model-done'} data-model-notice={notice} variant={problem ? 'destructive' : 'default'}>
      <AlertTitle>{problem ? 'Nothing was proposed' : 'Model step recorded'}</AlertTitle>
      <AlertDescription>{modelNoticeText(notice)}</AlertDescription>
    </Alert>
  );
}

/** Said where a model feature would be, when it is off (the kill switch, no model path, MOD-06). */
export function HandEntryNotice({ what }: { readonly what: string }) {
  return (
    <p className="text-sm text-muted-foreground" data-state="model-off">
      Model proposals are off for this practice; {what} by hand.
    </p>
  );
}

const DECISION_TEXT: Readonly<Record<string, string>> = {
  accepted: 'Accepted as proposed',
  accepted_with_changes: 'Accepted with changes',
  rejected: 'Rejected',
};

export function decisionText(decision: string | null): string {
  return decision === null ? 'Awaiting review' : (DECISION_TEXT[decision] ?? decision);
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  method: 'Method',
  codes: 'Procedure codes',
  modifiers: 'Modifiers',
  places_of_service: 'Places of service',
  amount: 'Amount',
  percentage: 'Percentage',
  fee_schedule_year: 'Fee schedule year',
  flags: 'Medicare adjustments',
  rounding: 'Rounding',
  effective_from: 'Applies from',
  effective_to: 'Applies through',
};

const PROBLEM_NAMES: Readonly<Record<string, string>> = {
  page_missing: 'the cited page is not in the document',
  quote_not_on_page: 'the quote is not on the cited page',
  not_in_quote: 'the value is not in the quote',
  unreadable: 'the value cannot be read as written',
  fields_rejected: 'a field did not check against its page',
  terms_invalid: 'the fields do not make valid rate terms',
};

const writtenText = (written: StoredCandidate['fields'][number]['written']) => (written === null ? '' : Array.isArray(written) ? written.join(', ') : String(written));

function CandidateCard({ candidate, index }: { readonly candidate: StoredCandidate; readonly index: number }) {
  return (
    <Card role="region" aria-label={`Candidate ${String(index + 1)}`} data-candidate={index} data-verified={candidate.rateRecordId === null ? 'no' : 'yes'}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Candidate {index + 1}: {candidate.label}
          {candidate.rateRecordId === null ? <Badge variant="secondary">Held: enter it by hand</Badge> : <Badge variant="outline">Proposed as a rate record</Badge>}
        </CardTitle>
        {candidate.problems.length === 0 ? null : <CardDescription>Held because {candidate.problems.map((problem) => PROBLEM_NAMES[problem] ?? problem).join('; ')}.</CardDescription>}
        {candidate.conflictsWith.length === 0 ? null : <CardDescription>Its codes overlap candidate {candidate.conflictsWith.map((other) => String(other + 1)).join(', ')}: never merged; decide which applies.</CardDescription>}
      </CardHeader>
      <CardContent>
        <table className="w-full text-left text-sm" aria-label="Proposed fields">
          <thead>
            <tr>
              <th scope="col" className="pr-3">
                Field
              </th>
              <th scope="col" className="pr-3">
                As written
              </th>
              <th scope="col" className="pr-3">
                Page and quote
              </th>
              <th scope="col">Check against the page</th>
            </tr>
          </thead>
          <tbody>
            {candidate.fields.map((field) => (
              <tr key={field.field} className="border-t align-top" data-field={field.field} data-check={field.verified ? 'passed' : 'failed'}>
                <th scope="row" className="py-1 pr-3 font-medium whitespace-nowrap">
                  {FIELD_NAMES[field.field] ?? field.field}
                </th>
                <td className="py-1 pr-3">{writtenText(field.written)}</td>
                <td className="py-1 pr-3">
                  Page {field.page}: “{field.quote}”
                </td>
                <td className="py-1">{field.verified ? 'Found on the page' : field.problems.map((problem) => PROBLEM_NAMES[problem] ?? problem).join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** The version's contract proposals, each candidate's fields checked against their cited pages by code. */
export function ProposalList({ proposals, reject }: { readonly proposals: readonly ProposalView[]; readonly reject?: (proposal: ProposalView) => ReactNode }) {
  if (proposals.length === 0) {
    return null;
  }
  return (
    <section aria-label="Model proposals" className="flex flex-col gap-3">
      <h2 className="text-xl font-bold tracking-display">The model’s proposals</h2>
      <p className="text-sm text-muted-foreground">
        Code checked every field against its cited page. A candidate whose fields all checked is a rate record above, still to be approved field by field; a held candidate is entered by hand.
      </p>
      {proposals.map((proposal) => (
        <Card key={proposal.id} role="region" aria-label="Model proposal" data-proposal={proposal.id} data-decision={proposal.decision?.decision ?? 'awaiting'}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              Proposed {utc(proposal.createdAt)}
              <Badge variant={proposal.passed ? 'outline' : 'secondary'}>{proposal.passed ? 'Every field checked' : 'Some fields did not check'}</Badge>
              <Badge variant="secondary">{decisionText(proposal.decision?.decision ?? null)}</Badge>
            </CardTitle>
            {proposal.decision === null || proposal.decision.changedFields.length === 0 ? null : <CardDescription>Changed: {proposal.decision.changedFields.join(', ')}.</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {proposal.candidates.length === 0 ? <p className="text-sm text-muted-foreground">The model proposed no terms.</p> : null}
            {proposal.candidates.map((candidate, index) => (
              <CandidateCard key={`${proposal.id}:${String(index)}`} candidate={candidate} index={index} />
            ))}
            {proposal.reviewedAt === null && reject !== undefined ? reject(proposal) : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

/** Whether a packet version was drafted by the model, and how its check went. */
export function draftOf(drafts: readonly DraftView[], versionId: string): DraftView | undefined {
  return drafts.find((draft) => draft.versionId === versionId);
}

export function DraftBadge({ draft }: { readonly draft: DraftView | undefined }) {
  if (draft === undefined) {
    return null;
  }
  return (
    <Badge variant="outline" data-model-draft={draft.passed ? 'passed' : 'failed'}>
      Narrative drafted by the model{draft.decision === null ? '' : `: ${decisionText(draft.decision).toLowerCase()}`}
    </Badge>
  );
}

/** The model's checklist of documents to obtain: under review with the person's choices, or as kept. */
export function ChecklistCard({ checklist, review }: { readonly checklist: ChecklistView; readonly review?: (checklist: ChecklistView) => ReactNode }) {
  const kept = checklist.items.filter((item) => item.kept);
  return (
    <Card role="region" aria-label="Evidence checklist" data-checklist={checklist.id} data-decision={checklist.decision ?? 'awaiting'}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          What to obtain, suggested by the model
          <Badge variant="secondary">{decisionText(checklist.decision)}</Badge>
        </CardTitle>
        <CardDescription>
          Each item names one of the coverage gaps above; code left out {checklist.rejected} item{checklist.rejected === 1 ? '' : 's'} that named none. Suggested {utc(checklist.createdAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {checklist.decision === null && review !== undefined ? (
          review(checklist)
        ) : (
          <ul className="list-disc pl-5 text-sm" aria-label="Kept items">
            {kept.map((item) => (
              <li key={`${item.reason}:${item.document}`}>
                <span className="font-medium">{item.document}</span> ({item.reason}): {item.why}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
