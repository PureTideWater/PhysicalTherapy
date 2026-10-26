import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { readDatabaseUrl } from '../config';
import {
  APPROVERS_LIST,
  DOMAIN_MODEL_DOCUMENT,
  type DocumentAtRef,
  DomainModelError,
  FUNCTIONS_DIRECTORY,
  REPO_ROOT,
  compareFunctionDirectory,
  describeDifference,
  documentApprovalProblems,
  documentAtRef,
  documentToWrite,
  firstDifference,
  functionFilesAtCommit,
  generateDomainModel,
  hasUncommittedInputs,
  readApprovers,
  readFunctionDirectory,
  renderFunctionChanges,
  renderSummary,
  sameDirectory,
  writeFunctionDirectory,
} from '../domain-model';

/**
 * `pnpm db:domain-model [--out [FILE]] [--check [FILE]] [--functions DIR] [--strict] [--require-approval]
 *  [--json FILE] [--summary-since REF] [--database-url URL] [--commit SHA] [--branch NAME]`: Change Order 001,
 *  CO-02.
 *
 * Generates docs/product/domain-model.md, and the function files (one per function name, its definition,
 * owner and privileges; docs/adr/0068), from the database at DATABASE_URL (or --database-url), which must be
 * freshly migrated with `pnpm db:migrate`; this command migrates nothing and only reads.
 *
 *   --out    writes the document (FILE defaults to docs/product/domain-model.md) and the function files.
 *            An existing valid approval line is kept when the regenerated text is identical; any change
 *            leaves it awaiting. In the functions directory it writes each changed file, removes each
 *            `*.sql` no function produces, and never follows a symlink or touches the README.
 *   --check  regenerates and compares with the document, ignoring the "Approved by:" line and the
 *            provenance line (commit and branch, the document's fifth line), so a pull request that
 *            changes no schema passes whatever its commit, and compares the functions directory: every
 *            missing, extra and differing file, and any symlink or directory, each with its first
 *            differing line. It reports both, then exits 1 if either differs.
 *   --functions DIR  the functions directory (default packages/db/functions), for --out, --check and
 *            --summary-since; resolved against the caller's directory, as FILE is.
 *   --require-approval  with --check: also exits 1 unless the document's last line, and no other, is
 *            an approval that names a person on packages/db/domain-model/approvers.json (exactly, apart
 *            from spaces at either end; an empty list refuses every approval), gives a date (YYYY-MM-DD,
 *            from 2026-10-16 to today, UTC) and carries the SHA-256 of exactly this text, which it prints
 *            when it refuses, so the founder signs the hash it names.
 *   --strict exits 2 when a divergence that is not informational has no reviewed explanation, or an
 *            explanation names a divergence or policy that no longer exists. A table in no area of
 *            packages/db/domain-model/areas.json always exits 2.
 *   --summary-since REF  prints, in Markdown, the changes since the document at the git ref REF (the
 *            base branch: its document is the last approved one), one line each, row-level security,
 *            policies, the PHI registry and grants first, with both documents' SHA-256 and approval state
 *            (summary.ts, docs/adr/0063). Alone it reads no database and compares with
 *            docs/product/domain-model.md as it is; with --out or --check, with the text they generate.
 *            Then "Function definitions changed since REF": each function file that differs between REF and
 *            this run's files (the generated set with --out or --check, else the functions directory as the
 *            working tree holds it), as a unified diff, SECURITY DEFINER and scope-setting functions first.
 *            A ref git cannot resolve, or a commit without the document, exits 2.
 *
 * The provenance line names the commit and branch (git, unless --commit is given), and says "with
 * uncommitted changes to its inputs" when git reports changes under packages/db or to the Data
 * dictionary (GENERATOR_INPUTS: the function files excluded, since they are an output), so a document
 * is only said to come from a commit that holds what generated it. The
 * comparison skips that line only where and as the generator writes it, so a commit (--commit or git's)
 * that is not 7 to 40 lower-case hexadecimal digits, or a branch that is not a git ref name in letters,
 * digits, ".", "_", "/" and "-", exits 2 before the database is read.
 */
const USAGE =
  'usage: pnpm db:domain-model [--out [FILE]] [--check [FILE]] [--functions DIR] [--strict] [--require-approval] [--json FILE] [--summary-since REF] [--database-url URL] [--commit SHA] [--branch NAME]\n';

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
      functions: { type: 'string' },
      strict: { type: 'boolean', default: false },
      'require-approval': { type: 'boolean', default: false },
      'summary-since': { type: 'string' },
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
const summarySince = values['summary-since'];
if (values.out === undefined && values.check === undefined && summarySince === undefined) {
  fail('give --out [FILE] to write, --check [FILE] to compare, or --summary-since REF for the changes since the document at REF', 2);
}
if (values['require-approval'] && values.check === undefined) fail('--require-approval needs --check [FILE]', 2);

// A path given on the command line is the caller's, wherever pnpm runs the script from.
const base = process.env.INIT_CWD ?? process.cwd();
const outPath = values.out === undefined ? undefined : path.resolve(base, values.out);
const checkPath = values.check === undefined ? undefined : path.resolve(base, values.check);
const functionsDir = values.functions === undefined ? FUNCTIONS_DIRECTORY : path.resolve(base, values.functions);

/** The last approved document, read before the database so that a ref git cannot resolve exits 2 first. */
let since: DocumentAtRef | undefined;
try {
  since = summarySince === undefined ? undefined : documentAtRef(summarySince);
} catch (error) {
  if (error instanceof DomainModelError) fail(error.message, 2);
  throw error;
}

/** A path as the summary names it: from the repository root when it is inside the repository. */
function named(file: string): string {
  const relative = path.relative(REPO_ROOT, file);
  return `\`${relative.startsWith('..') || path.isAbsolute(relative) ? file : relative}\``;
}

/**
 * The changes since the document at --summary-since, against `text` from `source`, then the function files that
 * changed since it, against `functionFiles` from `functionsSource`.
 */
function printSummary(text: string, source: string, approvers: readonly string[], functionFiles: ReadonlyMap<string, string>, functionsSource: string): void {
  if (since === undefined) return;
  process.stdout.write(`${renderSummary({ before: since, after: { text, source }, check: { approvers } })}\n`);
  // The base's files are packages/db/functions at REF, whatever --functions names for this run's.
  const directory = path.relative(REPO_ROOT, FUNCTIONS_DIRECTORY).split(path.sep).join('/');
  const before = functionFilesAtCommit(since.commit);
  process.stdout.write(`${renderFunctionChanges({ ref: since.ref, commit: since.commit, before, after: functionFiles, source: functionsSource, directory })}\n`);
}

if (values.out === undefined && values.check === undefined) {
  // --summary-since alone: the committed document as it is in the working tree, and no database.
  let names: string[];
  try {
    names = readApprovers();
  } catch (error) {
    if (error instanceof DomainModelError) fail(error.message, 2);
    throw error;
  }
  printSummary(
    readFileSync(DOMAIN_MODEL_DOCUMENT, 'utf8'),
    `${named(DOMAIN_MODEL_DOCUMENT)} in the working tree`,
    names,
    readFunctionDirectory(functionsDir),
    `the files in ${named(functionsDir)} in the working tree`,
  );
  process.exit(0);
}

let generated;
let approvers;
try {
  approvers = readApprovers();
  generated = await generateDomainModel({
    databaseUrl: values['database-url'] ?? readDatabaseUrl(),
    strict: values.strict,
    commit: values.commit ?? git(['rev-parse', 'HEAD']),
    branch: values.branch ?? git(['branch', '--show-current']),
    uncommitted: values.commit === undefined && hasUncommittedInputs(),
  });
} catch (error) {
  if (error instanceof DomainModelError) fail(error.message, 2);
  throw error;
}

/** The document --check compared, which matches the regenerated text when the check passes. */
let checked: string | undefined;
if (checkPath !== undefined) {
  const existing = readFileSync(checkPath, 'utf8');
  checked = existing;
  // Both the document and the functions directory are reported before either exits.
  let differs = false;
  const difference = firstDifference(existing, generated.text);
  if (difference !== null) {
    differs = true;
    process.stderr.write(
      `db:domain-model: ${checkPath} does not match the schema; regenerate it (pnpm db:domain-model --out on a freshly migrated database). First difference at line ${String(difference.line)}:\n- ${difference.existing}\n+ ${difference.generated}\n`,
    );
  } else {
    process.stdout.write(`${checkPath} matches the schema at ${String(generated.head)}\n`);
  }
  let directory;
  try {
    directory = compareFunctionDirectory(functionsDir, generated.functionFiles);
  } catch (error) {
    if (error instanceof DomainModelError) fail(error.message, 2);
    throw error;
  }
  if (!sameDirectory(directory)) {
    differs = true;
    process.stderr.write(
      `db:domain-model: ${functionsDir} does not match the functions of the schema; regenerate it (pnpm db:domain-model --out on a freshly migrated database):\n  ${describeDifference(functionsDir, directory).join('\n  ')}\n`,
    );
  } else {
    process.stdout.write(`${functionsDir} matches the schema's ${String(generated.functionFiles.size)} function names\n`);
  }
  if (differs) process.exit(1);
  if (values['require-approval']) {
    const problems = documentApprovalProblems(existing, generated.sha256, { approvers });
    if (problems.length) {
      fail(
        `${checkPath} is not approved: ${problems.join('; ')}\nThe text compared with the schema has SHA-256 ${generated.sha256}: the approval line must carry that hash, a name on ${APPROVERS_LIST} and a date.`,
        1,
      );
    }
    process.stdout.write(`${checkPath} carries an approval for this text\n`);
  }
}
let written: string | undefined;
let functionsWritten: { readonly written: readonly string[]; readonly removed: readonly string[] } | undefined;
if (outPath !== undefined) {
  written = documentToWrite(existsSync(outPath) ? readFileSync(outPath, 'utf8') : null, generated.text, { approvers });
  writeFileSync(outPath, written);
  try {
    functionsWritten = writeFunctionDirectory(functionsDir, generated.functionFiles);
  } catch (error) {
    if (error instanceof DomainModelError) fail(error.message, 2);
    throw error;
  }
}
if (values.json !== undefined) writeFileSync(path.resolve(base, values.json), generated.json);
process.stdout.write(`${outPath === undefined ? '' : `wrote ${outPath}: `}${generated.summary}\n`);
for (const p of generated.strictProblems) process.stdout.write(`  ${p}\n`);
if (functionsWritten !== undefined) {
  process.stdout.write(
    `wrote ${functionsDir}: ${String(generated.functionFiles.size)} function files, ${String(functionsWritten.written.length)} written, ${String(functionsWritten.removed.length)} removed\n`,
  );
}
const files = generated.functionFiles;
if (written !== undefined && outPath !== undefined) printSummary(written, `the text written to ${named(outPath)}`, approvers, files, `the files written to ${named(functionsDir)}`);
else if (checked !== undefined && checkPath !== undefined) printSummary(checked, `${named(checkPath)}, which matches the schema`, approvers, files, `${named(functionsDir)}, which matches the schema`);
else printSummary(generated.text, 'the text regenerated from the database', approvers, files, 'the files generated from the database');
