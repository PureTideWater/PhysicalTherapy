import { randomUUID } from 'node:crypto';

import { Badge, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { utc } from '../../../../components/format';
import { NotificationText } from '../../../../components/monitoring/display';
import { Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { notificationsPage } from '../../../../lib/routes/monitoring';
import { markNotificationsReadFormAction } from './actions';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * The person's in-app notifications in the practice (PRD 6, Monitoring jobs and notifications: "in-app
 * notifications"; docs/adr/0039): each run the monitoring chain priced and triaged, and each month's
 * digest, with counts and totals only. Whether they arrive is the person's own preference.
 */
export default async function NotificationsPage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(notificationsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="notifications" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, notifications, unread, total } = page.data;
  return (
    <AppShell shell={page.shell} section="notifications">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          What monitoring did for this practice, as counts and dollar totals. Choose what reaches you, in the app or by email, in your{' '}
          <Link className="underline" href="/account/notifications">
            notification preferences
          </Link>
          .
        </p>
      </div>
      {unread === 0 ? null : (
        <ActionForm action={markNotificationsReadFormAction} submit={`Mark ${String(unread)} as read`} variant="outline">
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <input type="hidden" name="practiceId" value={practiceId} />
        </ActionForm>
      )}
      {notifications.length === 0 ? (
        <EmptyState title="No notifications yet" nextStep="Monitoring tells you here when it has priced and triaged new files, and when a month's digest is ready." />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Notifications">
          {notifications.map((notification) => (
            <li key={notification.id} className="rounded-md border p-4 text-sm" data-notification={notification.id} data-kind={notification.kind}>
              <div className="flex flex-wrap items-center gap-2 pb-1 text-xs text-muted-foreground">
                {notification.readAt === null ? <Badge>New</Badge> : null}
                <span>{utc(notification.createdAt)}</span>
              </div>
              <NotificationText practiceId={practiceId} notification={notification} />
            </li>
          ))}
        </ul>
      )}
      <Pager path={`/p/${practiceId}/notifications`} query={{}} page={page.data.page} pages={page.data.pages} total={total} noun="Notifications" />
    </AppShell>
  );
}
