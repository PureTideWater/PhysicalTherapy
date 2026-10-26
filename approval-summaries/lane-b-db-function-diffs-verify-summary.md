# PR #46 fresh-clone verification (wf_088253bb-ce9) on b564bf2

Verdict as returned; every discrepancy fixed in 20898fb (see the status file).

**Verdict: FAIL.** The code, the generator and CI all check out, and so does the PR's scope. It fails only on wording: the PR description and four docs say things the code doesn't do. One docs-and-description commit (and the CI re-run it triggers) should fix it; no functional change is needed. All findings are low or medium severity.

**Check 1: fresh clone.** HEAD is b564bf280f56fd718daf1d9be3a03a38303dd430. The base 6ddd587 is the merge base. `pnpm install --frozen-lockfile` passed with the lockfile unchanged.
- Environment note: the PostgreSQL 18 server on port 5433 was down after a container restart (it had left a stale pid file). I restarted it with `pg_ctl -D /root/pgdata18`. That is the only thing I touched outside the scratchpad.

**Check 2: scope.** Pass.
- 377 files changed: 337 generated `.sql` files, `packages/db/functions/README.md`, and 39 other files.
- No migration. These are unchanged: `docs/product/domain-model.md`, `packages/db/domain-model/*.json`, `.github/workflows/*`, `tools/test/workflows.test.ts`, `CLAUDE.md`, `.claude/hooks`.
- PR #42 is open with 143 files, head 13f59b1; its file list matches `/tmp/claude-0/pr42-files.txt`. The only overlap is `docs/product/test-matrix.md`, `matrix.ts` and `registry.ts`, which are allowed.
- No model names in added lines. No PHI patterns. The DBF fixtures are no-file entries.

**Check 3: the generator.** Pass.
- **Fresh database (`tp_ver_46a`):** `--check --strict` exits 0. The document matches, and so do all 337 function files.
- **`--summary-since origin/claude/build-platform`:** exits 0, alone and with `--function-diffs list`. The section is the one bootstrap line ("The base has no function files … 337 files added, nothing to compare.") and the list form is a prefix of the full form.
- **Probe (`tp_ver_46b`):** I added migration `29991231000000_v46_probe.sql`, which changes `ORDER BY` to `DESC` in `allowed_practice_ids` and grants `anomaly_belongs` to PUBLIC.
  - `--out <tmp> --functions <tmp> --summary-since HEAD` lists exactly those 2 files, both flagged. The diffs are right: `allowed_practice_ids` is +2/-2 (the body line and its hash line), `anomaly_belongs` is +1/-1 (the REVOKE line becomes the GRANT TO PUBLIC line).
  - **Ranking:** I added a non-flagged change to `adjustment_references_in_practice`, which sorts first by name. It was listed third, after the two flagged files.
  - **Prefix in a real case:** with 3 changes, the list form (1,505 chars) is a prefix of the full form (5,052 chars).
  - **`--check` against the committed directory:** exits 1, naming all 3 files with their first differing line.
  - **Stray file:** a stray `.sql` file fails `--check` and makes `--out` refuse.
- All `tp_ver_*` databases were dropped.

**Check 4: CI on b564bf2.** 22 check runs. All succeeded except two expected skips: `notify` (screening-capacity) and the `stryker` matrix placeholder.
- **Domain model job:** the summary step printed the bootstrap line, and `--check --strict --require-approval` passed with 337 function names.
- **New test files all ran:**
  - `packages/db/src/domain-model/function-files.test.ts` (26 tests, unit)
  - `packages/db/src/domain-model/functions.test.ts` (20 tests, unit)
  - `tools/test/function-files.test.ts` (5 tests, unit)
  - `function-files.db.test.ts` (12 tests, db shard 2)

| Job | Base 6ddd587 (run 40229005858) | Head b564bf2 (run 40256241530) | Delta |
| --- | --- | --- | --- |
| unit | 320 files, 4,996 passed, 1 skipped | 323 files, 5,059 passed, 1 skipped, 0 failed | +3 files, +63 tests |
| db (1/4) | 30 files, 3,094 passed, 1 skipped | 30 files, 3,094 passed, 1 skipped | 0 |
| db (2/4) | 30 files, 2,581 passed | 30 files, 2,578 passed | -3 |
| db (3/4) | 29 files, 2,479 passed | 30 files, 2,498 passed | +1 file, +19 |
| db (4/4) | 29 files, 895 passed | 29 files, 895 passed | 0 |
| db, all shards | 118 files, 9,049 passed | 119 files, 9,065 passed | +1 file, +16 tests |
| e2e | 26 + 25 passed | 26 + 25 passed | 0 |

- The unit delta of +63 is the three new files (26 + 20 + 5) plus `summary.test.ts` going from 19 to 31 tests.
- The db delta of +16 is the new `function-files.db.test.ts` (12) plus `domain-model-drift.db.test.ts` going from 2 to 6 tests.
- The two shard-level moves (-3 and +19) are tests redistributing between shards.

**Check 5: PR description against code and CI.** Most claims hold:
- 337 files for 338 functions, with the `submit_prospect_request` overloads in one file.
- Every file has a PUBLIC line.
- All eight settings are pinned.
- Git is isolated from the caller's configuration.
- The `.gitattributes`, `.editorconfig` and CODEOWNERS changes are as described.
- The db test totals match CI exactly.
- 7 workflows.

Discrepancies:
1. **Medium, stale.** The PR #42 impact numbers are out of date. I applied #42's migration to a scratch database and ran this branch's generator.
   - The description says 35 added, 3 removed, 5 changed: 43 files, +1,187/−110. I got 35 added, 3 removed, 7 changed: 45 files, +1,226/−113.
   - The two extra files are header-only `-- Called by policy:` lines on `app_actor_group_practice_ids` and `app_actor_is_platform_admin`. Those lines were added after the count was taken.
   - The claims of no GRANT to PUBLIC and no SECURITY DEFINER function missing `SET search_path` still hold.
2. **Low.** "The fresh-clone verification is reading CI's per-job totals, and they are recorded here when it finishes" is still a placeholder. The totals above should go in.
3. **Low.** "On 2abcf83 the only red was `unit`" is wrong: `screening-capacity gate` also failed there, because `capacity` was cancelled, and `all green` failed with it.
4. **Low, wording.** "Symlinks, bad names and an executable bit are refused" is partly wrong. `--out` silently fixes an executable bit by setting the file to 644; only `--check` fails on it.

**Check 6: ADR 0068, the functions README, the skill and the security reviewer.** These claims hold:
- 148 SECURITY DEFINER functions, and all of them set `search_path` to `'pg_catalog', 'public', 'pg_temp'`.
- `screening_standing` is the one SQL-standard body.
- The `diff.context` isolation test exists.
- DBF-01 varies the connection settings.
- The ranking rules match the code.
- The governance runbook (step 6) and the compliance control text are consistent.

Discrepancies:
5. **Medium, false claim in four places.** They say `--out` refuses "an entry git would commit that is neither a generated file nor the README" or "a stray entry". The four places are the ADR's "Drift, where it already runs", `packages/db/functions/README.md`, the CLI's header comment (which says "a non-regular entry"), and `.claude/skills/new-migration/SKILL.md` ("exit 2: … a stray entry").
   - I tested it: `planFunctionDirectory` on a directory holding `notes.txt` and a `subdir/` refuses nothing. `--out` only refuses foreign `*.sql` files and non-regular entries at a `.sql` or expected name. `--check` does catch both (as "extra" and "refused"), so nothing is unsafe; the docs overstate what `--out` does.
   - Fix by correcting the docs, or by making `--out` refuse strays as documented.
6. **Medium.** The ADR's Consequences say a `protect-content.sh` guard and a `CLAUDE.md` "Never" line "are proposed in the pull request". The PR description has no such proposal.
7. **Low.** The `docs/runbooks/ci.md` troubleshooting text says "Exit 2 is a refusal: a stray entry, a refused file name, … a `*.sql` without the generator's banner". In the domain model job's `--check` step, a stray or banner-less file exits 1 as "extra"; I saw exit 1 for a stray `.sql`. Only a bad `*.sql` name can exit 2 there, through the summary step.
8. **Low.** The module comment in `functions.ts` still lists only four pinned settings (`search_path`, DateStyle, IntervalStyle, TimeZone); the code pins eight.
9. **Informational.** With a custom `--functions` directory, `--summary-since` alone still says "the files committed in `packages/db/functions`".
10. **Informational, sizes.** I measured #42's full function section at 104,753 characters. The ADR says about 98,000 characters of diffs and the description's review table says about 150,000 for the whole summary. Both are approximate, but they disagree with each other.

Everything is in /tmp/claude-0/-home-user-PhysicalTherapy/71c3757b-dd57-53da-b49e-a3419fdb3377/scratchpad:
- Progress log: `progress/verify.md`
- Clone: `verify` (working tree clean)
- CI logs: `v46ci/`
- Probes: `v46probe/`, `v46pr42/`, `v46plan/`
- PR body copy: `v46-body.md`
