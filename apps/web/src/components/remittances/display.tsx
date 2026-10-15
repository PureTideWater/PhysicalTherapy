import { cents, formatUsd } from '@tp/money';
import { Badge } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { LineStatus } from '../../lib/remittances/queries';

/**
 * Display pieces of the Remittances and Claims and lines screens (PRD 7): money from integer cents in
 * the practice's locale without a float (PRD 6, Cross-cutting), the line status chips (the five
 * stages plus unpriced; PRD 8), claim status codes in words, and the pager that keeps the filters in
 * the URL.
 */

/** Integer cents as text, as US dollars; a dash when there is none. */
export function Money({ value }: { readonly value: string | null }) {
  return <span className="tabular-nums">{value === null ? '—' : formatUsd(cents(BigInt(value)))}</span>;
}

/** CLP02 in words, for the statuses the plan names (PRD 10; the parser's types); any other shows its code. */
export const CLAIM_STATUS_NAMES: Readonly<Record<string, string>> = {
  '1': 'Primary',
  '2': 'Secondary',
  '3': 'Tertiary',
  '4': 'Denied',
  '22': 'Reversal',
};

export function claimStatusName(code: string): string {
  return CLAIM_STATUS_NAMES[code] ?? `Status ${code}`;
}

const STATUS_LABELS: Readonly<Record<LineStatus, string>> = {
  flagged: 'Flagged (investigatory)',
  validated: 'Validated',
  actionable: 'Actionable',
  payer_approved: 'Payer approved',
  recovered: 'Recovered',
  unpriced: 'Unpriced',
};

/**
 * A line's status chip: one of the five stages, unpriced, priced without a shortfall (a complete run
 * priced it at or under what was paid: no stage), or not priced yet (no complete run has priced it).
 */
export function LineStatusChip({ status, priced = false }: { readonly status: LineStatus | null; readonly priced?: boolean }) {
  if (status === null) {
    return priced ? (
      <Badge variant="outline" data-status="priced" title="The latest pricing run priced this line at or under what was paid.">
        Priced, no shortfall
      </Badge>
    ) : (
      <Badge variant="outline" title="Expected allowed and the line's stage come from a pricing run.">
        Not priced yet
      </Badge>
    );
  }
  return (
    <Badge variant={status === 'unpriced' ? 'secondary' : 'default'} data-status={status}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** The observed allowed basis in words (PRD 10, step 9). */
export function basisName(basis: string | null, allocated: boolean): string {
  if (basis === 'amt_b6') {
    return 'AMT B6 (the payer’s allowed amount)';
  }
  if (basis === 'paid_plus_pr') {
    return allocated ? 'Paid plus patient responsibility allocated from the claim' : 'Paid plus patient responsibility';
  }
  return '—';
}

/** Previous and next links that keep every filter in the URL (PRD 7: filters in the URL). */
export function Pager({
  path,
  query,
  page,
  pages,
  total,
  noun,
  param = 'page',
}: {
  readonly path: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly noun: string;
  /** The URL parameter that carries the page (a screen with two lists pages each its own way). */
  readonly param?: string;
}) {
  if (pages <= 1) {
    return null;
  }
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        params.set(key, value);
      }
    }
    params.set(param, String(target));
    return `${path}?${params.toString()}`;
  };
  return (
    <nav aria-label={`${noun} pages`} className="flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link className="underline" href={href(page - 1)}>
          Previous
        </Link>
      ) : (
        <span className="text-muted-foreground">Previous</span>
      )}
      <span>
        Page {page} of {pages} ({total} {noun})
      </span>
      {page < pages ? (
        <Link className="underline" href={href(page + 1)}>
          Next
        </Link>
      ) : (
        <span className="text-muted-foreground">Next</span>
      )}
    </nav>
  );
}

/** A labelled definition list row. */
export function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** A service period: one day, or its first and last. */
export function period(from: string | null, to: string | null): string {
  if (from === null) {
    return '—';
  }
  return to === null || to === from ? from : `${from} to ${to}`;
}
