import { repositoryRoot } from '../content-files';
import { checkFixtures } from './check';

/**
 * `pnpm check:fixtures`: the repository's fixture check (CO-03, docs/adr/0059). Every CSV, TSV, spreadsheet,
 * X12 interchange, zip, gzip and OLE2 file git would commit, and every text file under fixtures/ and
 * packages/synth/, goes through the writer's guard; each refusal is printed with the file and the rule, and
 * any refusal fails the run. `pnpm test` runs the same check (check.test.ts); CI runs it before
 * `pnpm synth --all`.
 */
const { checked, problems } = checkFixtures(repositoryRoot);

for (const problem of problems) {
  process.stderr.write(`${problem.message}\n`);
}
if (problems.length > 0) {
  process.stderr.write(`check:fixtures: ${String(problems.length)} of ${String(checked)} file(s) refused. Fixtures are synthetic: generate them with pnpm synth (.claude/rules/fixtures.md).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`check:fixtures: ${String(checked)} file(s) read; every table carries SYNTHSENDER or is pinned, and every interchange is synthetic.\n`);
}
