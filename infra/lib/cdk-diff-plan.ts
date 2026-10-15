import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

import { stackName } from './environments';

export interface CdkDiffPlan {
  /** Arguments for the cdk CLI. */
  readonly args: readonly string[];
  /** Printed after the command succeeds. */
  readonly note?: string;
}

/**
 * With working AWS credentials, `pnpm cdk:diff` diffs the staging stack against what is deployed.
 * Without them (a pull request from a fork, a laptop, this repository's CI today) it synthesizes
 * every stack instead, which still proves the app compiles and synthesizes, and says so. On GitHub
 * Actions the note is a ::warning:: annotation, so a pull request shows that no diff ran; the
 * read-only staging role that makes it a real diff arrives with the stacks' resources in milestone 1
 * (docs/adr/0006-ci-gates-before-their-milestones.md).
 */
export function planCdkDiff(credentialsAvailable: boolean, onGitHubActions = false): CdkDiffPlan {
  if (credentialsAvailable) {
    return { args: ['diff', stackName('staging'), '--no-notices'] };
  }
  const message = `no usable AWS credentials, so every stack was synthesized instead; the diff against staging (${stackName('staging')}) needs credentials.`;
  return {
    args: ['synth', '--quiet', '--no-notices'],
    note: onGitHubActions ? `::warning title=cdk:diff did not diff::${message}` : `cdk:diff: ${message}`,
  };
}

/** True when the AWS credential chain yields an identity STS accepts within the timeout. */
export async function awsCredentialsAvailable(
  env: Readonly<Record<string, string | undefined>> = process.env,
  timeoutMs = 10_000,
): Promise<boolean> {
  const client = new STSClient({ region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'us-east-1', maxAttempts: 1 });
  try {
    await client.send(new GetCallerIdentityCommand({}), { abortSignal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  } finally {
    client.destroy();
  }
}
