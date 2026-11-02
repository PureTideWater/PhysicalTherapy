# Lane B, dependabot-batch, PR C (#91): the fix round

The record of PR C's fix round, from the two adversarial reviews to the push. Written 2026-11-02 by the updater (round
1); not committed (the session commits it with the status file).

- **Pull request.** #91, "Dependabot group routing: wildcard groups no longer lose to minor-and-patch (CI-12)", branch
  `co-001/dependabot-group-routing` into `claude/build-platform`; draft. Worktree `/home/user/dependabot-group-routing`.
- **Reviewed head:** 651f8b80 (base bce57f16). **Fix round's head:** b1fd5df1 (b1fd5df1c177379cf3e728fee7b1fcc79c5aaed0),
  never pushed on its own (also saved as `co-001/wip-dependabot-batch-c`).
- **Pushed head: 07b5382b0c87c34f21fe057554d2bb85d94c9a73** (07b5382b), pushed 2026-11-02T09:45:00-03Z as
  `651f8b80..07b5382b` through the pre-push hook (1 commit checked, the merge: 0 files read by the fixture guard, 2 text
  files searched, gitleaks found no secret; the fix commits were already on origin under `co-001/wip-dependabot-batch-c`,
  and the fix round's suite ran gitleaks over all 22 of `origin/claude/build-platform..b1fd5df1`: no leaks). The remote
  reported 1 moderate alert on the default branch, unchanged. One push; no refused push.
- **Commits of the round** on 651f8b80 (each message ends with a blank line and the two required lines; no amend,
  rebase, reset, force or `--no-verify`):
  - 0f60ae43, merge of the base 877e662f, clean (tree 79f82b48, the review record's trial merge);
  - 76610e09, 33698c40, 9f2e7d83, aebd7f49, accb4cd5, 5d110764, a6db10e8, e1cc8e06, cda1cecf, 89a90c08, 833705ef,
    be555007: the 12 review-finding commits (`fix-C/fix.md`);
  - a84a498b, merge of the base 88708069 (#90), clean (tree f4e0357e);
  - 42a3eb66, c102647d, b1fd5df1: the fix round check's N1, N2, N3 (round 1);
  - **07b5382b**, merge of the base 2affb854 (#42 as 22789493, then #95), clean, by this updater (below).
- **The description** was rewritten from `fix-C/description-changes.md` §1-§10 and §6b, refreshed for the base
  2affb854: #97 closed and #98 open, 65 direct dependencies (`@aws-sdk/client-sqs` added by #42), the exact conflict
  list, #42 and #95 named as merged, the merge order under the 20:36 UTC rule with the 08:52 UTC update (no wait for
  #86), the AWS bullet generated from #94's 484e9f06, and O9 with issue #41. Set through the connector at 09:48:24Z (49,431 characters, under 65,536) and read back with `pull_request_read get` and `gh api repos/PureTideWater/PhysicalTherapy/pulls/91 --jq .body`: both identical to `merge-C/pr-body-r1.md` (gh adds one trailing newline); the template's sections, the required-checks markers and the footer intact.

Evidence: `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/fix-C/` (`fix.md`,
`check-round1.md`, `check.md`, `suite.md`, `description-changes.md`, `logs/`, `progress/`) and `merge-C/`
(`pr-body-r1.md`, `pr-body-r1-readback-*.md`, `logs/r1-*.log`, `logs/r1-merge-tree.log`,
`progress/update-r1.progress.md`).

## 1. Every finding and its disposition

### The two adversarial reviews (36 findings, 22 distinct: 4 S, 18 N; none blocking, none refuted)

Records: `approval-summaries/lane-b-dependabot-batch-C-review-ci-infra.md` and
`approval-summaries/lane-b-dependabot-batch-C-review-security-supply.md` (651f8b80, three rounds each, 2026-11-01 20:52Z
to 2026-11-02 03:55Z). Where both lenses raised one issue, the higher rating stands. "Description" means #91's
description as written in this round; "status file" means `approval-summaries/lane-b-dependabot-batch-status.md`,
"Proposals (outside this PR)", items 1-7 of `fix-C/description-changes.md`.

| Finding | Sev | Disposition |
| --- | --- | --- |
| ci-infra-r1-C-CI-S1 | S | Description ("Merge order", the #94 bullet): the resolution as a rule, and the bullet it gives on #94's head at push (generated from 484e9f06). be555007 gives its first two lines in the runbook |
| security-supply-r3-SS3-S3 | S | Same as above; a test for one-sided resolutions is proposal 3 |
| ci-infra-r2-C-ci-r2-S1 | S | Description: "Merge order" rewritten from the rulings (now the 20:36 UTC rule with the 08:52 UTC update: no wait for #86, the guard moot), "Why" bullet 3. Design corrections 1 and 6 |
| security-supply-r2-S1 | S | Same as above |
| ci-infra-r3-ci-infra-r3-S1 | S | 76610e09 (runbook: what a `dependabot.yml` merge starts, read that day), corrected by c102647d. Description: "What this merge starts, and the deadline" with the post-merge steps, now around #98. Design corrections 7 and 8 |
| security-supply-r3-SS3-S1 | S | Same as above |
| ci-infra-r3-ci-infra-r3-S2 | S | Description (O9 ruling): the Checks row, "The sizing question (O9)" with issue #41, "What waits on a person". Status entry; proposal 2 (screening-capacity runbook) |
| security-supply-r3-SS3-S2 | S | Same as above |
| ci-infra-r1-C-CI-N1 | N | 33698c40 (CI-12's model test: the applies-to filter and an exact name's 1000), completed by 42a3eb66 |
| ci-infra-r1-C-CI-N2 | N | Description: Root cause (a), Evidence counts, "What it does not change". Design correction 2 |
| ci-infra-r1-C-CI-N3 | N | 9f2e7d83 (the ADR says what the run assigned and what #89 carried) |
| ci-infra-r1-C-CI-N4 | N | Superseded by ci-infra-r3-S2; description: the Checks O9 row |
| ci-infra-r1-C-CI-N5 | N | aebd7f49 (a routine triage in the build's lane log; an item's in its design). Proposal 5 |
| security-supply-r1-N1 | N | accb4cd5 (step 1 lists every log signal and gives the commands that read the log), with b1fd5df1 |
| security-supply-r1-N2 | N | 5d110764 (GitHub's config file validation must be green). Proposal 1 makes it required |
| security-supply-r1-N3 | N | a6db10e8 (step 6 reads the job definition without writing), with b1fd5df1 |
| security-supply-r1-N4 | N | e1cc8e06 (major ignores bind version updates only; also the ADR's own consequence, an in-scope improvement named in the commit) |
| security-supply-r1-N5 | N | 9f2e7d83 (wording) and cda1cecf (the Revisit extension) |
| ci-infra-r2-C-ci-r2-N1 | N | Description: Evidence, the per-dependency routing table from CI-12's model, regenerated for this head (65 names; `aws-sdk` 10, `minor-and-patch` 45) |
| security-supply-r2-N1 | N | Same as above |
| ci-infra-r2-C-ci-r2-N2 | N | Description: Checks, a row per §8.5 command with 651f8b80's job IDs and this head's column |
| security-supply-r2-N2 | N | Same as above |
| ci-infra-r2-C-ci-r2-N3 | N | 89a90c08 (steps 2 and 6 on closing an individual pull request) |
| security-supply-r2-N3 | N | 89a90c08 |
| ci-infra-r2-C-ci-r2-N4 | N | cda1cecf (the updater image; four files compared against 85379652). Description: Root cause (c), with the 8786cc38 runs (41386140808, 41386141443, 41407378320) |
| security-supply-r2-N5 | N | cda1cecf |
| ci-infra-r2-C-ci-r2-N5 | N | Description: Root cause (b). Design correction 2 |
| security-supply-r2-N4 | N | Same as above |
| ci-infra-r3-ci-infra-r3-N1 | N | 833705ef (Part 2's Status entry names the amendment; the Date line left alone). Description: "Merge order" and the P1 row |
| ci-infra-r3-ci-infra-r3-N2 | N | Description: the reviewer table (`security-reviewer` run as the security and supply-chain review) |
| security-supply-r3-SS3-N2 | N | Same as above |
| ci-infra-r3-ci-infra-r3-N3 | N | Description: Checks, the icudtl.dat sentence |
| security-supply-r3-SS3-N3 | N | Same as above |
| ci-infra-r3-ci-infra-r3-N4 | N | Description: "Why" bullet 2 |
| security-supply-r3-SS3-N4 | N | Same as above |
| security-supply-r3-SS3-N1 | N | be555007 (the AWS sentence names each group) |

Nothing was "not taken". Deferred parts are proposals in `fix-C/description-changes.md` ("Proposals for the status
file"), for the session to write: 1 the config check required (r1-N2); 2 the screening-capacity runbook's "before
merge" (r3-S2); 3 a test for a one-sided C x B resolution (SS3-S3); 4 #94's description records O9; 5 a durable
triage record, a tracking issue against a `compliance_record` kind (r1-N5); 6 B's close step names the open bot pull
request (now #98) (SS3-S1); 7 pin pyx12 in CI (the check's round 2, proposal 3).

### The fix round's check, round 1 (`fix-C/check-round1.md`, head a84a498b: 2 S, 6 N, 0 B)

| Check | Finding | Disposition |
| --- | --- | --- |
| S1 | The description was stale against Dependabot after #90's merge (#87, #88, #89 closed; #97 opened, 04:00-04:10Z) | Description: "What this merge starts", Root cause (c) and (d), Evidence, "Part of the dependabot-batch item" rewritten around #97, and in this round around #98 (#42's merge closed #97 for #98 at 07:42-07:45Z); design corrections 7 and 8; status entries; proposal 6 |
| S2 | The "exact" resolved AWS bullet was built on #94's 484e9f06, which B's fix round rewrites | Description: the resolution as a four-step rule plus the bullet generated at push (from 484e9f06, #94's pushed head at 08:53Z; resolver exit 0; differs from C's file only by #94's two CLI lines and from #94's only by C's changes); proposal 3; status entry |
| N1 | CI-12 pinned "takes" but not "contests" for a security-updates group | 42a3eb66 (mutant M9b now fails) |
| N2 | A recreate with changed target versions is not always renumbered | c102647d |
| N3 | Step 1's grep did not print the empty group; step 6's jq did not print the existing pull requests | b1fd5df1 |
| N4 | "Why" bullet 1 kept the claim 9f2e7d83 corrected | Description: "Why" bullet 1, the ADR's wording |
| N5 | "Never jump … Today that is #94" treated a draft as green and waiting | Description: "Never jump" (waits for #94 only if it is green and waiting when C is ready) |
| N6 | Proposal 5 said a durable record needs a migration | Proposal 5 weighs a tracking issue against a record kind; aebd7f49's message stands (no amend) |

### The fix round's check, round 2 (`fix-C/check.md`, head b1fd5df1: 0 B, 0 S, 4 N; verdict "defects")

| Check | Finding | Disposition |
| --- | --- | --- |
| N1 | Three description sentences overstated the evidence (the successor's members; which recreate rebuilt `minor-and-patch`; "each open group pull request") | Description: §5 "On merge" and "Already seen", the runbook bullet in "What changes"; design correction 7 |
| N2 | Two local-evidence rows mislabelled (the model mutants in the configuration table; the per-commit row) | Description: a separate `Model` table; the per-commit row split (70/126/186 after each review fix; CI-12 alone, 10, after 42a3eb66) |
| N3 | Design correction 2's anchor not in the design; a stale clause in §6.1 | Design correction 2 rewritten with the real anchor and the refresh clause run 41386141443 settled |
| N4 | The fixer's records gave times later than the files were written | `fix.md`, `description-changes.md` and `fix.progress.md` corrected |

Its proposals: 1 (read the job log once in step 1) and 2 (re-wrap the generated AWS bullet) are later wording
improvements, not taken in a commit; 3 (pin pyx12) is the status file's proposal 7. What the check confirmed held at
b1fd5df1: the three new commits (mutants M9, M6, M9b red at the head; `own < 1000` an equivalent mutant), the generators
clean, 29 files / 595 narrow tests, `pnpm verify-content`, both base merges exact, the AWS rule on 484e9f06 and
f43f809d, every description claim against the evidence.

## 2. The full local suite at b1fd5df1 (base 88708069)

2026-11-02 04:36-04:38Z and 06:43-08:03Z, one heavy step at a time under `flock /tmp/laneb-heavy.lock`; database steps
on PostgreSQL 18.4 (5433); tree clean after the suite (`fix-C/suite.md`, `fix-C/logs/suite-*.log`).

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; up to date, 22 projects |
| `pnpm typecheck` | pass, 22 projects |
| `pnpm lint` | pass, 1,700 files, 0 errors, 0 warnings |
| `pnpm lint:logs` | pass, 1,094 files |
| `pnpm verify-content` | pass; content/drafts 10 records |
| `pnpm test` (unit, coverage, `ENGINE_FREEZE_BASE` 88708069) | pass; 416 files; 7,017 tests: 7,016 passed, 0 failed, 1 skipped (`packages/rules/src/content.test.ts:179`, root guard); coverage statements 67.97%, branches 65.43%, functions 62.32%, lines 68.16%; the engine-freeze differential's 3 ran |
| `pnpm test:golden` | pass; 5 files, 376 tests |
| `pnpm synth --large`, `pnpm test:oracle` | pass; pyx12 4.0.0 agrees with all 687 synthetic 835 fixtures (676 valid, 11 malformed and rejected) |
| `pnpm db:migrate && pnpm test:db --shard=k/4`, k = 1-4 | pass; 3,160 + 2,620 + 2,569 + 956 passed (33/33/33/32 files = the 131 db files, each once), 1 skipped (restore drill: no PostgreSQL 18 client tools); 9,305 passed, 0 failed |
| `pnpm db:domain-model --check --strict --require-approval` | pass; schema at `20261106090000_screening_consumer.sql`; approval carried |
| `pnpm build`, the build stamp, the tar, `pnpm cdk:diff` | pass; `BUILD_COMMIT` b1fd5df1; 30,070,087 bytes; every stack synthesized (no credentials) |
| `E2E_PREBUILT=1 pnpm test:e2e --workers=2` | pass; 68 passed, 0 failed, 0 flaky, 11.9 min |
| `tools/stryker/affected.ts --base 88708069` and the mutation gate | no shard; "No money path changed: no mutation run." |
| `pnpm synth --all`; `watched.ts --write` | 275 cases: 0 written, 667 unchanged; EMR 0 written, 16 unchanged; 543 lines; tree clean |
| `actions:check` (offline and against the base), `toolchain:check`, `licenses:check`, actionlint | pass; toolchain 0 errors, 1 warning (pnpm 10.34.9 newer than `packageManager` 10.34.8, the base's); 185 production packages; no actionlint finding |
| audits, `check:fixtures`, released prompts, engine freeze, gitleaks | pass; 1 moderate (GHSA-g3hv-75wg-m249, minimatch under `@stryker-mutator/core`, dev), below high; 333 guard files, 3,926 searched; 4 released prompt versions unchanged; 22 commits, no leaks |
| `screening-capacity.yml`'s changes step | measure=true (`packages/synth/src/cases/matrix.ts`) |
| `pnpm screening:capacity --runtime process … --time-mode advisory`, and the gate step | **exit 1, the local form's red only**: "limit not applied: postgres" and "cold start not applied" (S1, S4#1-3, S5); every time passes (S4 middle run S4#3 worst 36.8 s, so no sizing output), every container under its memory limit, 0 OOM. The same command on the base 88708069 (its own build, scratch worktree) fails on exactly the same checks (S4 middle run worst 36.5 s). No Docker here; CI's capacity job is the measurement of record |
| CI-12 against bce57f16's `dependabot.yml` and the head's (`CI_TREE`) | old: 3 fail, 7 pass; head: 10 pass |

## 3. The base merge and the targeted re-check (07b5382b)

The base moved 88708069 to 2affb854: #42 (22789493, merged 07:34:57Z; PR 6b-4, mail streams; 219 files, a migration,
`apps/web` and `apps/worker` manifests, the lockfile, `watched-paths.txt` +8) and #95 (2affb854, merged 08:47:25Z;
unmapped plans, ADR 0075; 96 files). They share with C only `docs/product/test-matrix.md` and synth `matrix.ts`
(separate hunks). `git merge-tree` was clean; the merge 07b5382b (07b5382b0c87c34f21fe057554d2bb85d94c9a73, "Merge
claude/build-platform into co-001/dependabot-group-routing" and the two lines) took it with no conflict. Per the
co-founder's pacing (2026-11-02 02:10 UTC), only what the merge touches ran again, each under the lock
(`merge-C/logs/r1-*.log`):

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` (08:56:12-14Z) | pass; lockfile up to date, 22 projects; #42's two new AWS SDK clients linked |
| `pnpm synth --all` (09:08:14-18Z) | 287 cases: 0 written, 680 unchanged, 0 removed; EMR 0 written, 16 unchanged; tree clean |
| `watched.ts --write` (09:21:46-47Z) | 551 lines (543 + #42's 8), no change, nothing to commit |
| `pnpm verify-content` (09:28:45-46Z) | pass; content/drafts 10 records |
| `pnpm check:fixtures` (09:34:04-05Z) | pass; 334 guard files, 4,026 text files searched |
| `pnpm typecheck` (09:39:42-09:40:50Z) | pass, 22 projects |
| `pnpm lint` (09:40:50-09:42:52Z) | pass, 1,745 files, 0 errors, 0 warnings |
| `vitest run --project unit tools/test packages/synth` + the 51 unit files #42 and #95 added or changed (09:42:55-09:44:16Z) | pass; 84 files, 1,924 tests: 1,924 passed, 0 failed, 0 skipped; all 51 base files ran |
| CI-12 alone, and `directDependencies()` counted at b1fd5df1 and the head (09:44:16-18Z) | 10 passed; direct dependencies 64 -> 65 (+`@aws-sdk/client-sqs`, #42's worker dependency; none removed); first-match groups browser-tests 3, anthropic-sdk 1, pg-boss 1, next 2, aws-sdk 10, aws-cdk 3, minor-and-patch 45 (the same 45 names); the routing test holds every one to exactly its group |
| `tools/stryker/affected.ts --base 2affb854` (09:44:18-33Z) | any=false, no shard (as expected) |

The tree was clean after the chain; no commit was needed. The base did not move again before the push (fetched 09:44Z:
2affb854). Report: `merge-C/recheck-r1.md`.

## 4. Conflicts (2026-11-02T08:53:22Z, `merge-C/logs/r1-merge-tree.log`)

`git merge-tree --write-tree` of 07b5382b with each of the 7 other open heads (listed at 08:52:37Z), and of the base
2affb854 with each:

| PR | Head | With C | With the base alone | Shared files with C |
| --- | --- | --- | --- | --- |
| #94 (B, draft) | 484e9f06 | **conflict**: `docs/runbooks/dependency-upgrades.md` (AWS bullet, one hunk) plus the base's four | conflict: `apps/web/package.json`, `apps/worker/package.json`, `packages/model-gateway/package.json`, `pnpm-lock.yaml` | the runbook |
| #86 | 83167b8f | conflict: ADR 0066 (header, one hunk), `reconciliation-001.md`, `workflows.test.ts` | the same three files | ADR 0066 |
| #85 | a97d6011 | conflict: `apps/web/src/components/reconciliation/display.test.tsx` | the same | test-matrix, matrix.ts |
| #75 | 871faff9 | conflict: three uploads files | the same | test-matrix, matrix.ts |
| #84 | e3299ea2 | clean | clean | test-matrix, matrix.ts |
| #96 | 50029e64 | clean | clean | test-matrix, matrix.ts, ADR 0066 |
| #98 (Dependabot) | c61e910b | clean | clean | none |

Also: #86's fix-round head a5bc1170 merges clean with C; B's unpushed f43f809d conflicts with C in the runbook and
with the base in the two app manifests and the lockfile. Count: of 7, C adds a conflict with 1 (#94); 3 conflict only
where the base does (#75, #85, #86); 3 clean (#84, #96, #98).

**Merge order.** Under the 2026-11-01 20:36 UTC rule with its 2026-11-02 08:52 UTC update (status file): C no longer
waits for #86 (the 2026-11-04 12:00 UTC guard is moot) and merges as soon as it is verified and green; it orders only
against #94 (the second merged keeps both, by the description's rule; regenerate the AWS bullet from #94's head then),
and never jumps a pull request already green and waiting with a conflicting file (#94 was a draft at 484e9f06 at
08:52Z). Dependabot's pull requests are never touched.

## 5. Dependabot since the fix round's check

- #42's merge (07:34:57Z) put #97 in conflict. Run 41407378320 (07:36:20Z, head 22789493, updater 8786cc38, the old
  file) logged ten `@aws-sdk/*` "belongs to more specific group 'minor-and-patch'" lines (`@aws-sdk/client-sqs`, new
  in #42, among them), the `@next/eslint-plugin-next` line and "groups where no dependencies match: - aws-sdk"; it
  closed #97 ("dependencies changed", 07:42:39Z) and opened #98 (07:45:01Z; minor-and-patch, 18 updates: the ten
  `@aws-sdk/*` at 3.1160.0, `aws-cdk` 2.1146.1, `aws-cdk-lib` 2.275.0, `stripe`, `@stripe/*`, `postcss`,
  `@opentelemetry/api` and `typescript-eslint`). Log: `merge-C/logs/run-41407378320.log`.
- #95's merge (08:47:25Z) had started no Dynamic run by 08:52Z. The only open bot pull request is #98.
- For the status file: #94's description still says it replaces #88 and #89 (proposal 6 now names #98).

## 6. What the verification must read on CI (head 07b5382b)

At 09:48:52Z CI was running on 07b5382b: approval-of-record (two runs), build, changes (two), db 4/4, domain model, lint, static and mutation success; the Stryker shard skipped; unit, db 1/4-3/4, e2e 1/2 and 2/2, images and capacity in progress. GitHub's Dependabot config file validation had not run on this head (the push does not change `.github/dependabot.yml`, unchanged since 651f8b80, where check run 124939537364 passed: "All changes look good"). The verification reads, on that head (or any later head, with these again):
- **The four required checks**: `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`.
- **screening-capacity**: never passed locally (no Docker). `changes` must say `measure=true` (watched:
  `packages/synth/src/cases/matrix.ts`); the `capacity` job's container measurement must pass with limits and cold
  starts applied, and the gate read it as passing. Read S4's three runs and the middle run's worst time: if above 44 s
  the gate raises the sizing question (O9), which blocks the screening's launch, not this merge (01:02 UTC ruling);
  enter this head's numbers in the description's Checks row and "The sizing question (O9)", replacing 651f8b80's
  (S4#1 worst 52.7 s), with the link to issue #41 kept. If the capacity job fails, compare with the base's latest
  measurement before calling it C's.
- **unit**: 0 failed; one skip expected, `workflows.test.ts`'s actionlint case (CI sets neither `ACTIONLINT` nor
  `CI_TREE`); `tools/test/dependabot-config.test.ts` 10 passed (it routes all 65 direct dependencies, each to one group).
- **db (1/4)-(4/4)**: green; the restore drill's pg_dump step run with client tools 18.
- **mutation**: `affected.ts` selects no shard; "No money path changed: no mutation run"; the gate passes.
- **static**: frozen install, synth (287 cases) and watched paths (551 lines) clean, verify-content, fixtures
  guard, oracle (pyx12 in CI is unpinned: 4.0.1 on 651f8b80), audits (only GHSA-g3hv-75wg-m249, moderate, dev),
  toolchain and actions checks, licences.
- **e2e (1/2, 2/2)**, **build**, **domain model**, **images**: green.
- **`.github/dependabot.yml`** (GitHub's Dependabot config file validation; not required): "All changes look good" on
  the head if it runs there; if GitHub does not run it on 07b5382b (the file is unchanged since 651f8b80), 651f8b80's
  check run 124939537364 covers the same file. The runbook makes it a merge condition for this file.
- **The description's "This head" column**: every "Running" cell replaced with the job and its result.
- **approval-of-record**: re-run after the pull request is marked ready, on the latest commit.
- **Before the merge**: `git merge-tree` against the then-current base and open heads; if #94's head moved, regenerate
  the AWS bullet by the rule (`python3 -I fix-C/tmp/aws-rule/resolve-aws.py`) and name its head; re-read the open bot
  pull requests (#98 at 08:52Z) and update "What this merge starts" if they changed.
- **After the merge, the same day**: the post-merge read of Dependabot's runs (description, "What this merge starts",
  steps 1-4): no misrouting line in any npm run's log; what happened to #98 (a successor lists no `@aws-sdk/*`,
  `aws-cdk` or `aws-cdk-lib`); recorded in the status file and #94's description.

## 7. Open for the session

- `co-001/wip-dependabot-batch-c` on origin (b1fd5df1) duplicates the pushed fix commits; keep or delete is the
  session's call.
- The design corrections 1-8, the status entries and proposals 1-7 in `fix-C/description-changes.md` are the session's
  to write on `claude/build-ops`; proposal 6 should now name #98, not #97, and the status entry on #97 gains #98
  (#42's merge, run 41407378320).
- The task text gave C's order as "after #86, deadline guard 2026-11-04 12:00 UTC"; the status file's 08:52 UTC ruling
  update (commit ebd6387b on `claude/build-ops`) supersedes it, and the description follows the update.
- PR C is still a draft; ready, the approval-of-record re-run and the merge follow CI and the verification.
