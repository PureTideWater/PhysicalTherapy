import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { UnmappedPlanTotals } from '../../lib/contracts/mapping-queries';
import type { ActionState } from '../../lib/http/next';
import type { LastFailureReason, MappedNotPricedTotals, MonthToPriceAgain, MonthToTriage, MonthsWaiting, PriceAgainState } from '../../lib/pricing/mapped-plan';
import type { MonthsToPrice } from '../../lib/routes/mapping';
import { ActionForm, RefusalFallback } from '../action-form';
import { WholeDates } from '../dates';
import { Counted, Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';
import { type StackedField, type StackedRow, StackedRows } from '../stacked-rows';

/**
 * What a plan's mapping leaves to price, on the mapping list (the practice) and on each plan's page (that plan), and the
 * two live figures Coverage, Pricing runs and the home page show (combined audit #32; docs/adr/0075; design 3.2, 4.1 to
 * 4.3, 5 and 9; test matrix MAP-06 to MAP-09, PRC-31). A plan with no mapping no longer freezes a month: its lines are
 * not priced while every other plan's price, and these pieces say so in counts and cents only, never a plan's or a
 * payer's name:
 *
 * - UnmappedPlansAlert (figure 1) and MappedNotPricedAlert (figure 2): default Alerts on the unpriced tint, never the
 *   destructive one (nothing failed: D7), the status as words on the tint (BRAND.md section 4), figures and the
 *   NO_MAPPING code in the mono face. "Map them" for a person who may map plans (mapping.edit), "See them on Payer and
 *   plan mapping" for anyone else (D6).
 * - MonthsWaitingRegion: the months no run covers that hold lines of mapped plans and of plans with no mapping, with
 *   "Price them now" (practice.mapping.price_waiting), which queues monitoring of every month no run covers.
 * - MonthsToPriceAgainRegion: one table (a ScrollTable paired with StackedRows at 32rem, docs/adr/0078) of the runs in
 *   effect holding lines of mapped plans still NO_MAPPING, each in its one state (design 4.2), and the accepted re-runs
 *   whose newly priced lines wait for triage on Cases (D13), with "Price these months again (N)"
 *   (practice.mapping.price_again) over the ready months. Its refusals name their hidden fields in the form's summary
 *   (docs/adr/0077), and after one the page is read again so the list shows the months as they are now.
 *
 * A re-run is a person's work, so a failed re-run's words are this module's own and never say a month "is priced by
 * itself" (FAILURE_TEXT says that of first runs the monitor plans again: D21). Server components: the forms' actions and
 * request keys come from the page, as the settings cards take them.
 */

type FormAction = (state: ActionState, form: FormData) => Promise<ActionState>;

/** A count and its noun's verb: "1 plan has", "2 plans have". */
const has = (count: number) => (count === 1 ? 'has' : 'have');

/** Figure 1's link to Payer and plan mapping: `edit` ("Map them") for a person who may map plans, else "See them on Payer and plan mapping" (D6). */
function mappingLink(practiceId: string, canMap: boolean, plans: number, edit: string): ReactNode {
  return (
    <Link className="underline" href={`/p/${practiceId}/mapping`}>
      {canMap ? edit : `See ${plans === 1 ? 'it' : 'them'} on Payer and plan mapping`}
    </Link>
  );
}

/** A reason code in a sentence, in the mono face (.claude/rules/brand.md: every code mono, with tabular numerals). */
function Code({ children }: { readonly children: ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

/** The unpriced tint the two figures' Alerts sit on: status as words on its tint, never colour alone (BRAND.md section 4). */
const UNPRICED_TINT = 'border-status-unpriced bg-status-unpriced-bg';

/** Figure 1's title: "2 plans have no mapping; their lines are not priced" (the plural helpers' singular for one). */
export function unmappedPlansTitle(plans: number): string {
  return `${String(plans)} ${plans === 1 ? 'plan' : 'plans'} ${has(plans)} no mapping; ${plans === 1 ? 'its' : 'their'} lines are not priced`;
}

/** The screen figure 1 is on, which words its body (design 5.1, 5.2 and 5.7). */
export type UnmappedPlansPlace = 'coverage' | 'pricing_runs' | 'home';

/**
 * Figure 1 (MAP-06): the plans with no mapping at all, whose lines no run prices, with their lines and billed dollars.
 * Nothing when every plan with lines has a mapping (Coverage says so with EveryPlanMappedAlert). On Pricing runs it says
 * the lines wait in every run, and that only a line the engine reaches is NO_MAPPING (one that fails the engine's fact
 * checks first is ENGINE_ERROR: review R3-5); on the home page it says how the queue below counts differently (12g).
 */
export function UnmappedPlansAlert({
  practiceId,
  totals,
  canMap,
  place,
}: {
  readonly practiceId: string;
  readonly totals: UnmappedPlanTotals;
  readonly canMap: boolean;
  readonly place: UnmappedPlansPlace;
}) {
  if (totals.plans === 0) {
    return null;
  }
  const lines = <Counted value={totals.lines} one="line" />;
  const one = totals.plans === 1;
  return (
    <Alert data-state="unmapped" className={UNPRICED_TINT}>
      <AlertTitle>
        <span className="font-mono tabular-nums">{totals.plans}</span>
        {unmappedPlansTitle(totals.plans).slice(String(totals.plans).length)}
      </AlertTitle>
      <AlertDescription>
        {place === 'pricing_runs' ? (
          <p>
            {lines}, <Money value={totals.chargeCents} /> billed, {totals.lines === 1 ? 'is' : 'are'} not priced in any run until{' '}
            {totals.lines === 1 ? 'its plan is' : one ? 'their plan is' : 'their plans are'} mapped; a line the engine reaches is left as <Code>NO_MAPPING</Code>.{' '}
            {mappingLink(practiceId, canMap, totals.plans, one ? 'Map it' : 'Map them')}.
          </p>
        ) : (
          <p>
            {lines}, <Money value={totals.chargeCents} /> billed. Lines of every other plan price as usual.
            {place === 'home' ? ' The queue “Plans waiting on a mapping” below also counts plans mapped for only some dates.' : null}{' '}
            {mappingLink(practiceId, canMap, totals.plans, one ? 'Map it' : 'Map them')}
            {canMap && place === 'coverage' ? ' on Payer and plan mapping' : null}.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Coverage's word when every plan with lines has a mapping (design 5.1): only lines outside every mapping's dates wait. */
export function EveryPlanMappedAlert() {
  return (
    <Alert data-state="mapped">
      <AlertTitle>Every plan has a mapping</AlertTitle>
      <AlertDescription>
        <p>
          Lines outside every mapping’s dates are left unpriced as <Code>NO_MAPPING</Code>, one by one.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** Figure 2's title: "9 lines of mapped plans are still not priced". */
export function mappedNotPricedTitle(lines: number): string {
  return lines === 1 ? '1 line of a mapped plan is still not priced' : `${String(lines)} lines of mapped plans are still not priced`;
}

/**
 * Figure 2's sentence (PRC-31): "$812.00 billed, in 2 priced months, are still NO_MAPPING in the pricing in effect: their
 * plans were mapped after those months were priced." With `link`, the step after it.
 */
function MappedNotPricedText({ totals, link }: { readonly totals: MappedNotPricedTotals; readonly link?: ReactNode }) {
  const one = totals.lines === 1;
  return (
    <>
      <Money value={totals.chargeCents} /> billed, in <Counted value={totals.runs} one="priced month" />, {one ? 'is' : 'are'} still <Code>NO_MAPPING</Code> in the pricing in
      effect: {one ? 'its plan was' : 'their plans were'} mapped after {totals.runs === 1 ? 'that month was' : 'those months were'} priced.
      {link === undefined ? null : <> {link}</>}
    </>
  );
}

/**
 * Figure 2 (PRC-31): the lines whose pricing in effect is NO_MAPPING while their plan now has a mapping in force on
 * their date, with their billed dollars and the priced months holding them, linking to the mapping list's months to
 * price again. Nothing when there are none: the Alert leaves once the re-runs pricing them are accepted.
 */
export function MappedNotPricedAlert({ practiceId, totals, canMap }: { readonly practiceId: string; readonly totals: MappedNotPricedTotals; readonly canMap: boolean }) {
  if (totals.lines === 0) {
    return null;
  }
  const one = totals.lines === 1;
  const href = `/p/${practiceId}/mapping#${MONTHS_TO_PRICE_AGAIN_ID}`;
  return (
    <Alert data-state="mapped_not_priced" className={UNPRICED_TINT}>
      <AlertTitle>
        <span className="font-mono tabular-nums">{totals.lines}</span>
        {mappedNotPricedTitle(totals.lines).slice(String(totals.lines).length)}
      </AlertTitle>
      <AlertDescription>
        <p>
          <MappedNotPricedText
            totals={totals}
            link={
              canMap ? (
                <>
                  <Link className="underline" href={href}>
                    Price {one ? 'its' : 'their'} {totals.runs === 1 ? 'month' : 'months'} again
                  </Link>{' '}
                  on Payer and plan mapping.
                </>
              ) : (
                <>
                  <Link className="underline" href={href}>
                    See {one ? 'it' : 'them'} on Payer and plan mapping
                  </Link>
                  .
                </>
              )
            }
          />
        </p>
      </AlertDescription>
    </Alert>
  );
}

/** The notices of the mapping list's own actions, which a plan's page shows in the same words (design 5.3; C2). */
export const MONTHS_NOTICES = {
  priced_again: { title: 'Re-runs created', text: 'Accept each on its page after its list of changes.' },
  pricing_requested: { title: 'Pricing requested', text: 'Monitoring is pricing the waiting months now; they show on Pricing runs when done.' },
} as const;

/** "2026-03-01 to 2026-03-31", each date kept whole, in the mono face. */
function Dates({ from, to }: { readonly from: string; readonly to: string }) {
  return (
    <span className="font-mono tabular-nums">
      <WholeDates text={`${from} to ${to}`} />
    </span>
  );
}

/** The hidden plan of a plan page's form: a refusal of it is named "This plan" in the form's summary. */
function PlanField({ planId }: { readonly planId: string | null }) {
  return planId === null ? null : <input type="hidden" name="planId" value={planId} data-error-name="This plan" />;
}

/**
 * The first sentences of "Months waiting for a first run" (design 4.1): on a plan's page, "3 months holding this plan’s
 * lines wait for 2 other plans’ mappings."; on the list, "3 months wait for 2 plans’ mappings."; then why to map first,
 * and what pricing now costs.
 */
export function monthsWaitingText(waiting: MonthsWaiting, plan: boolean): string {
  const months = waiting.months.length;
  const one = months === 1;
  const plans = `${String(waiting.plans)} ${plan ? 'other ' : ''}${waiting.plans === 1 ? 'plan’s mapping' : 'plans’ mappings'}`;
  return [
    `${String(months)} ${one ? 'month' : 'months'}${plan ? ' holding this plan’s lines' : ''} ${one ? 'waits' : 'wait'} for ${plans}.`,
    `Map ${waiting.plans === 1 ? 'that plan' : 'those plans'} first, so each month is priced once.`,
    `Or price ${one ? 'it' : 'them'} now: the lines of plans still with no mapping stay unpriced as NO_MAPPING, and ${one ? 'that month needs' : 'those months need'} pricing again once their plans are mapped.`,
    `Monitoring prices ${one ? 'it' : 'them'} anyway at its next daily run.`,
  ].join(' ');
}

/** A sentence with NO_MAPPING in it, the code in the mono face. */
function WithCode({ text }: { readonly text: string }) {
  return text.split(/(NO_MAPPING)/).map((part, index) =>
    index % 2 === 1 ? (
      <Code key={`${String(index)}-code`}>{part}</Code>
    ) : (
      part
    ),
  );
}

/**
 * "Months waiting for a first run" (design 4.1; MAP-07): the months no run covers holding lines of mapped plans and of
 * plans with no mapping (for a plan's page, those holding its lines), not held on the billing ZIP or Medicare content
 * (those have their own cards on Coverage), with "Price them now" for a person who may map plans. Nothing when there
 * are none.
 */
export function MonthsWaitingRegion({
  practiceId,
  planId,
  waiting,
  canMap,
  action,
  formKeys,
}: {
  readonly practiceId: string;
  /** The plan whose page it is on; null on the mapping list. */
  readonly planId: string | null;
  readonly waiting: MonthsWaiting;
  readonly canMap: boolean;
  readonly action: FormAction;
  readonly formKeys: () => ReactNode;
}) {
  if (waiting.months.length === 0) {
    return null;
  }
  return (
    <section aria-label="Months waiting for a first run" className="flex flex-col gap-2" data-region="months-waiting">
      <h2 className="text-xl font-bold tracking-display">Months waiting for a first run</h2>
      <p className="text-sm" data-state="months-waiting">
        <WithCode text={monthsWaitingText(waiting, planId !== null)} />
      </p>
      <ul className="flex flex-col gap-1 text-sm" aria-label="The months waiting">
        {waiting.months.map((month) => (
          <li key={month.periodFrom} data-waiting-month={month.periodFrom}>
            <Dates from={month.periodFrom} to={month.periodTo} />
          </li>
        ))}
      </ul>
      {canMap ? (
        <ActionForm action={action} submit="Price them now" variant="outline" className="flex w-full flex-col gap-2 sm:w-auto [&_button[type=submit]]:w-full sm:[&_button[type=submit]]:w-auto">
          {formKeys()}
          <input type="hidden" name="practiceId" value={practiceId} />
          <PlanField planId={planId} />
        </ActionForm>
      ) : null}
    </section>
  );
}

/** The table's column headers, one constant for the <th>s and the stacked rows' terms (docs/adr/0078). */
export const MONTH_COLUMNS = { months: 'Months', lines: 'Lines not priced', billed: 'Billed', state: 'State' } as const;

/** Why the last re-run failed, after "The last re-run failed: " on a month ready again (design 4.2; D21). */
export const LAST_FAILURE_TEXT: Readonly<Record<Exclude<LastFailureReason, 'other'>, string>> = {
  job_failed: 'its price job failed three times and the operator was alerted',
  release_read_outside_fetch: 'it read rule content it had not fetched, which is PaidWhole’s defect, and it was logged for PaidWhole’s team',
  engine_version_mismatch: 'it was created for another version of the pricing engine',
  location: 'it waited on the billing ZIP, which has been saved since',
  content: 'it waited on Medicare content, which can be read now',
};

/** A re-run that failed since the newest mapping on what has not changed: its label and words (design 4.2, rerun_failed). */
export const RERUN_FAILED_TEXT = {
  location: {
    label: 'Waiting on the billing ZIP',
    text: 'The re-run stopped on the practice’s billing ZIP or ZIP+4. Fix it in Pricing settings; this month is offered here again once it is saved.',
  },
  content: {
    label: 'Waiting on Medicare content',
    text: 'The re-run needs Medicare content PaidWhole has not loaded for these dates yet, so no line was kept. This month is offered here again once that content is loaded or a mapping or contract version changes.',
  },
} as const;

/** The words of a month's state as plain text (the unit test reads them; the cell renders them with their links). */
export function priceAgainStateText(state: PriceAgainState): string {
  switch (state.kind) {
    case 'being_priced':
      return 'Being priced again';
    case 'to_accept':
      return 'Priced again: review and accept';
    case 'waiting':
      return 'Waits for a newer run of these dates to finish; it is listed again then, or priced by it';
    case 'rerun_failed':
      return `${RERUN_FAILED_TEXT[state.wait].label}: ${RERUN_FAILED_TEXT[state.wait].text}`;
    case 'ready':
      return state.lastFailure === null
        ? 'Ready to price again'
        : state.lastFailure.reason === 'other'
          ? 'Ready to price again. The last re-run failed.'
          : `Ready to price again. The last re-run failed: ${LAST_FAILURE_TEXT[state.lastFailure.reason]}.`;
  }
}

/** A month accepted after a mapping whose newly priced lines wait for triage (D13): a link to Cases for a person who works cases. */
export function toTriageText(canWorkCases: boolean): string {
  return canWorkCases ? 'Priced again and accepted: triage it on Cases' : 'Priced again and accepted: waits for triage by a person who works cases';
}

function rerunLink(practiceId: string, rerunId: string, words: string): ReactNode {
  return (
    <Link className="underline" href={`/p/${practiceId}/pricing-runs/${rerunId}`}>
      {words}
    </Link>
  );
}

/** A month's state with its links: the re-run to accept, the failed re-run to see, Pricing settings for the ZIP. */
function StateCell({ practiceId, state }: { readonly practiceId: string; readonly state: PriceAgainState }) {
  switch (state.kind) {
    case 'being_priced':
    case 'waiting':
      return <>{priceAgainStateText(state)}</>;
    case 'to_accept':
      return rerunLink(practiceId, state.rerunId, priceAgainStateText(state));
    case 'rerun_failed':
      return (
        <>
          <span className="font-medium">{RERUN_FAILED_TEXT[state.wait].label}:</span>{' '}
          {state.wait === 'location' ? (
            <>
              The re-run stopped on the practice’s billing ZIP or ZIP+4. Fix it in{' '}
              <Link className="underline" href={`/p/${practiceId}/settings/pricing`}>
                Pricing settings
              </Link>
              ; this month is offered here again once it is saved.
            </>
          ) : (
            RERUN_FAILED_TEXT.content.text
          )}{' '}
          {rerunLink(practiceId, state.rerunId, 'See the re-run')}
        </>
      );
    case 'ready':
      return state.lastFailure === null ? (
        <>{priceAgainStateText(state)}</>
      ) : (
        <>
          {priceAgainStateText(state)} {rerunLink(practiceId, state.lastFailure.rerunId, 'See the re-run')}
        </>
      );
  }
}

/** One row of the table: a run to price again, or an accepted re-run to triage. */
type MonthRow = { readonly kind: 'price_again'; readonly month: MonthToPriceAgain } | { readonly kind: 'to_triage'; readonly month: MonthToTriage };

function rowState(row: MonthRow): string {
  return row.kind === 'to_triage' ? 'to_triage' : row.month.state.kind;
}

function rowCells(practiceId: string, row: MonthRow, canWorkCases: boolean): { readonly lines: ReactNode; readonly billed: ReactNode; readonly state: ReactNode } {
  if (row.kind === 'price_again') {
    return { lines: row.month.lines, billed: <Money value={row.month.chargeCents} />, state: <StateCell practiceId={practiceId} state={row.month.state} /> };
  }
  // Its lines are priced now: what waits is triage, so the columns of lines not priced say none.
  return {
    lines: '—',
    billed: '—',
    state: canWorkCases ? (
      <Link className="underline" href={`/p/${practiceId}/cases`}>
        {toTriageText(true)}
      </Link>
    ) : (
      toTriageText(false)
    ),
  };
}

/** The stacked copy's fields of a row, in the table's column order (the dates are the row's heading). */
export function monthFields(cells: { readonly lines: ReactNode; readonly billed: ReactNode; readonly state: ReactNode }): readonly StackedField[] {
  return [
    { label: MONTH_COLUMNS.lines, value: cells.lines, mono: true },
    { label: MONTH_COLUMNS.billed, value: cells.billed, mono: true },
    { label: MONTH_COLUMNS.state, value: cells.state },
  ];
}

/** The mapping list's region id, which figure 2's link opens at. */
export const MONTHS_TO_PRICE_AGAIN_ID = 'months-to-price-again';

/** "Price these months again (3)": the count of ready months the form posts. */
export function priceAgainSubmit(count: number): string {
  return `Price these months again (${String(count)})`;
}

/**
 * The months holding lines of mapped plans that are not priced (design 4.2 and 4.3; MAP-08, PRC-31): on the mapping
 * list for the practice ("Months with lines of mapped plans not priced", its table "Months to price again"), shown only
 * when it has rows; on a mapped plan's page for that plan ("Months holding this plan’s lines that are not priced"),
 * shown with its empty sentence when it has none. One table, stacked below 32rem; the form posts every ready month
 * (hidden runIds[]) and the release in force, and names each in its summary when refused.
 */
export function MonthsToPriceAgainRegion({
  practiceId,
  planId,
  months,
  mappedNotPriced,
  canMap,
  canWorkCases,
  action,
  formKeys,
}: {
  readonly practiceId: string;
  /** The plan whose page it is on; null on the mapping list. */
  readonly planId: string | null;
  readonly months: MonthsToPrice;
  /** The practice's figure 2, said above the list's table; none on a plan's page. */
  readonly mappedNotPriced?: MappedNotPricedTotals;
  readonly canMap: boolean;
  readonly canWorkCases: boolean;
  readonly action: FormAction;
  readonly formKeys: () => ReactNode;
}) {
  const rows: readonly MonthRow[] = [...months.priceAgain.map((month) => ({ kind: 'price_again' as const, month })), ...months.toTriage.map((month) => ({ kind: 'to_triage' as const, month }))];
  const title = planId === null ? 'Months with lines of mapped plans not priced' : 'Months holding this plan’s lines that are not priced';
  const label = planId === null ? 'Months to price again' : 'Months holding this plan’s lines that are not priced';
  if (rows.length === 0 && planId === null) {
    return null;
  }
  const keyOf = (row: MonthRow) => `${row.kind}:${row.month.pricingRunId}`;
  const ready = months.readyRunIds;
  const offered = canMap && ready.length > 0 && months.releaseNo !== null;
  return (
    <section aria-label={title} className="flex flex-col gap-2" data-region="months-to-price-again" id={planId === null ? MONTHS_TO_PRICE_AGAIN_ID : undefined}>
      <h2 className="text-xl font-bold tracking-display">{title}</h2>
      {mappedNotPriced === undefined || mappedNotPriced.lines === 0 ? null : (
        <p className="text-sm" data-state="mapped_not_priced">
          <span className="font-mono tabular-nums">{mappedNotPriced.lines}</span>
          {mappedNotPricedTitle(mappedNotPriced.lines).slice(String(mappedNotPriced.lines).length)}: <MappedNotPricedText totals={mappedNotPriced} />
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-state="none-to-price-again">
          No priced month holds this plan’s lines without a mapping.
        </p>
      ) : (
        <StackedRows
          label={label}
          stackBelow="32rem"
          headingLevel={3}
          table={
            <ScrollTable label={label}>
              <table className="w-full min-w-[32rem] text-left text-sm" aria-label={label}>
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{MONTH_COLUMNS.months}</th>
                    <th className="py-1 pr-3 text-right font-medium">{MONTH_COLUMNS.lines}</th>
                    <th className="py-1 pr-3 text-right font-medium">{MONTH_COLUMNS.billed}</th>
                    <th className="py-1 font-medium">{MONTH_COLUMNS.state}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const cells = rowCells(practiceId, row, canWorkCases);
                    return (
                      <tr key={keyOf(row)} className="border-t align-top" data-month={row.month.pricingRunId} data-state={rowState(row)}>
                        <td className="py-1 pr-3">
                          <Dates from={row.month.periodFrom} to={row.month.periodTo} />
                        </td>
                        <td className="py-1 pr-3 text-right font-mono tabular-nums">{cells.lines}</td>
                        <td className="py-1 pr-3 text-right font-mono tabular-nums">{cells.billed}</td>
                        <td className="py-1">{cells.state}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollTable>
          }
          rows={rows.map(
            (row): StackedRow => ({
              key: keyOf(row),
              hooks: { 'data-stacked-month': row.month.pricingRunId, 'data-stacked-state': rowState(row) },
              heading: <Dates from={row.month.periodFrom} to={row.month.periodTo} />,
              fields: monthFields(rowCells(practiceId, row, canWorkCases)),
            }),
          )}
        />
      )}
      {offered && months.releaseNo !== null ? (
        <ActionForm
          action={action}
          submit={priceAgainSubmit(ready.length)}
          className="flex w-full flex-col gap-2 sm:w-auto [&_button[type=submit]]:w-full sm:[&_button[type=submit]]:w-auto"
          refreshOnError="price-again"
          wrapSubmit
        >
          {formKeys()}
          <input type="hidden" name="practiceId" value={practiceId} />
          <PlanField planId={planId} />
          {ready.map((runId) => (
            <input key={runId} type="hidden" name="runIds[]" value={runId} data-error-name="The months to price again" />
          ))}
          <input type="hidden" name="releaseNo" value={months.releaseNo} data-error-name="Rule release" />
          <p className="text-sm text-muted-foreground">Creates a re-run of each month in your name. Nothing changes until you accept each re-run on its page, after its list of changes.</p>
        </ActionForm>
      ) : null}
      {canMap ? (
        <RefusalFallback
          prefix="price-again"
          present={offered ? ['price-again'] : []}
          lead="No month is ready to price again now: the list above shows each month as it is now, and nothing was created."
        />
      ) : null}
    </section>
  );
}
