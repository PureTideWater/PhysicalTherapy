import { randomUUID } from 'node:crypto';

import { test } from '@playwright/test';
import { LocalKeyProvider, appDevLoginUrl, developmentMasterKey, openPool, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { approvePacketVersion, writePacketVersion } from '@tp/worker/packets';
import { acceptRun, createRerun } from '@tp/worker/pricing';

import { e2eDatabaseUrl } from './env';
import { withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, queue, signedOffSchedule, until, userId } from './journeys';

/**
 * The setup of the journey of a submission sent without sign-off (the founder's ruling of 2026-10-20; docs/adr/0061),
 * on the e2e database, synthetic data only: a practice of its own in the other group, with its BAA, a case materiality
 * of 10.00, the SYNTHETIC correspondence contact its exports print, and the reimbursement reviewer's support grant;
 * once its SYNTHETIC CAS-08 remittance is loaded through the Uploads screen, the payer's schedule signed off with its
 * window cited and verified, March priced and triaged by the worker's own jobs (e2e/journeys.ts); the case's packet
 * written by one billing manager and approved by another through @tp/worker/packets, in their own scopes, and exported
 * by the worker's export job; then the period priced again and the re-run accepted, so the export's pricing went
 * stale after it was made and before any attestation. The browser does the rest.
 *
 * A retry works in a practice of its own (its name carries the attempt), since the attempt before may have logged the
 * submission already.
 */

export const UNATTESTED_PRACTICE = 'SYNTHETIC OTHER PRACTICE UNATTESTED';
const PLAN = 'CE:SYNPLAN-FIX-ONE';
const SETTINGS = {
  place_of_service_settings: { '11': 'non_facility', '22': 'facility' },
  default_rounding: 'HALF_UP_CENT',
  case_materiality_cents: '1000',
  correspondence_contact: { name: 'SYNTHETIC BILLING OFFICE', phone: '9195550100' },
};

/** The journey's practice for this attempt: its ID. */
export function unattestedPractice(): Promise<string> {
  const retry = test.info().retry;
  return journeyPractice({ name: retry === 0 ? UNATTESTED_PRACTICE : `${UNATTESTED_PRACTICE} RETRY ${String(retry)}`, settings: SETTINGS, supportFor: ['unattested-reviewer'] });
}

export interface StaleExport {
  readonly caseId: string;
  readonly versionId: string;
}

/**
 * The case's packet exported, then its pricing gone stale: the schedule signed off, March priced and triaged (the
 * caller keeps the worker running), the packet written by the manager and approved by the approver, exported by the
 * worker, and the period priced again and accepted by the manager. Returns the case and the exported version.
 */
export async function staleExport(practiceId: string): Promise<StaleExport> {
  await signedOffSchedule({ practiceId, managerKey: 'unattested-approver', planKey: PLAN });
  const runId = await pricedAndTriaged({ practiceId, managerKey: 'unattested-approver', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
  let caseId = '';
  await until(async () => {
    caseId = await withDatabase(async (client) => (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id ?? '');
    return caseId !== '';
  }, 'the triage job');
  const manager = await userId('unattested-manager');
  const approver = await userId('unattested-approver');
  const keys = new LocalKeyProvider(developmentMasterKey());
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const as = <T>(actorId: string, run: Parameters<typeof withPracticeScope<typeof pool, T>>[2]) => withPracticeScope(pool, { actorId, practiceIds: [practiceId] }, run);
    const version = await as(manager, (scope) => writePacketVersion(scope, keys, { practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: `e2e-${randomUUID()}` }));
    await as(approver, (scope) => approvePacketVersion(scope, { practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: `e2e-${randomUUID()}` }));
    await queue('packet_export', { practice_id: practiceId, packet_version_id: version.versionId });
    await until(
      () =>
        withDatabase(async (client) =>
          asOwner(client, [practiceId], async () => (await client.query<{ exported: boolean }>('SELECT exported_at IS NOT NULL AS exported FROM packet_version WHERE id = $1', [version.versionId])).rows[0]?.exported === true),
        ),
      'the export job',
    );
    // March priced again under the same release and accepted: the version's lines are no longer the pricing in effect.
    const { pricingRunId } = await as(manager, (scope) => createRerun(scope, { practiceId, pricingRunId: runId, releaseNo: 900001, requestId: `e2e-${randomUUID()}` }));
    await queue('price', { practice_id: practiceId, pricing_run_id: pricingRunId });
    await until(
      () => withDatabase(async (client) => (await client.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = $1', [pricingRunId])).rows[0]?.status === 'complete'),
      'the re-run’s price job',
    );
    await as(manager, (scope) => acceptRun(scope, { practiceId, pricingRunId }));
    return { caseId, versionId: version.versionId };
  } finally {
    await pool.end();
  }
}

export interface UnattestedEvent {
  readonly actor_id: string | null;
  readonly actor_kind: string;
  readonly purpose: string | null;
}

/** The database's records of submissions sent without sign-off in the practice, read as the operator would. */
export async function unattestedEvents(practiceId: string): Promise<readonly UnattestedEvent[]> {
  return withDatabase(async (client) =>
    asOwner(
      client,
      [practiceId],
      async () =>
        (await client.query<UnattestedEvent>("SELECT actor_id, actor_kind, purpose FROM audit_event WHERE practice_id = $1 AND action = 'submission_logged_unattested' ORDER BY at, id", [practiceId])).rows,
    ),
  );
}
