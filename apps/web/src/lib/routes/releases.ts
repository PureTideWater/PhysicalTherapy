import { rolesPermit } from '@tp/db/runtime';
import { type RunImpact, completeRuns, currentReleaseNo, loadRuleRelease, runReleaseImpact } from '@tp/worker/pricing';
import { z } from 'zod';

import { practiceRoute } from '../http/invoke';
import { NotFoundError } from '../http/route';
import { type RunSummary, runsInEffect } from '../pricing/queries';
import { type PublishedRelease, type ReleaseNote, publishedReleases, releaseNote } from '../releases/queries';
import { opaqueId } from './schemas';

/**
 * The customer's release notes (PRD 9, The release pipeline step 5: "Customers see a release note: what
 * changed, which of their runs would change, and a button to re-run"; PRD 5, J17; PRD 18, Releases;
 * docs/adr/0037). Every member reads them (practice.open): the release's own notes, its record changes
 * against the release before it, whether it is in force or was withdrawn, and the practice's runs in
 * effect pinned to another release, which a re-run under the release in force would price again. For
 * the roles that price runs (mapping.edit), a run's "what would change" is worked out on request, in
 * memory: its lines priced under its own release and under this one, nothing written but the audited
 * reads (purpose release_impact). The re-run itself, and its diff, are the Pricing runs screens'.
 */

const releaseNumber = z.coerce.number().int().min(1).max(2_147_483_647);

export interface ReleasesPageData {
  readonly practiceId: string;
  readonly releases: readonly PublishedRelease[];
  /** Per release, the practice's runs in effect pinned to it. */
  readonly runsByRelease: Readonly<Record<string, number>>;
  /** The release in force; null when none is published. */
  readonly inForce: number | null;
  /** The note shown: the release asked for, else the one in force; null when none is published. */
  readonly note: ReleaseNote | null;
  /** The practice's runs in effect pinned to another release than the note's (a re-run under the release in force prices them again). */
  readonly otherRuns: readonly RunSummary[];
  /** What the note's release would change in the run asked about (`check`), when it is the release in force. */
  readonly impact: RunImpact | null;
  readonly canRerun: boolean;
}

export const releasesPage = practiceRoute({
  id: 'practice.releases',
  kind: 'page',
  path: '/p/[practiceId]/releases',
  phi: true,
  permission: 'practice.open',
  params: z.object({ practiceId: opaqueId, release: releaseNumber.optional().catch(undefined), check: opaqueId.optional().catch(undefined) }),
  handle: async ({ scope, practiceId, params, request, access }): Promise<ReleasesPageData> => {
    const inForce = await currentReleaseNo(scope.client);
    const shown = params.release ?? inForce;
    const note = shown === null ? null : ((await releaseNote(scope.client, shown)) ?? null);
    if (params.release !== undefined && note === null) {
      throw new NotFoundError();
    }
    const runs = await runsInEffect(scope, practiceId, request.requestId);
    const runsByRelease: Record<string, number> = {};
    for (const run of runs) {
      runsByRelease[String(run.releaseNo)] = (runsByRelease[String(run.releaseNo)] ?? 0) + 1;
    }
    const canRerun = rolesPermit(access.roles, 'mapping.edit');
    let impact: RunImpact | null = null;
    if (params.check !== undefined && canRerun && note?.inForce === true) {
      const run = (await completeRuns(scope, practiceId, request.requestId)).find((candidate) => candidate.id === params.check);
      if (run === undefined) {
        throw new NotFoundError();
      }
      impact = await runReleaseImpact(scope, run, await loadRuleRelease(scope.client, note.releaseNo), request.requestId);
    }
    return {
      practiceId,
      releases: await publishedReleases(scope.client),
      runsByRelease,
      inForce,
      note,
      otherRuns: note === null ? [] : runs.filter((run) => run.releaseNo !== note.releaseNo),
      impact,
      canRerun,
    };
  },
  sample: { params: (refs) => ({ practiceId: refs.practiceId, release: '900001', check: refs.pricingRunId }) },
});

export const RELEASE_ROUTES = [releasesPage] as const;
