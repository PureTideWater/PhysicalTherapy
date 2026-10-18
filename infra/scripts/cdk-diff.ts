import { spawnSync } from 'node:child_process';

import { awsCredentialsAvailable, planCdkDiff } from '../lib/cdk-diff-plan';

const plan = planCdkDiff(await awsCredentialsAvailable(), process.env.GITHUB_ACTIONS === 'true');
const result = spawnSync('cdk', plan.args, {
  stdio: 'inherit',
  env: { ...process.env, CDK_DISABLE_CLI_TELEMETRY: 'true' },
});
if (result.error !== undefined) {
  process.stderr.write(`cdk:diff: could not run the cdk CLI (${result.error.message})\n`);
  process.exit(1);
}
if (result.status === 0 && plan.note !== undefined) {
  process.stdout.write(`${plan.note}\n`);
}
process.exit(result.status ?? 1);
