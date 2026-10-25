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
(`tools/test/required-checks.test.ts`). The founder sets them in the ruleset (docs/runbooks/github-governance.md, step
4A). No other ci.yml job is required by name: `all green` needs them all, so a shard added or removed changes no setting.

## The jobs

| Job (its check) | What it runs | Timeout |
| --- | --- | --- |
| `static` | the dependency audit; the secret scan of the commits the run checks; the fixture check; the content checker; published releases and prompt versions unchanged; the engine freeze (pull requests); `pnpm synth --all` and its clean diff; `pnpm typecheck`; `pnpm lint:logs`; `pnpm test:golden`; `pnpm synth --large` (the 10,000-claim remittance the oracle reads) and `pnpm test:oracle`; `pnpm licenses:check` | 15 min |
| `lint` | `pnpm lint`, ESLint in three memory-bounded groups | 15 min |
| `unit` | Chromium, the pinned gitleaks (the pre-push hook's tests run it), the engine freeze's base, `pnpm test` (with coverage) | 20 min |
| `db (k/N)` | its own Postgres, Chromium, `pnpm db:migrate && pnpm test:db --shard=k/N`, then "Files this shard ran" | 20 min |
| `domain model` | its own Postgres; on a pull request "Changes since the last approved domain model"; `pnpm db:migrate`; `pnpm db:domain-model --check --strict --require-approval` | 10 min |
| `build` | `pnpm build` (web and worker); the web build stamped and kept as `web-build`; `pnpm cdk:diff` | 15 min |
| `e2e (k/M)` | after `build`: its own Postgres, Chromium, the downloaded build, `pnpm test:e2e --shard=k/M`; its report kept as `playwright-<k>` | 25 min |
| `images` | both images built from their Dockerfiles and scanned by Trivy | 20 min |
| `all green` | every job's result, to its log and its summary | 5 min |

Each `static` check runs once the install succeeded, whatever the check before it did, so one red step does not hide
the others' verdicts. Every verdict a job writes to its summary it also writes to its log, which is what the verifier
reads (the session's proxy refuses GitHub's artifact host).

What a run checks: on a pull request, its commits beyond the base branch (`origin/<base>..HEAD`; the engine freeze and
the differential test against the merge base); on a push, the commits beyond the branch's previous head
(`github.event.before`), or the last commit alone when the branch is new. "The commits this run checks", the first
step of `static`, prints the range. The engine freeze's own check (`tools/engine-freeze/check.ts`) runs on pull
requests only, because its exception names a pull request, which a push does not carry: a merge's push follows its
pull request's run, which the check gated, and a direct push to `claude/build-platform`, which the ruleset of the
governance runbook's step 4A blocks once the founder applies it, is until then checked by the unit job's differential
test alone, which prices the base's engine and this commit's.

## Reading a red gate

1. Open the run's **all green** job. Its summary (and its log) is a table of every job's result; the error line names
   each job that did not succeed. A `skipped` job is red too: `e2e` skips when `build` failed, so read `build` first.
   A `cancelled` job on an old commit means a newer push superseded it; read the newer run.
2. Open the red job.
   - **`static`:** every step reports; the red ones are the findings. A red "The commits this run checks" means the
     range's base is not in the clone (on a push, a previous head the branch no longer holds, which a force push
     leaves; once the founder applies step 4A's ruleset, it blocks those).
   - **`db (k/N)`:** the failing file and test are in the suite step's output. "Files this shard ran" lists the files
     the shard ran, with the ten slowest. Run the file locally on its own (below); every db file makes its own
     database, so a shard's failure is a file's, never the shard's order.
   - **`domain model`:** "documents differ" means a migration without the regenerated document
     (`pnpm db:domain-model --out`, through `/new-migration`); an approval refusal on a schema pull request means the
     founder has not signed yet, and the job prints the SHA-256 to sign (governance runbook, "A pull request that asks
     you to approve the domain model"). Nothing else is waiting on it: the database suite reports on its own.
   - **`e2e (k/M)`:** the failing journey is in the step's output and annotated on the pull request. A screenshot
     comparison prints each diff and actual picture under 300 KB in the log as base64 (docs/adr/0058). A "flaky" test,
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
run: on a pull request that touches a watched path the capacity gate (13 to 16 minutes measured), on a money-path pull
request `mutation`, otherwise `all green`. Record which check finished last.

```sh
sha=<head commit>
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=$sha" --jq '[.workflow_runs[].created_at] | min'
gh api "repos/PureTideWater/PhysicalTherapy/commits/$sha/check-runs" --paginate \
  --jq '.check_runs[] | select(.name | IN("all green", "mutation", "screening-capacity gate", "approval-of-record")) | [.name, .started_at, .completed_at] | @tsv'
```

Dependabot's pull requests are read the same way; their runs queue behind the account's other jobs (GitHub Free runs
20 jobs at once per account, ci.yml up to about 11 of them), and that bot queue time is reported apart.

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
about 70 to 80 billed minutes a push instead of about 45. The lint runner fits its groups to the host's memory (web
alone, then the others), and the capacity measurement refuses a 2-CPU runner (docs/runbooks/screening-capacity.md, "The
8-core runner"). Read the budget after the first private week (docs/runbooks/github-governance.md, step 1).

## Caches

| Cache | Key | Saved by | Restored by |
| --- | --- | --- | --- |
| The pnpm store | setup-node's own | every job | every job |
| tsc's build information, `node_modules/.cache/tsc` | `tsc-v1-<os>-<lockfile hash>-<commit>` | `static`, when its typecheck ran | `static`, by the prefix with the lockfile's hash, then any |
| Each db shard's test durations, `node_modules/.vite/vitest` | `vitest-db-v1-<os>-<N>-<k>-<commit>` | each `db` shard, whatever its result | the same shard, by prefix |
| Playwright's browsers, `~/.cache/ms-playwright` | `playwright-v1-<os>-<hash of playwright-core's browsers.json>` | `unit`, on a miss | `unit`, every `db` and `e2e` shard, by the exact key |

A pull request restores its own caches and its base branch's, and only push runs on the build branch write the base
branch's, so the first pull request after a CI change runs cold. A cache only saves time: tsc compares every input's
hash, the durations only order a shard's files, whose membership the paths alone fix, and the browsers' key is the
list of builds the installed Playwright pins, whose install fetches any build missing from the cache (on a hit it
fetches only the system libraries; in run 40166129200, whose seven installs took 18 to 29 seconds, the browsers'
download was about 10 of `e2e (1/2)`'s 24). The image scans keep no cache: each downloads Trivy's vulnerability
database, the data its verdict is made from, into the runner's temporary directory, outside the checkout the worker
image is then built from. To clear one:
`gh cache list --key tsc-v1-` and `gh cache delete <id>`.

## Running the same checks locally

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:golden`, `pnpm test:oracle` (pyx12 in a virtualenv).
- One database file: `DATABASE_URL=postgres://postgres:test@localhost:5432/postgres pnpm vitest run --project db <file>`
  (each file makes and drops its own database). A shard as CI runs it: `pnpm test:db --shard=k/N`.
- The schema approval: `pnpm db:migrate && pnpm db:domain-model --check --strict --require-approval`.
- The journeys over a build of this commit, from a tree with no uncommitted change: `pnpm build`, then
  `pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"`, then
  `E2E_PREBUILT=1 pnpm test:e2e`. The stamp and the run both refuse a tree with uncommitted changes, which a stamp
  that names a commit cannot vouch for; with edits in the tree, leave `E2E_PREBUILT` unset and the web server builds
  first.
- The workflows: `actionlint .github/workflows/*.yml`, and `pnpm exec vitest run tools/test/workflows.test.ts
  tools/test/ci-gate.test.ts tools/test/required-checks.test.ts`.

## Changing CI

- A new ci.yml job joins `all green`'s `needs` (`workflows.test.ts` fails until it does) and the timeouts table
  (CI-10), and installs Chromium before any vitest step of the unit or db project (CI-05).
- A new required check changes `tools/required-checks.ts`, every marked listing (the test names each file) and the
  ruleset, which only the founder sets.
- A new workflow's concurrency group starts with its own name (`${{ github.workflow }}-`), since groups are shared by
  every workflow of the repository.
