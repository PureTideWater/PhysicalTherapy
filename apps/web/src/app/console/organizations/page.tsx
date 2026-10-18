import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { Field, SelectField } from '../../../components/field';
import { utcDate } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { organizationsPage } from '../../../lib/routes/console';
import { createOrganizationAction } from '../actions';
import { FormKeys } from '../../../components/form-keys';

export const metadata: Metadata = { title: 'Organizations' };

const KIND_NAMES: Readonly<Record<string, string>> = { group: 'Practice group', firm: 'Billing firm', internal: 'Internal' };

/** Internal console: organizations (PRD 7). Records only; no practice's data is read here. */
export default async function OrganizationsPage() {
  const page = await loadPage(organizationsPage, {});
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="organizations" roles={page.roles} message={page.message} nextStep="The internal console is for platform administrators." />;
  }
  const { organizations } = page.data;
  return (
    <AppShell shell={page.shell} section="organizations">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Organizations and practices</h1>
      <Card>
        <CardHeader>
          <CardTitle>New organization</CardTitle>
          <CardDescription>A practice group owns its practices; a billing firm reaches them through grants the practice approves.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createOrganizationAction} submit="Create organization" className="grid max-w-xl gap-4">
            <FormKeys />
            <SelectField
              label="Kind"
              name="kind"
              options={[
                { value: 'group', label: KIND_NAMES.group ?? 'group' },
                { value: 'firm', label: KIND_NAMES.firm ?? 'firm' },
              ]}
            />
            <Field label="Name" name="name" required maxLength={200} />
          </ActionForm>
        </CardContent>
      </Card>
      {organizations.length === 0 ? (
        <EmptyState mark title="No organizations yet" nextStep="Create the practice group for the first customer above." />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Organizations">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 font-medium">Kind</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id} className="border-t">
                <td className="py-1">
                  <Link className="underline" href={`/console/organizations/${organization.id}`}>
                    {organization.name}
                  </Link>
                </td>
                <td className="py-1">{KIND_NAMES[organization.kind] ?? organization.kind}</td>
                <td className="py-1">
                  <Badge variant="outline">{organization.status}</Badge>
                </td>
                <td className="py-1">{utcDate(organization.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
