import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardHeader, CardTitle } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { windowText } from '../../lib/contracts/display';
import type { FieldReview, RecordReview, VersionReview } from '../../lib/contracts/review';
import { utc } from '../format';
import { Fact } from '../remittances/display';
import { CitationText, CitedPageView, VersionStatusBadge } from './display';
import { documentLabel } from './forms';

/**
 * The Rate record review screen's body (PRD 7: "side by side: cited page and the abstracted fields;
 * approval controls ... each field shows its quote and page; an unresolved field blocks
 * publication"), shared by the customer's view and the contract specialist's: the version's facts,
 * the cited page as text with the quote marked, and every rate record field by field with its
 * approval. The specialist's controls come in through the render props.
 */

export interface ReviewControls {
  /** A control beside each field (the specialist's approval). */
  readonly field?: (record: RecordReview, field: FieldReview) => ReactNode;
  /** Controls under each record (removing it). */
  readonly record?: (record: RecordReview) => ReactNode;
}

function windowsText(review: VersionReview): string {
  const { version } = review;
  const parts = [
    version.timelyFilingDays === null ? 'timely filing: the contract is silent' : `timely filing ${String(version.timelyFilingDays)} days`,
    version.disputeWindowDays === null ? 'dispute window: silent' : `dispute window ${String(version.disputeWindowDays)} days`,
    version.noticeDays === null ? 'no notice period' : `notice ${String(version.noticeDays)} days before an anniversary`,
  ];
  if (version.appealLevels.length > 0) {
    parts.push(`appeals ${version.appealLevels.map((level) => `level ${String(level.level)}: ${String(level.days)} days`).join(', ')}`);
  }
  return parts.join('; ');
}

/** What the version's state means for pricing, in words. */
export function VersionStateNotice({ review }: { readonly review: VersionReview }) {
  const { version } = review;
  const window = windowText(version.effectiveFrom, version.effectiveTo);
  switch (version.status) {
    case 'signed_off':
      return (
        <Alert data-state="pricing">
          <AlertTitle>Pricing uses this version</AlertTitle>
          <AlertDescription>
            Signed off: lines with service dates {window} under a plan mapped to this contract price under these rate records. It never changes; a new version amends or supersedes it.
          </AlertDescription>
        </Alert>
      );
    case 'superseded':
      return (
        <Alert data-state="superseded">
          <AlertTitle>Superseded: read-only</AlertTitle>
          <AlertDescription>A later version replaced this one. It stays as it was, and pricing runs made under it still open it.</AlertDescription>
        </Alert>
      );
    case 'approved':
      return (
        <Alert data-state="approved">
          <AlertTitle>Approved by the contract specialist, awaiting the practice’s sign-off</AlertTitle>
          <AlertDescription>Nothing prices under it until the practice administrator or billing manager signs it off.</AlertDescription>
        </Alert>
      );
    case 'draft':
    case 'proposed':
      return (
        <Alert data-state="abstraction">
          <AlertTitle>{version.status === 'proposed' ? 'Under review' : 'Being abstracted'}</AlertTitle>
          <AlertDescription>
            The contract specialist {version.status === 'proposed' ? 'is verifying a proposed abstraction' : 'is entering its rate records'} field by field against the cited pages.
            Nothing prices under it.
          </AlertDescription>
        </Alert>
      );
  }
}

export function VersionFacts({ review, versionHref }: { readonly review: VersionReview; readonly versionHref: (versionId: string) => string }) {
  const { version } = review;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
      <Fact label="Status">
        <VersionStatusBadge status={version.status} />
      </Fact>
      <Fact label="Effective">{windowText(version.effectiveFrom, version.effectiveTo)}</Fact>
      <Fact label="Windows">{windowsText(review)}</Fact>
      <Fact label="Approved">{version.approvedAt === null ? 'Not yet' : `${version.approvedBy ?? ''}, ${utc(version.approvedAt)}`}</Fact>
      <Fact label="Signed off">{version.signedOffAt === null ? 'Not yet' : `${version.signedOffBy ?? ''}, ${utc(version.signedOffAt)}`}</Fact>
      {version.supersedesId === null ? null : (
        <Fact label="Follows">
          <Link className="underline" href={versionHref(version.supersedesId)}>
            Version {version.supersedesNo}
          </Link>
        </Fact>
      )}
      {review.successors.length === 0 ? null : (
        <Fact label="Followed by">
          {review.successors.map((successor) => (
            <span key={successor.id} className="mr-2">
              <Link className="underline" href={versionHref(successor.id)}>
                Version {successor.versionNo}
              </Link>{' '}
              <VersionStatusBadge status={successor.status} />
            </span>
          ))}
        </Fact>
      )}
    </dl>
  );
}

export function ReviewBody({ review, href, controls }: { readonly review: VersionReview; readonly href: (query: Record<string, string>) => string; readonly controls?: ReviewControls }) {
  const { cited, records, documents } = review;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card role="region" aria-label="Cited page">
        <CardHeader>
          <CardTitle>The page</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">This version names no document yet.</p>
          ) : (
            <ul className="text-sm" aria-label="Documents">
              {documents.map((document) => (
                <li key={document.id}>
                  <Link className="underline" href={href({ document: document.id, page: '1' })}>
                    {documentLabel(document)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {cited === null ? null : <CitedPageView cited={cited} pageHref={(page) => href({ document: cited.documentId, page: String(page) })} />}
        </CardContent>
      </Card>
      <section aria-label="Rate records" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Rate records</h2>
        {review.unresolved > 0 ? (
          <Alert variant="destructive" data-state="blocked">
            <AlertTitle>Publication is blocked</AlertTitle>
            <AlertDescription>
              {review.unresolved} {review.unresolved === 1 ? 'record is' : 'records are'} not verified, or cite a page that no longer resolves. Every field of every record is approved against its
              cited page before the version can be approved.
            </AlertDescription>
          </Alert>
        ) : null}
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rate records yet.</p>
        ) : (
          records.map((record, index) => (
            <Card key={record.id} data-record={record.id} aria-label={`Rate record ${String(index + 1)}`} role="region">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  Record {index + 1}: {record.codes.join(', ')}
                  {record.verifiedBy === null ? <Badge variant="secondary">Not verified</Badge> : <Badge>Verified</Badge>}
                  {record.proposedBy === 'model' ? <Badge variant="outline">Proposed by the model</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <CitationText record={record} />
                {record.citation === null ? null : (
                  <Link className="text-sm underline" href={href({ record: record.id })}>
                    Show the cited page
                  </Link>
                )}
                <table className="w-full text-left text-sm" aria-label="Fields">
                  <tbody>
                    {record.fields.map((field) => (
                      <tr key={field.field} className="border-t align-top" data-field={field.field}>
                        <th scope="row" className="py-1 pr-3 font-medium whitespace-nowrap">
                          {field.label}
                        </th>
                        <td className="py-1 pr-3">{field.text}</td>
                        <td className="py-1 pr-3 text-xs whitespace-nowrap">
                          {field.approvedBy === null ? (
                            <span className="text-destructive">Not approved</span>
                          ) : (
                            <span>
                              Approved by {field.approvedBy}
                              {field.approvedAt === null ? '' : `, ${utc(field.approvedAt)}`}
                            </span>
                          )}
                        </td>
                        {controls?.field === undefined ? null : <td className="py-1">{controls.field(record, field)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {record.verifiedBy === null ? null : (
                  <p className="text-xs text-muted-foreground">
                    Verified by {record.verifiedBy}
                    {record.verifiedAt === null ? '' : `, ${utc(record.verifiedAt)}`}.
                  </p>
                )}
                {controls?.record === undefined ? null : controls.record(record)}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

/** The review page's URL with a selection. */
export function reviewHref(path: string): (query: Record<string, string>) => string {
  return (query) => `${path}?${new URLSearchParams(query).toString()}`;
}
