import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { Field, SelectField, TextAreaField } from '../../../components/field';
import { FormKeys } from '../../../components/form-keys';
import { utc } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { INCIDENT_STATUS_LABELS, STATUS_LABELS, consoleStatusPage } from '../../../lib/routes/support';
import { openIncidentAction, setComponentStatusAction, setMaintenanceAction, updateIncidentAction } from './actions';

export const metadata: Metadata = { title: 'Status and maintenance' };

/**
 * The public status page's controls and the maintenance switch (docs/adr/0053): what the public page shows is
 * written here, in words a customer reads, and is public (no customer, no record, no staff member is named).
 * Maintenance sends every customer screen to the maintenance page; the console stays open.
 */
export default async function ConsoleStatusPage() {
  const page = await loadPage(consoleStatusPage, {});
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="status_admin" roles={page.roles} message={page.message} nextStep="The status page is set by platform administrators." />;
  }
  const { components, incidents, maintenance, statuses, impacts, incidentStatuses } = page.data;
  return (
    <AppShell shell={page.shell} section="status_admin">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-display">Status and maintenance</h1>
        <Link className="text-sm underline" href="/status">
          Public status page
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
          <CardDescription>While on, every customer screen shows the maintenance page; the console stays open. Every server sees a change within five seconds.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {maintenance ? (
            <Alert variant="destructive">
              <AlertTitle>Maintenance is on</AlertTitle>
              <AlertDescription>Customers cannot use the workspace until you turn it off.</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm">Maintenance is off.</p>
          )}
          <ActionForm action={setMaintenanceAction} submit={maintenance ? 'Turn maintenance off' : 'Turn maintenance on'} variant={maintenance ? 'default' : 'destructive'}>
            <FormKeys />
            <input type="hidden" name="on" value={maintenance ? 'false' : 'true'} />
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" aria-label="Components">
            <tbody>
              {components.map((component) => (
                <tr key={component.key} className="border-t first:border-t-0 align-top">
                  <td className="py-2">
                    {component.name} <Badge variant={component.status === 'operational' ? 'outline' : 'destructive'}>{STATUS_LABELS[component.status]}</Badge>
                  </td>
                  <td className="py-2">
                    <ActionForm action={setComponentStatusAction} submit="Set" variant="outline" className="flex items-end gap-2">
                      <FormKeys />
                      <input type="hidden" name="component" value={component.key} />
                      <SelectField label="Status" id={`status-${component.key}`} name="status" options={statuses} defaultValue={component.status} />
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
          <CardDescription>Open ones and those resolved in the last 14 days; each update is posted on the public page as written.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {incidents.map((incident) => (
            <div key={incident.id} className="rounded-md border p-3" data-incident-status={incident.status}>
              <p className="font-medium">
                {incident.title} <Badge variant="outline">{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                Started {utc(incident.startedAt)}; {incident.impact}; {incident.components.join(', ')}
              </p>
              <ol className="my-2 text-sm">
                {incident.updates.map((update) => (
                  <li key={`${update.postedAt.toISOString()}-${update.status}`}>
                    {INCIDENT_STATUS_LABELS[update.status]} ({utc(update.postedAt)}): {update.message}
                  </li>
                ))}
              </ol>
              {incident.status === 'resolved' ? null : (
                <ActionForm action={updateIncidentAction} submit="Post update" className="grid max-w-xl gap-2">
                  <FormKeys />
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <SelectField label="Status" id={`incident-status-${incident.id}`} name="status" options={incidentStatuses} defaultValue={incident.status} />
                  <TextAreaField label="Update" id={`incident-message-${incident.id}`} name="message" required maxLength={1000} rows={2} />
                </ActionForm>
              )}
            </div>
          ))}
          <ActionForm action={openIncidentAction} submit="Open incident" className="grid max-w-xl gap-3">
            <FormKeys />
            <Field label="Title" name="title" required maxLength={120} />
            <SelectField label="Impact" name="impact" options={impacts.map((value) => ({ value, label: value }))} />
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1 text-sm font-medium">Components affected</legend>
              {components.map((component) => (
                <label key={component.key} className="flex items-center gap-1">
                  <input type="checkbox" name="components[]" value={component.key} /> {component.name}
                </label>
              ))}
            </fieldset>
            <TextAreaField label="First update" name="message" required maxLength={1000} rows={2} />
          </ActionForm>
        </CardContent>
      </Card>
    </AppShell>
  );
}
