# ci-findings-transport: build summary (2026-11-02, UTC)

The build is in worktree /home/user/ci-findings-transport, on branch `co-001/wip-ci-findings-transport`. It started at d257fe6d and is pushed to origin at **872d06ad**, through the pre-push hook. The hook checked 4 commits; the fixture guard and gitleaks found nothing. Nothing was forced, amended or pushed with `--no-verify`.

## Commits

| SHA | Subject (shortened) |
| --- | --- |
| 1ec3508b | test: the content calendar's findings must reach notify whole as the run's own artifact, failing first: notify on a 98,293-byte file stops with E2BIG, the defect itself, … (ci-findings-transport) |
| 4e62201e | test: the surrogate-cut test finds a lone surrogate with a pattern rather than String.prototype.isWellFormed, which the tools project's TypeScript lib (below es2024) does not declare … |
| c9102267 | ci: the content calendar hands its findings to notify as the run's own artifact, read with gh run download in three tries and capped at MAX_FILE_BYTES (2,000,000) … handoff job … |
| 872d06ad | docs: ADR 0071 takes an amendment …, ADR 0066 N32 …, ci.md, content-updates.md and reconciliation-001 …, RCC-08's assertion …, its fixture regenerated (ci-findings-transport) |

Every message ends with the two required trailer lines.

## Red: commit 1's tests against d257fe6d's code

- Log: logs/red.log.
- Command: `flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/content-calendar tools/test/workflows.test.ts`. It ran 2026-11-02 01:31 UTC, and the log records the start and end times.
- Result: 22 failed, 143 passed (165). Every failure is an assertion about behaviour or a missing definition. None is a syntax or import error.

| Test | Why it is red |
| --- | --- |
| T-K: a run has at most MAX_FINDINGS findings | `FINDINGS_PER_FAMILY` is undefined (expected 3) |
| T-P: every finding reaches notify whole | `FINDINGS_PER_FAMILY` is undefined (expected 3) |
| T-R bytes (`:578`'s title kept) | `MAX_FILE_BYTES` is 700000, not 2000000 |
| T-R title | `MAX_TITLE` is undefined (expected 256) |
| T-O: summary before the bound | exit code 0, not 1 (`maxFileBytes` is ignored) |
| T-S: surrogate cut | the body ends on a high surrogate |
| T-E, the 98,293-byte file | **`bash did not start: 'spawnSync bash E2BIG'`**. notifyEnv turns `FINDINGS_B64` into a 131,074-byte string: the defect itself |
| T-E, the worst 41-finding file (1,540,660 B) | the same, E2BIG |
| CI-10 timeout table | the `content-calendar.yml` row lacks `handoff: 5` (the missing handoff job) |
| Runner test (`:523`) | 22 jobs where 23 are expected (the missing handoff job) |
| jobs list | `['check','notify']` ≠ `['check','handoff','notify']` |
| check job test | `outputs` `{ findings }` is not undefined |
| T-C: check step as the runner runs it | case (i) exits 1 with the summary lost under `-e` |
| `expectQuietNotify` (calendar) | permissions are `{issues: write}`, not `{actions: read, issues: write}` |
| S8 cases | `success, null`: 0 downloads where 3 are expected |
| tries / over-bound test | `MAX_FILE_BYTES is not in the step's env` |
| cap case | `MAX_LISTED is not in the step's env` |
| T-N | no `gh run download` line |
| T-H | `handoff?.needs` is undefined (no handoff job) |
| T6 set | the two rows `content-calendar.yml check steps.calendar.outputs.findings` and `… notify needs.check.outputs.findings` are found, but no row names them (67 ≠ 65) |
| the sum | `env.FINDINGS_B64: no bound for needs.check.outputs.findings, which no row of the table bounds` |
| simulated Dependabot rewrite | runs this file on a copy, so it shows the reds above |

## Green: the same tests on commit 2's code

- Log: logs/green.log, run 01:36 UTC.
- Result: **165 passed (165)**, all 3 files. CI-10's table, the runner test, T-E and T6 are included.

## Checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` (under the lock) | first run failed on one error: `isWellFormed` is not in the tools project's lib. Fixed in 4e62201e. Then **passed**, 22 projects |
| `pnpm lint` | **passed**, 1,680 files, 0 errors, 0 warnings |
| `pnpm lint:logs` | **passed**, 1,087 files |
| `actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown' .github/workflows/*.yml` (1.7.7) | **exit 0**, no messages. shellcheck is not installed here |
| `pnpm synth --all` | 265 cases: 1 file written, 656 unchanged, 0 removed. 8 EMR formats: 0 written, 16 unchanged. `git diff --stat fixtures/synthetic` shows only `RCC-08/expected.json`, 1 line (`assertion`) |
| `pnpm test` (at 872d06ad, under the lock) | **406 files passed; 6,935 tests passed, 4 skipped, 0 failed** |
| `BASE=origin/claude/build-platform pnpm actions:check` | **exit 0**. Merge base 43565235. `actions/upload-artifact@cf430e03…` is v7.0.2. No pin is new against the base |
| `BASE=origin/claude/build-platform pnpm toolchain:check` | **passed, 0 errors, 1 warning**. The warning is about the repository, not this change: pnpm 10.34.9 is newer than packageManager's 10.34.8. No new image and no new lockfile version |
| `grep '<merge date' docs/adr/0071*` | 2 hits (Status and the Amendment heading). This is expected until §11 step 7, before the merge |

Timings were measured on a 4-CPU container, idle, then under `taskset -c 0` beside eight busy loops (timing/split-timing.txt, timing/cap-loaded.txt):

| Test | Idle | Loaded |
| --- | --- | --- |
| cap case (26 findings, `MAX_LISTED` 5) | 0.5 to 0.6 s | 3.6 to 4.3 s |
| T-E, the 98,293-byte file | 0.1 s | 0.6 to 0.8 s |
| T-E, the worst file | 1.3 to 1.5 s | 10.2 to 10.7 s |
| S8 test | — | about 3.5 s |

The cap-case and worst-file figures are written in each test's comment.

## Local proof (step 5)

- Output: proof/local-proof-built.txt, exit 0, run 01:42 to 01:48 UTC.
- How it ran:
  - scripts/extract.mjs wrote the built workflow's notify and handoff `run:` scripts into proof/work.
  - The design's prove.mjs ran unchanged, except that its temporary directory moved under the scratchpad.
- **The built scripts are byte-identical to the design's proved scripts.** `proposed-notify.sh` is beb9ab0f…d37c and `proposed-handoff.sh` is 5c850d4e…1790, so the download block is equal in both (20 lines).
- Results, each the same as §7:

| Case | Result |
| --- | --- |
| Base notify, 98,292-byte file | bash started |
| Base notify, 98,293-byte file | **E2BIG** |
| Worst file, 1,540,660 B | exit 0; 20 issues opened plus "not filed" listing 21 titles |
| Near-worst file, 1,540,045 B | the same |
| ASCII file, 248,084 B | the same |
| 98,293-byte file through the artifact | filed |
| 400 short findings | 200 titles listed, then "- and 180 more, each named in the run's summary" |
| Fail closed: no artifact; check failed; file over the bound; not a list | each "check failing", with 3, 0, 1 and 1 downloads |
| Two failed tries, then success | filed |
| Three failed tries | "check failing" |
| Handoff, worst file | "reads 41 findings, 1540660 bytes, SHA-256 dde573f4…" |
| Handoff, failure cases | each exit 1, with no issue call |

- The environment here is 703 B, against §7's 346 B. The difference is the longer scratchpad `PATH` and `FAKE_DIR` paths.

## Scope

- `git diff --stat d257fe6d 872d06ad` lists 13 files.
- The item's own files:
  - `.github/workflows/content-calendar.yml`
  - `tools/content-calendar/{render.ts,index.ts,content-calendar.test.ts}`
  - `tools/test/workflows.test.ts`
- The shared documents:
  - ADR 0071 and ADR 0066
  - `docs/runbooks/ci.md` and `docs/runbooks/content-updates.md`
  - `docs/product/reconciliation-001.md` and `docs/product/test-matrix.md`
  - `packages/synth/src/cases/matrix.ts`
  - `fixtures/synthetic/RCC-08/expected.json` (generated)
- Nothing changed under:
  - domain-model.md
  - migrations
  - packages/pricing, packages/ledger, packages/db
  - apps/, content/
  - /home/user/ops

## Deviations from the design, and why

1. **Its own commit for the typecheck fix (4e62201e).** T-S used `String.prototype.isWellFormed`, which the tools project's TypeScript lib does not declare. The assertion is now an equivalent pattern for a lone surrogate. Commit 1 was already made, and amending is forbidden, so the fix is a fourth commit.
2. **T-P's "not filed" header figure.**
   - The design's 150 characters is too low. With a 100-character run address and a six-digit count, the header measures 202 and the last line 51.
   - T-P asserts those measured lengths and the bound `256 + 200 × 259 + 64 = 52,120`, not 52,010. That is still ≤ 65,536.
3. **T-E is two tests** (the 98,293-byte file and the worst file), sharing a helper `expectCarried`.
   - On one loaded CPU the worst file takes 10.2 to 10.7 s, so it needs its own 30-second budget.
   - That is about 2.8 times under the limit, short of the four times the head's comment at `:21-30` asks for.
   - The worst file uses equal titles (`'\u0001'.repeat(256)`), which is the exact 1,540,660-byte case.
4. **`runNotify` runs the step as a file**, as the runner and T2 do (`bash --noprofile --norc -e -o pipefail <file>`). It asserts `result.error?.message` is undefined with "bash did not start", and returns `env`, `stdout` and `stderr`.
   - It takes a sixth parameter, `failures = 0`, to stage `fake/fail` for the tries cases.
   - Release-capacity's three `runNotify` calls pass unchanged.
5. **`notifyEnv` sits beside `runNotify`**, inside the content-calendar describe, in `identityEnv`'s form. `identityEnv` is inside another describe, so placing it there would leave it out of scope. It also takes the workflow name, for its messages.
6. **The S8 cases assert download counts.** Each case expects 0 downloads when the check did not succeed, 3 with no artifact, and 1 otherwise. That is how the test meets "the log shows the download only when CHECK_RESULT is success".
7. **ADR 0071's Amendment cites "ADR 0066, Part 3, N32", not N29.**
   - At d257fe6d the item is N32; N29 was its number before #82 merged (`0066:983-984`).
   - The design's §8 text said N29.
8. **Two choices where the design left room:**
   - The header assertion joins the workflow's header comment lines and checks for "Issues, the check's summary and its one-day findings artifact hold only calendar data".
   - T-K uses a fixed pool of synthetic file names (some match each entry's pattern) rather than fast-check's `stringMatching`, and makes 200 runs.

## Proposals (outside this change)

1. **TEST_TIMEOUT_MS margin.** The head's comment says thirty seconds holds four times the worst test (7.4 s). The worst-file notify test now takes 10.7 s on the loaded CPU. Its owner should either restate the comment's figures or raise the bound. The cost is about 62 `jq` reads of a 1.5 MB file: notify reads the file once per finding by index.
2. **Notify could read the file with fewer `jq` passes.** One `jq -c '.[]'` stream would replace about 62 parses of the file per run. It would speed both the runner and the tests, but it changes a script T-H holds equal to handoff, so it is not taken here.
3. The design's own P1 to P4 stand as written (§14).
4. **Shellcheck is not installed in this environment**, so actionlint ran without it, as #86's flags do. CI's actionlint test also skips where it is not installed.

## Not done here

- §10's runs of record (the pull-request run with `handoff` green, then the merge's push run).
- §11 steps 1, 6 and 7 (cut `co-001/ci-findings-transport` after #86 merges, open the pull request, replace `<merge date, UTC>`).

These follow #86's merge.

## Files

All under approval-summaries/lane-b-ci-findings-transport-build/:
- logs/: red.log, green.log, typecheck.log, lint.log, lint-logs.log, actionlint.log, synth.log, pnpm-test.log, actions-check.log, toolchain-check.log, push.log
- proof/local-proof-built.txt, proof/scripts/{prove.mjs,extract.mjs}, proof/work/
- timing/split-timing.txt, timing/cap-loaded.txt, timing/cap-idle.txt
- progress/build.md

## Adversary round

Start head 872d06ad. New head b9a83bd3 (b9a83bd3…), pushed to origin/co-001/wip-ci-findings-transport through the pre-push hook. Nothing was rejected.

- S1 (S), fixed in 5cf06451 "test: ...". In tools/test/workflows.test.ts, TEST_TIMEOUT_MS goes from 30_000 to 45_000, and the comment at :21-32 now names the worst test: the 41-finding notify test, 1.3 to 1.5 s idle and 10.2 to 10.7 s on one loaded CPU. That keeps the 4x margin the comment promises: 4 x 10.7 is 42.8 s, under 45. The bound and its comment are in the same commit. The same constant also bounds spawned children. The nested vitest's 280 s bound is unchanged. workflows.test.ts passed 130 of 130.
- N2 (N), fixed in 7068adea "docs: ...". The ADR 0071 Deciders lines are re-wrapped to 117 and 118 columns. A word-diff shows no word changed.
- N3 (N), fixed in 3c2ac310 "docs: ...". The exit-status list in tools/content-calendar/index.ts now reads "...a title is not one line or over MAX_TITLE characters, or the findings pass the file's bound". It is also re-wrapped, because that line was 168 characters. No new test: the behaviour is already covered at content-calendar.test.ts:592, where findingsJson throws, and index.ts returns 1 from its catch.
- N1 (N), fixed in b9a83bd3 "ci: ..." rather than left as a proposal. This follows the ruling that security takes the safer choice, and the workflow, test and ADR are this item's files. In both notify and handoff, each try now runs as `if timeout -k 10 "$DOWNLOAD_LIMIT" gh run download ...`, with the env value DOWNLOAD_LIMIT "60". Worst case is 3 x 70 + 2 x 10 = 230 s, inside the 5-minute job. Tests:
  - The fake gh can now stall: a new `stalls` argument to runNotify makes it run `exec sleep 30`.
  - One stall, then a good download: the finding is filed after 2 tries.
  - Three stalls: the job ends in "check failing" after 3 tries.
  - Pinned: the `timeout -k 10 "$DOWNLOAD_LIMIT"` prefix, DOWNLOAD_LIMIT=60, the time budget under the 5-minute timeout, and DOWNLOAD_LIMIT in handoff's env keys, equal to notify's.
  - With the timeout removed, the test failed (red confirmed).
  - ADR 0071's Amendment now says "in three tries each stopped after 60 seconds, so a stalled download fails like any other".
- Verify, under the lock: vitest unit on tools/test, tools/content-calendar and tools/brand-copy passed 382 of 382; typecheck, lint, lint:logs and actions:check all exit 0.
- Left for the session: the §7 local proof under /home/user/ops/designs/lane-b-ci/ci-findings-transport/proof/ (scripts/prove.mjs and its script hashes) still records the download block without the timeout. I did not touch /home/user/ops. Proposal: the session regenerates the proof against b9a83bd3. It should also add a stall case to its fake gh.
- Proposal, not done: the "Content calendar check failing" path could log one line per failed try, giving the exit status (124 means the try ran past DOWNLOAD_LIMIT). A stalled try prints nothing from gh today.
