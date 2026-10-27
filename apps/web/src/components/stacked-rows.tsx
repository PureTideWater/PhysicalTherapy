/** Stub for the tests-first commit: the types are final, the functions are not built yet. */
import type { ReactElement, ReactNode } from 'react';

export type FigureRole = 'expected' | 'paid' | 'short';

export interface StackedField {
  readonly label: string;
  readonly value: ReactNode;
  readonly figure?: FigureRole;
  readonly mono?: boolean;
}

export interface StackedRow {
  readonly key: string;
  readonly heading: ReactNode;
  readonly fields: readonly StackedField[];
  readonly actions?: ReactNode;
  readonly hooks?: Readonly<Record<`data-${string}`, string>>;
}

export type StackBelow = '32rem' | '36rem' | '40rem' | '48rem' | '54rem';

type ListName = { readonly label: string; readonly labelledBy?: never } | { readonly labelledBy: string; readonly label?: never };

type Pairing = { readonly table: ReactElement; readonly stackBelow: StackBelow } | { readonly table?: never; readonly stackBelow?: never };

export type StackedRowsProps = ListName &
  Pairing & {
    readonly rows: readonly StackedRow[];
    readonly headingLevel?: 2 | 3 | 4;
  };

export function StackedRows(_props: StackedRowsProps): ReactElement {
  throw new Error('StackedRows is not built yet');
}

export function brandOrderProblems(_fields: readonly StackedField[]): readonly string[] {
  throw new Error('brandOrderProblems is not built yet');
}

export function repeatedIds(_html: string): readonly string[] {
  throw new Error('repeatedIds is not built yet');
}
