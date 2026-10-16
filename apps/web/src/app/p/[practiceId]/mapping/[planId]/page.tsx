import { MAPPING_KINDS } from '@tp/db/runtime';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PermissionState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { MappingText, TotalsText, VersionStatusBadge } from '../../../../../components/contracts/display';
import { Field, SelectField } from '../../../../../components/field';
import { roleNames, utc } from '../../../../../components/format';
import { Money } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { MAPPING_KIND_NAMES, windowText } from '../../../../../lib/contracts/display';
import type { ResolutionBucket } from '../../../../../lib/contracts/mapping-queries';
import { unpricedReasonText } from '../../../../../lib/contracts/remedies';
import { loadPage } from '../../../../../lib/http/next';
import { planPage } from '../../../../../lib/routes/mapping';
import { mapPlanFormAction } from '../actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Plan mapping' };

type Props = { readonly params: Promise<{ practiceId: string; planId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const NOTICES = {
  mapped: { title: 'Mapped', text: 'The plan is mapped from the date given. Its lines on those dates no longer wait on mapping.' },
  corrected: {
    title: 'Mapping corrected',
    text: 'A new mapping supersedes the one it corrects, which stays recorded as it was. Pricing runs made before the correction keep the mapping they priced with; once pricing runs exist, each run that used the corrected mapping is offered a re-run here.',
  },
  unchanged: { title: 'Nothing changed', text: 'The plan already has exactly this mapping.' },
} as const;

function outcomeText(bucket: ResolutionBucket): string {
  switch (bucket.outcome) {
    case 'CONTRACT_RATE':
      return 'Priced from the contract’s rate record';
    case 'MA_NONCONTRACTED':
      return 'Medicare Advantage non-contracted: 100% of the current fee schedule, every Medicare adjustment on';
    case 'NO_SERVICE_DATE':
      return 'No service date on the line';
    case 'NO_MAPPING':
    case 'NO_AGREEMENT':
    case 'DATE_OUTSIDE_VERSIONS':
    case 'NO_RATE_FOR_CODE':
    case 'AMBIGUOUS_RATE':
    case 'ENGINE_ERROR':
      return `${bucket.outcome}: ${unpricedReasonText(bucket.outcome).meaning}. Remedy: ${unpricedReasonText(bucket.outcome).remedy}`;
  }
}

/**
 * One payer and plan (PRD 7, Payer and plan mapping; PRD 5, J6): its lines and the dollars waiting on
 * a mapping, how its lines resolve against the practice's agreements now (the version pricing will
 * use, or the unpriced reason; PRD 11, step 1), every mapping it has had, and the form that maps it or
 * corrects a mapping with a new one (MAP-03).
 */
export default async function PlanPage(props: Props) {
  const page = await loadPage(planPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="mapping" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, detail, canMap, roles, notice } = page.data;
  const { plan, history, targets, resolution } = detail;
  const kinds = MAPPING_KINDS.filter((kind) => kind !== 'contract' || targets.length > 0);
  return (
    <AppShell shell={page.shell} section="mapping">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <Link className="underline" href={`/p/${practiceId}/mapping`}>
            Payer and plan mapping
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {plan.payerName}: {plan.planName ?? plan.planKey}
        </h1>
        <p className="text-sm text-muted-foreground">
          Plan key {plan.planKey}; payer identifier {plan.payerIdentifier}
          {plan.medicareAdvantage ? '; Medicare Advantage' : ''}.
        </p>
      </div>
      {notice === null ? null : (
        <Alert data-notice={notice}>
          <AlertTitle>{NOTICES[notice].title}</AlertTitle>
          <AlertDescription>{NOTICES[notice].text}</AlertDescription>
        </Alert>
      )}
      <Card role="region" aria-label="This plan's lines">
        <CardHeader>
          <CardTitle>
            Waiting on mapping: <Money value={plan.waiting.chargeCents} /> billed
          </CardTitle>
          <CardDescription>
            Waiting: <TotalsText totals={plan.waiting} />. All of the plan’s: <TotalsText totals={plan.totals} />.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h2 className="mb-2 text-base font-semibold">How the plan’s lines resolve now</h2>
          {resolution.length === 0 ? (
            <p className="text-sm text-muted-foreground">The plan has no lines yet.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Agreement resolution">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Outcome</th>
                  <th className="py-1 font-medium">Contract version</th>
                  <th className="py-1 text-right font-medium">Lines</th>
                  <th className="py-1 text-right font-medium">Billed</th>
                </tr>
              </thead>
              <tbody>
                {resolution.map((bucket) => (
                  <tr key={`${bucket.outcome}:${bucket.version?.versionId ?? ''}`} className="border-t" data-outcome={bucket.outcome}>
                    <td className="py-1 pr-3">{outcomeText(bucket)}</td>
                    <td className="py-1 pr-3">
                      {bucket.version === null ? (
                        '—'
                      ) : (
                        <>
                          <Link className="underline" href={`/p/${practiceId}/contracts/versions/${bucket.version.versionId}`}>
                            {bucket.version.contractTitle}, version {bucket.version.versionNo}
                          </Link>{' '}
                          <VersionStatusBadge status={bucket.version.status} />
                        </>
                      )}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">{bucket.lines}</td>
                    <td className="py-1 text-right">
                      <Money value={bucket.chargeCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Only a signed-off version covering a line’s service date prices it. A pricing run records this resolution for each line and never changes afterwards.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{plan.current.length === 0 ? 'Map this plan' : 'Map from another date, or correct a mapping'}</CardTitle>
          <CardDescription>
            Map the plan to a signed-off version of one of {plan.payerName}’s contracts, or mark it as having no agreement (out of network), Medicare Advantage non-contracted,
            government or other. Mappings of a plan never overlap: to change one, correct it; the mapping it corrects is kept as it was.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canMap ? (
            <PermissionState role={roleNames(roles)} cannot="map payer plans" nextStep="The billing manager or the firm principal maps plans." />
          ) : (
            <ActionForm action={mapPlanFormAction} submit="Save the mapping" className="grid max-w-xl gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="planId" value={plan.id} />
              <SelectField label="Agreement" name="kind" options={kinds.map((kind) => ({ value: kind, label: MAPPING_KIND_NAMES[kind] }))} />
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No contract of this payer has a signed-off version yet; a contract mapping becomes available once one is signed off on the{' '}
                  <Link className="underline" href={`/p/${practiceId}/contracts`}>
                    Contracts
                  </Link>{' '}
                  screen.
                </p>
              ) : (
                <SelectField
                  label="Contract version (for a contract mapping)"
                  name="contractVersionId"
                  options={[
                    { value: '', label: 'None (not a contract mapping)' },
                    ...targets.map((target) => ({
                      value: target.versionId,
                      label: `${target.contractTitle}, version ${String(target.versionNo)} (${windowText(target.effectiveFrom, target.effectiveTo)})`,
                    })),
                  ]}
                />
              )}
              <Field label="Effective from" name="effectiveFrom" type="date" required />
              <Field label="Last day (optional)" name="lastDay" type="date" hint="Leave blank while the mapping is open-ended." />
              {plan.current.length === 0 ? null : (
                <SelectField
                  label="Corrects"
                  name="supersedesId"
                  options={[
                    { value: '', label: 'Nothing: a new mapping for dates no mapping covers' },
                    ...plan.current.map((mapping) => ({
                      value: mapping.id,
                      label: `${mapping.version === null ? MAPPING_KIND_NAMES[mapping.kind] : `${mapping.version.contractTitle}, version ${String(mapping.version.versionNo)}`} (${windowText(mapping.effectiveFrom, mapping.effectiveTo)})`,
                    })),
                  ]}
                />
              )}
            </ActionForm>
          )}
        </CardContent>
      </Card>
      <section aria-label="Mapping history" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Every mapping of this plan</h2>
        {history.length === 0 ? (
          <EmptyState title="Never mapped" nextStep="Until it is mapped, every line of this plan waits on mapping and pricing refuses to run over it." />
        ) : (
          <table className="w-full text-left text-sm" aria-label="Mappings">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Mapping</th>
                <th className="py-1 font-medium">State</th>
                <th className="py-1 font-medium">Mapped by</th>
              </tr>
            </thead>
            <tbody>
              {history.map((mapping) => (
                <tr key={mapping.id} className="border-t align-top" data-mapping={mapping.id}>
                  <td className="py-1 pr-3">
                    <MappingText practiceId={practiceId} kind={mapping.kind} mapping={mapping} />
                  </td>
                  <td className="py-1 pr-3">
                    {mapping.supersededById === null ? <Badge>Current</Badge> : <Badge variant="outline">Corrected by a later mapping</Badge>}
                    {mapping.supersedesId === null ? null : <div className="text-xs text-muted-foreground">Corrects an earlier mapping</div>}
                  </td>
                  <td className="py-1">
                    {mapping.mappedBy}
                    <div className="text-xs text-muted-foreground">{utc(mapping.mappedAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
