import { EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../../../../components/format';
import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { accessLogPage } from '../../../../../lib/routes/settings';

export const metadata: Metadata = { title: 'Access log' };

/**
 * The access log (PRD 6, Audit log: "the access report answers 'who read claim X' in one query"; PRD 7: "the
 * access log is read-only"): who acted on this practice's records, through which route (membership, a grant,
 * a support grant with its ticket), newest first; filtered to one record from that record's own page.
 */
export default async function AccessLogPage(props: { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(accessLogPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="The access log is for the practice administrator." />;
  }
  const { practiceId, filter, entries, next } = page.data;
  const filtered = filter.objectId !== null;
  const base = `/p/${practiceId}/settings/access-log`;
  const query = filtered ? `object_type=${filter.objectType ?? ''}&object_id=${filter.objectId ?? ''}&` : '';
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-2xl font-semibold tracking-tight">Access log</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="access_log" />
      <p className="text-sm text-muted-foreground">
        {filtered ? (
          <>
            Who acted on one {filter.objectType} record.{' '}
            <Link className="underline" href={base}>
              Show everything
            </Link>
          </>
        ) : (
          'Every read and change of this practice’s records, newest first. Read-only.'
        )}
      </p>
      {entries.length === 0 ? (
        <EmptyState title="Nothing logged" nextStep={filtered ? 'Nobody has read or changed this record.' : 'Reads and changes appear here as people work.'} />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Access log">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">When</th>
              <th className="py-1 font-medium">Who</th>
              <th className="py-1 font-medium">Through</th>
              <th className="py-1 font-medium">What</th>
              <th className="py-1 font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t" data-action={entry.action}>
                <td className="py-1">{utc(entry.at)}</td>
                <td className="py-1">{entry.actor}</td>
                <td className="py-1">
                  {entry.via}
                  {entry.ticket === null ? '' : ` (ticket ${entry.ticket})`}
                </td>
                <td className="py-1">
                  {entry.action}
                  {entry.purpose === null ? '' : ` (${entry.purpose})`}
                </td>
                <td className="py-1 font-mono text-xs">
                  {entry.objectId === null ? (
                    entry.objectType
                  ) : (
                    <Link className="underline" href={`${base}?object_type=${entry.objectType}&object_id=${entry.objectId}`}>
                      {entry.objectType}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {next === null ? null : (
        <Link className="text-sm underline" href={`${base}?${query}before=${encodeURIComponent(next)}`}>
          Older entries
        </Link>
      )}
    </AppShell>
  );
}
