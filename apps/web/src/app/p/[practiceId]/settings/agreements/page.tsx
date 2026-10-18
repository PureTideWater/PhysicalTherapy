import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../../components/action-form';
import { FormKeys } from '../../../../../components/form-keys';
import { roleNames, utc, utcDate } from '../../../../../components/format';
import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { AGREEMENT_CHAIN, CHAIN_LABELS, agreementsSettingsPage } from '../../../../../lib/routes/settings';
import { confirmAgreements } from './actions';

export const metadata: Metadata = { title: 'Grants and agreements' };

/**
 * Grants and agreements (PRD 7, Settings; PRD 5, J2: "confirms the agreement chain"): the chain with each signed
 * document's reference and SHA-256, the administrator's confirmation, and the grants other organizations hold to
 * this practice. Approving and revoking a firm's grant is milestone 12's firm flow.
 */
export default async function AgreementsSettingsPage(props: { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(agreementsSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practiceId, agreements, missing, confirmation, canConfirm, grants, notice } = page.data;
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Grants and agreements</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="agreements" />
      {notice === 'confirmed' ? (
        <Alert>
          <AlertTitle>Agreement chain confirmed</AlertTitle>
          <AlertDescription>Your confirmation is recorded in the audit log.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Agreement chain</CardTitle>
          <CardDescription>Signed through the e-signature vendor or uploaded by the platform; each kept by reference and SHA-256.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul aria-label="Agreement chain" className="flex flex-col gap-1 text-sm">
            {AGREEMENT_CHAIN.map((kind) => {
              const latest = agreements.find((agreement) => agreement.kind === kind);
              return (
                <li key={kind} data-kind={kind} data-on-file={latest === undefined ? 'no' : 'yes'}>
                  <Badge variant={latest === undefined ? 'destructive' : 'outline'}>{latest === undefined ? 'Missing' : 'On file'}</Badge> {CHAIN_LABELS[kind]}
                  {latest === undefined ? null : (
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      version {latest.version}, signed by {latest.signer} on {utcDate(latest.signedAt)} ({latest.scope === 'practice' ? 'this practice' : 'the whole organization'});{' '}
                      <span className="font-mono">{latest.documentRef}</span>, SHA-256 <span className="font-mono" title={latest.sha256}>{latest.sha256.slice(0, 12)}…</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {confirmation === null ? null : (
            <p className="text-sm" data-confirmed="yes">
              Last confirmed {utc(confirmation.at)} by {confirmation.by}.
            </p>
          )}
          {canConfirm ? (
            missing.length > 0 ? (
              <p className="text-sm text-muted-foreground">The chain can be confirmed once every agreement is on file; the platform records each as it is signed.</p>
            ) : (
              <ActionForm action={confirmAgreements} submit="Confirm the agreement chain">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="confirm" required /> I have read these agreements and they are the ones our organization signed.
                </label>
              </ActionForm>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Confirming the chain is for the practice administrator.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Grants to this practice</CardTitle>
          <CardDescription>Other organizations that reach this practice, with the roles, dates and agreement they rest on.</CardDescription>
        </CardHeader>
        <CardContent>
          {grants === null ? (
            <p className="text-sm text-muted-foreground">Grants are listed for the practice administrator.</p>
          ) : grants.length === 0 ? (
            <EmptyState title="No grants" nextStep="A billing firm reaches this practice only through a grant you approve (milestone 12)." />
          ) : (
            <table className="w-full text-left text-sm" aria-label="Grants">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Organization</th>
                  <th className="py-1 pr-3 font-medium">Roles</th>
                  <th className="py-1 pr-3 font-medium">From</th>
                  <th className="py-1 pr-3 font-medium">Until</th>
                  <th className="py-1 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-t">
                    <td className="py-1 pr-3">
                      {grant.granteeName} <span className="text-xs text-muted-foreground">({grant.granteeKind})</span>
                    </td>
                    <td className="py-1 pr-3">{roleNames(grant.roles)}</td>
                    <td className="py-1 pr-3">{utcDate(grant.startsAt)}</td>
                    <td className="py-1 pr-3">{utcDate(grant.endsAt)}</td>
                    <td className="py-1">{grant.revokedAt !== null ? `revoked ${utcDate(grant.revokedAt)}` : grant.inForce ? 'in force' : 'not in force'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
