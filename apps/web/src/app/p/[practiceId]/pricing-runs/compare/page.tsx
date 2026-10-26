import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm, RefusalTakeover } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { DiffSummaryText, DiffTable, SplitChangeText } from '../../../../../components/pricing/diff';
import { RerunBlockedBody, RunLink, RunStateBadges, diffRunName, rerunBlockedTitle } from '../../../../../components/pricing/display';
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
 * when the second is a re-run not yet accepted and the first is exactly what accepting it replaces (the
 * run in effect for its period), the roles that price runs accept it here. Compared with its original
 * after a later run of its dates took effect, the page links to the comparison with that run instead; a
 * re-run that can no longer be accepted, or waits for a first run being priced, is explained in a card in
 * the Accept card's place, in the run page's words (combined audit #10; docs/adr/0037, amendment of
 * 2026-10-26). Where Accept is offered, the diff is exactly what accepting changes: lines a run of other
 * service dates holds in effect are compared with that run, which the page names, and the Accept form posts
 * what the diff was against (payment-engine and security reviews of PR #50).
 */
export default async function ComparePricingRunsPage(props: Props) {
  const page = await loadPage(comparePricingRunsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="pricing_runs" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, before, after, diff, heldBy, canAccept, acceptance } = page.data;
  const path = `/p/${practiceId}/pricing-runs/compare`;
  const query = { before: before.id, after: after.id };
  return (
    <AppShell shell={page.shell} section="pricing_runs">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/pricing-runs`}>
          Pricing runs
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Compare two runs</h1>
        <p className="text-base text-muted-foreground">Lines are matched by service line. Complete runs never change, so this comparison reads the same tomorrow.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <RunHead label="First run" practiceId={practiceId} run={before} />
        <RunHead label="Second run" practiceId={practiceId} run={after} />
      </div>
      {diff === null ? (
        <EmptyState mark title="A run is still being priced" nextStep="Two runs compare once both are complete; reload this page in a moment." />
      ) : (
      <Card role="region" aria-label="Diff">
        <CardHeader>
          <CardTitle>What changed</CardTitle>
          <CardDescription data-state="diff-summary">
            <DiffSummaryText summary={diff.summary} accepting={heldBy !== null} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {heldBy === null || heldBy.length === 0 ? null : (
            <p className="text-sm" data-state="held-by">
              On some lines the pricing in effect is not the first run&apos;s but{' '}
              {heldBy.map((held, index) => (
                <span key={held.id}>
                  {index === 0 ? '' : index === heldBy.length - 1 ? ' and ' : ', '}
                  <Link className="underline" href={`/p/${practiceId}/pricing-runs/${held.id}`} data-run-link={held.id}>
                    {diffRunName(held)}
                  </Link>
                </span>
              ))}
              {heldBy.length === 1 ? ', a run of other service dates' : ', runs of other service dates'}. Accepting the second run replaces that pricing too, so those lines are compared with{' '}
              {heldBy.length === 1 ? 'it' : 'them'}: the lines below are exactly what accepting changes.
            </p>
          )}
          <SplitChangeText before={diff.before} after={diff.after} />
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
          <DiffTable practiceId={practiceId} lines={diff.lines} beforeRunId={before.id} afterRunId={after.id} heldBy={heldBy ?? undefined} />
          <Pager path={path} query={{ ...query, lines: diff.filter }} page={diff.page} pages={diff.pages} total={diff.total} noun="lines" />
        </CardContent>
      </Card>
      )}
      {canAccept ? (
        <Card role="region" aria-label="Accept the re-run">
          <CardHeader>
            <CardTitle>Accept the re-run</CardTitle>
            <CardDescription>
              {after.rerunOfId === before.id
                ? 'The second run prices the first again. Accepting makes it the run in effect for its period; the first run stays as it was.'
                : 'The first run took effect for these service dates after the second was created. Accepting the second makes it the run in effect in the first’s place; the first run stays as it was.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={acceptPricingRunFormAction}
              submit="Accept the second run"
              labels={{ runId: 'This re-run', replacesId: 'The run it replaces' }}
              refreshOnError={`accept:${after.id}`}
            >
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <input type="hidden" name="runId" value={after.id} />
              <input type="hidden" name="replacesId" value={before.id} />
              {(heldBy ?? []).map((held) => (
                <input key={held.id} type="hidden" name="heldByIds[]" value={held.id} />
              ))}
            </ActionForm>
          </CardContent>
        </Card>
      ) : acceptance === null ? null : acceptance.state === 'acceptable' ? (
        acceptance.replaces.id === before.id ? null : (
          <RefusalTakeover keys={[`accept:${after.id}`]}>
            <Card role="region" aria-label="Compare with the run in effect" data-state="compare-with-in-effect">
              <CardHeader>
                <CardTitle>Compare with the run in effect</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  Accepting this re-run replaces <RunLink practiceId={practiceId} run={acceptance.replaces} />, the run in effect for these service dates, not the first run here.{' '}
                  <Link className="underline" href={`${path}?before=${acceptance.replaces.id}&after=${after.id}`}>
                    Compare it with that run
                  </Link>{' '}
                  to see exactly what accepting changes, and to accept it.
                </p>
              </CardContent>
            </Card>
          </RefusalTakeover>
        )
      ) : (
        <RefusalTakeover keys={[`accept:${after.id}`]}>
          <Card
            role="region"
            aria-label={acceptance.state === 'superseded' ? 'This re-run can no longer be accepted' : 'Wait for the newer run'}
            data-state={acceptance.state === 'superseded' ? 'rerun-superseded' : 'rerun-waiting'}
            data-kind={acceptance.state === 'superseded' ? acceptance.kind : undefined}
          >
            <CardHeader>
              <CardTitle>{acceptance.state === 'superseded' ? 'This re-run can no longer be accepted' : 'Wait for the newer run'}</CardTitle>
              <CardDescription>{rerunBlockedTitle(acceptance)}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <RerunBlockedBody practiceId={practiceId} acceptance={acceptance} original={after.rerunOfId === before.id ? 'the first run' : undefined} />
            </CardContent>
          </Card>
        </RefusalTakeover>
      )}
    </AppShell>
  );
}
