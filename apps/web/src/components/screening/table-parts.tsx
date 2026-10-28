import type { ReactElement, ReactNode } from 'react';

import type { FigureRole, StackedField } from '../stacked-rows';

/**
 * What the screening result's three tables share (docs/adr/0078, Decision 5 as its first user amended it): one list of
 * columns per table, read in order for the table's headers, for each row's cells and for the stacked fields, and the
 * classes each column implies, which are the tables' own. A row's cells are one record keyed by its table's columns,
 * so a column added to the list and not to the cells is a type error and the two copies cannot drift. No words: a
 * column's label is its component's, or labels.ts's where the words are versioned.
 */

/** Which copy of a paired table a cell renders in: the table's carries the test hooks, the stacked rows' carries data-stacked-… hooks or none. */
export type Copy = 'table' | 'rows';

/** A column of one of the result's tables: the one list the table's headers and the stacked fields read, in order (DR-08). */
export interface ScreeningColumn {
  readonly key: string;
  /** The header's words, and the stacked field's term: one string for both. */
  readonly label: string;
  /** A naming cell: the stacked item's heading takes it, so it is never a field. */
  readonly naming?: true;
  /** One of the brand's three numbers, by its place in their order: an order role, never a tone or a word. */
  readonly figure?: FigureRole;
  /** A code, count or quarter that is not one of the three: the mono face with tabular numerals (a count's own span sets it in the table). */
  readonly mono?: true;
  /** A count or a figure: right-aligned in the table. */
  readonly numeric?: true;
  /** Never breaks in the table (a quarter). */
  readonly nowrap?: true;
  /** The row's status chip: in the table it wraps above a floor (StatusCell). */
  readonly status?: true;
}

/** A column whose key is one of a table's: the key a row's cells record is typed by. */
type Keyed<K extends string> = ScreeningColumn & { readonly key: K };

/** A table's columns less its naming ones: a stacked item's fields, and the cells of a footer row beside its naming cell. */
export type FieldColumn<C extends ScreeningColumn> = Exclude<C, { readonly naming: true }>;

export function fieldColumns<C extends ScreeningColumn>(columns: readonly C[]): FieldColumn<C>[] {
  return columns.filter((column): column is FieldColumn<C> => column.naming !== true);
}

/** A header's classes: every header but the last keeps its cells' padding, and a number's is right-aligned. */
export function headClass(column: ScreeningColumn, last: boolean): string {
  return `py-1${last ? '' : ' pr-3'}${column.numeric === true ? ' text-right' : ''} font-medium`;
}

/** A cell's classes: a number right-aligned, a code or quarter in the mono face, a quarter unbroken. */
export function cellClass(column: ScreeningColumn, last: boolean): string {
  const face = column.numeric === true ? ' text-right' : column.mono === true ? ' font-mono tabular-nums' : '';
  return `py-1${last ? '' : ' pr-3'}${face}${column.nowrap === true ? ' whitespace-nowrap' : ''}`;
}

/** The table's header row: each column's label, in order. */
export function ColumnHeads({ columns }: { readonly columns: readonly ScreeningColumn[] }): ReactElement {
  return (
    <tr>
      {columns.map((column, index) => (
        <th key={column.key} className={headClass(column, index === columns.length - 1)}>
          {column.label}
        </th>
      ))}
    </tr>
  );
}

/** A table row's cells: one per column, in order, a status inside its floor. */
export function ColumnCells<K extends string>({ columns, cells }: { readonly columns: readonly Keyed<K>[]; readonly cells: Readonly<Record<NoInfer<K>, ReactNode>> }): ReactElement {
  return (
    <>
      {columns.map((column, index) => (
        <td key={column.key} className={cellClass(column, index === columns.length - 1)}>
          {column.status === true ? <StatusCell>{cells[column.key]}</StatusCell> : cells[column.key]}
        </td>
      ))}
    </>
  );
}

/** A stacked item's fields: every column but the naming ones, in order, under the header's own words. */
export function fieldsFrom<K extends string>(columns: readonly Keyed<K>[], cells: Readonly<Record<NoInfer<K>, ReactNode>>): StackedField[] {
  return columns.filter((column) => column.naming !== true).map((column) => ({ label: column.label, value: cells[column.key], figure: column.figure, mono: column.mono }));
}

/**
 * A status chip in a table cell (docs/adr/0078, Decision 1: the cell gives way): StatusChip is whitespace-nowrap, right
 * for a short state, and a screening's statuses are sentences, so the chip wraps inside a block of at least 10rem and
 * its table fits its card while its figures do.
 */
export function StatusCell({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="min-w-40 [&_[data-slot=status-chip]]:whitespace-normal">{children}</div>;
}
