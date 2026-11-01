import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../../components/action-form';
import { CheckboxField, SelectField } from '../../../../../components/field';
import { FormKeys } from '../../../../../components/form-keys';
import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { proofLevelPage } from '../../../../../lib/routes/settings';
import { setProofLevel } from './actions';

export const metadata: Metadata = { title: 'Proof level' };

const LABELS: Readonly<Record<string, string>> = {
  posted: 'Posted: recovered once the payment is posted in your practice-management system',
  deposited: 'Deposited: recovered once the deposit is matched in your bank export',
};

/**
 * The proof level for "recovered" (PRD 7, Settings; docs/adr/0043, 0053): posted or deposited, the practice
 * administrator's alone, with what the change does to lines already recovered stated, and counted, before it is
 * saved. The next reconcile applies it.
 */
export default async function ProofLevelPage(props: { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(proofLevelPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practiceId, level, levels, moving, eftExports, rule, canSet, notice } = page.data;
  const other = level === 'posted' ? 'deposited' : 'posted';
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Proof level</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="proof_level" />
      {notice === null ? null : (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>The next reconcile, queued now, moves the lines the change affects.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Now: {level}</CardTitle>
          <CardDescription>{LABELS[level]}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>{rule}</p>
          <p data-moving={moving}>
            Changing to {other} would move {moving} line{moving === 1 ? '' : 's'}.
            {other === 'deposited' && eftExports === 0 ? ' No bank export has been uploaded yet, so no deposit can be matched until one is.' : ''}
          </p>
          {canSet ? (
            <ActionForm action={setProofLevel} submit="Save proof level" className="grid max-w-md gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <SelectField label="Proof level" name="proofLevel" options={levels.map((value) => ({ value, label: LABELS[value] ?? value }))} defaultValue={other} />
              <CheckboxField name="confirm" errorName="Confirmation" label="I have read what the change does to lines already recovered (posted or deposited)." required />
            </ActionForm>
          ) : (
            <p className="text-xs text-muted-foreground">The proof level is set by the practice administrator.</p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
