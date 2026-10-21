import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  RULING_ENGINE_FILES,
  SqlReadError,
  checkFreeze,
  exceptionSchema,
  goldenPattern,
  main,
  readRepository,
  ruleTableStatements,
  splitSql,
  summary,
} from './check';

/** The exception PR 6b-1 declares: the five engine files of the 2026-10-18 ruling, G196-G199, two golden documents. */
const SIX_B_ONE: FreezeException = {
  ruling: "The founder's ruling of 2026-10-18 11:47 UTC",
  engine_files: [...RULING_ENGINE_FILES],
  golden_added: ['fixtures/golden/claims/G196-*', 'fixtures/golden/claims/G197-*', 'fixtures/golden/claims/G198-*', 'fixtures/golden/claims/G199-*'],
  golden_edited: ['fixtures/golden/QUESTIONS.md', 'fixtures/golden/README.md'],
  rule_table_ddl: [],
};

const WIDEN = "ALTER TABLE rule_record DROP CONSTRAINT rule_record_record_type_check, ADD CONSTRAINT rule_record_record_type_check CHECK (record_type IN ('locality_map', 'locality_map_plus_four'))";
const MIGRATION = 'packages/db/migrations/20261105090000_pricing_location.sql';

interface Case {
  readonly changes: readonly Change[];
  readonly exception?: FreezeException | string | null;
  readonly changed?: boolean;
  readonly migrations?: Readonly<Record<string, string>>;
}

function run({ changes, exception = null, changed = true, migrations = {} }: Case) {
  const input: FreezeInput = {
    changes,
    exceptionText: exception === null ? null : typeof exception === 'string' ? exception : JSON.stringify(exception),
    exceptionChanged: changed,
    migrationText: (file) => {
      const text = migrations[file];
      if (text === undefined) throw new Error(`no text for ${file}`);
      return text;
    },
  };
  return checkFreeze(input);
}

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

  it('lets the five engine files of the ruling through under the exception of the pull request that adds or edits it, and never reads a test file', () => {
    const changes = [...RULING_ENGINE_FILES.map((file) => M(`packages/pricing/src/${file}`)), M('packages/pricing/src/engine.test.ts'), A('packages/pricing/src/plus-four.test.ts')];
    const report = run({ changes, exception: SIX_B_ONE });
    expect(report.exception).toBe('applies');
    expect(report.problems).toEqual([]);
    expect(report.allowed).toEqual(RULING_ENGINE_FILES.map((file) => `packages/pricing/src/${file} (modified): engine_files`));
    expect(report.unused).toEqual([...SIX_B_ONE.golden_added.map((item) => `golden_added ${item}`), ...SIX_B_ONE.golden_edited.map((item) => `golden_edited ${item}`)]);
  });

  it('refuses an engine path outside the list: testing.ts, index.ts, release.ts, a new module, a deletion', () => {
    const changes = [M('packages/pricing/src/testing.ts'), M('packages/pricing/src/index.ts'), M('packages/pricing/src/release.ts'), A('packages/pricing/src/plus-four.ts'), D('packages/pricing/src/windows.ts')];
    const { problems } = run({ changes, exception: SIX_B_ONE });
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
      const { problems } = run({ changes, exception });
      expect(problems).toHaveLength(4);
      for (const problem of problems) expect(problem).toContain('an existing golden file never changes, exception or not (fixtures/golden/claims, diffs and sources)');
    }
  });

  it('lets an added claim through only by golden_added: G196-G199 and their worksheets, not G200 nor a file in a directory below', () => {
    const added = ['G196-zip-plus-four-locality-01.json', 'G196-zip-plus-four-locality-01.worksheet.md', 'G197-x.json', 'G198-x.json', 'G199-x.json'].map((name) => A(`fixtures/golden/claims/${name}`));
    const refused = [A('fixtures/golden/claims/G200-x.json'), A('fixtures/golden/claims/extra/G196-x.json'), A('fixtures/golden/claims/G1960-x.json'), A('fixtures/golden/diffs/D002-x.json')];
    const report = run({ changes: [...added, ...refused], exception: SIX_B_ONE });
    expect(report.allowed).toHaveLength(added.length);
    expect(report.problems).toEqual(refused.map((change) => `${change.path} (added): a file added under fixtures/golden, and the exception does not list it under golden_added`));
    expect(goldenPattern('fixtures/golden/claims/G196-*').test('fixtures/golden/claims/G196-a.b.json')).toBe(true);
    expect(goldenPattern('fixtures/golden/claims/G1.6-*').test('fixtures/golden/claims/G196-a')).toBe(false);
  });

  it('lets QUESTIONS.md and README.md be edited under golden_edited only, refuses any other golden edit, and with no exception refuses any change to fixtures/golden', () => {
    const changes = [M('fixtures/golden/QUESTIONS.md'), M('fixtures/golden/README.md'), M('fixtures/golden/OTHER.md'), D('fixtures/golden/QUESTIONS.md'), A('fixtures/golden/NOTES.md')];
    expect(run({ changes, exception: SIX_B_ONE }).problems).toEqual([
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
    const { problems } = run({ changes: [...changes, A('fixtures/synthetic/rules/release-synth-900006/MANIFEST.json')], exception: SIX_B_ONE });
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toContain('synthetic releases 900001 to 900005 never change, exception or not');
  });

  it('refuses a malformed exception, and then applies none', () => {
    const engine = [M('packages/pricing/src/engine.ts')];
    const cases: [unknown, string][] = [
      ['{', `${EXCEPTION_FILE}: is not JSON`],
      [{ ...SIX_B_ONE, extra: true }, `${EXCEPTION_FILE}: (file): Unrecognized key`],
      [{ ...SIX_B_ONE, ruling: ' ' }, `${EXCEPTION_FILE}: ruling: names the ruling that grants the exception`],
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
  });

  it('writes the job summary under "Engine freeze": the base, the exception, the engine diff stat, what it let through and the problems', () => {
    const report = run({ changes: [M('packages/pricing/src/engine.ts'), M('packages/pricing/src/index.ts')], exception: SIX_B_ONE });
    const text = summary('abc123', ' packages/pricing/src/engine.ts | 12 ++++++++++--\n 1 file changed\n', report);
    expect(text).toContain('## Engine freeze\n\nAgainst the merge base `abc123`. The exception (`tools/engine-freeze/exception.json`): applies: this pull request adds or edits it.');
    expect(text).toContain("`git diff --stat abc123 HEAD -- 'packages/pricing/src' ':!**/*.test.ts'`:\n\n```text\n packages/pricing/src/engine.ts | 12 ++++++++++--\n 1 file changed\n```");
    expect(text).toContain('### Let through by the exception\n\n- packages/pricing/src/engine.ts (modified): engine_files\n');
    expect(text).toContain('### Listed by the exception and unused\n\n- engine_files reasons.ts\n');
    expect(text).toContain('### Problems\n\n- packages/pricing/src/index.ts (modified)');
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
      const { problems } = run({ changes: [A(MIGRATION)], exception, changed, migrations });
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
    const exception = { ...SIX_B_ONE, rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN.replace('locality_map_plus_four', 'locality_map_plus4') }] };
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

  it('finds exactly the statements that touch the rule tables in every migration up to PR 6b’s base, and none in the others', () => {
    // These migrations are applied and never change. Each statement listed here touches a rule table (they created
    // the tables, their triggers and grants, the run's foreign key, and PR 5's lock trigger on the withdrawals).
    const expected: Readonly<Record<string, readonly number[]>> = {
      '20261015120000_rule_content.sql': [1, 2, 3, 4, 6, 8, 10, 11, 12, 13, 14],
      '20261018090000_pricing_runs.sql': [1],
      '20261019150000_reruns_and_release_withdrawal.sql': [1, 4, 5, 6, 7, 8],
      '20261103090000_deadline_verification_and_export_attestation.sql': [22],
    };
    const dir = path.join(repositoryRoot, 'packages/db/migrations');
    const files = readdirSync(dir).filter((name) => name <= '20261104090000_free_screening.sql');
    expect(files).toHaveLength(42);
    for (const name of files) {
      expect(
        ruleTableStatements(readFileSync(path.join(dir, name), 'utf8')).map((statement) => statement.index),
        name,
      ).toEqual(expected[name] ?? []);
    }
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
    write('fixtures/golden/claims/G01-x.json', '{}\n');
    write('fixtures/golden/README.md', 'golden\n');
    write('packages/db/migrations/20261015120000_rule_content.sql', 'CREATE TABLE rule_record (id int);\n');
    write('docs/old-name.md', 'x\n');
    const base = commit('base');

    write('packages/pricing/src/engine.ts', 'export const a = 2;\n');
    write('packages/pricing/src/engine.test.ts', 'test\n');
    write('fixtures/golden/claims/G196-zip-plus-four.json', '{}\n');
    write('fixtures/golden/README.md', 'golden, 154 claims\n');
    write(MIGRATION, `${WIDEN};\n`);
    write(EXCEPTION_FILE, JSON.stringify({ ...SIX_B_ONE, rule_table_ddl: [{ migration: MIGRATION, statement: WIDEN }] }));
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
    expect(checkFreeze(input).problems).toEqual([]);

    // main: the summary on stdout and in GITHUB_STEP_SUMMARY, exit 0.
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const summaryFile = path.join(root, 'summary.md');
    expect(main([base], { GITHUB_STEP_SUMMARY: summaryFile }, root)).toBe(0);
    expect(readFileSync(summaryFile, 'utf8')).toContain(`Against the merge base \`${base}\`. The exception (\`${EXCEPTION_FILE}\`): applies`);
    expect(String(out.mock.calls[0]?.[0])).toContain('## Engine freeze');

    // A later pull request from that head: the exception is stale, so its engine change is refused (exit 1).
    write('packages/pricing/src/engine.ts', 'export const a = 3;\n');
    commit('a later pull request');
    const stale = checkFreeze(readRepository(root, head));
    expect(stale.exception).toBe('stale');
    expect(stale.problems).toHaveLength(1);
    expect(main([], { ENGINE_FREEZE_BASE: head }, root)).toBe(1);
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
    readonly run?: string;
    readonly uses?: string;
    readonly with?: Record<string, unknown>;
    readonly env?: Record<string, string>;
  }
  const ci = parse(readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')) as { jobs: { check: { steps: Step[] } } };
  const steps = ci.jobs.check.steps;

  it('runs the check as one ci.yml step against the merge base, and hands the base to the unit tests before they run', () => {
    const freeze = steps.findIndex((step) => step.name === 'Engine freeze');
    const unit = steps.findIndex((step) => step.run?.startsWith('pnpm test ') === true || step.run === 'pnpm test');
    expect(freeze).toBeGreaterThan(0);
    expect(unit).toBeGreaterThan(freeze);
    const step = steps[freeze];
    expect(step?.env).toEqual({ BASE_REF: '${{ github.base_ref }}' });
    expect(step?.run).toContain('base="$(git merge-base "origin/$BASE_REF" HEAD)"');
    expect(step?.run).toContain('echo "ENGINE_FREEZE_BASE=$base" >> "$GITHUB_ENV"');
    expect(step?.run).toContain('pnpm -s exec tsx tools/engine-freeze/check.ts "$base"');
    expect(step?.run?.indexOf('GITHUB_ENV')).toBeLessThan(step?.run?.indexOf('check.ts') ?? 0);
    expect(steps.find((item) => item.uses?.startsWith('actions/checkout@') === true)?.with).toEqual({ 'fetch-depth': 0 });
  });

  it('keeps the extracted base engine out of git, the test runner and the linter', () => {
    expect(readFileSync(path.join(repositoryRoot, '.gitignore'), 'utf8').split('\n')).toContain('/packages/pricing/.freeze-base/');
    expect(readFileSync(path.join(repositoryRoot, 'vitest.config.ts'), 'utf8')).toMatch(/const ignored = \[[^\]]*'\*\*\/\.freeze-base\/\*\*'/);
    expect(readFileSync(path.join(repositoryRoot, 'eslint.config.js'), 'utf8')).toContain("'**/.freeze-base/**',");
    expect(JSON.parse(readFileSync(path.join(repositoryRoot, 'packages/pricing/tsconfig.json'), 'utf8'))).toMatchObject({ include: ['src'] });
  });
});
