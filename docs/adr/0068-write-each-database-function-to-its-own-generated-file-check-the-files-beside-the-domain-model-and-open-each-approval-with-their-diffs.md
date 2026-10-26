# 0068. Write each database function to its own generated file, check the files beside the domain model, and open each approval with their diffs

- **Status:** accepted (`co-001/db-function-diffs`, combined audit item 111). Builds on
  [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md)
  (the approval of record and the summary that opens each approval, which gains a section here) and
  [0066](0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md),
  Part 1 (the `domain model` job and the database suite's drift case, both of which now check the files too). It
  amends neither: no workflow, required check, ruleset or approval rule changes.
- **Date:** 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (item
  111, "Show database function changes as readable diffs", among it, placed before PR 8's migrations), under the
  standing rule of 2026-10-18; the build (Lane B), for the notices below, decided under that rule and each reversible
  by the founder
- **PRD sections:** 16 (Security and compliance engineering: row-level security as the tenancy boundary), 17 (How to
  work: review before merge), 18 (Testing and release); Change Order 001, CO-02 and rule 4; test matrix DBF-01 to
  DBF-05; ADRs 0063 and 0066

## Context

The rules that never bend live, in the database, in functions: the tenancy scope (`allowed_practice_ids()`,
`effective_practice_access()`, the `app_actor_*` functions), the append-only and approval guards, the ledger's
triggers. At `6ddd587` the schema holds 338 functions under 337 names in schema `public` (one overloaded name,
`submit_prospect_request`), every one a plain function (`prokind = 'f'`) owned by `tp_owner`, 148 of them SECURITY
DEFINER, one (`screening_standing`) with a SQL-standard body. What the audit found, checked against the tree:

- A migration changes a function by copying the whole `CREATE OR REPLACE FUNCTION` into a new file: at `6ddd587`,
  22 of the 44 migrations recreate a function an earlier one created, 53 names in all, `effective_practice_access()`
  four times. A reviewer sees a new 40-line block, not the one line that changed, and has to find the previous
  definition in any of up to five earlier migrations and diff it by hand.
- `docs/product/domain-model.md`, Appendix C, shows each function's body only as the first 16 hex digits of its
  SHA-256. The founder approves the document by its hash (CO-02; ADR 0063), so a changed body is visible to the
  founder as a changed hash, never as the change: a one-line change to row-level security or a ledger rule is approved
  blind.
- Appendix C prints the signature, return type, language, security, volatility, `SET` options and EXECUTE grantees,
  but not an argument's DEFAULT, STRICT, LEAKPROOF, parallel safety, cost or the owner, so a change to any of those
  appears nowhere a reviewer reads, not even as a hash.
- Git history holds each migration, never a function: no command shows how `allowed_practice_ids()` came to read as
  it does.

The approved document's text, and so its SHA-256 and the founder's approval, must not change to fix this: a change to
the text would ask the founder to approve again for no change to the schema, and would make a 7,000-line document
longer.

## Decision

### One generated file per function name

`pnpm db:domain-model --out` writes, beside the document, one file per function name to `packages/db/functions/`:
`packages/db/functions/<name>.sql`, every overload of the name in that one file, sorted by signature in C order. The
generator reads the definitions in `readCatalog`, under `readDatabase`'s pinned settings, in the same READ ONLY
transaction it reads the document from, on a database nothing else is migrating, so the files and the document always
describe the same schema. (`pg_get_functiondef()` reads the catalog's latest state rather than the transaction's
snapshot, as PostgreSQL's other deparse functions do, so the guarantee is the quiet scratch database, not the
snapshot.) `--functions DIR` writes them elsewhere (resolved against `INIT_CWD`, as `--out` is). Each overload is:

- a header line with the signature exactly as Appendix C prints it, and a line labelled for what it is:
  `-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: <16 hex digits>`, computed by
  the one helper Appendix C uses (a SQL-standard body, which has no dollar quotes, is labelled
  `(the SQL-standard body only, from RETURN or BEGIN ATOMIC)` instead);
- one `-- Trigger function of: <table>.<trigger>` line per trigger that calls it, in C order, or `(none)`;
- one `-- Called by policy: <table>.<policy>` line per row-level security policy whose `USING` or `WITH CHECK`
  expression calls it directly (read from `pg_depend` on `pg_policy`), in C order, or `(none)`, so a reviewer sees
  which policies a change of volatility, strictness or body reaches (a policy that reaches it only through another
  function is listed in that function's file);
- one `-- Event trigger: <name> ON <event>` line per event trigger that calls it (`pg_event_trigger`), in C order,
  only when there is one (none is, today);
- the definition as `pg_get_functiondef()` prints it: the arguments with their defaults, the return type, language,
  volatility, SECURITY DEFINER, LEAKPROOF, strictness, parallel safety, cost, rows, every `SET`, and the body as the
  catalog holds it, with the one trailing newline PostgreSQL adds removed before the `;`;
- the privileges, every line explicit: `ALTER FUNCTION ... OWNER TO <owner>;`, then `REVOKE ALL ... FROM PUBLIC;`
  when PUBLIC lacks EXECUTE or `GRANT EXECUTE ... TO PUBLIC;` when it holds it, one `GRANT EXECUTE ... TO <role>;` per
  grantee in C order (`WITH GRANT OPTION` where grantable, `GRANTED BY <role>` when the grantor is not the owner), and
  `REVOKE EXECUTE ... FROM <owner>;` when the owner revoked its own; all read through
  `aclexplode(coalesce(proacl, acldefault('f', proowner)))`, so a function never granted shows its defaults;
- `COMMENT ON FUNCTION` when the function has a comment (none has today).

A two-line banner opens each file: it names the command and this ADR, and says to change the function in a new
migration and regenerate, never to edit the file. It avoids the conventional markers (`@generated`, "DO NOT EDIT")
that would let a tool collapse the file. Each file is LF only, ends with one newline and has mode 100644. A function
name outside `^[a-z_][a-z0-9_]*$` or over 63 bytes is refused (exit 2), so no name can leave the directory or collide
with another by case; and every file name the tool reads back, from the directory or from a git tree, must match
`^[a-z_][a-z0-9_]*\.sql$`, or it is reported as a refused entry and never diffed. `packages/db/functions/README.md`,
written by hand, says what the files are and how to read their diffs; the generator owns only the `*.sql` files there
that open with its banner.

**Why one file per name:** the path stays the same for as long as the name does, so
`git log -p packages/db/functions/allowed_practice_ids.sql` is that function's whole history, read from the catalog.
A changed argument list, which PostgreSQL makes a DROP and a CREATE, shows as a diff of that file rather than one file
deleted and another added, and a new overload of a scope function shows inside the file of the function it overloads.

### Drift, where it already runs

`--out` checks the directory before it writes anything, the document included, and writes nothing if it refuses: a
symlinked directory, an entry git would commit that is neither a generated file nor the README, a name that does not
match, or a `*.sql` file that does not open with the generator's banner. It then writes each changed file and removes
each stale `*.sql` no function produces, only when that file's first line is the banner; a `*.sql` without the banner
refuses the run (exit 2) and names every such file, so `--functions` pointed by mistake at `packages/db/migrations` or
any other directory of SQL deletes nothing. It never follows a symlink, and it refuses (exit 2) any other entry git
would commit but the README (a stray file, a directory), as `--check` reports it, before writing anything.

`--check` compares the directory as well as the document, reports both, and exits 1 if either differs, listing every
missing, extra and differing file with its first differing line and the command that regenerates it; any entry git
would commit other than the generated files and the README (a stray file, a directory, a symlink, a refused name)
fails it too, a function file with an executable bit fails it, a generated file git ignores is reported as "ignored by
git" (it would never be committed) rather than missing, and a directory that does not exist is one line, not one per
function. A symlinked directory is refused (exit 2) by `--check`, `--out` and `--summary-since` alike.

The exit codes are the domain model's: 0 when everything matches, 1 when the document or the directory differs (or,
with `--require-approval`, the approval is missing or wrong), and 2 when the tool refuses or cannot run, including
every git or file-system failure on the function paths, reported with git's own message (a blob missing from a
shallow clone adds the hint to fetch the full history, `fetch-depth: 0`). A custom `--out FILE` or `--check FILE`
without `--functions DIR` is refused (exit 2, "give --functions DIR with a custom FILE"), so a preview of the document
written elsewhere never rewrites or prunes the repository's own function files.

The database suite gains its own drift file for them (`function-files.db.test.ts`, beside the document's
`domain-model.db.test.ts`, which stays the suite's one case on the document), so the `db` job fails a migration merged
without its function files, and ci.yml's `domain model` job, which runs `--check --strict --require-approval`, now
checks them too. No workflow changes. The provenance line's "uncommitted changes to its inputs" leaves
`packages/db/functions` out (an output of the generator, not an input), and a test holds that a migration edited in the
working tree is still flagged.

### The summary shows the changed lines

`--summary-since REF`, which opens every domain-model pull request and is written to the `domain model` job's summary
(ADR 0063; ADR 0066, Part 1), gains a section, "Function definitions changed since REF". It compares the files at
`git merge-base REF HEAD` (when HEAD is a commit with that base, so a base that has moved on since the branch was cut
does not show other pull requests' changes as reversals here), and names the commit it compared, with the files this
run has: the generated set under `--out` or `--check`, otherwise the directory as the working tree holds it (in CI,
the committed files). The document section above it is unchanged and still compares with REF itself. The section
has three parts, in order:

1. One line saying which files these are (the committed files, or the files this run generated) and that `--check`,
   a required step of the same job, proves the committed files equal the migrated catalog: the same guarantee the
   document section rests on.
2. A compact list of every changed file with its added and removed line counts (`+N/-M`) and its flags (added,
   removed, and "SECURITY DEFINER, tenant scope, privileges or PUBLIC"), the flagged files first, then the rest by
   name. A file is flagged when its header (from `CREATE` to the `AS`, `RETURN` or `BEGIN ATOMIC` line, never the
   body's prose) says SECURITY DEFINER or sets `app.practice_ids` or `app.actor_id`, when it reads or sets the tenant
   scope (`current_setting('app.practice_ids')` or `current_setting('app.actor_id')`, `set_config('app.…')`), when
   either side grants it to PUBLIC, or when its diff touches a GRANT, REVOKE, OWNER, LEAKPROOF, STRICT, SECURITY or SET
   line.
3. "Diffs": each file's unified diff in a fenced `diff` block, in the list's order, produced by git itself
   (`git diff --no-index` over two temporary directories), until a budget of 900,000 bytes (UTF-8) for the whole function
   section (under GitHub's 1 MiB job summary), then one line naming every file whose diff was left out, which
   "Files changed" shows.

`--function-diffs list|full` chooses the form (default `full`). `list` prints exactly the same output without the
Diffs part, a byte prefix of the full output, for the pull request's description, which GitHub caps at 65,536
characters; the `domain model` job's summary carries the full form. The founder compares the list in the description
with the list in the CI copy, which is the one that counts, and reads the diffs there and in "Files changed". So the
founder reads, in the copy the code wrote, exactly which lines of which function changed, including a header-only
change (a DEFAULT, STRICT, LEAKPROOF, an owner, a grant) that Appendix C does not show. When the base holds no
generated `*.sql` file (the pull request that adds them, even if a README is already there), the section is one line:
the base has no function files, N files added, nothing to compare.

CI's summary step runs before the job migrates its database, so it reads the committed files; the job's `--check`
step then fails if those files differ from the migrated catalog, which is why the section's first line says so rather
than the summary regenerating them. Running the renderer from the base branch's code, so that a pull request cannot
change what its own summary shows, needs a workflow change and is proposed separately.

### The binding to the approved document

The founder still approves the document's text by its SHA-256, and the approval of record is still the founder's
APPROVED GitHub review of the pull request's latest commit (ADR 0063). The function files are not part of that text,
and their diffs are not an approval. What ties them to what the founder signed is the drift check, which holds the
committed files to a freshly migrated database in the same run that holds the document to it, and Appendix D, which
lists every applied migration's SHA-256 inside the signed text: the migrations the founder approved build exactly
these functions, and CI fails if the committed files say otherwise. The body-hash line only lets a reader match a file
to its Appendix C row; it covers the body alone, not the header or the privileges, and binds nothing by itself.
`docs/product/domain-model.md`'s text, and so its SHA-256 and the founder's approval of 2026-10-23, are unchanged by
this decision: a database test (`function-files.db.test.ts`, "renders the same text and SHA-256 from the catalog with
every field only the files print changed") renders the document from a migrated database's catalog and from the same
catalog with every field this decision adds changed, and asserts the text and its SHA-256 are equal.

### Determinism

The files carry no timestamp, commit, database name, OID or collation-dependent order. The definitions are printed by
PostgreSQL under the generator's pinned settings, each a `SET LOCAL` in the reading transaction: `search_path`,
`DateStyle`, `IntervalStyle` and `TimeZone`, and `quote_all_identifiers = off`, `standard_conforming_strings = on`,
`extra_float_digits = 1` and `bytea_output = 'hex'` (each PostgreSQL's default, so pinning them changed neither the
document nor any file). A database or role setting such as `quote_all_identifiers = on` would otherwise quote every
name in every file. DBF-01 opens its connection with different values (another `search_path`, `DateStyle`,
`IntervalStyle` and `TimeZone`, `quote_all_identifiers = on`, `extra_float_digits = 3`) and gets the same files.

The summary's diffs do not depend on the machine either. Every git call on the summary path runs with the system and
global git configuration switched off (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, no
`GIT_CONFIG_COUNT`/`KEY`/`VALUE`) and `-c core.attributesFile=/dev/null`, and diffs with
`--text -U3 --diff-algorithm=myers --no-indent-heuristic --inter-hunk-context=0 --no-renames`, so a user's
`diff.context`, `diff.algorithm` or an attribute that marks `*.sql` binary changes nothing, and the build's local copy
and CI's agree line for line; a unit test sets `diff.context=0` through `GIT_CONFIG_*` and gets the same output.
`.gitattributes` gives the files `text eol=lf`, so a checkout with `core.autocrlf=true` still holds them LF and
`--check` compares the same bytes everywhere.

`pg_get_functiondef()`'s layout belongs to the
PostgreSQL major version, as the document's catalog text already does: CI runs the floating `postgres:18` image tag,
as for the document, and a new major version may change the files' layout without any function changing. That
regeneration is its own pull request, reviewed as layout alone.

### What the generator leaves out or refuses

- **Extension members** (`pg_depend.deptype = 'e'`) are left out: their definitions belong to the extension's version,
  not to a migration. None exists today.
- **Aggregates** (`prokind = 'a'`) are refused with an error naming the aggregate and asking for generator support
  (exit 2), never a crash or a guessed rendering, since `pg_get_functiondef()` does not print them. None exists today.
  Procedures (`p`) and window functions (`w`) render like functions.
- **Functions in any schema other than `public`** (apart from `pg_catalog`, `information_schema`, `pg_toast*`,
  `pg_temp*` and extension members) are refused with an error naming each one (exit 2). None exists today; the refusal
  is a tripwire, so a migration cannot add a schema holding a SECURITY DEFINER function that has no file, no diff and
  no catalog-test check, and the first such function asks for this decision to be extended rather than going unseen.

### How GitHub and editors treat the files

- `.gitattributes` marks `packages/db/functions/*.sql` `linguist-generated=false text eol=lf`, so neither the
  attribute nor Linguist's own heuristics collapse the diffs in "Files changed", and no checkout converts their line
  endings; `tools/test/function-files.test.ts` pins exactly those attributes, reading them with the global and system
  git configuration switched off. GitHub
  lists `functions/` above `migrations/`, so a schema pull request shows each changed function, then the migration
  that changed it.
- `.github/CODEOWNERS` names the founder on `/packages/db/functions/`, under "The schema and its approval".
- `.editorconfig` unsets `trim_trailing_whitespace` and `insert_final_newline` under `packages/db/functions/**`, as
  for `fixtures/**`, so no editor rewrites a body PostgreSQL prints verbatim.

### Who reads the diffs

- `/new-migration` (`.claude/skills/new-migration/SKILL.md`) regenerates with `--out`, commits the function files in
  the same pull request, opens the description with the summary's `--function-diffs list` form, and reports each
  changed function as its file's diff, not its migration block.
- The security reviewer (`.claude/agents/security-reviewer.md`) reads the `packages/db/functions/*.sql` diffs of a
  migration first, against a checklist: SECURITY DEFINER without `SET search_path` naming `pg_catalog` first and
  `pg_temp` explicitly last; a new `set_config` or `SET` of `app.practice_ids` or `app.actor_id`, or one with
  `is_local` false; `EXECUTE` of built SQL in a definer without `format()`'s `%I`/`%L` or `quote_*`; LEAKPROOF added;
  STRICT removed; a volatility change on a function a policy calls (its `-- Called by policy:` lines); any GRANT to
  PUBLIC or a widened grant; an owner change; a new overload of a scope function (`allowed_practice_ids`,
  `effective_practice_access`, `practice_in_scope`, `open_practice_scope`, the `app_actor_*` functions); a read of
  `app.practice_ids` or `app.actor_id` removed or changed, or a scope check removed.
- The founder: the governance runbook's step 6 now says the CI copy of the summary lists each changed function and
  shows its lines, that the description's list must match it, and that "Files changed" shows `packages/db/functions`
  beside the migration.
- CO-02's compliance control (`packages/compliance/src/controls.ts`) names the function files checked beside the
  document.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A diff tool over migrations, finding each function's previous definition by parsing SQL | Reconstructs what the catalog already knows, misses `ALTER FUNCTION` (the tenancy hardening's `SET search_path` inside a `DO` block) and grants, and leaves nothing in git history |
| The bodies inside the domain model document | Changes the approved text and its hash for no schema change, and makes a 7,000-line document longer; the audit's best option keeps the text unchanged |
| One file per signature | A changed argument list becomes a delete and an add, and a new overload scatters a name's history; per name reads more clearly in review |
| Marking the files `linguist-generated` (or leaving Linguist to guess) | GitHub would collapse exactly the diffs this exists to show |
| A "Defined by" line naming every migration that creates the function (the design's first draft; review finding R1) | Read from migration text, it sees CREATE statements only, so for the tenancy functions it would name the wrong migration and miss the hardening that set their `search_path`; `git log -p` on the file gives the true history, from the catalog |
| The body-hash line as the binding to the approved document | It covers the body alone, not the header or the privileges, and a reader cannot recompute it from the file without knowing which text it hashes; the drift check and Appendix D's migration hashes already bind the files to what was signed |
| A pointer per changed function in the summary (`(diff: packages/db/functions/<name>.sql)`) | Sends the founder to a second place, which the GitHub app shows less well; the summary carries the diffs themselves |
| Every diff in the pull request's description, with no budget (this pull request's first draft; review findings T1 and S4) | A migration like #42's prints about 105,000 characters of function section (about 150,000 for the whole summary), past GitHub's 65,536-character description limit, and a PostgreSQL major-version regeneration would pass the 1 MiB job summary; the description carries the list, the job summary the diffs up to a budget, and "Files changed" all of them |
| Only the diffs of sensitive functions in the summary | Picks for the founder which changes to read; every changed file is listed, and every diff is shown up to the budget |
| Regenerating the files inside the summary step | CI's summary runs before the job migrates its database; `--check` in the same job already proves the committed files equal the migrated catalog, which the section says in its first line |

## Notices (decided by the build under the standing rule; the founder can reverse any)

- **N1.** No "Defined by" line; each file's history is `git log -p` on it.
- **N2.** The files are `linguist-generated=false` explicitly, and code-owned by the founder.
- **N3.** Aggregates are refused rather than rendered by hand-written SQL until one exists.
- **N4.** The description carries the summary's `--function-diffs list` form and the job summary the full form, with
  a 900,000-byte budget for the function section.
- **N5.** Functions outside `public` are refused rather than given files, until one is needed.
- **N6.** The function section compares at `git merge-base REF HEAD`; the document section still compares with REF.

## Consequences

- **Every future migration pull request** commits its changed function files with the regenerated document, or both
  the `db` job's drift case and the `domain model` job fail. The founder reads each changed function as a diff in the
  `domain model` job's summary, at the top of the description, and in "Files changed"; a recreation that changes
  nothing changes no file. The description lists the changed files, the job summary shows their diffs up to the
  budget, and "Files changed" shows every one. The pull request that adds the files adds 337 generated files, which
  need no line-by-line reading: CI holds each to the migrated database.
- **#42 (open, with migration `20261107090000_mail_streams.sql`):** once this merges, #42's next
  `pnpm db:domain-model --out` writes its function files, and its drift case fails until it commits them. That commit
  must come before the founder signs #42's approval line, since any later commit dismisses the approval of record
  (ADR 0063, step 5).
- `packages/db/functions/*.sql` is never edited by hand; a hand edit fails `--check`. A guard in
  `.claude/hooks/protect-content.sh` and a CLAUDE.md "Never" line would refuse it at the edit; both are the founder's
  to add, and are proposed in the pull request's description and in Lane B's status file.
- A move to a new PostgreSQL major version may regenerate every file for layout alone.
- The checks that prove this holds: DBF-01 to DBF-05 (`docs/product/test-matrix.md`), the drift file
  `function-files.db.test.ts` (which also runs the command itself against a scratch database for its exit codes and
  messages), the `domain model` job's `--check`, `tools/test/codeowners.test.ts` and
  `tools/test/function-files.test.ts`.

## Revisit when

The schema gains its first aggregate or extension member, PostgreSQL's major version changes, a migration needs a
function in a schema other than `public` (the generator refuses it today), the base-ref renderer is adopted in CI,
Appendix C's introduction is next regenerated (one sentence there can point at the files,
under a new approval), or the founder adds the hook that refuses hand edits.
