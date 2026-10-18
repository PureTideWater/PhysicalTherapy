import { type CheckResult, type ContentWorkspace, ReleaseToolError, checkWorkspace, nextReleaseNumber, prepareRelease, readWorkspace } from '@tp/tools/workspace';
import { z } from 'zod';

import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { type PublishedRelease, type ReleaseNote, publishedReleases, releaseNote } from '../releases/queries';

/**
 * The internal console's Rule releases screen (PRD 7, Internal console: "Drafts, checks, published
 * releases, release notes, affected-run diffs ... Prepare, check, publish"; PRD 9, The release pipeline;
 * PRD 18, Releases; the load-release skill; docs/adr/0037), for platform administrators
 * (rule_release.manage). From the database: the published releases, which is in force, any withdrawal,
 * each release's notes and record changes, and, per release and practice, counts of the complete runs
 * pinned to it, the re-runs made under it and the lines those re-runs priced differently
 * (console_release_runs(): counts only; no run, line or claim is read here). From the content checkout
 * the server is given (services.contentRoot): the drafts by file, type and verification level, the
 * releases prepared in content/outgoing, the content checker's result on request, and preparing the
 * next release from the drafts at L2 or higher (`pnpm release:assemble`). Publishing is never here:
 * CI publishes a prepared release on merge, and the release commands load and roll back.
 */

const releaseNumber = z.coerce.number().int().min(1).max(2_147_483_647);

/** One release's affected runs at one practice, as counts. */
export interface ReleaseRuns {
  readonly releaseNo: number;
  readonly practiceId: string;
  readonly name: string;
  /** Complete runs pinned to the release, and those of them in effect. */
  readonly runs: number;
  readonly runsInEffect: number;
  /** Re-runs made under the release, how many were accepted, and the lines they priced differently. */
  readonly reruns: number;
  readonly rerunsAccepted: number;
  readonly changedLines: number;
}

async function releaseRuns(client: { query: <R extends object>(text: string) => Promise<{ rows: R[] }> }): Promise<ReleaseRuns[]> {
  const { rows } = await client.query<{
    release_no: number;
    practice_id: string;
    name: string;
    runs: string;
    runs_in_effect: string;
    reruns: string;
    reruns_accepted: string;
    changed_lines: string;
  }>('SELECT * FROM console_release_runs()');
  return rows.map((row) => ({
    releaseNo: row.release_no,
    practiceId: row.practice_id,
    name: row.name,
    runs: Number.parseInt(row.runs, 10),
    runsInEffect: Number.parseInt(row.runs_in_effect, 10),
    reruns: Number.parseInt(row.reruns, 10),
    rerunsAccepted: Number.parseInt(row.reruns_accepted, 10),
    changedLines: Number.parseInt(row.changed_lines, 10),
  }));
}

export interface RuleReleasesPageData {
  readonly releases: readonly PublishedRelease[];
  readonly runs: readonly ReleaseRuns[];
  /** The note shown: the release asked for, else the one in force; null when none is published. */
  readonly note: ReleaseNote | null;
  /** Per practice, complete runs in effect pinned to another release than the note's, which a re-run under it would price again. */
  readonly elsewhere: readonly { readonly practiceId: string; readonly name: string; readonly runsInEffect: number }[];
  /** Null when the server has no content checkout. */
  readonly workspace: ContentWorkspace | null;
  /** The content checker's result, when asked for (`check=1`) and a checkout exists. */
  readonly check: CheckResult | null;
  /** The number the next prepared release takes; null without a checkout. */
  readonly nextRelease: number | null;
  /** The release just prepared, from the redirect. */
  readonly prepared: number | null;
}

export const ruleReleasesPage = platformRoute({
  id: 'console.rule_releases',
  kind: 'page',
  path: '/console/rule-releases',
  phi: false,
  permission: 'rule_release.manage',
  params: z.object({
    release: releaseNumber.optional().catch(undefined),
    check: z.enum(['1']).optional().catch(undefined),
    prepared: releaseNumber.optional().catch(undefined),
  }),
  handle: async ({ scope, params, services }): Promise<RuleReleasesPageData> => {
    const releases = await publishedReleases(scope.client);
    const shown = params.release ?? releases.find((release) => release.inForce)?.releaseNo ?? null;
    const note = shown === null ? null : ((await releaseNote(scope.client, shown)) ?? null);
    if (params.release !== undefined && note === null) {
      throw new NotFoundError();
    }
    const runs = await releaseRuns(scope.client);
    const elsewhere = new Map<string, { practiceId: string; name: string; runsInEffect: number }>();
    for (const row of runs.filter((item) => item.releaseNo !== note?.releaseNo && item.runsInEffect > 0)) {
      const entry = elsewhere.get(row.practiceId) ?? { practiceId: row.practiceId, name: row.name, runsInEffect: 0 };
      entry.runsInEffect += row.runsInEffect;
      elsewhere.set(row.practiceId, entry);
    }
    const root = services.contentRoot;
    return {
      releases,
      runs,
      note,
      elsewhere: note === null ? [] : [...elsewhere.values()],
      workspace: root === null ? null : readWorkspace(root),
      check: root === null || params.check === undefined ? null : checkWorkspace(root),
      nextRelease: root === null ? null : nextReleaseNumber(root, releases.map((release) => release.releaseNo)),
      prepared: params.prepared ?? null,
    };
  },
  sample: { params: () => ({ release: '900001', check: '1' }) },
});

/**
 * Prepares the next release from the drafts at L2 or higher (the load-release skill, steps 1 and 2:
 * content/outgoing/<n> with RELEASE.md and MANIFEST.json), refused as `pnpm release:assemble` refuses.
 * The number is the next unused real one. The person then runs the dry run against the staging
 * snapshot and opens the pull request; CI publishes on merge.
 */
export const prepareRuleReleaseAction = platformRoute({
  id: 'console.rule_releases.prepare',
  kind: 'action',
  path: '/console/rule-releases/prepare',
  phi: false,
  permission: 'rule_release.manage',
  params: z.object({}),
  input: z.object({}),
  audit: { action: 'rule_release_prepared', objectType: 'rule_release' },
  handle: async ({ scope, services }): Promise<MutationResult> => {
    const root = services.contentRoot;
    if (root === null) {
      throw new InputError([{ field: 'release', message: 'this server has no content checkout; prepare the release with pnpm release:assemble in one (the load-release skill)' }]);
    }
    const release = nextReleaseNumber(root, (await publishedReleases(scope.client)).map((item) => item.releaseNo));
    try {
      prepareRelease(root, release, services.now().toISOString().slice(0, 10));
    } catch (error) {
      if (error instanceof ReleaseToolError) {
        throw new InputError([{ field: 'release', message: error.message }]);
      }
      throw error;
    }
    return { redirect: `/console/rule-releases?prepared=${String(release)}` };
  },
  sample: { params: () => ({}), input: () => ({}) },
});

export const RULE_RELEASE_ROUTES = [ruleReleasesPage, prepareRuleReleaseAction] as const;
