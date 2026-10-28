import type { Cents } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import { type ScreeningDisposition, dispositionLabel, productLabel, unpricedReasonLabel } from '../../lib/screening/labels';
import { ScrollTable } from '../scroll-table';
import { type StackedRow, StackedRows } from '../stacked-rows';
import { type StatusTone, StatusChip } from '../status';
import { ALLOWED_IN_FILE, CLAIM_LINES, None, ScreeningCount, ScreeningMoney } from './result-summary';
import { ColumnCells, ColumnHeads, type ScreeningColumn, fieldsFrom } from './table-parts';

/**
 * A screening's coverage (Change Order 001, CO-04): every row of the file, by payer product and what the screening
 * could do with it: priced under Medicare, could not be priced (with its reason in words, the reason's code kept in
 * the row's hooks alone: UX-132), cannot be priced without a contract (Medicare Advantage under contract and
 * commercial; decision D20 a) or not screened (Medicaid and other). The missing-contract coverage is the contract rows'
 * share of the file. Counts and the file's own allowed totals, summed by the database; each outcome is a labelled chip,
 * never color alone. The table pairs with stacked rows for a phone (docs/adr/0078), each headed by its payer product
 * and outcome.
 */

export interface ScreeningCoverageRow {
  readonly payerProduct: string;
  readonly disposition: string;
  readonly unpricedReason: string | null;
  readonly unpricedDetail: string | null;
  readonly rows: number;
  readonly claimLines: number;
  readonly observedCents: Cents;
}

/** Unpriced's quiet tint for the rows without a figure; neutral otherwise (whole means paid in full, which a screening never says). */
const TONES: Readonly<Record<ScreeningDisposition, StatusTone>> = {
  priced: 'neutral',
  rates_change_in_band: 'unpriced',
  unpriced: 'unpriced',
  contract_required: 'unpriced',
  not_screened: 'neutral',
  pending: 'neutral',
};

function toneOf(disposition: string): StatusTone {
  return (TONES as Readonly<Record<string, StatusTone>>)[disposition] ?? 'neutral';
}

/** The share of the file's rows a group holds, as a whole percent computed from the two counts. */
function shareText(part: number, whole: number): string {
  if (whole === 0) {
    return '0%';
  }
  const percent = Math.round((part * 100) / whole);
  return percent === 0 && part > 0 ? 'under 1%' : `${String(percent)}%`;
}

/** The card's title, which also names its table (aria-labelledby), the table's scroller and the stacked list. */
const TITLE = 'Coverage, and the rows missing a contract';

/** The coverage table's columns, in its order: the file's own allowed amount the one figure. */
export const COVERAGE_COLUMNS = [
  { key: 'product', label: 'Payer product', naming: true },
  { key: 'outcome', label: 'Outcome', naming: true },
  { key: 'reason', label: 'Reason' },
  { key: 'rows', label: 'Rows', mono: true, numeric: true },
  { key: 'claimLines', label: CLAIM_LINES, mono: true, numeric: true },
  { key: 'allowed', label: ALLOWED_IN_FILE, figure: 'paid', numeric: true },
] as const satisfies readonly ScreeningColumn[];

type CoverageKey = (typeof COVERAGE_COLUMNS)[number]['key'];

/** A coverage row's cells, the same in both copies: its reason in words alone, or None. */
function coverageCells(entry: ScreeningCoverageRow): Readonly<Record<CoverageKey, ReactNode>> {
  return {
    product: productLabel(entry.payerProduct),
    outcome: <StatusChip tone={toneOf(entry.disposition)}>{dispositionLabel(entry.disposition)}</StatusChip>,
    reason: entry.unpricedReason === null ? <None /> : unpricedReasonLabel(entry.unpricedReason, entry.unpricedDetail),
    rows: <ScreeningCount value={entry.rows} />,
    claimLines: <ScreeningCount value={entry.claimLines} />,
    allowed: <ScreeningMoney cents={entry.observedCents} />,
  };
}

/** A row's key: a product holds several outcomes, and an outcome several reasons. */
function coverageKey(entry: ScreeningCoverageRow): string {
  return `${entry.payerProduct}:${entry.disposition}:${entry.unpricedReason ?? ''}:${entry.unpricedDetail ?? ''}`;
}

/**
 * A coverage row as a stacked item: headed by its payer product and its outcome's chip, the table's naming cells, so
 * the headings tell the outcomes of a product apart and its Reason, the first field, the reasons of an outcome.
 */
function coverageItem(entry: ScreeningCoverageRow): StackedRow {
  const coverage = `${entry.payerProduct}:${entry.disposition}`;
  return {
    key: coverageKey(entry),
    hooks: entry.unpricedReason === null ? { 'data-stacked-coverage': coverage } : { 'data-stacked-coverage': coverage, 'data-stacked-reason': entry.unpricedReason },
    heading: (
      <>
        {`${productLabel(entry.payerProduct)}: `}
        <StatusChip tone={toneOf(entry.disposition)} className="whitespace-normal">
          {dispositionLabel(entry.disposition)}
        </StatusChip>
      </>
    ),
    fields: fieldsFrom(COVERAGE_COLUMNS, coverageCells(entry)),
  };
}

/** The coverage as stacked rows, in the order given. */
export function coverageItems(coverage: readonly ScreeningCoverageRow[]): StackedRow[] {
  return coverage.map(coverageItem);
}

/** The coverage; the table shows from its own width, 40rem, up and the stacked rows below it. */
export function ScreeningCoverage({ coverage }: { readonly coverage: readonly ScreeningCoverageRow[] }) {
  const rows = coverage.reduce((sum, entry) => sum + entry.rows, 0);
  const contractRows = coverage.filter((entry) => entry.disposition === 'contract_required').reduce((sum, entry) => sum + entry.rows, 0);
  return (
    <Card data-section="coverage">
      <CardHeader>
        <CardTitle id="screening-coverage">{TITLE}</CardTitle>
        <CardDescription>
          What the screening could do with each row of your file, by payer product. {shareText(contractRows, rows)} of the rows ({contractRows.toLocaleString('en-US')} of {rows.toLocaleString('en-US')}) cannot be priced without a contract.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StackedRows
          labelledBy="screening-coverage"
          stackBelow="40rem"
          table={
            <ScrollTable label={TITLE}>
              <table className="w-full min-w-[40rem] text-left text-sm" aria-labelledby="screening-coverage">
                <thead className="text-muted-foreground">
                  <ColumnHeads columns={COVERAGE_COLUMNS} />
                </thead>
                <tbody>
                  {coverage.map((entry) => (
                    <tr key={coverageKey(entry)} className="border-t align-top" data-coverage={`${entry.payerProduct}:${entry.disposition}`} data-reason={entry.unpricedReason ?? undefined}>
                      <ColumnCells columns={COVERAGE_COLUMNS} cells={coverageCells(entry)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          }
          rows={coverageItems(coverage)}
        />
      </CardContent>
    </Card>
  );
}
