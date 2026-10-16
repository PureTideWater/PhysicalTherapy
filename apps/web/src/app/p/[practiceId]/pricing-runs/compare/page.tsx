import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { DiffSummaryText, DiffTable } from '../../../../../components/pricing/diff';
import { RunStateBadges } from '../../../../../components/pricing/display';
import { Pager } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import type { RunSummary } from '../../../../../lib/pricing/queries';
import { comparePricingRunsPage } from '../../../../../lib/routes/pricing';
import { acceptPricingRunFormAction } from '../actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Compare pricing runs' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTER_NAMES: Readonly<Record<string, string>> = {
  all: 'Every difference',
  changed: 'Priced differently',
  only_before: 'In the first run only',
  only_after: 'In the second run only',
};

function RunHead({ label, practiceId, run }: { readonly label: string; readonly practiceId: string; readonly run: RunSummary }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3 text-sm" data-run={run.id}>
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <Link className="font-medium underline" href={`/p/${practiceId}/pricing-runs/${run.id}`}>
        {run.periodFrom} to {run.periodTo}
      </Link>
      <span>
        Rule release {run.releaseNo}, engine <span className="font-mono text-xs">{run.engineVersion}</span>
      </span>
      <span className="text-xs text-muted-foreground">Complete {utc(run.completedAt)}</span>
      <div className="flex flex-wrap gap-1">
        <RunStateBadges run={run} />
      </div>
    </div>
  );
}

/**
 * Two complete pricing runs compared (PRD 7, Pricing runs: "compare two runs; re-run under a new release
 * with a diff"; PRD 9, step 4; docs/adr/0037): exactly the lines whose expected allowed, unpriced
 * reason or adjustments differ, with both runs' results and each line's cause from the traces (a rule
 * record, a contract version, a mapping), and the lines only one of them priced. Neither run changes;
 * when the second re-prices the first and is not yet accepted, the roles that price runs accept it here.
 */
export default async function ComparePricingRunsPage(props: Props) {
  const page = await loadPage(comparePricingRunsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, before, after, diff, canAccept } = page.data;
  const path = `/p/${practiceId}/pricing-runs/compare`;
  const query = { before: before.id, after: after.id };
  return (
    <AppShell shell={page.shell} section="pricing_runs">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/pricing-runs`}>
          Pricing runs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Compare two runs</h1>
        <p className="text-sm text-muted-foreground">Lines are matched by service line. Complete runs never change, so this comparison reads the same tomorrow.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RunHead label="First run" practiceId={practiceId} run={before} />
        <RunHead label="Second run" practiceId={practiceId} run={after} />
      </div>
      {diff === null ? (
        <EmptyState title="A run is still being priced" nextStep="Two runs compare once both are complete; reload this page in a moment." />
      ) : (
      <Card role="region" aria-label="Diff">
        <CardHeader>
          <CardTitle>What changed</CardTitle>
          <CardDescription data-state="diff-summary">
            <DiffSummaryText summary={diff.summary} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <nav aria-label="Diff filter" className="flex flex-wrap gap-2 text-sm">
            {Object.entries(FILTER_NAMES).map(([name, label]) => (
              <Link
                key={name}
                href={`${path}?before=${before.id}&after=${after.id}&lines=${name}`}
                aria-current={name === diff.filter ? 'page' : undefined}
                className={name === diff.filter ? 'font-medium underline' : 'underline'}
              >
                {label}
              </Link>
            ))}
          </nav>
          <DiffTable practiceId={practiceId} lines={diff.lines} beforeRunId={before.id} afterRunId={after.id} />
          <Pager path={path} query={{ ...query, lines: diff.filter }} page={diff.page} pages={diff.pages} total={diff.total} noun="lines" />
        </CardContent>
      </Card>
      )}
      {canAccept ? (
        <Card role="region" aria-label="Accept the re-run">
          <CardHeader>
            <CardTitle>Accept the re-run</CardTitle>
            <CardDescription>The second run prices the first again. Accepting makes it the run in effect for its period; the first run stays as it was.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={acceptPricingRunFormAction} submit="Accept the second run">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="runId" value={after.id} />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
