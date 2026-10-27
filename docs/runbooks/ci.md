# CI: what runs, reading a red gate, timing a run

`.github/workflows/ci.yml` runs every gate of PRD 18 on every pull request and on every push to `claude/build-platform`,
as parallel jobs behind one gate, `all green` (docs/adr/0066, Part 1). This runbook is for whoever reads a run: the
build, a reviewer, the verifier, the founder.

## The required checks

<!-- required-checks -->
- `all green` (ci): every ci.yml job below passed.
- `mutation` (mutation): the money paths' mutation score.
- `screening-capacity gate` (screening-capacity): passes at once when no watched path changed, else only on a
  measurement that passed every check but time (docs/runbooks/screening-capacity.md).
- `approval-of-record` (approval-of-record): the founder's review as the approval of record (docs/adr/0063).
<!-- /required-checks -->

The list lives in `tools/required-checks.ts`; every document that lists the checks is held to it
(`tools/test/required-checks.test.ts`). The build branch's ruleset, "Protect the build branch" (ruleset 25837331;
docs/runbooks/github-governance.md, step 4A), has required them from GitHub Actions since the founder applied it on
2026-10-25 at 21:14 UTC, with branches up to date. No other ci.yml job is required by name: `all green` needs them all, so a shard added or removed changes no setting.

## The jobs

| Job (its check) | What it runs | Timeout |
| --- | --- | --- |
| `static` | the dependency audits (`pnpm audit --prod`, and `--audit-level=high` over every dependency); the action pins and the toolchain, against the run's base (`pnpm actions:check`, `pnpm toolchain:check`; networked); the secret scan of the commits the run checks; the fixture check; the content checker; published releases and prompt versions unchanged; the engine freeze (pull requests); `pnpm synth --all` and its clean diff; `pnpm typecheck`; `pnpm lint:logs`; `pnpm test:golden`; `pnpm synth --large` (the 10,000-claim remittance the oracle reads) and `pnpm test:oracle`; `pnpm licenses:check` | 15 min |
| `lint` | `pnpm lint`, ESLint in three memory-bounded groups | 15 min |
| `unit` | Chromium (the cached system packages verified first) and its build check, the pinned gitleaks (the pre-push hook's tests run it), the engine freeze's base, `pnpm test` (with coverage) | 20 min |
| `db (k/N)` | its own Postgres from `docker-compose.yml`, Chromium and its build check, `pnpm db:migrate && pnpm test:db --shard=k/N`, then "Files this shard ran" | 20 min |
| `domain model` | its own Postgres from `docker-compose.yml`; on a pull request "Changes since the last approved domain model"; `pnpm db:migrate`; `pnpm db:domain-model --check --strict --require-approval` | 10 min |
| `build` | `pnpm build` (web and worker); the web build stamped and kept as `web-build`; `pnpm cdk:diff` | 15 min |
| `e2e (k/M)` | after `build`: its own Postgres from `docker-compose.yml`, Chromium and its build check, the downloaded build, `pnpm test:e2e --shard=k/M`; in `e2e (1/M)`, the baseline step; its report kept as `playwright-<k>` | 25 min |
| `images` | both images built from their Dockerfiles as archives and scanned by Trivy; the worker image's headless shell held to `browser.json` | 20 min |
| `all green` | every job's result, to its log and its summary | 5 min |

Every job runs on `ubuntu-26.04` but the release's capacity chain (`release.yml`'s `build`, `capacity`, `push` and
`report`; `release-dry-run.yml`'s `build`, `push` and `capacity`; `screening-capacity.yml`'s `capacity`), which stays on
`RELEASE_RUNNER.label`, `ubuntu-24.04` (the founder's F5; docs/adr/0066, Part 3); `screening-capacity.yml`'s dispatch
input alone may run that job once on 26.04, as an advisory probe. The two workflows below run on 26.04 too, both of
`content-calendar`'s jobs and both of `release-capacity`'s: its report is advisory and never attested, so it is not one
of the chain's binding measurements. `workflows.test.ts` holds every `runs-on`: eight jobs on the chain, twenty-two on
26.04. No job uses `ubuntu-latest`, which moves to 26.04 in November 2026 (runner-images #14748).

In every job that installs Chromium, `node tools/ci/browser-build.ts` follows the install and holds both builds, every
file of them, to `apps/web/e2e/browser.json` before any test runs or any cache is saved; in ci.yml's jobs the steps
after it run when the install succeeded, whatever the check said, so a red check still shows the suite's verdict
("Upgrading the browser", below), while the capacity jobs stop at a red check. In every job that builds the worker
image into a local tag (`images`, the release's `build` and `release-dry-run`'s, and `release-capacity`'s and
`screening-capacity`'s `capacity`), `node tools/ci/browser-build.ts --image <tag>` holds its headless shell, which prints customers' reports,
to the same record before the tag is measured, saved or pushed, on Node 24 set up before it. Either way a build whose
every file equals the record must also start: its `--version` must print `Google Chrome for Testing <browserVersion>`
(in the image, run as the image's own user).

Beside ci.yml, two workflows of the release content checks (docs/adr/0071) run on a schedule. Neither is a required
check, and their schedules fire only from the default branch (the founder's ruling F1 (a)); until then they run on
request. Each issue they open holds only public references: page addresses, file names, release numbers and run links.

| Workflow, job | What it runs | Timeout |
| --- | --- | --- |
| `content-calendar`, `check` | daily at 07:17 UTC, on request, and on a push to `claude/build-platform` or a pull request touching the calendar, `records.ts`, `tools/content-calendar` or `content/`: `tools/content-calendar/index.ts` over the calendar, the newest published release's `COVERAGE.md`, the prepared releases, the drafts and the source pages; the findings to its summary (docs/runbooks/content-updates.md). Read-only, no secret | 15 min |
| `content-calendar`, `notify` | not on a pull request: one `content-due` issue per finding not already open under the same title (every page of the open issues read), at most 20 new ones a run with the rest listed in one "findings not filed" issue, or one saying the check failed or handed on no findings list, commented on at each later failing run. It alone holds `issues: write`, checks nothing out and runs no repository code | 5 min |
| `release-capacity`, `capacity` | weekly on Tuesday at 03:29 UTC and on request: the worker image built and its headless shell held to `browser.json` (`browser-build.ts --image`), the quarterly scale release 900110 built outside the repository, and `tools/release-capacity/run.ts`, the real-size price job, triage and reports at the worker task's limits (RCC-07); its report kept as `release-capacity` | 180 min |
| `release-capacity`, `notify` | on its failure or cancel (the 180-minute timeout among them): opens or comments on the issue "Release capacity test failing"; on a pass with an advisory (the windows query over its 5 s budget): "Release capacity advisory" (label `release-capacity`), the advisory lines in the body. It alone holds `issues: write` and checks nothing out | 5 min |

Each `static` check runs once the install succeeded, whatever the check before it did, so one red step does not hide
the others' verdicts. Every verdict a job writes to its summary it also writes to its log, which is what the verifier
reads (the session's proxy refuses GitHub's artifact host).

What a run checks: on a pull request, its commits beyond the base branch (`origin/<base>..HEAD`; the engine freeze and
the differential test against the merge base); on a push, the commits beyond the branch's previous head
(`github.event.before`), or the last commit alone when the branch is new. "The commits this run checks", the first
step of `static`, prints the range. The engine freeze's own check (`tools/engine-freeze/check.ts`) runs on pull
requests only, because its exception names a pull request, which a push does not carry: a merge's push follows its
pull request's run, which the check gated. A direct push to `claude/build-platform` is refused by the build branch's
ruleset (the governance runbook's step 4A, applied 2026-10-25); every push is still checked by the unit job's
differential test, which prices the base's engine and this commit's.

## Reading a red gate

1. Open the run's **all green** job. Its summary (and its log) is a table of every job's result; the error line names
   each job that did not succeed. A `skipped` job is red too: `e2e` skips when `build` failed, so read `build` first.
   A `cancelled` job on an old commit means a newer push superseded it; read the newer run.
2. Open the red job.
   - **`static`:** every step reports; the red ones are the findings. A red "The commits this run checks" means the
     range's base is not in the clone (on a push, a previous head the branch no longer holds, which a force push
     leaves; the build branch's ruleset has blocked those since 2026-10-25).
     - **"Action pins"** (`pnpm actions:check`) names the workflow, the step and the rule: a `uses:` not of the form
       `owner/repo@<40 hex> # vX.Y.Z`, two pins of one action, a SHA that is not the tag's commit, a `with:` key the
       action does not declare at that SHA, a composite nesting an action by tag, or a cache nested in an action
       `release.yml` uses that its inputs do not turn off. Re-pin from the tag's peeled commit,
       `git ls-remote https://github.com/<owner>/<repo> 'refs/tags/vX.Y.Z^{}'`. "… failed 3 times …; the check fails
       closed" names the host that refused or rate-limited the read: re-run the job. On a push run an unchanged pin's
       moved tag is a warning, never a failure, read at the weekly triage (docs/runbooks/dependency-upgrades.md).
     - **"Toolchain"** (`pnpm toolchain:check`) names the rule and the version: an advisory against the pinned pnpm, a
       pnpm or a version the lockfile adds under three days old with no dated exclude, `packageManager` without the
       registry's sha512, a lockfile entry not resolved from registry.npmjs.org by its integrity or not equal to the
       registry's, an added version with weaker trust evidence than an earlier one, an exclude or exception list out of
       step with `pnpm-workspace.yaml`, an override without its entry or missing from the lockfile's own map. "…
       check-toolchain fails closed" names the registry host it could not read: re-run the job. Each other remedy is
       in docs/runbooks/dependency-upgrades.md.
   - **"Wait for the database" in `db`, `domain model` or `e2e`:** compose's own log follows the error. A pull refused
     or slow (Docker Hub) is an infrastructure failure: re-run the job. A healthcheck that never passes is the image's
     or `docker-compose.yml`'s; read the last step, "The database's log".
   - **`db (k/N)`:** the failing file and test are in the suite step's output. "Files this shard ran" lists the files
     the shard ran, with the ten slowest. Run the file locally on its own (below); every db file makes its own
     database, so a shard's failure is a file's, never the shard's order.
   - **`domain model`:** "documents differ", or a function file named missing, extra, differing or "ignored by git"
     (exit 1), means a migration without the regenerated document and `packages/db/functions`
     (`pnpm db:domain-model --out`, through `/new-migration`, then commit both; docs/adr/0068); a function file with
     an executable bit fails it too (`chmod 644` it), and so does a stray entry (named extra) or a symlink or
     directory (named refused). Exit 2 is a refusal, not a difference: a function file name no function could have
     (in the summary step), a symlinked functions directory, a function in a schema other than `public`, or a git
     failure in the summary step, printed with git's own message (a blob missing means a shallow
     clone: the job checks out with `fetch-depth: 0`, so locally run `git fetch --unshallow`). An approval refusal on a schema pull request means the founder has not
     signed yet, and the job prints the SHA-256 to sign (governance runbook, "A pull request that asks you to approve
     the domain model"). The summary step writes the full "Function definitions changed since" section, diffs
     included up to a 900,000-byte budget, to the job summary; a pull request's description carries its
     `--function-diffs list` form, whose list must match. Nothing else is waiting on it: the database suite reports on
     its own.
   - **`e2e (k/M)`:** the failing journey is in the step's output and annotated on the pull request. A screenshot
     comparison prints each diff and actual picture under 300 KB in the log as its SHA-256 and numbered base64 chunks
     (`tools/ci/print-pictures.sh`; rebuild one as "Upgrading the browser", step 5, says; docs/adr/0058). A "flaky" test,
     one that passed only on its retry, fails the run by design: fix it, never re-run it to green. A refusal of the
     build's stamp means the shard was handed another commit's build: re-run the whole workflow, not the shard.
   - **`images`:** the Trivy table names each HIGH or CRITICAL finding with a fixed version: take the fix (a base-image
     or package bump), or record why not in docs/adr/0010's way.
3. **Re-running.** Re-run failed jobs only for an infrastructure failure (a runner lost, a download refused, a service
   that did not start), never for a test that failed: a test that passes on a re-run is a flaky test, and is fixed.
   A re-run replaces the artifacts the first attempt left (`overwrite: true`).

## Timing a run

The target (docs/adr/0066, A1): `all green` within 10 minutes median and 12 worst, from the first job's start to the
gate's end, and at most 50 runner-minutes a run, read on a pull request's last three heads and the first five push
runs after a CI change. Queue time is reported beside it, never folded in.

```sh
run=<run id>
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run/jobs" --paginate \
  --jq '.jobs[] | [.name, .created_at, .started_at, .completed_at, .conclusion] | @tsv'
created="$(gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run" --jq .created_at)"
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run/jobs" --paginate --jq '.jobs[]' | jq -s --arg created "$created" '
  def t: fromdateiso8601;
  map(select(.started_at != null and .completed_at != null)) as $jobs
  | ($jobs | map(.started_at | t) | min) as $first
  | ($jobs | map(select(.name == "all green")) | .[0].completed_at | t) as $gate
  | { wall_minutes: (($gate - $first) / 60),
      queue_minutes: (($first - ($created | t)) / 60),
      runner_minutes: ($jobs | map((.completed_at | t) - (.started_at | t)) | add / 60),
      billed_minutes: ($jobs | map(((.completed_at | t) - (.started_at | t)) / 60 | ceil) | add) }'
```

The time until a pull request can merge (A1′) is the last of the four required checks, from the head's first workflow
run: on a pull request that touches a watched path the capacity gate (about 12 to 19 minutes measured: 11:59, 15:52,
18:28, 18:32 and 17:30 on five runs of 2026-10-25), on a money-path pull request `mutation`, otherwise `all green`. Record which check finished last.

```sh
sha=<head commit>
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=$sha" --jq '[.workflow_runs[].created_at] | min'
gh api "repos/PureTideWater/PhysicalTherapy/commits/$sha/check-runs" --paginate \
  --jq '.check_runs[] | select(.name | IN("all green", "mutation", "screening-capacity gate", "approval-of-record")) | [.name, .started_at, .completed_at] | @tsv'
```

## Dependabot's pull requests and runs

From the founder's switch of the default branch (F1 (a); docs/runbooks/github-governance.md, "The default branch until
launch"), Dependabot reads `.github/dependabot.yml` from `claude/build-platform` and opens its grouped pull requests
there: actions on Tuesdays at 04:37 UTC, the two images and compose's postgres on Wednesdays at 04:43, npm on Thursdays
at 04:31 (up to eight groups). Each runs every workflow a lane's pull request runs: ci.yml (about 38 to 39
runner-minutes), the capacity measurement on a watched path (every npm and actions pull request touches one), and
mutation in full (31 to 36 runner-minutes) when it changes the root manifest, the catalog or `mutation.yml`. A full
Thursday batch is about 550 to 650 runner-minutes and fills GitHub Free's 20 concurrent jobs per account for about 30
to 35 minutes. A person triages every one and never merges one as it stands (docs/runbooks/dependency-upgrades.md).

**The bot queue, for the first four weekly batches.** For each Dependabot head, and for each lane pull request pushed
while a batch runs, take A1′'s two commands above with that head's SHA, and the run's queue time from "Timing a run"
(`queue_minutes`). Record per batch: the heads, each one's queue and A1′, and which check finished last. If a lane
pull request waits more than 15 minutes for its first job, record it: with actionlint accepting `concurrency.queue`,
that is the trigger to revisit one shared queue for Dependabot's runs (docs/adr/0066, Part 2, "Revisit when").

**The weekly read of Dependabot's own runs.** Dependabot runs as Actions runs with `event=dynamic`. A run that opens no
pull request shows only there:

```sh
since=<last triage date, YYYY-MM-DD>
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&created=>=$since" --paginate \
  --jq '.workflow_runs[] | [.id, .name, .conclusion, .created_at] | @tsv'
```

Open every `failure` and read its log (run 40223237798, #38's of 2026-10-25, is one: pnpm refused a locked version under
three days old). A version held back by a release age is a successful run whose log says "release-age block
detected"; under the npm cooldown of three days, equal to the release age, that should not occur, so record any.

## Proving the shards ran every database file once

Each `db (k/N)` job prints "Files db (k/N) ran: <count>, list SHA-256 <hash>", then the sorted list in a fenced block.
The union of the N lists must be disjoint and equal to the db project's files at the head (vitest's `list` ignores
`--shard`, so it gives the whole project):

```sh
run=<run id>
for job in $(gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run/jobs" --paginate --jq '.jobs[] | select(.name | startswith("db (")) | .id'); do
  gh api "repos/PureTideWater/PhysicalTherapy/actions/jobs/$job/logs" | sed -E 's/^[0-9-]+T[0-9:.]+Z //' \
    | awk '/^### Files db \(/ { on = 1; next } on && /^```$/ { if (++fence == 2) exit; next } on && fence == 1'
done | LC_ALL=C sort > shard-files.txt
LC_ALL=C sort -u shard-files.txt | cmp - shard-files.txt   # no file in two shards
pnpm -s vitest list --project db --filesOnly | sed 's/^\[db\] //' | LC_ALL=C sort | diff - shard-files.txt   # every file, once
```

Where `gh api .../logs` is refused, read each job's log with the GitHub connector's `get_job_logs` and take the same
lines. A shard's hash is the SHA-256 of its list, sorted bytewise (`LC_ALL=C sort`) with a newline after each path
(`sha256sum` of the block's lines).
`tools/test/db-shards.test.ts` proves the same split for 4 and 6 shards through vitest's own sequencer on every run.

## A private repository

GitHub's standard runner for a private repository has 2 CPUs and 8 GB, not 4 and 16. The matrices widen by themselves
from `github.event.repository.private`: six `db` shards and three `e2e` shards, so the wall stays near 10 minutes, at
about 70 to 80 billed minutes a push instead of about 38 to 39 runner minutes (44 to 45 billed). The lint runner fits its groups to the host's memory (web
alone, then the others), and the capacity measurement refuses a 2-CPU runner (docs/runbooks/screening-capacity.md, "The
8-core runner"). So does release-capacity's weekly real-size test (`run.ts` stops as RUNNER_TOO_SMALL before measuring):
on a private repository it needs the same 4-core larger runner as screening-capacity's, which needs an organization on
GitHub Team and is billed per minute beyond the included minutes (about 780 larger-runner minutes a month, priced
separately); until its label changes with screening-capacity's, the weekly run fails every week without measuring.
The daily content calendar adds about 450 standard minutes a month, plus one check run (at most 15 minutes) for each
push to `claude/build-platform` or pull request update touching the calendar, its tool or `content/`, a few a week while
a period's content is being loaded: together inside GitHub Team's included 3,000. Read the budget after the first
private week (docs/runbooks/github-governance.md, step 1).

## Caches

| Cache | Key | Saved by | Restored by |
| --- | --- | --- | --- |
| The pnpm store | setup-node's own | every job | every job |
| tsc's build information, `node_modules/.cache/tsc` | `tsc-v1-<os>-<lockfile hash>-<commit>` | `static`, when its typecheck ran | `static`, by the prefix with the lockfile's hash, then any |
| Each db shard's test durations, `node_modules/.vite/vitest` | `vitest-db-v1-<os>-<N>-<k>-<commit>` | each `db` shard, whatever its result | the same shard, by prefix |
| Playwright's browsers, `~/.cache/ms-playwright` | `playwright-v1-<os>-<hash of playwright-core's browsers.json>` | `unit`, on a miss, after the browser build check passed | `unit`, every `db` and `e2e` shard, by the exact key |
| The browser jobs' system packages, `$RUNNER_TEMP/apt-archives` | `apt-v1-<ImageOS>-<ImageVersion>-<hash of playwright-core's browsers.json>`, from the `runner-image` step's `key` and `os` outputs; restore-keys `apt-v1-<ImageOS>-<ImageVersion>-`, then `apt-v1-<ImageOS>-` | `unit`, on a miss (`tools/ci/apt-archives.sh collect`); `screening-capacity.yml`'s `capacity`, on a miss, under its own `ubuntu24` key | `unit`, every `db` and `e2e` shard, `large-zip`, `screening-capacity.yml`'s `capacity`; each file verified before apt sees it (`tools/ci/apt-archives.sh verify`) |

A run restores its own branch's caches and the default branch's. A pull request's caches are scoped to its own ref, and
the default branch's are written only by runs of the build branch's own code (push, schedule, dispatch), so the first
pull request after a CI change runs cold. Under F1 (a) the build branch is the default branch
until launch, so every branch's runs, and every tag's, may restore what its push runs saved; `release.yml` therefore
restores none, and builds or downloads everything its attested report rests on in its own run (docs/adr/0062). A cache only saves time: tsc compares every input's
hash, the durations only order a shard's files, whose membership the paths alone fix, and the browsers' key is the
list of builds the installed Playwright pins, whose install fetches any build missing from the cache (on a hit it
fetches only the system libraries; in run 40166129200, whose seven installs took 18 to 29 seconds, the browsers'
download was about 10 of `e2e (1/2)`'s 24). The image scans keep no cache: each downloads Trivy's vulnerability
database, the data its verdict is made from, into the runner's temporary directory, outside the checkout the worker
image is then built from. To clear one: `gh cache list --key <its key's prefix>` (`tsc-v1-`, `apt-v1-`, …) and
`gh cache delete <id>`.

The system packages' cache exists because `playwright install --with-deps` fetches Chromium's libraries and fonts from
Ubuntu's mirror one package at a time, and about one install in nine stalled there (10 of 92 installs over 60 s, up to
612 s, in the 14 ci.yml runs before it; run 40226881568 spent 609 s of `db (4/4)`'s 13 minutes on 25.9 MB). apt takes a
file already in its archive directory as downloaded when its size matches the index, without hashing it, so a restored
file is never handed to apt as it is: `apt-archives.sh verify` runs `apt-get update` (the signed indexes, fresh), reads
each file's package, version and architecture from its name, and copies it into `/var/cache/apt/archives/` only when its
SHA-256 equals the index's for that exact version; any other file (changed, truncated, or a version the index no longer
lists) is deleted and apt downloads that package. It prints the counts kept and discarded, and fails only when apt does.
It also writes `/etc/apt/apt.conf.d/90paidwhole-keep-archives` (`APT::Keep-Downloaded-Packages "true";`), so what the
install downloads stays for `collect`, which warns when it finds no file. The key moves with the runner image and with
the browser build, and a security update is a new version, which apt fetches and the next miss in `unit` saves. The
key's `<ImageOS>` and `<ImageVersion>` are the runner's `ImageOS` and `ImageVersion` environment variables, which the
`runner-image` step reads, and that version can differ from the one "Set up job" prints: in run 40534270846 (pull
request #77's first) the `db` and `e2e` jobs' "Set up job" printed 20261012.163.1 while their `ImageVersion`, and so
their key (`apt-v1-ubuntu26-20261023.163.3-…`), was 20261023.163.3. Match a key against the job's `ImageVersion`, never
against "Set up job". The cache can only save time: every file apt uses is one the signed index names.

## Upgrading the browser

A Playwright upgrade (Dependabot's weekly `browser-tests` group, or by hand) brings a new Chrome for Testing build, and
every `browser-tests` pull request is red on the browser build check until a person runs this procedure (docs/adr/0058;
docs/runbooks/dependency-upgrades.md). The check's message reads "The headless shell is <found version> (revision
<found>, tree SHA-256 <found>, binary SHA-256 <found>), and browser.json records <expected version> (revision
<expected>, …)", and the same for Chromium. Every later step of the job still ran, so the same run shows whether a
journey broke and how the baselines moved: read those failures as the new version's, not the check's.

**What `browser.json` records.** `apps/web/e2e/browser.json` holds the `revision` and `browserVersion` the installed
playwright-core's `browsers.json` must pin, and, for each build (`chromium-headless-shell`, which renders the baselines
and prints the worker's PDFs, and `chromium`, which `playwright.config.ts` probes for): `dir` and `path` (the build's
directory and binary under `chromium_headless_shell-<revision>` or `chromium-<revision>`), and six hashes in all, three
per build:
- `treeSha256`, what CI checks: the SHA-256 of the lines `"<sha256>  <path>\n"` of every regular file under `dir`,
  sorted by path bytes, which is exactly
  `cd <revision folder> && find <dir> -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum`;
  the lines themselves are committed as `apps/web/e2e/browser-builds/<dir>.sha256`, whose own SHA-256 is `treeSha256`,
  so a failing check names the files that differ;
- `sha256`, the binary's, named in the message;
- `zip` and `zipSha256`, Google's Chrome for Testing zip and its SHA-256: the local layout's pin, which
  `setup-container.sh`'s `CFT_BUILDS` rows equal.

`node tools/ci/browser-build.ts` checks the builds Playwright installed (under `PLAYWRIGHT_BROWSERS_PATH`, else
`~/.cache/ms-playwright`); `--image <ref>` checks a built worker image's headless shell inside the image, reading it
as root, offline and from the local tag only (`docker run --rm --pull never --user 0:0 --network none`: the image's own
user cannot read Chrome for Testing's mode-0600 `deb.deps` and `rpm.deps`, and a tag missing on the runner fails
rather than being pulled from a registry and checked in place of the image just built). Inside the image each stage of
the hash run reports its own exit status, so a file that cannot be read or hashed fails the check as "could not be
hashed whole", naming the tool and the file, never as a file the image lacks. `--list` prints every file's line of each
build it found. A build that fails the check has its every file's line printed anyway, two spaces in, as `--list`
prints them, and on a tree difference at the recorded revision the message names every path that differs from the
committed list, so one red CI run gives everything a new record needs.

The hashes cover a build's bytes, not its files' modes nor the shared libraries and fonts the system provides, so a
build equal to the record in every file can still fail to start. Once every file of a build equals the record, and
only then (a binary is never run before its bytes are proven), the check runs the binary's `--version` and fails unless
it exits 0 printing exactly `Google Chrome for Testing <browserVersion>`: on the runner as the job's user, and in the
image as the image's own user (`docker run --rm --pull never --network none`, no `--user`), the user that prints
customers' PDFs, while the hashes stay root's. Its message, "<build> does not run as browser.json's build", names the
command, who ran it and what it printed or how it ended. That is not an upgrade: the bytes are the record's, so look
outside them, at a shared library the runner or the image lacks (a base image or `--with-deps` change) or a mode or
user that cannot run the binary.

**The procedure,** in the upgrade's own pull request:
1. **Lay the new build out locally.** Run `setup-container.sh` with the worktree as an argument: it lays out every
   revision the worktree's playwright-core pins from the pinned zips in `CFT_BUILDS`, and fails naming a revision that
   has no row (add the row: the version, both zips and their SHA-256s from
   `storage.googleapis.com/chrome-for-testing-public/<version>/linux64/`). By hand: download
   `chrome-linux64.zip` and `chrome-headless-shell-linux64.zip`, check their SHA-256s, unzip them into
   `$PLAYWRIGHT_BROWSERS_PATH/chromium-<revision>/` and `$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-<revision>/`,
   and touch `INSTALLATION_COMPLETE` and `DEPENDENCIES_VALIDATED` in each of the two folders. pnpm keeps the replaced
   playwright-core in `node_modules/.pnpm` for up to seven days, and `workflows.test.ts` requires the one the lockfile
   installs alone there (the apt cache's key hashes every `playwright-core@*`): remove it with
   `pnpm install --frozen-lockfile --config.modules-cache-max-age=0`. CI installs into an empty `node_modules`.
2. **Record it.** In `browser.json`, the new `revision` and `browserVersion`; for each build, the zips' SHA-256s,
   the file list (`cd "$PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-<revision>" && find chrome-headless-shell-linux64
   -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > <repo>/apps/web/e2e/browser-builds/chrome-headless-shell-linux64.sha256`,
   and the same for `chrome-linux64` under `chromium-<revision>`), `treeSha256` as that file's `sha256sum`, and `sha256`
   as the binary's line in it. `node tools/ci/browser-build.ts` then passes locally.
3. **Regenerate the baselines** with `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts
   --update-snapshots=all` (`=all` rewrites every snapshot; Playwright 1.64 renamed the bare flag's modes), then run
   it again: `git status` must be clean after the second. An upgrade can change every picture's bytes with no pixel
   moved: `=all` rewrites any byte difference, and Playwright's PNG encoder may pick other scanline filters (1.64.1's
   did, so six of the seven baselines changed bytes only). Commit every file it wrote, since CI's baseline step compares
   bytes, and count changed pixels, not bytes, before reading a picture as moved (step 7).
4. **Fix what new rules find.** A new axe release can enable a rule (4.14.0 enabled `label-content-name-mismatch`,
   WCAG 2.5.3): every journey's `expectAccessible` runs it, so fix the finding in the page, not in the scan.
5. **Read CI's baseline step.** `e2e (1/M)` regenerates the brand baselines from nothing with
   `--update-snapshots=all --retries=0` on CI's runner, into an empty directory outside the repository
   (`E2E_BASELINES_DIR`, which `playwright.config.ts` turns into the snapshot path, laid out as the repository is), so
   the tracked tree stays clean for the build stamp; it requires the pictures present after the run to be exactly the
   committed set (no message of Playwright's is read) and each to equal the committed file byte for byte, and prints
   every written picture's SHA-256 under its repository path. On a difference it fails and prints,
   for each changed picture, a line `<path> sha256 <hex>` and then the picture's base64 as lines
   `<path> <i>/<n> <8,000 characters>`, so a log reader that cuts long lines still gets it whole. Take every line
   `<path> 1/<n>` to `<path> <n>/<n>` (a gap means a fuller read of the log, never a partial decode; strip the log's
   timestamps first), join the third fields in order, decode them (`base64 -d > <path>`), require `sha256sum <path>` to
   equal the printed `<hex>`, and commit CI's bytes, since CI is where the comparisons run; an unchanged picture's
   committed bytes stand. Where they differ from the local regeneration, record the local host's disagreement in
   ADR 0058. The step runs on every pull request and every push run, whatever changed, because application code draws
   the pictures too.
6. **If CI's browser differs from the record.** CI downloads from Playwright's mirror (`cdn.playwright.dev`), whose bytes
   are proved equal to Google's only by CI's own check. If the check fails on the first run with the new record, its
   output already lists every file CI installed, but CI's values are not taken on their own word: in a commit of its
   own, a one-off step in `unit` after the check (`if: ${{ !cancelled() }}`) downloads Google's two zips
   (`https://storage.googleapis.com/chrome-for-testing-public/<version>/linux64/<zip>`), requires their SHA-256s to be
   `zipSha256`, unzips them into a temporary `PLAYWRIGHT_BROWSERS_PATH` layout and prints `node
   tools/ci/browser-build.ts --list` over it. If Google's tree equals the record's and the mirror's does not, the
   mirror serves another build: the record stands and CI installs Google's verified zips instead. If Google's equals
   the mirror's and not the record's, the record was wrong: `treeSha256`, `sha256` and the file lists take the values
   both agree on, the zip fields unchanged. Anything else: stop and ask. Revert the one-off commit before the next run,
   and record the outcome in ADR 0058 against "Google's build renders as Playwright's".
7. **Inspect every picture** before the merge: each old and new baseline at full resolution, the changed pixels counted
   exactly and under the journey's own comparator, the changed box cropped (old, new, difference), and ADR 0058's
   brand points checked on each new image (the lockup and keystone, the brand colours, the faces, the seal and its
   definition on the with-seal cover, a blank Paper foot on the without-seal cover). For the 1.64.1 upgrade an
   adversarial visual-inspection agent did this, and the pull request links the record (the pictures side by side,
   both counts, the crops and the agent's verdict) by a commit-pinned URL.
8. Commit the manifests, the lockfile, `browser.json` with its lists, the baselines and any fix together.

## Running the same checks locally

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:golden`, `pnpm test:oracle` (pyx12 in a virtualenv).
- One database file: `docker compose up --detach --wait postgres` (the image CI runs), then
  `DATABASE_URL=postgres://postgres:test@localhost:5432/postgres pnpm vitest run --project db <file>` (each file makes
  and drops its own database). A shard as CI runs it: `pnpm test:db --shard=k/N`.
- The schema approval: `pnpm db:migrate && pnpm db:domain-model --check --strict --require-approval`.
- The journeys over a build of this commit, from a tree with no uncommitted change: `pnpm build`, then
  `pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"`, then
  `E2E_PREBUILT=1 pnpm test:e2e`. The stamp and the run both refuse a tree with uncommitted changes, which a stamp
  that names a commit cannot vouch for; with edits in the tree, leave `E2E_PREBUILT` unset and the web server builds
  first.
- The workflows: `actionlint .github/workflows/*.yml`, and `pnpm exec vitest run tools/test/workflows.test.ts
  tools/test/dependabot-config.test.ts tools/test/no-duplicated-versions.test.ts tools/test/ci-gate.test.ts
  tools/test/required-checks.test.ts`; the pins and the toolchain against the build branch:
  `BASE=origin/claude/build-platform pnpm actions:check` and `BASE=origin/claude/build-platform pnpm toolchain:check`.

## Changing CI

- A new ci.yml job joins `all green`'s `needs` (`workflows.test.ts` fails until it does) and the timeouts table
  (CI-10), and installs Chromium before any vitest step of the unit or db project (CI-05).
- A new required check changes `tools/required-checks.ts`, every marked listing (the test names each file) and the
  ruleset, which only the founder sets.
- A new workflow's concurrency group starts with its own name (`${{ github.workflow }}-`), since groups are shared by
  every workflow of the repository.
- A new action is pinned as `owner/repo@<40 hex> # vX.Y.Z` at its latest release, read with `git ls-remote`, and takes
  the same SHA wherever it is used; `pnpm actions:check` reads it. Behaviour asserts in `workflows.test.ts` find a step
  by the action's name (`usesAction`), never by a version, so Dependabot's pin bumps stay green.
- A job that needs PostgreSQL runs `tools/ci/postgres.sh up` right after its checkout and `tools/ci/postgres.sh wait`
  before its first database step, with "The database's log" last (`workflows.test.ts` holds the order); no workflow
  declares `services:`.
- A change to `release.yml`, the Dockerfiles or their pnpm installer runs `release-dry-run.yml` (advisory) on its pull
  request: read it, since no tag runs the release before the founder's. It runs release.yml's build on the `web` and
  `worker` legs (the worker's headless shell check included) and its `push` and `capacity` jobs up to the push and the
  frozen install; a change to `release.yml` changes the dry run's matching step too, or `workflows.test.ts` fails. What
  only a tag runs is listed in docs/adr/0066, Part 3, N16.

## Mutation testing

`.github/workflows/mutation.yml` scores the money paths by mutation (PRD 18; docs/adr/0066, Part 4): the money package,
the pricing engine, the ledger, and the packet verifier and arithmetic. Its `mutation` job is one of the required
checks above.

### What runs

- **On a push to `claude/build-platform`, weekly, and on request:** every package, all six shards.
- **On a pull request:** every shard of each package whose closure the change touches, and nothing else. The
  `changes` job prints which packages it chose and why (the first changed paths that reach each one) to its log and
  summary (`tools/stryker/affected.ts`). A package's closure is:
  - its mutated files and its tests, and everything they import, upstream workspace packages included (every package
    `pnpm-workspace.yaml` lists, resolved as the mutation aliases resolve them, `tools/stryker/workspace.ts`);
  - the `package.json` and `tsconfig.json` of each workspace package in that closure;
  - the data files its tests and code read (`DATA_FILES` in `affected.ts`);
  - the third-party packages it imports, what the mutation tooling itself imports (yaml) and the test tooling
    (vitest, `@vitest/*`, `@stryker-mutator/*`, fast-check, tsx), as the lockfile resolves them: a lockfile change
    counts only when it moves one of them, or anything below them.

  Closures are taken at the head and at the merge base, and a changed path a package's mutate or test set selects
  counts whether or not it still exists, so deleting a money test, renaming one to `*.db.test.ts`, or deleting a
  helper, manifest or fixture only the old side held, measures its package.

  The mutation configuration (`stryker/**`, `tools/stryker/**`, `vitest.mutation.config.ts`), the root
  `package.json`, `pnpm-workspace.yaml`, the root tsconfigs and this workflow affect all four.
- **A pull request that touches no money path** runs only `changes` and `mutation`, which passes with "No money path
  changed".

| Shard | Mutates | Time (Stryker's, 4 CPUs shared with other work, 2026-10-25) |
| --- | --- | --- |
| `money-ledger` | money, then the ledger | 3 min 37 s (money 32 s, the ledger 3 min 5 s) |
| `packets-scan` | packets' `scan.ts` | 6 min 13 s |
| `packets-rest` | the rest of packets' set | 5 min 43 s |
| `pricing-engine` | pricing's `engine.ts` | 8 min 25 s |
| `pricing-recompute` | pricing's `recompute.ts` | 3 min 47 s |
| `pricing-rest` | the rest of pricing | 5 min 24 s |

Each shard job runs the canary first (`tools/stryker/canary`, about 7 s). It then runs its packages
(`pnpm -s exec tsx tools/stryker/shards.ts <shard>`), prints its files' scores and survivors, and uploads
`reports/mutation/<shard>/` (`<package>.json` and `.html`, and `canary.json`) as `mutation-<shard>`.

### Reading a red `mutation`

The `mutation` job's log and summary give each package's score, each file's score, and every survivor, with the tests
that cover it. Scores are truncated to two decimals, never rounded up, so one may read 0.01 below Stryker's own table.
Each `FAIL` line, also an error annotation, is one of these:

| Failure | What it means | What to do |
| --- | --- | --- |
| `<pkg>: unexplained Survived ...` or `NoCoverage ...` | a mutant no test told apart from the code | Kill it with a test: assert the error's class and message, test the boundary value, pin a property's counterexample as a fixed example. Record it as equivalent only if no input can tell it apart (below) |
| `<pkg> scores 85.00% (... of ...), not above 85%` | the package is at or below PRD 18's line (killed + timeout over killed + timeout + survived + no coverage; load failures left out, recorded equivalents counted as survivors) | Kill survivors. Recording equivalents never raises a score |
| `<pkg>: RuntimeError that is not a test file's load failure` | the mutant made Vitest fail outside any test, and not by breaking a test file's load | Read the reason; it is a real error the run must not hide |
| `shard <s> ran with no canary verdict` or `canary is n of 5` | the shard's runner was not proved | Read the shard's canary step (below) |
| `<pkg> ran in ... but not in ...` | some of a package's shards ran and some did not | Re-run the failed or missing shard jobs |
| `... records ... which no longer exists (stale)` | a recorded equivalent matches no mutant: its code changed | Remove the entry, then judge the new mutant afresh |
| `... records ... as equivalent, but it is Killed` | a test now tells the recorded mutant apart, so it was never equivalent | Remove the entry |
| `... is not reviewed` | an equivalent lacks its reviewer and date | The reviewer confirms it independently, then fills `reviewedBy` and `reviewedOn` |
| `... is reviewed by its proposer` or `... after the run's date` | the entry's reviewer is the builder who proposed it, or its date is in the future | Another person reviews it, on the day they do |
| `shard <s>'s <pkg> report has no <file>, which the shard mutates` | the shard's run left a file out (a narrowed `mutate`, a crashed run), or a file Stryker finds no mutant in is not listed | Re-run the shard; a file of imports, re-exports and types only goes in `stryker/shards.json`'s `noMutants` (a test holds it there) |
| `shard <s> left <pkg>.json, a report of <pkg>, which the shard does not hold` or `the reports directory holds <file> at its top` | a report the gate would otherwise not judge | Read where it came from; the gate reads only `<shard>/` directories, each holding its own packages' reports |
| `<pkg>: n recorded equivalents rest on the engine's Unicode data as Node ... has it ...` | a shard ran on a Node whose Unicode or ICU data differs from what `tools/stryker/unicode.json`'s entries were checked on | Run mutation on the pinned Node; when moving the pin, check those entries again over every code point on the new Node, then record it in `unicode.json` |
| `shard <s>'s canary verdict names no runtime` | the canary's verdict lacks the Node, Unicode and ICU versions it ran on | Re-run the shard with this commit's `verdict.ts` |

A job line, not a gate line:
- **"The changes job ended failure":** read `changes`. It stops, naming the file, on:
  - a data path a closure names that `DATA_FILES` lacks: add it with its reason (or, for a directory read file by
    file, to `DIRECTORY_READS`, which must list every file the reader names there);
  - a closure file that imports `node:fs` and is no `DATA_FILES` entry's reader, no `DIRECTORY_READS` file and no
    `UNCALLED_READS` file: name it where it belongs, with what it reads;
  - an import of a relative path, or of a workspace package's name or scope, that resolves to no file (an unexported
    subpath, a package without `exports`): export it, or fix the import;
  - a third-party package a closure imports that the lockfile resolves for no importer.
- **"The changes job gave no verdict" or "gave shards=... not JSON arrays":** its outputs are missing or garbled, so
  nothing is known about what changed; `mutation` fails closed. Read `changes`' last step.
- **"A shard job ended failure":** read that shard's job.
  - **The canary step.** It prints each of its five cases; a case "NOT as expected" lists the mutant and the status it
    got against the one `tools/stryker/canary/expected.json` allows. The cases:
    1. runtime mutants selected by their tests' names;
    2. a mutant that breaks a test file's load: RuntimeError or Killed, never Survived;
    3. a workspace package imported by name: the aliases;
    4. a mutant only the seeded property kills: the seed;
    5. a test whose name starts with the covering test's: must not run.

    A Stryker or fast-check upgrade that fails a case has changed what the scores rest on. Read the case: never
    update `expected.json` to match the new status without knowing why it moved.
  - **The shard step.** Stryker's own error, or the 30-minute timeout. Rebalance `stryker/shards.json` if a shard
    nears it.

Re-run a shard job only for an infrastructure failure; its upload overwrites the first attempt's.

### Recording an equivalent

Only when no input can tell the mutant from the original: for example, `a <= b ? a : b` mutated to `a < b ? a : b`,
equal at the boundary. Not for a mutant no test happens to reach, an error text nobody asserts, or a branch "that never
runs": kill those with a test. "No input" means no value of the function's declared parameter types, as plain data (a
string is any text, an object exactly its declared fields), on any conforming engine. So these are not equivalents,
and a test kills them:
- a comparator mutant that sorts right only because V8 calls the comparator as (later, earlier): run the code under an
  insertion sort that calls it as (earlier, later) too (`packages/pricing/src/sorts.test.ts`,
  `packages/ledger/src/allocation.test.ts`);
- a mutant told apart only by text that is not a date, where the code compares dates as text
  (`packages/packets/src/assemble.test.ts`, "assemblePacket's dates as text");
- a sort of a list already in order, when an earlier sort's comparator is inconsistent for a value of the declared
  type (`packages/pricing/src/sorts.test.ts`, the NaN line number case).

A test may also hold the code to an input beyond its declared types, as hardening, when it asserts the code's own
outcome for that input (its own check's error class and message, or its reason): such a kill stands and the mutant is
not recorded, but it is no evidence against an entry. A kill that rests only on an incidental failure (a TypeError from
a method the value lacks, asserted by a bare `toThrow`) is not one: the mutant is recorded and the test dropped
(`packages/money/src/rounding.ts`'s bigint check).

An entry that rests on the engine's Unicode data (NFKC forms, grapheme clusters) says so in its reason, the reviewer
checks it over every code point on the Node the workflow pins (24.22.0 in all three jobs), and
`tools/stryker/unicode.json` lists it with that Node's Unicode and ICU versions (`tools/stryker/gate.test.ts` fails
while an equivalent whose reason names Unicode is not listed). The gate fails a listed entry when a shard ran on other
data, and a test fails when the pin and the listing's Node differ.

Each package's builder records its own in `tools/stryker/equivalent/<package>.json`, a
JSON array sorted by file, then original, then occurrence (strings in code-unit order, as `Array.prototype.sort`
compares them). Each entry has exactly these keys, in this order:

```json
{ "file": "packages/money/src/cents.ts", "mutator": "EqualityOperator", "original": "a <= b", "occurrence": 1,
  "replacement": "a < b", "reason": "Both return a when a equals b.", "proposedBy": "<builder>",
  "reviewedBy": "", "reviewedOn": "" }
```

- `original` is the exact source text Stryker replaced. `occurrence` is which occurrence of that text in the file
  (from 1, counting every start position), so an edit elsewhere in the file leaves the entry valid.
- The builder leaves `reviewedBy` and `reviewedOn` empty. The reviewer fills them (a name and a `YYYY-MM-DD` date)
  only after confirming the entry independently. The gate refuses an unreviewed entry of every package it scores, one
  whose `reviewedBy` is its `proposedBy`, and one dated after the run.
- The file is the only form: no `// Stryker disable` comments (the engine freeze forbids them in the engine; the gate
  fails an Ignored mutant anywhere).
- To list a report's survivors with their original text and occurrence:
  `pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard <shard>` after a shard run.

### Running it locally

Run one shard at a time, never two, on the Node the workflow pins (24.22.0: the gate holds the Unicode-bound
equivalents to its data). Each command writes `reports/mutation/<shard>/`, then the gate reads it:

```sh
pnpm stryker run tools/stryker/canary/stryker.config.mjs
pnpm -s exec tsx tools/stryker/canary/verdict.ts --shard money-ledger
pnpm -s exec tsx tools/stryker/shards.ts money-ledger
pnpm -s exec tsx tools/stryker/gate.ts reports/mutation
```

The last line judges what ran: a package none of whose shards ran is "not affected". A narrow run while killing
survivors: `pnpm stryker run stryker/<package>.config.mjs --mutate <file>[:<lines>]` (report
`reports/mutation/<package>.json`, at the top of the directory, which the gate refuses as stray: delete it, or point
the gate at a directory of shard reports only). A package's mutation test set outside Stryker:
`TP_MUTATION_PACKAGE=<package> pnpm exec vitest run --config vitest.mutation.config.ts`. What a branch affects:
`pnpm -s exec tsx tools/stryker/affected.ts --base origin/claude/build-platform`.
