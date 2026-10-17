import { cents, formatUsd } from '@tp/money';
import { monthName } from '@tp/worker/digests';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { NotificationView } from '../../lib/monitoring/queries';

/**
 * How a notification reads (counts and totals only; docs/adr/0039): a run the monitoring chain priced
 * and triaged links to its run, a month's digest to its page, a recoupment to its case and its ledger, a follow-up that has
 * come to its case's submissions. Stage labels as
 * everywhere: validated is contract-supported, flagged is investigatory and never a dollar figure.
 */

function count(figures: Readonly<Record<string, unknown>>, key: string): number {
  const value = figures[key];
  return typeof value === 'number' ? value : 0;
}

/** A total in dollars, in the mono face with tabular numerals like every money figure. */
function usd(figures: Readonly<Record<string, unknown>>, key: string): ReactNode {
  const value = figures[key];
  return <span className="font-mono tabular-nums">{formatUsd(cents(BigInt(typeof value === 'string' ? value : '0')))}</span>;
}

export function NotificationText({ practiceId, notification }: { readonly practiceId: string; readonly notification: NotificationView }) {
  const { counts, totals } = notification;
  if (notification.kind === 'monitoring_run') {
    return (
      <span>
        <Link className="font-medium underline" href={`/p/${practiceId}/pricing-runs/${notification.subjectId}`}>
          Pricing run, {notification.periodFrom ?? '—'} to {notification.periodTo ?? '—'}
        </Link>{' '}
        priced and triaged by monitoring: {count(counts, 'priced_lines')} of {count(counts, 'lines')} lines priced; validated {usd(totals, 'validated_variance')} on {count(counts, 'validated_lines')} lines; {count(counts, 'cases')} cases;{' '}
        {count(counts, 'flagged_lines')} lines flagged (investigatory).
      </span>
    );
  }
  if (notification.kind === 'follow_up') {
    return (
      <span>
        <Link className="font-medium underline" href={`/p/${practiceId}/cases/${notification.caseId ?? ''}/submissions`}>
          A follow-up is due
        </Link>
        : the payer has not answered a submission of this case in {count(counts, 'days_waiting')} days. Follow up through the payer&apos;s channel and record what it says.
      </span>
    );
  }
  if (notification.kind === 'recoupment') {
    return (
      <span>
        <Link className="font-medium underline" href={`/p/${practiceId}/cases/${notification.caseId ?? ''}`}>
          A payer took back {usd(totals, 'recouped')}
        </Link>{' '}
        on {count(counts, 'recouped_lines')} lines of a case: the lines are reopened and recovered (posted or deposited) is reduced by that amount.{' '}
        <Link className="underline" href={`/p/${practiceId}/reconciliation?case=${notification.caseId ?? ''}`}>
          The case’s ledger
        </Link>
      </span>
    );
  }
  return (
    <span>
      <Link className="font-medium underline" href={`/p/${practiceId}/digests/${notification.subjectId}`}>
        Monitoring digest for {notification.period === null ? 'a month' : monthName(notification.period)}
      </Link>
      : new validated variance {usd(totals, 'validated_variance')} on {count(counts, 'validated_lines')} lines; {count(counts, 'cases_nearing_deadline')} cases nearing their deadline; recovered (posted or deposited, net) {usd(totals, 'recovered')}.
    </span>
  );
}
