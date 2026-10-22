import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { roleNames } from '../../../../components/format';
import { SettingsNav } from '../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { settingsPage } from '../../../../lib/routes/settings';

export const metadata: Metadata = { title: 'Settings' };

const STEPS: Readonly<Record<string, { readonly title: string; readonly detail: string }>> = {
  mfa: { title: 'Multi-factor authentication', detail: 'Enrolled when you first signed in; manage your devices.' },
  terms: { title: 'Terms of use', detail: 'Accepted with their version and time.' },
  agreements: { title: 'Confirm the agreement chain', detail: 'BAA, engagement letter, terms and data-rights addendum on file, confirmed by you.' },
  team: { title: 'Invite your team', detail: 'A billing manager and a viewer, at least.' },
  billing: { title: 'Choose a plan and a payment method', detail: 'ACH or card, through the payment provider.' },
  billing_zip: { title: 'Confirm your billing ZIP', detail: 'The ZIP code, and the ZIP+4 where Medicare needs it, that every line is priced at.' },
  upload: { title: 'Upload your first remittances', detail: '835 files from your clearinghouse or payer portals.' },
  correspondence: { title: 'Set the correspondence contact', detail: 'Whom a payer writes to or calls about a dispute: every packet prints it, and none is exported without it.' },
};

/**
 * Settings (PRD 7, Settings; PRD 5, J2; docs/adr/0053): the sections the role reaches, administrator-only ones
 * marked, and for the practice administrator the onboarding checklist from invitation to first upload.
 */
export default async function SettingsPage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(settingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practice, roles, via, checklist } = page.data;
  return (
    <AppShell shell={page.shell} section="settings">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Settings</h1>
        <p className="text-base text-muted-foreground">
          {practice.name}. Your role: {roleNames(roles)}
          {via === 'ownership' ? '' : ' (through a grant)'}.
        </p>
      </div>
      <SettingsNav practiceId={practice.id} organizationId={practice.organizationId} current="overview" />
      {checklist === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              {checklist.every((step) => step.done) ? 'Everything is set up.' : `${String(checklist.filter((step) => step.done).length)} of ${String(checklist.length)} done.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2" aria-label="Getting started">
              {checklist.map((step) => (
                <li key={step.key} className="flex items-start gap-2 text-sm" data-step={step.key} data-done={step.done ? 'yes' : 'no'}>
                  <Badge variant={step.done ? 'outline' : 'destructive'}>{step.done ? 'Done' : 'To do'}</Badge>
                  <span>
                    <Link className="font-medium underline" href={step.href}>
                      {step.title ?? STEPS[step.key]?.title ?? step.key}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{step.detail ?? STEPS[step.key]?.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
