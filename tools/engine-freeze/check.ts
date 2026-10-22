import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { z } from 'zod';

import { repositoryRoot } from '../content-files';

/**
 * The engine freeze of reconciliation-001's change order, as CI checks it on every pull request (PR 6b; docs/adr/0064):
 *
 * - **Engine.** No non-test file under packages/pricing/src changes (`git diff --stat <base> HEAD -- packages/pricing/src
 *   ':!**\/*.test.ts'`, written to the job summary under "Engine freeze"), unless the applicable exception lists it
 *   under `engine_files`. The founder's ruling of 2026-10-18 11:47 UTC opened five files for PR 6b's ZIP+4 lookup
 *   alone, so `engine_files` can name no other. Nothing else under packages/pricing but tests changes either (its
 *   package.json, tsconfig.json or a file beside src, exception or not), and every workspace package that depends on
 *   @tp/pricing resolves it, and @tp/pricing/testing, to packages/pricing/src: so no pull request swaps the engine its
 *   consumers run by pointing the package elsewhere.
 * - **Golden files and frozen releases.** No existing file under fixtures/golden/{claims,diffs,sources} changes, and no
 *   file of a synthetic release a golden claim at the base pins by its manifest's hash (900001-900005 at least),
 *   exception or not. A file added under fixtures/golden must match `golden_added`; one edited outside those three
 *   directories must be listed in `golden_edited`. With no applicable exception, fixtures/golden does not change at
 *   all (the change order's check, verbatim).
 * - **Rule tables.** No migration the pull request adds or changes touches rule_release, rule_record or
 *   rule_release_withdrawal: DDL on them (a table, column, constraint, trigger, policy, index, grant or comment of
 *   theirs, or a foreign key that references them), a write to their rows, also from a routine's or DO block's body
 *   and from dynamic SQL, a replacement, change or drop of a function a trigger on them executes, a grant on every
 *   table of a schema, a write privilege on a view that reads them, and dynamic SQL that builds DDL or a write from
 *   values read at run time (which the check cannot read). A statement is let through only when the applicable
 *   exception names it under `rule_table_ddl`, by its migration and its text exactly as this check prints it (for PR
 *   6b-2's one CHECK, under the founder's answer to Q3 (a) of 2026-10-21). The migrated catalog of the three tables is
 *   held to tools/engine-freeze/rule-tables.catalog.json by rule-tables.db.test.ts, and that file changes only under
 *   an exception that lists rule_table_ddl.
 *
 * The exception (tools/engine-freeze/exception.json) applies only in the pull request it names (`pull_request`, read
 * against PR_NUMBER, which CI sets), and only when that pull request adds or edits it: when the diff from the base does
 * not hold the file, it is stale and ignored. So a base merge into the pull request needs no edit, and a later pull
 * request runs with no exception until it declares its own, naming itself, which CODEOWNERS sends to the founder
 * (docs/adr/0063). An applicable exception lists exactly its pull request's changes: an entry nothing uses is a
 * problem, so an exception carried into another pull request never lets anything through.
 */

export const EXCEPTION_FILE = 'tools/engine-freeze/exception.json';
/** The rule tables' migrated catalog, which tools/engine-freeze/rule-tables.db.test.ts holds the database to. */
export const RULE_TABLE_CATALOG = 'tools/engine-freeze/rule-tables.catalog.json';
export const ENGINE_DIR = 'packages/pricing/src/';
/** The engine's package: nothing in it but tests changes outside ENGINE_DIR. */
export const ENGINE_PACKAGE = 'packages/pricing/';
/** The files the engine's consumers must resolve @tp/pricing and @tp/pricing/testing to. */
export const ENGINE_ENTRY_POINTS = { '@tp/pricing': 'packages/pricing/src/index.ts', '@tp/pricing/testing': 'packages/pricing/src/testing.ts' } as const;
/** The engine files the founder's ruling of 2026-10-18 11:47 UTC opened, for PR 6b's ZIP+4 locality lookup alone. */
export const RULING_ENGINE_FILES = ['engine.ts', 'reasons.ts', 'recompute.ts', 'trace.ts', 'types.ts'] as const;
export const GOLDEN_DIR = 'fixtures/golden/';
/** The golden directories whose existing files never change, exception or not. */
export const GOLDEN_FROZEN_DIRS = ['fixtures/golden/claims/', 'fixtures/golden/diffs/', 'fixtures/golden/sources/'] as const;
/** The synthetic releases the golden claims pinned when the freeze began; the base's own pins are added to them. */
const FROZEN_RELEASE = /^fixtures\/synthetic\/rules\/release-synth-90000[1-5]\//;
export const GOLDEN_CLAIMS_DIR = 'fixtures/golden/claims/';
export const MIGRATIONS_DIR = 'packages/db/migrations/';
export const RULE_TABLES = ['rule_release', 'rule_record', 'rule_release_withdrawal'] as const;
/** The engine diff's pathspec, as the change order writes it. */
export const ENGINE_PATHSPEC = ['packages/pricing/src', ':!**/*.test.ts'] as const;

const TEST_FILE = /\.test\.tsx?$/;

const unique = <T extends z.ZodType<string>>(item: T) =>
  z.array(item).refine((items) => new Set(items).size === items.length, { message: 'lists an entry twice' });

const repositoryPath = (pattern: RegExp, what: string) =>
  z
    .string()
    .regex(pattern, what)
    .refine((value) => !value.split('/').some((segment) => segment === '.' || segment === '..'), { message: 'must stay inside its directory' });

/** exception.json: every key required, none unknown. */
export const exceptionSchema = z.strictObject({
  ruling: z.string().trim().min(1, 'names the ruling that grants the exception'),
  /** The pull request the exception is declared in, and the only one it applies in. */
  pull_request: z.number().int().positive('names the pull request it is declared in'),
  engine_files: unique(z.enum(RULING_ENGINE_FILES, { message: `the founder's ruling of 2026-10-18 opened only ${RULING_ENGINE_FILES.join(', ')}` })),
  golden_added: unique(repositoryPath(/^fixtures\/golden\/(?:[A-Za-z0-9_.*-]+\/)*[A-Za-z0-9_.*-]+$/, 'a path or pattern under fixtures/golden/, where * stands for any characters but /')),
  golden_edited: unique(
    repositoryPath(/^fixtures\/golden\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/, 'a file under fixtures/golden/').refine((file) => !GOLDEN_FROZEN_DIRS.some((dir) => file.startsWith(dir)), {
      message: 'an existing file under fixtures/golden/claims, diffs or sources never changes',
    }),
  ),
  rule_table_ddl: z.array(
    z.strictObject({
      migration: z.string().regex(/^packages\/db\/migrations\/\d{14}_[a-z0-9_]+\.sql$/, 'a migration file under packages/db/migrations/'),
      statement: z.string().min(1),
    }),
  ),
});

export type FreezeException = z.infer<typeof exceptionSchema>;

const NO_EXCEPTION: FreezeException = { ruling: '', pull_request: 1, engine_files: [], golden_added: [], golden_edited: [], rule_table_ddl: [] };

/** One path the pull request changes, by git's status letter (A, M, D, T; renames are read as a deletion and an addition). */
export interface Change {
  readonly status: string;
  readonly path: string;
}

export interface FreezeInput {
  /** Every path changed from the base to HEAD. */
  readonly changes: readonly Change[];
  /** exception.json as HEAD holds it, or null when HEAD holds none. */
  readonly exceptionText: string | null;
  /** True when the diff from the base holds exception.json: only then does it apply. */
  readonly exceptionChanged: boolean;
  /** HEAD's text of a migration the pull request adds or changes. */
  readonly migrationText: (file: string) => string;
  /** The pull request's number (PR_NUMBER), or null where it is not known (a local run); the exception must name it. */
  readonly pullRequest?: number | null;
  /** The synthetic release directories the base's golden claims pin (inputs.release.dir), frozen beside 900001-900005. */
  readonly pinnedReleases?: readonly string[];
  /** What every migration at HEAD makes of the rule tables: the functions their triggers execute and the views that read them. */
  readonly ruleTableObjects?: RuleTableObjects;
}

export type ExceptionState = 'applies' | 'stale' | 'none' | 'another pull request';

export interface FreezeReport {
  readonly exception: ExceptionState;
  /** What the exception let through: each path and statement, with the list that names it. */
  readonly allowed: readonly string[];
  /** Entries of an applicable exception that nothing in the pull request used. */
  readonly unused: readonly string[];
  readonly problems: readonly string[];
}

const STATUS_WORDS: Readonly<Record<string, string>> = { A: 'added', M: 'modified', D: 'deleted', T: 'type changed' };
const statusWord = (status: string) => STATUS_WORDS[status] ?? `status ${status}`;

/** A golden_added pattern as a regular expression: `*` is any run of characters but `/`. */
export function goldenPattern(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
}

function notListed(state: ExceptionState, list: string): string {
  switch (state) {
    case 'none':
      return `no exception is declared (${EXCEPTION_FILE})`;
    case 'stale':
      return `${EXCEPTION_FILE} is unchanged in this pull request, so it is stale and does not apply (an exception applies only in the pull request that adds or edits it)`;
    case 'applies':
      return `the exception does not list it under ${list}`;
    case 'another pull request':
      return `${EXCEPTION_FILE} names another pull request, so it does not apply here`;
  }
}

/** Reads the exception when it applies; a malformed one is a problem, and then no exception applies. */
function readException(input: FreezeInput, problems: string[]): { readonly state: ExceptionState; readonly exception: FreezeException } {
  if (input.exceptionText === null) {
    return { state: 'none', exception: NO_EXCEPTION };
  }
  if (!input.exceptionChanged) {
    return { state: 'stale', exception: NO_EXCEPTION };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.exceptionText);
  } catch (error) {
    problems.push(`${EXCEPTION_FILE}: is not JSON (${error instanceof Error ? error.message : String(error)})`);
    return { state: 'applies', exception: NO_EXCEPTION };
  }
  const result = exceptionSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      problems.push(`${EXCEPTION_FILE}: ${issue.path.join('.') || '(file)'}: ${issue.message}`);
    }
    return { state: 'applies', exception: NO_EXCEPTION };
  }
  const pullRequest = input.pullRequest ?? null;
  if (pullRequest !== null && result.data.pull_request !== pullRequest) {
    problems.push(
      `${EXCEPTION_FILE}: names pull request ${String(result.data.pull_request)}, and this is pull request ${String(pullRequest)}: an exception applies only in the pull request it names, which adds or edits it`,
    );
    return { state: 'another pull request', exception: NO_EXCEPTION };
  }
  return { state: 'applies', exception: result.data };
}

/** Checks one pull request's changes against the freeze. */
export function checkFreeze(input: FreezeInput): FreezeReport {
  const problems: string[] = [];
  const allowed: string[] = [];
  const { state, exception } = readException(input, problems);
  const used = new Set<string>();
  const pinned = (input.pinnedReleases ?? []).map((dir) => `${dir.replace(/\/+$/, '')}/`);
  for (const { status, path: file } of input.changes) {
    const change = `${file} (${statusWord(status)})`;
    if (file.startsWith(ENGINE_PACKAGE) && !file.startsWith(ENGINE_DIR) && !TEST_FILE.test(file)) {
      problems.push(
        `${change}: a file of packages/pricing outside src changes; the engine's package (its manifest, its TypeScript settings and anything beside src) is frozen with the engine, exception or not, so its consumers keep running packages/pricing/src`,
      );
    }
    if (file.startsWith(ENGINE_DIR) && !TEST_FILE.test(file)) {
      const name = file.slice(ENGINE_DIR.length);
      if ((exception.engine_files as readonly string[]).includes(name)) {
        allowed.push(`${change}: engine_files`);
        used.add(`engine_files ${name}`);
      } else {
        problems.push(`${change}: a non-test file under packages/pricing/src changes, and ${notListed(state, 'engine_files')}`);
      }
    }
    if (FROZEN_RELEASE.test(file)) {
      problems.push(`${change}: synthetic releases 900001 to 900005 never change, exception or not (the golden claims pin their manifests); a new release takes a new number`);
    } else if (pinned.some((dir) => file.startsWith(dir))) {
      problems.push(`${change}: a release a golden claim at the base pins by its manifest's hash never changes, exception or not; a new release takes a new number`);
    }
    if (file === RULE_TABLE_CATALOG && status !== 'A') {
      if (status === 'D') {
        problems.push(`${change}: the rule tables' catalog snapshot is never deleted; rule-tables.db.test.ts holds the migrated database to it`);
      } else if (state === 'applies' && exception.rule_table_ddl.length > 0) {
        allowed.push(`${change}: rule_table_ddl (the snapshot of the catalog the listed statements change)`);
      } else {
        problems.push(`${change}: the rule tables' catalog snapshot changes, and ${state === 'applies' ? 'the exception lists no rule_table_ddl' : notListed(state, 'rule_table_ddl')}`);
      }
    }
    if (file.startsWith(GOLDEN_DIR)) {
      const frozen = GOLDEN_FROZEN_DIRS.some((dir) => file.startsWith(dir));
      if (status === 'A') {
        const pattern = exception.golden_added.find((item) => goldenPattern(item).test(file));
        if (pattern === undefined) {
          problems.push(`${change}: a file added under fixtures/golden, and ${notListed(state, 'golden_added')}`);
        } else {
          allowed.push(`${change}: golden_added ${pattern}`);
          used.add(`golden_added ${pattern}`);
        }
      } else if (status === 'M' && !frozen) {
        if (exception.golden_edited.includes(file)) {
          allowed.push(`${change}: golden_edited`);
          used.add(`golden_edited ${file}`);
        } else {
          problems.push(`${change}: a golden file is edited, and ${notListed(state, 'golden_edited')}`);
        }
      } else {
        problems.push(`${change}: an existing golden file never changes, exception or not (${frozen ? 'fixtures/golden/claims, diffs and sources' : 'only an edit listed in golden_edited is allowed outside them'})`);
      }
    }
    if (file.startsWith(MIGRATIONS_DIR) && status !== 'D') {
      checkMigration(file, input.migrationText, input.ruleTableObjects ?? NO_OBJECTS, exception, state, problems, allowed, used);
    }
  }
  const unused = [
    ...exception.engine_files.map((name) => `engine_files ${name}`),
    ...exception.golden_added.map((pattern) => `golden_added ${pattern}`),
    ...exception.golden_edited.map((file) => `golden_edited ${file}`),
  ].filter((entry) => !used.has(entry));
  for (const entry of unused) {
    problems.push(`${EXCEPTION_FILE}: lists ${entry}, which nothing in this pull request uses; an exception lists exactly the changes of the pull request it names`);
  }
  for (const { migration, statement } of exception.rule_table_ddl) {
    if (!used.has(`rule_table_ddl ${migration} ${statement}`)) {
      problems.push(`${EXCEPTION_FILE}: rule_table_ddl names a statement that no migration this pull request adds holds, exactly as written (${migration}): ${statement}`);
    }
  }
  return { exception: state, allowed, unused, problems };
}

function checkMigration(
  file: string,
  migrationText: (file: string) => string,
  objects: RuleTableObjects,
  exception: FreezeException,
  state: ExceptionState,
  problems: string[],
  allowed: string[],
  used: Set<string>,
): void {
  let touching: RuleTableStatement[];
  try {
    touching = ruleTableStatements(migrationText(file), objects);
  } catch (error) {
    problems.push(`${file}: cannot be read as SQL, so the rule tables cannot be checked (${error instanceof Error ? error.message : String(error)})`);
    return;
  }
  for (const statement of touching) {
    const named = exception.rule_table_ddl.some((item) => item.migration === file && item.statement === statement.text);
    if (named) {
      allowed.push(`${file} statement ${String(statement.index)}: rule_table_ddl (${statement.findings.join('; ')})`);
      used.add(`rule_table_ddl ${file} ${statement.text}`);
    } else {
      problems.push(
        `${file} statement ${String(statement.index)}: ${statement.findings.join('; ')}. No DDL touches rule_release, rule_record or rule_release_withdrawal (reconciliation-001), and ${notListed(state, 'rule_table_ddl')}. The statement, as an exception names it: ${statement.text}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Reading PostgreSQL: statements, with comments, literals and dollar-quoted bodies told apart from code.

export type Token =
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'quoted'; readonly value: string }
  | { readonly kind: 'punct'; readonly value: string }
  | { readonly kind: 'literal'; readonly value: string; readonly dollar: boolean };

export interface SqlStatement {
  /** The statement with comments dropped and white space outside literals collapsed to one space; no semicolon. */
  readonly text: string;
  readonly tokens: readonly Token[];
}

export class SqlReadError extends Error {}

const WORD_START = /[A-Za-z_\u0080-\uffff]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-\uffff]/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/;

/** Splits SQL into its statements at the semicolons outside comments, literals, quoted identifiers and dollar quotes. */
export function splitSql(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let text = '';
  let tokens: Token[] = [];
  let space = false;
  const emit = (piece: string) => {
    if (space && text !== '') text += ' ';
    space = false;
    text += piece;
  };
  const finish = () => {
    if (text !== '') statements.push({ text, tokens });
    text = '';
    tokens = [];
    space = false;
  };
  const quoted = (start: number, quote: string, escapes: boolean): number => {
    let at = start + 1;
    for (;;) {
      if (at >= sql.length) throw new SqlReadError(`a ${quote === '"' ? 'quoted identifier' : 'string literal'} is never closed`);
      const char = sql[at];
      if (escapes && char === '\\') {
        at += 2;
      } else if (char === quote && sql[at + 1] === quote) {
        at += 2;
      } else if (char === quote) {
        return at + 1;
      } else {
        at += 1;
      }
    }
  };
  let at = 0;
  while (at < sql.length) {
    const char = sql.charAt(at);
    const next = sql.charAt(at + 1);
    if (/\s/.test(char)) {
      space = true;
      at += 1;
    } else if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', at);
      at = end === -1 ? sql.length : end + 1;
      space = true;
    } else if (char === '/' && next === '*') {
      let depth = 1;
      at += 2;
      while (depth > 0) {
        if (at >= sql.length) throw new SqlReadError('a block comment is never closed');
        if (sql.startsWith('/*', at)) {
          depth += 1;
          at += 2;
        } else if (sql.startsWith('*/', at)) {
          depth -= 1;
          at += 2;
        } else {
          at += 1;
        }
      }
      space = true;
    } else if (char === ';') {
      finish();
      at += 1;
    } else if (char === "'") {
      const end = quoted(at, "'", false);
      emit(sql.slice(at, end));
      tokens.push({ kind: 'literal', value: sql.slice(at + 1, end - 1).replaceAll("''", "'"), dollar: false });
      at = end;
    } else if (char === '"') {
      const end = quoted(at, '"', false);
      emit(sql.slice(at, end));
      tokens.push({ kind: 'quoted', value: sql.slice(at + 1, end - 1).replaceAll('""', '"') });
      at = end;
    } else if (char === '$' && DOLLAR_TAG.test(sql.slice(at, at + 64)) && !WORD_PART.test(sql.charAt(at - 1))) {
      const tag = DOLLAR_TAG.exec(sql.slice(at, at + 64))?.[0] ?? '$$';
      const close = sql.indexOf(tag, at + tag.length);
      if (close === -1) throw new SqlReadError(`a dollar-quoted body ${tag} is never closed`);
      emit(sql.slice(at, close + tag.length));
      tokens.push({ kind: 'literal', value: sql.slice(at + tag.length, close), dollar: true });
      at = close + tag.length;
    } else if (WORD_START.test(char)) {
      let end = at + 1;
      while (end < sql.length && WORD_PART.test(sql.charAt(end))) end += 1;
      const word = sql.slice(at, end);
      if (word.toLowerCase() === 'u' && sql.charAt(end) === '&' && (sql.charAt(end + 1) === '"' || sql.charAt(end + 1) === "'")) {
        // A Unicode escape, U&"rule\005frecord" or U&'...': read as the name or text it spells, so no spelling of a rule
        // table slips past. With UESCAPE (another escape character) it is not read, and the migration fails the check.
        const quote = sql.charAt(end + 1);
        const close = quoted(end + 1, quote, false);
        if (/^\s*uescape\b/i.test(sql.slice(close, close + 64))) throw new SqlReadError('a Unicode escape with UESCAPE, which this check does not read');
        const value = unicodeEscapes(sql.slice(end + 2, close - 1).replaceAll(quote + quote, quote));
        emit(sql.slice(at, close));
        tokens.push(quote === '"' ? { kind: 'quoted', value } : { kind: 'literal', value, dollar: false });
        at = close;
      } else if (word.toLowerCase() === 'e' && sql.charAt(end) === "'") {
        // An escape string, E'...', whose backslashes escape the quote.
        const close = quoted(end, "'", true);
        emit(sql.slice(at, close));
        tokens.push({ kind: 'literal', value: sql.slice(end + 1, close - 1), dollar: false });
        at = close;
      } else {
        emit(word);
        tokens.push({ kind: 'word', value: word.toLowerCase() });
        at = end;
      }
    } else {
      emit(char);
      tokens.push({ kind: 'punct', value: char });
      at += 1;
    }
  }
  finish();
  return statements;
}

/** The text a U& string or identifier spells: \\XXXX and \\+XXXXXX are code points, \\\\ a backslash. */
function unicodeEscapes(text: string): string {
  return text.replace(/\\(\\|\+[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|)/g, (_match, code: string) => {
    if (code === '\\') return '\\';
    if (code === '') throw new SqlReadError('a Unicode escape that is not \\XXXX, \\+XXXXXX or \\\\');
    return String.fromCodePoint(Number.parseInt(code.replace('+', ''), 16));
  });
}

// ---------------------------------------------------------------------------------------------
// Which statements touch the rule tables

/** Statements that change a table's definition, privileges or storage; COMMENT and SECURITY only before ON and LABEL. */
const DDL_VERBS = new Set(['create', 'alter', 'drop', 'truncate', 'grant', 'revoke', 'reindex', 'cluster', 'vacuum', 'comment', 'security']);
const DDL_FOLLOWED_BY: Readonly<Record<string, string>> = { comment: 'on', security: 'label' };
/** Words between CREATE, ALTER or DROP and the kind of object they name. */
const OBJECT_MODIFIERS = new Set(['or', 'replace', 'temp', 'temporary', 'unique', 'constraint', 'materialized', 'recursive', 'unlogged', 'global', 'local', 'concurrently', 'if', 'not', 'exists']);
/** Objects whose creation only reads the tables it names: a view's query, a routine's signature (its body is read below). */
const READING_OBJECTS = new Set(['view', 'function', 'procedure', 'aggregate']);
/** Objects a statement names by their table, after ON. */
const OBJECTS_ON_A_TABLE = new Set(['policy', 'trigger', 'index']);
/** Objects a rule table owns under a name of its own, which starts with the table's (an index or a sequence). */
const OWNED_OBJECTS = new Set(['index', 'sequence']);
const ROUTINES = new Set(['function', 'procedure']);
const MAX_DEPTH = 6;

const isRuleTable = (token: Token | undefined): boolean =>
  token !== undefined && (token.kind === 'word' || token.kind === 'quoted') && (RULE_TABLES as readonly string[]).includes(token.value);

const isWord = (token: Token | undefined, ...words: string[]) => token !== undefined && token.kind === 'word' && words.includes(token.value);

/** The table a qualified name ends with, at `at` (a, a.b or a.b.c), or undefined. */
function nameAt(tokens: readonly Token[], at: number): Token | undefined {
  let index = at;
  while (tokens[index + 1]?.kind === 'punct' && tokens[index + 1]?.value === '.' && tokens[index + 2] !== undefined) index += 2;
  const token = tokens[index];
  return token?.kind === 'word' || token?.kind === 'quoted' ? token : undefined;
}

/** The index of the first DDL verb in the statement (not a column after a dot), or -1. */
function ddlStart(tokens: readonly Token[]): number {
  return tokens.findIndex((token, index) => {
    if (token.kind !== 'word' || !DDL_VERBS.has(token.value)) return false;
    if (tokens[index - 1]?.kind === 'punct' && tokens[index - 1]?.value === '.') return false;
    const follower = DDL_FOLLOWED_BY[token.value];
    return follower === undefined || isWord(tokens[index + 1], follower);
  });
}

/** The kind of object a CREATE, ALTER or DROP names (TABLE, VIEW, FUNCTION...), and where it is. */
function objectKind(slice: readonly Token[]): { readonly kind: string; readonly at: number } {
  let at = 1;
  while (isWord(slice[at], ...OBJECT_MODIFIERS)) at += 1;
  const token = slice[at];
  return { kind: token?.kind === 'word' ? token.value : '', at };
}

/** The table named after the first `word` past `from` (ON t, ON ONLY t, FROM t), or undefined. */
function tableAfter(slice: readonly Token[], word: string, from: number): Token | undefined {
  const found = slice.findIndex((token, index) => index > from && isWord(token, word));
  return found === -1 ? undefined : nameAt(slice, isWord(slice[found + 1], 'only') ? found + 2 : found + 1);
}

function ddlFindings(slice: readonly Token[]): string[] {
  const verb = slice[0]?.value ?? '';
  const { kind, at } = ['create', 'alter', 'drop'].includes(verb) ? objectKind(slice) : { kind: '', at: 1 };
  const shown = `${verb.toUpperCase()}${kind === '' ? '' : ` ${kind.toUpperCase()}`}`;
  if (verb === 'create' && READING_OBJECTS.has(kind)) return [];
  if (OBJECTS_ON_A_TABLE.has(kind) && slice.some((token, index) => index > at && isWord(token, 'on'))) {
    // A policy's USING and WITH CHECK, a trigger's WHEN and an index's predicate only read: the table is the one after ON,
    // and for a constraint trigger also the one after FROM.
    const targets = [tableAfter(slice, 'on', at), ...(kind === 'trigger' ? [tableAfter(slice, 'from', at)] : [])];
    return targets.filter((target): target is Token => isRuleTable(target)).map((target) => `${shown} on ${target.value}`);
  }
  const found = slice.filter(isRuleTable).map((token) => `${shown} names ${token.value}`);
  if (OWNED_OBJECTS.has(kind)) {
    for (const token of slice) {
      if ((token.kind === 'word' || token.kind === 'quoted') && !isRuleTable(token) && RULE_TABLES.some((table) => token.value.startsWith(`${table}_`))) {
        found.push(`${shown} names ${token.value}, which may be ${RULE_TABLES.find((table) => token.value.startsWith(`${table}_`)) ?? ''}'s`);
      }
    }
  }
  return found;
}

/** Writes to a rule table's rows: INSERT INTO, UPDATE, DELETE FROM, MERGE INTO and COPY. */
function writeFindings(tokens: readonly Token[]): string[] {
  const found: string[] = [];
  tokens.forEach((token, index) => {
    if (token.kind !== 'word') return;
    let at: number;
    switch (token.value) {
      case 'insert':
      case 'merge':
        if (!isWord(tokens[index + 1], 'into')) return;
        at = index + 2;
        break;
      case 'delete':
        if (!isWord(tokens[index + 1], 'from')) return;
        at = index + 2;
        break;
      case 'update':
      case 'copy':
        at = index + 1;
        break;
      default:
        return;
    }
    if (isWord(tokens[at], 'only')) at += 1;
    const target = nameAt(tokens, at);
    if (target !== undefined && isRuleTable(target)) found.push(`${token.value.toUpperCase()} writes ${target.value}`);
  });
  return found;
}

/**
 * A literal's text read as SQL. A body is SQL, but a message or a format string may not be (an unpaired quote in
 * "it's"): such a text is read as its bare words, so its words still count and it never fails the migration.
 */
function literalStatements(text: string): SqlStatement[] {
  try {
    return splitSql(text);
  } catch (error) {
    if (!(error instanceof SqlReadError)) throw error;
    return [{ text, tokens: (text.match(/[A-Za-z_][A-Za-z0-9_$]*/g) ?? []).map((word) => ({ kind: 'word' as const, value: word.toLowerCase() })) }];
  }
}

/** Where a finding was made: the statement itself, its body, or SQL within its body. */
const WHERE = ['', ' in its body', ' in a nested body'];

/** What one statement does to the rule tables, its routine and DO bodies and its dynamic SQL included. */
function statementFindings(tokens: readonly Token[], depth: number, objects: RuleTableObjects): string[] {
  const start = ddlStart(tokens);
  const slice = start === -1 ? [] : tokens.slice(start);
  const where = WHERE[Math.min(depth, WHERE.length - 1)] ?? '';
  const found = [
    ...writeFindings(tokens),
    ...(start === -1 ? [] : [...ddlFindings(slice), ...routineFindings(slice, objects), ...grantFindings(slice, objects)]),
    ...(depth > 0 ? computedExecuteFindings(tokens) : []),
  ].map((finding) => `${finding}${where}`);
  if (depth >= MAX_DEPTH) return found;
  const routine = (isWord(slice[0], 'create') && ROUTINES.has(objectKind(slice).kind)) || isWord(tokens[0], 'do');
  // EXECUTE in a body is PL/pgSQL's dynamic SQL; at the top level it is GRANT EXECUTE or a trigger's EXECUTE FUNCTION.
  const dynamic = depth > 0 && tokens.some((token) => isWord(token, 'execute'));
  for (const token of tokens) {
    if (token.kind === 'literal' && (token.dollar || routine || dynamic)) {
      for (const inner of literalStatements(token.value)) found.push(...statementFindings(inner.tokens, depth + 1, objects));
    }
  }
  if (dynamic) {
    const words = new Set(
      tokens
        .flatMap((token) => (token.kind === 'literal' ? literalStatements(token.value).flatMap((inner) => inner.tokens) : [token]))
        .filter((token) => token.kind === 'word' || token.kind === 'quoted')
        .map((token) => token.value),
    );
    const verbs = [...words].filter((word) => DDL_VERBS.has(word) || ['insert', 'update', 'delete', 'merge', 'copy'].includes(word));
    const tables = RULE_TABLES.filter((table) => words.has(table));
    if (verbs.length > 0 && tables.length > 0) found.push(`dynamic SQL (EXECUTE) names ${tables.join(', ')} beside ${verbs.map((verb) => verb.toUpperCase()).join(', ')}${where}`);
  }
  return found;
}

/** What the migrations make of the rule tables, which a later statement can change without naming a rule table. */
export interface RuleTableObjects {
  /** Each function a trigger on a rule table executes, by its name in lower case, with those tables. */
  readonly triggerFunctions: ReadonlyMap<string, readonly string[]>;
  /** Each view whose query reads a rule table, with those tables: a write granted on an updatable view writes them. */
  readonly views: ReadonlyMap<string, readonly string[]>;
}

const NO_OBJECTS: RuleTableObjects = { triggerFunctions: new Map(), views: new Map() };

const ROUTINE_KINDS = new Set(['function', 'procedure', 'routine']);
const WRITE_PRIVILEGES = new Set(['insert', 'update', 'delete', 'truncate', 'all']);
const WRITE_VERBS = ['insert', 'update', 'delete', 'merge', 'copy'];

/** The trigger functions and views of the rule tables that the given migrations create. */
export function ruleTableObjects(migrations: readonly string[]): RuleTableObjects {
  const triggerFunctions = new Map<string, string[]>();
  const views = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, name: string, table: string) => {
    const list = map.get(name) ?? [];
    if (!list.includes(table)) map.set(name, [...list, table].sort());
  };
  for (const sql of migrations) {
    for (const statement of splitSql(sql)) {
      const start = ddlStart(statement.tokens);
      const slice = start === -1 ? [] : statement.tokens.slice(start);
      if (!isWord(slice[0], 'create')) continue;
      const { kind, at } = objectKind(slice);
      if (kind === 'trigger') {
        const table = tableAfter(slice, 'on', at);
        const execute = slice.findIndex((token, index) => isWord(token, 'execute') && isWord(slice[index + 1], 'function', 'procedure'));
        const routine = execute === -1 ? undefined : nameAt(slice, execute + 2);
        if (table !== undefined && isRuleTable(table) && routine !== undefined) add(triggerFunctions, routine.value, table.value);
      } else if (kind === 'view') {
        let named = at + 1;
        while (isWord(slice[named], 'if', 'not', 'exists')) named += 1;
        const view = nameAt(slice, named);
        if (view === undefined) continue;
        for (const table of RULE_TABLES) {
          if (slice.some((token, index) => index > named && isRuleTable(token) && token.value === table)) add(views, view.value, table);
        }
      }
    }
  }
  return { triggerFunctions, views };
}

/** The names a statement lists after `from`, at the top level and separated by commas, until one of `until`. */
function listedNames(slice: readonly Token[], from: number, until: readonly string[]): Token[] {
  const names: Token[] = [];
  let depth = 0;
  let expecting = true;
  for (let index = from; index < slice.length; index += 1) {
    const token = slice[index];
    if (token?.kind === 'punct' && token.value === '(') depth += 1;
    else if (token?.kind === 'punct' && token.value === ')') depth -= 1;
    else if (depth === 0 && token?.kind === 'punct' && token.value === ',') expecting = true;
    else if (depth === 0 && isWord(token, ...until)) break;
    else if (depth === 0 && expecting && (token?.kind === 'word' || token?.kind === 'quoted')) {
      const name = nameAt(slice, index);
      if (name !== undefined) names.push(name);
      expecting = false;
    }
  }
  return names;
}

/** CREATE OR REPLACE, ALTER or DROP of a function that a trigger on a rule table executes: it changes that table's behaviour. */
function routineFindings(slice: readonly Token[], objects: RuleTableObjects): string[] {
  const verb = slice[0]?.value ?? '';
  if (!['create', 'alter', 'drop'].includes(verb)) return [];
  const { kind, at } = objectKind(slice);
  if (!ROUTINE_KINDS.has(kind)) return [];
  if (verb === 'create' && !slice.slice(1, at).some((token) => isWord(token, 'replace'))) return [];
  let first = at + 1;
  while (isWord(slice[first], 'if', 'exists')) first += 1;
  const names = verb === 'drop' ? listedNames(slice, first, ['cascade', 'restrict']) : [nameAt(slice, first)].filter((name): name is Token => name !== undefined);
  return names.flatMap((name) => {
    const tables = objects.triggerFunctions.get(name.value);
    return tables === undefined ? [] : [`${verb.toUpperCase()} ${kind.toUpperCase()} ${name.value}, which a trigger on ${tables.join(', ')} executes`];
  });
}

/** A GRANT or REVOKE on every table of a schema, or of a write on a view that reads a rule table. */
function grantFindings(slice: readonly Token[], objects: RuleTableObjects): string[] {
  const verb = slice[0]?.value ?? '';
  if (verb !== 'grant' && verb !== 'revoke') return [];
  const on = slice.findIndex((token) => isWord(token, 'on'));
  if (on === -1) return [];
  if (isWord(slice[on + 1], 'all') && isWord(slice[on + 2], 'tables') && isWord(slice[on + 3], 'in') && isWord(slice[on + 4], 'schema')) {
    return [`${verb.toUpperCase()} on every table of a schema, the rule tables among them`];
  }
  const privileges = slice.slice(1, on).filter((token) => token.kind === 'word' && WRITE_PRIVILEGES.has(token.value)).map((token) => token.value.toUpperCase());
  if (privileges.length === 0) return [];
  const targets = listedNames(slice, isWord(slice[on + 1], 'table') ? on + 2 : on + 1, ['to', 'from']);
  return targets.flatMap((target) => {
    const tables = objects.views.get(target.value);
    return tables === undefined ? [] : [`${verb.toUpperCase()} ${privileges.join(', ')} on ${target.value}, a view that reads ${tables.join(', ')} (an updatable view writes through to them)`];
  });
}

/**
 * EXECUTE in a body whose SQL is built from values read at run time (a variable, a concatenation or a format's
 * arguments) and holds DDL or a write, or whose SQL is wholly built elsewhere: the objects it reaches cannot be read
 * here, and may be rule tables or their trigger functions, so it fails closed. EXECUTE of one literal is read as SQL
 * (statementFindings), and a format whose own text only reads is let through.
 */
function computedExecuteFindings(tokens: readonly Token[]): string[] {
  const found: string[] = [];
  tokens.forEach((token, index) => {
    if (!isWord(token, 'execute') || isWord(tokens[index + 1], 'function', 'procedure', 'on') || isWord(tokens[index - 1], 'grant', 'revoke')) return;
    const rest = tokens.slice(index + 1);
    const using = rest.findIndex((item) => isWord(item, 'using', 'into'));
    const argument = using === -1 ? rest : rest.slice(0, using);
    if (argument.length === 1 && argument[0]?.kind === 'literal') return;
    const literals = argument.filter((item): item is Extract<Token, { kind: 'literal' }> => item.kind === 'literal');
    const verbs = [...new Set(literals.flatMap((literal) => literalStatements(literal.value).flatMap((inner) => inner.tokens)).filter((item) => item.kind === 'word' && (DDL_VERBS.has(item.value) || WRITE_VERBS.includes(item.value))).map((item) => item.value.toUpperCase()))];
    if (literals.length === 0) {
      found.push('dynamic SQL (EXECUTE) runs SQL built elsewhere, which this check cannot read');
    } else if (verbs.length > 0) {
      found.push(`dynamic SQL (EXECUTE) builds ${verbs.join(', ')} from values read at run time, so the objects it reaches cannot be read`);
    }
  });
  return found;
}

export interface RuleTableStatement {
  /** The statement's position in its file, from 1. */
  readonly index: number;
  readonly text: string;
  readonly findings: readonly string[];
}

/** The statements of a migration that touch a rule table, each with what it does to it. */
export function ruleTableStatements(sql: string, objects: RuleTableObjects = NO_OBJECTS): RuleTableStatement[] {
  return splitSql(sql).flatMap((statement, index) => {
    const findings = [...new Set(statementFindings(statement.tokens, 0, objects))];
    return findings.length === 0 ? [] : [{ index: index + 1, text: statement.text, findings }];
  });
}

// ---------------------------------------------------------------------------------------------
// The repository: the pull request's diff from its merge base

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** HEAD's text of a file, or null when HEAD holds none. */
function headFile(root: string, file: string): string | null {
  return git(root, ['ls-tree', '--name-only', 'HEAD', '--', file]).trim() === '' ? null : git(root, ['show', `HEAD:${file}`]);
}

export interface RepositoryInput extends FreezeInput {
  /** `git diff --stat` of the engine's non-test files, for the job summary. */
  readonly engineStat: string;
  /** What could not be read from the repository, each a problem. */
  readonly readProblems: readonly string[];
}

/** The files a commit holds under a directory, by path. */
function filesAt(root: string, commit: string, dir: string): string[] {
  return git(root, ['ls-tree', '-r', '--name-only', '-z', commit, '--', dir])
    .split('\0')
    .filter((file) => file !== '');
}

/** The release directories the golden claims at `base` pin (inputs.release.dir); a claim that cannot be read is a problem. */
export function pinnedReleaseDirs(root: string, base: string): { readonly dirs: readonly string[]; readonly problems: readonly string[] } {
  const dirs = new Set<string>();
  const problems: string[] = [];
  for (const file of filesAt(root, base, GOLDEN_CLAIMS_DIR).filter((name) => name.endsWith('.json'))) {
    try {
      const claim = JSON.parse(git(root, ['show', `${base}:${file}`])) as { inputs?: { release?: { dir?: unknown } } };
      const dir = claim.inputs?.release?.dir;
      if (typeof dir !== 'string' || dir === '') throw new Error('it names no inputs.release.dir');
      dirs.add(dir.replace(/\/+$/, ''));
    } catch (error) {
      problems.push(`${file} at the base: cannot read the release it pins (${error instanceof Error ? error.message : String(error)}), so the releases the golden claims pin cannot be held`);
    }
  }
  return { dirs: [...dirs].sort(), problems };
}

/** The pull request's changes from `base` to HEAD, as the freeze reads them. */
export function readRepository(root: string, base: string): RepositoryInput {
  const listed = git(root, ['diff', '--name-status', '--no-renames', '-z', base, 'HEAD']).split('\0');
  const changes: Change[] = [];
  for (let index = 0; index + 1 < listed.length; index += 2) {
    changes.push({ status: listed[index] ?? '', path: listed[index + 1] ?? '' });
  }
  const pinned = pinnedReleaseDirs(root, base);
  const migrations = filesAt(root, 'HEAD', MIGRATIONS_DIR).filter((file) => file.endsWith('.sql'));
  let objects: RuleTableObjects = NO_OBJECTS;
  const readProblems = [...pinned.problems];
  try {
    objects = ruleTableObjects(migrations.map((file) => git(root, ['show', `HEAD:${file}`])));
  } catch (error) {
    readProblems.push(`the migrations cannot be read as SQL, so the rule tables' trigger functions and views cannot be found (${error instanceof Error ? error.message : String(error)})`);
  }
  return {
    changes,
    exceptionText: headFile(root, EXCEPTION_FILE),
    exceptionChanged: git(root, ['diff', '--name-only', '--no-renames', base, 'HEAD', '--', EXCEPTION_FILE]).trim() !== '',
    migrationText: (file) => git(root, ['show', `HEAD:${file}`]),
    pinnedReleases: pinned.dirs,
    ruleTableObjects: objects,
    engineStat: git(root, ['diff', '--stat', base, 'HEAD', '--', ...ENGINE_PATHSPEC]),
    readProblems,
  };
}

/**
 * Where each workspace package that depends on @tp/pricing resolves it and @tp/pricing/testing: a problem unless that
 * is packages/pricing/src, as installed (CI runs the check after pnpm install). A package that redirects the engine (an
 * export, a link or an override pointing elsewhere) would run another engine than the one this freeze holds.
 */
export function engineResolutionProblems(root: string): string[] {
  const problems: string[] = [];
  const packageDirs = ['apps', 'packages']
    .flatMap((group) => (existsSync(path.join(root, group)) ? readdirSync(path.join(root, group)).map((name) => path.join(group, name)) : []))
    .concat(['infra', 'tools'])
    .filter((dir) => existsSync(path.join(root, dir, 'package.json')))
    .sort();
  for (const dir of packageDirs) {
    const manifest = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8')) as { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (manifest.name === '@tp/pricing' || (manifest.dependencies?.['@tp/pricing'] ?? manifest.devDependencies?.['@tp/pricing']) === undefined) continue;
    const require = createRequire(path.join(root, dir, 'package.json'));
    for (const [specifier, file] of Object.entries(ENGINE_ENTRY_POINTS)) {
      let resolved: string;
      try {
        resolved = realpathSync(require.resolve(specifier));
      } catch (error) {
        problems.push(`${dir} cannot resolve ${specifier} (${error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error)}); run pnpm install`);
        continue;
      }
      if (resolved !== realpathSync(path.join(root, file))) {
        problems.push(`${dir} resolves ${specifier} to ${path.relative(root, resolved)}, not ${file}: every consumer of the engine runs packages/pricing/src`);
      }
    }
  }
  return problems;
}

const EXCEPTION_WORDS: Readonly<Record<ExceptionState, string>> = {
  applies: 'applies: this pull request adds or edits it',
  stale: 'stale and ignored: this pull request does not change it',
  none: 'none declared',
  'another pull request': 'does not apply: it names another pull request',
};

/** The job summary's "Engine freeze" section. */
export function summary(base: string, engineStat: string, report: FreezeReport): string {
  const list = (items: readonly string[], none: string) => (items.length === 0 ? `${none}\n` : items.map((item) => `- ${item}\n`).join(''));
  return [
    '## Engine freeze\n\n',
    `Against the merge base \`${base}\`. The exception (\`${EXCEPTION_FILE}\`): ${EXCEPTION_WORDS[report.exception]}.\n\n`,
    `\`git diff --stat ${base} HEAD -- ${ENGINE_PATHSPEC.map((spec) => `'${spec}'`).join(' ')}\`:\n\n`,
    '```text\n',
    engineStat.trim() === '' ? '(no non-test file under packages/pricing/src changes)\n' : `${engineStat.trimEnd()}\n`,
    '```\n\n',
    '### Let through by the exception\n\n',
    list(report.allowed, 'Nothing.'),
    '\n### Problems\n\n',
    list(report.problems, 'None.'),
  ].join('');
}

/**
 * `tsx tools/engine-freeze/check.ts [<base>]`: the base defaults to ENGINE_FREEZE_BASE, and PR_NUMBER names the pull
 * request the exception must name (CI sets both; in CI a missing PR_NUMBER is refused). Exits 1 on a problem.
 */
export function main(argv: readonly string[], env: NodeJS.ProcessEnv, root = repositoryRoot): number {
  const base = argv[0] ?? env.ENGINE_FREEZE_BASE ?? '';
  if (base === '') {
    process.stderr.write('usage: tsx tools/engine-freeze/check.ts <merge base>   (or set ENGINE_FREEZE_BASE)\n');
    return 2;
  }
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  } catch {
    process.stderr.write(`engine-freeze: ${base} is not a commit in this repository (CI checks out with fetch-depth 0)\n`);
    return 2;
  }
  const number = (env.PR_NUMBER ?? '').trim();
  const inCi = env.CI !== undefined && env.CI !== '' && env.CI !== 'false';
  if (number === '' ? inCi : !/^[1-9]\d*$/.test(number)) {
    process.stderr.write(`engine-freeze: PR_NUMBER is ${number === '' ? 'not set' : `"${number}", not a pull request number`}; CI sets it to the pull request's number, which the exception must name\n`);
    return 2;
  }
  const repository = readRepository(root, base);
  const input: RepositoryInput = { ...repository, pullRequest: number === '' ? null : Number(number) };
  const checked = checkFreeze(input);
  const report: FreezeReport = { ...checked, problems: [...input.readProblems, ...checked.problems, ...engineResolutionProblems(root)] };
  const text = summary(base, input.engineStat, report);
  process.stdout.write(text);
  if (env.GITHUB_STEP_SUMMARY !== undefined && env.GITHUB_STEP_SUMMARY !== '') {
    appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  }
  for (const problem of report.problems) {
    process.stderr.write(`engine-freeze: ${problem}\n`);
  }
  return report.problems.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
