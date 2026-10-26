import { formatUnroundedUsd } from '@tp/money';
import type { LineWords, Sentence, Worksheet } from '@tp/packets/explain';
import type { UnpricedReason } from '@tp/pricing';
import { Alert, AlertDescription, AlertTitle } from '@tp/ui';

import { unpricedReasonText } from '../../lib/contracts/remedies';
import type { LineTraceStep, PricingWords } from '../../lib/pricing/view';
import { SentenceText, WorksheetView } from '../packets/calculation-words';
import { ScrollTable } from '../scroll-table';

/**
 * A line's calculation in words on the line trace page (combined audit #38; design 3.9; docs/adr/0072): the summary
 * sentence on the Pricing card, and each step of the trace with its sentences under its title, the fee-schedule
 * worksheet under the fee-schedule step. The words are @tp/packets/explain's, built on the server from the stored
 * trace: the internal words (dates shown) for the roles that read PHI, the viewer's (no date of any kind) for the
 * others. This renders segments and computes nothing: a figure and a code are set in the mono face with tabular
 * numerals (the brand rule). What the engine recorded, its rule records and JSON, sits in a closed disclosure under
 * the words, for the roles that read PHI only. A calculation the words cannot put shows why, never a code. Each step's
 * title is a heading under the page's Trace heading (h3), and a worksheet's title one below it (h4), so heading
 * navigation reaches every step.
 */

/** What a viewer is told above the steps: the steps' own dates are left out (the page's other cards say what they show). */
export const VIEWER_DATES_NOTE = 'These steps leave out the line’s dates for your role.';

/** The notice when the words cannot be put, with what they lack (design 3.7). */
export function wordsRefusalText(refusal: string): string {
  return `This line’s calculation cannot be put in words yet: ${refusal}.`;
}

/** The Pricing card's lead: the line's summary sentence, or the refusal notice with its next step. */
export function LineSummary({ words, refusal }: { readonly words: LineWords | null; readonly refusal: string | null }) {
  if (refusal !== null) {
    return (
      <Alert variant="destructive" role="note" data-line-words="refused">
        <AlertTitle>The calculation is not in words</AlertTitle>
        <AlertDescription>{wordsRefusalText(refusal)} Ask PaidWhole support.</AlertDescription>
      </Alert>
    );
  }
  if (words === null) {
    return null;
  }
  return (
    <p className="text-sm" data-summary>
      <SentenceText sentence={words.summary} />
    </p>
  );
}

function Sentences({ sentences }: { readonly sentences: readonly Sentence[] }) {
  return sentences.map((sentence, index) => (
    <span key={String(index)}>
      {index === 0 ? null : ' '}
      <SentenceText sentence={sentence} />
    </span>
  ));
}

/**
 * An unpriced line's reason as its meaning, detail, stop and remedy (the outcome step's words), its code kept as data.
 * When the words cannot be put, the closed list's meaning and remedy (lib/contracts/remedies.ts), less the meaning of
 * SECONDARY_PAYER, which the list states narrower than the engine stops (design 3.5, finding m3).
 */
export function UnpricedWords({ reason, words }: { readonly reason: UnpricedReason; readonly words: LineWords | null }) {
  const sentences = words?.steps.find((step) => step.step === 'outcome')?.sentences ?? [];
  if (sentences.length === 0) {
    const text = unpricedReasonText(reason);
    return <span data-reason={reason}>{reason === 'SECONDARY_PAYER' ? `Remedy: ${text.remedy}.` : `${text.meaning}. Remedy: ${text.remedy}.`}</span>;
  }
  return (
    <span data-reason={reason}>
      <Sentences sentences={sentences} />
    </span>
  );
}

/** The adjustments the line was priced with, by their words, each amount before and after in exact dollars. */
export function AdjustmentWords({ adjustments }: { readonly adjustments: PricingWords['adjustments'] }) {
  if (adjustments.length === 0) {
    return <>None</>;
  }
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Adjustments applied">
      {adjustments.map((item) => (
        <li key={item.name} data-adjustment={item.name}>
          {item.words}: <span className="font-mono tabular-nums">{formatUnroundedUsd(item.beforeCents)}</span> becomes{' '}
          <span className="font-mono tabular-nums">{formatUnroundedUsd(item.afterCents)}</span>
        </li>
      ))}
    </ul>
  );
}

/** What the engine recorded for one step: its rule records, and its JSON in a scroller a keyboard reaches (finding m7). */
function Recorded({ step }: { readonly step: LineTraceStep }) {
  const view = step.recorded;
  if (view === null || view.recorded === null) {
    return null;
  }
  return (
    <details className="pt-1" data-recorded={step.key}>
      {/* Named by its step, since each step has one (a screen reader tabbing through hears which), and at least 24 px tall to tap. */}
      <summary className="min-h-6 cursor-pointer py-1 text-sm text-muted-foreground">
        As the engine recorded it<span className="sr-only">: {step.title}</span>
      </summary>
      {view.records.length === 0 ? null : (
        <ul className="pt-1 text-xs" aria-label={`Rule records of ${step.title}`}>
          {view.records.map((record, index) => (
            <li key={`${record.sha256}:${String(index)}`} className="break-all font-mono">
              {record.recordType} {record.key} {record.effectiveFrom} to {record.effectiveTo ?? 'open'}: {record.sha256}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1">
        <ScrollTable label={`${step.title}, as the engine recorded it`}>
          <pre className="rounded bg-muted p-2 text-xs">{view.recorded}</pre>
        </ScrollTable>
      </div>
      {view.note === null ? null : (
        <p className="pt-1 text-xs text-muted-foreground" data-trace-note={step.key}>
          {view.note}
        </p>
      )}
    </details>
  );
}

/**
 * The trace's steps in words, in the engine's order, each under its title as a heading, with what the engine recorded
 * beneath (roles that read PHI). A step with no words and no record (a viewer has no record of any step) reads "Does
 * not apply to this line." on a priced line whose words are put (it never used the step), else "Not reached.", for
 * every role alike, so the viewer's steps are numbered as the practice's are.
 */
export function LineTrace({
  steps,
  worksheets,
  canReadPhi,
  notApplied,
}: {
  readonly steps: readonly LineTraceStep[];
  readonly worksheets: readonly Worksheet[];
  readonly canReadPhi: boolean;
  readonly notApplied: boolean;
}) {
  return (
    <>
      {canReadPhi ? null : <p className="text-sm text-muted-foreground">{VIEWER_DATES_NOTE}</p>}
      {steps.length === 0 ? null : (
        <ol className="flex min-w-0 flex-col gap-2" aria-label="Trace steps">
          {steps.map((step) => (
            <li key={step.key} className="flex min-w-0 flex-col gap-1 rounded-md border p-3 text-sm" data-step={step.key}>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              {step.sentences.length !== 0 ? (
                step.sentences.map((sentence, index) => (
                  <p key={String(index)}>
                    <SentenceText sentence={sentence} />
                  </p>
                ))
              ) : (step.recorded?.recorded ?? null) === null ? (
                <p className="text-xs text-muted-foreground">{notApplied ? 'Does not apply to this line.' : 'Not reached.'}</p>
              ) : null}
              {step.key === 'fee_schedule' ? worksheets.map((sheet) => <WorksheetView key={sheet.key} sheet={sheet} level={4} />) : null}
              <Recorded step={step} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
