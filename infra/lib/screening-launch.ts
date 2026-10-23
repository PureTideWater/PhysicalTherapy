import { readFileSync } from 'node:fs';
import path from 'node:path';

import { RELEASE_TAG, launchCheck, registryImageId, tagCommitOf } from '../../tools/screening-capacity/launch-check';
import { type ImageName, repositoryName } from './constructs/images';
import { SCREENING_CLOSED } from './deploy-parameters';
import { type EnvironmentName, environmentSettings } from './environments';

/**
 * Production's screening launch value, computed at synthesis (decision 13; docs/adr/0062; the founder's ruling of
 * 2026-10-22, about 23:00 UTC, "Do the recommended for everything if it optimizes things"). The deployer names the
 * release's capacity report and its tag as deploy-time context,
 *
 *   cdk deploy tp-production -c tp:launchReport=<screening-capacity.json> -c tp:launchTag=<tag> --parameters ImageTag=<tag>
 *
 * and the app runs the launch check (tools/screening-capacity/launch-check.ts) on the images the stack deploys,
 * `<WebRepositoryUri>:<tag>` and `<WorkerRepositoryUri>:<tag>` in the account and region the deploy targets, each image's
 * config digest read from its manifest in ECR (whatever image store the deployer's Docker uses), with the tag's commit in
 * this checkout and production's declared sizes. A binding report that passes with time enforced, the release
 * workflow's (an advisory one, a pull request's, is refused whatever its verdict: the founder's ruling of 2026-10-23,
 * time advisory), gives the value `<tag>:<the report's SHA-256>`, which the stack writes into the web's
 * SCREENING_LAUNCH, with a rule that refuses the deploy unless ImageTag is that tag; a refused report stops the
 * synthesis, naming each reason; no report keeps production's screening closed. The value is never a parameter, and
 * context that tries to set it by hand stops the synthesis, so nothing typed by hand opens the screening.
 */

/** The capacity report's file (`gh release download <tag> --pattern screening-capacity.json`). */
export const LAUNCH_REPORT_CONTEXT = 'tp:launchReport';
/** The release tag the report is for: the ImageTag the deploy runs. */
export const LAUNCH_TAG_CONTEXT = 'tp:launchTag';

/** The only stack the launch value opens: elsewhere the screening is not gated (apps/web, screeningLaunched). */
export const LAUNCH_ENVIRONMENT: EnvironmentName = 'production';

/** Context keys that would carry a launch value typed by hand (`-c ScreeningLaunch=…`, `-c tp:screeningLaunch=…`). */
const HAND_TYPED = /(^|:)screening[-_]?launch$/i;

/** The account and region a deploy targets, as the CDK CLI gives them from the deployer's credentials. */
export interface LaunchTarget {
  readonly account: string;
  readonly region: string;
}

/** What the computation reads from outside the checkout's code; the tests give their own. */
export interface LaunchReaders {
  /** The report's bytes, as kept as the tag's release asset. */
  readonly readReport: (file: string) => string;
  /** The commit a release tag names in this checkout. */
  readonly tagCommit: (tag: string) => string;
  /** The config digest of the image a registry reference names, read from the registry's manifest, or why it could not be read. */
  readonly imageId: (reference: string) => string;
  /** The deploy's account and region, or null when the CDK CLI gives none (no credentials). */
  readonly target: () => LaunchTarget | null;
}

/** The readers a deploy uses: the file system, git, Docker and the CDK CLI's account and region. */
export const DEPLOY_LAUNCH_READERS: LaunchReaders = {
  readReport: (file) => readFileSync(path.resolve(file), 'utf8'),
  tagCommit: tagCommitOf,
  imageId: registryImageId,
  target: () => {
    const account = process.env.CDK_DEFAULT_ACCOUNT;
    const region = process.env.CDK_DEFAULT_REGION;
    return account === undefined || account === '' || region === undefined || region === '' ? null : { account, region };
  },
};

/** The launch value and what the check noted (a sizing question the merge settles, never the launch). */
export interface ScreeningLaunchValue {
  /** `closed`, or `<tag>:<the report's SHA-256>`. */
  readonly value: string;
  /** The tag the value names, null while closed. */
  readonly tag: string | null;
  readonly notes: readonly string[];
}

export const CLOSED_LAUNCH: ScreeningLaunchValue = { value: SCREENING_CLOSED, tag: null, notes: [] };

/** An image's reference in an environment's ECR repository, as the stack's WebRepositoryUri and WorkerRepositoryUri give it. */
export function ecrImageReference(target: LaunchTarget, environment: EnvironmentName, image: ImageName, tag: string): string {
  const suffix = target.region.startsWith('cn-') ? 'amazonaws.com.cn' : 'amazonaws.com';
  return `${target.account}.dkr.ecr.${target.region}.${suffix}/${repositoryName(environment, image)}:${tag}`;
}

/** Why a synthesis stops on the launch value: decision 13 named, so the deployer knows which rule refused it. */
export class ScreeningLaunchError extends Error {
  constructor(reason: string) {
    super(`decision 13 (docs/adr/0062): ${reason}`);
    this.name = 'ScreeningLaunchError';
  }
}

/**
 * Refuses context that would set the launch value by hand: the value is computed from the release's capacity report and
 * never taken as given (the founder's ruling of 2026-10-22). A `--parameters ScreeningLaunch=…` is refused by
 * CloudFormation, since no stack declares that parameter.
 */
export function refuseHandTypedLaunch(contextKeys: readonly string[]): void {
  const typed = contextKeys.filter((key) => HAND_TYPED.test(key));
  if (typed.length > 0) {
    throw new ScreeningLaunchError(
      `ScreeningLaunch is computed by the CDK app from the release's capacity report and is never passed by hand; remove ${typed.map((key) => `-c ${key}`).join(', ')} and deploy with -c ${LAUNCH_REPORT_CONTEXT}=<screening-capacity.json> -c ${LAUNCH_TAG_CONTEXT}=<tag> (docs/runbooks/deploy-and-rollback.md, step 4)`,
    );
  }
}

/**
 * Production's launch value from the deploy-time context: closed without a report; for a report, the launch check on the
 * ECR images of the tag, or a ScreeningLaunchError naming each reason it refused.
 */
export function screeningLaunchValue(context: { readonly report?: string; readonly tag?: string }, readers: LaunchReaders): ScreeningLaunchValue {
  const { report, tag } = context;
  if (report === undefined && tag === undefined) {
    return CLOSED_LAUNCH;
  }
  if (report === undefined || tag === undefined) {
    throw new ScreeningLaunchError(`-c ${LAUNCH_REPORT_CONTEXT}=<screening-capacity.json> and -c ${LAUNCH_TAG_CONTEXT}=<tag> go together; deploy with both to open production's screening, or with neither to keep it closed`);
  }
  if (!RELEASE_TAG.test(tag)) {
    throw new ScreeningLaunchError(`-c ${LAUNCH_TAG_CONTEXT}=${tag} is not a release tag (v followed by letters, digits, dots and hyphens)`);
  }
  const target = readers.target();
  if (target === null) {
    throw new ScreeningLaunchError('the launch check needs the account and region the deploy targets (CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION, which cdk sets from the deploy’s credentials), to name the ECR images the stack deploys');
  }
  let reportText: string;
  try {
    reportText = readers.readReport(report);
  } catch {
    throw new ScreeningLaunchError(`the capacity report ${report} could not be read`);
  }
  const result = launchCheck({
    reportText,
    tag,
    tagCommit: readers.tagCommit(tag),
    images: {
      web: readers.imageId(ecrImageReference(target, LAUNCH_ENVIRONMENT, 'web', tag)),
      worker: readers.imageId(ecrImageReference(target, LAUNCH_ENVIRONMENT, 'worker', tag)),
    },
    settings: environmentSettings(LAUNCH_ENVIRONMENT),
  });
  if (!result.ok) {
    throw new ScreeningLaunchError(
      `the launch check refused ${tag}'s capacity report, so production's screening cannot open with this deploy; deploy without -c ${LAUNCH_REPORT_CONTEXT} and -c ${LAUNCH_TAG_CONTEXT} to keep it closed:\n${result.reasons.map((reason) => `- ${reason}`).join('\n')}`,
    );
  }
  return { value: result.value, tag, notes: result.notes };
}
