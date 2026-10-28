import { ageWords, releaseAgeMinutes } from '../check-toolchain/exclude-window';
import { MINUTE_MS } from '../check-toolchain/policy';
import { withRetries, type Transport } from './network';
import { actionUses, type WorkflowText } from './workflows';

/**
 * The BuildKit builder every setup-buildx step runs (docs/adr/0066, Part 2; the security review's S4): written as
 * `driver-opts: image=moby/buildkit:vX.Y.Z@sha256:<index digest>` on each step, a string Dependabot never rewrites. So
 * this check reads Docker Hub for it on every networked run:
 * - the steps name one builder (workflows.test.ts holds the form offline);
 * - the version's tag is that index digest: a failure when the builder is new against the base, else a warning, since
 *   the digest still runs what it names;
 * - a newer release at least the release age old (pnpm-workspace.yaml's minimumReleaseAge, read through
 *   check-toolchain's releaseAgeMinutes, so the builder's two age questions read one floor), is a warning naming it, so
 *   the manual upgrade in docs/runbooks/dependency-upgrades.md is not forgotten.
 * A read that fails after three tries fails a new builder closed and only warns about an unchanged one. On a push every
 * fault is a warning: the pull request was the gate (docs/adr/0066, Part 5). The builder's own age is check-toolchain's
 * image rule's, with every other image's.
 */

export const BUILDKIT_REPOSITORY = 'moby/buildkit';
const DRIVER_OPTS = /^image=moby\/buildkit:(v(\d+)\.(\d+)\.(\d+))@(sha256:[0-9a-f]{64})$/;
const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/;

export interface Builder {
  readonly version: string;
  readonly digest: string;
  /** The version's numbers, for comparison. */
  readonly numbers: readonly [number, number, number];
}

/** The builder strings of every setup-buildx step, in order, each `where` it is. */
export function builderOpts(workflows: readonly WorkflowText[]): { where: string; opts: unknown }[] {
  return workflows.flatMap(({ file, text }) =>
    actionUses(file, text)
      .filter((use) => use.uses.startsWith('docker/setup-buildx-action@'))
      .map((use) => ({ where: `${file} ${use.job} step ${String(use.step + 1)}`, opts: use.with['driver-opts'] })),
  );
}

/** The one builder the workflows name, or why there is not one. */
export function builderOf(workflows: readonly WorkflowText[]): { builder?: Builder; problems: string[] } {
  const steps = builderOpts(workflows);
  if (steps.length === 0) return { problems: [] };
  const problems = steps.flatMap(({ where, opts }) => (typeof opts === 'string' && DRIVER_OPTS.test(opts) ? [] : [`${where}: setup-buildx's driver-opts is not image=moby/buildkit:vX.Y.Z@sha256:<digest> (it is ${JSON.stringify(opts)})`]));
  const distinct = new Set(steps.map(({ opts }) => String(opts)));
  if (distinct.size > 1) problems.push(`the setup-buildx steps name ${String(distinct.size)} builders, not one: ${[...distinct].join(', ')}`);
  if (problems.length > 0) return { problems };
  const match = DRIVER_OPTS.exec(String(steps[0]?.opts)) as RegExpExecArray;
  return { builder: { version: match[1] ?? '', digest: match[5] ?? '', numbers: [Number(match[2]), Number(match[3]), Number(match[4])] }, problems: [] };
}

const newer = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

const HOST = 'hub.docker.com';
const refuse = (result: { status: number }) => (result.status === 200 || result.status === 404 ? undefined : `HTTP ${String(result.status)}`);

interface HubTag {
  readonly name?: unknown;
  readonly digest?: unknown;
  readonly tag_last_pushed?: unknown;
}

/** Reads Docker Hub for the builder: its tag's digest and the newest release old enough. */
export async function checkBuilder(
  transport: Transport,
  builder: Builder,
  options: {
    readonly isNew: boolean;
    readonly now: Date;
    readonly signal?: AbortSignal;
    /** The release age in minutes (releaseAgeMinutes of pnpm-workspace.yaml); never under MINIMUM_RELEASE_AGE_MINUTES. */
    readonly floor?: number;
    /** A push run: every fault is a warning. */
    readonly push?: boolean;
  },
): Promise<{ errors: string[]; warnings: string[]; notes: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const name = `${BUILDKIT_REPOSITORY}:${builder.version}`;
  const floor = releaseAgeMinutes({ minimumReleaseAge: options.floor });
  const fault = (text: string) => (options.isNew && options.push !== true ? errors : warnings).push(text);
  try {
    const tagUrl = `https://${HOST}/v2/repositories/${BUILDKIT_REPOSITORY}/tags/${builder.version}`;
    const tag = await withRetries(transport, HOST, `GET ${tagUrl}`, () => transport.get(tagUrl, options.signal), refuse, options.signal);
    if (tag.status === 404) fault(`the builder ${name}: Docker Hub has no such tag`);
    else {
      const digest = (JSON.parse(tag.text) as HubTag).digest;
      if (digest === builder.digest) notes.push(`the builder ${name}: its tag is the index ${builder.digest}`);
      else fault(`the builder ${name}: its tag is the index ${String(digest)}, not ${builder.digest}`);
    }

    const listUrl = `https://${HOST}/v2/repositories/${BUILDKIT_REPOSITORY}/tags?page_size=100&ordering=last_updated`;
    const list = await withRetries(transport, HOST, `GET ${listUrl}`, () => transport.get(listUrl, options.signal), refuse, options.signal);
    const results = list.status === 200 ? ((JSON.parse(list.text) as { results?: HubTag[] }).results ?? []) : [];
    const releases = results.flatMap((entry) => {
      const match = typeof entry.name === 'string' ? RELEASE.exec(entry.name) : null;
      const pushed = typeof entry.tag_last_pushed === 'string' ? Date.parse(entry.tag_last_pushed) : Number.NaN;
      return match === null || Number.isNaN(pushed) ? [] : [{ name: entry.name as string, pushed, numbers: [Number(match[1]), Number(match[2]), Number(match[3])] as const }];
    });
    const ready = releases.filter((release) => options.now.getTime() - release.pushed >= floor * MINUTE_MS && newer(release.numbers, builder.numbers));
    ready.sort((a, b) => (newer(a.numbers, b.numbers) ? -1 : newer(b.numbers, a.numbers) ? 1 : 0));
    const latest = ready[0];
    if (latest === undefined) notes.push(`the builder ${name}: no newer release is ${ageWords(floor)} old`);
    else {
      warnings.push(
        `the builder ${name}: ${BUILDKIT_REPOSITORY} ${latest.name} was pushed ${new Date(latest.pushed).toISOString()}, ${ageWords(floor)} ago or more; Dependabot cannot update setup-buildx's driver-opts, so move every step to it by hand (docs/runbooks/dependency-upgrades.md)`,
      );
    }
  } catch (error) {
    fault(`the builder ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { errors, warnings, notes };
}
