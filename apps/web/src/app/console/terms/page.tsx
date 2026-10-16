import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field } from '../../../components/field';
import { FormKeys } from '../../../components/form-keys';
import { utc } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { consoleTermsPage } from '../../../lib/routes/console-onboarding';
import { publishTermsAction } from './actions';

export const metadata: Metadata = { title: 'Terms of use versions' };

/**
 * The terms of use by version (docs/adr/0053): each published by its document's reference and SHA-256; the latest
 * is in force, and every customer accepts it before anything else, again whenever a new version is published.
 */
export default async function ConsoleTermsPage() {
  const page = await loadPage(consoleTermsPage, {});
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="terms_versions" roles={page.roles} message={page.message} nextStep="Publishing the terms is for platform administrators." />;
  }
  const { versions } = page.data;
  return (
    <AppShell shell={page.shell} section="terms_versions">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of use</h1>
      {versions.length === 0 ? (
        <EmptyState title="No version published" nextStep="Publish the first version below; customers accept it at their next request." />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Terms versions">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Version</th>
              <th className="py-1 font-medium">Published</th>
              <th className="py-1 font-medium">Document</th>
              <th className="py-1 font-medium">SHA-256</th>
              <th className="py-1 font-medium">Acceptances</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id} className="border-t">
                <td className="py-1">
                  {version.version} {version.inForce ? <Badge variant="outline">in force</Badge> : null}
                </td>
                <td className="py-1">{utc(version.publishedAt)}</td>
                <td className="py-1 font-mono text-xs">{version.documentRef}</td>
                <td className="py-1 font-mono text-xs" title={version.sha256}>
                  {version.sha256.slice(0, 12)}…
                </td>
                <td className="py-1 tabular-nums">{version.acceptances}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Publish a new version</CardTitle>
          <CardDescription>From the moment it is published, every customer is asked to accept it before they continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={publishTermsAction} submit="Publish version" className="grid max-w-xl gap-3">
            <FormKeys />
            <Field label="Version" name="version" required maxLength={40} hint="Letters, digits and . _ - (for example 2026-11)." />
            <Field label="Document reference" name="documentRef" required maxLength={200} hint="Where the signed-off document is kept." />
            <Field label="SHA-256" name="sha256" required pattern="[0-9a-fA-F]{64}" hint="The document's SHA-256, 64 hexadecimal characters." />
          </ActionForm>
        </CardContent>
      </Card>
    </AppShell>
  );
}
