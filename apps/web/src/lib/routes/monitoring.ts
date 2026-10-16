import type { UserSettings } from '@tp/db/runtime';
import { formatCents, parseCents } from '@tp/money';
import { STAGE_LABELS } from '@tp/triage';
import { type CsvCell, csvDocument } from '@tp/worker/reports';
import { z } from 'zod';

import { practiceRoute, selfRoute } from '../http/invoke';
import { pageParam, pageWindow } from '../http/paging';
import { type Download, type MutationResult, NotFoundError } from '../http/route';
import {
  type DigestDetail,
  type DigestSummary,
  type MonthlySummary,
  type NotificationView,
  NOTIFICATIONS_PER_PAGE,
  SUMMARY_BUCKETS,
  type SummaryBucket,
  type SummaryFigure,
  countNotifications,
  digestOf,
  lastMonth,
  listDigests,
  listNotifications,
  markNotificationsRead,
  monthlySummary,
  unreadNotifications,
} from '../monitoring/queries';
import { opaqueId, optionalText } from './schemas';

/**
 * Monitoring's screens (PRD 5, J11 and J12; PRD 7, Practice dashboard, Reports and Settings:
 * "notification preferences"; PRD 6, Monitoring jobs and notifications and Reports and exports;
 * docs/adr/0039): the signed-in person's own in-app notifications (practice.open: every role in the
 * workspace; marking them read changes the person's own records only), a monthly digest's page (the
 * link in its email; report.read), the monthly variance summary with its CSV (report.read: counts and
 * totals by stage, no line-level PHI), and the person's notification preferences in their own
 * settings (a self route). Counts and totals only throughout.
 */

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a month, YYYY-MM');

export interface NotificationsPageData {
  readonly practiceId: string;
  /** A page of the person's notifications, newest first. */
  readonly notifications: readonly NotificationView[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly unread: number;
}

export const notificationsPage = practiceRoute({
  id: 'practice.notifications',
  kind: 'page',
  path: '/p/[practiceId]/notifications',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, page: pageParam }),
  handle: async ({ scope, practiceId, params }): Promise<NotificationsPageData> => {
    const total = await countNotifications(scope, practiceId);
    const at = pageWindow(total, NOTIFICATIONS_PER_PAGE, params.page);
    return {
      practiceId,
      notifications: await listNotifications(scope, practiceId, NOTIFICATIONS_PER_PAGE, at.offset),
      page: at.page,
      pages: at.pages,
      total,
      unread: await unreadNotifications(scope, practiceId),
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }) },
});

/** Marks every unread notification of the person's in the practice read (a person's own only; again, nothing more). */
export const markNotificationsReadAction = practiceRoute({
  id: 'practice.notifications.read',
  kind: 'action',
  path: '/p/[practiceId]/notifications',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId }),
  input: z.object({}),
  audit: { action: 'notifications_read', objectType: 'notification' },
  handle: async ({ scope, practiceId }): Promise<MutationResult> => {
    await markNotificationsRead(scope, practiceId);
    return { redirect: `/p/${practiceId}/notifications` };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId }), input: () => ({}) },
});

export interface DigestPageData {
  readonly practiceId: string;
  readonly digest: DigestDetail;
}

/** A month's digest, as its email says it, with the payers named (the email's link). */
export const digestPage = practiceRoute({
  id: 'practice.digests.digest',
  kind: 'page',
  path: '/p/[practiceId]/digests/[digestId]',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, digestId: opaqueId }),
  handle: async ({ scope, practiceId, params }): Promise<DigestPageData> => {
    const digest = await digestOf(scope, practiceId, params.digestId);
    if (digest === undefined) {
      throw new NotFoundError();
    }
    return { practiceId, digest };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, digestId: refs.digestId }) },
});

export interface MonthlySummaryPageData {
  readonly practiceId: string;
  readonly summary: MonthlySummary;
  readonly digests: readonly DigestSummary[];
}

export const monthlySummaryPage = practiceRoute({
  id: 'practice.reports.monthly',
  kind: 'page',
  path: '/p/[practiceId]/reports/monthly',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, month: optionalText(month) }),
  handle: async ({ scope, practiceId, params }): Promise<MonthlySummaryPageData> => ({
    practiceId,
    summary: await monthlySummary(scope, practiceId, params.month ?? lastMonth()),
    digests: await listDigests(scope, practiceId),
  }),
  sample: { params: (refs) => ({ practiceId: refs.practiceId, month: '2026-03' }) },
});

/** The summary's labels, by stage first (the plan's five, each with its own figure), then the rest of the month's lines. */
export const SUMMARY_LABELS: Readonly<Record<SummaryBucket, string>> = {
  ...STAGE_LABELS,
  priced: 'Priced, no shortfall in a stage',
  overpaid: 'Overpaid (recorded, not pursued)',
  unpriced: 'Unpriced (a reason on file)',
  not_priced: 'Not priced by a run yet',
};

const CSV_HEADER = ['month', 'payer', 'stage', 'lines', 'billed', 'variance'] as const;

function dollars(cents: string | null): CsvCell {
  return { number: cents === null ? '' : formatCents(parseCents(cents)) };
}

/**
 * The summary as CSV: one row per payer (and "all payers") and stage, counts and totals only, never a
 * stage added to another. A stage without dollars (flagged, the unstaged lines) leaves variance blank.
 * Payer names come from the 835s a practice uploaded, so every text field goes through the exports'
 * one encoder (csvText: a leading =, +, -, @, tab or carriage return is defused); counts and dollars,
 * built from integers and cents, stay numbers.
 */
export function monthlySummaryCsv(summary: MonthlySummary): string {
  const rows: CsvCell[][] = [];
  const write = (payer: string, figures: Readonly<Record<SummaryBucket, SummaryFigure>>, writtenOff: SummaryFigure) => {
    for (const bucket of SUMMARY_BUCKETS) {
      const figure = figures[bucket];
      rows.push([{ text: summary.month }, { text: payer }, { text: bucket }, { number: String(figure.lines) }, dollars(figure.billedCents), dollars(figure.varianceCents)]);
    }
    rows.push([{ text: summary.month }, { text: payer }, { text: 'actionable_written_off' }, { number: String(writtenOff.lines) }, dollars(writtenOff.billedCents), dollars(writtenOff.varianceCents)]);
  };
  write('all payers', summary.total.figures, summary.total.writtenOff);
  for (const payer of summary.byPayer) {
    write(payer.payerName ?? payer.payerId ?? 'unknown payer', payer.figures, payer.writtenOff);
  }
  return csvDocument(CSV_HEADER, rows);
}

export const monthlySummaryCsvRoute = practiceRoute({
  id: 'practice.reports.monthly_csv',
  kind: 'handler',
  method: 'GET',
  path: '/p/[practiceId]/reports/monthly/csv',
  phi: true,
  permission: 'report.read',
  params: z.object({ practiceId: opaqueId, month: optionalText(month) }),
  handle: async ({ scope, practiceId, params }): Promise<Download> => {
    const summary = await monthlySummary(scope, practiceId, params.month ?? lastMonth());
    // The file's name is the month, never the practice's or a payer's name.
    return { download: { filename: `monthly-summary-${summary.month}.csv`, contentType: 'text/csv; charset=utf-8', body: monthlySummaryCsv(summary) } };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, month: '2026-03' }) },
});

export interface NotificationPreferences {
  readonly digestEmail: boolean;
  readonly inApp: boolean;
}

function preferencesOf(settings: UserSettings | null | undefined): NotificationPreferences {
  return { digestEmail: settings?.notifications?.digest_email ?? true, inApp: settings?.notifications?.in_app ?? true };
}

/** The signed-in person's notification preferences (their own settings; both on unless turned off). */
export const notificationPreferencesPage = selfRoute({
  id: 'account.notifications',
  kind: 'page',
  path: '/account/notifications',
  phi: false,
  params: z.object({ saved: optionalText(z.literal('1')) }),
  handle: async ({ scope, params }): Promise<{ readonly preferences: NotificationPreferences; readonly saved: boolean }> => {
    const { rows } = await scope.client.query<{ settings: UserSettings }>('SELECT settings FROM "user" WHERE id = app_actor_id()');
    return { preferences: preferencesOf(rows[0]?.settings), saved: params.saved !== undefined };
  },
  sample: { params: () => ({}) },
});

const checkbox = z.preprocess((value) => value === 'on' || value === true, z.boolean());

/** Saves the person's own notification preferences (a checkbox left unticked turns that one off). */
export const saveNotificationPreferencesAction = selfRoute({
  id: 'account.notification_preferences',
  kind: 'action',
  path: '/account/notifications',
  phi: false,
  params: z.object({}),
  input: z.object({ digestEmail: checkbox, inApp: checkbox }),
  audit: { action: 'notification_preferences_saved', objectType: 'user' },
  handle: async ({ scope, input, actor }): Promise<MutationResult> => {
    const settings: UserSettings = { notifications: { digest_email: input.digestEmail, in_app: input.inApp } };
    await scope.client.query('UPDATE "user" SET settings = jsonb_set(settings, \'{notifications}\', $2::jsonb) WHERE id = $1', [actor.userId, JSON.stringify(settings.notifications)]);
    return { objectId: actor.userId, redirect: '/account/notifications?saved=1' };
  },
  sample: { params: () => ({}), input: () => ({ digestEmail: 'on', inApp: '' }) },
});

export const MONITORING_ROUTES = [notificationsPage, markNotificationsReadAction, digestPage, monthlySummaryPage, monthlySummaryCsvRoute, notificationPreferencesPage, saveNotificationPreferencesAction] as const;
