import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../components/action-form';
import { Field, SelectField, TextAreaField } from '../../components/field';
import { BRAND_DESCRIPTOR, BRAND_INDEPENDENCE } from '../../lib/brand';
import { loadPublicPage } from '../../lib/http/next';
import { requestAuditPage } from '../../lib/routes/onboarding';
import { HEARD_FROM_LABEL, REFERRING_FIRM_HINT, REFERRING_FIRM_LABEL, REQUEST_AUDIT_KEPT } from '../../lib/screening/retention';
import { requestAuditAction } from './actions';
import { PublicHeader } from '../../components/public-header';

export const metadata: Metadata = { title: 'Request an audit' };

/**
 * The public audit request (PRD 5, J1: "a public form with no PHI: name, organization, locations, payers, billing
 * arrangement"). The founder follows up with a scoping call; nothing here is a patient's information, and the form
 * refuses anything that looks like one. Its lede is the descriptor and the independence claim (Change Order 001,
 * CO-11; decision D11), the brand's words from @paidwhole/brand. Two optional fields ask how the requester heard of
 * PaidWhole and which billing firm referred them, and the form says what is kept with the request, the campaign link
 * the requester came from included (audit #57; the founder's rulings of 2026-10-20).
 */
export default async function RequestAuditPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sent, arrangements, sources } = await loadPublicPage(requestAuditPage, props);
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 md:p-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Request a PaidWhole contract-payment audit</h1>
        <p className="text-base text-muted-foreground" data-copy="lede">
          <span data-copy="descriptor">{BRAND_DESCRIPTOR}</span>. <span data-copy="independence">{BRAND_INDEPENDENCE}</span>
        </p>
      </div>
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
              No patient information: only who you are, your locations, the payers you bill and how you bill. A PaidWhole audit compares what your payers paid with what your contracts say.{' '}
              <span data-copy="kept" data-legal-surface="request-audit-kept">
                {REQUEST_AUDIT_KEPT}
              </span>
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
              <SelectField label={HEARD_FROM_LABEL} name="heardFrom" options={sources} />
              <Field label={REFERRING_FIRM_LABEL} name="referringFirm" maxLength={200} autoComplete="off" hint={REFERRING_FIRM_HINT} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Not ready for an audit?{' '}
        <Link className="underline" href="/screening">
          Try a free screening
        </Link>{' '}
        of your allowed amounts against Medicare, with no patient information. Already a customer?{' '}
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
