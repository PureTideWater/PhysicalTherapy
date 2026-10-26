import { quarterNameOf } from '@tp/rules';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { type ContentWaitMonth, FAMILY_NAME, waitingOnText } from '../../lib/pricing/content';
import type { FamilyThrough } from '../../lib/releases/content-through';
import { Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';

/**
 * The months that wait on Medicare content PaidWhole has not loaded (audit #7; docs/adr/0071), as Coverage lists them,
 * beside the months waiting on the billing ZIP (location.tsx) and in its table shape: each month's lines, claims, billed
 * and paid dollars, then its status in words, never a color alone: what it waits on, or that it is being priced again
 * (fix round 2 of PR #49, UX-4, UX-6). Money, family codes and release numbers in the mono face, quarters in a
 * person's words ("Q1 2027 (Jan–Mar)"). At a phone's width the table scrolls inside a region the keyboard reaches
 * (ScrollTable), named apart from the table it holds and the card around it (UX-5).
 */
export function MonthsWaitingOnContent({ months, label }: { readonly months: readonly ContentWaitMonth[]; readonly label: string }) {
  return (
    <ScrollTable label={label}>
      <table className="w-full min-w-[36rem] text-left text-sm" aria-label={label}>
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Month</th>
            <th className="py-1 pr-3 text-right font-medium">Lines</th>
            <th className="py-1 pr-3 text-right font-medium">Claims</th>
            <th className="py-1 pr-3 text-right font-medium">Billed</th>
            <th className="py-1 pr-3 text-right font-medium">Paid</th>
            <th className="py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.periodFrom} className="border-t align-top" data-waiting-month={month.periodFrom.slice(0, 7)} data-kind={month.kind} data-code={month.failureCode}>
              <td className="py-1 pr-3 font-mono tabular-nums">{month.periodFrom.slice(0, 7)}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.totals.lines}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.totals.claims}</td>
              <td className="py-1 pr-3 text-right">
                <Money value={month.totals.chargeCents} />
              </td>
              <td className="py-1 pr-3 text-right">
                <Money value={month.totals.paidCents} />
              </td>
              <td className="py-1">
                <WaitingOn month={month} />
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

/** waitingOnText's words, with its family codes and release number in the mono face. */
function WaitingOn({ month }: { readonly month: ContentWaitMonth }) {
  if (month.kind === 'repricing') {
    return <>Being priced again under release {mono(String(month.releaseInForce))}</>;
  }
  if (month.kind === 'terms_changed') {
    return <>{waitingOnText(month)}</>;
  }
  const families = listed(month.families.map((family) => FAMILY_NAME[family]));
  return month.quarters.length === 0 ? (
    <>Waiting on the Medicare content ({families})</>
  ) : (
    <>
      Waiting on the {month.quarters.map(quarterNameOf).join(', ')} Medicare content ({families})
    </>
  );
}

/**
 * Through what date the release in force loads each content family (audit #59; docs/adr/0071), as the Releases page
 * lists them: every family it is given, one the release does not load, loads only in part or loads only from a later
 * day included, in words, so the list is never read as complete when it is not. A family that has ended says that the
 * lines after it are not priced, and one partly loaded says what waits for it, with a link to Coverage, which lists
 * them (fix round 2 of PR #49, UX-8). Dates in the mono face, never broken.
 */
export function ReleaseLoadedThrough({ families, coverageHref }: { readonly families: readonly FamilyThrough[]; readonly coverageHref: string }) {
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-label="Loaded through">
      {families.map((family) => (
        <li key={family.family} data-family={family.family} data-through={throughState(family)}>
          {throughText(family, coverageHref)}
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

const date = (value: string) => <span className="whitespace-nowrap font-mono tabular-nums">{value}</span>;

function throughText(family: FamilyThrough, coverageHref: string): ReactNode {
  if (family.open) {
    return `${family.title}: in force, no end date`;
  }
  if (family.through !== null) {
    return family.ended ? (
      <>
        {family.title}: loaded through {date(family.through)} (ended; lines after that date are not priced until PaidWhole loads what follows)
      </>
    ) : (
      <>
        {family.title}: loaded through {date(family.through)}
      </>
    );
  }
  if (!family.loaded) {
    return family.partly ? (
      <>
        {family.title}: only partly loaded in this release. Lines that need the rest of it are not priced until it is loaded;{' '}
        <Link className="underline" href={coverageHref}>
          Coverage
        </Link>{' '}
        lists them.
      </>
    ) : (
      `${family.title}: not loaded in this release`
    );
  }
  return family.from === null ? (
    `${family.title}: loaded only from a later date`
  ) : (
    <>
      {family.title}: loaded only from {date(family.from)}
    </>
  );
}
