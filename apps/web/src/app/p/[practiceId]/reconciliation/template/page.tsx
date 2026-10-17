import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, PermissionState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { roleNames } from '../../../../../components/format';
import { proofLevelWords } from '../../../../../components/reconciliation/display';
import { TemplateMapper } from '../../../../../components/reconciliation/template-mapper';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { FIELD_LABELS } from '../../../../../lib/reconciliation/template';
import { templatePage } from '../../../../../lib/routes/reconciliation';
import { saveTemplateFormAction } from './actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Posting template' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The posting-template mapping (PRD 20: "Posting-export templates: one per practice-management system,
 * mapped at onboarding"; PRD 13, Matching step 2): the practice's current template; and, for a person
 * who reconciles postings, a built-in template or the practice's own mapping of its system's columns,
 * previewed on a sample in the browser. Saving reads the posting exports waiting for it at once.
 */
export default async function TemplatePage(props: Props) {
  const page = await loadPage(templatePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reconciliation" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, current, builtIn, waiting, proofLevel, canMap, roles, saved } = page.data;
  return (
    <AppShell shell={page.shell} section="reconciliation">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/reconciliation`}>
          Reconciliation
        </Link>
        <h1 className="text-2xl font-bold tracking-display">Posting template</h1>
        <p className="text-sm text-muted-foreground">
          How the practice’s payment-posting export is read: mapped once, at onboarding, for the practice-management system it comes from. Recovered is {proofLevelWords(proofLevel)}; the practice administrator sets the proof level.
        </p>
      </div>
      {saved ? (
        <Alert data-notice="saved">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>The template is the practice’s from now on; any posting export waiting for it is being read.</AlertDescription>
        </Alert>
      ) : null}
      <Card role="region" aria-label="Current template">
        <CardHeader>
          <CardTitle>{current === null ? 'No template mapped yet' : current.system}</CardTitle>
          <CardDescription>
            {current === null
              ? `Posting exports are stored and wait until a template is mapped${waiting === 0 ? '' : `: ${String(waiting)} ${waiting === 1 ? 'waits' : 'wait'} now`}.`
              : `${current.id === 'practice' ? 'The practice’s own mapping' : 'A built-in template'}; dates written ${current.dateFormat}.`}
          </CardDescription>
        </CardHeader>
        {current === null ? null : (
          <CardContent>
            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              {Object.entries(current.columns).map(([field, header]) => (
                <div key={field} className="flex gap-2">
                  <dt className="text-muted-foreground">{FIELD_LABELS[field as keyof typeof FIELD_LABELS]}:</dt>
                  <dd className="font-mono">{header}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        )}
      </Card>
      {canMap ? (
        <Card role="region" aria-label="Map the template">
          <CardHeader>
            <CardTitle>{current === null ? 'Map the template' : 'Map it again'}</CardTitle>
            <CardDescription>Choose a template, or map each field to the column of your system’s export that holds it; check the preview on a sample, then save.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveTemplateFormAction} submit="Save the template">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <TemplateMapper builtIn={builtIn} current={current} />
            </ActionForm>
          </CardContent>
        </Card>
      ) : (
        <PermissionState role={roleNames(roles)} cannot="map the posting template" nextStep="A billing manager or firm principal, who reconciles postings, maps it." />
      )}
    </AppShell>
  );
}
