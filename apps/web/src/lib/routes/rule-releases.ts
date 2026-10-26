import type { ScopeClient } from '@tp/db/runtime';
import { CONTENT_CALENDAR, type ContentFamilyId, type DueItem, contentDue } from '@tp/rules/calendar';
import { readPendingStates } from '@tp/tools/content-calendar';
import { type CheckResult, type ContentWorkspace, ReleaseToolError, checkWorkspace, nextReleaseNumber, prepareRelease, readWorkspace } from '@tp/tools/workspace';
import { z } from 'zod';

import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult, NotFoundError } from '../http/route';
import { contentStatesOf, contentWindowsOf, familiesLoadedThrough } from '../releases/content-through';
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
 * CI publishes a prepared release on merge, and the release commands load and roll back. Above the list, what content
 * is due under the content calendar, with the exact import commands (audit #59; docs/adr/0071).
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

/**
 * What content is due (audit #59; docs/adr/0071; docs/runbooks/content-updates.md): the content calendar
 * (@tp/rules/calendar) judged on today's date against the release in force in the database, with the drafts and the
 * prepared releases of the checkout, when the server has one, as what is on its way (read as the content-calendar CLI
 * reads them, @tp/tools/content-calendar). The workflow's issues judge the newest published release in the repository
 * instead; the two agree once that release is loaded.
 */
export interface ContentDue {
  /** The release in force the families are judged on; null when none is published. */
  readonly releaseNo: number | null;
  /** What is due, in the calendar's stage order, with the exact commands. */
  readonly items: readonly DueItem[];
  /** Every family of the calendar, in its order, with the date the release in force loads it through. */
  readonly families: readonly { readonly family: ContentFamilyId; readonly title: string; readonly loadedThrough: string | null; readonly open: boolean }[];
  /** Drafts or prepared releases of the checkout that cannot be read; what is due is judged on the rest, and the page shows these. */
  readonly problems: readonly string[];
}

/** The calendar judged on `today` against the release in force and, with a checkout, the drafts and prepared releases. */
async function dueContent(client: ScopeClient, inForce: PublishedRelease | undefined, root: string | null, nextRelease: number | null, today: string): Promise<ContentDue> {
  const windows = inForce === undefined ? null : await contentWindowsOf(client, inForce.releaseNo, inForce.manifestSha256);
  const pending = root === null ? null : readPendingStates(root);
  const items = contentDue(
    CONTENT_CALENDAR,
    {
      releaseNo: inForce?.releaseNo ?? null,
      inForce: windows === null ? {} : contentStatesOf(windows),
      ...(pending === null ? {} : { pending: pending.pending }),
      ...(nextRelease === null ? {} : { nextReleaseNo: nextRelease }),
    },
    today,
  );
  return {
    releaseNo: inForce?.releaseNo ?? null,
    items,
    families: familiesLoadedThrough(windows, today, { onChange: true }).map((row) => ({ family: row.family, title: row.title, loadedThrough: row.through, open: row.open })),
    problems: pending?.problems ?? [],
  };
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
  readonly contentDue: ContentDue;
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
    const nextRelease = root === null ? null : nextReleaseNumber(root, releases.map((release) => release.releaseNo));
    return {
      releases,
      runs,
      note,
      elsewhere: note === null ? [] : [...elsewhere.values()],
      workspace: root === null ? null : readWorkspace(root),
      check: root === null || params.check === undefined ? null : checkWorkspace(root),
      nextRelease,
      prepared: params.prepared ?? null,
      contentDue: await dueContent(
        scope.client,
        // None is in force only when none is published: a withdrawal must reinstate an earlier release (reinstated_release_no NOT NULL), so the last one in force is never withdrawn.
        releases.find((release) => release.inForce),
        root,
        nextRelease,
        services.now().toISOString().slice(0, 10),
      ),
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
