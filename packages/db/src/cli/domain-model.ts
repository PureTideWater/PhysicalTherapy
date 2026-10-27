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
  FUNCTION_DIFFS_MODES,
  type FunctionDiffsMode,
  REPO_ROOT,
  compareFunctionDirectory,
  describeDifference,
  documentApprovalProblems,
  documentAtRef,
  documentToWrite,
  firstDifference,
  functionBaseCommit,
  functionFilesAtCommit,
  generateDomainModel,
  hasUncommittedInputs,
  planFunctionDirectory,
  readApprovers,
  readFunctionDirectory,
  renderFunctionChanges,
  renderSummary,
  sameDirectory,
  writeFunctionDirectory,
} from '../domain-model';

/**
 * `pnpm db:domain-model [--out [FILE]] [--check [FILE]] [--functions DIR] [--strict] [--require-approval]
 *  [--json FILE] [--summary-since REF] [--function-diffs list|full] [--database-url URL] [--commit SHA]
 *  [--branch NAME]`: Change Order 001, CO-02.
 *
 * Generates docs/product/domain-model.md, and the function files (one per function name, its definition,
 * owner and privileges; docs/adr/0068), from the database at DATABASE_URL (or --database-url), which must be
 * freshly migrated with `pnpm db:migrate`; this command migrates nothing and only reads.
 *
 *   --out    writes the document (FILE defaults to docs/product/domain-model.md) and the function files.
 *            An existing valid approval line is kept when the regenerated text is identical; any change
 *            leaves it awaiting. In the functions directory it writes each changed file, removes each
 *            stale generated `*.sql` (one whose first line is the generator's banner), and never follows a
 *            symlink or touches the README. It checks the directory before writing anything: a symlink, a
 *            non-regular entry, a `*.sql` file that is not the generator's, or any other entry git would
 *            commit but the README (a stray file, a directory) refuses the run (exit 2) and leaves the
 *            document and the directory as they were.
 *   --check  regenerates and compares with the document, ignoring the "Approved by:" line and the
 *            provenance line (commit and branch, the document's fifth line), so a pull request that
 *            changes no schema passes whatever its commit, and compares the functions directory: every
 *            missing, extra and differing file, and any symlink or directory, each with its first
 *            differing line. It reports both, then exits 1 if either differs.
 *   --functions DIR  the functions directory (default packages/db/functions), for --out, --check and
 *            --summary-since; resolved against the caller's directory, as FILE is. A custom FILE for --out
 *            or --check needs it (exit 2 without): a preview of the document elsewhere never rewrites or
 *            prunes the repository's function files.
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
 *            Then "Function definitions changed since REF": each function file that differs between the
 *            files at the merge base of REF and HEAD and this run's files (the generated set with --out or
 *            --check, else the functions directory as the working tree holds it), one line each with its
 *            line counts, SECURITY DEFINER, tenant-scope, PUBLIC and privilege changes first, then their
 *            unified diffs within a budget (summary.ts). A ref git cannot resolve, a commit without the
 *            document, and any git or file-system failure in the function section exit 2.
 *   --function-diffs list|full  with --summary-since: `full` (the default, CI's job summary) prints the
 *            diffs; `list` prints the same text without them, a prefix of `full`'s, for a pull request's
 *            description, which GitHub caps at 65,536 characters.
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
  'usage: pnpm db:domain-model [--out [FILE]] [--check [FILE]] [--functions DIR] [--strict] [--require-approval] [--json FILE] [--summary-since REF] [--function-diffs list|full] [--database-url URL] [--commit SHA] [--branch NAME]\n';

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
      'function-diffs': { type: 'string' },
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
const functionDiffs = values['function-diffs'] ?? 'full';
if (!(FUNCTION_DIFFS_MODES as readonly string[]).includes(functionDiffs)) fail(`--function-diffs takes ${FUNCTION_DIFFS_MODES.join(' or ')}, not ${JSON.stringify(functionDiffs)}`, 2);
if (values['function-diffs'] !== undefined && summarySince === undefined) fail('--function-diffs needs --summary-since REF', 2);

// A path given on the command line is the caller's, wherever pnpm runs the script from.
const base = process.env.INIT_CWD ?? process.cwd();
const outPath = values.out === undefined ? undefined : path.resolve(base, values.out);
const checkPath = values.check === undefined ? undefined : path.resolve(base, values.check);
const functionsDir = values.functions === undefined ? FUNCTIONS_DIRECTORY : path.resolve(base, values.functions);
// A custom document path is a preview or a scratch copy: it never rewrites, prunes or compares the repository's files.
const customFile = [outPath, checkPath].find((file) => file !== undefined && file !== DOMAIN_MODEL_DOCUMENT);
if (customFile !== undefined && values.functions === undefined) fail(`give --functions DIR with a custom FILE (${customFile}), so the repository's ${path.relative(REPO_ROOT, FUNCTIONS_DIRECTORY)} is never written or compared in its place`, 2);

/**
 * Runs a step of the function paths: a DomainModelError, or any git or file-system failure, exits 2 with its message
 * (git's stderr included), never a stack trace and exit 1, which means "differs".
 */
function functionStep<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof DomainModelError) fail(error.message, 2);
    fail(`the function files: ${error instanceof Error ? error.message : String(error)}`, 2);
  }
}

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
 * changed since the merge base of it and HEAD, against `functionFiles` from `functionsSource`. The function section is
 * rendered before anything is printed, so a failure in it (exit 2) prints neither half.
 */
function printSummary(
  text: string,
  source: string,
  approvers: readonly string[],
  functionFiles: ReadonlyMap<string, string>,
  functionsSource: string,
  origin: 'committed' | 'generated',
): void {
  if (since === undefined) return;
  const ref = since;
  // The base's files are packages/db/functions at the merge base, whatever --functions names for this run's.
  const directory = path.relative(REPO_ROOT, FUNCTIONS_DIRECTORY).split(path.sep).join('/');
  const functions = functionStep(() => {
    const commit = functionBaseCommit(ref.commit);
    return renderFunctionChanges({
      ref: ref.ref,
      commit,
      refCommit: ref.commit,
      before: functionFilesAtCommit(commit),
      after: functionFiles,
      source: functionsSource,
      origin,
      directory,
      mode: functionDiffs as FunctionDiffsMode,
    });
  });
  process.stdout.write(`${renderSummary({ before: ref, after: { text, source }, check: { approvers } })}\n`);
  process.stdout.write(`${functions}\n`);
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
    functionStep(() => readFunctionDirectory(functionsDir)),
    `the files in ${named(functionsDir)} in the working tree`,
    'committed',
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
  const directory = functionStep(() => compareFunctionDirectory(functionsDir, generated.functionFiles));
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
  // The directory is checked before the document is written, so a refusal changes neither.
  functionStep(() => planFunctionDirectory(functionsDir, generated.functionFiles));
  written = documentToWrite(existsSync(outPath) ? readFileSync(outPath, 'utf8') : null, generated.text, { approvers });
  writeFileSync(outPath, written);
  functionsWritten = functionStep(() => writeFunctionDirectory(functionsDir, generated.functionFiles));
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
if (written !== undefined && outPath !== undefined) printSummary(written, `the text written to ${named(outPath)}`, approvers, files, `the files written to ${named(functionsDir)}`, 'generated');
else if (checked !== undefined && checkPath !== undefined) printSummary(checked, `${named(checkPath)}, which matches the schema`, approvers, files, `${named(functionsDir)}, which matches the schema`, 'generated');
else printSummary(generated.text, 'the text regenerated from the database', approvers, files, 'the files generated from the database', 'generated');
