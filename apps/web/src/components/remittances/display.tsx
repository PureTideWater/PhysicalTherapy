import { cents, formatUsd } from '@tp/money';
import { STAGE_LABELS } from '@tp/triage';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { LineStatus } from '../../lib/remittances/queries';
import { StatusChip, type StatusTone } from '../status';

/**
 * Display pieces of the Remittances and Claims and lines screens (PRD 7): money from integer cents in
 * the practice's locale without a float (PRD 6, Cross-cutting), the line status chips (the five
 * stages plus unpriced; PRD 8), claim status codes in words, and the pager that keeps the filters in
 * the URL.
 */

/** Integer cents as text, as US dollars, in the mono face with tabular numerals; a dash when there is none. */
export function Money({ value }: { readonly value: string | null }) {
  return <span className="font-mono tabular-nums">{value === null ? '—' : formatUsd(cents(BigInt(value)))}</span>;
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

/** The five stages' labels (recovered names the cash that proves it, never "Recovered" alone), and unpriced. */
const STATUS_LABELS: Readonly<Record<LineStatus, string>> = { ...STAGE_LABELS, unpriced: 'Unpriced' };

/**
 * Each status's tint (docs/adr/0054): recovered is whole (cash at the proof level); validated and actionable
 * are short (paid below the contract); flagged and unpriced are unpriced (no contract price yet; flagged is
 * investigatory); payer approved is neutral (accepted, not yet cash). Always with its label.
 */
export const STATUS_TONES: Readonly<Record<LineStatus, StatusTone>> = {
  flagged: 'unpriced',
  validated: 'short',
  actionable: 'short',
  payer_approved: 'neutral',
  recovered: 'whole',
  unpriced: 'unpriced',
};

/**
 * A line's status chip: one of the five stages (from the line's stage events), unpriced (its pricing in
 * effect left it so), priced with a shortfall triage has not judged yet, priced without a shortfall (at
 * or under what was paid: no stage), or not priced yet (no run in effect has priced it).
 */
export function LineStatusChip({ status, priced = false, shortfall = false }: { readonly status: LineStatus | null; readonly priced?: boolean; readonly shortfall?: boolean }) {
  if (status === null) {
    if (priced && shortfall) {
      return (
        <StatusChip tone="short" data-status="priced_untriaged" title="Priced below what it expects; triage of its run decides its stage.">
          Priced, not triaged yet
        </StatusChip>
      );
    }
    return priced ? (
      <StatusChip tone="whole" data-status="priced" title="The pricing run in effect priced this line at or under what was paid.">
        Priced, no shortfall
      </StatusChip>
    ) : (
      <StatusChip tone="neutral" title="Expected allowed and the line's stage come from a pricing run.">
        Not priced yet
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={STATUS_TONES[status]} data-status={status}>
      {STATUS_LABELS[status]}
    </StatusChip>
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
