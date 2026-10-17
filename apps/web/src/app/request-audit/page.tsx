import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../components/action-form';
import { Field, SelectField, TextAreaField } from '../../components/field';
import { loadPublicPage } from '../../lib/http/next';
import { requestAuditPage } from '../../lib/routes/onboarding';
import { requestAuditAction } from './actions';
import { PublicHeader } from '../../components/public-header';

export const metadata: Metadata = { title: 'Request an audit' };

/**
 * The public audit request (PRD 5, J1: "a public form with no PHI: name, organization, locations, payers, billing
 * arrangement"). The founder follows up with a scoping call; nothing here is a patient's information, and the form
 * refuses anything that looks like one.
 */
export default async function RequestAuditPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sent, arrangements } = await loadPublicPage(requestAuditPage, props);
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 md:p-10">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Request a PaidWhole contract-payment audit</h1>
      {sent ? (
        <Alert>
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>We will email you to set up a short scoping call. Please do not send any remittance or patient information by email.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>About your practice</CardTitle>
            <CardDescription>
              No patient information: only who you are, your locations, the payers you bill and how you bill. A PaidWhole audit compares what your payers paid with what your contracts say.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={requestAuditAction} submit="Send request" className="grid gap-4">
              <Field label="Your name" name="contactName" required maxLength={200} autoComplete="name" />
              <Field label="Work email" name="contactEmail" type="email" required autoComplete="email" />
              <Field label="Organization" name="organizationName" required maxLength={200} autoComplete="organization" />
              <Field label="Locations" name="locations" type="number" min={1} max={1000} required inputMode="numeric" />
              <TextAreaField label="Payers you bill" name="payers" required hint="One per line, or separated by commas. Payer names only." />
              <SelectField label="How you bill" name="billingArrangement" options={arrangements} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Already a customer?{' '}
        <Link className="underline" href="/sign-in">
          Sign in
        </Link>
        . Service status:{' '}
        <Link className="underline" href="/status">
          status page
        </Link>
        .
      </p>
    </main>
    </>
  );
}
