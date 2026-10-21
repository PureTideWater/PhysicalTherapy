import { type Cents, formatUsd } from '@tp/money';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import { counted } from '../../lib/copy/words';
import {
  BEFORE_REDUCTION_FIGURE,
  DIFFERENCE_LABEL,
  MEDICARE_FIGURE_LABEL,
  MEDICARE_FIGURE_NOTE,
  REDUCED_DIFFERENCE_LABEL,
  REDUCED_FIGURE,
  REDUCED_FIGURE_LABEL,
  SCREENING_INVESTIGATORY_NOTE,
  leftOutNote,
} from '../../lib/screening/labels';
import { type KeptWith, resultRetention } from '../../lib/screening/retention';
import { utc, utcDate } from '../format';

/**
 * A free screening's totals (Change Order 001, CO-04; reconciliation-001, D19 and D20; the owner's rulings of
 * 2026-10-18): what the file held, what the Medicare fee schedule prices (its figure labelled "before the reduction
 * across codes", and, when a row's code is in that reduction, the total with those rows fully reduced across codes,
 * labelled so; every figure before sequestration), the dollars that cannot be priced without a contract, and the rows
 * a screening does not price or could not, and the rows of fewer than 11 claim lines the browser left out before
 * sending (as it counted them, apart from every figure). Every figure is the database's own bigint sum of the engine's
 * per-row results; nothing here adds, rounds or estimates. A screening never says
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
  /** Expected less allowed: above zero, the file's allowed total is below the figure before the reduction across codes. */
  readonly differenceCents: Cents;
  /** Rows of a code in the reduction across codes. */
  readonly pooledRows: number;
  /** The lowest figures: those rows fully reduced, the others at their one figure. */
  readonly reducedCents: Cents;
  /** The lowest figures less allowed. */
  readonly reducedDifferenceCents: Cents;
}

export interface ScreeningSummaryData extends ScreeningGroupTotals {
  readonly practiceName: string;
  readonly state: string;
  readonly zip: string;
  readonly releaseNo: number;
  readonly engineVersion: string;
  readonly createdAt: Date | string;
  readonly expiresAt: Date | string;
  /** The rule release it was priced under has since been withdrawn. */
  readonly releaseWithdrawn: boolean;
  /** What this screening's summary is kept with, as the database says (screening_result_summary's kept_with). */
  readonly keptWith: KeptWith;
  readonly priced: ScreeningPricedTotals;
  /** Medicare Advantage under contract and commercial rows (decision D20 a). */
  readonly contractRequired: ScreeningGroupTotals;
  /** Medicaid and other rows. */
  readonly notScreened: ScreeningGroupTotals;
  /** Medicare rows the engine left unpriced, or whose rates change inside the quarter. */
  readonly couldNotPrice: ScreeningGroupTotals;
  /** Rows of fewer than 11 claim lines the browser left out before sending: in no other figure. */
  readonly leftOut: ScreeningGroupTotals;
}

/** A dollar figure: the mono face, tabular numerals. */
export function ScreeningMoney({ cents, className }: { readonly cents: Cents; readonly className?: string }) {
  return <span className={['font-mono tabular-nums', className].filter(Boolean).join(' ')}>{formatUsd(cents)}</span>;
}

/** A count: the mono face, tabular numerals. */
export function ScreeningCount({ value }: { readonly value: number }) {
  return <span className="font-mono tabular-nums">{value.toLocaleString('en-US')}</span>;
}

/**
 * Which side of a figure an allowed total sits, in words, never by color alone. The figure is named, since a code in
 * the reduction across codes has two: the figure before the reduction across codes, or the fully reduced figure.
 */
export function differenceWords(difference: Cents, figure: string): string {
  if (difference > 0n) {
    return `below ${figure}`;
  }
  if (difference < 0n) {
    return `above ${figure}`;
  }
  return `equal to ${figure}`;
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

/**
 * Who the screening is for, under which release, until when the link opens it, and what is kept after it closes
 * (audit #57; the founder's rulings of 2026-10-20, decisions 7, 17 and 18: the plain list). What its summary is kept
 * with comes from the database: nothing, the audit request made from it, or an earlier screening's request of the same
 * practice name and ZIP code that it took over (then the prospect is told their details are kept with that request).
 * A legal surface counsel reviews before the screening opens (docs/product/legal-surfaces.md, screening-kept-result).
 */
export function ScreeningHeading({ summary, converted = false }: { readonly summary: ScreeningSummaryData; readonly converted?: boolean }) {
  const until = utcDate(summary.expiresAt);
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Your free screening</h1>
      <p className="text-base text-muted-foreground">
        <span data-copy="practice">{summary.practiceName}</span>, {summary.state} <span className="font-mono tabular-nums">{summary.zip}</span>. Screened {utc(summary.createdAt)} under rule release{' '}
        <span className="font-mono tabular-nums">{summary.releaseNo}</span> (engine <span className="font-mono">{summary.engineVersion}</span>).
      </p>
      <p className="text-sm text-muted-foreground" data-copy={converted ? 'kept-converted' : 'kept'} data-kept-with={summary.keptWith} data-legal-surface="screening-kept-result">
        {resultRetention(until, summary.keptWith, converted)}
      </p>
    </div>
  );
}

/** A notice, above everything, when the rule release the screening was priced under has since been withdrawn. */
export function ScreeningReleaseWithdrawn({ summary }: { readonly summary: ScreeningSummaryData }) {
  if (!summary.releaseWithdrawn) {
    return null;
  }
  return (
    <Alert variant="destructive" data-state="release-withdrawn">
      <AlertTitle>The rule release behind these figures was withdrawn</AlertTitle>
      <AlertDescription>
        Rule release <span className="font-mono tabular-nums">{summary.releaseNo}</span> was withdrawn after this screening was priced: its content was found to be wrong, so the Medicare figures below may be too. Screen the file again for figures under the release in force.
      </AlertDescription>
    </Alert>
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
          <CardDescription>Every row sent, whatever its payer product.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupStats group={summary} slot="file" />
        </CardContent>
      </Card>
      {summary.leftOut.rows === 0 ? null : (
        <Card data-section="left-out">
          <CardHeader>
            <CardTitle>Left out before sending</CardTitle>
            <CardDescription>{leftOutNote(summary.leftOut.rows)}</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupStats group={summary.leftOut} slot="left-out" />
          </CardContent>
        </Card>
      )}
      <Card data-section="priced">
        <CardHeader>
          <CardTitle>Priced under Medicare</CardTitle>
          <CardDescription>
            Original Medicare and Medicare Advantage rows without a contract: {counted(priced.rows, 'row')}, {counted(priced.claimLines, 'claim line')}. {MEDICARE_FIGURE_NOTE}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={MEDICARE_FIGURE_LABEL} slot="priced-expected">
              <ScreeningMoney cents={priced.expectedCents} />
            </Stat>
            <Stat label="Allowed in your file" slot="priced-allowed">
              <ScreeningMoney cents={priced.observedCents} />
            </Stat>
            <Stat label={DIFFERENCE_LABEL} slot="priced-difference">
              <ScreeningMoney cents={priced.differenceCents} />
              <span className="block text-xs font-normal text-muted-foreground">Allowed in your file is {differenceWords(priced.differenceCents, BEFORE_REDUCTION_FIGURE)} in total.</span>
            </Stat>
          </dl>
          {priced.pooledRows === 0 ? null : (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-figures="fully-reduced">
              <Stat label={REDUCED_FIGURE_LABEL} slot="priced-reduced">
                <ScreeningMoney cents={priced.reducedCents} />
                <span className="block text-xs font-normal text-muted-foreground">
                  {counted(priced.pooledRows, 'row')} of a code in the reduction across codes fully reduced; the others at their one figure.
                </span>
              </Stat>
              <Stat label="Allowed in your file" slot="priced-reduced-allowed">
                <ScreeningMoney cents={priced.observedCents} />
              </Stat>
              <Stat label={REDUCED_DIFFERENCE_LABEL} slot="priced-reduced-difference">
                <ScreeningMoney cents={priced.reducedDifferenceCents} />
                <span className="block text-xs font-normal text-muted-foreground">Allowed in your file is {differenceWords(priced.reducedDifferenceCents, REDUCED_FIGURE)} in total.</span>
              </Stat>
            </dl>
          )}
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
