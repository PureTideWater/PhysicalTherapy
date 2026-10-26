## What changes

Nobody using the product sees a change. What changes is schema review: from now on, each changed database function shows up as a readable diff.

- **One generated file per database function name.** `pnpm db:domain-model --out` now also writes `packages/db/functions/<name>.sql` (337 files today, for 338 functions; the overloads of `submit_prospect_request` share one file).
  - The files come from the same READ ONLY catalog snapshot as the domain model.
  - Each overload shows:
    - its signature, exactly as Appendix C prints it;
    - its body hash, labelled as covering the body only, and equal to Appendix C's;
    - one line per trigger that calls it, one per policy that calls it, and one per event trigger;
    - `pg_get_functiondef` under the generator's pinned settings;
    - the owner;
    - every privilege as an explicit statement. PUBLIC always gets a line (a REVOKE, or a GRANT), so opening a function to PUBLIC adds a line. `GRANTED BY`, `WITH GRANT OPTION` and an owner that revoked its own EXECUTE are shown as well;
    - its comment.
  - A migration that changes one line of a function now shows exactly that line in Files changed, and `git log -p packages/db/functions/<name>.sql` is the function's whole history.
- **What is refused or left out.** The generator refuses each of these with a clear error (exit 2):
  - aggregates;
  - functions in any schema other than `public`, a tripwire (none exist);
  - function names outside `^[a-z_][a-z0-9_]*$`, or over 63 bytes.

  Extension members are left out.
- **Determinism.** The generator pins every setting that changes PostgreSQL's printing (search_path, DateStyle, IntervalStyle, TimeZone, quote_all_identifiers, standard_conforming_strings, extra_float_digits, bytea_output). Every git call in the summary runs isolated from the caller's git configuration and attributes, with fixed diff flags.
- **Drift is checked where checks already run. No workflow changes.**
  - `--check` compares the directory as well as the document, reports both, and exits 1 listing every missing, extra and differing file.
  - The new database test file `function-files.db.test.ts` (DBF-01) does the same in the `db` job.
- **The approval summary shows the changed lines.** `--summary-since <base>` adds a section, "Function definitions changed since `<base>`", compared at the merge base. It has three parts:
  - a line saying the `--check` step proves these files equal the migrated catalog;
  - a list of every changed file with +N/−M and its flags, "SECURITY DEFINER, tenant scope, privileges or PUBLIC" first;
  - the unified diffs, within a 900,000-byte budget, then one line naming any diffs left out.

  `--function-diffs list` prints the same text without the diffs, as an exact prefix of the full form. That form goes in a PR description, which GitHub caps at 65,536 characters. CI's job summary carries the full form.
  - This covers changes Appendix C cannot show: a DEFAULT, STRICT, LEAKPROOF, the owner, a grant.
  - It sits in the copy the code writes, which the governance runbook calls the one that counts.
  - When the base has no function files yet, as for this PR's own base, it prints one line saying so.
- **Who reads the files:**
  - `.claude/skills/new-migration/SKILL.md` and `.claude/agents/security-reviewer.md` now read the function diffs first, with a checklist:
    - SECURITY DEFINER without `SET search_path`, or with `pg_temp` not last;
    - LEAKPROOF added;
    - STRICT removed;
    - a volatility change on a function a policy calls;
    - a GRANT to PUBLIC, or any widened grant;
    - an owner change;
    - a new overload of a scope function;
    - a changed read of `app.practice_ids`.
  - `docs/runbooks/github-governance.md` step 6 says what the founder now sees.
  - CO-02's compliance control names the files.
  - `README.md` and `docs/runbooks/ci.md` explain them.
- **Safety of `--out` and `--check`:**
  - The directory is validated before anything is written.
  - A stale `.sql` file is removed only if it carries the generator's banner; any other `.sql` file refuses the run.
  - Symlinks, bad names and any stray entry (a file other than the generated ones and the README, or a directory) are refused. An executable bit fails `--check`, and `--out` resets the file to mode 644.
  - A custom `--out FILE` or `--check FILE` needs `--functions DIR`.
  - Every failure exits 2; exit 1 means only "differs".
- **Guards:**
  - `/packages/db/functions/ @PureTideWater` in CODEOWNERS, with `tools/test/codeowners.test.ts` updated.
  - `.gitattributes` marks the files `linguist-generated=false text eol=lf`, so GitHub never collapses their diffs. The banner also avoids the usual "generated" markers. `tools/test/function-files.test.ts` pins both.
  - `.editorconfig` leaves the files' bytes alone, so an editor never rewrites a verbatim body.
- **Records:**
  - ADR 0068.
  - Test matrix DBF-01 to DBF-05: a new block in `docs/product/test-matrix.md`, with no-file synth entries in `matrix.ts` and `registry.ts`, a new case module `DBF` (`types.ts`, `common.ts`), and `fixtures/synthetic/DBF-0x/expected.json`.
- **Reading this PR:** the 337 `.sql` files are this first generation. They need no line-by-line read: the drift checks prove they match a freshly migrated database. From now on, a PR shows only the functions it changes.

## Why

This is combined audit #111, "Show database function changes as readable diffs" (Lane B queue item 4; it lands before PR 8's migrations).

Today a migration redefines a function by copying the whole `CREATE OR REPLACE FUNCTION` block. The domain model shows each body only as a hash, so the founder approves body changes blind and reviewers diff them by hand. Those bodies include row-level security, tenancy scope and ledger guards.

The audit's best option is "the domain-model generator also writes one generated file per database function, checked for drift in the same test that already runs … The approved document's text does not change." This PR builds that option, amended by the design review (`designs/lane-b-db-function-diffs.md` on `claude/build-ops`, §7).

Choices made under the co-founder's standing rulings ("apply wording and visible changes without asking", 2026-10-25 ~21:34 UTC; "don't ask for approvals anymore just build and optimize", 2026-10-26 ~00:20 UTC). Each takes the recommended option:

- **One file per name, not per signature.** A changed argument list then reads as a diff of one file, not as one file deleted and another added.
- **No "Defined by" line.** The migration text cannot see the `ALTER FUNCTION … SET search_path` that the hardening migration runs inside a DO block, so the line would name the wrong migration for the tenancy functions. `git log -p` is the true history.
- **Synth no-file entries DBF-01 to DBF-05.** `packages/synth/src/fixtures.test.ts` requires every test-matrix row to be in the synth registry. The CI series set the precedent, and the orchestrator recorded the reservation in LANES.md.
- **The database drift cases live in their own file** (`function-files.db.test.ts`), not in `domain-model.db.test.ts`. CI-09 in `tools/test/workflows.test.ts` pins that file to its one case on the document, and that assertion stays as it is.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged.
- Database schema and migrations: no migration, and none edited. The generator only reads the catalog.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: byte for byte unchanged, so its SHA-256 and approval are unchanged. The renderer ignores the new catalog fields. The existing drift case proves the document is identical, and `--check --strict` passes.
- CI and the GitHub settings: no workflow file changes. The `db` job runs the new drift file, and the `domain model` job's existing `--check` step covers the directory. The required checks are unchanged.
- Also unchanged:
  - every file of the open PR #42, except the shared documents LANES rule 6 allows (`docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `registry.ts`), where the PR merged second keeps both lanes' rows;
  - `CLAUDE.md` and `.claude/hooks`.
- **Effect on #42 and every later migration PR:**
  - Their `pnpm db:domain-model --out` writes their function files, and they commit them in the same PR.
  - For #42, that commit must land before the founder signs its approval line, since a later commit dismisses the approval (handed to Lane A, LANES.md 2026-10-26).
  - Read-only check on #42's head 13f59b1 (re-measured by the fresh-clone verification): its migration would add 35 function files, remove 3 and change 7. That is 45 files, +1,226/−113; two of the changes are header-only `Called by policy` lines. There is no GRANT to PUBLIC and no SECURITY DEFINER function without `SET search_path`.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

The full local suite ran once on the fix head b564bf2, behind the machine-wide lock, on Node v24.22.0 and PostgreSQL 18.4, with synthetic data only:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Lockfile unchanged |
| `pnpm typecheck` | Pass, 22 projects |
| `pnpm lint` | Pass, 1,493 files, 0 errors, 0 warnings |
| `pnpm lint:copy` / `pnpm lint:logs` | Pass, 491 / 999 files |
| `pnpm check:fixtures` | Pass: 248 files read by the guard, 3,160 searched for an X12 header |
| `pnpm synth --all`, then `git status` | Clean: 197 cases, nothing written |
| `pnpm test` (unit, coverage) | Pass: 323 files, 5,057 passed, 3 skipped (environment-dependent, none in this PR's files) |
| `pnpm test:golden` | Pass, 188 |
| `pnpm test:oracle` | Pass: all 637 synthetic 835s agree with pyx12 |
| `pnpm test:db` in 4 shards, one after another | Pass: all 119 files, 9,065 passed, 1 skipped |
| `pnpm db:domain-model --check --strict` on a freshly migrated database | Pass: the document and all 337 function files match |
| `pnpm build`, the stamp, then `pnpm test:e2e` with `E2E_PREBUILT=1` | Pass, 51 of 51 |
| `actionlint` | Pass, 7 workflows |
| `tools/stryker/affected.ts` | No mutation shard affected (no money path changed) |

**Tests fail first:** run against e1896d5, the fix round's new tests fail (33 unit, 10 db).

**CI:**
- On 2abcf83 three checks were red. `unit` failed because the brand colour scan read an issue number in a registry comment as a hex colour; this is fixed in e1896d5. `all green` failed with it. The `screening-capacity gate` failed because the push of e1896d5 cancelled that head's capacity run. e1896d5 then went fully green.
- On b564bf2, the fix-round head, every check is green (ci run 40256241530). Per-job totals, read by the fresh-clone verification, compared with the base's last push run on 6ddd587 (run 40229005858):

  | Job | Base 6ddd587 | b564bf2 | Change |
  | --- | --- | --- | --- |
  | unit | 320 files, 4,996 passed, 1 skipped | 323 files, 5,059 passed, 1 skipped | +3 files, +63 tests: `function-files.test.ts` 26, `functions.test.ts` 20, `tools/test/function-files.test.ts` 5, `summary.test.ts` +12 |
  | db, four shards | 118 files, 9,049 passed, 1 skipped | 119 files, 9,065 passed, 1 skipped | +1 file, +16: `function-files.db.test.ts` 12, `domain-model-drift.db.test.ts` +4 |
  | e2e, two shards | 26 + 25 passed | 26 + 25 passed | 0 |
  | domain model | passed | passed, with the bootstrap line in its summary and 337 function names matched | |

- **The fresh-clone verification** (wf_088253bb-ce9) passed the scope, the generator and CI.
  - Its probe migration changed one line of `allowed_practice_ids` and granted `anomaly_belongs` to PUBLIC. The summary listed exactly those two files, ranked first and above an unflagged change, with diffs of +2/−2 and +1/−1, and `--check` against the committed files exited 1 naming them.
  - It failed the PR on wording only. `--out` did not refuse stray entries as four documents said, so the code now does, with a test. Some documents and this description were stale. All of it is fixed in 20898fb.
- On 20898fb, typecheck, lint, lint:copy, the unit tests of `packages/db`, `packages/synth`, `tools/test` and `tools/brand-colors` (657) and the domain-model db tests (22) pass locally. CI on 20898fb: every check green (ci run 40266250680), with `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
- **Base merge (LANES rule 6).** PR #47 merged into `claude/build-platform` as c5195ee, so this branch merged it with a merge commit, 15b1abd.
  - The only conflicts were in the synth case-module lists. Both lanes' entries are kept: `CASE_MODULES` holds BIL and DBF, and `MODULE_NUMBER` holds DBF 13 and BIL 15.
  - `test-matrix.md`, `matrix.ts` and `registry.ts` merged by hunk, with both lanes' rows.
  - The lockfile is unchanged (`pnpm install --frozen-lockfile`). The merge touched nothing under `packages/db`, the migrations or the workflows.
  - After the merge, `synth --all` writes nothing, and typecheck, lint (1,496 files) and the unit tests of `packages/synth`, `packages/db` and `tools` (1,308 passed, 3 skipped) pass.
  - CI on 15b1abd, the head to merge: every check green (ci run 40268258654), with `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.

## Reviewer agents' findings

The design review ran (one adversarial reviewer, wf_2fc4efb8-887): sound with changes, no migration needed. Its 17 findings were all taken; dispositions are in the design's §7. The two adversarial PR reviews follow, one on database and migration tooling correctness and one with `.claude/agents/security-reviewer.md`.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| Design review | R1 (blocking): "Defined by" would name the wrong migration | Dropped |
| Design review | R2 to R17 | All built (design §7) |
| Tooling | T1 (blocking): the summary with diffs exceeds GitHub's 65,536-character PR body for a real migration (#42's whole summary would be about 150,000 characters, about 105,000 of it the function section) | Three-part section, `--function-diffs list` (an exact prefix) for descriptions, a 900,000-byte budget for CI (ac1c337, b564bf2) |
| Tooling | T2: `quote_all_identifiers` not pinned | Pinned with standard_conforming_strings, extra_float_digits and bytea_output; DBF-01 varies them (ac1c337) |
| Tooling | T3: diffs depend on the caller's git config | Isolated git config and attributes, fixed diff flags, tested (ac1c337) |
| Tooling | T4: errors exited 1 with a stack trace | DomainModelError, exit 2, shallow-clone hint (ac1c337) |
| Tooling | T5: CLI untested | The CLI is spawned against a scratch database in `function-files.db.test.ts` (ac1c337) |
| Tooling | T6: the "document unchanged with or without the new fields" test did not exist | Added (ac1c337) |
| Tooling | T7: a custom `--out FILE` rewrote the repository's directory | Refused without `--functions` (ac1c337) |
| Tooling | T8 to T17 (nits): ignored files, symlinked reads, bootstrap line, header-only ranking, eol, a missing directory, name validation, snapshot wording, probe coverage, merge base | All fixed (ac1c337, 95ee88f, b564bf2) |
| Security | S1: CI's summary reads the committed files | Not a workflow change: the section states that the required `--check` step proves they equal the catalog, the same guarantee the document section rests on |
| Security | S2: functions outside `public` were invisible | The generator refuses them (ac1c337) |
| Security | S3: `--out` could delete any `.sql` in a wrong directory | Removes only files with the banner; any other file refuses the run (ac1c337) |
| Security | S4: summary size | As T1 |
| Security | S5: invoker scope readers not ranked first | Ranking widened to tenant-scope reads and sets, and PUBLIC grants (ac1c337) |
| Security | S6: checklist gaps | search_path with pg_catalog first and pg_temp explicitly last, set_config of the scope, EXECUTE of built SQL (b564bf2) |
| Security | N1 to N6 (nits) | As T2, T3, T14, T4, N5 (validate before writing) and T12 (ac1c337) |
| Security | I1: which policies and event triggers call a function | Header lines added; all files regenerated (ac1c337) |
| Security | I3: the README's "what is not here" | Updated (b564bf2) |
| Security | I2: run the summary renderer from the base ref in CI | Deferred: it needs a workflow change; proposed in the Lane B status file |

## Proposals outside this pull request

These are recorded in the Lane B status file and in ADR 0068. They are not built here.
- A guard in `.claude/hooks/protect-content.sh` refusing hand edits to `packages/db/functions/*.sql`, and a CLAUDE.md "Never" line. Both are founder-owned files.
- One sentence in Appendix C's introduction pointing at the files, at Lane A's next domain-model regeneration (it changes the approved text).
- Review finding I2: CI's domain model job could run the summary renderer from the base ref, so a pull request cannot change the code that writes the founder's copy (a workflow change).

## Freeze exception

No: it changes none of them. The engine, the ledger, the content pipeline, the security program and the milestones are untouched.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BcoCApZmuH8eWJEys32HQK
