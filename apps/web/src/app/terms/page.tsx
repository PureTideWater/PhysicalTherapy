import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../components/action-form';
import { FormKeys } from '../../components/form-keys';
import { utc } from '../../components/format';
import { AppShell } from '../../components/shell';
import { loadPage } from '../../lib/http/next';
import { termsPage } from '../../lib/routes/onboarding';
import { acceptTermsAction } from './actions';

export const metadata: Metadata = { title: 'Terms of use' };

/**
 * The terms of use (milestone 11: "terms acceptance with version and timestamp per user, re-prompted when the
 * terms version changes"; docs/adr/0053). A customer who has not accepted the version in force is sent here first
 * by every other screen; the acceptance is recorded with its version and time.
 */
export default async function TermsPage() {
  const page = await loadPage(termsPage, {});
  if (page.kind === 'forbidden') {
    return null;
  }
  const { current, acceptedCurrentAt, history, internal } = page.data;
  return (
    <AppShell shell={page.shell} section="home">
      <h1 className="text-2xl font-bold tracking-display">PaidWhole terms of use</h1>
      {current === null ? (
        <EmptyState title="No terms are published yet" nextStep="Nothing to accept. Continue to your workspace." action={<Link className="text-sm underline" href="/">Continue</Link>} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Version {current.version}</CardTitle>
            <CardDescription>
              Published {utc(current.publishedAt)}. Document <span className="font-mono text-xs">{current.documentRef}</span>, SHA-256{' '}
              <span className="font-mono text-xs" title={current.sha256}>
                {current.sha256.slice(0, 16)}…
              </span>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {internal ? (
              <Alert>
                <AlertTitle>PaidWhole staff</AlertTitle>
                <AlertDescription>You work under PaidWhole&apos;s workforce policies rather than the customer terms; nothing here is required of you.</AlertDescription>
              </Alert>
            ) : null}
            {acceptedCurrentAt !== null ? (
              <p className="text-sm" data-accepted="current">
                You accepted this version on {utc(acceptedCurrentAt)}.{' '}
                <Link className="underline" href="/">
                  Continue to your workspace
                </Link>
              </p>
            ) : internal ? null : (
              <>
                <p className="text-sm">
                  {history.length === 0
                    ? 'Before you use the workspace, read the terms of use and accept them.'
                    : 'The terms of use have changed since you last accepted them. Read this version and accept it to continue.'}
                </p>
                <ActionForm action={acceptTermsAction} submit="I accept these terms">
                  <FormKeys />
                  <input type="hidden" name="termsVersionId" value={current.id} />
                </ActionForm>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {history.length === 0 ? null : (
        <section aria-label="Your acceptances" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Your acceptances</h2>
          <ul className="text-sm">
            {history.map((entry) => (
              <li key={`${entry.version}-${entry.acceptedAt.toISOString()}`}>
                Version {entry.version}, accepted {utc(entry.acceptedAt)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
