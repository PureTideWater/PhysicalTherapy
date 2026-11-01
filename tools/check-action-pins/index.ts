import { readFileSync } from 'node:fs';
import path from 'node:path';

import { repositoryRoot } from '../content-files';
import { releaseAgeMinutes } from '../check-toolchain/exclude-window';
import { parseYamlFile, workspaceSchema } from '../check-toolchain/policy';
import { checkActionPins } from './check';
import { gitTransport } from './network';

/**
 * `pnpm actions:check` (root script `tsx tools/check-action-pins/index.ts`): the action pin policy over every workflow
 * (docs/adr/0066, Parts 2 and 5; test matrix CI-11, CI-21, CI-23). Runs in ci.yml's static job on every pull request and
 * every push, with BASE from the range step and, for the age rule's API reads, the job's read-only GITHUB_TOKEN.
 * `--offline` runs the offline rules alone. The release age is pnpm-workspace.yaml's minimumReleaseAge, read as
 * check-toolchain reads it (releaseAgeMinutes), so the npm, image and action rules hold one floor.
 */
const offline = process.argv.includes('--offline');
const workspace = parseYamlFile('pnpm-workspace.yaml', readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8'), workspaceSchema, {});
if (!workspace.ok) {
  process.stdout.write(`::error title=Action pins::${workspace.problem}; the release age cannot be read, so the check fails closed\n`);
  process.exit(1);
}
const transport = gitTransport();
const result = await checkActionPins({
  root: repositoryRoot,
  base: process.env.BASE,
  event: process.env.GITHUB_EVENT_NAME,
  transport,
  offline,
  floor: releaseAgeMinutes(workspace.value),
  ci: process.env.GITHUB_ACTIONS === 'true',
  token: process.env.GITHUB_TOKEN,
  apiUrl: process.env.GITHUB_API_URL,
}).finally(() => {
  transport.close();
});
for (const note of result.notes) process.stdout.write(`actions:check: ${note}\n`);
for (const warning of result.warnings) process.stdout.write(`::warning title=Action pins::${warning}\n`);
if (result.errors.length > 0) {
  for (const error of result.errors) process.stdout.write(`::error title=Action pins::${error}\n`);
  process.stderr.write(`actions:check: refused, ${String(result.errors.length)} problem(s).\n`);
  process.exit(1);
}
process.stdout.write(`actions:check: every action is pinned to its release's commit${offline ? ' (offline rules only)' : ', and every pin new against the base is old enough'}.\n`);
