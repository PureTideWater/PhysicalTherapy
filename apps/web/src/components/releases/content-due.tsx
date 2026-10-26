import { CONTENT_CALENDAR, type ContentFamilyId, type DueItem } from '@tp/rules/calendar';
import type { ReactNode } from 'react';

import type { ContentDue } from '../../lib/routes/rule-releases';

/**
 * The console's Content due (audit #59; docs/adr/0071; docs/runbooks/content-updates.md, sections 4 and 6), for the
 * platform administrators of the Rule releases page: one row per family of the content calendar with the date the
 * release in force loads it through and its stage in words, then every item due, each with its title as a heading,
 * what happened, what to do and, where it has them, its exact commands (fix round 2 of PR #49, UX-1). The calendar's
 * own review is said once, as its item, never on each row. Dates stay whole at a phone's width; each command block is
 * a named region the keyboard reaches, as ScrollTable's scroller is.
 */

/** "Nothing due" when no item names the family. */
export const NOTHING_DUE = 'Nothing due';

/** A family's stages in words, in the order the calendar lists them; NOTHING_DUE when none is due. */
export function dueStatus(family: ContentDue['families'][number], items: readonly DueItem[]): string {
  const words = items.flatMap((item): string[] => {
    if (item.family !== family.family) {
      return [];
    }
    switch (item.stage) {
      case 'ends_in_45':
        return ['ends within 45 days'];
      case 'ends_in_14':
        return ['ends within 14 days'];
      case 'ended':
        return [`ended ${item.loadedThrough ?? ''}`.trim()];
      case 'no_draft':
        return [`${item.period?.label ?? ''} has no draft (due ${item.dueOn ?? ''})`];
      case 'overdue':
        return [`${item.period?.label ?? ''} files not loaded`];
      case 'not_loaded':
        return [family.partly ? 'partly loaded' : 'not loaded'];
      case 'calendar_review_due':
        return ['calendar entry due for review'];
      case 'no_release':
      case 'calendar_unreviewed':
        // Said once, as their own items.
        return [];
    }
  });
  return words.length === 0 ? NOTHING_DUE : words.join('; ');
}

const date = (value: string) => <span className="whitespace-nowrap font-mono tabular-nums">{value}</span>;

/** The family's loaded-through cell, in the Releases page's words (components/pricing/content.tsx, ReleaseLoadedThrough). */
function loadedThroughCell(family: ContentDue['families'][number]): ReactNode {
  if (family.open) {
    return 'in force, no end date';
  }
  if (family.loadedThrough !== null) {
    return date(family.loadedThrough);
  }
  if (!family.loaded) {
    return family.partly ? 'partly loaded' : 'not loaded';
  }
  return family.loadedFrom === null ? 'only from a later date' : <>only from {date(family.loadedFrom)}</>;
}

function sourceOf(family: ContentFamilyId | null): ReactNode {
  const entry = family === null ? undefined : CONTENT_CALENDAR.find((one) => one.family === family);
  return entry === undefined ? (
    'its source'
  ) : (
    <a className="underline" href={entry.source.page} rel="noreferrer">
      {entry.source.title}
    </a>
  );
}

const RUNBOOK = <span className="font-mono text-xs">docs/runbooks/content-updates.md</span>;

/** What to do about an item, as the runbook's table in section 4 says it, for the person who loads content. */
export function NextStep({ item }: { readonly item: DueItem }) {
  switch (item.stage) {
    case 'no_release':
      return <>Prepare the first release from the drafts at L2 or higher (Drafts and prepared releases, below) and open its pull request; CI publishes it when the pull request merges.</>;
    case 'not_loaded':
      return <>Download the family’s files for each period the commands name from {sourceOf(item.family)}, then run the commands.</>;
    case 'ended':
      return (
        <>
          Download every period the commands name from {sourceOf(item.family)} and run them now: lines after {item.loadedThrough === null ? 'its end' : date(item.loadedThrough)} are not priced until a release in
          force loads it.
        </>
      );
    case 'ends_in_14':
    case 'ends_in_45':
      return <>Download the next period’s files from {sourceOf(item.family)} when it publishes them, then run the commands.</>;
    case 'no_draft':
      return <>Import the period now: download its files from {sourceOf(item.family)}, then run the commands.</>;
    case 'overdue':
      return <>Check {sourceOf(item.family)}: download and import the new files with the commands, or, if it has not published them yet, say so on the open issue.</>;
    case 'calendar_unreviewed':
      return <>Review each entry listed against its source page, then set its review in a pull request, as section 5 of {RUNBOOK} says.</>;
    case 'calendar_review_due':
      return <>Review the entry again, as section 5 of {RUNBOOK} says.</>;
  }
}

/** The item's sentences: a paragraph, and the lines a calendar finding lists ("- ...") as a list. */
function ItemLines({ lines }: { readonly lines: readonly string[] }) {
  const text = lines.filter((line) => !line.startsWith('- '));
  const listed = lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
  return (
    <>
      {text.length === 0 ? null : <p className="text-sm">{text.join(' ')}</p>}
      {listed.length === 0 ? null : (
        <ul className="list-disc pl-5 text-sm">
          {listed.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A block of commands or problems: a named region the keyboard reaches and scrolls, with a visible focus ring. */
function Block({ label, state, children }: { readonly label: string; readonly state?: string; readonly children: string }) {
  return (
    <pre
      role="region"
      aria-label={label}
      tabIndex={0}
      data-state={state}
      className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </pre>
  );
}

export function ContentDueSection({ due }: { readonly due: ContentDue }) {
  return (
    <section aria-label="Content due" className="flex flex-col gap-2">
      <h2 className="text-xl font-bold tracking-display">Content due</h2>
      {due.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is due.</p> : null}
      <table className="w-full text-left text-sm" aria-label="Content due by family">
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              Content
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Loaded through
            </th>
            <th scope="col" className="py-1 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {due.families.map((family) => (
            <tr key={family.family} className="border-t align-top" data-family={family.family}>
              <th scope="row" className="py-1 pr-3 font-normal">
                {family.title}
              </th>
              <td className="py-1 pr-3">{loadedThroughCell(family)}</td>
              <td className="py-1">{dueStatus(family, due.items)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {due.items.some((item) => item.commands.length > 0) ? (
        <p className="text-sm text-muted-foreground">
          Run the commands from the root of the content checkout, with each placeholder in angle brackets filled: the file you downloaded and the address you downloaded it from.
        </p>
      ) : null}
      {due.items.map((item) => (
        <div key={item.title} className="flex flex-col gap-1 border-t pt-2" data-stage={item.stage}>
          <h3 className="font-medium">{item.title}</h3>
          <ItemLines lines={item.lines} />
          <p className="text-sm" data-state="next-step">
            <NextStep item={item} />
          </p>
          {item.commands.length === 0 ? null : <Block label={`Commands: ${item.title}`}>{item.commands.join('\n')}</Block>}
        </div>
      ))}
      {due.problems.length === 0 ? null : (
        <Block label="Drafts and prepared releases that cannot be read" state="due-problems">
          {due.problems.join('\n')}
        </Block>
      )}
    </section>
  );
}
