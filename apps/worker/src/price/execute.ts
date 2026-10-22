import { type AgreementRecords, LOCATION_NOT_READY_STATUSES, PricingRefusedError, agreementResolver, assertPricingAllowed, loadAgreementRecords } from '@tp/contracts';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import type { Logger } from '@tp/observability';
import { ENGINE_VERSION, type AgreementInput, type IndexedRelease, type LineFacts, type LinePricing, type PracticeSettings, type PricingInput, price } from '@tp/pricing';

import { type RunCoverage, computeCoverage, operatorAlerts } from './coverage';
import { FIRST_CLAIM, type RunScope, type StoredClaim, claimPage, runPlans } from './lines';
import { loadRuleRelease } from './release';
import { runSettings } from './settings';
import { type PricedLineInsert, insertPricedLines, pricedLineRow } from './store';

/**
 * Executing a pricing run (PRD 5, J7; PRD 11, Inputs and step 9): every line of the run's period, each
 * resolved through @tp/contracts' pure resolver against the mappings, signed-off versions and rate
 * records in force on its service date, and priced by @tp/pricing's price() under the run's pinned
 * release, the practice's settings and the run's triage date (its creation day, UTC), always inside
 * the run's one practice (the job's scope). Each line is stored with its amounts or its reason and
 * its full trace; a line the engine cannot price is recorded as it says (ENGINE_ERROR with its fixed
 * detail) and the run goes on. The coverage summary is totalled from the stored lines and the run
 * completes in the same transaction, so a failed attempt leaves nothing and the next starts over.
 *
 * - The run is taken from queued to running in a transaction of its own, so its screen says so.
 * - A run whose engine version is not this engine's fails (engine_version_mismatch): a run is priced
 *   only by the engine it records. A run over a plan with no mapping at all fails (unmapped_plan),
 *   whatever was loaded since the run was created (MAP-01). Neither retries: retrying changes nothing.
 * - One run of a practice executes at a time (a transaction-scoped advisory lock per practice), and
 *   a run already complete or failed is left as it is, so a replayed job has no effect (JOB-01).
 * - A run whose practice's location a line cannot be priced at (audit #33 and #7; docs/adr/0064): the
 *   location's status over the run's period is read once, when the run starts. When it is one a line
 *   cannot be priced at (a ZIP Medicare's list lacks, one that needs its ZIP+4 and has none, or a
 *   ZIP+4 the list does not hold; or no location at all, for a run created before locations existed)
 *   and the engine stops a line on the location, the pricing transaction is rolled back whole and the
 *   run fails as location_not_ready with no line kept: the customer's step, which the screens name,
 *   never the operator's alert. The month waits for the location (../monitor/plan.ts). A month whose
 *   lines never read the locality (a fixed schedule, per visit) prices as usual; with a ready location
 *   (or a content gap, locality_not_loaded) a stopped line stays ENGINE_ERROR for the operator. So does a
 *   line stopped as no_locality_plus_four at any status: the release has no ZIP+4 file of the ZIP in force
 *   on its date, a gap in PaidWhole's content that the customer cannot fix, so it never fails the run.
 */

export type FailureCode = 'engine_version_mismatch' | 'unmapped_plan' | 'job_failed' | 'location_not_ready';

export type ExecuteOutcome =
  | { readonly outcome: 'complete'; readonly coverage: RunCoverage }
  | { readonly outcome: 'failed'; readonly failureCode: FailureCode }
  | { readonly outcome: 'already_finished'; readonly status: 'complete' | 'failed' }
  | { readonly outcome: 'missing' };

export interface PricingJobContext {
  /** The job: the actor of every transaction and the request ID of every audited read. */
  readonly jobId: string;
  readonly logger: Logger;
  transaction<T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>): Promise<T>;
}

export interface ExecuteOptions {
  /** Claims priced and written per batch; memory holds one batch's lines and traces at a time. */
  readonly claimsPerBatch?: number;
}

/**
 * The line a completed run logs once when it recorded engine errors that page the operator (the closed
 * list's remedy for ENGINE_ERROR); the worker log group's metric filter and alarm count it
 * (infra/lib/jobs.ts, PRICING_ENGINE_ERRORS_MESSAGE).
 */
export const ENGINE_ERRORS_MESSAGE = 'pricing run recorded engine errors for the operator';

const CLAIMS_PER_BATCH = 500;

/**
 * The engine's details that stop a line on the practice's location, whatever its status: no ZIP+4 for a ZIP that needs
 * one, and a ZIP+4 no range of the ZIP+4 file in force holds. Never no_locality_plus_four (no ZIP+4 file of the ZIP in
 * force on the line's date): that is a gap in the content, the operator's to load, whatever the ZIP+4.
 */
const LOCATION_DETAILS: ReadonlySet<string> = new Set(['locality_needs_zip_plus_four', 'zip_plus_four_not_in_locality_map']);

/**
 * The engine details that stop a line on the location at a status (null: none, the location prices or the gap is
 * content): the ZIP+4's two always; no_locality when the ZIP is on no Medicare list (zip_unknown); and
 * invalid_settings when the practice has no location at all (an empty ZIP). A content gap (no_locality_plus_four, or
 * no_locality at a known ZIP) is never one: its line stays ENGINE_ERROR and pages the operator.
 */
export function locationStops(status: string): ReadonlySet<string> | null {
  if ((LOCATION_NOT_READY_STATUSES as readonly string[]).includes(status)) {
    return status === 'zip_unknown' ? new Set([...LOCATION_DETAILS, 'no_locality']) : LOCATION_DETAILS;
  }
  return status === 'zip_missing' ? new Set([...LOCATION_DETAILS, 'invalid_settings']) : null;
}

/** A line of the run stopped on the practice's location: the run fails as location_not_ready, its lines rolled back. */
class LocationNotReady extends Error {
  override readonly name = 'LocationNotReady';
}

interface RunRow {
  readonly id: string;
  readonly practice_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly release_no: number;
  readonly engine_version: string;
  readonly status: 'queued' | 'running' | 'complete' | 'failed';
  readonly created_at: Date;
  /** Lines loaded after this are not the run's: its creation, or for a re-run the original's (text, to the microsecond). */
  readonly cut_off: string;
  /** The practice's location status over the run's period under its release (practice_location_status()). */
  readonly location: string;
}

async function lockRun(client: ScopeClient, practiceId: string, pricingRunId: string): Promise<RunRow | undefined> {
  const { rows } = await client.query<RunRow>(
    `SELECT id, practice_id, period_from::text AS period_from, period_to::text AS period_to, release_no, engine_version, status, created_at,
            coalesce(lines_loaded_by, created_at)::text AS cut_off, practice_location_status(practice_id, release_no, period_from, period_to) AS location
       FROM pricing_run WHERE id = $1 AND practice_id = $2 FOR UPDATE`,
    [pricingRunId, practiceId],
  );
  return rows[0];
}

/** Marks an open run failed with a fixed code; a run already finished is left as it is. */
export async function failRun(client: ScopeClient, practiceId: string, pricingRunId: string, failureCode: FailureCode): Promise<boolean> {
  const { rowCount } = await client.query("UPDATE pricing_run SET status = 'failed', failure_code = $3 WHERE id = $1 AND practice_id = $2 AND status IN ('queued', 'running')", [
    pricingRunId,
    practiceId,
    failureCode,
  ]);
  return (rowCount ?? 0) > 0;
}

/** The engine's input for one stored claim, each line's agreement resolved for its own date. */
export function claimInput(claim: StoredClaim, resolve: (line: StoredClaim['lines'][number]) => AgreementInput, release: IndexedRelease, settings: PracticeSettings, asOf: string): PricingInput {
  const lines: LineFacts[] = claim.lines.map((line) => ({
    lineNo: line.lineNo,
    serviceLineId: line.serviceLineId,
    procedureCode: line.procedureCode,
    modifiers: line.modifiers,
    units: line.units,
    serviceDate: line.serviceDate,
    placeOfService: line.placeOfService,
    chargeCents: line.chargeCents,
    observedAllowedCents: line.observedAllowedCents,
    observedAllowedBasis: line.observedAllowedBasis,
    patientShareAdjustments: line.patientShare.map((item) => ({ groupCode: 'PR' as const, reasonCode: item.reasonCode, amountCents: item.amountCents })),
    agreement: resolve(line),
  }));
  return {
    claim: {
      claimStatusCode: claim.claimStatusCode,
      reversed: claim.reversed,
      corrected: claim.corrected,
      remittanceDate: claim.remittanceDate,
      payerPlanKey: claim.lines[0]?.planId ?? null,
      lines,
    },
    release,
    settings,
    asOf,
  };
}

/**
 * A resolver over the loaded records that never throws: a line whose agreement cannot be resolved
 * (an invariant the database holds, broken; or anything else) is RESOLUTION_FAILED, which the engine
 * records as ENGINE_ERROR agreement_unresolved, and the run goes on.
 */
export function lineResolver(records: AgreementRecords): (line: StoredClaim['lines'][number]) => AgreementInput {
  const resolver = agreementResolver(records);
  return (line) => {
    try {
      return resolver.resolve({ planId: line.planId, serviceDate: line.serviceDate, procedureCode: line.procedureCode, modifiers: line.modifiers, placeOfService: line.placeOfService });
    } catch {
      return { outcome: 'RESOLUTION_FAILED' };
    }
  };
}

/**
 * Prices one batch of claims into rows; the results pair with the stored lines by line number. `seen`, when given,
 * is shown each of the engine's results before its row is made.
 */
export function priceClaims(
  claims: readonly StoredClaim[],
  resolve: (line: StoredClaim['lines'][number]) => AgreementInput,
  release: IndexedRelease,
  settings: PracticeSettings,
  asOf: string,
  seen?: (result: LinePricing) => void,
): PricedLineInsert[] {
  const rows: PricedLineInsert[] = [];
  for (const claim of claims) {
    const results = price(claimInput(claim, resolve, release, settings, asOf));
    const byLine = new Map(claim.lines.map((line) => [line.lineNo, line]));
    for (const result of results) {
      const line = byLine.get(result.lineNo);
      if (line === undefined) {
        throw new Error('the engine returned a line the claim does not hold');
      }
      seen?.(result);
      rows.push(pricedLineRow(line, result));
    }
  }
  return rows;
}

/** The run's triage date: the day it was created, in UTC (windows are judged on it, PRD 11 step 8). */
export function runAsOf(createdAt: Date): string {
  return createdAt.toISOString().slice(0, 10);
}

export async function executePricingRun(context: PricingJobContext, practiceId: string, pricingRunId: string, options: ExecuteOptions = {}): Promise<ExecuteOutcome> {
  const started = await context.transaction(async (scope): Promise<ExecuteOutcome | RunRow> => {
    const run = await lockRun(scope.client, practiceId, pricingRunId);
    if (run === undefined) {
      return { outcome: 'missing' };
    }
    if (run.status === 'complete' || run.status === 'failed') {
      return { outcome: 'already_finished', status: run.status };
    }
    if (run.engine_version !== ENGINE_VERSION) {
      await failRun(scope.client, practiceId, pricingRunId, 'engine_version_mismatch');
      return { outcome: 'failed', failureCode: 'engine_version_mismatch' };
    }
    if (run.status === 'queued') {
      await scope.client.query("UPDATE pricing_run SET status = 'running' WHERE id = $1", [pricingRunId]);
    }
    return run;
  });
  if ('outcome' in started) {
    return started;
  }

  const stops = locationStops(started.location);
  const priceRun = (): Promise<ExecuteOutcome> => context.transaction(async (scope): Promise<ExecuteOutcome> => {
    // One run of the practice at a time, whatever the queue does.
    await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('pricing_run:' || $1::text, 0))", [practiceId]);
    const run = await lockRun(scope.client, practiceId, pricingRunId);
    if (run === undefined || run.status !== 'running') {
      return run === undefined ? { outcome: 'missing' } : { outcome: 'already_finished', status: run.status === 'complete' ? 'complete' : 'failed' };
    }
    // A re-run prices the lines its original priced: the original's cut-off, not its own creation.
    const lines: RunScope = { practiceId, periodFrom: run.period_from, periodTo: run.period_to, loadedBy: run.cut_off };
    const request = { practiceId, requestId: context.jobId, purpose: 'pricing' };
    const records = await loadAgreementRecords(scope, request);
    try {
      assertPricingAllowed(await runPlans(scope.client, lines), records.mappings);
    } catch (error) {
      if (!(error instanceof PricingRefusedError)) {
        throw error;
      }
      await failRun(scope.client, practiceId, pricingRunId, 'unmapped_plan');
      return { outcome: 'failed', failureCode: 'unmapped_plan' };
    }
    const release = await loadRuleRelease(scope.client, run.release_no);
    const settings = await runSettings(scope.client, practiceId, pricingRunId);
    const resolve = lineResolver(records);
    const asOf = runAsOf(run.created_at);
    const batch = options.claimsPerBatch ?? CLAIMS_PER_BATCH;
    // A line stopped on a location it cannot be priced at rolls the whole transaction back (LocationNotReady).
    const onLocation =
      stops === null
        ? undefined
        : (result: LinePricing) => {
            if (result.outcome === 'unpriced' && result.reason === 'ENGINE_ERROR' && result.detail !== null && stops.has(result.detail)) {
              throw new LocationNotReady('a line of the run stopped on the practice’s location');
            }
          };
    let after = FIRST_CLAIM;
    for (;;) {
      const claims = await claimPage(scope, lines, after, batch, context.jobId);
      const last = claims.at(-1);
      if (last === undefined) {
        break;
      }
      await insertPricedLines(scope.client, practiceId, pricingRunId, priceClaims(claims, resolve, release, settings, asOf, onLocation));
      after = last.claimId;
    }
    const coverage = await computeCoverage(scope.client, pricingRunId);
    await scope.client.query("UPDATE pricing_run SET status = 'complete', coverage = $2, completed_at = now() WHERE id = $1", [pricingRunId, JSON.stringify(coverage)]);
    return { outcome: 'complete', coverage };
  });
  let outcome: ExecuteOutcome;
  try {
    outcome = await priceRun();
  } catch (error) {
    if (!(error instanceof LocationNotReady)) {
      throw error;
    }
    // Nothing of the pricing transaction was kept; the run fails in a transaction of its own, the month waits.
    await context.transaction((scope) => failRun(scope.client, practiceId, pricingRunId, 'location_not_ready'));
    return { outcome: 'failed', failureCode: 'location_not_ready' };
  }

  if (outcome.outcome === 'complete' && operatorAlerts(outcome.coverage) > 0) {
    // Fixed text for the log lint and the operator's alarm; the lines and their details are on the run.
    context.logger.error('pricing run recorded engine errors for the operator', { pricing_run_id: pricingRunId, error_code: 'PRICING_ENGINE_ERROR' });
  }
  return outcome;
}
