import type { ReactElement, ReactNode } from 'react';

/**
 * A figure's part in the brand's three numbers (docs/brand/BRAND.md, "the three numbers (expected, paid, short) always
 * in that order"; docs/adr/0056, "Tables: expected, paid, short"): in a table of lines, expected allowed, observed
 * allowed and short.
 */
export type FigureRole = 'expected' | 'paid' | 'short';

const ROLE_ORDER: Readonly<Record<FigureRole, number>> = { expected: 0, paid: 1, short: 2 };

export interface StackedField {
  /** The column's header, the same string the table's <th> shows (one constant for both). */
  readonly label: string;
  readonly value: ReactNode;
  /** One of the brand's three numbers: the mono face, and the three given together, in the brand's order. */
  readonly figure?: FigureRole;
  /** A code, count, key or date that is not one of the three: the mono face with tabular numerals. */
  readonly mono?: boolean;
}

export interface StackedRow {
  /** The React key, and the value of the item's data-stacked-row. */
  readonly key: string;
  /** The row's naming cell: a link when the row opens something, else text. */
  readonly heading: ReactNode;
  /**
   * A line under the heading that says what the item's figures are, where the table says it in the naming cell (a
   * footer row's sum); none when it renders nothing. The heading stays the naming cell alone, so a list read by its
   * headings stays short.
   */
  readonly description?: ReactNode;
  readonly fields: readonly StackedField[];
  /** The row's actions (links, ActionForms), under its facts; none when it renders nothing (`canAct && <Form />` that is false). */
  readonly actions?: ReactNode;
  /** The caller's own test hooks for the stacked copy (data-stacked-…); never the table row's (docs/adr/0078). */
  readonly hooks?: Readonly<Record<`data-${string}`, string>>;
}

/** The table's min-w, from which up the table shows instead of the rows (the widths of docs/adr/0078's rule). */
export type StackBelow = '32rem' | '36rem' | '40rem' | '48rem' | '54rem';

/** Literal classes for each width, so Tailwind generates every one: the table copy from the width up, the rows below it. */
const SWITCH: Readonly<Record<StackBelow, { readonly table: string; readonly rows: string }>> = {
  '32rem': { table: 'hidden @min-[32rem]:block', rows: '@min-[32rem]:hidden' },
  '36rem': { table: 'hidden @min-[36rem]:block', rows: '@min-[36rem]:hidden' },
  '40rem': { table: 'hidden @min-[40rem]:block', rows: '@min-[40rem]:hidden' },
  '48rem': { table: 'hidden @min-[48rem]:block', rows: '@min-[48rem]:hidden' },
  '54rem': { table: 'hidden @min-[54rem]:block', rows: '@min-[54rem]:hidden' },
};

const HEADINGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

/**
 * Under 24rem the terms stand over their values, so each value but the last keeps 8 px below it: a pair sits closer
 * together than to the next term.
 */
const PAIRED = '@max-[24rem]:not-last:pb-2';
/** A value wraps inside the card, and a status with it: a StatusChip or a Badge, each whitespace-nowrap in a table cell. */
const VALUE = `min-w-0 wrap-anywhere [&_[data-slot=status-chip]]:whitespace-normal [&_[data-slot=badge]]:whitespace-normal ${PAIRED}`;
/**
 * A figure, code, count, key or date, in the mono face with tabular numerals. It breaks only where one token is wider
 * than the card (a key or a hash), never a figure that fits: a dd is a block the width of its column, so wrap-anywhere
 * here, unlike in a table cell, never narrows the column.
 */
const MONO = `min-w-0 font-mono tabular-nums wrap-anywhere ${PAIRED}`;

type ListName = { readonly label: string; readonly labelledBy?: never } | { readonly labelledBy: string; readonly label?: never };

/** With a table, the width it needs; without one, the list always stacks. */
type Pairing = { readonly table: ReactElement; readonly stackBelow: StackBelow } | { readonly table?: never; readonly stackBelow?: never };

export type StackedRowsProps = ListName &
  Pairing & {
    readonly rows: readonly StackedRow[];
    /** The level of each row's heading: one below the section or card title that holds the list (a CardTitle is an h2). */
    readonly headingLevel?: 2 | 3 | 4;
  };

/** What React renders as nothing: undefined, null, a boolean, the empty string, or a list of those. */
export function rendersNothing(node: ReactNode): boolean {
  if (node === undefined || node === null || typeof node === 'boolean' || node === '') {
    return true;
  }
  return Array.isArray(node) && node.every((child: ReactNode) => rendersNothing(child));
}

function Row({ row, level }: { readonly row: StackedRow; readonly level: 2 | 3 | 4 }) {
  const Heading = HEADINGS[level];
  return (
    <li {...row.hooks} data-stacked-row={row.key} className="rounded-md border p-4">
      <Heading className="text-base font-semibold wrap-anywhere">{row.heading}</Heading>
      {rendersNothing(row.description) ? null : <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>}
      <dl className="mt-2 grid grid-cols-1 gap-y-1 text-sm @min-[24rem]:grid-cols-[fit-content(40%)_1fr] @min-[24rem]:gap-x-4">
        {row.fields.map((field, index) => (
          <Field key={`${String(index)}:${field.label}`} field={field} />
        ))}
      </dl>
      {rendersNothing(row.actions) ? null : <div className="mt-3 flex flex-col items-start gap-2">{row.actions}</div>}
    </li>
  );
}

function Field({ field }: { readonly field: StackedField }) {
  return (
    <>
      <dt className="text-muted-foreground">{field.label}</dt>
      <dd className={field.figure !== undefined || field.mono === true ? MONO : VALUE} data-stacked-figure={field.figure}>
        {field.value}
      </dd>
    </>
  );
}

/**
 * One stacked-row layout for a phone (docs/adr/0078; UX-079 (c)): a list named by `label` or `labelledBy`, each item
 * its row's naming cell as a heading at the caller's level, then, when given, a line that describes it, then a
 * definition list of each column's label and value (terms over values until the list is 24rem wide, and beside them
 * after in a term column of at most 40% of the list, `fit-content(40%)`, so a long term wraps between words rather than
 * leave its value a sliver), then the row's actions. The list says role="list": Safari and VoiceOver drop the role of a
 * list styled `list-style: none` (Tailwind's preflight), and with it the list's name and count. The fields render in
 * the order given: `brandOrderProblems` is the check, in the caller's test, that the three figures are given together
 * and in the brand's order, and the caller reads one constant of column labels in order for the table's headers and the
 * fields. The primitive never picks a status tone: the caller renders the StatusChip or Badge, and its value lets it
 * wrap.
 *
 * With `table` (the same rows as a `ScrollTable`), both copies render from the caller's one row array, and a container
 * query on the wrapper shows the table from `stackBelow`, the table's own min-w, up and the rows below it, so the band
 * where the rail narrows the column (768 to 1023 px) stacks too; `display: none` takes the other copy out of the
 * accessibility tree and out of axe. Both copies are in the DOM, so no id and no test hook may repeat between them:
 * the stacked copy carries data-stacked-row and the caller's own hooks, and `repeatedIds` is the check. The parts a
 * component names for itself (data-slot, data-tone) are in both copies by design, so a spec scopes a locator of one to
 * `[data-stacked-copy]` or `:visible`. A server component: every value is the caller's rendered node.
 */
export function StackedRows(props: StackedRowsProps): ReactElement {
  if ((props.label ?? props.labelledBy ?? '').trim() === '') {
    throw new Error('A stacked list needs a name: a label, or the id of the title that names it.');
  }
  const named = props.label === undefined ? { 'aria-labelledby': props.labelledBy } : { 'aria-label': props.label };
  const level = props.headingLevel ?? 3;
  const paired = props.table === undefined || props.stackBelow === undefined ? null : { table: props.table, classes: SWITCH[props.stackBelow] };
  return (
    <div data-slot="stacked-rows" className="@container w-full min-w-0">
      {paired === null ? null : (
        <div data-stacked-copy="table" className={paired.classes.table}>
          {paired.table}
        </div>
      )}
      <ul role="list" data-stacked-copy="rows" {...named} className={paired === null ? 'flex flex-col gap-3' : `flex flex-col gap-3 ${paired.classes.rows}`}>
        {props.rows.map((row) => (
          <Row key={row.key} row={row} level={level} />
        ))}
      </ul>
    </div>
  );
}

/**
 * What is wrong with the figures' order, in words, or nothing: each figure given after one that the brand's order
 * (expected, paid, short) puts after it, and each other field given between the first figure and the last. A role
 * given twice in a row is in order. Each paired caller's unit test expects it empty for its fields.
 */
export function brandOrderProblems(fields: readonly StackedField[]): readonly string[] {
  const figures = fields.flatMap((field, index) => (field.figure === undefined ? [] : [{ label: field.label, role: field.figure, index }]));
  const problems: string[] = [];
  for (const [position, after] of figures.entries()) {
    const before = figures[position - 1];
    if (before !== undefined && ROLE_ORDER[after.role] < ROLE_ORDER[before.role]) {
      problems.push(`${after.label} (${after.role}) comes after ${before.label} (${before.role}): expected, paid and short go in that order.`);
    }
  }
  const first = figures[0];
  const last = figures.at(-1);
  if (first !== undefined && last !== undefined) {
    for (const field of fields.slice(first.index + 1, last.index)) {
      if (field.figure === undefined) {
        problems.push(`${field.label} stands between the figures: expected, paid and short stand together.`);
      }
    }
  }
  return problems;
}

/** Elements HTML never closes. */
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The attributes a component sets on its own parts (shadcn's data-slot, StatusChip's tone, the scrollers' state): the same in both copies by design, never a record's hook. */
const COMPONENT_PARTS = new Set(['data-slot', 'data-tone', 'data-scroll', 'data-scroller', 'data-axis']);

/**
 * For a paired caller's unit test (docs/adr/0078; DR-07): in `renderToStaticMarkup` output, each id that occurs more
 * than once, then each data-* hook (name and value) that the stacked copy repeats from the table copy, apart from the
 * stacked copy's own (data-stacked-…) and the parts every component names for itself. A locator matches hidden
 * elements, so a repeated hook would match twice. Each paired caller's test expects it empty.
 */
export function repeatedIds(html: string): readonly string[] {
  const ids = new Map<string, number>();
  const hooks = { table: new Set<string>(), rows: new Set<string>() };
  const open: { readonly tag: string; readonly copy: 'table' | 'rows' | null }[] = [];
  for (const [, closing, tag = '', attributes = ''] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    if (closing === '/') {
      const at = open.findLastIndex((element) => element.tag === tag);
      if (at >= 0) {
        open.length = at;
      }
      continue;
    }
    const attrs = [...attributes.matchAll(/\s([^\s=/>]+)(?:="([^"]*)")?/g)].map(([, name = '', value = '']) => ({ name, value }));
    const marked = attrs.find(({ name }) => name === 'data-stacked-copy')?.value;
    const copy = marked === 'table' || marked === 'rows' ? marked : (open.at(-1)?.copy ?? null);
    for (const { name, value } of attrs) {
      if (name === 'id') {
        ids.set(value, (ids.get(value) ?? 0) + 1);
      } else if (copy !== null && name.startsWith('data-') && !name.startsWith('data-stacked-') && !COMPONENT_PARTS.has(name)) {
        hooks[copy].add(`${name}="${value}"`);
      }
    }
    if (!VOID_ELEMENTS.has(tag.toLowerCase()) && !attributes.endsWith('/')) {
      open.push({ tag, copy });
    }
  }
  return [...[...ids].filter(([, count]) => count > 1).map(([id]) => `id="${id}"`), ...[...hooks.rows].filter((hook) => hooks.table.has(hook))];
}
