# Review: draft PR #43 (co-001/ci-speed), security and supply chain

- Reviewer: security and supply-chain lens (.claude/agents/security-reviewer.md applied to what the PR touches)
- Head reviewed: 9144b56900d2a80779f55b0e5cf666e08c586247, against claude/build-platform 49514e8
- Clone: a fresh `git clone` of PureTideWater/PhysicalTherapy at the head, `pnpm install --frozen-lockfile
  --prefer-offline` (exit 0). Read-only: no commit, no push, no GitHub comment.
- Verdict: nothing blocking. The workflow permissions, secrets, artifacts, caches, the moved supply-chain gates, CO-02,
  the compliance evidence, the page-read memo, the snapshot fold and the secret scan all check out. One should_fix (the
  required-check names are not held unique, and `all green` now stands for every CI gate) and five nits, all on
  hardening or how the documents word things.

## CI on the head

Run 40166129200 (pull_request, attempt 1, created 05:36:10Z). All 13 jobs succeeded:

| Job | Id | Duration |
| --- | --- | --- |
| static | 121087436738 | 2:20 |
| lint | 121087436693 | 1:25 |
| unit | 121087436812 | 2:41 |
| db (1/4) | 121087436740 | 3:40 |
| db (2/4) | 121087436786 | 3:40 |
| db (3/4) | 121087436749 | 4:40 |
| db (4/4) | 121087436735 | 2:24 |
| domain model | 121087436598 | 0:30 |
| build | 121087436720 | 1:32 |
| e2e (1/2) | 121087708776 | 5:48 |
| e2e (2/2) | 121087708804 | 4:13 |
| images | 121087436757 | 3:27 |
| all green | 121088729822 | 0:02 |

The wall, from the first job's start to the gate's end, was 7:26. `approval-of-record` (three runs), `mutation` and
`screening-capacity` were also green on the head. I read the logs with the GitHub MCP `get_job_logs`, because the proxy
refuses the blob host that `gh api …/logs` redirects to:
- static: "This run checks the commits origin/claude/build-platform..HEAD."; `pnpm audit --prod` "No known
  vulnerabilities found"; gitleaks "13 commits scanned … no leaks found"; check:fixtures 234 files guarded; every
  verify-content set passes; check-releases-immutable "4 released prompt version(s) unchanged"; the engine freeze ran
  against merge base 49514e8 with PR_NUMBER 43 and found no problems; typecheck 21 of 21 warm (the cache was restored
  from the PR's own earlier entry, key …-60e6c36…); licenses:check 189 packages allowed.
- domain model: the summary step printed "No change …" against origin/claude/build-platform, and the job then ran
  `pnpm db:domain-model --check --strict --require-approval`: "matches the schema at 20261106090000_screening_consumer.sql",
  "carries an approval for this text".
- lint: apps/web 560 files, packages 450, `.` 446, 1,456 in all, 0 errors and 0 warnings.
- db shards: "Files this shard ran" listed 30, 30, 29 and 29 files: 118 in total, 118 distinct. That union includes
  `packages/db/src/catalog.db.test.ts`, `packages/db/src/cross-tenant.db.test.ts`, all twelve `route-tests.<k>.db.test.ts`
  and `snapshot.db.test.ts`. It equals the 118 `*.db.test.ts` files under apps, packages and tools at the head (Glob).
  Every union entry is one of those files and both counts are 118.

## Findings

### S1 (should_fix): no test stops a second job from reporting a required check's name

- **Where:** `tools/test/workflows.test.ts:1316-1332`, `tools/required-checks.ts:24-33`
- **Issue:** The new test holds each required check to a job of its own workflow: the right name, every pull request,
  no `if`, no matrix. It does not hold that *no other job in any workflow* reports the same name. A ruleset matches a
  required status check by name and by the app that reported it (here GitHub Actions), not by workflow. Any job named
  `all green`, `mutation`, `gate` or `approval-of-record` in any workflow that runs on `pull_request` therefore reports
  a check the ruleset counts.
- **Why it matters now:** this PR turns `all green` into the one check that stands for every CI gate: the secret scan,
  the audit, the fixture check, the freeze, licences, images, db, e2e and the domain model. Later PRs in this series add
  workflows (`release-dry-run.yml`) and gate jobs (`mutation`'s gate). A same-named job, added by accident or on
  purpose, could report success on a commit whose real `all green` failed. CODEOWNERS review only applies from runbook
  step 5, and before 3i the build merges on green checks alone.
- **Evidence:** the test body reads only `parsed.jobs[check.job]`. No assertion iterates the other workflows'
  `job.name ?? id`.
- **Fix:**
  - Add a case to the required-checks describe. For every workflow in `workflowFiles()`, collect each job's reported
    name (`job.name ?? id`, with matrix names kept as templates). Require each `REQUIRED_CHECK_NAMES` entry to occur
    exactly once, in the workflow and job that `REQUIRED_CHECKS` names.
  - Add one sentence to governance step 4A: a required check is matched by name, so no other workflow may give a job
    one of these names.

### S2 (nit): the Trivy DB cache is a new build-branch cache that the documents do not list

- **Where:** `.github/workflows/ci.yml:442-449, 460-468`; `docs/adr/0066-…md:208-210`; `docs/runbooks/ci.md:137-141`
- **Issue:** Both ci.yml scans use `aquasecurity/trivy-action` at its default `cache: 'true'`. The action's
  `action.yaml:102-105, 144-146` at ed142fd caches `${{ github.workspace }}/.cache/trivy` under key
  `cache-trivy-<date>`, with restore key `cache-trivy-`. supply-chain.yml ran on pull requests only, so these entries
  were PR-scoped. Now the push runs of `images` write them to `claude/build-platform`'s scope, and every pull request
  restores them.
- **Release reach:** the default branch is `main` (`gh api repos/PureTideWater/PhysicalTherapy --jq .default_branch`),
  so tag runs cannot restore them today. Under F1 (a), before ci-deps lands, release.yml's scan (`release.yml:76-82`, the
  same action, default cache) would restore the vulnerability database this PR's push runs saved.
- **What the documents say:** ADR 0066's Consequences and the runbook's cache table list only tsc, the durations and
  the pnpm store, and say "A cache only saves time". For a vulnerability database, the restored copy is the data the
  verdict is made from.
- **Fix (either):**
  - set `cache: false` on ci.yml's two scan steps, which costs one database download a run; or
  - add the Trivy DB row to ci.md's table and to ADR 0066's Consequences, and name it beside release.yml's in ci-deps'
    R1 test.

### S3 (nit): ADR 0066 says the ruleset requires the four checks "from this pull request"

- **Where:** `docs/adr/0066-…md:136`; `docs/runbooks/ci.md:51-52`
- **Issue:** ADR 0066:136 reads "From this pull request, `claude/build-platform`'s ruleset requires …". The same ADR
  (:35) and ADR 0063's amendment (item 1) both say no ruleset exists (`rulesets` returns `[]`). ADR 0066:198-200 and
  governance step 4A have the founder apply it only after the first green push run. Until then nothing enforces the
  four checks. ci.md:51-52 likewise says "the ruleset blocks those" force pushes.
- **Fix:** write "Once the founder applies the ruleset (governance step 4A, after this pull request's first green push
  run), it requires:", and "once the ruleset of step 4A exists, it blocks those".

### S4 (nit): `definedIn` checks the import, not that the file runs the module's tests

- **Where:** `packages/compliance/src/controls.test.ts:83-86`; `packages/compliance/src/controls.ts:88-91`
- **Issue:** With `definedIn`, the evidence rule requires `file` to import `definedIn` and `definedIn` to hold the
  title. A `.db.test.ts` that imports `./define` and never calls `defineRouteTests(k)` would still count as evidence.
  Today `route-tests/partition.test.ts` holds each file to `defineRouteTests(<its index>)`, so nothing is wrong now.
  But the compliance rule leans on a different test for that guarantee.
- **Coverage:** the evidence names `route-tests.0` for every title. Some titles exist only for certain route kinds
  (the "internal %s" case: practice routes only). Nothing proves file 0's slice holds a route of each kind; the twelve
  files together do.
- **Fix:** in `evidenceProblems`, also require `file` to call a function `definedIn` exports, for example a
  `\bdefineRouteTests\(\d+\)` match, generalized to "an exported name of definedIn called". Or note in `controls.ts:88-91`
  that `partition.test.ts` carries the call and the coverage across the twelve files.

### S5 (nit): the engine freeze's own check runs on pull requests only

- **Where:** `.github/workflows/ci.yml:104-109`; `docs/adr/0066-…md:78-79`
- **Issue:** On a push to the build branch, `check.ts` does not run. Only `unit`'s differential test runs, against
  `github.event.before`. This is by design: the exception names a pull request, and `check.ts:879-883` refuses a
  missing PR_NUMBER on CI. It is no regression, because at 49514e8 ci.yml did not run on push at all. But until the
  ruleset exists, a direct push to `claude/build-platform` is never freeze-checked. A non-test engine file that moves
  without changing pricing passes the differential test.
- **Fix (optional, cheap):** on push, take PR_NUMBER from HEAD's subject when it is this repository's merge-commit form
  (`Merge pull request #<n>: …`, as `git log` shows for #39). Otherwise run `check.ts` with an empty exception, so a
  direct push gets no exception. Or record in ci.md that direct pushes are freeze-checked only once step 4A blocks them.

### S6 (nit): the README still names the approval as a test case

- **Where:** `README.md:125`
- **Issue:** "Milestone 1 does not start until the founder approves the document; until then that case fails." The
  approval case is no longer in `test:db`. It is now the `domain model` check, as `README.md:107-111` says.
- **Fix:** "until then the `domain model` check fails".

## What I checked and found sound

1. **Permissions, triggers and tokens.**
   - ci.yml is `contents: read` at the workflow level with no job-level grant. That equals the base's ci.yml and the
     deleted supply-chain.yml's.
   - No workflow uses `pull_request_target`. A YAML scan over every workflow printed each `on:` and each job
     `permissions`. Only release.yml's push and report jobs and screening-capacity's notify job hold more, all
     unchanged.
   - No `secrets.` appears in ci.yml. Every ci.yml checkout now sets `persist-credentials: false` (new, and held by
     `workflows.test.ts:693-703`).
   - No `run:` in ci.yml interpolates `${{ }}`: every event value (base_ref, before, the PR number, the shard,
     `toJSON(needs)`) goes through `env`. The only interpolating `run:` in the repository is
     publish-content.yml's, which is unchanged.
   - `actionlint .github/workflows/*.yml`: exit 0, no output.
2. **Artifacts.**
   - `web-build` (1 day) and `playwright-<k>` (7 days) are uploaded per run with `overwrite: true`. Only `e2e` of the
     same run downloads `web-build`, by name, with no `run-id` and no token.
   - release.yml downloads only its own run's `image-*` artifacts (`release.yml:138-145, 210, 258`).
   - approval-of-record.yml and publish-content.yml download nothing, and no workflow uses `workflow_run`.
   - So no PR artifact can reach a privileged workflow.
   - The standalone build holds no `.env` (`git ls-files | grep .env` is empty), and the e2e values are absent from it
     (ADR 0066's measured diff).
3. **Caches.**
   - A PR's entries (tsc, the durations, the pnpm store, Trivy) are scoped to `refs/pull/<n>/merge` and reach no other
     ref. The build branch's are written only by push runs of merged code.
   - The tsc buildinfo cannot pass a broken commit: tsc re-hashes every input, and the PR's own scope is the only one
     the PR can write.
   - The durations cache only orders files; the paths fix shard membership.
   - With `main` as the default branch, tag runs (release.yml) restore nothing that the build branch saved. S2 covers
     the one F1 (a) caveat.
4. **Pins.**
   - Every ci.yml `uses:` is a 40-hex SHA with its version comment. `git ls-remote` of each tag gave the same SHA for
     all 11: cache/restore and cache/save v4.3.0, checkout v4.4.0, download-artifact v4.3.0, setup-node v4.4.0,
     setup-python v5.6.0, upload-artifact v4.6.2, trivy-action v0.36.0, build-push-action v6.19.2, setup-buildx v3.12.0,
     pnpm/action-setup v4.3.0. All but setup-python are the SHAs release.yml and screening-capacity.yml run.
   - upload-artifact's `action.yml` at ea165f8 declares `overwrite` and `compression-level`.
5. **The moved and kept gates, on every PR and every push, all under `all green`.**
   - `static` runs: audit, the secret scan (pinned gitleaks with SHA-256 check, `--diff-merges=remerge`),
     check:fixtures, verify-content, releases-immutable, the freeze (PRs; see S5), synth and its clean diff, typecheck,
     lint:logs, golden, oracle and licenses:check.
   - `images` builds both Dockerfiles and runs Trivy HIGH,CRITICAL with `ignore-unfixed` and `exit-code: "1"`.
     `isScan` requires `exit-code '1'` (`workflows.test.ts:174`), which is stronger than the base's matrix test.
   - Ranges: a PR uses `origin/$BASE_REF`; a push uses `github.event.before`, with `HEAD^1` for the zero SHA, and a base
     missing from the clone fails the step (`ci.yml:54-74`, proved on a temporary repository by
     `workflows.test.ts:828-852`).
   - `tools/check-releases-immutable.sh` accepts a commit as its base (`:25-28`).
   - The gate runs `if: always()` and passes only on `length > 0 and all(.result == "success")`. `ci-gate.test.ts`
     runs the step's own text under bash for each case: success, failure, skipped, cancelled, two failures and empty.
6. **CO-02.**
   - The removed approval case (`domain-model.db.test.ts`, base :61-64) called
     `documentApprovalProblems(committed, sha256, { approvers: readApprovers() })`. The CLI's `--require-approval`
     (`packages/db/src/cli/domain-model.ts:179-189`) makes the same call on the same inputs and exits 1 on any problem,
     printing the hash to sign.
   - The drift case stays in the db shards. CI ran the command by name.
   - approval-of-record.yml, `tools/approval-of-record/**`, CODEOWNERS and `.claude/**` are unchanged
     (`git diff --stat 49514e8 HEAD --` on each was empty, apart from `tools/hooks/pre-push.test.ts`'s new CI-only case,
     which only adds a failure). CODEOWNERS already names `packages/db/src/cli/domain-model.ts`,
     `packages/db/src/domain-model/` and `/.github/`.
7. **Compliance.**
   - Every `file` rule is kept: it exists, ends in `.db.test.ts`, is not a db file for `unit_test`, and is under
     infra/test for `cdk_assertion`. `definedIn` only adds rules (S4).
   - The CI-step rule is stronger (`namesWhole`), and `pnpm lint` cannot match inside `pnpm lint:logs`.
   - Dropping `pnpm lint` from logging_discipline is right: `eslint.config.js` holds no logging rule (Grep for
     `log|console|PHI`, case-insensitive: no match).
   - SUPPLY's licence and Trivy evidence now names ci.yml, where both strings occur as whole commands.
8. **ESLint coverage**, which carries SEC-09 (the model SDKs only in packages/model-gateway) and the money syntax
   rules. `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/rss-scripts/lint-files.mjs`
   ran ESLint 10.12.0's Node API with every rule filtered out and type information off, under the shared lock. It gave
   `.` 1,456 files, and the three groups 560 + 450 + 446 = 1,456 distinct, with none missing and none extra.
   `git ls-files` holds no nested `packages/` or `apps/web/` directory that the complement's ignore patterns could
   catch elsewhere.
9. **Tenant isolation (rule 4).**
   - `define.ts`'s cross-tenant, MFA, CSRF, persona and internal-role cases have the same bodies as the base file's
     (base `route-tests.db.test.ts:609-813` against `define.ts:54-258`, read side by side).
   - The worlds still run requests through the app role's pool (`world.ts:249`) and read snapshots on the owner
     connection.
   - The fold (`world.ts:138-144`) computes the same md5 over the same `tenantTables()` rows and the same four people
     tables, in one statement. `snapshot.db.test.ts` holds it to the per-table form on two worlds and after an update,
     on every run (it was in a shard's list).
   - The page-read memo (`contract-world.ts:32-53`) replaces only the seeding's PDF text extraction, keyed by the bytes'
     SHA-256. It sits on no request path under test: the routes read through `services`' document store. A frozen
     result shared across practices' worlds is the same synthetic text either way. It cannot mask a cross-practice
     read, because no RLS or storage check sits beneath it.
   - The catalog and cross-tenant files run in every PR's shards (the union above).
10. **No PHI, no real file, no model identifier.**
    - Pinned gitleaks 8.24.3 (`tools/gitleaks/install.sh`), with
      `--log-opts "--no-color --no-ext-diff --no-textconv --diff-merges=remerge 49514e8..9144b56"`: "13 commits scanned
      … no leaks found". 13 is every non-merge commit of the 16 (`git rev-list --count --no-merges`).
    - `git diff 49514e8 HEAD` added lines grepped for opus, sonnet, haiku, `claude-<x>`, `anthropic.` and `us.anthropic`:
      none.
    - The commit bodies hold only the two attribution trailers (16 of 16).
    - The new fixtures are synthetic `none(0, …)` cases (CI-01 to CI-10) and assertedBy path edits.
    - The only non-text files changed are two Dockerfile comment lines.
11. **Documents.**
    - ADR 0010's amendment, ADR 0063's amendment, the governance runbook (4A and step 8), the change-management policy,
      the PR template, ci.md and README all name the four checks, the `domain model` job and the ranges as ci.yml has
      them. S3 and S6 are the exceptions.
    - The stale-name grep (`git grep -nE 'ci / check|\`check\` \(the|five (green )?checks|images \(web\)|images \(worker\)|supply-chain\.yml'`,
      run with Grep) found history or test lines only: ADR 0010:17, 71; ADR 0063:486; ADR 0066:32, 181, 190;
      required-checks.test.ts:72; workflows.test.ts:1107.

Observations, not findings against this PR:
- approval-of-record.yml and the `domain model` job both run the pull request's own copy of their decision code. That
  is the base's design, and CODEOWNERS covers both paths.
- large-zip.yml, which this PR touches only for the Chromium step, still checks out with persisted credentials on
  tag-pinned actions. ci-deps owns that file.

## Checks run

| Command | Result |
| --- | --- |
| `git clone -q https://github.com/PureTideWater/PhysicalTherapy …/review-security-supply && git checkout -q 9144b56…` | ok; HEAD 9144b56, origin/claude/build-platform 49514e8 |
| `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline` | exit 0 |
| `gh api repos/PureTideWater/PhysicalTherapy --jq '{default_branch,private,visibility}'` | main, false, public |
| `gh api "repos/…/actions/runs?head_sha=9144b56…"` and `…/runs/40166129200/jobs` | ci, mutation, screening-capacity and approval-of-record success; 13 ci jobs success |
| GitHub MCP `get_job_logs` for static, domain model, lint, db 1/4 to 4/4 | as quoted above; shard lists 30+30+29+29 = 118 distinct |
| `actionlint .github/workflows/*.yml` | exit 0, no output |
| Python YAML scan of every workflow for `${{` in `run:`, job `permissions`, triggers | only publish-content.yml (unchanged) interpolates; no new grant |
| `git ls-remote https://github.com/<owner>/<repo> refs/tags/<v>` for each ci.yml pin | 11 of 11 MATCH |
| `curl` of upload-artifact@ea165f8 `action.yml`, trivy-action@ed142fd `action.yaml` | `overwrite` declared; trivy `cache` default 'true', key `cache-trivy-<date>` |
| `tools/gitleaks/install.sh`, then gitleaks 8.24.3 over 49514e8..9144b56 | 13 commits scanned, no leaks, exit 0 |
| `git diff 49514e8 HEAD` grep for model identifiers; `git log --format=%B` grep | none beyond the two trailers |
| `flock … node rss-scripts/lint-files.mjs <clone>` | `.` 1,456 = 560 + 450 + 446, 0 missing, 0 extra |
| Glob `{apps,packages,tools,infra}/**/*.db.test.ts` against the CI shard union | 118 and 118 |
| `flock … pnpm -s vitest list --project db --filesOnly` | not completed: killed by its 600 s `timeout` while it waited for the shared lock; the Glob count above stands in |
| `git diff 49514e8 HEAD --` the workflows, Dockerfiles, compliance, domain-model test, contract-world, freeze and differential tests, pre-push test, codeowners test, vitest config, playwright config, the docs named above | read in full |

The clone was removed at the end (`rm -rf …/ci-speed/review-security-supply`), with this review's scratch logs. The
lint enumeration script is kept, under `rss-scripts/`.
