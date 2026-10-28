import { repositoryRoot } from '../content-files';
import { type Finding, checkToolchain } from './check';
import { createRegistry } from './registry';
import { DEFAULT_BASE, buildBranchHistory, mergeBase, readTreeAt, readWorkingTree } from './tree';

/**
 * `pnpm toolchain:check`: runs in ci.yml's static job after the install and the range step, with BASE set to that
 * step's base (a pull request's base branch, or a push's previous head). Networked: it reads npm's registry and bulk
 * advisory endpoint, and fails closed when it cannot. Errors fail the run; warnings are printed as GitHub annotations
 * on CI and never fail it. Locally: `BASE=origin/claude/build-platform pnpm toolchain:check`.
 */
const base = process.env.BASE === undefined || process.env.BASE === '' ? DEFAULT_BASE : process.env.BASE;
const annotate = process.env.GITHUB_ACTIONS === 'true';

function print(finding: Finding): void {
  const text = `${finding.rule}: ${finding.message}`;
  if (finding.level === 'ok') {
    process.stdout.write(`check-toolchain: ok, ${text}\n`);
  } else if (annotate) {
    process.stdout.write(`::${finding.level} title=check-toolchain (${finding.rule})::${finding.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}\n`);
  } else {
    process.stdout.write(`check-toolchain: ${finding.level}, ${text}\n`);
  }
}

try {
  const commit = mergeBase(repositoryRoot, base);
  const event = process.env.GITHUB_EVENT_NAME === 'push' ? 'push' : 'pull_request';
  process.stdout.write(`check-toolchain: comparing this tree with ${commit} (git merge-base ${base} HEAD), as a ${event === 'push' ? 'push run' : 'pull request'}.\n`);
  const findings = await checkToolchain(
    { head: readWorkingTree(repositoryRoot), base: readTreeAt(repositoryRoot, commit), event, now: new Date(), history: buildBranchHistory(repositoryRoot, commit) },
    createRegistry(),
  );
  findings.forEach(print);
  const errors = findings.filter((finding) => finding.level === 'error').length;
  const warnings = findings.filter((finding) => finding.level === 'warning').length;
  process.stdout.write(`check-toolchain: ${errors === 0 ? 'passed' : 'refused'}, ${String(errors)} error(s), ${String(warnings)} warning(s).\n`);
  process.exitCode = errors === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
