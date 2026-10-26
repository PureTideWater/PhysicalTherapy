# 0068. Write each database function to its own generated file, check the files beside the domain model, and open each approval with their diffs

- **Status:** accepted (`co-001/db-function-diffs`, combined audit #111). Builds on
  [0063](0063-protect-main-and-the-build-branch-make-the-founders-github-review-the-approval-of-record-open-each-approval-with-what-changed-and-switch-on-the-edit-hooks.md)
  (the approval of record and the summary that opens each approval, which gains a section here) and
  [0066](0066-run-ci-as-parallel-jobs-behind-one-gate-measure-mutation-on-every-money-package-move-the-browser-and-runner-together-and-pin-every-dependency.md),
  Part 1 (the `domain model` job and the database suite's drift case, both of which now check the files too). It
  amends neither: no workflow, required check, ruleset or approval rule changes.
- **Date:** 2026-10-26
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (item
  #111, "Show database function changes as readable diffs", among it, placed before PR 8's migrations), under the
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
generator reads the definitions in `readCatalog`, under `readDatabase`'s pinned settings and inside the same READ ONLY
snapshot it reads the document from, so the files and the document always describe the same schema. `--functions DIR`
writes them elsewhere (resolved against `INIT_CWD`, as `--out` is). Each overload is:

- a header line with the signature exactly as Appendix C prints it, and a line labelled for what it is:
  `-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: <16 hex digits>`, computed by
  the one helper Appendix C uses (a SQL-standard body, which has no dollar quotes, is labelled
  `(the SQL-standard body only, from RETURN or BEGIN ATOMIC)` instead);
- one `-- Trigger function of: <table>.<trigger>` line per trigger that calls it, in C order, or `(none)`;
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
that would let a tool collapse the file. Each file is LF only and ends with one newline. A name outside
`^[a-z_][a-z0-9_]*$` or over 63 bytes is refused (exit 2), so no name can leave the directory or collide with another
by case. `packages/db/functions/README.md`, written by hand, says what the files are and how to read their diffs; the
generator owns only the `*.sql` files there.

**Why one file per name:** the path stays the same for as long as the name does, so
`git log -p packages/db/functions/allowed_practice_ids.sql` is that function's whole history, read from the catalog.
A changed argument list, which PostgreSQL makes a DROP and a CREATE, shows as a diff of that file rather than one file
deleted and another added, and a new overload of a scope function shows inside the file of the function it overloads.

### Drift, where it already runs

`--out` writes each changed file and removes each `*.sql` no function produces; it never follows a symlink and
touches no other entry. `--check` compares the directory as well as the document, reports both, and exits 1 if either
differs, listing every missing, extra and differing file with its first differing line and the command that
regenerates it; any entry git would commit other than the generated files and the README (a stray file, a directory,
a symlink) fails it too. The database suite gains its own drift file for them (`function-files.db.test.ts`, beside the
document's `domain-model.db.test.ts`, which stays the suite's one case on the document), so the `db` job fails a migration merged without its function
files, and ci.yml's `domain model` job, which runs `--check --strict --require-approval`, now checks them too. No
workflow changes. The provenance line's "uncommitted changes to its inputs" leaves `packages/db/functions` out (an
output of the generator, not an input), and a test holds that a migration edited in the working tree is still
flagged.

### The summary shows the changed lines

`--summary-since REF`, which opens every domain-model pull request and is written to the `domain model` job's summary
(ADR 0063; ADR 0066, Part 1), gains a section, "Function definitions changed since REF": every file under
`packages/db/functions` that differs between REF and the files this run has (the generated set under `--out` or
`--check`, otherwise the working tree), each as a unified diff in a fenced `diff` block, produced by git itself
(`git diff --no-index` over two temporary directories). SECURITY DEFINER functions and the functions that set the
tenant scope come first, then the rest by name. So the founder reads, in the copy the code wrote, exactly which lines
of which function changed, including a header-only change (a DEFAULT, STRICT, LEAKPROOF, an owner, a grant) that
Appendix C does not show. When REF has no `packages/db/functions` (the pull request that adds them), the section is one
line: the base has no function files, N files added, nothing to compare.

### The binding to the approved document

The founder still approves the document's text by its SHA-256, and the approval of record is still the founder's
APPROVED GitHub review of the pull request's latest commit (ADR 0063). The function files are not part of that text,
and their diffs are not an approval. What ties them to what the founder signed is the drift check, which holds the
committed files to a freshly migrated database in the same run that holds the document to it, and Appendix D, which
lists every applied migration's SHA-256 inside the signed text: the migrations the founder approved build exactly
these functions, and CI fails if the committed files say otherwise. The body-hash line only lets a reader match a file
to its Appendix C row; it covers the body alone, not the header or the privileges, and binds nothing by itself.
`docs/product/domain-model.md`'s text, and so its SHA-256 and the founder's approval of 2026-10-23, are unchanged by
this decision: a test asserts the document is byte-identical with and without the new catalog fields.

### Determinism

The files carry no timestamp, commit, database name, OID or collation-dependent order. The definitions are printed by
PostgreSQL under the generator's pinned `search_path`, `DateStyle`, `IntervalStyle` and `TimeZone`, and DBF-01 opens
its connection with different values of each and gets the same files. `pg_get_functiondef()`'s layout belongs to the
PostgreSQL major version, as the document's catalog text already does: CI runs the floating `postgres:18` image tag,
as for the document, and a new major version may change the files' layout without any function changing. That
regeneration is its own pull request, reviewed as layout alone.

### What the generator leaves out or refuses

- **Extension members** (`pg_depend.deptype = 'e'`) are left out: their definitions belong to the extension's version,
  not to a migration. None exists today.
- **Aggregates** (`prokind = 'a'`) are refused with an error naming the aggregate and asking for generator support
  (exit 2), never a crash or a guessed rendering, since `pg_get_functiondef()` does not print them. None exists today.
  Procedures (`p`) and window functions (`w`) render like functions.

### How GitHub and editors treat the files

- `.gitattributes` marks `packages/db/functions/*.sql` `linguist-generated=false`, so neither the attribute nor
  Linguist's own heuristics collapse the diffs in "Files changed"; `tools/test/function-files.test.ts` pins it. GitHub
  lists `functions/` above `migrations/`, so a schema pull request shows each changed function, then the migration
  that changed it.
- `.github/CODEOWNERS` names the founder on `/packages/db/functions/`, under "The schema and its approval".
- `.editorconfig` unsets `trim_trailing_whitespace` and `insert_final_newline` under `packages/db/functions/**`, as
  for `fixtures/**`, so no editor rewrites a body PostgreSQL prints verbatim.

### Who reads the diffs

- `/new-migration` (`.claude/skills/new-migration/SKILL.md`) regenerates with `--out`, commits the function files in
  the same pull request, and reports each changed function as its file's diff, not its migration block.
- The security reviewer (`.claude/agents/security-reviewer.md`) reads the `packages/db/functions/*.sql` diffs of a
  migration first, against a checklist: SECURITY DEFINER without `SET search_path`, or with `pg_temp` anywhere but
  last; LEAKPROOF added; STRICT removed; a volatility change on a function a policy calls; any GRANT to PUBLIC or a
  widened grant; an owner change; a new overload of a scope function; an `app.practice_ids` read removed or changed.
- The founder: the governance runbook's step 6 now says the summary shows each changed function's lines, and "Files
  changed" shows `packages/db/functions` beside the migration.
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

## Notices (decided by the build under the standing rule; the founder can reverse any)

- **N1.** No "Defined by" line; each file's history is `git log -p` on it.
- **N2.** The files are `linguist-generated=false` explicitly, and code-owned by the founder.
- **N3.** Aggregates are refused rather than rendered by hand-written SQL until one exists.

## Consequences

- **Every future migration pull request** commits its changed function files with the regenerated document, or both
  the `db` job's drift case and the `domain model` job fail. The founder reads each changed function as a diff in the
  `domain model` job's summary, at the top of the description, and in "Files changed"; a recreation that changes
  nothing changes no file. The pull request that adds the files adds 337 generated files, which need no line-by-line
  reading: CI holds each to the migrated database.
- **#42 (open, with migration `20261107090000_mail_streams.sql`):** once this merges, #42's next
  `pnpm db:domain-model --out` writes its function files, and its drift case fails until it commits them. That commit
  must come before the founder signs #42's approval line, since any later commit dismisses the approval of record
  (ADR 0063, step 5).
- `packages/db/functions/*.sql` is never edited by hand; a hand edit fails `--check`. A guard in
  `.claude/hooks/protect-content.sh` and a CLAUDE.md "Never" line would refuse it at the edit; both are the founder's
  to add, and are proposed in the pull request.
- A move to a new PostgreSQL major version may regenerate every file for layout alone.
- The checks that prove this holds: DBF-01 to DBF-05 (`docs/product/test-matrix.md`), the drift file
  `function-files.db.test.ts`, the `domain model` job's `--check`, `tools/test/codeowners.test.ts` and
  `tools/test/function-files.test.ts`.

## Revisit when

The schema gains its first aggregate or extension member, PostgreSQL's major version changes, a second schema beside
`public` holds functions, Appendix C's introduction is next regenerated (one sentence there can point at the files,
under a new approval), or the founder adds the hook that refuses hand edits.
