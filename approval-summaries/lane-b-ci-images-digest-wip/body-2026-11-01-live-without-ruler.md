## What changes

An item Lane A's orchestrator handed Lane B on 2026-10-28 at 05:45 UTC: `images` refuses a pull request whose
description is long. Nothing a person using the product sees changes. What the build sees: `images` passes on a pull
request whatever the length of its description, and a test holds every workflow to the rule that keeps it so. The
design is `designs/lane-b-ci/ci-images-digest.md` on `claude/build-ops` (39b8a7ab, SHA-256 `3088a50f…a332`), with its
adversarial review folded in: 16 items, 14 fixed as recommended, 1 fixed in part, 1 moved with the content calendar,
none rejected.

**The identity steps (`ci.yml`, `9ec30e1d`).** Each of the `images` job's two identity steps takes only the config
digest it compares, never buildx's whole metadata output:
- web, `ci.yml:741`: `env: { BUILT: "${{ fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest'] }}" }`;
- worker, `ci.yml:753`: the same over `steps.worker.outputs.metadata`;
- each script's first line is `built="$BUILT"` (`:743`, `:755`), in place of `jq` over `$METADATA`. Everything after
  it is unchanged, so an empty output or a missing key still reaches the step's own `-z` branch, "buildx built nothing
  it reported", and another digest still names both.
- `|| '{}'` is there because the runner evaluates a step's `env` before its `if:` (actions/runner v2.338.2
  `StepsRunner.cs:114-138`, then `:203-237`) and `fromJSON('')` is an evaluation error (`FromJson.cs:16-21`). Without
  it, an identity step whose build failed or was cancelled would fail with a JSON error instead of skipping.
- The job's header comment says why (`ci.yml:661-663`).

**Every build (`96cf5ccc`).** Each of the seven `docker/build-push-action` steps sets
`env: { BUILDX_METADATA_PROVENANCE: disabled }`: `ci.yml:686` and `:711`, `release.yml:106`, `release-dry-run.yml:115`,
`release-capacity.yml:66`, `screening-capacity.yml:178` and `:192`. buildx then writes no `buildx.build.provenance`
key, so no metadata output carries the event, and no build's `Metadata` log group prints the description. Each file's
comment over its build says so.

**The tests (`tools/test/workflows.test.ts`; `eeac99e2`, `c9a23640`, `620ca983`).**
- **T1, the pins** (`:1813`, `:1814`, `:1822`, `:1823`), in "proves on every pull request, on ubuntu-26.04's image
  store, the release's identity rules…": both `env` lines and both `built="$BUILT"` lines, byte for byte the lines
  #42 ports.
- **T2** (`:1891`), "starts and passes both identity steps when buildx's metadata is 132,377 bytes, and names a missing
  or other digest (run 40630123457)". It runs each identity step's script as the runner starts it (`bash --noprofile
  --norc -e -o pipefail`, a file), with the env the runner would evaluate from a synthetic metadata of 132,377 bytes
  laid out as buildx writes it, against synthetic archives (`tools/screening-capacity/test-support/image-archive.ts`)
  and a stand-in docker on each image store. It asserts that bash started before it reads any output, and that the
  whole environment stays under 131,072 bytes; then the pass, an empty output, a missing key and another digest.
- **A new describe** (`:2790`), "one environment string under Linux's 131,072 bytes (docs/adr/0066, Part 3, N29)":
  - **T3** (`:3110`) reads every `${{ … }}` that reaches a process in every workflow (the workflow's `env`; each job's
    `env`, `outputs`, `strategy`, `container`, `services`, `with`, `secrets` and `defaults`; each step's `env`, `with`,
    `run` and `working-directory`) as the runner reads it: whitespace skipped before every token, a name before `(` a
    function, names and keys without case, `x['k']` as `x.k`. It admits only a closed list: literals and operators,
    one level of `runner`, `strategy`, `matrix`, `job`, `env`, `vars` and `secrets`, inputs whose declared type bounds
    them, fifteen bounded `github` paths, results, outcomes and conclusions, step outputs and cross-job values (each
    for T6), the pinned digest form, and functions of literals. A `$GITHUB_ENV` write must name a variable from a closed
    list (`ENGINE_FREEZE_BASE` alone). Every problem names its file, job, step and key. The expected result is `[]`.
  - **T4** (`:3114`) proves the rule bites: 25 forms refused (a whole metadata in any case or by wildcard, `toJSON` of
    `github`, `github.event` or `steps` however spelled, the description or title by any path, a computed index, another
    metadata key, the hand-over's unguarded `fromJSON`, a `string` input, `toJSON(needs.build)`), the whole metadata
    refused in each of the twelve places a value reaches a process, two `$GITHUB_ENV` writes refused, and the accepted
    forms accepted.
  - **T6** (`:3299`) lists every step output and every value one job hands another, 67 in all, each with its bound and
    its producer's file and line (`BOUNDED_VALUES`, `:3213`). A new one fails until a reviewed row names its bound. One
    row is over the limit and says so: the content calendar's `FINDINGS_B64` (`content-calendar.yml:78`), whose
    transport is its own item, `ci-findings-transport`. The test computes it over the limit from `render.ts`'s
    `MAX_FILE_BYTES`, so it turns red the day that item changes the bound or the transport. It also asserts that no
    `ci.yml` job declares `outputs`, so `toJSON(needs)` carries results alone.
  - **T5** (`:3314`) finds the seven `docker/build-push-action` steps, matching `uses:` in lower case, and requires
    `BUILDX_METADATA_PROVENANCE` exactly `disabled` on each (buildx reads `Disabled` as `min`). It refuses
    `docker/bake-action`, any `--metadata-file` in a script, and any workflow naming `buildx.build.provenance`.
- `standInDocker` (`:285`) is the release archive check's stand-in docker lifted to file scope, which T2 reuses.

**The documents (`abe84f0d`).**
- ADR 0066, Part 3, notice **N29** (`:968`), with its Date line (`:28`) and a Part 3 Deciders sentence (`:38-39`).
- `docs/runbooks/ci.md`: the `images` failure item says what an identity step's `::error` and "Argument list too long"
  mean (`:126-129`), and "Changing CI" gains the rule (`:398-403`).
- `docs/product/reconciliation-001.md` records the item under the co-founder's ruling of 2026-10-26 (`:659-661`).

**The integrator.**
- `620ca983`, improve as you go: T3 also reads a job's `defaults` (its `run.shell` is the command the runner starts)
  and a step's `working-directory`, the two other keys GitHub's contexts table lets take a context and the runner hands
  a process (github/docs 3869faed, `contexts.md:96`, `:115`). Neither holds an expression today. T4 gains both places,
  red without the keys and green with them.
- `83167b8f` merges `claude/build-platform` at 83d71fd6 (#78), which moved after the branch was fast-forwarded to
  56ed6279 (#81). #78 changes none of this branch's files and no lockfile; the merge has no conflict, and on the merged
  tree `pnpm install --frozen-lockfile`, `watched.ts --write` and `pnpm synth --all` write nothing.

The commits on top of 56ed6279, in order: `eeac99e2` (c1, red), `9ec30e1d` (c2), `c9a23640` (c3, red), `96cf5ccc`
(c4), `abe84f0d` (c5), `620ca983` (integrator), `83167b8f` (the merge). 9 files of this branch change against the
base's tip 83d71fd6, +737 −18.

## Why

- **The defect.** #42's run 40630123457, job 122624309161 (`images`, event `pull_request`, head 46974a25): steps 10
  and 11, the two identity steps, failed at 04:06:41 UTC with `An error occurred trying to start process
  '/usr/bin/bash' … Argument list too long`. The scripts never ran.
  - Each step passed the whole `steps.<id>.outputs.metadata` as one variable, `METADATA` (165c5993 `ci.yml:734` and
    `:746`, added by #77, ci-browser).
  - The web value was 132,377 bytes, so `METADATA=` + value + NUL was **132,387**; the worker's 132,383, so 132,393.
    Linux holds one environment string to `MAX_ARG_STRLEN`, `PAGE_SIZE * 32` = **131,072** bytes
    (`/usr/include/linux/binfmts.h:15`), and refuses the exec with `E2BIG`. Reproduced here: 131,072 bytes with the NUL
    start, 131,073 give `/usr/bin/bash: Argument list too long`, exit 126.
  - The base's push runs pass (40615991431 and 40624946717): a push event carries no description.
- **Where the description comes from.** buildx v0.38.1 reads `GITHUB_EVENT_PATH` whole into `github_event_payload`
  (`util/ghutil/ghutil.go:33-41`), and its docker-container driver hands it to BuildKit for every build record
  (`driver/docker-container/driver.go:177-185`). buildx's default `min` mode then copies the record's provenance into
  the metadata file, invocation environment included (`build/provenance.go:41-112`, `:139-143`). `provenance: false`
  only drops the attestation manifest. On #42 the payload was 120,430 bytes, its `pull_request.body` 95,324
  characters, and the description was printed four times per run: each build's `Metadata` group and each identity
  step's `env:` display.
- **The rulings.** The co-founder's of 2026-10-26, about 00:20 UTC: every choice its recommended option, for security
  the safer one, without asking, each recorded with its reason (below and in the design's §10). The founder's standing
  rule: only the best option, never weighted by effort.
- **LANES.md.** None of this branch's files is on the "Not while #42 is open" list (`LANES.md:84-91`, re-read at
  07:20 UTC). ADR 0066 and reconciliation-001 are rule 6 shared documents. No ADR or test-matrix number is needed: N29
  is ADR 0066's own notice sequence, after #82's N23 to N28.

## What it does not change

- Pricing engine (`packages/pricing`): unchanged.
- Ledger (`packages/ledger`): unchanged.
- Database schema and migrations: unchanged; no migration.
- Content releases (`content/`): unchanged.
- Domain model (`docs/product/domain-model.md`), its approval line and `approvers.json`: unchanged.
- CI and the GitHub settings: **CI changes**, since it is this pull request's subject: two identity steps' `env` and
  first script line, seven build steps' `env`, and comments. No job, step order, condition, required check, permission,
  timeout, trigger or GitHub setting changes.
- Also unchanged:
  - the images themselves, their config digests, `tools/screening-capacity/image-id.ts`, the identity comparisons and
    the worker's load rule (`BUILDX_METADATA_PROVENANCE` acts after the export, on the metadata file alone,
    `build/provenance.go:26-28`);
  - the release's attestation, which is `actions/attest-build-provenance` on the capacity report
    (`release.yml:441-446`), not buildx's provenance;
  - the build record build-push-action uploads, which still carries BuildKit's copy of the event (P2 below), the step
    summary and the builder's `driver-opts`;
  - the content calendar (`content-calendar.yml`, `tools/content-calendar/*`, ADR 0071, `content-updates.md`): T6
    only names its findings over the limit;
  - every manifest, `pnpm-lock.yaml` and `watched-paths.txt`;
  - every file on LANES' "Not while #42 is open" list.

## Checks

The required checks report on this page by themselves: <!-- required-checks -->`all green`, `mutation`,
`screening-capacity gate` and `approval-of-record`<!-- /required-checks -->.

**Local** (Node 24.22.0, pnpm 10.34.8, each heavy command under the lane's lock). The builder ran every command at
`abe84f0d`; the integrator ran them again at the merged head `83167b8f`.

| Command | Result |
| --- | --- |
| `pnpm exec vitest run --project unit tools/test` | **21 files, 292 passed** at `abe84f0d` and at `83167b8f`; 287 at 165c5993, so +5 (T2 to T6; T1's pins sit in an existing test) |
| `pnpm exec vitest run --project unit tools/test/workflows.test.ts` | 119 passed, among them the simulated Dependabot rewrite and the actionlint test |
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint` | passed, 1,669 files in 3 groups, 0 errors, 0 warnings (1,650 at `abe84f0d`; the merge brings #78's files) |
| `pnpm lint:logs` | 1,082 files scanned, every log call allowlisted |
| actionlint 1.7.7 `-shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown'` | exit 0, no output, on every workflow |
| `pnpm actions:check --offline` | exit 0: every action pinned to its release's commit |
| `BASE=origin/claude/build-platform pnpm actions:check` | exit 0: against 83d71fd6, no pin new or used with changed inputs; the builder `moby/buildkit:v0.34.1` is the index `99368f3e…`, and no newer release is three days old |
| `pnpm install --frozen-lockfile`, `watched.ts --write`, `pnpm synth --all` on the merged tree | nothing written (synth: 258 cases, 0 written, 650 unchanged, 0 removed) |
| pre-push (fixture check, gitleaks 8.24.3) | the first push (`eeac99e2`) and the second (`9ec30e1d`): 1 commit each, the fixture check clean, gitleaks found no secret; the head's push is recorded below |

The full `pnpm test`, `pnpm test:db` and `pnpm test:golden` run in the fix round, as the pipeline runs them.

**Failing first.** The head's tests on 165c5993's tree through `CI_TREE` (07:10:56 UTC): 5 failed, 1 passed, 113
skipped. Every failure is an AssertionError; none is an import error.

| Test | At 165c5993 | At the head |
| --- | --- | --- |
| T1, the pins | red: `expected { Object (METADATA) } to deeply equal { Object (BUILT) }` | green |
| T2, the identity steps on 132,377 bytes | red: `The web archive holds the image buildx built: bash did not start: expected 'spawnSync bash E2BIG' to be undefined` (the defect itself) | green |
| T3, the value rule | red: exactly two problems, `images`' web and worker `env.METADATA` | green |
| T4, the rule bites | green, by design: it tests the rule's own function, not the workflows | green |
| T5, the build-provenance rule | red: all seven build steps listed | green |
| T6, every value with its bound | red: 65 values found against 67 listed, the two pinned digest rows missing | green |
| T4's two new places (`620ca983`) | red without the two keys: `job images defaults.run.shell: expected [] to deeply equal [ Array(1) ]` | green |

**Local proof** (07:11:40 UTC, `local-proof.mjs` and `local-proof-bash.sh`). A synthetic metadata of 132,377 bytes,
laid out as buildx writes it (SHA-256 `be1a9dac…1915`), so `METADATA=` + value + NUL is 132,387 bytes, as on #42:

| Case | Result |
| --- | --- |
| old step, the whole output as `METADATA`, through Node | `spawnSync /usr/bin/bash E2BIG`: bash never starts |
| old step, through bash itself | `/usr/bin/bash: Argument list too long`, exit 126 |
| new step, `BUILT` from the same metadata (71 characters) | exit 0, `web: config sha256:3fece917…49940` |
| new step, an empty output (`'' \|\| '{}'`) | exit 1, `::error title=The web archive::its config digest is sha256:3fece917…, and buildx built nothing it reported` |
| new step, a metadata without the key | exit 1, the same message |
| new step, another digest | exit 1, `… and buildx built sha256:1111…` |

**The CI runs of record.** Every CI run of this pull request is a run of record for the defect: GitHub copies the
description into each `pull_request` event, buildx copied that event into its metadata (the root cause, #42's job
122624309161), and the description stays over 100,000 characters until the merge (the synthetic ruler collapsed at
the end; SHA-256 `5bb5e558…`). Editing a description starts no ci.yml run, so the length is in place before each push,
each push's read of it is recorded below, and nobody removes or shortens the ruler before the merge. The merge takes
an explicit commit message, which carries none of it.

**The opened run is not one of them.** GitHub refused the whole description on the create call ("body is too long
(maximum is 65536 characters)", 07:38 UTC), so this pull request opened on `eeac99e2` (c1 alone) without the ruler,
and an edit added it right after. #42's description is 95,324 characters, so an edit takes a longer one. The design's
R0, a red run on c1 alone with the ruler in place, would need a `reopened` event, and the build does not
close and reopen a pull request for it. R1's own log carries that proof instead: both builds' `Metadata` groups, the
values the old steps passed whole, measure over 131,072 bytes on this pull request's own event, while the new steps
start and pass.

The pushes follow the design's §6.3, each waiting for the `images` job of the one before it:

| Run | Event and head | What it must show | Result |
| --- | --- | --- | --- |
| opened | `opened`, `eeac99e2` (c1 alone), without the ruler | not a run of record; unit red on c1's tests by design | cancelled by R1's push (run 40651583762) |
| R1 | `synchronize`, `9ec30e1d` (c2) | both identity steps start and pass; each build's `Metadata` group still measures over 131,072 bytes, so the old steps would have failed | **passed**: run 40652135443, `images` job 122694617018 (07:45:59 to 07:50:22 UTC). Both identity steps started and passed, each `env` showing `BUILT:` and one digest: `web: config sha256:66bc0f6e…5386`, and `worker: config sha256:51bb5cde…870a, target sha256:f9110d42…, loaded as sha256:f9110d42… on the containerd image store`. No "Argument list too long" and no error in the job's log (4,206 lines, read whole). The `Metadata` groups measure **162,422** bytes (web) and **162,428** (worker), so the old `METADATA=` strings would have been 162,432 and 162,438 bytes, over 131,072; each holds this pull request's event, its description 124,840 characters. Every other job passed, `unit` among them (c1's tests at c2) |
| R2 | `synchronize`, `83167b8f` (the head) | `all green` and the other required checks pass; no `buildx.build.provenance` in either `Metadata` group; no copy of the ruler in the job's log; the capacity measurement and `release-dry-run.yml` pass with the new `env` | pending |

**Before each push** (the description read just before it; after the push's run started, the branch's
`approval-of-record.yml` runs, which `edited` starts, show no edit between the read and the push):

| Push | Description read | Characters | Ruler SHA-256 | Edits between read and push |
| --- | --- | --- | --- | --- |
| R1 | 07:45 UTC, `pull_request_read` right after the edit that added the ruler (`updated_at` 07:44:41Z); the push 07:45:09 to 07:45:22 | 124,840; the run's event carried 124,840 | `5bb5e558…` | none: the branch's approval-of-record runs are 07:40:18 (opened), 07:44:46 (the edit that added the ruler) and 07:45:29 (R1's `synchronize`) |
| R2 | pending | pending | `5bb5e558…` | pending |

**#42's port (design §9.1).** Lane A's #42 ports exactly the patch handed over before the build: 49 lines, 3,456
bytes, SHA-256 `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`, sent to Lane A's orchestrator at
about 06:42 UTC and written into this item's status file. Its eight `+` lines are in this head byte for byte and its
seven `-` lines are gone (re-checked at `83167b8f`), so either merge order is clean.

**Trial merges** (`git merge-tree`, at 07:30 UTC, this head with each open pull request's head):
- **#42** (46974a25): clean. This head's `workflows.test.ts` on the merged tree's workflows (`CI_TREE`): 118 passed,
  1 skipped (the simulated Dependabot rewrite, which runs its own vitest and skips under `CI_TREE`).
- **#82** (96758e44, moved from b574d4e8 since the design): three conflicts, each resolved by the pull request merged
  second keeping both sides (rule 6): ADR 0066's Date line (`:28`), the end of reconciliation-001's 2026-10-26 ruling
  (both append there), and `workflows.test.ts`'s imports (`:13`: #82 adds `readDockerfile`, this branch adds
  `MAX_FILE_BYTES` beside `MAX_OPENED_PER_RUN`). The design expected the first two; the third is one import line on
  each side. This head's `workflows.test.ts` on the merged tree's workflows: T1 to T6 pass on #82's workflows (its
  `GITHUB_TOKEN: "${{ github.token }}"` is on T3's closed list), and #82's ci.yml assertion holds on this branch's
  `ci.yml`, which adds no `toJSON(`, `github[` or `secrets.`. The one failure, beside 117 passed, is the static job's
  step loop pinning Action pins' `env` to `{ BASE }`: #82's own hunk of that test (`{ BASE, GITHUB_TOKEN }`) merges
  cleanly beside this branch's lines.

## Reviewer agents' findings

**Not run yet.** The pipeline's two adversarial reviews run on this draft next, each in a fresh clone and read only on
GitHub: CI and test infrastructure; security and supply chain. Their findings and resolutions are added here. The
payment-engine, EDI and UX reviewers do not run: this change touches no money, tenancy, parsing or screen.

| Reviewer | Finding | Resolution |
| --- | --- | --- |
| CI and test infrastructure | not run yet | — |
| Security and supply chain | not run yet | — |

## Freeze exception

No: it changes none of them.

## Domain model

No migration; the document is unchanged.

## The founder's approval

This pull request merges only after the founder's approving GitHub review of its latest commit and green required
checks. The build waits for that review from the day it works under its own GitHub account
(`docs/runbooks/github-governance.md`, 3i), and from step 5 GitHub requires it too; before 3i, on green checks alone
(reconciliation 001, D4 (a)). The review is the record of the approval, not anything written here; a new commit
dismisses it. The build then merges, and never reviews.

---

**Choices made under the co-founder's ruling of 2026-10-26** (each the recommended option, for security the safer
one; each reversible; the design's §10 has them in full):
- **C1.** Take only the digest, in the expression. Not `imageid`, which buildx fills with the manifest digest when the
  config digest is absent (`commands/build.go:469-475`), turning "nothing it reported" into a misleading mismatch; and
  not the whole metadata made smaller, which would leave a step whose env grows with whatever buildx adds next.
- **C2.** `|| '{}'` inside the expression, since no `if:` can guard an `env` (above). Invalid JSON still fails the step,
  closed.
- **C3.** `BUILDX_METADATA_PROVENANCE: disabled` on all seven builds, not only the pull-request workflows: push, tag and
  dispatch events carry their own unbounded text, one rule is simpler to hold, and `release-dry-run.yml` must equal
  `release.yml` step for step. `disabled` is the documented word and must be exact.
- **C4.** Not `provenance-add-gha=false` on the builder: it changes the `driver-opts` the tests hold to exactly the
  pinned image (`workflows.test.ts` and #82's image rule), drops the run's context from release build records, and is
  undocumented in buildx's reference. Recorded as P2.
- **C5.** A static rule over every workflow, as an allowlist read as the runner reads an expression: a denylist can be
  slipped past by whitespace, case, a wildcard, a computed index or another key.
- **C6.** One table for every step output and every cross-job value, each with its bound: that is how `FINDINGS_B64`
  slipped through, a bound chosen for a job output, never for the environment.
- **C7.** The content calendar's transport is its own item, `ci-findings-transport`; this change only names it. The
  defect there is latent: its last scheduled run, 40510094317, succeeded.
- **C8.** `inputs` admitted only as `choice`, `boolean` or `number`: no documented bound on a `string` dispatch input
  was found.
- **C9.** Notice N29 in Part 3, not a new Part. **C10.** No test-matrix row: these guard CI's wiring, as "concurrency
  groups" does.
- **C11.** The proof rests on this pull request's own event, not on #42's run and a computation: R0 was to show it red
  (not run, above); R1 measures it. **C12.** #42 got the exact patch before the build.
- **C13.** c3 to c5 in one push (R2): c4 starts the required capacity measurement, of up to 100 minutes.
- **The integrator's:** the pushes in the design's order, c1, then c2 (R1), then the head (R2), rather than one push of
  the head, which would forgo R1's measurement for good (no force push); R0 not run (above); the base merged in at R2's
  push; `620ca983`.

**Also in this pull request (improve as you go), each tested:** `standInDocker` at file scope (T2 and the release
archive check share it); T6 checks that every row cites a file and line, that `FINDINGS_B64` is the variable taking the
over-limit value, and that no `ci.yml` job declares `outputs`; T3 reads a job's `defaults` and a step's
`working-directory` (`620ca983`).

**Proposed, not done here:**
- **P1.** `publish-content.yml:55` interpolates `steps.publish.outputs.releases` into its script. Bounded, but an env
  value is the hygienic form; the file is frozen to its copy under the founder's F4, so it is the founder's call.
- **P2.** The build-record artifact still carries BuildKit's copy of the event: `DOCKER_BUILD_RECORD_UPLOAD: false` on
  the pull-request builds, or `provenance-add-gha=false` on the builder, weighed against the record's use to a person
  reading a failed build.
- **P3.** `ci-findings-transport`, an item of its own under ADR 0071's owner: any findings file over 98,292 bytes stops
  the notify job before bash starts. It needs a claim.
- **P4.** ADR 0066's notice numbers repeat (Part 4 reuses N4 and N5, Part 2 has an N5).
- **P5.** The repository's merge-message default is the founder's setting; "Pull request title" would keep any long
  description out of the build branch's history.
- T6's table cites workflow lines, which drift when a workflow is edited above them: T6 could check that each cited
  line names its producer (the step id or the env name).

<details><summary>Length-test appendix (synthetic, 100,061 characters): keeps this pull request's every CI run a run of record for the 131,072-byte limit; kept until the merge</summary>

<!-- RULER: node ruler.mjs output, 100,061 characters, SHA-256 5bb5e558…, sits here in the live body -->

</details>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01UzQ6wgZgtThBRBxXTFYhRB