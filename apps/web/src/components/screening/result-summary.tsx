import { type Cents, formatUsd } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import { counted } from '../../lib/copy/words';
import { MEDICARE_FIGURE_LABEL, MEDICARE_FIGURE_NOTE, SCREENING_INVESTIGATORY_NOTE } from '../../lib/screening/labels';
import { utc, utcDate } from '../format';

/**
 * A free screening's totals (Change Order 001, CO-04; reconciliation-001, D19 and D20): what the file held, what
 * the Medicare fee schedule prices (its figure labelled "before the reduction across codes"), the dollars that cannot
 * be priced without a contract, and the rows a screening does not price or could not. Every figure is the database's
 * own bigint sum of the engine's per-row results; nothing here adds, rounds or estimates. A screening never says
 * owed, underpaid or recovered: the prospect's figure is "allowed in your file", and what lies between is the
 * difference. Each figure renders in the mono face with tabular numerals.
 */

/** Rows, their claim lines and what the file says was allowed for them. */
export interface ScreeningGroupTotals {
  readonly rows: number;
  readonly claimLines: number;
  readonly observedCents: Cents;
}

export interface ScreeningPricedTotals extends ScreeningGroupTotals {
  readonly expectedCents: Cents;
  /** Expected less allowed: above zero, the file's allowed total is below the Medicare figure. */
  readonly differenceCents: Cents;
}

export interface ScreeningSummaryData extends ScreeningGroupTotals {
  readonly practiceName: string;
  readonly state: string;
  readonly zip: string;
  readonly releaseNo: number;
  readonly engineVersion: string;
  readonly createdAt: Date | string;
  readonly expiresAt: Date | string;
  readonly priced: ScreeningPricedTotals;
  /** Medicare Advantage under contract and commercial rows (decision D20 a). */
  readonly contractRequired: ScreeningGroupTotals;
  /** Medicaid and other rows. */
  readonly notScreened: ScreeningGroupTotals;
  /** Medicare rows the engine left unpriced, or whose rates change inside the quarter. */
  readonly couldNotPrice: ScreeningGroupTotals;
}

/** A dollar figure: the mono face, tabular numerals. */
export function ScreeningMoney({ cents, className }: { readonly cents: Cents; readonly className?: string }) {
  return <span className={['font-mono tabular-nums', className].filter(Boolean).join(' ')}>{formatUsd(cents)}</span>;
}

/** A count: the mono face, tabular numerals. */
export function ScreeningCount({ value }: { readonly value: number }) {
  return <span className="font-mono tabular-nums">{value.toLocaleString('en-US')}</span>;
}

/** Which side of the Medicare figure the file's allowed total sits, in words, never by color alone. */
export function differenceWords(difference: Cents): string {
  if (difference > 0n) {
    return 'below the Medicare figure';
  }
  if (difference < 0n) {
    return 'above the Medicare figure';
  }
  return 'equal to the Medicare figure';
}

function Stat({ label, children, slot }: { readonly label: string; readonly children: ReactNode; readonly slot: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-figure={slot}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

function GroupStats({ group, slot }: { readonly group: ScreeningGroupTotals; readonly slot: string }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat label="Rows" slot={`${slot}-rows`}>
        <ScreeningCount value={group.rows} />
      </Stat>
      <Stat label="Claim lines" slot={`${slot}-claim-lines`}>
        <ScreeningCount value={group.claimLines} />
      </Stat>
      <Stat label="Allowed in your file" slot={`${slot}-allowed`}>
        <ScreeningMoney cents={group.observedCents} />
      </Stat>
    </dl>
  );
}

/** Who the screening is for, under which release, and until when the link opens it. */
export function ScreeningHeading({ summary }: { readonly summary: ScreeningSummaryData }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Your free screening</h1>
      <p className="text-base text-muted-foreground">
        <span data-copy="practice">{summary.practiceName}</span>, {summary.state} <span className="font-mono tabular-nums">{summary.zip}</span>. Screened {utc(summary.createdAt)} under rule release{' '}
        <span className="font-mono tabular-nums">{summary.releaseNo}</span> (engine <span className="font-mono">{summary.engineVersion}</span>). This link opens it until {utcDate(summary.expiresAt)}, and then the result is deleted.
      </p>
    </div>
  );
}

/** The file's totals, the Medicare-priced figures, and the dollars that cannot be priced without a contract. */
export function ScreeningSummary({ summary }: { readonly summary: ScreeningSummaryData }) {
  const { priced } = summary;
  return (
    <section aria-labelledby="screening-totals" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle id="screening-totals">Your file</CardTitle>
          <CardDescription>Every row of the upload, whatever its payer product.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupStats group={summary} slot="file" />
        </CardContent>
      </Card>
      <Card data-section="priced">
        <CardHeader>
          <CardTitle>Priced under Medicare</CardTitle>
          <CardDescription>
            Original Medicare and Medicare Advantage rows without a contract: {counted(priced.rows, 'row')}, {counted(priced.claimLines, 'claim line')}. {MEDICARE_FIGURE_NOTE}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={MEDICARE_FIGURE_LABEL} slot="priced-expected">
              <ScreeningMoney cents={priced.expectedCents} />
            </Stat>
            <Stat label="Allowed in your file" slot="priced-allowed">
              <ScreeningMoney cents={priced.observedCents} />
            </Stat>
            <Stat label="Difference" slot="priced-difference">
              <ScreeningMoney cents={priced.differenceCents} />
              <span className="block text-xs font-normal text-muted-foreground">Allowed in your file is {differenceWords(priced.differenceCents)} in total.</span>
            </Stat>
          </dl>
        </CardContent>
      </Card>
      <Card data-section="contract-required">
        <CardHeader>
          <CardTitle>Cannot be priced without a contract</CardTitle>
          <CardDescription>Medicare Advantage rows under a contract and commercial rows are priced by their contracts, which a screening does not have. An audit prices them under your signed contracts.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupStats group={summary.contractRequired} slot="contract-required" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card data-section="could-not-price">
          <CardHeader>
            <CardTitle>Could not be priced</CardTitle>
            <CardDescription>Medicare rows the engine left without a price, or whose rates change inside the quarter; the reasons are under coverage below.</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupStats group={summary.couldNotPrice} slot="could-not-price" />
          </CardContent>
        </Card>
        <Card data-section="not-screened">
          <CardHeader>
            <CardTitle>Not screened</CardTitle>
            <CardDescription>Medicaid and other rows: a screening does not price them.</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupStats group={summary.notScreened} slot="not-screened" />
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground" data-copy="investigatory">
        {SCREENING_INVESTIGATORY_NOTE}
      </p>
    </section>
  );
}
