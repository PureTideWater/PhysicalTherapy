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
 * every stack instead, which still proves the app compiles and synthesizes, and says so.
 */
export function planCdkDiff(credentialsAvailable: boolean): CdkDiffPlan {
  if (credentialsAvailable) {
    return { args: ['diff', stackName('staging'), '--no-notices'] };
  }
  return {
    args: ['synth', '--quiet', '--no-notices'],
    note: `cdk:diff: no usable AWS credentials, so every stack was synthesized instead; the diff against staging (${stackName('staging')}) needs credentials.`,
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
