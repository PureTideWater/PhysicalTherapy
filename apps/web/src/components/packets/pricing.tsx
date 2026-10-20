import type { UnpricedReason } from '@tp/pricing';
import type { LinePricingNow } from '@tp/worker/pricing';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';

import { Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';
import { StatusChip } from '../status';
import { unpricedReasonText } from '../../lib/contracts/remedies';
import { PRICING_CAUSE_TEXT, type PricingNowView, type PricingTotals } from '../../lib/packets/pricing';

/**
 * A packet version whose pricing is no longer current (audit item #4; docs/adr/0061): which lines, why, and each
 * line's expected amount and variance as the version states them and as the pricing in effect gives them now,
 * with the version's totals then and now. A server component; it shows nothing while the version is current.
 * The figures are the database's, never recomputed; a line not priced again yet, or no longer priced, says so.
 * Nothing refreshes a case automatically yet and a stale line never becomes current again, so the one remedy is the
 * case page's write-off, then a new version written, approved and exported.
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

/**
 * The version's total now, or why none can be stated: a stale line not priced again yet, or one whose pricing in
 * effect is unpriced (no figure to add).
 */
function TotalNow({ pricing, figure }: { readonly pricing: PricingNowView; readonly figure: keyof PricingTotals }) {
  const { now } = pricing.totals;
  if (now !== null) {
    return <Money value={now[figure]} />;
  }
  const waiting = pricing.lines.some((line) => line.now === null);
  return <span className="text-fg-muted">{waiting ? NOT_PRICED_AGAIN : 'Not stated: a line is no longer priced'}</span>;
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
              Nothing refreshes the case automatically yet, and refreshing a case on new pricing is not available yet. Write the stale {one ? 'line' : 'lines'} off on the case page (
              {one ? 'it leaves' : 'they leave'} this dispute), then write, approve and export the packet again without {one ? 'it' : 'them'}. This version is not approved, exported or
              attested.
            </AlertDescription>
          )}
        </Alert>
        <ScrollTable label="Lines not on current pricing">
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
                  <TotalNow pricing={pricing} figure="expectedCents" />
                </td>
                <td className="py-1 pr-3 text-right">
                  <Money value={pricing.totals.was.varianceCents} />
                </td>
                <td className="py-1 text-right" data-figure="variance-total-now">
                  <TotalNow pricing={pricing} figure="varianceCents" />
                </td>
              </tr>
            </tfoot>
          </table>
        </ScrollTable>
      </CardContent>
    </Card>
  );
}
