import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { repositoryRoot } from '../content-files';
import {
  type Change,
  EXCEPTION_FILE,
  type FreezeException,
  type FreezeInput,
  RULE_TABLE_CATALOG,
  RULING_ENGINE_FILES,
  type RuleTableObjects,
  SqlReadError,
  checkFreeze,
  engineResolutionProblems,
  exceptionSchema,
  goldenPattern,
  main,
  pinnedReleaseDirs,
  readRepository,
  ruleTableObjects,
  ruleTableStatements,
  splitSql,
  summary,
} from './check';

/** The exception PR 6b-1 declares: the five engine files of the 2026-10-18 ruling, G196-G199, two golden documents. */
const SIX_B_ONE: FreezeException = {
  ruling: "The founder's ruling of 2026-10-18 11:47 UTC",
  pull_request: 35,
  engine_files: [...RULING_ENGINE_FILES],
  golden_added: ['fixtures/golden/claims/G196-*', 'fixtures/golden/claims/G197-*', 'fixtures/golden/claims/G198-*', 'fixtures/golden/claims/G199-*'],
  golden_edited: ['fixtures/golden/QUESTIONS.md', 'fixtures/golden/README.md'],
  rule_table_ddl: [],
};

/** Every change PR 6b-1 makes that its exception lets through, so no entry of it is unused. */
const SIX_B_ONE_CHANGES: readonly Change[] = [
  ...RULING_ENGINE_FILES.map((file) => ({ status: 'M', path: `packages/pricing/src/${file}` })),
  ...['G196', 'G197', 'G198', 'G199'].map((claim) => ({ status: 'A', path: `fixtures/golden/claims/${claim}-zip-plus-four.json` })),
  { status: 'M', path: 'fixtures/golden/QUESTIONS.md' },
  { status: 'M', path: 'fixtures/golden/README.md' },
];

const WIDEN = "ALTER TABLE rule_record DROP CONSTRAINT rule_record_record_type_check, ADD CONSTRAINT rule_record_record_type_check CHECK (record_type IN ('locality_map', 'locality_map_plus_four'))";
const MIGRATION = 'packages/db/migrations/20261105090000_pricing_location.sql';

/** An exception as PR 6b-2 declares one: no engine or golden change, one statement on a rule table. */
const SIX_B_TWO: FreezeException = { ruling: "The founder's answer to PR 6b's Q3 (a)", pull_request: 36, engine_files: [], golden_added: [], golden_edited: [], rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN }] };

interface Case {
  readonly changes: readonly Change[];
  readonly exception?: FreezeException | string | null;
  readonly changed?: boolean;
  readonly migrations?: Readonly<Record<string, string>>;
  readonly pullRequest?: number | null;
  readonly pinnedReleases?: readonly string[];
  readonly objects?: RuleTableObjects;
}

function run({ changes, exception = null, changed = true, migrations = {}, pullRequest = null, pinnedReleases = [], objects }: Case) {
  const input: FreezeInput = {
    changes,
    exceptionText: exception === null ? null : typeof exception === 'string' ? exception : JSON.stringify(exception),
    exceptionChanged: changed,
    migrationText: (file) => {
      const text = migrations[file];
      if (text === undefined) throw new Error(`no text for ${file}`);
      return text;
    },
    pullRequest,
    pinnedReleases,
    ...(objects === undefined ? {} : { ruleTableObjects: objects }),
  };
  return checkFreeze(input);
}

/** The problems about the changes themselves, without the exception's unused entries. */
const changeProblems = (report: { readonly problems: readonly string[] }) => report.problems.filter((problem) => !problem.startsWith(`${EXCEPTION_FILE}: lists `));

const A = (file: string): Change => ({ status: 'A', path: file });
const M = (file: string): Change => ({ status: 'M', path: file });
const D = (file: string): Change => ({ status: 'D', path: file });
const T = (file: string): Change => ({ status: 'T', path: file });

describe('the engine freeze', () => {
  it('passes a pull request that touches none of it, with or without an exception', () => {
    const changes = [M('apps/web/src/page.tsx'), A('packages/rules/src/parsers/locality-plus-four.ts'), A('fixtures/synthetic/rules/release-synth-900006/MANIFEST.json')];
    expect(run({ changes })).toEqual({ exception: 'none', allowed: [], unused: [], problems: [] });
    expect(run({ changes, exception: SIX_B_ONE, changed: false }).problems).toEqual([]);
  });

  it('lets the five engine files of the ruling through under the exception of the pull request that adds or edits it and names it, and never reads a test file', () => {
    const changes = [...SIX_B_ONE_CHANGES, M('packages/pricing/src/engine.test.ts'), A('packages/pricing/src/plus-four.test.ts')];
    for (const pullRequest of [35, null]) {
      const report = run({ changes, exception: SIX_B_ONE, pullRequest });
      expect(report.exception).toBe('applies');
      expect(report.problems).toEqual([]);
      expect(report.unused).toEqual([]);
      expect(report.allowed.slice(0, 5)).toEqual(RULING_ENGINE_FILES.map((file) => `packages/pricing/src/${file} (modified): engine_files`));
    }
  });

  it('refuses an entry of the exception that nothing in the pull request uses: an exception lists exactly its own changes', () => {
    const report = run({ changes: RULING_ENGINE_FILES.map((file) => M(`packages/pricing/src/${file}`)), exception: SIX_B_ONE, pullRequest: 35 });
    expect(report.unused).toEqual([...SIX_B_ONE.golden_added.map((item) => `golden_added ${item}`), ...SIX_B_ONE.golden_edited.map((item) => `golden_edited ${item}`)]);
    expect(report.problems).toEqual(
      report.unused.map((entry) => `${EXCEPTION_FILE}: lists ${entry}, which nothing in this pull request uses; an exception lists exactly the changes of the pull request it names`),
    );
  });

  it('applies the exception only in the pull request it names: one carried into a later pull request by a one-byte or mode-only edit lets nothing through', () => {
    // After PR 6b-1 merges, pull request 40 changes the engine and touches exception.json (a space in the ruling, or
    // chmod +x): the file is in its diff, but it names pull request 35.
    const report = run({ changes: [M('packages/pricing/src/engine.ts'), M(EXCEPTION_FILE)], exception: { ...SIX_B_ONE, ruling: `${SIX_B_ONE.ruling} ` }, pullRequest: 40 });
    expect(report.exception).toBe('another pull request');
    expect(report.allowed).toEqual([]);
    expect(report.problems).toEqual([
      `${EXCEPTION_FILE}: names pull request 35, and this is pull request 40: an exception applies only in the pull request it names, which adds or edits it`,
      `packages/pricing/src/engine.ts (modified): a non-test file under packages/pricing/src changes, and ${EXCEPTION_FILE} names another pull request, so it does not apply here`,
    ]);
    // Rewritten to name pull request 40, it still lets through only what pull request 40 changes, every entry used.
    const rewritten = run({ changes: [M('packages/pricing/src/engine.ts'), M(EXCEPTION_FILE)], exception: { ...SIX_B_ONE, pull_request: 40 }, pullRequest: 40 });
    expect(rewritten.exception).toBe('applies');
    expect(rewritten.problems).toHaveLength(SIX_B_ONE.engine_files.length - 1 + SIX_B_ONE.golden_added.length + SIX_B_ONE.golden_edited.length);
  });

  it('freezes the engine’s whole package: its manifest, its TypeScript settings and any file beside src, exception or not, but not a test', () => {
    const outside = [M('packages/pricing/package.json'), M('packages/pricing/tsconfig.json'), A('packages/pricing/engine2/index.ts'), A('packages/pricing/engine2/engine.ts')];
    const report = run({ changes: [...outside, A('packages/pricing/engine2/engine.test.ts'), ...SIX_B_ONE_CHANGES], exception: SIX_B_ONE });
    expect(report.problems).toEqual(
      outside.map(
        (change) =>
          `${change.path} (${change.status === 'A' ? 'added' : 'modified'}): a file of packages/pricing outside src changes; the engine's package (its manifest, its TypeScript settings and anything beside src) is frozen with the engine, exception or not, so its consumers keep running packages/pricing/src`,
      ),
    );
  });

  it('refuses an engine path outside the list: testing.ts, index.ts, release.ts, a new module, a deletion', () => {
    const changes = [M('packages/pricing/src/testing.ts'), M('packages/pricing/src/index.ts'), M('packages/pricing/src/release.ts'), A('packages/pricing/src/plus-four.ts'), D('packages/pricing/src/windows.ts')];
    const problems = changeProblems(run({ changes, exception: SIX_B_ONE }));
    expect(problems).toEqual([
      'packages/pricing/src/testing.ts (modified): a non-test file under packages/pricing/src changes, and the exception does not list it under engine_files',
      'packages/pricing/src/index.ts (modified): a non-test file under packages/pricing/src changes, and the exception does not list it under engine_files',
      'packages/pricing/src/release.ts (modified): a non-test file under packages/pricing/src changes, and the exception does not list it under engine_files',
      'packages/pricing/src/plus-four.ts (added): a non-test file under packages/pricing/src changes, and the exception does not list it under engine_files',
      'packages/pricing/src/windows.ts (deleted): a non-test file under packages/pricing/src changes, and the exception does not list it under engine_files',
    ]);
  });

  it('ignores a stale exception: a later pull request, or a base merge, runs with none, so any engine diff fails until it declares its own', () => {
    const changes = [M('packages/pricing/src/engine.ts'), A('fixtures/golden/claims/G196-zip-plus-four.json')];
    const stale = run({ changes, exception: SIX_B_ONE, changed: false });
    expect(stale.exception).toBe('stale');
    expect(stale.allowed).toEqual([]);
    expect(stale.problems).toEqual([
      `packages/pricing/src/engine.ts (modified): a non-test file under packages/pricing/src changes, and ${EXCEPTION_FILE} is unchanged in this pull request, so it is stale and does not apply (an exception applies only in the pull request that adds or edits it)`,
      `fixtures/golden/claims/G196-zip-plus-four.json (added): a file added under fixtures/golden, and ${EXCEPTION_FILE} is unchanged in this pull request, so it is stale and does not apply (an exception applies only in the pull request that adds or edits it)`,
    ]);
    // A later pull request after the file is gone, and one that never had it.
    expect(run({ changes: [M('packages/pricing/src/engine.ts')] }).problems).toEqual([
      `packages/pricing/src/engine.ts (modified): a non-test file under packages/pricing/src changes, and no exception is declared (${EXCEPTION_FILE})`,
    ]);
  });

  it('refuses a modified, deleted or retyped golden claim, diff or source, exception or not', () => {
    const changes = [
      M('fixtures/golden/claims/G01-prd11-worked-example.json'),
      D('fixtures/golden/claims/G02-prd11-worked-example-commercial-110.worksheet.md'),
      T('fixtures/golden/diffs/D001-phase-one-ncci-ptp-review-flags.json'),
      M('fixtures/golden/sources/GPCI_SYNTHETIC_2025.csv'),
    ];
    for (const exception of [SIX_B_ONE, { ...SIX_B_ONE, golden_added: ['fixtures/golden/claims/*', 'fixtures/golden/diffs/*', 'fixtures/golden/sources/*'] }, null]) {
      const problems = changeProblems(run({ changes, exception }));
      expect(problems).toHaveLength(4);
      for (const problem of problems) expect(problem).toContain('an existing golden file never changes, exception or not (fixtures/golden/claims, diffs and sources)');
    }
  });

  it('lets an added claim through only by golden_added: G196-G199 and their worksheets, not G200 nor a file in a directory below', () => {
    const added = ['G196-zip-plus-four-locality-01.json', 'G196-zip-plus-four-locality-01.worksheet.md', 'G197-x.json', 'G198-x.json', 'G199-x.json'].map((name) => A(`fixtures/golden/claims/${name}`));
    const refused = [A('fixtures/golden/claims/G200-x.json'), A('fixtures/golden/claims/extra/G196-x.json'), A('fixtures/golden/claims/G1960-x.json'), A('fixtures/golden/diffs/D002-x.json')];
    const report = run({ changes: [...added, ...refused], exception: SIX_B_ONE });
    expect(report.allowed).toHaveLength(added.length);
    expect(changeProblems(report)).toEqual(refused.map((change) => `${change.path} (added): a file added under fixtures/golden, and the exception does not list it under golden_added`));
    expect(goldenPattern('fixtures/golden/claims/G196-*').test('fixtures/golden/claims/G196-a.b.json')).toBe(true);
    expect(goldenPattern('fixtures/golden/claims/G1.6-*').test('fixtures/golden/claims/G196-a')).toBe(false);
  });

  it('lets QUESTIONS.md and README.md be edited under golden_edited only, refuses any other golden edit, and with no exception refuses any change to fixtures/golden', () => {
    const changes = [M('fixtures/golden/QUESTIONS.md'), M('fixtures/golden/README.md'), M('fixtures/golden/OTHER.md'), D('fixtures/golden/QUESTIONS.md'), A('fixtures/golden/NOTES.md')];
    expect(changeProblems(run({ changes, exception: SIX_B_ONE }))).toEqual([
      'fixtures/golden/OTHER.md (modified): a golden file is edited, and the exception does not list it under golden_edited',
      'fixtures/golden/QUESTIONS.md (deleted): an existing golden file never changes, exception or not (only an edit listed in golden_edited is allowed outside them)',
      'fixtures/golden/NOTES.md (added): a file added under fixtures/golden, and the exception does not list it under golden_added',
    ]);
    expect(run({ changes: [M('fixtures/golden/README.md')] }).problems).toEqual([
      `fixtures/golden/README.md (modified): a golden file is edited, and no exception is declared (${EXCEPTION_FILE})`,
    ]);
  });

  it('refuses any change to synthetic releases 900001-900005, exception or not, and leaves a new release alone', () => {
    const changes = [M('fixtures/synthetic/rules/release-synth-900001/MANIFEST.json'), A('fixtures/synthetic/rules/release-synth-900005/locality_map_plus_four/2026/ZIP9.json'), D('fixtures/synthetic/rules/release-synth-900003/RELEASE.md')];
    const problems = changeProblems(run({ changes: [...changes, A('fixtures/synthetic/rules/release-synth-900006/MANIFEST.json')], exception: SIX_B_ONE }));
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toContain('synthetic releases 900001 to 900005 never change, exception or not');
  });

  it('refuses any change to a release a golden claim at the base pins, as 900006 is once G196-G199 merge', () => {
    const change = M('fixtures/synthetic/rules/release-synth-900006/locality_map_plus_four/2026/ZIP9_SYNTHETIC.json');
    for (const exception of [SIX_B_ONE, null]) {
      expect(changeProblems(run({ changes: [change], exception, pinnedReleases: ['fixtures/synthetic/rules/release-synth-900006'] }))).toEqual([
        `${change.path} (modified): a release a golden claim at the base pins by its manifest's hash never changes, exception or not; a new release takes a new number`,
      ]);
    }
    // Before G196-G199 are at the base, 900006 is the pull request's own new release.
    expect(changeProblems(run({ changes: [change], pinnedReleases: ['fixtures/synthetic/rules/release-synth-900001'] }))).toEqual([]);
    expect(changeProblems(run({ changes: [A('fixtures/synthetic/rules/release-synth-9000060/MANIFEST.json')], pinnedReleases: ['fixtures/synthetic/rules/release-synth-900006'] }))).toEqual([]);
  });

  it('lets the rule tables’ catalog snapshot be added, changed only under an exception that lists rule_table_ddl, and never deleted', () => {
    expect(run({ changes: [A(RULE_TABLE_CATALOG)] }).problems).toEqual([]);
    expect(run({ changes: [M(RULE_TABLE_CATALOG)] }).problems).toEqual([
      `${RULE_TABLE_CATALOG} (modified): the rule tables' catalog snapshot changes, and no exception is declared (${EXCEPTION_FILE})`,
    ]);
    expect(changeProblems(run({ changes: [M(RULE_TABLE_CATALOG), ...SIX_B_ONE_CHANGES], exception: SIX_B_ONE }))).toEqual([
      `${RULE_TABLE_CATALOG} (modified): the rule tables' catalog snapshot changes, and the exception lists no rule_table_ddl`,
    ]);
    const widened = run({ changes: [M(RULE_TABLE_CATALOG), A(MIGRATION)], exception: SIX_B_TWO, migrations: { [MIGRATION]: `${WIDEN};` } });
    expect(widened.problems).toEqual([]);
    expect(widened.allowed).toContain(`${RULE_TABLE_CATALOG} (modified): rule_table_ddl (the snapshot of the catalog the listed statements change)`);
    expect(run({ changes: [D(RULE_TABLE_CATALOG), A(MIGRATION)], exception: SIX_B_TWO, migrations: { [MIGRATION]: `${WIDEN};` } }).problems).toEqual([
      `${RULE_TABLE_CATALOG} (deleted): the rule tables' catalog snapshot is never deleted; rule-tables.db.test.ts holds the migrated database to it`,
    ]);
  });

  it('refuses a malformed exception, and then applies none', () => {
    const engine = [M('packages/pricing/src/engine.ts')];
    const cases: [unknown, string][] = [
      ['{', `${EXCEPTION_FILE}: is not JSON`],
      [{ ...SIX_B_ONE, extra: true }, `${EXCEPTION_FILE}: (file): Unrecognized key`],
      [{ ...SIX_B_ONE, ruling: ' ' }, `${EXCEPTION_FILE}: ruling: names the ruling that grants the exception`],
      [{ ...SIX_B_ONE, pull_request: 0 }, `${EXCEPTION_FILE}: pull_request: names the pull request it is declared in`],
      [{ ...SIX_B_ONE, pull_request: '35' }, `${EXCEPTION_FILE}: pull_request:`],
      [(({ pull_request: _omitted, ...rest }) => rest)(SIX_B_ONE), `${EXCEPTION_FILE}: pull_request:`],
      [{ ...SIX_B_ONE, engine_files: ['engine.ts', 'testing.ts'] }, `${EXCEPTION_FILE}: engine_files.1: the founder's ruling of 2026-10-18 opened only engine.ts, reasons.ts, recompute.ts, trace.ts, types.ts`],
      [{ ...SIX_B_ONE, engine_files: ['engine.ts', 'engine.ts'] }, `${EXCEPTION_FILE}: engine_files: lists an entry twice`],
      [{ ...SIX_B_ONE, golden_added: ['fixtures/golden/../synthetic/x'] }, `${EXCEPTION_FILE}: golden_added.0: must stay inside its directory`],
      [{ ...SIX_B_ONE, golden_added: ['fixtures/other/x'] }, `${EXCEPTION_FILE}: golden_added.0: a path or pattern under fixtures/golden/`],
      [{ ...SIX_B_ONE, golden_edited: ['fixtures/golden/claims/G01-x.json'] }, `${EXCEPTION_FILE}: golden_edited.0: an existing file under fixtures/golden/claims, diffs or sources never changes`],
      [{ ...SIX_B_ONE, rule_table_ddl: [{ migration: 'packages/db/migrations/x.sql', statement: WIDEN }] }, `${EXCEPTION_FILE}: rule_table_ddl.0.migration: a migration file under packages/db/migrations/`],
      [{ ...SIX_B_ONE, rule_table_ddl: [{ migration: MIGRATION }] }, `${EXCEPTION_FILE}: rule_table_ddl.0.statement:`],
    ];
    for (const [exception, message] of cases) {
      const report = run({ changes: engine, exception: typeof exception === 'string' ? exception : JSON.stringify(exception) });
      expect(report.exception).toBe('applies');
      expect(report.allowed).toEqual([]);
      expect(report.problems[0], message).toContain(message);
      expect(report.problems.at(-1)).toContain('the exception does not list it under engine_files');
    }
  });

  it('holds the committed exception to its schema, opening only engine files of the ruling', () => {
    const committed = exceptionSchema.parse(JSON.parse(readFileSync(path.join(repositoryRoot, EXCEPTION_FILE), 'utf8')));
    for (const file of committed.engine_files) expect(RULING_ENGINE_FILES).toContain(file);
    expect(committed.ruling).toContain('2026-10-18 11:47 UTC');
    // PR 6b-2 is pull request 36: no engine or golden file, and its migration's one statement on a rule table, the
    // record-type CHECK widened by locality_map_plus_four (the founder's answer of 2026-10-21 to PR 6b's Q3 (a)).
    expect(committed.pull_request).toBe(36);
    expect([committed.engine_files, committed.golden_added, committed.golden_edited]).toEqual([[], [], []]);
    expect(committed.rule_table_ddl).toHaveLength(1);
    expect(committed.rule_table_ddl[0]?.migration).toBe('packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql');
    expect(committed.rule_table_ddl[0]?.statement).toMatch(/^ALTER TABLE rule_record DROP CONSTRAINT rule_record_record_type_check, ADD CONSTRAINT rule_record_record_type_check CHECK \(record_type IN \(.*'locality_map_plus_four'.*\)\)$/);
  });

  it('writes the job summary under "Engine freeze": the base, the exception, the engine diff stat, what it let through and the problems', () => {
    const report = run({ changes: [M('packages/pricing/src/engine.ts'), M('packages/pricing/src/index.ts')], exception: SIX_B_ONE });
    const text = summary('abc123', ' packages/pricing/src/engine.ts | 12 ++++++++++--\n 1 file changed\n', report);
    expect(text).toContain('## Engine freeze\n\nAgainst the merge base `abc123`. The exception (`tools/engine-freeze/exception.json`): applies: this pull request adds or edits it.');
    expect(text).toContain("`git diff --stat abc123 HEAD -- 'packages/pricing/src' ':!**/*.test.ts'`:\n\n```text\n packages/pricing/src/engine.ts | 12 ++++++++++--\n 1 file changed\n```");
    expect(text).toContain('### Let through by the exception\n\n- packages/pricing/src/engine.ts (modified): engine_files\n');
    expect(text).toContain(`### Problems\n\n- packages/pricing/src/index.ts (modified)`);
    expect(text).toContain(`- ${EXCEPTION_FILE}: lists engine_files reasons.ts, which nothing in this pull request uses;`);
    expect(summary('abc123', '', run({ changes: [M(EXCEPTION_FILE)], exception: SIX_B_ONE, pullRequest: 40 }))).toContain('does not apply: it names another pull request');
    const quiet = summary('abc123', '', run({ changes: [] }));
    expect(quiet).toContain('none declared');
    expect(quiet).toContain('(no non-test file under packages/pricing/src changes)');
    expect(quiet).toContain('### Let through by the exception\n\nNothing.\n');
    expect(quiet).toContain('### Problems\n\nNone.\n');
    expect(quiet).not.toContain('unused');
  });
});

describe('the rule tables: no migration touches rule_release, rule_record or rule_release_withdrawal', () => {
  it('refuses a migration that adds DDL on a rule table, under no exception, a stale one, or one that does not name it', () => {
    const migrations = { [MIGRATION]: `-- The rule type CHECK (Q3 (a)).\n${WIDEN.replace(', ADD', ',\n  ADD')};\n` };
    const message = `${MIGRATION} statement 1: ALTER TABLE names rule_record. No DDL touches rule_release, rule_record or rule_release_withdrawal (reconciliation-001), and`;
    const cases: [FreezeException | null, boolean, string][] = [
      [null, true, `no exception is declared (${EXCEPTION_FILE})`],
      [{ ...SIX_B_ONE, rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN }] }, false, `${EXCEPTION_FILE} is unchanged in this pull request`],
      [SIX_B_ONE, true, 'the exception does not list it under rule_table_ddl'],
    ];
    for (const [exception, changed, why] of cases) {
      const problems = changeProblems(run({ changes: [A(MIGRATION)], exception, changed, migrations }));
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(`${message} ${why}`);
      expect(problems[0]).toContain(`The statement, as an exception names it: ${WIDEN}`);
    }
  });

  it('lets through the one statement the exception names, exactly as printed, and nothing else in the same migration', () => {
    const exception = { ...SIX_B_ONE, engine_files: [], golden_added: [], golden_edited: [], rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN }] };
    const migrations = { [MIGRATION]: `/* Q3 (a) */ ${WIDEN.replaceAll(' ', '\n  ')};\nCREATE TABLE practice_site (practice_id uuid PRIMARY KEY);\nGRANT SELECT ON rule_record TO tp_screening;\n` };
    const report = run({ changes: [A(MIGRATION), M('packages/pricing/src/engine.ts')], exception, migrations });
    expect(report.allowed).toEqual([`${MIGRATION} statement 1: rule_table_ddl (ALTER TABLE names rule_record)`]);
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]).toContain(`${MIGRATION} statement 3: GRANT names rule_record.`);
    expect(report.problems[1]).toBe('packages/pricing/src/engine.ts (modified): a non-test file under packages/pricing/src changes, and the exception does not list it under engine_files');
  });

  it('refuses an exception statement no added migration holds, a near miss included, and a migration it cannot read', () => {
    const exception = { ...SIX_B_TWO, rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN.replace('locality_map_plus_four', 'locality_map_plus4') }] };
    const report = run({ changes: [A(MIGRATION)], exception, migrations: { [MIGRATION]: `${WIDEN};` } });
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]).toContain(`${MIGRATION} statement 1: ALTER TABLE names rule_record.`);
    expect(report.problems[1]).toBe(`${EXCEPTION_FILE}: rule_table_ddl names a statement that no migration this pull request adds holds, exactly as written (${MIGRATION}): ${exception.rule_table_ddl[0]?.statement ?? ''}`);
    expect(run({ changes: [A(MIGRATION)], migrations: { [MIGRATION]: "SELECT 'unclosed;" } }).problems).toEqual([
      `${MIGRATION}: cannot be read as SQL, so the rule tables cannot be checked (a string literal is never closed)`,
    ]);
  });

  it('reads migrations the pull request adds or changes, and not one it deletes or anything outside the migrations directory', () => {
    const other = 'packages/db/migrations/20261015120000_rule_content.sql';
    const migrations = { [MIGRATION]: 'ALTER TABLE rule_release ADD COLUMN x int;', [other]: 'DROP TABLE rule_record;', 'docs/notes.sql': 'DROP TABLE rule_record;' };
    const { problems } = run({ changes: [A(MIGRATION), M(other), D('packages/db/migrations/20261016090000_documents_payers_plans.sql'), A('docs/notes.sql')], migrations });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(new RegExp(`^${MIGRATION} statement 1: ALTER TABLE names rule_release\\.`));
    expect(problems[1]).toMatch(new RegExp(`^${other} statement 1: DROP TABLE names rule_record\\.`));
  });
});

describe('reading PostgreSQL', () => {
  it('splits at semicolons outside comments, literals, quoted identifiers and dollar quotes, and collapses white space outside literals', () => {
    const sql = [
      "-- a comment; with a semicolon\nSELECT 'a;b', 'it''s', E'x\\';y' /* block; /* nested; */ still */ FROM \"weird;name\";",
      'CREATE FUNCTION f(x int) RETURNS int LANGUAGE plpgsql AS $body$ BEGIN RETURN $1; END $body$;',
      'DO $$ BEGIN PERFORM 1; END $$;',
      "SELECT  'two\n  lines'  ,\t1",
    ].join('\n');
    expect(splitSql(sql).map((statement) => statement.text)).toEqual([
      "SELECT 'a;b', 'it''s', E'x\\';y' FROM \"weird;name\"",
      'CREATE FUNCTION f(x int) RETURNS int LANGUAGE plpgsql AS $body$ BEGIN RETURN $1; END $body$',
      'DO $$ BEGIN PERFORM 1; END $$',
      "SELECT 'two\n  lines' , 1",
    ]);
    const tokens = splitSql(sql)[0]?.tokens ?? [];
    expect(tokens.filter((token) => token.kind === 'literal').map((token) => token.value)).toEqual(['a;b', "it's", "x\\';y"]);
    expect(tokens.filter((token) => token.kind === 'quoted').map((token) => token.value)).toEqual(['weird;name']);
    expect(splitSql('SELECT foo$bar$, $1, $tag$;$tag$').map((statement) => statement.text)).toEqual(['SELECT foo$bar$, $1, $tag$;$tag$']);
  });

  it('refuses SQL it cannot read to its end', () => {
    for (const [sql, message] of [
      ["SELECT 'x", 'a string literal is never closed'],
      ['SELECT "x', 'a quoted identifier is never closed'],
      ['SELECT 1 /* /* */', 'a block comment is never closed'],
      ['DO $x$ BEGIN END $y$', 'a dollar-quoted body $x$ is never closed'],
    ] as const) {
      expect(() => splitSql(sql), sql).toThrow(new SqlReadError(message));
    }
  });

  const touches = (sql: string) => ruleTableStatements(sql).flatMap((statement) => statement.findings);

  it('finds DDL on a rule table, however the statement names it', () => {
    const cases: [string, string][] = [
      ['ALTER TABLE rule_record ADD COLUMN x int', 'ALTER TABLE names rule_record'],
      ['ALTER TABLE IF EXISTS ONLY public.rule_record DROP CONSTRAINT c', 'ALTER TABLE names rule_record'],
      ['alter table "rule_release" rename column a to b', 'ALTER TABLE names rule_release'],
      ['DROP TABLE IF EXISTS rule_release_withdrawal CASCADE', 'DROP TABLE names rule_release_withdrawal'],
      ['TRUNCATE rule_record', 'TRUNCATE names rule_record'],
      ['CREATE INDEX CONCURRENTLY rule_record_key ON ONLY rule_record (key)', 'CREATE INDEX on rule_record'],
      ['CREATE TRIGGER t BEFORE UPDATE ON public.rule_release FOR EACH ROW EXECUTE FUNCTION f()', 'CREATE TRIGGER on rule_release'],
      ['CREATE CONSTRAINT TRIGGER t AFTER DELETE ON pricing_run FROM rule_release FOR EACH ROW EXECUTE FUNCTION f()', 'CREATE TRIGGER on rule_release'],
      ['DROP TRIGGER rule_record_immutable ON rule_record', 'DROP TRIGGER on rule_record'],
      ['CREATE POLICY p ON rule_record USING (true)', 'CREATE POLICY on rule_record'],
      ['ALTER POLICY p ON rule_record USING (false)', 'ALTER POLICY on rule_record'],
      ['GRANT SELECT (key) ON rule_record TO tp_screening', 'GRANT names rule_record'],
      ['REVOKE ALL ON rule_release, rule_record FROM PUBLIC', 'REVOKE names rule_release'],
      ["COMMENT ON TABLE rule_record IS 'x'", 'COMMENT names rule_record'],
      ["COMMENT ON COLUMN rule_record.key IS 'x'", 'COMMENT names rule_record'],
      ["SECURITY LABEL ON TABLE rule_release IS 'x'", 'SECURITY names rule_release'],
      ['CREATE TABLE screening_run (release_no integer REFERENCES rule_release (release_no))', 'CREATE TABLE names rule_release'],
      ['ALTER TABLE pricing_run ADD FOREIGN KEY (release_no) REFERENCES rule_release (release_no)', 'ALTER TABLE names rule_release'],
      ['CREATE TABLE copy (LIKE rule_record)', 'CREATE TABLE names rule_record'],
      ['ALTER INDEX rule_record_identity RENAME TO x', "ALTER INDEX names rule_record_identity, which may be rule_record's"],
      ['DROP INDEX rule_record_by_type', "DROP INDEX names rule_record_by_type, which may be rule_record's"],
      ['VACUUM rule_record', 'VACUUM names rule_record'],
    ];
    for (const [sql, finding] of cases) expect(touches(sql), sql).toContain(finding);
  });

  it('finds a write to a rule table’s rows', () => {
    const cases: [string, string][] = [
      ["INSERT INTO rule_record (key) VALUES ('{}')", 'INSERT writes rule_record'],
      ['WITH x AS (SELECT 1) INSERT INTO public.rule_release SELECT * FROM x', 'INSERT writes rule_release'],
      ['UPDATE ONLY rule_release SET published_at = now()', 'UPDATE writes rule_release'],
      ['DELETE FROM rule_release_withdrawal', 'DELETE writes rule_release_withdrawal'],
      ['MERGE INTO rule_record r USING x ON true WHEN MATCHED THEN DELETE', 'MERGE writes rule_record'],
      ['COPY rule_record FROM stdin', 'COPY writes rule_record'],
    ];
    for (const [sql, finding] of cases) expect(touches(sql), sql).toContain(finding);
  });

  it('finds DDL and writes in a routine’s or a DO block’s body, and in dynamic SQL', () => {
    const cases: [string, string][] = [
      ['DO $$ BEGIN ALTER TABLE rule_record ADD COLUMN x int; END $$', 'ALTER TABLE names rule_record in its body'],
      ['CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF true THEN DROP TABLE rule_record; END IF; END $f$', 'DROP TABLE names rule_record in its body'],
      ["CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE sql AS 'DELETE FROM rule_record'", 'DELETE writes rule_record in its body'],
      ['CREATE PROCEDURE p() LANGUAGE plpgsql AS $$ BEGIN INSERT INTO rule_record SELECT * FROM x; END $$', 'INSERT writes rule_record in its body'],
      ["DO $$ BEGIN EXECUTE 'TRUNCATE rule_release'; END $$", 'TRUNCATE names rule_release in a nested body'],
      ["DO $$ BEGIN EXECUTE format('ALTER TABLE %I ADD COLUMN x int', 'rule_record'); END $$", 'dynamic SQL (EXECUTE) names rule_record beside ALTER in its body'],
      ["DO $$ BEGIN EXECUTE 'DELETE FROM ' || 'rule_record'; END $$", 'dynamic SQL (EXECUTE) names rule_record beside DELETE in its body'],
    ];
    for (const [sql, finding] of cases) expect(touches(sql), sql).toContain(finding);
  });

  it('leaves alone what only reads a rule table, and names that merely look like one', () => {
    for (const sql of [
      'CREATE FUNCTION locality_status(zip text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT r.value ->> $q$x$q$ FROM rule_record r WHERE r.key = jsonb_build_object($q$zip$q$, zip) FOR UPDATE OF r $$',
      'CREATE FUNCTION f() RETURNS SETOF rule_record LANGUAGE sql AS $$ SELECT * FROM rule_record $$',
      'CREATE OR REPLACE VIEW v AS SELECT * FROM rule_record JOIN rule_release USING (release_no)',
      'CREATE MATERIALIZED VIEW m AS SELECT count(*) FROM rule_release_withdrawal',
      'CREATE POLICY p ON pricing_run USING (EXISTS (SELECT 1 FROM rule_release r WHERE r.release_no = release_no))',
      'CREATE TRIGGER t BEFORE INSERT OR UPDATE OR DELETE ON pricing_run FOR EACH ROW EXECUTE FUNCTION f()',
      'CREATE INDEX pricing_run_release ON pricing_run (release_no)',
      'GRANT EXECUTE ON FUNCTION current_rule_release(), rule_release_content_span(integer) TO tp_app',
      "COMMENT ON FUNCTION rule_release_content_span(integer) IS 'never drops rule_record'",
      "INSERT INTO role_permission (role, permission, effect) VALUES ('reviewer', 'rule_release.manage', 'deny')",
      'INSERT INTO rule_record_audit SELECT * FROM rule_record',
      "CREATE FUNCTION g() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'TRUNCATE' THEN RAISE EXCEPTION 'cannot drop or alter rule_record rows'; END IF; SELECT r.comment, r.update FROM rule_record r; RETURN NEW; END $$",
      "DO $$ BEGIN EXECUTE 'SELECT count(*) FROM rule_record'; END $$",
      '-- ALTER TABLE rule_record ADD COLUMN x int;\nSELECT 1',
      "SELECT 'ALTER TABLE rule_record DROP COLUMN key'",
    ]) {
      expect(touches(sql), sql).toEqual([]);
    }
  });

  it('reads a literal that is not SQL as its words, so a message never fails the migration', () => {
    expect(touches("DO $$ BEGIN EXECUTE 'it''s ' || 'DROP TABLE ' || 'rule_record'; END $$")).toContain('dynamic SQL (EXECUTE) names rule_record beside DROP in its body');
    expect(touches("DO $$ BEGIN EXECUTE 'say \"' || x; END $$")).toEqual([]);
  });

  it('finds exactly the statements that touch the rule tables, or may, in every migration up to PR 6b’s base, and none in the others', () => {
    // These migrations are applied and never change. Each statement listed here touches a rule table (they created
    // the tables, their triggers and grants, the run's foreign key, and PR 5's lock trigger on the withdrawals), or may:
    // tenancy hardening's statement 60 alters every function that sets a search path from a list read at run time.
    const expected: Readonly<Record<string, readonly number[]>> = {
      '20261015120000_rule_content.sql': [1, 2, 3, 4, 6, 8, 10, 11, 12, 13, 14],
      '20261015180000_tenancy_hardening.sql': [60],
      '20261018090000_pricing_runs.sql': [1],
      '20261019150000_reruns_and_release_withdrawal.sql': [1, 4, 5, 6, 7, 8],
      '20261103090000_deadline_verification_and_export_attestation.sql': [22],
    };
    const dir = path.join(repositoryRoot, 'packages/db/migrations');
    const files = readdirSync(dir).filter((name) => name <= '20261104090000_free_screening.sql');
    expect(files).toHaveLength(42);
    const objects = ruleTableObjects(files.map((name) => readFileSync(path.join(dir, name), 'utf8')));
    // The functions the rule tables' triggers execute, PR 5's lock among them, and no view reads a rule table.
    expect(Object.fromEntries(objects.triggerFunctions)).toEqual({
      rule_release_immutable: ['rule_release'],
      rule_record_immutable: ['rule_record'],
      rule_content_no_truncate: ['rule_record', 'rule_release', 'rule_release_withdrawal'],
      rule_release_withdrawal_rules: ['rule_release_withdrawal'],
      pricing_current_change_lock: ['rule_release_withdrawal'],
    });
    expect([...objects.views]).toEqual([]);
    for (const name of files) {
      expect(
        ruleTableStatements(readFileSync(path.join(dir, name), 'utf8'), objects).map((statement) => statement.index),
        name,
      ).toEqual(expected[name] ?? []);
    }
  });

  it('finds what changes a rule table without naming it: its trigger functions replaced, altered or dropped, a grant on every table of a schema, a write granted on a view that reads it, a Unicode-escaped name and SQL built at run time', () => {
    const objects = ruleTableObjects([
      'CREATE FUNCTION rule_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION $m$no$m$; END $$;',
      'CREATE TRIGGER rule_release_immutable BEFORE UPDATE OR DELETE ON rule_release FOR EACH ROW EXECUTE FUNCTION rule_release_immutable();',
      'CREATE TRIGGER rule_release_withdrawal_pricing_current_lock BEFORE INSERT ON public.rule_release_withdrawal FOR EACH ROW EXECUTE PROCEDURE public.pricing_current_change_lock();',
      'CREATE TRIGGER pricing_run_lock BEFORE INSERT ON pricing_run FOR EACH ROW EXECUTE FUNCTION pricing_current_change_lock();',
      'CREATE VIEW rule_record_open AS SELECT * FROM rule_record WHERE effective_to IS NULL;',
      'CREATE MATERIALIZED VIEW IF NOT EXISTS release_counts AS SELECT count(*) FROM pricing_run;',
    ]);
    expect(Object.fromEntries(objects.triggerFunctions)).toEqual({ rule_release_immutable: ['rule_release'], pricing_current_change_lock: ['rule_release_withdrawal'] });
    expect(Object.fromEntries(objects.views)).toEqual({ rule_record_open: ['rule_record'] });
    const found = (sql: string) => ruleTableStatements(sql, objects).flatMap((statement) => statement.findings);
    const cases: [string, string][] = [
      // A1 and A2: a published release made editable; the shared lock reading a column the withdrawals lack.
      ['CREATE OR REPLACE FUNCTION rule_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$', 'CREATE FUNCTION rule_release_immutable, which a trigger on rule_release executes'],
      ['CREATE OR REPLACE FUNCTION public.pricing_current_change_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM NEW.practice_id; RETURN NEW; END $$', 'CREATE FUNCTION pricing_current_change_lock, which a trigger on rule_release_withdrawal executes'],
      ['ALTER FUNCTION pricing_current_change_lock() SECURITY DEFINER', 'ALTER FUNCTION pricing_current_change_lock, which a trigger on rule_release_withdrawal executes'],
      ['ALTER ROUTINE rule_release_immutable() OWNER TO tp_app', 'ALTER ROUTINE rule_release_immutable, which a trigger on rule_release executes'],
      // A3: dropped with CASCADE, which drops its triggers, also second in a list.
      ['DROP FUNCTION IF EXISTS other_function(int), rule_release_immutable() CASCADE', 'DROP FUNCTION rule_release_immutable, which a trigger on rule_release executes'],
      // A5: every table of the schema.
      ['GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tp_job', 'GRANT on every table of a schema, the rule tables among them'],
      ['REVOKE ALL ON ALL TABLES IN SCHEMA public FROM tp_app', 'REVOKE on every table of a schema, the rule tables among them'],
      // A6: a Unicode-escaped name.
      ['ALTER TABLE U&"rule\\005frecord" ADD COLUMN x int', 'ALTER TABLE names rule_record'],
      ['ALTER TABLE u&"rule\\+00005Frelease" ADD COLUMN x int', 'ALTER TABLE names rule_release'],
      // A7: DDL built from a value read at run time.
      ["DO $$ BEGIN EXECUTE 'ALTER TABLE ' || reverse('drocer_elur') || ' ADD COLUMN x int'; END $$", 'dynamic SQL (EXECUTE) builds ALTER from values read at run time, so the objects it reaches cannot be read in its body'],
      ["DO $$ DECLARE f regprocedure; BEGIN FOR f IN SELECT oid FROM pg_proc LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO tp_app', f); END LOOP; END $$", 'dynamic SQL (EXECUTE) builds ALTER from values read at run time, so the objects it reaches cannot be read in its body'],
      ["DO $$ DECLARE q text := 'DROP TABLE x'; BEGIN EXECUTE q; END $$", 'dynamic SQL (EXECUTE) runs SQL built elsewhere, which this check cannot read in its body'],
      // A8: a write granted on a view that reads a rule table.
      ['GRANT SELECT, INSERT ON rule_record_open TO tp_job', 'GRANT INSERT on rule_record_open, a view that reads rule_record (an updatable view writes through to them)'],
      ['GRANT ALL ON TABLE public.rule_record_open, pricing_run TO tp_app', 'GRANT ALL on rule_record_open, a view that reads rule_record (an updatable view writes through to them)'],
    ];
    for (const [sql, finding] of cases) expect(found(sql), sql).toContain(finding);
    for (const sql of [
      'CREATE FUNCTION rule_release_immutable(x int) RETURNS int LANGUAGE sql AS $$ SELECT x $$',
      'CREATE OR REPLACE FUNCTION pricing_lock_helper() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$',
      'DROP FUNCTION IF EXISTS other_function(int) CASCADE',
      'GRANT SELECT ON rule_record_open TO tp_app',
      'GRANT INSERT ON release_counts TO tp_app',
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tp_app',
      "DO $$ BEGIN EXECUTE format('SELECT count(*) FROM %I', 'pricing_run'); END $$",
      "DO $$ BEGIN EXECUTE 'SELECT 1' USING 1; END $$",
      'DO $$ BEGIN CREATE TRIGGER t BEFORE INSERT ON pricing_run FOR EACH ROW EXECUTE FUNCTION f(); GRANT EXECUTE ON FUNCTION f() TO tp_app; END $$',
      "SELECT U&'d\\0061t\\+000061'",
    ]) {
      expect(found(sql), sql).toEqual([]);
    }
    expect(() => splitSql("ALTER TABLE U&\"rule!005frecord\" UESCAPE '!' ADD COLUMN x int")).toThrow(new SqlReadError('a Unicode escape with UESCAPE, which this check does not read'));
    expect(() => splitSql('ALTER TABLE U&"rule\\zrecord" ADD COLUMN x int')).toThrow(SqlReadError);
  });
});

describe('the repository: the diff from the merge base', () => {
  let root = '';
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=SYNTHETIC', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  const write = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  const commit = (message: string) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'engine-freeze-'));
    git('init', '-q', '-b', 'main');
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('reads the changes, the exception and the added migrations from the base to HEAD, and applies the exception only in the pull request that adds or edits it', () => {
    write('packages/pricing/src/engine.ts', 'export const a = 1;\n');
    write('packages/pricing/src/testing.ts', 'export const t = 1;\n');
    write('fixtures/golden/claims/G01-x.json', JSON.stringify({ inputs: { release: { dir: 'fixtures/synthetic/rules/release-synth-900001' } } }));
    write('fixtures/golden/README.md', 'golden\n');
    write('packages/db/migrations/20261015120000_rule_content.sql', 'CREATE TABLE rule_record (id int);\n');
    write('docs/old-name.md', 'x\n');
    const base = commit('base');

    write('packages/pricing/src/engine.ts', 'export const a = 2;\n');
    write('packages/pricing/src/engine.test.ts', 'test\n');
    write('fixtures/golden/claims/G196-zip-plus-four.json', '{}\n');
    write('fixtures/golden/README.md', 'golden, 154 claims\n');
    write(MIGRATION, `${WIDEN};\n`);
    const exception: FreezeException = {
      ruling: SIX_B_ONE.ruling,
      pull_request: 7,
      engine_files: ['engine.ts'],
      golden_added: ['fixtures/golden/claims/G196-*'],
      golden_edited: ['fixtures/golden/README.md'],
      rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN }],
    };
    write(EXCEPTION_FILE, JSON.stringify(exception));
    rmSync(path.join(root, 'docs/old-name.md'));
    write('docs/new-name.md', 'x\n');
    const head = commit('the pull request');

    const input = readRepository(root, base);
    expect([...input.changes].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      M('fixtures/golden/README.md'),
      A('fixtures/golden/claims/G196-zip-plus-four.json'),
      A('docs/new-name.md'),
      D('docs/old-name.md'),
      A(MIGRATION),
      A('packages/pricing/src/engine.test.ts'),
      M('packages/pricing/src/engine.ts'),
      A(EXCEPTION_FILE),
    ].sort((a, b) => a.path.localeCompare(b.path)));
    expect(input.exceptionChanged).toBe(true);
    expect(input.migrationText(MIGRATION)).toBe(`${WIDEN};\n`);
    expect(input.engineStat).toContain('packages/pricing/src/engine.ts');
    expect(input.engineStat).not.toContain('engine.test.ts');
    expect(input.pinnedReleases).toEqual(['fixtures/synthetic/rules/release-synth-900001']);
    expect(Object.fromEntries(input.ruleTableObjects?.triggerFunctions ?? [])).toEqual({});
    expect(input.readProblems).toEqual([]);
    expect(checkFreeze(input).problems).toEqual([]);

    // main: the summary on stdout and in GITHUB_STEP_SUMMARY, exit 0, as the pull request the exception names.
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const summaryFile = path.join(root, 'summary.md');
    expect(main([base], { GITHUB_STEP_SUMMARY: summaryFile, PR_NUMBER: '7', CI: 'true' }, root)).toBe(0);
    // Another pull request's number, none in CI, or one that is not a number.
    expect(main([base], { PR_NUMBER: '8' }, root)).toBe(1);
    expect(err.mock.calls.map((call) => String(call[0]))).toContain(`engine-freeze: ${EXCEPTION_FILE}: names pull request 7, and this is pull request 8: an exception applies only in the pull request it names, which adds or edits it\n`);
    expect(main([base], { CI: 'true' }, root)).toBe(2);
    expect(main([base], { PR_NUMBER: '7a' }, root)).toBe(2);
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('PR_NUMBER is "7a", not a pull request number');
    expect(readFileSync(summaryFile, 'utf8')).toContain(`Against the merge base \`${base}\`. The exception (\`${EXCEPTION_FILE}\`): applies`);
    expect(String(out.mock.calls[0]?.[0])).toContain('## Engine freeze');

    // A later pull request from that head: the exception is stale, so its engine change is refused (exit 1).
    write('packages/pricing/src/engine.ts', 'export const a = 3;\n');
    const later = commit('a later pull request');
    const stale = checkFreeze(readRepository(root, head));
    expect(stale.exception).toBe('stale');
    expect(stale.problems).toHaveLength(1);
    expect(main([], { ENGINE_FREEZE_BASE: head }, root)).toBe(1);

    // The same pull request with exception.json made executable (a mode change, no line changed): in its diff, but it
    // names pull request 7, so as pull request 8 its engine change is still refused.
    chmodSync(path.join(root, EXCEPTION_FILE), 0o755);
    commit('chmod +x exception.json');
    expect(git('diff', '--summary', later, 'HEAD')).toContain('mode change 100644 => 100755');
    const carried = readRepository(root, head);
    expect(carried.exceptionChanged).toBe(true);
    expect(checkFreeze({ ...carried, pullRequest: 8 }).problems).toEqual([
      `${EXCEPTION_FILE}: names pull request 7, and this is pull request 8: an exception applies only in the pull request it names, which adds or edits it`,
      `packages/pricing/src/engine.ts (modified): a non-test file under packages/pricing/src changes, and ${EXCEPTION_FILE} names another pull request, so it does not apply here`,
    ]);
    expect(main([head], { PR_NUMBER: '8' }, root)).toBe(1);
  });

  it('reads the releases the golden claims at the base pin, and names a claim it cannot read', () => {
    write('fixtures/golden/claims/G01-x.json', JSON.stringify({ inputs: { release: { dir: 'fixtures/synthetic/rules/release-synth-900001/' } } }));
    write('fixtures/golden/claims/G02-x.json', JSON.stringify({ inputs: { release: { dir: 'fixtures/synthetic/rules/release-synth-900001' } } }));
    write('fixtures/golden/claims/G196-x.json', JSON.stringify({ inputs: { release: { dir: 'fixtures/synthetic/rules/release-synth-900006' } } }));
    write('fixtures/golden/claims/G196-x.worksheet.md', 'not a claim\n');
    const base = commit('base');
    expect(pinnedReleaseDirs(root, base)).toEqual({ dirs: ['fixtures/synthetic/rules/release-synth-900001', 'fixtures/synthetic/rules/release-synth-900006'], problems: [] });
    write('fixtures/golden/claims/G03-x.json', '{"inputs":');
    write('fixtures/golden/claims/G04-x.json', '{"inputs":{}}');
    const broken = commit('broken claims');
    expect(pinnedReleaseDirs(root, broken).problems).toEqual([
      expect.stringMatching(/^fixtures\/golden\/claims\/G03-x\.json at the base: cannot read the release it pins \(/),
      'fixtures/golden/claims/G04-x.json at the base: cannot read the release it pins (it names no inputs.release.dir), so the releases the golden claims pin cannot be held',
    ]);
  });

  it('finds a workspace package that resolves @tp/pricing anywhere but packages/pricing/src', () => {
    /** A workspace whose worker links @tp/pricing as pnpm does, its "." export at `dot`; each in its own directory, as Node caches a package's exports. */
    const workspace = (dot: string | null): string => {
      const dir = mkdtempSync(path.join(tmpdir(), 'engine-freeze-resolve-'));
      const put = (file: string, text: string) => {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        writeFileSync(path.join(dir, file), text);
      };
      put('packages/pricing/src/index.ts', 'export {};\n');
      put('packages/pricing/src/testing.ts', 'export {};\n');
      put('packages/pricing/engine2/index.ts', 'export {};\n');
      put('packages/pricing/package.json', JSON.stringify({ name: '@tp/pricing', exports: { '.': dot ?? './src/index.ts', './testing': './src/testing.ts' } }));
      put('apps/worker/package.json', JSON.stringify({ name: '@tp/worker', dependencies: { '@tp/pricing': 'workspace:*' } }));
      put('apps/web/package.json', JSON.stringify({ name: '@tp/web' }));
      if (dot !== null) {
        mkdirSync(path.join(dir, 'apps/worker/node_modules/@tp'), { recursive: true });
        execFileSync('ln', ['-s', '../../../../packages/pricing', path.join(dir, 'apps/worker/node_modules/@tp/pricing')]);
      }
      return dir;
    };
    const roots = [workspace('./src/index.ts'), workspace('./engine2/index.ts'), workspace(null)];
    try {
      expect(engineResolutionProblems(roots[0] ?? '')).toEqual([]);
      // The package pointed at a copy of the engine beside src.
      expect(engineResolutionProblems(roots[1] ?? '')).toEqual(['apps/worker resolves @tp/pricing to packages/pricing/engine2/index.ts, not packages/pricing/src/index.ts: every consumer of the engine runs packages/pricing/src']);
      // Not installed in the workspace: unresolved, or resolved through NODE_PATH (which pnpm exec sets) to another
      // workspace's engine; a problem either way.
      const uninstalled = engineResolutionProblems(roots[2] ?? '');
      expect(uninstalled).toHaveLength(2);
      for (const problem of uninstalled) expect(problem).toMatch(/^apps\/worker (?:cannot resolve @tp\/pricing.*; run pnpm install|resolves @tp\/pricing.* to .*, not packages\/pricing\/src\/)/);
    } finally {
      for (const dir of roots) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds every consumer of @tp/pricing in this repository resolving it to packages/pricing/src', () => {
    expect(engineResolutionProblems(repositoryRoot)).toEqual([]);
  });

  it('needs a base that is a commit', () => {
    write('a.txt', 'a\n');
    commit('base');
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(main([], {}, root)).toBe(2);
    expect(String(err.mock.calls[0]?.[0])).toContain('usage: tsx tools/engine-freeze/check.ts <merge base>');
    expect(main(['no-such-ref'], {}, root)).toBe(2);
    expect(String(err.mock.calls[1]?.[0])).toContain('engine-freeze: no-such-ref is not a commit in this repository');
  });
});

describe('the wiring', () => {
  interface Step {
    readonly name?: string;
    readonly if?: string;
    readonly run?: string;
    readonly uses?: string;
    readonly with?: Record<string, unknown>;
    readonly env?: Record<string, string>;
  }
  const ci = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, { steps: Step[] }> };
  const steps = (job: string): Step[] => ci.jobs[job]?.steps ?? [];
  const checkout = (job: string) => steps(job).find((step) => step.uses?.startsWith('actions/checkout@') === true);

  it('runs the check as a step of ci.yml’s static job against a pull request’s merge base, with its number for the exception', () => {
    const freeze = steps('static').findIndex((step) => step.name === 'Engine freeze');
    expect(freeze).toBeGreaterThan(0);
    const step = steps('static')[freeze];
    // A pull request's alone: the exception names one (check.ts reads PR_NUMBER).
    expect(step?.if).toBe("${{ github.event_name == 'pull_request' && !cancelled() && steps.install.outcome == 'success' }}");
    expect(step?.env).toEqual({ BASE_REF: '${{ github.base_ref }}', PR_NUMBER: '${{ github.event.pull_request.number }}' });
    expect(step?.run).toContain('base="$(git merge-base "origin/$BASE_REF" HEAD)"');
    expect(step?.run).toContain('pnpm -s exec tsx tools/engine-freeze/check.ts "$base"');
    expect(step?.run).not.toContain('${{');
  });

  it('hands the unit tests their base through GITHUB_ENV before they run: the merge base on a pull request, the previous head on a push', () => {
    const base = steps('unit').findIndex((step) => step.name === "The engine freeze's base");
    const unit = steps('unit').findIndex((step) => step.run?.startsWith('pnpm test ') === true || step.run === 'pnpm test');
    expect(base).toBeGreaterThan(0);
    expect(unit).toBeGreaterThan(base);
    const step = steps('unit')[base];
    expect(step?.env).toEqual({ EVENT: '${{ github.event_name }}', BASE_REF: '${{ github.base_ref }}', BEFORE: '${{ github.event.before }}' });
    expect(step?.run).toContain('base="$(git merge-base "origin/$BASE_REF" HEAD)"');
    expect(step?.run).toContain('base="$BEFORE"');
    expect(step?.run).toContain('echo "ENGINE_FREEZE_BASE=$base" >> "$GITHUB_ENV"');
    expect(step?.run).not.toContain('${{');
  });

  it('checks out the whole history where the base is read: the freeze, the differential test’s git archive and the domain model’s summary', () => {
    for (const job of ['static', 'unit', 'domain-model']) {
      expect(checkout(job)?.with, job).toEqual({ 'fetch-depth': 0, 'persist-credentials': false });
    }
  });
});
