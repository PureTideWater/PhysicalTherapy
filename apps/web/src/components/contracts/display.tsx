import type { MappingKind, VersionStatus } from '@tp/db/runtime';
import { Badge } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { MAPPING_KIND_NAMES, TOPIC_NAMES, VERSION_STATUS_NAMES, windowText } from '../../lib/contracts/display';
import type { QuestionView } from '../../lib/contracts/contract-queries';
import type { CitedPage, RecordReview } from '../../lib/contracts/review';
import type { MappingView, Totals } from '../../lib/contracts/mapping-queries';
import { WholeDates } from '../dates';
import { utc } from '../format';
import { Money } from '../remittances/display';
import { ScrollBox } from '../scroll-table';

/**
 * Display pieces of the mapping, contract, review and coverage screens (PRD 7). Money from integer
 * cents as text; windows with their last day; states in the plan's words.
 */

const STATUS_VARIANT: Readonly<Record<VersionStatus, 'default' | 'secondary' | 'outline' | 'destructive'>> = {
  draft: 'outline',
  proposed: 'secondary',
  approved: 'secondary',
  signed_off: 'default',
  superseded: 'outline',
};

export function VersionStatusBadge({ status }: { readonly status: VersionStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} data-status={status}>
      {VERSION_STATUS_NAMES[status]}
    </Badge>
  );
}

/** Lines, claims and dollars, billed and paid. */
export function TotalsText({ totals }: { readonly totals: Totals }) {
  return (
    <span>
      {totals.lines} {totals.lines === 1 ? 'line' : 'lines'} on {totals.claims} {totals.claims === 1 ? 'claim' : 'claims'}: <Money value={totals.chargeCents} /> billed, <Money value={totals.paidCents} /> paid
    </span>
  );
}

/** A mapping in words: its kind (and version) and its window. */
export function MappingText({ practiceId, kind, mapping }: { readonly practiceId: string; readonly kind: MappingKind; readonly mapping: MappingView }) {
  return (
    <span>
      {kind === 'contract' && mapping.version !== null ? (
        <>
          <Link className="underline" href={`/p/${practiceId}/contracts/versions/${mapping.version.versionId}`}>
            {mapping.version.contractTitle}, version {mapping.version.versionNo}
          </Link>{' '}
          <VersionStatusBadge status={mapping.version.status} />
        </>
      ) : (
        MAPPING_KIND_NAMES[kind]
      )}
      <span className="text-muted-foreground">
        {' · '}
        <WholeDates text={windowText(mapping.effectiveFrom, mapping.effectiveTo)} />
      </span>
    </span>
  );
}

/**
 * The cited page as text, with the quote marked (PRD 7, Rate record review), in a box that scrolls down and that the
 * keyboard reaches (ScrollBox). No landmark of its own: the card it sits in is the "Cited page" region, and two of one
 * name tell a screen reader's list of landmarks nothing (axe's landmark-unique).
 */
export function CitedPageView({ cited, pageHref }: { readonly cited: CitedPage; readonly pageHref: (page: number) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Document {cited.documentId.slice(0, 8)}, page {cited.page}
          {cited.pageCount > 0 ? ` of ${String(cited.pageCount)}` : ''}
        </span>
        {cited.pageCount > 1 ? (
          <span className="flex gap-3">
            {cited.page > 1 ? (
              <Link className="underline" href={pageHref(cited.page - 1)}>
                Previous page
              </Link>
            ) : null}
            {cited.page < cited.pageCount ? (
              <Link className="underline" href={pageHref(cited.page + 1)}>
                Next page
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
      {cited.problem !== null ? (
        <p className="text-sm text-destructive">{cited.problem}</p>
      ) : (
        <>
          {cited.recordId !== null && !cited.quoteFound ? <p className="text-sm text-destructive">The quote is not on this page.</p> : null}
          <ScrollBox label={`Page ${String(cited.page)} of the contract`} height="lg" tone="faint" as="div" data-page-text="">
            {cited.segments.map((segment, index) =>
              segment.quoted ? (
                <mark key={index} className="rounded-sm bg-bg-inset px-0.5 text-foreground underline decoration-fg-muted decoration-1 underline-offset-2">
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </ScrollBox>
        </>
      )}
    </div>
  );
}

/** A rate record's citation and whether it resolves now (CON-04, CON-05). */
export function CitationText({ record }: { readonly record: RecordReview }) {
  if (record.citation === null) {
    return <p className="text-sm text-destructive">No page is cited: the record cannot be approved (CON-04).</p>;
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        Page {record.citation.page} of document {record.citation.documentId.slice(0, 8)}: <q className="italic">{record.citation.quote}</q>
      </p>
      {record.evidence.resolved ? (
        <p className="text-xs text-muted-foreground">The quote is on the cited page, and the page is the one cited.</p>
      ) : (
        <p className="text-xs text-destructive">Does not resolve: {record.evidence.problem}</p>
      )}
    </div>
  );
}

/** The specialist's questions, with their answers. */
export function QuestionList({
  questions,
  practiceId,
  answer,
  link,
}: {
  readonly questions: readonly QuestionView[];
  readonly practiceId: string;
  readonly answer?: (question: QuestionView) => ReactNode;
  /** Where a question's contract opens (the customer's contract page by default); null for no link. */
  readonly link?: (question: QuestionView) => string | null;
}) {
  const href = link ?? ((question: QuestionView) => `/p/${practiceId}/contracts/${question.contractId}`);
  return (
    <ul className="flex flex-col gap-3" aria-label="Questions">
      {questions.map((question) => (
        <li key={question.id} className="rounded-md border p-3 text-sm" data-question={question.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={question.status === 'open' ? 'destructive' : 'outline'}>{question.status === 'open' ? 'Open' : question.status === 'answered' ? 'Answered' : 'Withdrawn'}</Badge>
            <span className="font-medium">{TOPIC_NAMES[question.topic]}</span>
            <span className="text-muted-foreground">
              ·{' '}
              {href(question) === null ? (
                question.contractTitle
              ) : (
                <Link className="underline" href={href(question) ?? ''}>
                  {question.contractTitle}
                </Link>
              )}
              {question.versionNo === null ? '' : `, version ${String(question.versionNo)}`}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{question.question}</p>
          <p className="text-xs text-muted-foreground">
            Asked by {question.askedBy}, {utc(question.askedAt)}
          </p>
          {question.answer === null ? null : (
            <p className="mt-1 whitespace-pre-wrap">
              <span className="font-medium">Answer:</span> {question.answer} <span className="text-xs text-muted-foreground">({question.closedBy}, {utc(question.closedAt)})</span>
            </p>
          )}
          {question.status === 'open' && answer !== undefined ? <div className="mt-2">{answer(question)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
