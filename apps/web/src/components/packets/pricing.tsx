import type { UnpricedReason } from '@tp/pricing';
import type { LinePricingNow } from '@tp/worker/pricing';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';

import { Money } from '../remittances/display';
import { StatusChip } from '../status';
import { unpricedReasonText } from '../../lib/contracts/remedies';
import { PRICING_CAUSE_TEXT, type PricingNowView, type PricingTotals } from '../../lib/packets/pricing';

/**
 * A packet version whose pricing is no longer current (audit item #4; docs/adr/0061): which lines, why, and each
 * line's expected amount and variance as the version states them and as the pricing in effect gives them now,
 * with the version's totals then and now. A server component; it shows nothing while the version is current.
 * The figures are the database's, never recomputed; a line not priced again yet, or no longer priced, says so.
 * Nothing refreshes a case automatically yet, so the remedy is the case page's write-off, or waiting.
 *
 * On the submissions page (`sent`), the version already went to the payer: the submission was logged as it
 * happened and flagged, never refused, and the panel shows what was sent beside the pricing in effect now. Its
 * `label` names the region when a page shows more than one.
 */

const NOT_PRICED_AGAIN = 'Not priced again yet';

/** A line's figure now, or why there is none. */
function NowFigure({ line, figure }: { readonly line: LinePricingNow; readonly figure: 'expectedCents' | 'varianceCents' }) {
  if (line.now === null) {
    return <span className="text-fg-muted">{NOT_PRICED_AGAIN}</span>;
  }
  if (line.now.unpricedReason !== null) {
    return <span className="text-fg-muted">No longer priced: {unpricedReasonText(line.now.unpricedReason as UnpricedReason).meaning}</span>;
  }
  return <Money value={line.now[figure]} />;
}

function TotalNow({ now, figure }: { readonly now: PricingTotals | null; readonly figure: keyof PricingTotals }) {
  return now === null ? <span className="text-fg-muted">{NOT_PRICED_AGAIN}</span> : <Money value={now[figure]} />;
}

export function PricingNowPanel({ pricing, sent = false, label = 'Pricing now' }: { readonly pricing: PricingNowView; readonly sent?: boolean; readonly label?: string }) {
  if (pricing.status === 'current') {
    return null;
  }
  const one = pricing.lines.length === 1;
  return (
    <Card role="region" aria-label={label} data-pricing-check={pricing.status}>
      <CardHeader>
        <CardTitle>Pricing now</CardTitle>
        <CardDescription>
          A packet is written, approved, exported and attested only on the pricing in effect. Since this version was written, {one ? 'one line is' : `${String(pricing.lines.length)} lines are`} no longer on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>
            <StatusChip tone="danger">Pricing not current</StatusChip> {PRICING_CAUSE_TEXT[pricing.status]}.
          </AlertTitle>
          {sent ? (
            <AlertDescription>
              This version already went to the payer. Its submission is logged as it happened and flagged, never refused: the figures it sent are not the pricing in effect now. Compare them below;
              nothing is sent to the payer or corrected automatically.
            </AlertDescription>
          ) : (
            <AlertDescription>
              Nothing refreshes the case automatically yet. To send the packet without the stale {one ? 'line' : 'lines'}, write {one ? 'it' : 'them'} off on the case page and write the packet again;
              otherwise wait until {one ? 'it is' : 'they are'} priced current again. Until then this version is not approved, exported or attested.
            </AlertDescription>
          )}
        </Alert>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Lines not on current pricing">
            <thead>
              <tr className="border-b text-left align-bottom">
                <th className="py-1 pr-3 font-medium">Row</th>
                <th className="py-1 pr-3 font-medium">Why</th>
                <th className="py-1 pr-3 text-right font-medium">Expected then</th>
                <th className="py-1 pr-3 text-right font-medium">Expected now</th>
                <th className="py-1 pr-3 text-right font-medium">Variance then</th>
                <th className="py-1 text-right font-medium">Variance now</th>
              </tr>
            </thead>
            <tbody>
              {pricing.lines.map((line) => (
                <tr key={line.row} className="border-b align-top last:border-0" data-row={line.row} data-pricing-check={line.check}>
                  <td className="py-1 pr-3 font-mono tabular-nums">{line.row}</td>
                  <td className="py-1 pr-3">{line.check === 'current' ? '' : PRICING_CAUSE_TEXT[line.check]}</td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={line.was.expectedCents} />
                  </td>
                  <td className="py-1 pr-3 text-right" data-figure="expected-now">
                    <NowFigure line={line} figure="expectedCents" />
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={line.was.varianceCents} />
                  </td>
                  <td className="py-1 text-right" data-figure="variance-now">
                    <NowFigure line={line} figure="varianceCents" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium" data-row="total">
                <th scope="row" className="py-1 pr-3 text-left font-medium" colSpan={2}>
                  This version’s total
                </th>
                <td className="py-1 pr-3 text-right">
                  <Money value={pricing.totals.was.expectedCents} />
                </td>
                <td className="py-1 pr-3 text-right" data-figure="expected-total-now">
                  <TotalNow now={pricing.totals.now} figure="expectedCents" />
                </td>
                <td className="py-1 pr-3 text-right">
                  <Money value={pricing.totals.was.varianceCents} />
                </td>
                <td className="py-1 text-right" data-figure="variance-total-now">
                  <TotalNow now={pricing.totals.now} figure="varianceCents" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
