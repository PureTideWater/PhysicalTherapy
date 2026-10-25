# co-001/ci-speed fix round (draft PR #43; reviewed head 9144b56)

Worktree /home/user/ci-speed, branch co-001/ci-speed, from 9144b56 to cf70ea00fdb4be595fbda60eed7c055fd5e2770d,
seven commits, not pushed. No migration; nothing under packages/db/migrations, docs/product/domain-model.md,
packages/db/domain-model, packages/pricing, content/releases or fixtures/golden changed; no test weakened, skipped or
deleted (two existing assertions were made more specific: the db durations cache is now found by its step id, since the
browsers' cache step comes before it, and the build-stamp cases pass the tree they mean, clean, explicitly). Every
heavy command ran under `flock /tmp/laneb-heavy.lock`. Failing-first logs are in
/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/fix/.

| Commit | Findings |
| --- | --- |
| 8752ae9 ci: no job or step sets continue-on-error ... | SF-1, S1 |
| 77b8080 ci: the required-checks sweep reads every Markdown file ... | SF-2 |
| 6540beb e2e: the build stamp prints its verdict to stderr ... refuse a dirty tree | SF-3, N-5 |
| 7ef0f80 test: scratch directories in beforeAll; the collection case | N-6 |
| 64aa841 compliance: a definedIn file must call what the module exports | S4 |
| 7897eab ci: browsers' cache, Postgres health checks, Trivy without cache, comments | N-1, N-2, N-3, S2, S3 (comment), S5 (comment) |
| cf70ea0 docs: ADR 0066, the CI runbook and the README | N-4, S3, S5, S6, N-1 (record), S2 (record) |

## Dispositions

### SF-1 (should_fix): fixed, 8752ae9
Verified: at 9144b56 no rule read `continue-on-error`; the review's two edits passed every workflow test.
Fix (tools/test/workflows.test.ts, `maskingProblems`):
- every job and step of every workflow: no `continue-on-error` key, whatever its value (true, false or an expression);
- every job of ci.yml (the gate needs them all) and each required check's own job in its workflow: no step or job shell
  other than the workflow's bash (-e, pipefail), and no script idiom that swallows a failure (`|| true`, `|| :`,
  `|| exit 0`, `set +e`, `set +o errexit`, `set +o pipefail`).
- ci.yml's e2e picture step used `[ -d apps/web/test-results ] || exit 0`, which the rule caught on the real file; it
  now reads the directory with `if`, has a name, and is run under bash by its test (no directory: exit 0, no output;
  a diff picture: its path and base64).
Failing first (fix/sf1-probe-fail.log): with both review edits applied to ci.yml the new case reported
`ci.yml static step 22 (pnpm test:oracle): continue-on-error`, `ci.yml lint: continue-on-error on the job` and the e2e
step; the probe edits are also kept as a permanent negative case on the real ci.yml text.
Scope note: the script rule does not cover screening-capacity.yml's `changes` and `notify` jobs, whose `|| true`
(a missing watched list at HEAD; an existing label) is intended, held verbatim by that workflow's own test, and owned by
the capacity work; `continue-on-error` is refused there too.

### SF-2 (should_fix): fixed, 77b8080
Verified: the sweep read eight named files; the review's two paragraphs in docs/runbooks/deploy-and-rollback.md passed.
Fix: the sweep reads every Markdown file `git ls-files '*.md'` lists (124 today), marked or unmarked; a new case finds
any paragraph naming two or more of the old checks (`check`, `images (web)`, `images (worker)`, `licenses`) in any
Markdown file, and runs the design's stale-name search (section 3.1.6, `STALE_NAMES`) with `git grep -E` over every
tracked file. Each old name is allowed only by `OLD_NAMES_HISTORY` (tools/required-checks.ts): file plus text, eight
entries (ADR 0010 x2, ADR 0063 x1, ADR 0066 x4, the deletion assertion in workflows.test.ts), each required to let
exactly one line or paragraph through, so none outlives what it allows.
Failing first (fix/sf2-probe.log): with the two paragraphs, the head's test file passed 13 of 13 and the new cases
failed naming `a listing without the markers: Require all green ...` and `lists the old checks: The old set ...`.

### SF-3 (should_fix): fixed, 6540beb
Verified: the pass line went to stdout, which playwright.config.ts drops (`stdout: 'ignore'`).
Fix: build-stamp.ts writes every verdict, a pass included, to stderr (the stream the web server keeps as [WebServer]
lines). Tests: the command line run on a copy of the script beside its own .next and git tree (pass: exit 0, empty
stdout, `build-stamp: the build is <sha>'s` on stderr; another commit's build and a dirty tree: exit 1, on stderr), the
config held to `stdout: 'ignore'`, `stderr: 'pipe'`, and workflows.test.ts's CI-06 case holds both.
Failing first (fix/sf3-n5-fail.log): the copy's pass came back on stdout.
End to end (fix/prebuilt-probe.log): after `pnpm --filter @tp/web build` and `--write`, `E2E_PREBUILT=1 playwright test
e2e/smoke.spec.ts` through the real config printed `[WebServer] build-stamp: the build is 6540beb1cd57...'s` and passed
3; with an untracked file it printed the refusal as a [WebServer] line and the web server did not start.

### N-1 (nit): fixed (the browsers' cache); the shard balance recorded, not changed. 7897eab, cf70ea0
Measured from run 40166129200's logs: `e2e (1/2)`'s install took 24 s, 13.4 s of it apt (the system libraries) and
10.3 s the browsers' download (Chromium 174 MB, headless shell 104 MB, ffmpeg 2 MB).
Fix: unit, db and e2e restore `~/.cache/ms-playwright` under `playwright-v1-<os>-<hashFiles of playwright-core's
browsers.json>` (the builds the installed Playwright pins; exact key, no prefix), right before the unchanged
`playwright install --with-deps chromium`, which on a hit fetches only the system libraries and on a miss or a stale
entry installs the pinned builds; unit saves on a miss. Reasoned effect: the 10.3 s download replaced by a restore of
about 620 MB unpacked (the pnpm store's 309 MB restored in 5.5 s in the same job), so about 4 to 6 s per job, about the
same on the critical path, about 30 to 40 s of runner time a run, and no dependency on cdn.playwright.dev on a hit.
Trust: the same as the pnpm store's cache (only push runs of merged code write the build branch's scope). Held by
workflows.test.ts (each restore before its install, one save, the key's glob matching exactly the installed
playwright-core).
Balance: no count-independent split exists for Playwright 1.56.1. Its `filterForShard` (playwright/lib/runner/
testGroups.js) cuts the ordered test groups by count; 1.63's PWTEST_SHARD_WEIGHTS scales counts too; groups are
dispatched in file order, so nothing moves the 180-s monitoring journey's start. A simulation of the two-worker shards on
the run's 51 per-test durations reproduces the run (264 s and 178 s of tests); three shards by count would give 237 s
(27 s off the wall) for about 1.5 more runner-minutes, and the gain moves with every journey added, so it is recorded
in ADR 0066's alternatives as measured and not taken. A1 is met with 2:34 to spare.

### N-2 (nit): fixed, 7897eab
Every Postgres service (ci.yml's db, domain model and e2e, and large-zip.yml's) has
`--health-cmd "pg_isready -h localhost -U postgres" --health-interval 2s --health-timeout 5s --health-retries 30`.
On TCP, because the image's first-run setup serves only its Unix socket (the e2e job's container log shows the
temporary server "listening on Unix socket" before the restart), where pg_isready would answer early. The two
readiness loops are gone. A test holds every Postgres service of every workflow to it and refuses any pg_isready step.

### N-3 (nit): fixed, 7897eab
ci.yml's header now says a push run seeds the build branch's caches, which every pull request into it can restore,
and a pull request's own run writes only its own scope.

### N-4 (nit): fixed, cf70ea0
ADR 0066: unit is 49514e8's 4,524 and 1 skipped plus this pull request's 132 new less 12 renamed (4,644 and 1 skipped on
9144b56); golden 38 and e2e 51 equal. (This round adds unit tests; the count on the new head is CI's to read.)

### N-5 (nit): fixed, 6540beb
`--write` and `--expect` refuse a working tree with uncommitted changes (`git --no-optional-locks status
--porcelain=v1`, tracked changes and files git does not ignore), naming up to five. `--expect` checks the commit first.
CI's checkouts stay clean at both points (`pnpm build` left the tree clean here; the e2e prepare and the server write
only under the temporary directory and ignored paths). The runbook's local flow builds and stamps with `--write` from a
clean tree. Failing first: the dirty-tree cases and `treeChanges` failed before the change.

### N-6 (nit): fixed, 7ef0f80
ci-gate.test.ts and workflows.test.ts make their scratch directories in beforeAll. New tools/test/collection.test.ts
collects the CI series' nine unit test files with `vitest list --no-staticParse` under a private TMPDIR and requires
it empty but for Node's own compile cache. Failing first (fix/n6-fail.log): it found `tp-ci-gate-*` and
`tp-workflows-*`.

### S1 (should_fix): fixed, 8752ae9
`requiredNameProblems`: across every workflow, each job's reported name (its name or id, each expression standing for
any text) may equal a required check's name only in that check's own job; the own job must report it. Fixture cases:
a second `all green`, an id `mutation`, `${{ matrix.check }}` (all four), `approval-of-${{ matrix.what }}`, the shards'
names (none), and the gate renamed. The governance runbook's step 4A says a required check is matched by its name and
source alone, never by its workflow, so no other job may carry one of these names.

### S2 (nit): fixed, 7897eab and cf70ea0
Both ci.yml scans set `cache: false`, so each verdict is made from the vulnerability database the run downloads
(trivy-action ed142fd caches by default under `cache-trivy-<date>`, restore key `cache-trivy-`); held by the images
test. The runbook's cache section and ADR 0066's Consequences say the scans keep none. release.yml is ci-deps'.

### S3 (nit): fixed, cf70ea0 and 7897eab
ADR 0066: "Once the founder applies `claude/build-platform`'s ruleset (governance runbook, step 4A, after this pull
request's first green push run), it requires these ...; until then nothing enforces them". ci.md and ci.yml's range
comment: the ruleset blocks force pushes once the founder applies step 4A.

### S4 (nit): fixed, 64aa841
controls.test.ts: with definedIn, `file` must also call a function definedIn exports through a value import (named,
under any local name, or a namespace); importing it alone, a side-effect import beside a same-named function from
another module, and a type-only import (statement or inline) are refused. Failing first (fix/s4-fail.log): without the
call rule the fixture that imports and never calls was accepted. Coverage: partition.test.ts holds route-tests.0's slice
to an authenticated route, an authenticated mutation and a practice route, the kinds the named titles are generated
for; controls.ts says so.

### S5 (nit): fixed by recording the scope, cf70ea0 and 7897eab
Chose the reviewer's second option. Deriving PR_NUMBER from HEAD's subject is unreliable here: the build branch's
merges read "Merge pull request #39: ..." (49514e8), "Merge #31: ..." (2ec3449) and a squash "... (#35)" (510a26d); the
API route breaks ci.yml's no-API rule; and check.ts has no "no pull request" mode on CI (an empty PR_NUMBER is refused,
and pullRequest null would let any applicable exception through). So ci.yml's comment, ADR 0066's Ranges and ci.md's
"What a run checks" say: the freeze's own check runs on pull requests; a merge's push follows its gated pull-request run;
until step 4A blocks direct pushes, a direct push meets the differential test alone.

### S6 (nit): fixed, cf70ea0
README: "until then the `domain model` check fails".

## Checks run (under the lock)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 21 projects, 21 of 21 warm, 57.8 s wall (3:40 with the wait for the lock) |
| `pnpm lint` | passed, 1,457 files in 3 groups, 0 errors, 0 warnings, 127.0 s wall |
| `actionlint .github/workflows/*.yml` | exit 0, no output |
| `DATABASE_URL=...5433 pnpm exec vitest run tools/test tools/lint tools/typecheck packages/compliance packages/synth apps/web/scripts apps/web/src/lib/routes/route-tests/partition.test.ts` (design 3.1.7) | 38 files, 470 passed, none skipped (the review's run: 37 files, 456) |
| `vitest run --project unit tools/test packages/compliance tools/engine-freeze/check.test.ts` | 20 files, 256 passed |
| `pnpm --filter @tp/web build`, `build-stamp.ts --write`, `E2E_PREBUILT=1 playwright test e2e/smoke.spec.ts` (E2E_DATABASE=tp_e2e_cifix, port 3197, dropped after) | 3 passed, `[WebServer] build-stamp: the build is 6540beb...'s` in the output; with an untracked file the [WebServer] refusal and no server; `--write` on that tree refused |
| failing-first runs (fix/*.log) | SF-1 probe edits, SF-2 probe paragraphs, SF-3 and N-5 cases, N-6 collection, S4 without the call rule, and the new workflow assertions on 9144b56's ci.yml and large-zip.yml: each failed as recorded above |
| `git diff 9144b56 HEAD` and the commit bodies grepped for model names | none outside the two attribution lines of each commit |

## Open items

- CI-only behaviour, to read on the next run of the pushed head: the browsers' cache (miss and save in unit on the first
  run, hits after), the Postgres health checks (no Docker here), Trivy with `cache: false`, and the `[WebServer]
  build-stamp: the build is <sha>'s` line in each e2e shard's log (verified locally through Playwright's real config).
- Pre-existing collection leaks outside this series' new files, present at 49514e8 and left alone:
  `tp-compliance-*` (packages/compliance/src/checklist.test.ts:129, in a describe body) and `tp-pre-push-*`
  (tools/hooks/pre-push.test.ts).
- The review's 52 leaked /tmp/tp-* directories remain for the orchestrator to remove.
- /home/user/ci-speed/apps/web/.next holds the local build of 6540beb from the prebuilt probe (ignored; its stamp names
  6540beb, so E2E_PREBUILT refuses it for any later head).
- Unit count on the new head (N-4's figure is 9144b56's) is CI's to read.
