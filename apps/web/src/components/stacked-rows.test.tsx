import { Badge } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ScrollTable } from './scroll-table';
import { type StackBelow, type StackedField, type StackedRow, StackedRows, brandOrderProblems, rendersNothing, repeatedIds } from './stacked-rows';
import { StatusChip } from './status';

/**
 * The one stacked-row layout (docs/adr/0078; test matrix TBL-04; UX-079 (c); the design review's DR-07, DR-08 and
 * DR-13; an item's description and the terms' 40% column from its first user, the screening result). A server
 * component, so the markup it owns is proven here; the switch between the copies in a real browser is proven by its
 * first user's phone spec. Every row is SYNTHETIC, written by hand.
 */

/** One constant for the table's headers and the rows' labels, read in order for both (DR-08). */
const COLUMNS = {
  pattern: 'Pattern',
  charge: 'Charge',
  expected: 'Expected allowed',
  paid: 'Observed allowed',
  short: 'Short',
  paidOut: 'Paid',
  state: 'State',
} as const;

const fields = (): readonly StackedField[] => [
  { label: COLUMNS.pattern, value: 'Paid below the contract on SYNTHETIC 97110' },
  { label: COLUMNS.charge, value: '$150.00', mono: true },
  { label: COLUMNS.expected, value: '$90.00', figure: 'expected' },
  { label: COLUMNS.paid, value: '$60.00', figure: 'paid' },
  { label: COLUMNS.short, value: '$30.00', figure: 'short' },
  { label: COLUMNS.paidOut, value: '$48.00', mono: true },
  {
    label: COLUMNS.state,
    // The stacked copy's chip carries none of the table's hooks (its data-status stays in the table).
    value: <StatusChip tone="short">Actionable: three lines short of the SYNTHETIC contract</StatusChip>,
  },
];

const caseRow = (key: string, changes: Partial<StackedRow> = {}): StackedRow => ({
  key,
  hooks: { 'data-stacked-case': key },
  heading: (
    <Link className="underline" href={`/p/synthetic/cases/${key}`}>
      Payer Q, SYNPLAN FIX ONE
    </Link>
  ),
  fields: fields(),
  ...changes,
});

/** The same rows as a table, its rows carrying the specs' hooks (data-case, data-state). */
const casesTable = (keys: readonly string[]) => (
  <ScrollTable label="Cases">
    <table className="w-full min-w-[54rem] text-left text-sm" aria-label="Cases">
      <thead>
        <tr>
          {Object.values(COLUMNS).map((label) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => (
          <tr key={key} data-case={key} data-state="open">
            <td>
              <StatusChip tone="short" data-status="actionable">
                Actionable
              </StatusChip>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </ScrollTable>
);

/** The <li> of one row, by its key. */
const item = (html: string, key: string) => new RegExp(`<li [^>]*data-stacked-row="${key}"[^>]*>([\\s\\S]*?)</li>`).exec(html)?.[1] ?? '';
const terms = (html: string) => [...html.matchAll(/<dt [^>]*>([^<]*)<\/dt>/g)].map((match) => match[1]);
const ddOf = (html: string, label: string) => new RegExp(`<dt [^>]*>${label}</dt><dd ([^>]*)>`).exec(html)?.[1] ?? '';

/** Each value's classes: under 24rem, where terms stand over values, a value keeps 8 px below it, the last one none. */
const PAIRED = '@max-[24rem]:not-last:pb-2';
const VALUE = `class="min-w-0 wrap-anywhere [&amp;_[data-slot=status-chip]]:whitespace-normal [&amp;_[data-slot=badge]]:whitespace-normal ${PAIRED}"`;
const MONO = `class="min-w-0 font-mono tabular-nums wrap-anywhere ${PAIRED}"`;

/** What a row's actions or description may be when they render nothing: a condition that is false, an empty string or an empty list. */
const NOTHING: readonly (readonly [string, ReactNode])[] = [
  ['false', false],
  ['an empty string', ''],
  ['an empty list', []],
  ['a list of nothing', [false, null]],
  ['undefined', undefined],
  ['null', null],
  ['true', true],
];
/** A number, text or an element renders. */
const SOMETHING: readonly (readonly [string, ReactNode])[] = [
  ['zero', 0],
  ['text', 'Read only'],
  ['a list of an element', [<span key="a">Read only</span>]],
];

describe('one stacked-row layout', () => {
  it('is a list named by its label, or by the id of the title that names it, with one item per row carrying the row’s key; a list by its role too, which Safari drops from an unstyled list', () => {
    const html = renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1'), caseRow('case-2')]} />);
    expect(html).toMatch(/<ul role="list" data-stacked-copy="rows" aria-label="Cases" class="flex flex-col gap-3">/);
    expect([...html.matchAll(/<li [^>]*data-stacked-row="([^"]+)"/g)].map((match) => match[1])).toEqual(['case-1', 'case-2']);
    expect(html.match(/<li /g)).toHaveLength(2);
    const labelled = renderToStaticMarkup(<StackedRows labelledBy="cases-title" rows={[caseRow('case-1')]} />);
    expect(labelled).toContain('<ul role="list" data-stacked-copy="rows" aria-labelledby="cases-title" class="flex flex-col gap-3">');
    expect(labelled).not.toContain('aria-label=');
  });

  it('heads each row with its naming cell at the level the caller gives, h3 by default, a link kept as a link', () => {
    const html = renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1')]} />);
    expect(item(html, 'case-1')).toMatch(/^<h3 class="text-base font-semibold wrap-anywhere"><a class="underline" href="\/p\/synthetic\/cases\/case-1">Payer Q, SYNPLAN FIX ONE<\/a><\/h3>/);
    for (const level of [2, 3, 4] as const) {
      const leveled = renderToStaticMarkup(<StackedRows label="Cases" headingLevel={level} rows={[caseRow('case-1')]} />);
      expect(item(leveled, 'case-1')).toMatch(new RegExp(`^<h${String(level)} class="text-base font-semibold wrap-anywhere">`));
    }
  });

  it('puts a row’s description, when given, between its heading and its facts, outside the heading, and none for a description that renders nothing', () => {
    const description = 'Each figure is the sum of the SYNTHETIC cases this page does not list.';
    const html = renderToStaticMarkup(
      <StackedRows
        label="Cases"
        rows={[
          caseRow('others', {
            heading: 'The other 2 cases, summed',
            description,
            actions: (
              <Link className="underline" href="/p/synthetic/cases">
                Open the cases
              </Link>
            ),
          }),
          caseRow('case-1'),
        ]}
      />,
    );
    // The heading stays the naming cell alone, so a list read by its headings stays short; the line comes before the figures it explains.
    expect(item(html, 'others')).toMatch(
      new RegExp(`^<h3 class="text-base font-semibold wrap-anywhere">The other 2 cases, summed</h3><p class="mt-1 text-sm text-muted-foreground">${description}</p><dl [^>]*>[\\s\\S]*</dl><div class="mt-3 flex flex-col items-start gap-2">`),
    );
    expect(html.match(/<p /g)).toHaveLength(1);
    expect(item(html, 'case-1')).toMatch(/<\/h3><dl /);
    for (const [what, nothing] of NOTHING) {
      expect(item(renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1', { description: nothing })]} />), 'case-1'), what).toMatch(/<\/h3><dl /);
    }
    for (const [what, something] of SOMETHING) {
      expect(item(renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1', { description: something })]} />), 'case-1'), what).toMatch(/<\/h3><p class="mt-1 text-sm text-muted-foreground">[\s\S]+<\/p><dl /);
    }
  });

  it('gives each field a term and a value in one definition list, under the given labels, terms above values until the list is wide enough for two columns and beside them after, in a term column of at most 40% of the list, each pair apart from the next in either layout', () => {
    const html = item(renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1')]} />), 'case-1');
    expect(html.match(/<dl /g)).toHaveLength(1);
    // fit-content(40%): the term column takes its longest term up to 40% of the list, so a longer term wraps between words rather than leave its value a sliver.
    // From 24rem the pairs stand 8 px apart, so a term wrapped beside its value is not read into the next (UX review UXR-04).
    expect(html).toContain('<dl class="mt-2 grid grid-cols-1 gap-y-1 text-sm @min-[24rem]:grid-cols-[fit-content(40%)_1fr] @min-[24rem]:gap-x-4 @min-[24rem]:gap-y-2">');
    expect(terms(html)).toEqual(Object.values(COLUMNS));
    expect(html.match(/<dd /g)).toHaveLength(fields().length);
    expect(html.match(/<dt class="text-muted-foreground">/g)).toHaveLength(fields().length);
    // A long value wraps inside the card instead of passing the window.
    expect(ddOf(html, COLUMNS.pattern)).toBe(VALUE);
    // Every value but the last keeps 8 px below it while terms stand over values (under 24rem), so a figure sits nearer its own term than the next.
    expect(html.match(/<dd [^>]*@max-\[24rem\]:not-last:pb-2/g)).toHaveLength(fields().length);
  });

  it('renders the fields in the order given, and checks the brand’s order instead of fixing it: expected, paid and short, together and in that order (DR-08)', () => {
    const charge: StackedField = { label: 'Charge', value: '$150.00', mono: true };
    const expected: StackedField = { label: 'Expected allowed', value: '$90.00', figure: 'expected' };
    const observed: StackedField = { label: 'Observed allowed', value: '$60.00', figure: 'paid' };
    const short: StackedField = { label: 'Short', value: '$30.00', figure: 'short' };
    const paid: StackedField = { label: 'Paid', value: '$48.00', mono: true };
    // Given out of order: found, and rendered as given.
    const outOfOrder = [charge, short, expected, observed, paid];
    expect(brandOrderProblems(outOfOrder)).toEqual(['Expected allowed (expected) comes after Short (short): expected, paid and short go in that order.']);
    const html = renderToStaticMarkup(<StackedRows label="Lines" rows={[{ key: 'line-1', heading: 'Line 1', fields: outOfOrder }]} />);
    expect(terms(html)).toEqual(['Charge', 'Short', 'Expected allowed', 'Observed allowed', 'Paid']);
    // Apart: found.
    expect(brandOrderProblems([expected, charge, observed, short])).toEqual(['Charge stands between the figures: expected, paid and short stand together.']);
    expect(brandOrderProblems([short, observed, expected])).toEqual([
      'Observed allowed (paid) comes after Short (short): expected, paid and short go in that order.',
      'Expected allowed (expected) comes after Observed allowed (paid): expected, paid and short go in that order.',
    ]);
    // The brand's order, among other fields before and after: accepted, as is a list with fewer than three or none.
    expect(brandOrderProblems([charge, expected, observed, short, paid])).toEqual([]);
    expect(brandOrderProblems(fields())).toEqual([]);
    expect(brandOrderProblems([charge, expected, short, paid])).toEqual([]);
    expect(brandOrderProblems([charge, paid])).toEqual([]);
    // A role given twice keeps the order when it stands with its own role.
    expect(brandOrderProblems([expected, { ...expected, label: 'Expected allowed, reduced' }, observed, short])).toEqual([]);
  });

  it('shows each figure and each code or count in the mono face with tabular numerals, a figure naming its role', () => {
    const html = item(renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1')]} />), 'case-1');
    expect(ddOf(html, COLUMNS.expected)).toBe(`${MONO} data-stacked-figure="expected"`);
    expect(ddOf(html, COLUMNS.paid)).toBe(`${MONO} data-stacked-figure="paid"`);
    expect(ddOf(html, COLUMNS.short)).toBe(`${MONO} data-stacked-figure="short"`);
    expect(ddOf(html, COLUMNS.charge)).toBe(MONO);
    expect(ddOf(html, COLUMNS.paidOut)).toBe(MONO);
    // Only the fields marked as a figure or mono are in the mono face.
    expect(html.match(/font-mono tabular-nums/g)).toHaveLength(5);
  });

  it('lets a status chip wrap inside the card, and leaves its tone to the caller (UX-040)', () => {
    const html = item(renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1')]} />), 'case-1');
    expect(ddOf(html, COLUMNS.state)).toContain('[&amp;_[data-slot=status-chip]]:whitespace-normal');
    expect(html).toContain('data-slot="status-chip" data-tone="short"');
    // No tone class outside the chip the caller rendered.
    const withoutChip = html.replace(/<span data-slot="status-chip"[^>]*>[^<]*<\/span>/, '');
    expect(withoutChip).not.toMatch(/status-(whole|short|unpriced)|pw-status|danger/);
  });

  it('lets a Badge status and a key longer than the card wrap inside it, as a chip does (UX-PR79-03)', () => {
    // A case's state as a Badge (whitespace-nowrap in a table cell), and a 36-character SYNTHETIC key in the mono face.
    const key = 'SYNTHETIC-0000-4000-8000-00000000001';
    const html = item(
      renderToStaticMarkup(
        <StackedRows
          label="Cases"
          rows={[
            caseRow('case-1', {
              fields: [
                { label: COLUMNS.state, value: <Badge variant="default">Awaiting the payer’s response to the SYNTHETIC packet</Badge> },
                { label: 'Document', value: key, mono: true },
              ],
            }),
          ]}
        />,
      ),
      'case-1',
    );
    expect(key).toHaveLength(36);
    expect(ddOf(html, COLUMNS.state)).toBe(VALUE);
    expect(html).toMatch(/<dd [^>]*\[&amp;_\[data-slot=badge\]\]:whitespace-normal[^>]*><span data-slot="badge" class="[^"]*\bwhitespace-nowrap\b/);
    expect(ddOf(html, 'Document')).toBe(MONO);
    expect(html).toContain(`>${key}</dd>`);
  });

  it('puts the row’s actions after the facts, full width, and renders no actions box when there are none', () => {
    const html = renderToStaticMarkup(
      <StackedRows
        label="Cases"
        rows={[
          caseRow('case-1', {
            actions: (
              <Link className="underline" href="/p/synthetic/cases/case-1/packet">
                Open the packet
              </Link>
            ),
          }),
          caseRow('case-2'),
        ]}
      />,
    );
    expect(item(html, 'case-1')).toMatch(/<\/dl><div class="mt-3 flex flex-col items-start gap-2"><a class="underline" href="\/p\/synthetic\/cases\/case-1\/packet">Open the packet<\/a><\/div>$/);
    expect(item(html, 'case-2')).toMatch(/<\/dl>$/);
  });

  it('renders no actions box for actions that render nothing: a condition that is false, an empty string or an empty list', () => {
    for (const [what, actions] of NOTHING) {
      expect(rendersNothing(actions), what).toBe(true);
      const html = renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1', { actions })]} />);
      expect(item(html, 'case-1'), what).toMatch(/<\/dl>$/);
    }
    // A number, text or an element renders, so it gets the box.
    for (const [what, actions] of SOMETHING) {
      expect(rendersNothing(actions), what).toBe(false);
      const html = renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1', { actions })]} />);
      expect(item(html, 'case-1'), what).toMatch(/<div class="mt-3 flex flex-col items-start gap-2">/);
    }
  });

  it('carries the caller’s own hooks on each item and repeats no id and no hook of the table’s (DR-07)', () => {
    const html = renderToStaticMarkup(<StackedRows label="Cases" stackBelow="54rem" table={casesTable(['case-1', 'case-2'])} rows={[caseRow('case-1'), caseRow('case-2')]} />);
    expect(html).toMatch(/<li data-stacked-case="case-1" data-stacked-row="case-1" class="rounded-md border p-4">/);
    const list = /<ul data-stacked-copy="rows"[\s\S]*<\/ul>/.exec(html)?.[0] ?? '';
    expect(list).not.toContain('data-case=');
    expect(html.match(/data-case=/g)).toHaveLength(2);
    expect(repeatedIds(html)).toEqual([]);
  });

  it('finds an id that repeats anywhere, and a table’s hook the stacked copy repeats, never the parts every component names for itself (DR-07)', () => {
    // A caller that gives the stacked copy the table's own hook, and the same id in both copies.
    const repeating = renderToStaticMarkup(
      <StackedRows
        label="Cases"
        stackBelow="54rem"
        table={
          <ScrollTable label="Cases">
            <table aria-label="Cases">
              <tbody>
                <tr data-case="case-1">
                  <td id="case-1-owner">Owner</td>
                </tr>
              </tbody>
            </table>
          </ScrollTable>
        }
        rows={[caseRow('case-1', { hooks: { 'data-case': 'case-1' }, fields: [{ label: 'Owner', value: <span id="case-1-owner">Owner</span> }] })]}
      />,
    );
    expect(repeatedIds(repeating)).toEqual(['id="case-1-owner"', 'data-case="case-1"']);
    // The table's own rows may share a value between them (two open cases); only a repeat in the stacked copy counts.
    expect(repeatedIds(renderToStaticMarkup(casesTable(['case-1', 'case-2'])))).toEqual([]);
    // An id that repeats with no stacked rows at all is still a repeat.
    expect(repeatedIds('<p id="a"></p><p id="a"></p>')).toEqual(['id="a"']);
  });

  it('pairs with its table by a container query at the table’s own width: the table from there up, the rows below it; and is never squeezed to nothing (DR-13)', () => {
    const html = renderToStaticMarkup(<StackedRows label="Cases" stackBelow="54rem" table={casesTable(['case-1'])} rows={[caseRow('case-1')]} />);
    expect(html).toMatch(
      /^<div data-slot="stacked-rows" class="@container w-full min-w-0"><div data-stacked-copy="table" class="hidden @min-\[54rem\]:block"><div data-slot="scroll-table" [\s\S]*<\/div><ul role="list" data-stacked-copy="rows" aria-label="Cases" class="flex flex-col gap-3 @min-\[54rem\]:hidden">/,
    );
    // Each width the tables use maps to its own literal classes, so Tailwind generates every one.
    for (const width of ['32rem', '36rem', '40rem', '48rem', '54rem'] as const satisfies readonly StackBelow[]) {
      const paired = renderToStaticMarkup(<StackedRows label="Cases" stackBelow={width} table={casesTable(['case-1'])} rows={[caseRow('case-1')]} />);
      expect(paired).toContain(`<div data-stacked-copy="table" class="hidden @min-[${width}]:block">`);
      expect(paired).toContain(`class="flex flex-col gap-3 @min-[${width}]:hidden"`);
    }
    // Without a table: the list alone, always shown, still a container for its definition lists.
    const alone = renderToStaticMarkup(<StackedRows label="Cases" rows={[caseRow('case-1')]} />);
    expect(alone).toMatch(/^<div data-slot="stacked-rows" class="@container w-full min-w-0"><ul role="list" data-stacked-copy="rows" aria-label="Cases" class="flex flex-col gap-3">/);
    expect(alone).not.toContain('data-stacked-copy="table"');
    expect(alone).not.toContain('hidden @min-[');
    expect(alone).not.toMatch(/@min-\[(32|36|40|48|54)rem\]:hidden/);
  });

  it('refuses a list with no name', () => {
    expect(() => renderToStaticMarkup(<StackedRows label="" rows={[caseRow('case-1')]} />)).toThrow(/name/);
    expect(() => renderToStaticMarkup(<StackedRows labelledBy=" " rows={[caseRow('case-1')]} />)).toThrow(/name/);
  });
});
