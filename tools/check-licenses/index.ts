import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { repositoryRoot } from '../content-files';
import { licenseProblems, pnpmLicensesSchema, policySchema } from './check';

/**
 * `pnpm licenses:check`: fails when a production dependency carries a license outside
 * tools/check-licenses/allowlist.json without a named exception (PRD section 16). Runs in ci.yml's
 * static job on every pull request and every push to the build branch.
 */
const listed = spawnSync('pnpm', ['licenses', 'list', '--prod', '--json'], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (listed.status !== 0) {
  process.stderr.write(`licenses:check: pnpm licenses list failed\n${listed.stderr}`);
  process.exit(1);
}
const policy = policySchema.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, 'allowlist.json'), 'utf8')));
const problems = licenseProblems(pnpmLicensesSchema.parse(JSON.parse(listed.stdout)), policy);
if (problems.length > 0) {
  process.stderr.write(`licenses:check: refused, ${String(problems.length)} problem(s).\n${problems.map((problem) => `- ${problem}`).join('\n')}\n`);
  process.exit(1);
}
const count = Object.values(JSON.parse(listed.stdout) as Record<string, unknown[]>).reduce((sum, packages) => sum + packages.length, 0);
process.stdout.write(`licenses:check: every production dependency (${String(count)} packages) carries an allowed license.\n`);
