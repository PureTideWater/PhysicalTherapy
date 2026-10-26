import type { EvaluatedEvidence, EvidenceSource, EvidenceStatus } from '@tp/compliance';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field, SelectField } from '../../../components/field';
import { FormKeys } from '../../../components/form-keys';
import { roleNames } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { compliancePage } from '../../../lib/routes/compliance';
import { recordEvidenceAction, sendEvidenceAction } from './actions';

export const metadata: Metadata = { title: 'SOC 2 evidence' };

const STATUS: Readonly<Record<EvidenceStatus, string>> = {
  in_repository: 'In the repository',
  current: 'Current',
  stale: 'Past its period',
  missing: 'Not recorded',
  awaiting_approval: 'Awaiting approval',
  failed: 'Failed',
  collected_externally: 'Collected by the platform',
  not_built: 'Not built yet',
};

const CONTROL_STATUS: Readonly<Record<string, string>> = { ready: 'Ready', action_needed: 'Action needed', partial: 'Partly built' };

const KIND: Readonly<Record<EvidenceSource['kind'], string>> = {
  ci_job: 'CI job',
  database_test: 'Database test',
  unit_test: 'Unit test',
  e2e_test: 'End-to-end test',
  cdk_assertion: 'CDK assertion',
  runbook: 'Runbook',
  policy: 'Policy',
  record: 'Record',
  external: 'Collected externally',
  not_built: 'Later milestone',
};

function describe(source: EvidenceSource): string {
  switch (source.kind) {
    case 'ci_job':
      return `${source.workflow}: ${source.step} (${source.what})`;
    case 'database_test':
    case 'unit_test':
    case 'e2e_test':
    case 'cdk_assertion':
      return `${source.file}: “${source.test}”`;
    case 'runbook':
      return source.file;
    case 'policy':
      return `docs/policies/${source.policy}.md`;
    case 'record':
      return source.what;
    case 'external':
      return source.what;
    case 'not_built':
      return `${source.what} (milestone ${String(source.milestone)})`;
  }
}

function good(status: EvidenceStatus): boolean {
  return status === 'in_repository' || status === 'current' || status === 'collected_externally';
}

function EvidenceRow({ item }: { readonly item: EvaluatedEvidence }) {
  return (
    <li className="flex flex-col gap-0.5 border-t py-1.5 first:border-t-0" data-evidence-status={item.status}>
      <span className="text-sm">
        <Badge variant={good(item.status) ? 'outline' : 'destructive'}>{STATUS[item.status]}</Badge> <span className="text-xs text-muted-foreground">{KIND[item.source.kind]}</span> {describe(item.source)}
      </span>
      <span className="text-xs text-muted-foreground">
        {item.note}
        {item.latest === null ? '' : `; latest ${item.latest.occurredOn}`}
      </span>
    </li>
  );
}

/**
 * The SOC 2 Type I evidence checklist (PRD 16; milestone 11; docs/adr/0053): every control of the plan's table
 * with its proposed criteria and each evidence source's status, the policies, the program's own evidence, and the
 * forms to record what people did and to export the checklist for the compliance platform. Repository evidence is
 * proved to exist by the build; nothing a person must do shows as done until it is recorded here.
 */
export default async function CompliancePage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(compliancePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="compliance" roles={page.roles} message={page.message} nextStep="The evidence checklist is for platform administrators." />;
  }
  const { checklist, workforce, records, recordKinds, policies, platformConnected, sent } = page.data;
  return (
    <AppShell shell={page.shell} section="compliance">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">SOC 2 Type I evidence</h1>
        <p className="text-base text-muted-foreground" data-counts={`${String(checklist.counts.ready)}/${String(checklist.counts.action_needed)}/${String(checklist.counts.partial)}`}>
          As of {checklist.today}: {checklist.counts.ready} controls ready, {checklist.counts.action_needed} needing action, {checklist.counts.partial} partly built. The criteria are a proposed mapping for the
          security official and the auditor to confirm.
        </p>
      </div>
      {sent === null ? null : (
        <Alert>
          <AlertTitle>Export sent</AlertTitle>
          <AlertDescription>The compliance platform received {sent}.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <a className="text-sm underline" href="/console/compliance/export" download>
          Download the export (JSON)
        </a>
        {platformConnected ? (
          <ActionForm action={sendEvidenceAction} submit="Send to the compliance platform" variant="outline">
            <FormKeys />
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">No compliance platform is connected in this environment; give it the downloaded export.</p>
        )}
      </div>
      {checklist.controls.map(({ control, status, evidence }) => (
        <Card key={control.id} data-control={control.id} data-control-status={status}>
          <CardHeader>
            <CardTitle className="text-base">
              {control.name} <Badge variant={status === 'ready' ? 'outline' : 'destructive'}>{CONTROL_STATUS[status]}</Badge>
            </CardTitle>
            <CardDescription>
              SOC 2 {control.soc2.join(', ')} · HIPAA §{control.hipaa.join(', §')}. {control.implementation}. Plan&apos;s evidence: {control.planEvidence}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul aria-label={`${control.name} evidence`}>
              {evidence.map((item) => (
                <EvidenceRow key={`${item.source.kind}-${describe(item.source)}`} item={item} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Program</CardTitle>
          <CardDescription>The risk analysis with its review date, and the security official, named (PRD 16).</CardDescription>
        </CardHeader>
        <CardContent>
          <ul aria-label="Program evidence">
            {checklist.program.map((item) => (
              <EvidenceRow key={describe(item.source)} item={item} />
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Policies</CardTitle>
          <CardDescription>Markdown in the repository, with versions. Each is in force once the security official&apos;s approval of its version is recorded.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" aria-label="Policies">
            <tbody>
              {checklist.policies.map((item) => (
                <tr key={item.policy.id} className="border-t first:border-t-0" data-policy-status={item.status}>
                  <td className="py-1">{item.policy.title}</td>
                  <td className="py-1 font-mono text-xs">{item.policy.file}</td>
                  <td className="py-1">version {item.policy.version}</td>
                  <td className="py-1">
                    <Badge variant={item.status === 'approved' ? 'outline' : 'destructive'}>{item.status === 'approved' ? `Approved ${item.approvedOn ?? ''}` : item.status === 'stale' ? 'Review due' : 'Draft, awaiting approval'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Record evidence</CardTitle>
          <CardDescription>
            By reference and SHA-256: the document itself stays where the program keeps its records. Name no person in the reference. A policy approval names the policy; an attestation or the security
            official names a member of the workforce.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={recordEvidenceAction} submit="Record" className="grid max-w-xl gap-3">
            <FormKeys />
            <SelectField label="What" name="kind" options={recordKinds} />
            <SelectField label="Policy (for an approval)" name="policy" options={[{ value: '', label: '—' }, ...policies.map((policy) => ({ value: policy.id, label: `${policy.title} ${policy.version}` }))]} />
            <SelectField label="Workforce member (for an attestation or the security official)" name="member" options={[{ value: '', label: '—' }, ...workforce.map((member) => ({ value: member.userId, label: `${member.email} (${roleNames(member.roles)})` }))]} />
            <Field label="Date it happened" name="occurredOn" type="date" required />
            <Field label="Document reference" name="documentRef" required maxLength={200} />
            <Field label="SHA-256" name="sha256" required pattern="[0-9a-fA-F]{64}" hint="The document's SHA-256, 64 hexadecimal characters." />
          </ActionForm>
        </CardContent>
      </Card>
      <section aria-label="Records" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Records kept</h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Evidence records">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">What</th>
                <th className="py-1 pr-3 font-medium">Subject</th>
                <th className="py-1 pr-3 font-medium">On</th>
                <th className="py-1 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t">
                  <td className="py-1 pr-3">{recordKinds.find((kind) => kind.value === record.kind)?.label ?? record.kind}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{workforce.find((member) => member.userId === record.subject)?.email ?? record.subject}</td>
                  <td className="py-1 pr-3">{record.occurredOn}</td>
                  <td className="py-1 font-mono text-xs" title={record.sha256}>
                    {record.documentRef}
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
