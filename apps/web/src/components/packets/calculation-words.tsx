import type { Segment, Sentence, Worksheet } from '@tp/packets/explain';
import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import { Fragment } from 'react';

import { ScrollTable } from '../scroll-table';
import { type CalculationWords as Words, wordsRefusalText } from '../../lib/packets/calculation-words';

/**
 * Each line's calculation in words on the packet builder and the packet review (combined audit #38; design 3.9;
 * docs/adr/0072): per row, the line's summary and each step's sentences, then the fee-schedule worksheets, numbered as
 * the payer's PDF numbers them. The words are @tp/packets explainPacket()'s with the payer audience, the PDF's own, so
 * what is approved and attested here is what the payer reads. This renders segments and computes nothing: a figure
 * and a code are set in the mono face with tabular numerals (the brand rule), a label (a row or worksheet number) and
 * a quoted meaning as plain text. A calculation the renderer cannot word shows why, with the next step, and nothing
 * else: never a code in place of its words. Each row and the worksheets are headings at the level the surface gives
 * (h3 under the builder's Calculation per line card, h4 under the review's Calculation per line heading), each
 * worksheet's title one below them.
 */

/** The heading levels the calculation's parts take, by the page's outline. */
export type HeadingLevel = 3 | 4 | 5;

const HEADING = { 3: 'h3', 4: 'h4', 5: 'h5' } as const satisfies Readonly<Record<HeadingLevel, string>>;
const below = (level: HeadingLevel): HeadingLevel => (level === 3 ? 4 : 5);

/** One segment as a reader meets it. */
function SegmentView({ segment }: { readonly segment: Segment }) {
  if ('text' in segment) {
    return <>{segment.text}</>;
  }
  if ('figure' in segment) {
    return (
      <span className="font-mono tabular-nums" data-figure>
        {segment.figure}
      </span>
    );
  }
  if ('code' in segment) {
    return <span className="font-mono tabular-nums">{segment.code}</span>;
  }
  if ('label' in segment) {
    return <>{segment.label}</>;
  }
  return <>{segment.quoted}</>;
}

/** A sentence's segments in order. */
export function SentenceText({ sentence }: { readonly sentence: Sentence }) {
  return (
    <>
      {sentence.segments.map((segment, index) => (
        <SegmentView key={String(index)} segment={segment} />
      ))}
    </>
  );
}

/**
 * A fee-schedule worksheet: its title (a heading at `level`), its rows, the table of parts in a sideways scroller, the
 * expression, the reductions' pointer and the CMS check.
 */
export function WorksheetView({ sheet, level }: { readonly sheet: Worksheet; readonly level: HeadingLevel }) {
  const Title = HEADING[level];
  return (
    <div className="flex min-w-0 flex-col gap-2" data-worksheet={sheet.number}>
      <Title className="text-sm font-semibold">
        <SentenceText sentence={sheet.title} />
      </Title>
      <ul className="flex flex-col gap-0.5" aria-label={`Fee schedule worksheet ${String(sheet.number)}, its records`}>
        {sheet.rows.map((row, index) => (
          <li key={String(index)}>
            <SentenceText sentence={row} />
          </li>
        ))}
      </ul>
      <ScrollTable label={`Fee schedule worksheet ${String(sheet.number)}`}>
        <table className="w-full text-sm" aria-label={`Fee schedule worksheet ${String(sheet.number)}`}>
          <thead>
            <tr className="border-b text-left align-bottom">
              <th className="py-1 pr-3 font-medium">
                <SentenceText sentence={sheet.headings.part} />
              </th>
              <th className="py-1 pr-3 text-right font-medium">
                <SentenceText sentence={sheet.headings.rvu} />
              </th>
              <th className="py-1 pr-3 text-right font-medium">
                <SentenceText sentence={sheet.headings.gpci} />
              </th>
              <th className="py-1 text-right font-medium">
                <SentenceText sentence={sheet.headings.unit} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.parts.map((part) => (
              <tr key={part.part} className="border-b align-top" data-part={part.part}>
                <td className="py-1 pr-3">
                  <SentenceText sentence={part.name} />
                </td>
                <td className="py-1 pr-3 text-right">
                  <SegmentView segment={part.rvu} />
                </td>
                <td className="py-1 pr-3 text-right">
                  <SegmentView segment={part.gpci} />
                </td>
                <td className="py-1 text-right">
                  <SegmentView segment={part.unit} />
                </td>
              </tr>
            ))}
            <tr className="align-top" data-part="total">
              <td className="py-1 pr-3 font-medium">
                <SentenceText sentence={sheet.total.name} />
              </td>
              <td className="py-1 pr-3" />
              <td className="py-1 pr-3" />
              <td className="py-1 text-right">
                <SegmentView segment={sheet.total.unit} />
              </td>
            </tr>
          </tbody>
        </table>
      </ScrollTable>
      {sheet.formula.map((sentence, index) => (
        <p key={String(index)}>
          <SentenceText sentence={sentence} />
        </p>
      ))}
      <p>
        <SentenceText sentence={sheet.reductions} />
      </p>
      <p className="text-muted-foreground">
        <SentenceText sentence={sheet.check} />
      </p>
    </div>
  );
}

/**
 * The calculation per row and the worksheets (tp-packet/2); nothing for a tp-packet/1 version, which states none. Each
 * row's heading and the worksheets' heading are at `level`, each worksheet's title one below.
 */
export function CalculationWords({ calculation, level }: { readonly calculation: Words; readonly level: 3 | 4 }) {
  if (calculation.state === 'none') {
    return null;
  }
  if (calculation.state === 'refused') {
    return (
      <Alert variant="destructive" role="note" data-calculation-words="refused">
        <AlertTitle>The calculation is not worded</AlertTitle>
        <AlertDescription>{wordsRefusalText(calculation.refusal)}</AlertDescription>
      </Alert>
    );
  }
  const { rows, worksheets } = calculation.words;
  const Heading = HEADING[level];
  return (
    <section role="region" aria-label="Calculations" className="flex min-w-0 flex-col gap-4 text-sm" data-calculation-words="worded">
      {rows.map(({ row, words }) => (
        <div key={row} className="flex flex-col gap-1 border-b pb-3 last:border-0" data-calculation-row={row}>
          <Heading className="text-sm font-semibold">Row {row}</Heading>
          <p data-summary>
            <SentenceText sentence={words.summary} />
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5" aria-label={`How row ${String(row)}’s expected amount is computed`}>
            {words.steps.map((step, index) => (
              <li key={`${step.step}:${String(index)}`} data-step={step.step}>
                {step.sentences.map((sentence, at) => (
                  <Fragment key={String(at)}>
                    {at === 0 ? null : ' '}
                    <SentenceText sentence={sentence} />
                  </Fragment>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {worksheets.length === 0 ? null : (
        <div className="flex min-w-0 flex-col gap-4" data-worksheets={worksheets.length}>
          <Heading className="text-sm font-semibold">Fee schedule worksheets</Heading>
          {worksheets.map((sheet) => (
            <WorksheetView key={sheet.key} sheet={sheet} level={below(level)} />
          ))}
        </div>
      )}
    </section>
  );
}
