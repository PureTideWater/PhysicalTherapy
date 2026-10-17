import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { utc } from '../../../components/format';
import { AppShell } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { devicesPage } from '../../../lib/routes/account';
import { revokeDevice } from '../actions';
import { FormKeys } from '../../../components/form-keys';

export const metadata: Metadata = { title: 'Devices' };

/** The device list with revocation (PRD 7, Sign-in and MFA). Revoking a device ends its sessions at once. */
export default async function DevicesPage() {
  const page = await loadPage(devicesPage, {});
  if (page.kind !== 'ok') {
    return null;
  }
  const { devices, currentDeviceId } = page.data;
  return (
    <AppShell shell={page.shell} section="devices">
      <h1 className="text-2xl font-bold tracking-display">Devices</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        The browsers you have signed in from. Revoke one you do not recognize: its sessions end at once and it signs in as a new device next time.
      </p>
      {devices.length === 0 ? (
        <EmptyState title="No devices yet" nextStep="Devices appear here after you sign in from them." />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Devices">
          {devices.map((device) => (
            <li key={device.id}>
              <Card data-device={device.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {device.label}
                    {device.id === currentDeviceId ? <Badge variant="secondary">This device</Badge> : null}
                    {device.revokedAt === null ? null : <Badge variant="outline">Revoked {utc(device.revokedAt)}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    First seen {utc(device.firstSeenAt)}. Last seen {utc(device.lastSeenAt)}. Open sessions: {device.openSessions}.
                  </CardDescription>
                </CardHeader>
                {device.revokedAt === null ? (
                  <CardContent>
                    <ActionForm action={revokeDevice} submit={device.id === currentDeviceId ? 'Revoke this device and sign out' : 'Revoke device'} variant="outline">
                      <FormKeys />
                      <input type="hidden" name="deviceId" value={device.id} />
                    </ActionForm>
                  </CardContent>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
