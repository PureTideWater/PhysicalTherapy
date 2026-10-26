# PR #46 review dispositions (fix round). Every finding is taken unless stated. Full findings: pr-review-findings.json.

## Summary size (T1 blocking, S4)
- renderFunctionChanges prints, in order: (1) one line stating these are the committed (or generated) files and that `--check` proves they equal the migrated catalog (S1); (2) a compact list of every changed file with +N/-M and its flags; (3) "Diffs": full unified diffs in order until a budget (default 900,000 characters for the whole function section), then one line naming the files whose diffs were left out ("see Files changed").
- New flag `--function-diffs list|full` (default full). `list` prints exactly the same output without the Diffs subsection (a byte prefix of the full output), for the PR description, which GitHub caps at 65,536 characters.
- Template, README, skill and runbook: the description carries the `--function-diffs list` form; CI's job summary carries the full form; the list must match the CI copy's list; the diffs are in the job summary and Files changed. Test the budget and the prefix property.

## Determinism (T2/N1, T3/N2, T12/N6, T15)
- readDatabase also pins SET LOCAL quote_all_identifiers = off, standard_conforming_strings = on, extra_float_digits = 1, bytea_output = 'hex' (all defaults, so the document is unchanged; verify). DBF-01's alternate-settings case also sets quote_all_identifiers = on, extra_float_digits = 3.
- Every git call in the summary path runs with env GIT_CONFIG_NOSYSTEM=1, GIT_CONFIG_GLOBAL=/dev/null, no GIT_CONFIG_COUNT/KEY/VALUE, and `-c core.attributesFile=/dev/null`; diff with `--text -U3 --diff-algorithm=myers --no-indent-heuristic --inter-hunk-context=0 --no-renames`. Unit test: GIT_CONFIG_* diff.context=0 leaves the output unchanged.
- .gitattributes: `packages/db/functions/*.sql linguist-generated=false text eol=lf`; tools/test/function-files.test.ts allows exactly that and runs check-attr with the global and system config isolated.
- compareFunctionDirectory refuses an executable bit; functionFilesAtCommit accepts only mode 100644.
- T15: ADR/README wording: "in the same READ ONLY transaction, on a database nothing else is migrating".

## Errors and CLI (T4/N4, T5, T7, N5, T9, T13, T8)
- Every git/fs failure in the function paths becomes a DomainModelError -> exit 2 with git's stderr (missing blob: hint fetch-depth 0).
- A custom `--out FILE` or `--check FILE` without `--functions DIR` is refused (exit 2): "give --functions DIR with a custom FILE".
- --out validates the directory (symlink, blocked entries, non-generated *.sql) before writing anything; writes nothing if refused.
- readFunctionDirectory refuses a symlinked directory and non-conforming names.
- A missing directory reports one line, not one per function.
- An ignored generated file is its own category ("ignored by git").
- CLI tests: a db test spawns the CLI (tsx) against a scratch database: --check with a doc edit and a stray file -> exit 1 and both messages; symlinked dir -> exit 2; custom FILE without --functions -> exit 2; INIT_CWD-relative --functions; --out writes the directory.

## Safety (S2, S3, T14/N3, T10)
- Functions in any schema other than public (excluding pg_catalog, information_schema, pg_toast*, pg_temp*, and extension members) are refused by the generator with a DomainModelError naming them (a tripwire; none exist today; verify).
- writeFunctionDirectory removes a stale *.sql only if its first line is the banner; a *.sql without the banner refuses the run (exit 2), listing them. DBF-04 case.
- Every name read from a directory or a tree must match ^[a-z_][a-z0-9_]*\.sql$ (fileNameProblem); anything else is refused / reported as a refused entry, never diffed.
- Bootstrap line when the base has no generated *.sql (README only or empty).

## Ranking and content (S5, T11, I1, S6, I3, T16, T6, T17)
- sensitiveFunctionFile reads only the header (from CREATE to the AS/RETURN/BEGIN ATOMIC line) for SECURITY DEFINER, plus: SET of app.practice_ids/app.actor_id, current_setting('app.practice_ids'|'app.actor_id'), set_config('app.…'), and any GRANT ... TO PUBLIC on either side; also rank first any file whose diff touches a GRANT/REVOKE/OWNER/LEAKPROOF/STRICT/SECURITY/SET line. Label: "SECURITY DEFINER, tenant scope, privileges or PUBLIC".
- I1: each overload's header gains "-- Called by policy: <table>.<policy>" (pg_depend from pg_policy, C order, or "(none)") and "-- Event trigger: <name> ON <event>" lines (pg_event_trigger), one per line in C order (only when any). Regenerate all files.
- S6: checklist (security-reviewer.md, new-migration skill, functions README): "SECURITY DEFINER without SET search_path naming pg_catalog first and pg_temp explicitly last"; "a new set_config or SET of app.practice_ids or app.actor_id, or one with is_local false"; "EXECUTE of built SQL in a definer without format %I/%L or quote_*"; plus the existing items.
- I3: README "What is not here": functions outside public (refused), event triggers listed.
- T16: DBF-02's probe also adds a procedure with a comment and a grantable grant (GRANTED BY shown if feasible) and a BEGIN ATOMIC function; assert their files. DBF-01's name comparison excludes extension members (comment).
- T6: a test that renders the document from a catalog and from the same catalog with every new function field changed: text and documentSha256 equal.
- T17: the function section compares the files at `git merge-base REF HEAD` (when HEAD is a commit with that base) and names that commit; the document section is unchanged (a proposal).

## Not taken in this PR
- I2 (run the renderer from the base ref in CI): a workflow change; recorded as a proposal in the status file.
- S1 workflow step: not needed; the section states that `--check` (a required step) proves the committed files equal the migrated catalog, the same guarantee the document section rests on.
