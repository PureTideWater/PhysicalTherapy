import { cents, formatUsd } from '@tp/money';
import { monthName } from '@tp/worker/digests';
import Link from 'next/link';

import type { NotificationView } from '../../lib/monitoring/queries';

/**
 * How a notification reads (counts and totals only; docs/adr/0039): a run the monitoring chain priced
 * and triaged links to its run, a month's digest to its page. Stage labels as everywhere: validated is
 * contract-supported, flagged is investigatory and never a dollar figure.
 */

function count(figures: Readonly<Record<string, unknown>>, key: string): number {
  const value = figures[key];
  return typeof value === 'number' ? value : 0;
}

function usd(figures: Readonly<Record<string, unknown>>, key: string): string {
  const value = figures[key];
  return formatUsd(cents(BigInt(typeof value === 'string' ? value : '0')));
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
  return (
    <span>
      <Link className="font-medium underline" href={`/p/${practiceId}/digests/${notification.subjectId}`}>
        Monitoring digest for {notification.period === null ? 'a month' : monthName(notification.period)}
      </Link>
      : new validated variance {usd(totals, 'validated_variance')} on {count(counts, 'validated_lines')} lines; {count(counts, 'cases_nearing_deadline')} cases nearing their deadline; recovered {usd(totals, 'recovered')}.
    </span>
  );
}
