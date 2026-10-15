import { type EvidenceResolution, type EvidenceResolver, RATE_RECORD_FIELDS, type RateRecord, type RateRecordField } from '@tp/contracts';
import { type PracticeScope, type ScopeClient, loadPracticeCipher } from '@tp/db/runtime';

import type { Services } from '../server/services';
import { type DocumentSummary, type VersionSummary, versionDetail } from './contract-queries';
import { EVIDENCE_PROBLEM_TEXT, FIELD_NAMES, describeTerms } from './display';
import { evidenceFor } from './evidence';
import { type PageSegment, highlightQuote } from './highlight';

/**
 * The Rate record review screen's data (PRD 7: "side by side: cited page and the abstracted fields;
 * approval controls ... each field shows its quote and page; an unresolved field blocks
 * publication"), for the customer's view and the contract specialist's alike: every rate record of a
 * version with each field in words and its approval, its citation and whether that citation resolves
 * to its page now (CON-04, CON-05), and one page of the version's documents as text, with the selected
 * record's quote marked on it.
 */

export interface FieldReview {
  readonly field: RateRecordField;
  readonly label: string;
  readonly text: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export interface RecordReview {
  readonly id: string;
  readonly proposedBy: RateRecord['proposedBy'];
  readonly codes: readonly string[];
  readonly fields: readonly FieldReview[];
  readonly citation: { readonly documentId: string; readonly page: number; readonly quote: string } | null;
  /** Whether the citation resolves to its page now, and why not. */
  readonly evidence: { readonly resolved: boolean; readonly problem: string | null };
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
}

export interface CitedPage {
  readonly documentId: string;
  readonly page: number;
  readonly pageCount: number;
  readonly segments: readonly PageSegment[];
  /** The record whose quote is marked, if any. */
  readonly recordId: string | null;
  readonly quoteFound: boolean;
  /** Why the page cannot be shown. */
  readonly problem: string | null;
}

export interface VersionReview {
  readonly version: VersionSummary;
  readonly successors: readonly VersionSummary[];
  readonly siblings: readonly VersionSummary[];
  readonly documents: readonly DocumentSummary[];
  readonly records: readonly RecordReview[];
  readonly cited: CitedPage | null;
  /** Records that block publication: not verified, or whose citation no longer resolves. */
  readonly unresolved: number;
}

export interface PageSelection {
  readonly record?: string;
  readonly document?: string;
  readonly page?: number;
}

function problemText(resolution: EvidenceResolution): string | null {
  return resolution.resolved ? null : EVIDENCE_PROBLEM_TEXT[resolution.problem];
}

function recordReview(record: RateRecord, evidence: EvidenceResolution, people: ReadonlyMap<string, string>): RecordReview {
  const words = describeTerms(record.terms);
  const name = (userId: string) => people.get(userId) ?? 'the contract specialist';
  return {
    id: record.id,
    proposedBy: record.proposedBy,
    codes: record.terms.scope.codes,
    fields: RATE_RECORD_FIELDS.map((field) => {
      const approval = record.approvals[field];
      return { field, label: FIELD_NAMES[field], text: words[field], approvedBy: approval === undefined ? null : name(approval.by), approvedAt: approval?.at ?? null };
    }),
    citation: record.citation === null ? null : { documentId: record.citation.document_id, page: record.citation.page, quote: record.citation.quote },
    evidence: { resolved: evidence.resolved, problem: problemText(evidence) },
    verifiedBy: record.verifiedBy === null ? null : name(record.verifiedBy),
    verifiedAt: record.verifiedAt,
  };
}

async function citedPage(resolver: EvidenceResolver, documentIds: readonly string[], documentId: string, page: number, record: RecordReview | null): Promise<CitedPage> {
  const empty = { documentId, page, pageCount: 0, segments: [], recordId: record?.id ?? null, quoteFound: false };
  if (!documentIds.includes(documentId)) {
    return { ...empty, problem: EVIDENCE_PROBLEM_TEXT.document_not_in_version };
  }
  const pages = await resolver.pages(documentId);
  if (!pages.ok) {
    return { ...empty, problem: EVIDENCE_PROBLEM_TEXT[pages.problem] };
  }
  const text = pages.pages[page - 1];
  if (text === undefined) {
    return { ...empty, pageCount: pages.pages.length, problem: EVIDENCE_PROBLEM_TEXT.page_missing };
  }
  const highlighted = highlightQuote(text, record?.citation?.quote ?? null);
  return { documentId, page, pageCount: pages.pages.length, segments: highlighted.segments, recordId: record?.id ?? null, quoteFound: highlighted.found, problem: null };
}

/** The review of one version, with the page the selection names (the selected record's cited page by default). */
export async function versionReview(scope: PracticeScope<ScopeClient>, services: Services, practiceId: string, versionId: string, requestId: string, selection: PageSelection): Promise<VersionReview | undefined> {
  const detail = await versionDetail(scope, practiceId, versionId, requestId);
  if (detail === undefined) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, services.keys, practiceId);
  const resolver = evidenceFor(scope, services.documents, cipher, practiceId, requestId);
  const documentIds = detail.version.sourceDocumentIds;
  const records: RecordReview[] = [];
  for (const record of detail.records) {
    records.push(recordReview(record, await resolver.resolve(record.citation, documentIds), detail.people));
  }
  const selected = records.find((record) => record.id === selection.record && record.citation !== null);
  const first = records.find((record) => record.citation !== null);
  const shown = selected ?? (selection.document === undefined ? first : undefined);
  let cited: CitedPage | null;
  if (shown?.citation !== undefined && shown.citation !== null) {
    cited = await citedPage(resolver, documentIds, shown.citation.documentId, shown.citation.page, shown);
  } else {
    const documentId = selection.document ?? documentIds[0];
    cited = documentId === undefined ? null : await citedPage(resolver, documentIds, documentId, selection.page ?? 1, null);
  }
  return {
    version: detail.version,
    successors: detail.successors,
    siblings: detail.siblings,
    documents: detail.documents,
    records,
    cited,
    unresolved: records.filter((record) => record.verifiedBy === null || !record.evidence.resolved).length,
  };
}
