import { repositoryRoot } from '../content-files';
import { checkActionPins } from './check';
import { gitTransport } from './network';

/**
 * `pnpm actions:check` (root script `tsx tools/check-action-pins/index.ts`): the action pin policy over every workflow
 * (docs/adr/0066, Part 2; test matrix CI-11). Runs in ci.yml's static job on every pull request and every push, with
 * BASE from the range step. `--offline` runs the offline rules alone.
 */
const offline = process.argv.includes('--offline');
const transport = gitTransport();
const result = await checkActionPins({ root: repositoryRoot, base: process.env.BASE, event: process.env.GITHUB_EVENT_NAME, transport, offline }).finally(() => {
  transport.close();
});
for (const note of result.notes) process.stdout.write(`actions:check: ${note}\n`);
for (const warning of result.warnings) process.stdout.write(`::warning title=Action pins::${warning}\n`);
if (result.errors.length > 0) {
  for (const error of result.errors) process.stdout.write(`::error title=Action pins::${error}\n`);
  process.stderr.write(`actions:check: refused, ${String(result.errors.length)} problem(s).\n`);
  process.exit(1);
}
process.stdout.write(`actions:check: every action is pinned to its release's commit${offline ? ' (offline rules only)' : ''}.\n`);
