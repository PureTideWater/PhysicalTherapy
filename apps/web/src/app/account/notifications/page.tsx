import { Alert, AlertDescription, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { AppShell } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { notificationPreferencesPage } from '../../../lib/routes/monitoring';
import { saveNotificationPreferences } from './actions';
import { FormKeys } from '../../../components/form-keys';

export const metadata: Metadata = { title: 'Notification preferences' };

/**
 * The person's notification preferences (PRD 7, Settings: "notification preferences"; they live in the
 * person's own settings; docs/adr/0039): the monthly digest by email (links only, counts and dollar
 * totals, never PHI) and notifications in the app, for every practice they reach. Both are on until
 * turned off.
 */
export default async function NotificationPreferencesPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(notificationPreferencesPage, props);
  if (page.kind !== 'ok') {
    return null;
  }
  const { preferences, saved } = page.data;
  return (
    <AppShell shell={page.shell} section="notification_preferences">
      <h1 className="text-2xl font-semibold tracking-tight">Notification preferences</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Monitoring tells you what it found in each practice you work in: counts and dollar totals only, never a patient&apos;s or a claim&apos;s details. The email carries a link to the digest in the application.
      </p>
      {saved ? (
        <Alert data-notice="saved">
          <AlertDescription>Your preferences are saved.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>What reaches you</CardTitle>
          <CardDescription>For every practice you reach.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveNotificationPreferences} submit="Save preferences">
            <FormKeys />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="digestEmail" defaultChecked={preferences.digestEmail} />
              The monthly digest by email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="inApp" defaultChecked={preferences.inApp} />
              Notifications in the application (a run priced and triaged, a month&apos;s digest)
            </label>
          </ActionForm>
        </CardContent>
      </Card>
    </AppShell>
  );
}
