export const meta = {
  name: 'lane-b-db-function-diffs-build',
  description: 'Build the db-function-diffs PR (audit #111): generator code + docs, then a checker',
  phases: [
    { title: 'Build', detail: 'code builder and docs builder, in parallel on disjoint files' },
    { title: 'Check', detail: 'one checker: diff vs design, fast checks, targeted db tests' },
  ],
}
const SP = args.sp
const WT = '/home/user/db-function-diffs'
const DESIGN = '/home/user/ops/designs/lane-b-db-function-diffs.md'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const COMMON = `You build part of one pull request in the worktree ${WT} (branch co-001/db-function-diffs, cut from claude/build-platform 6ddd587). Work only in that worktree. Do not commit or push: the orchestrator does. 

The design is ${DESIGN}: read ALL of it; section 7 (review dispositions) wins over sections 3-4 where they differ. The audit item: /home/user/ops/audits/combined/combined-report.md "### 111.".

Rules for this machine:
- In every shell command: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
- One heavy command at a time on this machine: wrap every install, typecheck, lint, test, test:db or vitest run in \`flock /tmp/laneb-heavy.lock ...\`. Never run the full test:db or e2e; run only the test files you touch.
- Database tests: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18.4; tests create their own scratch databases and drop them). A migrated read-only probe database exists: postgres://postgres:test@localhost:5433/tp_dbf_probe.
- Never touch any file of open PR #42 (list: /tmp/claude-0/pr42-files.txt) except appending a block to docs/product/test-matrix.md. Never edit a migration, docs/product/domain-model.md, packages/db/domain-model/*.json, LANES.md, HANDOFF.md, lanes/*, CLAUDE.md, .claude/hooks/*, or .github/workflows/*.
- No model name or identifier in any file. Synthetic data only. Match the surrounding code's style: its long explanatory doc comments in plain English, naming and idioms (read neighbouring files first).
- Improve as you go: an improvement inside your files goes in; one outside goes into your final report as a proposal.`

const code = () => agent(`${COMMON}

YOUR PART: the code, its tests and the generated files.
${SAVE('build-code.md', 'what is done, what is next, each check run and its result')}

Build, in packages/db/src/domain-model/ and packages/db/src/cli/domain-model.ts (read every file there first, and summary.ts, approval.ts, render.ts, model.ts, catalog-reads.ts, generate.ts, history.ts, sources.ts and their tests):
1. catalog-reads.ts: per function, read (inside readCatalog, under readDatabase's pinned SET LOCALs, same snapshot) prokind, pg_get_functiondef for kinds f/p/w, owner, ACL rows via aclexplode(coalesce(proacl, acldefault('f', proowner))) with grantee (0 = PUBLIC), grantor, grantable, the comment, and whether it is an extension member (pg_depend deptype 'e'). Do not call pg_get_functiondef on an aggregate (it raises); the generator refuses aggregates with a DomainModelError naming them. The document's renderer must ignore the new fields: the document's text must stay byte-identical (verify: regenerate the document on a freshly migrated scratch database and compare with docs/product/domain-model.md via the existing drift test).
2. A new module (e.g. functions.ts) that renders the function files per design §3.1 as amended by §7: one file per name, overloads in signature C order, header lines exactly as §7 says (signature as Appendix C prints it, the labelled body-hash line using the same bodySha256 as model.ts, "Trigger function of" one table.trigger per line in C order), the definition with one trailing newline stripped then ';', OWNER, explicit PUBLIC line, GRANT lines with GRANTED BY / WITH GRANT OPTION, owner self-revoke, COMMENT. No "Defined by" line. Banner without "@generated" or "DO NOT EDIT". Name check ^[a-z_][a-z0-9_]*$ and <= 63 bytes, else DomainModelError. Extension members excluded. Deterministic.
3. generate.ts returns functionFiles (file name -> content). Helpers to compare a directory with the expected map (missing / extra / differing with first differing line; only paths git would commit count as entries, README.md allowed, symlinks and directories refused) and to write it (write changed, remove stale *.sql, never follow symlinks, never touch README.md).
4. cli/domain-model.ts: --out writes the directory too; --functions DIR (resolved against INIT_CWD like --out; default <repo>/packages/db/functions); --check reports both the document and the directory then exits 1 if either differs; INPUTS exclude packages/db/functions via a pathspec ':(exclude)packages/db/functions' for the uncommitted check; update the usage text and the long doc comment.
5. summary.ts / CLI --summary-since: the section "Function definitions changed since REF" per §7 R2 (files at REF read with git; compared with the generated set under --out/--check, else the working tree directory; unified diffs via git diff --no-index over two temp dirs, in fenced diff blocks; SECURITY DEFINER and scope-setting first, then by name; when REF has no packages/db/functions, one line saying so with the count). Keep the existing summary output unchanged otherwise, and its tests passing.
6. Tests (DBF-01 to DBF-05 per design §4 and §7; name each test with its DBF id in the describe/it text as other tests carry their matrix IDs; read how existing tests cite IDs):
   - unit tests (*.test.ts) for rendering (ACL variants, PUBLIC both ways, grantor, grant option, owner self-revoke, comment, triggers, overloads order, name refusal, aggregate refusal, determinism under input order with fast-check as other tests use it), the directory compare/write helpers on a temp dir (README kept, stale removed, symlink refused, ignored file not an entry), the provenance pathspec still flagging a migration edit, the summary section (including a header-only change, and the no-functions-at-REF line).
   - db tests: in domain-model.db.test.ts a case that packages/db/functions matches a fresh migrated database (with the regenerate command in the failure message), and one that a connection with a different search_path, DateStyle, IntervalStyle and TimeZone produces the same files; in domain-model-drift.db.test.ts, the probe: a one-line body edit changes only gate_probe.sql by that line and the body-hash line, the hash of the text between the delimiters equals the Appendix C value (also for screening_standing's SQL-standard body), and a grant added, SECURITY DEFINER flip and SET search_path removal each change the file. Also that the document text is byte-identical to what it was (its existing case).
7. Generate the committed files: migrate a fresh scratch database (createdb tp_dbf_gen on 5433, DATABASE_URL=... pnpm db:migrate), run pnpm db:domain-model --out --strict against it, confirm docs/product/domain-model.md is unchanged apart from nothing at all (git diff must show it unchanged; if the provenance line changes, restore the file with git checkout), and that packages/db/functions/ holds 337 .sql files. Drop tp_dbf_gen after.
8. Run: flock pnpm typecheck (whole repo), flock pnpm lint, the unit tests you touched, and the two domain-model db test files plus summary tests. All must pass.

Report: files changed, test counts per file, every check run and its result, anything you could not do, and proposals.`, { label: 'builder-code', phase: 'Build' })

const docs = () => agent(`${COMMON}

YOUR PART: the documents, guards and reviewer guidance (another builder writes the code under packages/db/src at the same time; do not touch packages/db/src or packages/db/functions/*.sql).
${SAVE('build-docs.md', 'what is done, what is next, each check run and its result')}

Write:
1. docs/adr/0068-<slug>.md: read docs/adr/0063, 0066 and two recent ADRs for format and voice first. Record: context (#111), the decision (one generated file per function name in packages/db/functions, written by --out, checked by the db job's drift case and the domain model job's --check, the summary section with diffs), the binding (drift check plus Appendix D's migration hashes, not the body-hash line; the document's text and hash unchanged), determinism (pinned settings, PostgreSQL major version, floating postgres:18 tag as for the document), aggregates refused, extension members left out, linguist-generated=false, CODEOWNERS, the rejected options (design §6 and R1's "Defined by"), the effect on every future migration PR and on #42 (its function files must be committed before the founder signs). Cross-reference 0063 and 0066. Also update the ADR index if docs/adr has one (check README or index file).
2. packages/db/functions/README.md: what the files are, generated by pnpm db:domain-model --out and never edited by hand, how to read a diff (header lines, body-hash label, trigger lines being new triggers, PUBLIC line), that they are not the approval of record, extension members left out, aggregates refused.
3. docs/product/test-matrix.md: a new section "## Database function diffs (DBF)" in the same table format, rows DBF-01 to DBF-05 per design §4 as amended by §7, appended as its own block (place it after the last section so it does not conflict with #42's edits to the same file).
4. .claude/skills/new-migration/SKILL.md: --out also writes packages/db/functions; commit them in the same PR; report each changed function as its file's diff; the review hazards of §7 R17. Keep the existing text and the approval-line rules intact.
5. .claude/agents/security-reviewer.md: on a migration, read the packages/db/functions/*.sql diffs first, with the §7 R17 checklist. Keep frontmatter and existing text.
6. docs/runbooks/github-governance.md, the domain-model approval steps (step 6 "A pull request that asks you to approve the domain model"): the summary now shows each changed function's lines; Files changed shows packages/db/functions too.
7. .github/CODEOWNERS: /packages/db/functions/ @PureTideWater under "The schema and its approval" (right after /packages/db/domain-model/ or where it reads best), and update tools/test/codeowners.test.ts's ordered list and anything else it pins.
8. .gitattributes (new, at the root): packages/db/functions/*.sql linguist-generated=false, with a comment why; and a test pinning it (put it in tools/test, next to codeowners.test.ts, or in an existing suitable test file).
9. .editorconfig: [packages/db/functions/**] with trim_trailing_whitespace = unset and insert_final_newline = unset, with a comment, as fixtures/** has.
10. packages/compliance/src/controls.ts: CO-02's control text names the generated function files checked beside the document (keep the step string exactly the same, since tests pin it; read the tests).
11. Check whether README.md or any other doc (docs/runbooks, docs/product, packages/db) describes pnpm db:domain-model --out / --check and needs one sentence about the function files; update those, except the files you must not touch.
12. Run flock pnpm lint (and lint:copy if it exists), flock pnpm typecheck, and the unit tests of tools/test and packages/compliance you affected. All must pass.

Report: files changed, each check and its result, and proposals.`, { label: 'builder-docs', phase: 'Build' })

phase('Build')
const built = await parallel([code, docs])

phase('Check')
const check = await agent(`${COMMON}

YOUR PART: the checker. Two builders just finished. Their reports:
--- code builder ---
${built[0] ?? '(no report)'}
--- docs builder ---
${built[1] ?? '(no report)'}

${SAVE('build-check.md', 'each item checked and each fix made')}

1. Read git -C ${WT} status and the full diff. Check every point of the design (§3, §4 and every §7 disposition) is built, consistently between code and docs (the README, ADR, skill and reviewer text must describe exactly what the code does: file names, header lines, PUBLIC line, summary section, CLI flags). Fix any gap or inconsistency yourself.
2. Confirm docs/product/domain-model.md is unchanged (git diff empty) and that no file of /tmp/claude-0/pr42-files.txt is changed except docs/product/test-matrix.md.
3. Confirm packages/db/functions has 337 .sql files plus README.md, and regenerate once more on a fresh scratch database (create tp_dbf_chk on 5433, migrate, pnpm db:domain-model --check --strict, which must pass both the document and the directory; then drop tp_dbf_chk).
4. Also as a read-only check on #42's migration: copy packages/db/migrations into a temp dir, add #42's migration fetched with git -C /home/user/PhysicalTherapy fetch -q origin pull/42/head:refs/remotes/origin/pr42 and git show origin/pr42:packages/db/migrations/20261107090000_mail_streams.sql, migrate a scratch database tp_dbf_pr42 with that dir (MIGRATIONS dir via the migrate API or the CLI's option; read packages/db/src/migrate.ts / cli/migrate.ts), run the generator with --functions <a temp dir> and --out <a temp file> against it, and report which function files #42 would add, change or remove, with the diff stats. Write nothing of it into the worktree. Drop tp_dbf_pr42.
5. Run once: flock pnpm typecheck; flock pnpm lint; the unit tests of packages/db, packages/compliance and tools/test; DATABASE_URL=... flock pnpm vitest run (or the repo's db config) on packages/db/src/domain-model/*.db.test.ts. Read package.json/vitest config for how test:db selects files. All must pass; fix failures.
6. Adversarially re-read the diff for what CI would reject (actionlint is not affected; the fixture guard; gitleaks patterns like long hex in files; lint rules; a test that hard-codes counts that change).

Report as JSON-like text: the list of files changed, test counts per file you ran, every check and result, the #42 read-only result, fixes you made, and anything unresolved.`, { label: 'checker', phase: 'Check' })
return { code: built[0], docs: built[1], check }