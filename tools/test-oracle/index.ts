import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse835 } from '@tp/edi835';
import { releaseDirectoryCodeLists } from '@tp/edi835/testing';
import { type ZipEntry, readZip } from '@tp/synth';

import { repositoryRoot } from '../content-files';
import { type OracleResult, collectChecks, disagreements } from './compare';
import { findOracleFixtures } from './fixtures';
import { parserDisagreements } from './parser';

/**
 * `pnpm test:oracle`: pyx12 reads every synthetic 835 fixture (PRD section 18, the 835 oracle) and
 * must agree with what the fixture's expected.json says: valid or rejected for the stated reasons,
 * and, where the file can be read, the same normalized summary (segments, amounts, balances). Then
 * packages/edi835 parses every one of the same files, and its reading must equal pyx12's summary to the
 * cent and its verdict match pyx12's (tools/test-oracle/parser.ts). Every disagreement fails.
 *
 * The interpreter is TP_ORACLE_PYTHON, or python3; it runs isolated (-I) and needs pyx12 installed
 * (CI: pip install pyx12; locally a virtualenv outside the source tree, tools/test-oracle/README.md).
 */
const syntheticRoot = path.join(repositoryRoot, 'fixtures', 'synthetic');
const python = process.env.TP_ORACLE_PYTHON ?? 'python3';
const script = path.join(repositoryRoot, 'tools', 'test-oracle', 'oracle.py');

const { checks, declared } = collectChecks(syntheticRoot);
const problems: string[] = [];

// No X12 fixture may sit in the repository without the oracle reading it.
for (const fixture of findOracleFixtures(repositoryRoot)) {
  const relative = path.relative(syntheticRoot, path.join(repositoryRoot, fixture)).split(path.sep).join('/');
  if (!declared.has(relative)) {
    problems.push(`${relative}: an X12 fixture no expected.json declares`);
  }
}

for (const check of checks.filter((item) => item.generated === true)) {
  if (!existsSync(path.join(syntheticRoot, check.spec))) {
    problems.push(`${check.spec}: generated at test time and not there; run pnpm synth --large (pnpm test also writes it)`);
  }
}

if (checks.length === 0) {
  problems.push('no oracle checks found under fixtures/synthetic (run pnpm synth --all)');
}

const present = checks.filter((check) => check.generated !== true || existsSync(path.join(syntheticRoot, check.spec)));
const run = spawnSync(python, ['-I', script, '--root', syntheticRoot, ...present.map((check) => path.join(syntheticRoot, check.spec))], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  maxBuffer: 512 * 1024 * 1024,
});
if (run.error || run.status !== 0) {
  problems.push(`${python} -I oracle.py failed (${run.error?.message ?? `exit ${String(run.status)}`}): ${run.stderr.trim()}`);
  problems.push('Is pyx12 installed for that interpreter? CI runs pip install pyx12; locally set TP_ORACLE_PYTHON to a virtualenv python that has it (tools/test-oracle/README.md).');
} else {
  const output = JSON.parse(run.stdout) as { pyx12: string; results: OracleResult[] };
  const byFile = new Map(output.results.map((result) => [result.file, result]));
  const codeLists = releaseDirectoryCodeLists();
  const zips = new Map<string, ZipEntry[]>();
  const bytesOf = (spec: string): Uint8Array => {
    const [file = '', entry] = spec.split('!');
    if (entry === undefined) {
      return readFileSync(path.join(syntheticRoot, file));
    }
    const entries = zips.get(file) ?? readZip(readFileSync(path.join(syntheticRoot, file)));
    zips.set(file, entries);
    const found = entries.find((item) => item.name === entry);
    if (found === undefined) {
      throw new Error(`${spec}: no such zip entry`);
    }
    return found.bytes;
  };
  let parsed = 0;
  for (const check of present) {
    const result = byFile.get(check.spec);
    problems.push(...disagreements(check, result));
    if (result !== undefined) {
      problems.push(...parserDisagreements(check, result, parse835(bytesOf(check.spec), { codeLists })));
      parsed += 1;
    }
  }
  if (problems.length === 0) {
    const rejected = present.filter((check) => !check.expectation.valid).length;
    process.stdout.write(
      `test:oracle: pyx12 ${output.pyx12} agrees with all ${String(present.length)} synthetic 835 fixtures (${String(present.length - rejected)} valid with identical summaries, ${String(rejected)} malformed and rejected as expected).\n`,
    );
    process.stdout.write(`test:oracle: packages/edi835 parsed the same ${String(parsed)} and agrees with pyx12 on every segment, amount and balance of every summary, and on every verdict.\n`);
  }
}
for (const problem of problems) {
  process.stderr.write(`${problem}\n`);
}
if (problems.length > 0) {
  process.stderr.write(`test:oracle: ${String(problems.length)} disagreement(s) or problem(s); every one fails the oracle.\n`);
  process.exitCode = 1;
}
