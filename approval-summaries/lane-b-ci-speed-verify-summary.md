**PR #43, CI 1 of 4 (`co-001/ci-speed`, audit #109) at b5ff4c7: verification fails on the pull request's description alone. It needs one edit to its text, and no commit. All code, local and CI checks pass.**

Verdict: **fail**, because one should-fix finding stands (F1, below). Every check of design section 3.1.7 passes. Once the description is corrected the verdict is pass, with nothing to re-run, since editing the description does not change the head.

**What passed (a fresh clone at b5ff4c7401a3ce4a877a7fc158ef92c319901a4d, removed afterwards):**
- **Clean start:** `pnpm install --frozen-lockfile` exits 0 with the lockfile up to date.
- **Scope:**
  - Against the merge base 49514e8, the PR changes 99 files (+6,715 / -1,650).
  - Every file is one that design sections 3.1.3, 3.1.5 or 3.1.6 name, or a departure the build summary records. The 17 extra files are:
    - comment and document fixes;
    - `route-tests/world.ts` and `db-shards.fixture.ts`;
    - the synth module's two-letter support;
    - `pre-push.test.ts` and `collection.test.ts`.
  - SCR-08's expected file, which the design lists, rightly stays unchanged.
  - Migrations, the domain model and its approvers, `packages/pricing`, content releases and golden fixtures are untouched.
- **Engine freeze:** `PR_NUMBER=43 … check.ts 49514e8` exits 0. The engine diff stat is empty, the exception lets nothing through, and there are no problems.
- **Static checks:**
  - Typecheck: cold in 67.0 s (0 of 21 projects warm), then warm in 24.2 s (21 of 21 warm, 0.00 s of checking).
  - Lint: 1,457 files, 0 errors and 0 warnings, 107 s:
    - apps/web: 560 files, 3,866 MB, 75.9 s;
    - packages: 450 files, 2,654 MB, 57.5 s;
    - the rest: 447 files, 2,768 MB, 49.5 s.
  - actionlint 1.7.7: no output.
  - The design's named vitest set: 38 files, 470 passed, none skipped. It includes CI-04's split for 4 and 6 shards and the required-checks test.
  - `pnpm synth --all`: 187 cases, nothing written, and the fixture diff is clean.
- **Old check names:** the search finds 20 lines:
  - 6 history lines in ADRs 0010, 0063 and 0066;
  - the test that asserts `supply-chain.yml` is deleted;
  - 13 lines where `tools/required-checks.ts` and its test hold the old names as data.

  No current document names an old check, and a test now enforces that.
- **Database proofs on PostgreSQL 18:** the snapshot file and route file 0 ran 576 tests, all passed, in 71 s. No database was left behind.

**CI on b5ff4c7 (run 40196871490, on the pull request's merge commit cc7e8dc):**
- **Speed (A1):** 6:17 from the first job's start to the gate's end, against a 10-minute target. Queue time was 2 s.
  - 37.6 runner-minutes, against a ceiling of 50, and 44 billed.
  - Across the PR's three heads: 7:43, 7:26 and 6:17, so the median is 7:26 and the worst 7:43.
  - The five push runs that complete the sample come after the merge.
- **Time until the PR can merge (A1′):** 16:52, set by `screening-capacity gate` (its measurement took 16:35).
  - `all green` finished at 6:19, `mutation` and `approval-of-record` in under 15 s.
  - A second approval-of-record run, at 13:37, followed the description edit, not the head.
- **No test lost (A2):**
  - **Unit:** 4,658 passed and 1 skipped. The skip is actionlint's case, skipped at the base too. The base had 4,524 and 1 skipped.
    - By full name against 49514e8: 146 new tests and 12 renamed, each renamed one with a successor, and none lost.
  - **Golden:** 38, the same as the base.
  - **Database:** 3,094 + 2,573 + 2,478 + 895 = 9,040 passed, plus 1 skipped (the restore drill). That is the base's 9,042, less the approval case and the route-count case (now a unit test), plus the snapshot case.
  - **End-to-end:** 26 + 25 = 51, none flaky, the same as the base.
- **The four database shards:**
  - They ran 30, 30, 29 and 29 files.
  - Each printed list hashes to its printed SHA-256 (e82eeab2…, 3974f15f…, d0fd4612…, 98cb8217…).
  - The lists are disjoint, and together they are exactly the 118 files of `vitest list --project db --filesOnly` at the head (both hash e0faf6c6…3924).
- **Slowest files (A3):**
  - The slowest database file is the lease test, at 145 s against a 240-s limit.
  - The twelve route files took 45 to 57 s each, against a 90-s limit.
- **`all green`:** its log lists all 8 jobs (static, lint, unit, db, domain-model, build, e2e, images), each a success.
- **`domain model`:**
  - Green, and its summary compares against `origin/claude/build-platform` at 49514e8.
  - No change: SHA-256 `6d7a143dd4e5a7145943324afd21a583f9036925978e90d8b9cecf6b4e97f712`, approved by Tyler Williams on 2026-10-23.
- **Differential test:**
  - It ran, not skipped, with `ENGINE_FREEZE_BASE` set to the merge base.
  - Its 3 cases passed, the 20,000-claim case in 88 s.
- **Also confirmed in the logs:**
  - `static`'s secret scan covered the 21 non-merge commits and found no leak.
  - All 13 jobs ran on ubuntu-24.04 with the actions pinned.
  - Each e2e shard logs the build it ran (`[WebServer] build-stamp: the build is cc7e8dcc…'s`).
  - The browsers' cache missed and was saved in `unit`, then restored in both e2e shards.
  - Every Postgres service was healthy 2 s after creation.
  - Trivy downloaded its database into the runner's temporary directory, so the worker build received 119.77 kB of context.

**The fix round (git diff 9144b56..b5ff4c7, 16 files):**
- **Every disposition in fix-round.md holds in the code.** This covers SF-1 to SF-3, S1, N-1 to N-6, S2 to S6, and b5ff4c7's two fixes:
  - Trivy's database moved out of the worker's build context;
  - the picture case is strict on CI.
- **Nothing was weakened:** no skip, only, todo, skipIf or runIf was added. The one removed test is SF-2's sweep, renamed when it was widened. No database test file changed.
- **Scope:** one new file (`collection.test.ts`, for N-6), and a health check on large-zip.yml's Postgres, beyond the design's "Chromium step only" for that file. Both are recorded in fix-round.md and held by tests.

**To fix before you approve. This is an edit to the pull request's description; it needs no commit:**
- **F1 (should fix):** three statements in the description are false at b5ff4c7.
  - **"The stale-name grep (design 3.1.6), lines kept"** says the search "prints eight lines", and lists ADR 0066 :176 and :185, `required-checks.test.ts:72` and `workflows.test.ts:1095`.
    - At the head it prints 20 lines:
      - ADR 0010 :17 and :71; ADR 0063 :486; ADR 0066 :32, :188 and :198;
      - `workflows.test.ts:1199`;
      - `required-checks.test.ts` :141, :144 and :154;
      - `tools/required-checks.ts` :115, :116, :127, :136 to :139 and :141 to :143.
    - The design requires the description to list these lines one by one. The fix-round table lists only the 7 history lines by number, so the description also contradicts itself.
  - **The departures list** still says "a `pg_isready` wait before the quiet-logs step". 7897eab removed both waits in favour of health checks on the services.
  - **"The sweep reads every Markdown file git tracks (124)"** gives the wrong count. The test reads all 291 tracked files; 124 is the count outside `fixtures/`.
  - Optionally, "`vitest list` leaves nothing behind" should say "nothing of this pull request's": the base's own temporary directories still remain.

**Minor notes:**
- **N1 (nit): three committed figures describe an earlier head.**
  - ADR 0066's "Measured" says this pull request adds "132 new by full name less 12 renamed (4,644 and 1 skipped on 9144b56)". At the head it is 146 new less 12 renamed, with 4,658 and 1 skipped on CI.
  - `.github/dependabot.yml` says CI takes "about 45 runner minutes". Measured, it is 36 to 38, or 43 to 44 billed.
  - The CI runbook gives the capacity gate as "13 to 16 minutes measured". This run measured 16:35.

  Fix them in the next commit that touches these files. They are not worth a new head and CI run on their own.
- **Still open after the merge:**
  - The first push run must be green within A1, with its secret scan over `github.event.before..HEAD` (step 7).
  - The first five push runs complete A1's sample, and seed the browsers' and tsc caches for pull requests.
  - Shortening the capacity run, which sets the time until a PR can merge, is your decision (O12).
