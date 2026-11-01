# PR #86 (ci-images-digest): security and supply-chain review of the WIP head

- **Head reviewed:** b2a41a00 (`co-001/wip-ci-images-digest`). That is the PR branch 83167b8f, plus the merge of
  bce57f16 (#82), the fix to the table's citations, and the N29 to N32 renumber.
- **Base:** `claude/build-platform` bce57f16.
- **Clone:** my own fresh clone, `/home/user/review-imgdigest-security-supply`. It is removed after this review.
- **Checklist:** `.claude/agents/security-reviewer.md`. This PR has no migration, so the functions part of the checklist
  does not apply.
- **Date:** 2026-11-01, 17:48 to about 18:30 UTC.
- **Access:** read only. Nothing was pushed, commented, reviewed or approved.

**What I read.**
- The status file, its RESUME-BLOCK first.
- The whole design, including §2.3–2.5, §6, §9–§12 and its Review section.
- The merge report.
- `git diff bce57f16...b2a41a00` and `git diff bce57f16 b2a41a00`. The two are identical: 9 files, +738/−18.
- Every workflow at the head.
- The pinned sources, through blobless clones:
  - buildx v0.38.1: `util/ghutil/ghutil.go`, `util/confutil/metadata.go` and `driver/docker-container/factory.go`;
  - build-push-action v7.4.0: `src/main.ts`;
  - the `action.yml` of each pinned third-party action;
  - actions/languageservices: `workflow-v1.0.json` and `template-reader.ts`;
  - actions/runner: `TemplateUnraveler.cs`.
- R2's CI evidence, through the GitHub MCP read tools.

**Commands.** Every heavy command ran under `flock /tmp/laneb-heavy.lock`:
- `pnpm install --frozen-lockfile`, exit 0;
- vitest runs on the head;
- vitest runs on `CI_TREE` copies of the head with a single change each, described below.

**Verdict.**
- No blocker. The fix is correct, and so is the merge.
- Disabling the metadata provenance weakens nothing in the supply chain.
- There are three should-fix findings and three nits:
  - S1, the value rule never reads mapping keys, is a real bypass of the rule this PR adds. CI stays green on it.
  - S2: the table can go stale without CI noticing.
  - S3 answers P2. The part of P2 that sits inside this PR's own env maps is the safer change to make now.

---

## Findings

### S1 (should fix). The value rule reads values, never mapping keys, so an expression in an `env:`, `with:` or `outputs:` key puts the description into a process with CI green

- **Where.** `tools/test/workflows.test.ts:3144-3145`, inside `unboundedValueProblems` (`visit`, from `:3128`):
  `for (const [key, item] of Object.entries(value)) visit(item, …)`. The key is never scanned. T4's "every place" list
  (`:3223`) tests values only.
- **Failing input.** Any step written like this:
  ```yaml
  env: { "${{ github.event.pull_request.body }}": "1" }
  ```
  - GitHub evaluates expressions in mapping keys wherever the mapping takes a context.
    - actions/languageservices `workflow-parser/src/templates/template-reader.ts:177-192` accepts an expression key
      when `definition.allowedContext.length > 0`. That holds for `step-env`, `step-with`, `job-env`, `container-env`
      and `job-outputs` (`workflow-v1.0.json`).
    - actions/runner `src/Sdk/DTObjectTemplating/ObjectTemplating/TemplateUnraveler.cs:328-339` and `:529-570`
      (`MappingKeyBasicExpression`, "The expression should evaluate to a string") evaluates the key to the variable's
      name.
  - So the environment string is `<description>=1` plus its NUL. On a description of about 131 KB, #86's own being
    125,892 characters, that is #42's E2BIG again.
  - A `with:` key behaves the same way and becomes an `INPUT_<key>` variable of the action.
  - A job `outputs:` key reaches `toJSON(needs.build.outputs)` (release.yml's `BUILD`), whose T6 row assumes a fixed
    set of keys.
- **Evidence.**
  - **A probe.** I ran `unboundedValueProblems` through a scratch copy of the test file in my clone, now deleted and
    never committed. It returns `problems: []` and `values: []` for each of these:
    - a step env key `${{ github.event.pull_request.body }}`;
    - a step `with:` key `${{ toJSON(github.event) }}`;
    - a job env key `${{ github.event.head_commit.message }}`;
    - a job outputs key `${{ github.event.pull_request.title }}`.

    It does refuse `"${{ insert }}": "${{ github.event.pull_request }}"`, through the value.
  - **End to end.** I made `CI_TREE=/tmp/rss-key`, b2a41a00 with one added line, ci.yml:683
    `env: { "${{ github.event.pull_request.body }}": "1" }`, on the images job's "The images' directory" step:
    - `actionlint 1.7.7 -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown'` exited 0 with no output;
    - `pnpm exec vitest run --project unit tools/test/workflows.test.ts` reported **120 passed, 1 skipped, exit 0**.
  - **Scope.** No workflow at this head has an expression in any key
    (`grep -nE '^\s*"?\$\{\{[^}]*\}\}"?\s*:' .github/workflows/*.yml` is empty), so this is latent.
- **Why it matters here.**
  - ADR 0066:993 and C5 say the rule reads "every expression that reaches a step's environment, an input or a script",
    and that "the runner's own lexing rules leave no spelling outside it". That claim is false while keys go unread.
  - The whole point of the rule is that the next form fails CI, not a run on the build branch.
- **Fix.** In this PR, in `tools/test/workflows.test.ts`:
  - In `visit`'s record branch, refuse any key containing `${{`. Report it as
    `${file} ${where}: an expression in a key, ${key}`. No workflow uses one, so a closed "never" is the simplest
    rule and the safest.
  - Add T4 fixtures for:
    - a workflow env key;
    - a job env key;
    - a job outputs key;
    - a container env key;
    - a services env key;
    - a step env key;
    - a step `with:` key;
    - a job `with:` and a job `secrets:` key.
  - Add "or a key" to ADR 0066's N32 "What holds it" sentence and to ci.md's "Changing CI" bullet (`ci.md:427-432`).

### S2 (should fix). T6 holds value names, not bounds: a citation drift or a changed producer leaves it green

- **Where.**
  - `tools/test/workflows.test.ts:3357-3358` checks each row's `bound` only against
    `/[\w-]+\.(?:ya?ml|ts|mjs|sh):\d+/`.
  - The comparison at `:3353-3356` is of `{file, job, value}` names alone.
- **At this head, every citation is correct.** I printed every cited range against b2a41a00 and each one names its
  producer:
  - `ci.yml`: 56-75, 150, 213, 216-224, 233, 328-336, 374, 527-535, 688-699, 712-724 and 791;
  - `content-calendar.yml`: 60 and 78;
  - `large-zip.yml`: 37-45;
  - `mutation.yml`: 44-47 and 77;
  - `publish-content.yml`: 48;
  - `release-capacity.yml`: 141;
  - `release-dry-run.yml`: 70-76, 97-110, 100, 102-105 and 164-192;
  - `release.yml`: 55-67, 86-99, 89, 91-94, 169-197 and 446-450;
  - `screening-capacity.yml`: 88-130, 238-246, 254, 286 and 349-352;
  - the tool citations: `render.ts:17-18` and `:127-135`, `release-capacity/run.ts:535-536`,
    `screening-capacity/run.ts:1036-1039`, `report.ts:866-867`, `affected.ts:776` and `publish-content.sh:15-19` and
    `:49`.
- **Failing scenario 1, drift.** `CI_TREE=/tmp/rss-drift` is b2a41a00 with five comment lines inserted at ci.yml:21.
  - T6 (`-t 'hands a step another step'`) gives **1 passed**.
  - Every ci.yml citation now points five lines early. For example, "ci.yml:688-699" no longer starts at "Build the web
    image", which is now at :693.
  - Any PR that edits a workflow above a cited line does this. It passes silently, which is the worse case.
- **Failing scenario 2, a changed producer.** In `/tmp/rss-key` I changed ci.yml:75 to
  `echo "base=$(git log -1 --format=%B)" >> "$GITHUB_OUTPUT"`, so `steps.range.outputs.base` became a whole commit
  message, an unbounded value.
  - The describe "one environment string" stayed **4 passed** (T3, T4, T5 and T6).
  - The one test that failed in the whole file was the static job's own script test ("checks a pull request's
    commits …"). That test is specific to that producer and is not T6.
  - Most rows have no such test. This is the defect class's own history: an existing output, buildx's `metadata`,
    grew when its producer changed (buildx 7652057da), and the row's name never changed.
- **Fix.**
  - Take the merge report's P6 in this PR's fix round: compute each citation from the workflow's YAML by job and step
    id. The file:line comes from the parsed document, so it cannot drift, and the test fails when a producer is
    removed.
  - Add to each row an 8-hex-digit fingerprint (SHA-256) of its in-repo producer's text: the step's `run`, or the
    cited lines of a tool. T6 recomputes it, so a producer change turns T6 red until a reviewer re-confirms the bound.
  - For third-party producers (the cache keys, `steps.attest.outputs.bundle-path`), the row carries the action's pin.
    A Dependabot pin bump then re-opens the row.

### S3 (should fix, in part; the rest stays P2). The build record still carries the whole event, readable by any signed-in GitHub account for 90 days. A retention cut fits inside this PR's own env maps

**What it carries.** BuildKit's provenance of each build record is fed by `provenance.d/github_actions_context.json`,
which buildx's docker-container driver writes by default (`driver/docker-container/factory.go:53`,
`writeProvenanceGHA: true`). The content comes from `util/ghutil/ghutil.go:11-160` at v0.38.1:
- `github_event_name`.
- `github_event_payload`, which is **the whole `GITHUB_EVENT_PATH` file**:
  - for `pull_request`: the title, the description, the head and base refs and SHAs, the labels, the author's and
    sender's logins, and the repository object;
  - for `push` and a tag push: `commits[]` with every message and each author's and committer's name and e-mail,
    `head_commit`, and the pusher's name and e-mail.
- The actor's login and id, and the triggering actor.
- The ref, the ref name, whether it is protected, and the ref type.
- The repository, its owner and their ids.
- The job, the run's id, attempt and number, the server URL, the workflow, and the workflow's ref and SHA.
- The runner's image OS and version, OS, architecture, environment, tracking id and name.

It holds **no token and no secret**: ghutil reads no `*_TOKEN`, and the builds pass no `secrets:`. The record also holds
BuildKit's own provenance:
- the Dockerfile;
- the build args, of which release.yml has only `STATIC_ASSET_ORIGIN`, a repository variable;
- the materials;
- the build log.

PHI-shaped content appears only if a person pastes it into a description, a title or a commit message, which CLAUDE.md
forbids. The record keeps that copy after the description is edited or its revision deleted.

**Who can read it, and for how long.**
- **The repository is public.** The workflows say so ("once the repository is private", screening-capacity.yml:138-142,
  release-capacity.yml:30-32). R2 shows it too: its e2e ran two shards (artifacts `playwright-1` and `playwright-2`),
  which is the public branch of `fromJSON(github.event.repository.private && '[1,2,3]' || '[1,2]')` (ci.yml:506).
- So any signed-in GitHub account can download these artifacts, fork pull requests' runs included.
- **R2's ci run 40653896254** (`actions_list list_workflow_run_artifacts`) uploaded two build records,
  `…~2HVOO3.dockerbuild` (71,805 bytes) and `…~L8KWXD.dockerbuild` (66,580 bytes). **Both expire 2027-01-26T08:01:41Z,
  90 days after the run.** The same run's `playwright-1` and `playwright-2` expire 2026-11-04, after 7 days.
  - ci.yml's own artifacts are kept for 1 day or 7 (`ci.yml:490`, `:587`).
  - The capacity job (122700247351, log lines 1878-1911) and each release-dry-run build upload one record per build.
- **Not read here.** I could not read the record's content: `download_workflow_run_artifact` gave a URL, and the proxy
  refused it (`curl: (56) CONNECT tunnel failed, response 403`). The content above is from source, not from the file.
- **Not verified here:** whether GitHub's secret scanning reads workflow artifacts. I know of no documentation that says
  it does.

**What this PR changes.** It removes the four log copies per run: both builds' Metadata groups and both identity steps'
env display. The R2 numbers are below. The 90-day artifact copy is unchanged, and ADR 0066:990-992 says only that the
record "keeps BuildKit's copy", with no retention and no readership.

**In scope or a proposal.** Both, split:
- **In scope (S).** The retention cut. build-push-action v7.4.0 honours `DOCKER_BUILD_RECORD_RETENTION_DAYS`
  (`src/main.ts:197-213`, `:281-290`; an empty value means the repository's default), so the cut is one key in the
  seven `env:` maps this PR adds:
  - ci.yml:691 and :716;
  - screening-capacity.yml:179 and :193;
  - release-dry-run.yml:116;
  - release.yml:107;
  - release-capacity.yml:67.
- **Proposal, P2 kept for the founder.** Turning the upload off (`DOCKER_BUILD_RECORD_UPLOAD: false`), or
  `provenance-add-gha=false` on the builder. Both remove a debugging aid, or change the `driver-opts` that #82's image
  rule and the test holding them to exactly `image=…@sha256:…` (design C4, which cites it at 165c5993's
  `workflows.test.ts:2805-2807`) hold.

**Fix (in this PR).**
- **The key.** Add `DOCKER_BUILD_RECORD_RETENTION_DAYS: ${{ github.event_name == 'pull_request' && '7' || '' }}` to
  all seven build steps' `env`.
- **What it does on each event:**
  - **Pull request** (fork pull requests included): 7 days, ci.yml's longest artifact retention.
  - **Tag push (release.yml):** release.yml's record stays at the repository's default. It is the only full BuildKit
    provenance of a released image, since the images build with `provenance: false`.
  - **Other pushes:** the same default; the event they carry is already public in the commits.
- **Why this form:**
  - release.yml and release-dry-run.yml stay equal, as `workflows.test.ts:2460` requires.
  - T3 admits the value: `event_name` and literals.
  - T5 can assert both keys on every step.
- **Documents:**
  - **ADR 0066 N32's "The builds" bullet:** add one sentence. The record holds the whole event, any signed-in account
    can read it in this public repository, and pull-request records are kept 7 days.
  - **ci.md:** the same in a few words.
- **Proposal, outside this PR's files.** `docs/runbooks/incident-response.md` has no step for content pasted into a
  description, title, review or commit message. Add a "scrub" list:
  - the description's revision;
  - each run's logs (`DELETE /repos/{owner}/{repo}/actions/runs/{run_id}/logs`), since earlier runs printed the event 4
    times;
  - every `.dockerbuild` artifact since (`DELETE /repos/{owner}/{repo}/actions/artifacts/{artifact_id}`);
  - rotation of any secret.

### N1 (nit). Bounds are per expression: several admitted values in one string are not summed

- **Where.** `expressionProblems` and `visit` (`workflows.test.ts:3128-3141`) admit each `${{ }}` of a string on its
  own.
- **Input.** `env: { V: "${{ vars.A }}${{ vars.B }}${{ vars.C }}" }` is admitted. That is 3 × 48 KB = 147,456 bytes,
  over 131,072. The scratch probe returned `problems: []`. Secrets and the "at most 48 KB" rows (`steps.image.outputs.origin`)
  work the same way. Nothing concatenates two such values today.
- **Fix.** Count the values bounded at 48 KB or more (`vars`, `secrets` and the 48 KB rows) per string, and refuse
  more than two. Add one T4 fixture.

### N2 (nit). The `$GITHUB_ENV` rule closes the name, not the value

- **Where.** `GITHUB_ENV_WRITE` (`workflows.test.ts:3013`) admits `echo "ENGINE_FREEZE_BASE=<anything without a quote>"`.
- **Input.** `echo "ENGINE_FREEZE_BASE=$(git log -1 --format=%B)" >> "$GITHUB_ENV"` passes. So does a value carrying a
  newline at run time, which writes a second variable (the classic `$GITHUB_ENV` injection).
- **Today it is safe.** The one write (ci.yml:289) writes `$base` only after `git rev-parse --verify --quiet
  "$base^{commit}"` (ci.yml:285).
- **Fix.** Name the admitted value form with the name, `ENGINE_FREEZE_BASE=$base`, and assert that the same script
  verifies `$base` as a commit. Alternatively, accept the value as written and record its bound in a comment beside
  `GITHUB_ENV_NAMES`.

### N3 (nit). `name:` and `run-name:` are not read, so event text there would print in the log

- **Where.** `unboundedValueProblems` reads no `name` key, by design ("`if:` and `name:` reach none", `workflows.test.ts:3114`).
- **Input.** A step `name: ${{ github.event.pull_request.title }}`, or a body, prints in the job log's step header and
  in the UI. That undoes N32's "the event stops being printed". The scratch probe returned `problems: []`.
- **Today.** No step, job or run name uses event text. The names in use are `matrix.*`, `strategy.job-total` and
  `github.ref_name`, at ci.yml:298 and :498, and mutation.yml:69.
- **Fix.** Apply the same admission rule to `name` (job and step) and to `run-name`. Optionally, only refuse
  `github.event.*` beyond the closed list there.

---

## The four common points

1. **N32 renumber: complete and correct, and nothing of #82's is renumbered.**
   - **N32 appears at:**
     - the workflows: ci.yml:667 and :687, release-capacity.yml:64, release-dry-run.yml:113, release.yml:104 and
       screening-capacity.yml:174;
     - ADR 0066: :31 (the Date line), :45 (Deciders) and :981 (the notice);
     - reconciliation-001.md:663;
     - ci.md:152 and :432;
     - workflows.test.ts: :1927, :2842, :2844 (the describe title) and :3265.
   - **"N29" left in the tree:** only ADR :983 (on purpose: this branch's old number) and :984 ("took N29 to N31", #82's
     range), and #82's own notice at :1642.
   - **#82's notices** N23 to N31 sit at ADR :1630-1647, unchanged.
   - **No removed line touches N29 or N32.** The base lines this diff removes are the two `METADATA` env lines and
     their two jq lines, the Date line, one screening-capacity comment line, the `MAX_OPENED_PER_RUN` import, the
     inline stand-in docker, and the three old pins.
2. **T6's citations.** All of them are correct at b2a41a00 (S2 lists them). They drift with any edit above them, and a
   drift passes silently (demonstrated in S2). They cannot admit a new value: the set comparison still fails on a new
   name.
3. **P2, the build-record artifact:** S3 gives what it carries, who can read it, its retention, and which part is in
   scope.
4. **R2's images log (job 122700187970), re-read per design §6.4. This confirms the status file's item.**
   - The log is complete: `original_length` is 3,037, the same as the lines returned, and 284,348 bytes.
   - There are two `Metadata` groups:
     - **web**, at log line 983: **780 bytes**;
     - **worker**, at log line 2555: **783 bytes**.

     Each is measured with the timestamps, the `::stop-commands::` line and the masked line removed. Both have exactly
     the keys `buildx.build.ref`, `containerimage.config.digest`, `containerimage.descriptor`, `containerimage.digest`
     and `image.name`.
   - Each of these counts **0** in the whole log:
     - `buildx.build.provenance`;
     - `github_event_payload`;
     - `synthetic length-test row`;
     - `Row | Characters so far`;
     - `Argument list too long`;
     - `resolving provenance for metadata file`.
   - **The BUILT values.** The step headers' env display holds only `BUILT`:
     - **web:** `sha256:326bb524…10ae` (log line 2914), matching the web Metadata's config digest; the step printed
       `web: config sha256:326bb524…10ae`;
     - **worker:** `sha256:bca9c01c…862e` (log line 2940); it loaded as `sha256:22cdc331…` on the containerd store.
   - `BUILDX_METADATA_PROVENANCE: disabled` shows in both builds' env (log lines 468 and 1499).
   - **The other R2 jobs:**
     - **The capacity job (122700247351):** complete at 1,948 of 1,948 lines. Its `Metadata` groups are 784 and 787
       bytes, with the same five keys. Every count above is 0.
     - **release-dry-run `build (worker)` (122700187835):** complete at 2,116 of 2,116 lines. Its `Metadata` group is
       815 bytes. The counts are 0.
     - **Conclusions:** the gate (122706928679), mutation (40653896273), approval-of-record (40653896226) and every
       release-dry-run job concluded success.

---

## Checked and found sound

- **The fix itself.**
  - `BUILT: "${{ fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest'] }}"` and
    `built="$BUILT"` (ci.yml:746-748, :758-760) leave only a digest in the environment.
  - Metadata that is not JSON fails the step, closed. An empty output reaches the step's own `::error`.
  - `::error` interpolates only buildx's digest and image-id.ts's reading.
  - The PR's tests pass at the head: `-t 'one environment string|starts and passes both identity steps|proves on
    every pull request'` gave **6 passed**.
- **Where untrusted event content can go at this head.**
  - **Triggers:** no workflow uses `pull_request_target`, `workflow_run`, `issue_comment` or `issues`. Fork pull
    requests get the read-only token and no secrets. The images job's token is `Contents: read, Metadata: read` (log
    lines 22-25).
  - **Interpolation into a script:** the only `${{ }}` inside a `run:` is publish-content.yml:55 (P1, frozen). It runs
    on push only, and its values are numeric release names that `tools/publish-content.sh:18` checks against
    `^[1-9][0-9]*$`.
  - **Through env:** every `github.*`, `vars.*` and `inputs.*` reaches a process through `env:`. Examples:
    - ci.yml:60-62, :131, :274-276 and :445;
    - mutation.yml:63;
    - screening-capacity.yml:91-93.
  - **Unbounded event fields:** no workflow names `github.head_ref`, a title, a body, a commit message, labels or
    `toJSON(github…)`. approval-of-record.ts reads only the event's `pull_request.number` and `head.sha`.
  - **`$GITHUB_ENV`:** one write, ci.yml:289, verified first. No tool writes `GITHUB_ENV` or `GITHUB_PATH`
    (`git grep`).
  - **Checkouts:** every checkout sets `persist-credentials: false` except publish-content.yml's. That one runs on push
    only and needs the credentials to push.
  - **Build context:** `.dockerignore` excludes `.git`, so no token reaches the build context either.
- **The schema routes T3 does not read.**
  - The workflow-level `defaults.run` (`workflow-defaults-run`) and a step's `shell` (`shell`) take no context in
    `workflow-v1.0.json`, so an expression there is not evaluated.
  - T3 reads a job's `defaults.run` (`job-defaults-run`, which takes a context), a step's `working-directory`, the
    container, the services, and a job's `with:` and `secrets:`.
  - The keys newly in the schema take no context into a process: step `background` is a boolean, job `snapshot`, and
    the `wait` and `cancel` steps.
- **Third-party composite actions** (trivy-action ed142fd0, setup-trivy 3fb12ec1, attest-build-provenance 4d101475)
  route no `github.event` and no `toJSON` into an env. pnpm/action-setup, setup-buildx-action and login-action are
  `node24` actions.
- **Supply chain: disabling metadata provenance weakens nothing.**
  - **How buildx reads the value.** buildx v0.38.1 parses `disabled` exactly; `false` and `0` also disable it, and any
    other value means `min` (`util/confutil/metadata.go:28-41`). T5 requires the exact word.
  - **Nothing reads the provenance:**
    - release.yml's build step (`:105-121`) has no `id`, so nothing reads its `metadata`;
    - it builds with `provenance: false` and `sbom: false`;
    - the release's attestation is `actions/attest-build-provenance` on the capacity report (release.yml:446-450);
    - its bill of materials is Trivy's;
    - no runbook, ADR or tool reads `buildx.build.provenance` or a `Metadata` group (`git grep`). "The digest the build
      recorded" in release.yml:268, :376 and :415 is the identity step's.
  - **What still works.**
    - `buildx.build.ref` stays, so the record export and the summary still work (R2 log lines 2960-3005).
    - The full provenance stays in the build record.
- **Secrets and tokens near the changed steps.** The new env holds only `BUILDX_METADATA_PROVENANCE`.
  - build-push-action's `github-token` is the default `github.token`, masked in the log.
  - The runtime token's cache scope is `refs/pull/86/merge` read/write and the base read (log lines 470-473). The
    images job writes no cache.
- **The merge.** Every line either side removed is accounted for (point 1), and the merge keeps #82's `GITHUB_TOKEN:
  "${{ github.token }}"` on the Action pins step. T3 admits that value; it is not a new route.
- **PHI and hygiene.**
  - The new test data is synthetic: the "synthetic length-test row, no data" ruler, `Synthetic length test` and
    `tp-synthetic`.
  - No log line, job payload or error in the diff carries PHI.
  - No model name appears in the diff: a case-insensitive grep of the added lines for model and vendor names is empty.

## Proposals (outside this PR's files)

- **P2, kept with the founder:** turn the build-record upload off, or set `provenance-add-gha=false` on the builder.
  S3's retention cut is the part this PR can take now.
- **incident-response.md:** the scrub list for content pasted into a description, title, review or commit message
  (S3).
