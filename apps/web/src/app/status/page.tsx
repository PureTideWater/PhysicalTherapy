import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../components/format';
import { loadPublicPage } from '../../lib/http/next';
import { INCIDENT_STATUS_LABELS, STATUS_LABELS, statusPage } from '../../lib/routes/support';
import { PublicHeader } from '../../components/public-header';

export const metadata: Metadata = { title: 'Service status' };

/**
 * The public status page (milestone 11; docs/adr/0053): each component's status and the incidents open or
 * resolved in the last fortnight, as the platform administrators set them. No PHI, and no customer's or staff
 * member's name.
 */
export default async function StatusPage() {
  const { components, incidents, overall, maintenance, supportEmail } = await loadPublicPage(statusPage, {});
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:p-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">PaidWhole service status</h1>
        <p className="text-sm" data-overall={overall}>
          {maintenance ? 'Scheduled maintenance is in progress.' : overall === 'operational' ? 'All systems operational.' : STATUS_LABELS[overall]}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" aria-label="Components">
            <tbody>
              {components.map((component) => (
                <tr key={component.key} className="border-t first:border-t-0" data-component={component.key} data-status={component.status}>
                  <td className="py-1.5">{component.name}</td>
                  <td className="py-1.5 text-right">
                    <Badge variant={component.status === 'operational' ? 'outline' : 'destructive'}>{STATUS_LABELS[component.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3" aria-label="Incidents">
        <h2 className="text-xl font-bold tracking-display">Incidents</h2>
        {incidents.length === 0 ? (
          <EmptyState title="No incidents in the last 14 days" nextStep="Problems we know of are posted here as we work on them." />
        ) : (
          incidents.map((incident) => (
            <Card key={incident.id} data-incident-status={incident.status}>
              <CardHeader>
                <CardTitle className="text-base">
                  {incident.title} <Badge variant={incident.status === 'resolved' ? 'outline' : 'destructive'}>{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Started {utc(incident.startedAt)}
                  {incident.resolvedAt === null ? '' : `; resolved ${utc(incident.resolvedAt)}`}; {incident.impact} impact
                </p>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-2 text-sm">
                  {incident.updates.map((update) => (
                    <li key={`${update.postedAt.toISOString()}-${update.status}`}>
                      <span className="font-medium">{INCIDENT_STATUS_LABELS[update.status]}</span> <span className="text-xs text-muted-foreground">{utc(update.postedAt)}</span>
                      <p>{update.message}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        Questions: <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.{' '}
        <Link className="underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </main>
    </>
  );
}
