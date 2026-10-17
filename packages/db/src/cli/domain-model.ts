import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { readDatabaseUrl } from '../config';
import {
  DOMAIN_MODEL_DOCUMENT,
  DomainModelError,
  REPO_ROOT,
  documentApprovalProblems,
  documentToWrite,
  firstDifference,
  generateDomainModel,
} from '../domain-model';

/**
 * `pnpm db:domain-model [--out [FILE]] [--check [FILE]] [--strict] [--require-approval] [--json FILE]
 *  [--database-url URL] [--commit SHA] [--branch NAME]`: Change Order 001, CO-02.
 *
 * Generates docs/product/domain-model.md from the database at DATABASE_URL (or --database-url), which
 * must be freshly migrated with `pnpm db:migrate`; this command migrates nothing and only reads.
 *
 *   --out    writes the document (FILE defaults to docs/product/domain-model.md). An existing valid
 *            approval line is kept when the regenerated text is identical; any change leaves it awaiting.
 *   --check  regenerates and compares with the document, ignoring the "Approved by:" line and the
 *            provenance line (commit and branch), so a pull request that changes no schema passes
 *            whatever its commit; exits 1 and prints the first differing line when they differ.
 *   --require-approval  with --check: also exits 1 unless the document's last line, and no other, is
 *            an approval that names a person, gives a date (YYYY-MM-DD, from 2026-10-16 to today, UTC)
 *            and carries the SHA-256 of exactly this text.
 *   --strict exits 2 when a divergence that is not informational has no reviewed explanation, or an
 *            explanation names a divergence or policy that no longer exists. A table in no area of
 *            packages/db/domain-model/areas.json always exits 2.
 *
 * The provenance line names the commit and branch (git, unless --commit is given), and says "with
 * uncommitted changes to its inputs" when git reports changes under packages/db or to the Data
 * dictionary, so a document is only said to come from a commit that holds what generated it.
 */
const USAGE =
  'usage: pnpm db:domain-model [--out [FILE]] [--check [FILE]] [--strict] [--require-approval] [--json FILE] [--database-url URL] [--commit SHA] [--branch NAME]\n';

function fail(message: string, code: number): never {
  process.stderr.write(`db:domain-model: ${message}\n`);
  process.exit(code);
}

/** --out and --check take the document's path, docs/product/domain-model.md when no path follows. */
function withDefaultDocument(argv: readonly string[]): string[] {
  return argv.flatMap((arg, i) => {
    const next = argv[i + 1];
    return (arg === '--out' || arg === '--check') && (next === undefined || next.startsWith('--')) ? [arg, DOMAIN_MODEL_DOCUMENT] : [arg];
  });
}

function git(args: readonly string[]): string {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

let values;
try {
  ({ values } = parseArgs({
    args: withDefaultDocument(process.argv.slice(2)),
    options: {
      out: { type: 'string' },
      check: { type: 'string' },
      json: { type: 'string' },
      strict: { type: 'boolean', default: false },
      'require-approval': { type: 'boolean', default: false },
      'database-url': { type: 'string' },
      commit: { type: 'string' },
      branch: { type: 'string' },
    },
    strict: true,
  }));
} catch {
  process.stderr.write(USAGE);
  process.exit(2);
}
if (values.out === undefined && values.check === undefined) fail('give --out [FILE] to write, or --check [FILE] to compare', 2);
if (values['require-approval'] && values.check === undefined) fail('--require-approval needs --check [FILE]', 2);

// A path given on the command line is the caller's, wherever pnpm runs the script from.
const base = process.env.INIT_CWD ?? process.cwd();
const outPath = values.out === undefined ? undefined : path.resolve(base, values.out);
const checkPath = values.check === undefined ? undefined : path.resolve(base, values.check);

/** The generator's inputs: its code, the migrations, the Drizzle schema, its data files and the Data dictionary. */
const INPUTS = ['packages/db', 'docs/product/data-dictionary.md'];

let generated;
try {
  generated = await generateDomainModel({
    databaseUrl: values['database-url'] ?? readDatabaseUrl(),
    strict: values.strict,
    commit: values.commit ?? git(['rev-parse', 'HEAD']),
    branch: values.branch ?? git(['branch', '--show-current']),
    uncommitted: values.commit === undefined && git(['status', '--porcelain', '--', ...INPUTS]) !== '',
  });
} catch (error) {
  if (error instanceof DomainModelError) fail(error.message, 2);
  throw error;
}

if (checkPath !== undefined) {
  const existing = readFileSync(checkPath, 'utf8');
  const difference = firstDifference(existing, generated.text);
  if (difference !== null) {
    fail(
      `${checkPath} does not match the schema; regenerate it (pnpm db:domain-model --out on a freshly migrated database). First difference at line ${String(difference.line)}:\n- ${difference.existing}\n+ ${difference.generated}`,
      1,
    );
  }
  process.stdout.write(`${checkPath} matches the schema at ${String(generated.head)}\n`);
  if (values['require-approval']) {
    const problems = documentApprovalProblems(existing, generated.sha256);
    if (problems.length) fail(`${checkPath} is not approved: ${problems.join('; ')}`, 1);
    process.stdout.write(`${checkPath} carries an approval for this text\n`);
  }
}
if (outPath !== undefined) {
  writeFileSync(outPath, documentToWrite(existsSync(outPath) ? readFileSync(outPath, 'utf8') : null, generated.text));
}
if (values.json !== undefined) writeFileSync(path.resolve(base, values.json), generated.json);
process.stdout.write(`${outPath === undefined ? '' : `wrote ${outPath}: `}${generated.summary}\n`);
for (const p of generated.strictProblems) process.stdout.write(`  ${p}\n`);
