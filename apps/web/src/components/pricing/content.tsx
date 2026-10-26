import { Fragment, type ReactNode } from 'react';

import { type ContentWaitMonth, FAMILY_NAME, waitingOnText } from '../../lib/pricing/content';
import type { FamilyThrough } from '../../lib/releases/content-through';
import { Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';

/**
 * The months that wait on Medicare content PaidWhole has not loaded (audit #7; docs/adr/0071), as Coverage lists them,
 * beside the months waiting on the billing ZIP (location.tsx) and in the same table shape: each month's lines and billed
 * dollars, and what it waits on in words, never a color alone. Money, quarters, family codes and release numbers in the
 * mono face, as the Coverage fee-schedule sentence sets its quarters (review S9). At a phone's width the table
 * scrolls inside a region the keyboard reaches (ScrollTable).
 */
export function MonthsWaitingOnContent({ months, label }: { readonly months: readonly ContentWaitMonth[]; readonly label: string }) {
  return (
    <ScrollTable label={label}>
      <table className="w-full min-w-[32rem] text-left text-sm" aria-label={label}>
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Month</th>
            <th className="py-1 pr-3 font-medium">Waiting on</th>
            <th className="py-1 pr-3 text-right font-medium">Lines</th>
            <th className="py-1 text-right font-medium">Billed</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.periodFrom} className="border-t align-top" data-waiting-month={month.periodFrom.slice(0, 7)} data-kind={month.kind} data-code={month.failureCode}>
              <td className="py-1 pr-3 font-mono tabular-nums">{month.periodFrom.slice(0, 7)}</td>
              <td className="py-1 pr-3">
                <WaitingOn month={month} />
              </td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.totals.lines}</td>
              <td className="py-1 text-right">
                <Money value={month.totals.chargeCents} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

const mono = (text: string) => <span className="font-mono tabular-nums">{text}</span>;

/** Each item, mono, joined by commas. */
function listed(items: readonly string[]): ReactNode {
  return items.map((item, index) => (
    <Fragment key={item}>
      {index > 0 ? ', ' : ''}
      {mono(item)}
    </Fragment>
  ));
}

/** waitingOnText's words, with its quarters, family codes and release number in the mono face. */
function WaitingOn({ month }: { readonly month: ContentWaitMonth }) {
  if (month.kind === 'repricing') {
    return <>being priced again under release {mono(String(month.releaseInForce))}</>;
  }
  if (month.kind === 'terms_changed') {
    return <>{waitingOnText(month)}</>;
  }
  const families = listed(month.families.map((family) => FAMILY_NAME[family]));
  return month.quarters.length === 0 ? (
    <>the Medicare content ({families})</>
  ) : (
    <>
      the {listed(month.quarters)} Medicare content ({families})
    </>
  );
}

/**
 * Through what date the release in force loads each content family (audit #59; docs/adr/0071), as the Releases page
 * lists them: every family it is given, one the release does not load, loads only in part or loads only from a later
 * day included, in words, so the list is never read as complete when it is not. Dates in the mono face.
 */
export function ReleaseLoadedThrough({ families }: { readonly families: readonly FamilyThrough[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-label="Loaded through">
      {families.map((family) => (
        <li key={family.family} data-family={family.family} data-through={throughState(family)}>
          {throughText(family)}
        </li>
      ))}
    </ul>
  );
}

/** The row's state for tests and the screen tour: a date, open, later, partly or not_loaded. */
function throughState(family: FamilyThrough): string {
  if (family.open) {
    return 'open';
  }
  if (family.through !== null) {
    return family.through;
  }
  if (family.loaded) {
    return 'later';
  }
  return family.partly ? 'partly' : 'not_loaded';
}

function throughText(family: FamilyThrough): ReactNode {
  if (family.open) {
    return `${family.title}: in force, no end date`;
  }
  if (family.through !== null) {
    return (
      <>
        {family.title}: loaded through <span className="font-mono tabular-nums">{family.through}</span>
      </>
    );
  }
  if (!family.loaded) {
    return family.partly ? `${family.title}: only partly loaded in this release` : `${family.title}: not loaded in this release`;
  }
  return family.from === null ? (
    `${family.title}: loaded only from a later date`
  ) : (
    <>
      {family.title}: loaded only from <span className="font-mono tabular-nums">{family.from}</span>
    </>
  );
}
