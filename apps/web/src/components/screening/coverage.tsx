import type { Cents } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';

import { type ScreeningDisposition, dispositionLabel, productLabel, unpricedReasonLabel } from '../../lib/screening/labels';
import { type StatusTone, StatusChip } from '../status';
import { ScreeningCount, ScreeningMoney } from './result-summary';

/**
 * A screening's coverage (Change Order 001, CO-04): every row of the file, by payer product and what the screening
 * could do with it: priced under Medicare, could not be priced (with the engine's reason), cannot be priced without a
 * contract (Medicare Advantage under contract and commercial; decision D20 a) or not screened (Medicaid and other).
 * The missing-contract coverage is the contract rows' share of the file. Counts and the file's own allowed totals,
 * summed by the database; each outcome is a labelled chip, never color alone.
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

export function ScreeningCoverage({ coverage }: { readonly coverage: readonly ScreeningCoverageRow[] }) {
  const rows = coverage.reduce((sum, entry) => sum + entry.rows, 0);
  const contractRows = coverage.filter((entry) => entry.disposition === 'contract_required').reduce((sum, entry) => sum + entry.rows, 0);
  return (
    <Card data-section="coverage">
      <CardHeader>
        <CardTitle id="screening-coverage">Coverage, and the rows missing a contract</CardTitle>
        <CardDescription>
          What the screening could do with each row of your file, by payer product. {shareText(contractRows, rows)} of the rows ({contractRows.toLocaleString('en-US')} of {rows.toLocaleString('en-US')}) cannot be priced without a contract.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-labelledby="screening-coverage">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Payer product</th>
                <th className="py-1 pr-3 font-medium">Outcome</th>
                <th className="py-1 pr-3 font-medium">Reason</th>
                <th className="py-1 pr-3 text-right font-medium">Rows</th>
                <th className="py-1 pr-3 text-right font-medium">Claim lines</th>
                <th className="py-1 text-right font-medium">Allowed in your file</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((entry) => (
                <tr
                  key={`${entry.payerProduct}:${entry.disposition}:${entry.unpricedReason ?? ''}:${entry.unpricedDetail ?? ''}`}
                  className="border-t align-top"
                  data-coverage={`${entry.payerProduct}:${entry.disposition}`}
                  data-reason={entry.unpricedReason ?? undefined}
                >
                  <td className="py-1 pr-3">{productLabel(entry.payerProduct)}</td>
                  <td className="py-1 pr-3">
                    <StatusChip tone={toneOf(entry.disposition)}>{dispositionLabel(entry.disposition)}</StatusChip>
                  </td>
                  <td className="py-1 pr-3">
                    {entry.unpricedReason === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className="font-mono text-xs">{entry.unpricedReason}</span>
                        <span className="block">{unpricedReasonLabel(entry.unpricedReason, entry.unpricedDetail)}</span>
                      </>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <ScreeningCount value={entry.rows} />
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <ScreeningCount value={entry.claimLines} />
                  </td>
                  <td className="py-1 text-right">
                    <ScreeningMoney cents={entry.observedCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
