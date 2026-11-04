import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { WorkPause } from '../../lib/billing/suspension-words';
import type { UnmappedPlanTotals } from '../../lib/contracts/mapping-queries';
import type { ActionState } from '../../lib/http/next';
import type { LastFailure, LastFailureReason, MappedNotPricedTotals, MonthAwaitingMappings, MonthToPriceAgain, MonthToTriage, MonthsWaiting, PriceAgainState } from '../../lib/pricing/mapped-plan';
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
 *   NO_MAPPING code in the mono face. Each is a note (role="status"), never role="alert": nothing is urgent, and a
 *   screen reader must not announce it on load as an error (ADR 0037; WCAG 4.1.3; PR #95 review C-2). Only a refusal
 *   is an alert. "Map them" for a person who may map plans (mapping.edit), "See them on Payer and
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
 * the lines wait in every run, and that each is NO_MAPPING unless it fails a check of its own facts first (that one is
 * ENGINE_ERROR: review R3-5), in the reader's words, never a build word such as "the engine" (PR #95 review C-3); on the
 * home page it says how the queue below counts differently (12g).
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
    <Alert role="status" data-state="unmapped" className={UNPRICED_TINT}>
      <AlertTitle>
        <span className="font-mono tabular-nums">{totals.plans}</span>
        {unmappedPlansTitle(totals.plans).slice(String(totals.plans).length)}
      </AlertTitle>
      <AlertDescription>
        {place === 'pricing_runs' ? (
          <p>
            {lines}, <Money value={totals.chargeCents} /> billed, {totals.lines === 1 ? 'is' : 'are'} not priced in any run until{' '}
            {totals.lines === 1 ? 'its plan is' : one ? 'their plan is' : 'their plans are'} mapped; {totals.lines === 1 ? 'it is' : 'each is'} left unpriced as <Code>NO_MAPPING</Code>,
            unless it fails a check of its own facts first.{' '}
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
    <Alert role="status" data-state="mapped">
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
 * Figure 2's sentence (PRC-31): "$812.00 billed, in 2 pricing runs, are still NO_MAPPING in the pricing in effect: their
 * plans were mapped after those runs were priced." It counts the runs, the rows "Price these months again" lists and
 * the number on its button, never "priced months": a run a person creates can cover several months, said beside it
 * ("in 1 pricing run covering 3 months"; PR #95 review R2-4). Then what a re-run does with them (UX-3): a line whose
 * plan is mapped as no agreement, government or other is recorded under that mapping and stays unpriced, so the words
 * never promise a price the re-run cannot give. With `link`, the step after it.
 */
export function MappedNotPricedText({ totals, link }: { readonly totals: MappedNotPricedTotals; readonly link?: ReactNode }) {
  const one = totals.lines === 1;
  return (
    <>
      <Money value={totals.chargeCents} /> billed, in <Counted value={totals.runs} one="pricing run" />
      {totals.months > totals.runs ? (
        <>
          {' '}
          covering <Counted value={totals.months} one="month" />
        </>
      ) : null}
      , {one ? 'is' : 'are'} still <Code>NO_MAPPING</Code> in the pricing in effect: {one ? 'its plan was' : 'their plans were'} mapped after{' '}
      {totals.runs === 1 ? 'that run was' : 'those runs were'} priced.
      {totals.linesToPrice === totals.lines ? null : totals.linesToPrice === 0 ? (
        <>
          {' '}
          {one ? 'Its plan is' : 'Their plans are'} mapped as no agreement, government or other, so a re-run records {one ? 'it' : 'them'} under that mapping and{' '}
          {one ? 'it stays' : 'they stay'} unpriced.
        </>
      ) : (
        <>
          {' '}
          A re-run prices up to <Counted value={totals.linesToPrice} one="line" />, <Money value={totals.chargeCentsToPrice} /> billed, whose plans are mapped to a contract version
          or as Medicare Advantage non-contracted (a line it cannot price, such as a code the version has no rate for, stays unpriced with that reason); it records the rest
          under their mappings (no agreement, government or other), and they stay unpriced.
        </>
      )}
      {link === undefined ? null : <> {link}</>}
    </>
  );
}

/** Figure 2's link words for a person who may map plans: "Price their months again", or, when a re-run would price none of the lines, "Record them under their mappings" (UX-3). */
export function mappedNotPricedStep(totals: MappedNotPricedTotals): string {
  const one = totals.lines === 1;
  return totals.linesToPrice === 0 ? `Record ${one ? 'it under its mapping' : 'them under their mappings'}` : `Price ${one ? 'its' : 'their'} ${totals.months === 1 ? 'month' : 'months'} again`;
}

/**
 * Figure 2 (PRC-31): the lines whose pricing in effect is NO_MAPPING while their plan now has a mapping in force on
 * their date, with their billed dollars and the pricing runs holding them, linking to the mapping list's months to
 * price again. Nothing when there are none: the Alert leaves once the re-runs recording them under their mapping are
 * accepted.
 */
export function MappedNotPricedAlert({ practiceId, totals, canMap }: { readonly practiceId: string; readonly totals: MappedNotPricedTotals; readonly canMap: boolean }) {
  if (totals.lines === 0) {
    return null;
  }
  const one = totals.lines === 1;
  const href = `/p/${practiceId}/mapping#${MONTHS_TO_PRICE_AGAIN_ID}`;
  return (
    <Alert role="status" data-state="mapped_not_priced" className={UNPRICED_TINT}>
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
                    {mappedNotPricedStep(totals)}
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

/**
 * The notices of the mapping list's own actions, which a plan's page shows in the same words (design 5.3; C2), and the
 * one a press that created nothing shows: every posted month was already being priced again (PR #95 review R2-5).
 */
export const MONTHS_NOTICES = {
  priced_again: { title: 'Re-runs created', text: 'Accept each on its page after its list of changes.' },
  already_pricing: { title: 'Already being priced again', text: 'Nothing new was created. Accept each re-run on its page after its list of changes.' },
  pricing_requested: { title: 'Pricing requested', text: 'Monitoring is pricing the waiting months now; they show on Pricing runs when done.' },
} as const;

/**
 * What a plan page's notice says after a mapping that completed months while the practice's own organization held new
 * work (PR #95 review security F1; mapped_held, corrected_held): nothing was queued, since the worker would refuse it,
 * and the daily monitoring prices the months once work may start again. With the database's reason while the owner's
 * hold lasts (as Uploads says it), and for a closure no restart (BIL-09); without one once it is lifted. A grantee's hold
 * on the reader never held the practice's monitoring (PR #104 review security F1), so it reads as lifted.
 */
export function heldText(suspension: WorkPause | null): string {
  if (suspension === null || suspension.source === 'grantee') {
    return 'New runs were stopped when the mapping was saved, so the months whose plans now all have a mapping were not queued; the daily monitoring prices them now that runs have started again.';
  }
  return suspension.restarts
    ? `Pricing is paused: ${suspension.reason}. The months whose plans now all have a mapping are priced by the daily monitoring once it is resolved.`
    : `Pricing has stopped: ${suspension.reason}. The months whose plans now all have a mapping were not queued.`;
}

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

/** A piece of a sentence: words, or a count the sentence renders in the mono face (.claude/rules/brand.md). */
type Part = string | { readonly count: number };

const plansMappings = (count: number) => (count === 1 ? ' plan’s mapping' : ' plans’ mappings');

/**
 * The sentences of "Months waiting for a first run" (design 4.1), as words and counts: on a plan's page, "3 months
 * holding this plan’s lines wait for 2 other plans’ mappings."; on the list, "3 months wait for 2 plans’ mappings.";
 * then why to map first, and what pricing now costs. On the page of a plan the months wait for (waiting.self), they wait
 * for this plan's mapping, and for any other plans' too: never "0 other plans’ mappings" with nobody to map (PR #95
 * review UX-2).
 */
export function monthsWaitingParts(waiting: MonthsWaiting, plan: boolean): readonly Part[] {
  const months = waiting.months.length;
  const one = months === 1;
  const others = waiting.plans;
  const self = plan && waiting.self;
  const head: Part[] = [{ count: months }, `${one ? ' month' : ' months'}${plan ? ' holding this plan’s lines' : ''} ${one ? 'waits' : 'wait'} for `];
  const it = one ? 'it' : 'them';
  const those = one ? 'that month needs' : 'those months need';
  if (self && others === 0) {
    return [
      ...head,
      `this plan’s mapping. Map it below, so ${one ? 'the month is' : 'each month is'} priced once. Or price ${it} now: this plan’s lines stay unpriced as NO_MAPPING, and ${those} pricing again once it is mapped. Monitoring prices ${it} anyway at its next daily run.`,
    ];
  }
  return [
    ...head,
    ...(self ? ['this plan’s mapping and '] : []),
    { count: others },
    `${plan ? ' other' : ''}${plansMappings(others)}.`,
    ` Map ${self ? 'them' : others === 1 ? 'that plan' : 'those plans'} first, so each month is priced once.`,
    ` Or price ${it} now: the lines of plans still with no mapping stay unpriced as NO_MAPPING, and ${those} pricing again once their plans are mapped.`,
    ` Monitoring prices ${it} anyway at its next daily run.`,
  ];
}

/** The sentences of "Months waiting for a first run" as plain text (the unit tests read them). */
export function monthsWaitingText(waiting: MonthsWaiting, plan: boolean): string {
  return monthsWaitingParts(waiting, plan)
    .map((part) => (typeof part === 'string' ? part : part.count.toLocaleString('en-US')))
    .join('');
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

/** The sentences as rendered: every count in the mono face, with tabular numerals (UX-8), and NO_MAPPING as a code. */
function MonthsWaitingSentences({ parts }: { readonly parts: readonly Part[] }) {
  return parts.map((part, index) =>
    typeof part === 'string' ? (
      <WithCode key={`${String(index)}-words`} text={part} />
    ) : (
      <span key={`${String(index)}-count`} className="font-mono tabular-nums">
        {part.count.toLocaleString('en-US')}
      </span>
    ),
  );
}

/**
 * The columns of the months waiting for a first run (UX-10), each month's figures over the whole month, which is what
 * "Price them now" prices: its lines whose plan's mapping a run prices under (a contract version, or Medicare Advantage
 * non-contracted), its lines with no mapping (left unpriced, NO_MAPPING), and the billed dollars of all its lines. Its
 * own columns, never the months-to-price-again table's ("Lines not priced" and "State" mean nothing for a month no run
 * covers).
 */
export const WAITING_COLUMNS = { month: 'Month', toPrice: 'Lines to price', unmapped: 'Lines with no mapping', billed: 'Billed' } as const;

/** The stacked copy's fields of a waiting month, in the table's column order (the dates are the row's heading). */
export function waitingFields(month: MonthAwaitingMappings): readonly StackedField[] {
  return [
    { label: WAITING_COLUMNS.toPrice, value: month.linesToPrice.toLocaleString('en-US'), mono: true },
    { label: WAITING_COLUMNS.unmapped, value: month.unmappedLines.toLocaleString('en-US'), mono: true },
    { label: WAITING_COLUMNS.billed, value: <Money value={month.chargeCents} />, mono: true },
  ];
}

/** The mapping list's filters a form posts back, so the list it returns to shows what it showed (UX-7). */
export interface ListFilters {
  readonly view: string;
  readonly payer?: string | undefined;
}

/** The list's filters as hidden fields of a form of the list; none on a plan's page. */
function FilterFields({ filters }: { readonly filters: ListFilters | undefined }) {
  return filters === undefined ? null : (
    <>
      <input type="hidden" name="view" value={filters.view} />
      {filters.payer === undefined ? null : <input type="hidden" name="payer" value={filters.payer} />}
    </>
  );
}

/** The database's sentence as a sentence's start. */
const sentenceStart = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * Said in place of a region's form while the person may not start pricing here (security F1): the database's reason,
 * as Uploads says it, and when the months are priced. The press would be refused (RUN_STARTING_ROUTES), so none is
 * offered. The owner's hold pauses the practice's own pricing until it is lifted (`resumes`), and a closure restarts
 * nothing (BIL-09). A grantee's hold stops only this person's work through the grant (PR #104 review security F1;
 * docs/adr/0080): its sentence alone, and what the practice's own work still does (`carriesOn`), if anything.
 */
export function PausedText({ suspension, resumes, carriesOn = null }: { readonly suspension: WorkPause; readonly resumes: string; readonly carriesOn?: string | null }) {
  const text =
    suspension.source === 'grantee'
      ? `${sentenceStart(suspension.reason)}.${carriesOn === null ? '' : ` ${carriesOn}`}`
      : suspension.restarts
        ? `Pricing is paused: ${suspension.reason}. ${resumes}`
        : `Pricing has stopped: ${suspension.reason}.`;
  return (
    <p className="text-sm" data-state="paused" data-hold-source={suspension.source}>
      {text}
    </p>
  );
}

/**
 * "Months waiting for a first run" (design 4.1; MAP-07): the months no run covers holding lines of mapped plans and of
 * plans with no mapping (for a plan's page, those holding its lines), not held on the billing ZIP or Medicare content
 * (those have their own cards on Coverage), each with its lines to price, its lines with no mapping and its billed
 * dollars (UX-10), with "Price them now" for a person who may map plans, or why pricing is paused. Nothing when there
 * are none.
 */
export function MonthsWaitingRegion({
  practiceId,
  planId,
  waiting,
  canMap,
  action,
  formKeys,
  filters,
  suspension = null,
}: {
  readonly practiceId: string;
  /** The plan whose page it is on; null on the mapping list. */
  readonly planId: string | null;
  readonly waiting: MonthsWaiting;
  readonly canMap: boolean;
  readonly action: FormAction;
  readonly formKeys: () => ReactNode;
  /** The mapping list's filters, posted back with the form (UX-7); none on a plan's page. */
  readonly filters?: ListFilters;
  /** Why the person starts no pricing here now (workPause with mapping.edit), or null. */
  readonly suspension?: WorkPause | null;
}) {
  if (waiting.months.length === 0) {
    return null;
  }
  const label = 'The months waiting';
  return (
    <section aria-label="Months waiting for a first run" className="flex flex-col gap-2" data-region="months-waiting">
      <h2 className="text-xl font-bold tracking-display">Months waiting for a first run</h2>
      <p className="text-sm" data-state="months-waiting">
        <MonthsWaitingSentences parts={monthsWaitingParts(waiting, planId !== null)} />
      </p>
      {planId === null ? null : <p className="text-sm text-muted-foreground">Each month’s figures are the whole month’s, every plan’s lines: what “Price them now” prices.</p>}
      <StackedRows
        label={label}
        stackBelow="32rem"
        headingLevel={3}
        table={
          <ScrollTable label={label}>
            <table className="w-full min-w-[32rem] text-left text-sm" aria-label={label}>
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{WAITING_COLUMNS.month}</th>
                  <th className="py-1 pr-3 text-right font-medium">{WAITING_COLUMNS.toPrice}</th>
                  <th className="py-1 pr-3 text-right font-medium">{WAITING_COLUMNS.unmapped}</th>
                  <th className="py-1 text-right font-medium">{WAITING_COLUMNS.billed}</th>
                </tr>
              </thead>
              <tbody>
                {waiting.months.map((month) => (
                  <tr key={month.periodFrom} className="border-t align-top" data-waiting-month={month.periodFrom}>
                    <td className="py-1 pr-3">
                      <Dates from={month.periodFrom} to={month.periodTo} />
                    </td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.linesToPrice.toLocaleString('en-US')}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.unmappedLines.toLocaleString('en-US')}</td>
                    <td className="py-1 text-right font-mono tabular-nums">
                      <Money value={month.chargeCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        }
        rows={waiting.months.map(
          (month): StackedRow => ({
            key: month.periodFrom,
            hooks: { 'data-stacked-waiting-month': month.periodFrom },
            heading: <Dates from={month.periodFrom} to={month.periodTo} />,
            fields: waitingFields(month),
          }),
        )}
      />
      {!canMap ? null : suspension !== null ? (
        <PausedText
          suspension={suspension}
          resumes="These months are priced by the daily monitoring once it is resolved."
          carriesOn="The practice’s daily monitoring still prices these months."
        />
      ) : (
        <ActionForm action={action} submit="Price them now" variant="outline" className="flex w-full flex-col gap-2 sm:w-auto [&_button[type=submit]]:w-full sm:[&_button[type=submit]]:w-auto">
          {formKeys()}
          <input type="hidden" name="practiceId" value={practiceId} />
          <PlanField planId={planId} />
          <FilterFields filters={planId === null ? filters : undefined} />
        </ActionForm>
      )}
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

/**
 * Why the last re-run failed when a plan was mapped after it failed (PR #95 review R2-3, LastFailure.mappedSince): what
 * it waited on may still hold, so the words never say it has been fixed; the new mapping alone offers the month again.
 */
export const LAST_FAILURE_MAPPED_SINCE_TEXT: Readonly<Record<'location' | 'content', string>> = {
  location: 'it stopped on the billing ZIP or ZIP+4 before another plan was mapped, and may stop there again',
  content: 'it stopped on Medicare content PaidWhole had not loaded before another plan was mapped, and may stop there again',
};

/** The words after "The last re-run failed: ", or null when the reason has none of its own ('other'). */
export function lastFailureText(failure: LastFailure): string | null {
  if (failure.reason === 'other') {
    return null;
  }
  return failure.mappedSince && (failure.reason === 'location' || failure.reason === 'content') ? LAST_FAILURE_MAPPED_SINCE_TEXT[failure.reason] : LAST_FAILURE_TEXT[failure.reason];
}

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

/**
 * The words of a month's state as plain text (the unit test reads them; the cell renders them with their links). A
 * ready month none of whose listed lines a re-run would price (every one's plan mapped as no agreement, government or
 * other: `recordOnly`) is "Ready to record under its mapping", never "price" (PR #95 review UX-3).
 */
export function priceAgainStateText(state: PriceAgainState, recordOnly = false): string {
  switch (state.kind) {
    case 'being_priced':
      return 'Being priced again';
    case 'to_accept':
      return 'Priced again: review and accept';
    case 'waiting':
      return 'Waits for a newer run of these dates to finish; it is listed again then, or priced by it';
    case 'rerun_failed':
      return `${RERUN_FAILED_TEXT[state.wait].label}: ${RERUN_FAILED_TEXT[state.wait].text}`;
    case 'ready': {
      const ready = recordOnly ? 'Ready to record under its mapping' : 'Ready to price again';
      if (state.lastFailure === null) {
        return ready;
      }
      const why = lastFailureText(state.lastFailure);
      return why === null ? `${ready}. The last re-run failed.` : `${ready}. The last re-run failed: ${why}.`;
    }
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
function StateCell({ practiceId, state, recordOnly }: { readonly practiceId: string; readonly state: PriceAgainState; readonly recordOnly: boolean }) {
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
        <>{priceAgainStateText(state, recordOnly)}</>
      ) : (
        <>
          {priceAgainStateText(state, recordOnly)} {rerunLink(practiceId, state.lastFailure.rerunId, 'See the re-run')}
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
    return { lines: row.month.lines.toLocaleString('en-US'), billed: <Money value={row.month.chargeCents} />, state: <StateCell practiceId={practiceId} state={row.month.state} recordOnly={row.month.linesToPrice === 0} /> };
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

/**
 * "Price these months again (3)": the count of ready months the form posts, in the mono face (brand.md; UX-8). When a
 * re-run would price no line of any ready month (`recordOnly`: every one's plan mapped as no agreement, government or
 * other), "Record these months under their mappings (3)", so the verb matches the months' state and figure 2's link
 * (PR #95 UX recheck R-2); the action, its route and its notices are the same.
 */
export function priceAgainSubmit(count: number, recordOnly = false): ReactNode {
  const label = recordOnly ? 'Record these months under their mappings' : 'Price these months again';
  // One child of the button: the button lays its children out as flex items with a gap, which would part the count
  // from its brackets on screen and in the button's accessible name ("( 1 )").
  return (
    <span>
      {label} (<span className="font-mono tabular-nums">{count.toLocaleString('en-US')}</span>)
    </span>
  );
}

/**
 * What a press of "Price these months again" does, under the button (UX-3): each re-run prices the lines of plans mapped
 * to a contract version or as Medicare Advantage non-contracted, except a line it cannot price, which keeps its reason
 * (the count is by mapping kind, never a promise of a price: PR #95 UX recheck R-1), and records the rest under their
 * mapping, unpriced.
 */
export const PRICE_AGAIN_HELP =
  'Creates a re-run of each month in your name: lines of plans mapped to a contract version or as Medicare Advantage non-contracted are priced, except a line it cannot price (such as a code the version has no rate for), which stays unpriced with that reason; lines of plans mapped as no agreement, government or other are recorded under that mapping and stay unpriced. Nothing changes until you accept each re-run on its page, after its list of changes.';

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
  filters,
  suspension = null,
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
  /** The mapping list's filters, posted back with the form (UX-7); none on a plan's page. */
  readonly filters?: ListFilters;
  /** Why the person starts no pricing here now (workPause with mapping.edit), or null: no form is offered while it holds. */
  readonly suspension?: WorkPause | null;
}) {
  const rows: readonly MonthRow[] = [...months.priceAgain.map((month) => ({ kind: 'price_again' as const, month })), ...months.toTriage.map((month) => ({ kind: 'to_triage' as const, month }))];
  const title = planId === null ? 'Months with lines of mapped plans not priced' : 'Months holding this plan’s lines that are not priced';
  const label = planId === null ? 'Months to price again' : 'Months holding this plan’s lines that are not priced';
  if (rows.length === 0 && planId === null) {
    return null;
  }
  const keyOf = (row: MonthRow) => `${row.kind}:${row.month.pricingRunId}`;
  const ready = months.readyRunIds;
  const offered = canMap && ready.length > 0 && months.releaseNo !== null && suspension === null;
  // R-2: the button says "Record" only when a re-run would price no line of any month it posts.
  const recordOnly = months.priceAgain.filter((month) => ready.includes(month.pricingRunId)).every((month) => month.linesToPrice === 0);
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
          submit={priceAgainSubmit(ready.length, recordOnly)}
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
          <FilterFields filters={planId === null ? filters : undefined} />
          <p className="text-sm text-muted-foreground">{PRICE_AGAIN_HELP}</p>
        </ActionForm>
      ) : null}
      {canMap && suspension !== null && ready.length > 0 ? (
        <PausedText suspension={suspension} resumes="These months can be priced again here once it is resolved." />
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
