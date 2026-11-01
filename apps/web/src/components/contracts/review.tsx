import { type DisputeWindowRule, windowRuleText } from '@tp/contracts';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardHeader, CardTitle } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { WINDOW_RULE_NOT_COMPUTED_TEXT, windowRuleComparison, windowText } from '../../lib/contracts/display';
import type { FieldReview, RecordReview, VersionReview } from '../../lib/contracts/review';
import { UtcTime } from '../dates';
import { utc } from '../format';
import { Fact } from '../remittances/display';
import { ScrollTable } from '../scroll-table';
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
    version.disputeWindowDays === null
      ? 'dispute window: silent'
      : version.disputeWindow?.rule === null || version.disputeWindow?.rule === undefined
        ? `dispute window of ${String(version.disputeWindowDays)}, its unit and start not cited yet`
        : `dispute window: it ${windowRuleText(version.disputeWindowDays, version.disputeWindow.rule)}`,
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

/**
 * The rule a cited window states beside the rule the product computes for its days (best-option audit #5): "Cited:
 * ends 180 calendar days after the date of service", "Computed: ends 180 calendar days after the payment date",
 * and whether they are the same rule. Only a window whose cited rule is the computed one can be checked and verify
 * its lines' deadlines; any other stays unverified (its lines wait), and its version can still be approved.
 */
export function DisputeWindowRuleText({ days, rule, id }: { readonly days: number; readonly rule: DisputeWindowRule | null; readonly id?: string }) {
  const comparison = windowRuleComparison(days, rule);
  return (
    <span id={id} className="flex flex-col gap-0.5" data-window-rule={comparison.matches ? 'computed' : 'not_computed'}>
      <span>
        <span className="font-medium">Cited:</span> {comparison.cited ?? 'no unit or start is recorded with the citation'}
      </span>
      <span>
        <span className="font-medium">Computed:</span> {comparison.computed}
      </span>
      {comparison.matches ? (
        <span>The same rule: the product computes the window the contract states.</span>
      ) : (
        <span className="text-destructive">Not the same rule. {WINDOW_RULE_NOT_COMPUTED_TEXT}</span>
      )}
    </span>
  );
}

/**
 * Whether the version's dispute window is cited and checked against its page (D17 a): only a checked window of a
 * signed-off version verifies its lines' deadlines; an uncited or unchecked window leaves them unverified, and its
 * lines not actionable. The check reads as a rate record's does, "Checked against", never "Verified", which the
 * brand keeps for the ledger-gated seal (docs/adr/0056; the data's status stays verified in code, CO-12).
 */
export function DisputeWindowText({ review }: { readonly review: VersionReview }) {
  const { version } = review;
  if (version.disputeWindowDays === null) {
    return <>The contract is silent: the release’s default window applies, and it is never verified.</>;
  }
  const window = version.disputeWindow;
  if (window === null) {
    return <span data-window="uncited">Not cited: its lines’ deadlines are not verified.</span>;
  }
  const document = review.documents.find((candidate) => candidate.id === window.documentId);
  const where = `page ${String(window.page)}${document === undefined ? '' : ` of ${documentLabel(document)}`}`;
  return (
    <span className="flex flex-col gap-1">
      {window.verifiedAt === null ? (
        <span data-window="unverified">
          Cited on {where}, not checked yet: <q className="italic">{window.quote}</q>
        </span>
      ) : (
        <span data-window="verified">
          Checked against {where} by {window.verifiedBy ?? 'the contract specialist'}, {utc(window.verifiedAt)}: <q className="italic">{window.quote}</q>
        </span>
      )}
      <DisputeWindowRuleText days={version.disputeWindowDays} rule={window.rule} />
    </span>
  );
}

export function VersionFacts({ review, versionHref }: { readonly review: VersionReview; readonly versionHref: (versionId: string) => string }) {
  const { version } = review;
  return (
    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
      <Fact label="Status">
        <VersionStatusBadge status={version.status} />
      </Fact>
      <Fact label="Effective">{windowText(version.effectiveFrom, version.effectiveTo)}</Fact>
      <Fact label="Windows">{windowsText(review)}</Fact>
      <Fact label="Dispute window">
        <DisputeWindowText review={review} />
      </Fact>
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

/**
 * A record's table of fields, named after its card ("Rate record N"), so no two records' tables share a name. The
 * table takes no min-w: two columns, the field and its terms with their approval under them, in a card half the grid's
 * width from xl (about 418 px at 1280), which the smallest width of docs/adr/0078 (32rem) would pass, and on a phone.
 */
const fieldsLabel = (index: number) => `Fields of rate record ${String(index + 1)}`;

export function ReviewBody({ review, href, controls }: { readonly review: VersionReview; readonly href: (query: Record<string, string>) => string; readonly controls?: ReviewControls }) {
  const { cited, records, documents } = review;
  return (
    // Each column may shrink to its track (min-w-0), so nothing in one widens the page; a record's table of fields
    // scrolls inside its card if it must, as the app's other wide tables do.
    <div className="grid gap-6 xl:grid-cols-2">
      <Card role="region" aria-label="Cited page" className="min-w-0">
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
      <section aria-label="Rate records" className="flex min-w-0 flex-col gap-3">
        <h2 className="text-xl font-bold tracking-display">Rate records</h2>
        {review.unresolved > 0 ? (
          <Alert variant="destructive" data-state="blocked">
            <AlertTitle>Publication is blocked</AlertTitle>
            <AlertDescription>
              {review.unresolved} {review.unresolved === 1 ? 'record is' : 'records are'} not checked against the cited page yet, or cite a page that no longer resolves. Every field of every record is approved against its
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
                  Record {index + 1}: {record.codes === null ? 'every code' : record.codes.join(', ')}
                  {/* "Verified" is the brand's word for the ledger-gated seal alone (docs/brand/BRAND.md, section 6): a record's check is named for what it is. */}
                  {record.verifiedBy === null ? <Badge variant="secondary">Not checked</Badge> : <Badge>Fields checked</Badge>}
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
                <ScrollTable label={fieldsLabel(index)}>
                  <table className="w-full text-left text-sm" aria-label={fieldsLabel(index)}>
                    <tbody>
                      {record.fields.map((field) => (
                        <tr key={field.field} className="border-t align-top" data-field={field.field}>
                          <th scope="row" className="py-1 pr-3 font-medium whitespace-nowrap">
                            {field.label}
                          </th>
                          <td className="py-1 pr-3">
                            {/* The terms wrap between their words. The approval stands under them, so the two columns fit a phone; its date and its time stay whole, and only an approver wider than 8rem breaks. */}
                            {field.text}
                            <div className="min-w-32 pt-1 text-xs wrap-anywhere" data-approval>
                              {field.approvedBy === null ? (
                                <span className="text-destructive">Not approved</span>
                              ) : (
                                <>
                                  Approved by {field.approvedBy}
                                  {field.approvedAt === null ? null : (
                                    <>
                                      , <UtcTime at={field.approvedAt} />
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          {controls?.field === undefined ? null : <td className="py-1">{controls.field(record, field)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollTable>
                {record.verifiedBy === null ? null : (
                  <p className="text-xs text-muted-foreground">
                    Fields checked against the cited page by {record.verifiedBy}
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
