# Lane B: ci-images-digest, design

`images` refuses a long pull-request description. Branch `co-001/ci-images-digest`, cut at `claude/build-platform`
165c5993, worktree `/home/user/ci-images-digest`. Written 2026-10-28 between 05:20 and 06:05 UTC by Lane B
(session_01UzQ6wgZgtThBRBxXTFYhRB) for the item Lane A's orchestrator handed over at 05:45 UTC
(`approval-summaries/lane-b-ci-images-digest-status.md`). Revised between 06:19 and 06:37 UTC to fold in the adversarial
review (`ci-images-digest-review.md`, saved 06:17 UTC). Each finding's disposition is in "Review (2026-10-28)" at the
end, and the version before the fold is `scratchpad/imgdigest/fold/design-before-fold.md` (SHA-256 `1f81a7f5…c11c`).

Rulings it is taken under: the co-founder's of 2026-10-26, about 00:20 UTC (every choice its recommended option,
security the safer one, without asking; each choice recorded with its reason), and the founder's standing rule (only
the best option, never weighted by effort).

**No COUNTER REQUEST.** No ADR number and no test-matrix row is needed. The one numbered item is a notice in ADR 0066,
whose N-sequence is Lane B's own, and it takes N29, after the N23 to N28 that #82 holds (§8, C9). The content calendar's
findings transport leaves this item for one of its own, `ci-findings-transport` (§12, P3; C7). That is a claim for the
orchestrator to place, not a number.

**LANES.md check** (re-read 06:19 UTC). This design changes:
- `.github/workflows/{ci,release,release-dry-run,release-capacity,screening-capacity}.yml`;
- `tools/test/workflows.test.ts`;
- ADR 0066, `docs/runbooks/ci.md` and `docs/product/reconciliation-001.md`.

None of them is on the "Not while #42 is open" list (`/home/user/ops/LANES.md:84-91`). That list names the runbooks
`deploy-and-rollback.md` and `deliverability.md`, not `ci.md`, and of the capacity harness only
`tools/screening-capacity/{run,report}.ts`. ADR 0066 and reconciliation-001 are rule 6 shared documents (`LANES.md:34`,
`:93`). #42 and #82 both change reconciliation-001, and #82 also changes ADR 0066 (§9). T2 reads
`tools/screening-capacity/test-support/image-archive.ts`, and T6 imports `MAX_FILE_BYTES` from
`tools/content-calendar/render.ts`. Neither file changes, and neither is on the list.

Line numbers are at 165c5993 unless a line says otherwise. Every file this design changes is identical at 165c5993, at
the current base 56ed6279 (#81, merged 05:37:48 UTC) and at #82's base 0dd1ba7e. At #42's head 46974a25 every one is
identical except `reconciliation-001.md`, where #42 adds ten lines after `:640`. `git diff --stat` shows this for each
pair (06:31 UTC; §9).

---

## 1. Goal and acceptance

**Goal.** No step of any workflow takes a value that can exceed Linux's 131,072-byte limit on one environment string
into its environment, an action's input or its script. `images` passes on a pull request whatever the length of its
description. A test holds every workflow to that rule, reading each expression as the runner reads it. The one other
value found over the limit is the content calendar's findings. The test names it as the open defect it is, and its
transport is its own item (C7).

**Acceptance.** Each item is measurable, and the PR description records each result.

- **A1, local proof.** `scripts/local-proof.mjs` (§7) is run on the head. It was last run at 06:24:25 UTC on
  `proof/wf/ci.yml`.
  - The base's web identity step fails to start: `spawnSync /usr/bin/bash E2BIG`. Its input is a synthetic metadata of
    132,377 bytes, so the string `METADATA=` + value + NUL is 132,387 bytes, as #42's web step measured.
  - The head's step passes on the same metadata, printing `web: config sha256:…`.
  - An empty output, a missing key and another digest each exit 1, each with the step's own `::error` message.
- **A2, failing first.** One run through `CI_TREE` at 165c5993 (§6.2):
  - T1, T2, T3, T5 and T6 fail there with AssertionErrors and no import error;
  - T4 passes there;
  - every test passes at the head.
- **A3, local suite.** Every heavy command runs under `flock /tmp/laneb-heavy.lock`, as the pipeline's fix round runs
  them, and every one passes:
  - `pnpm typecheck`, `pnpm lint`, `pnpm lint:logs` and `pnpm test`. The unit count is the base's plus the new tests;
    the PR states both numbers.
  - actionlint 1.7.7, with the flags `workflows.test.ts:2405-2412` uses, exits 0 on every workflow.
  - `pnpm actions:check --offline` and `BASE=origin/claude/build-platform pnpm actions:check`, because a workflow
    changes.
- **A4, run of record R0.** This run is red. Its event is `pull_request` `opened`, and the description is longer than
  100,000 characters (§6.3). `images` fails both identity steps with "Argument list too long", which proves on this pull
  request's own event that the synthetic appendix crosses the limit.
- **A5, run of record R1.** Its event is `synchronize`, on the digest commit, with the same description.
  - Both identity steps pass. They print `web: config sha256:…` and `worker: config …, loaded as … on the containerd
    image store`.
  - Each build's `Metadata` log group still measures over 131,072 bytes (§6.4), so the old steps would have failed.
- **A6, the head (R2).** `all green` passes, and so do the other three required checks.
  - In `images`, neither build's `Metadata` group holds `buildx.build.provenance`.
  - The log holds no copy of the appendix: the count of `synthetic length-test row` in the job's log is 0. The count is
    complete only when the log's `original_length` is 5,000 lines or fewer. Otherwise the PR names the first lines not
    read and the steps they belong to (§6.4).
  - `release-dry-run.yml` runs on this pull request (it changes `release.yml`) and passes with the new env.
  - `screening-capacity gate` measures, because c4 changes a watched path (`tools/screening-capacity/watched-paths.txt:4`).
    Its `capacity` job builds both images with the new env (`screening-capacity.yml:175`, `:188`), so two of the seven
    env lines are proved on this pull request besides ci.yml's two.
- **A7, event length.** Each run of record's event carries a description of over 100,000 characters.
  - For R0 and R1, read the log's `github_event_payload.pull_request.body` and measure it as in §6.4.
  - For R2 and any later push, no log carries the event. Before each push, read the description, and then show that it
    was not edited between that read and the push. The procedure is in §6.3, "Before each push".
  - R1, read from its log, stays the run of record that proves the fix. R2's record proves that nothing went back.
- **A8, #42's port.** #42 receives the port patch before the build starts (§9.1): `scratchpad/imgdigest/handoff/42-port.patch`,
  SHA-256 `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`.
  - After #42's port, the same command (§9.1) is run on the port commit's parent and the port commit. It must give the
    same SHA-256. If #42 has changed either file elsewhere by then, the hunk headers' line numbers move, and the
    comparison is of the hunks' `-` and `+` lines instead.
  - `git merge-tree` of the two heads is clean in `ci.yml` and `workflows.test.ts`.
  - T3 passes on the merged tree. T3 refuses the hand-over's unguarded form (T4), so a port of that form would fail on
    the merged tree.
- **A9, trial merges, against the current base.** Run them with #82's head and with #42's head, after the current
  `claude/build-platform` is merged in (§9).
  - With #82: `ci.yml`, `workflows.test.ts` and `docs/runbooks/ci.md` are clean, and so are ADR 0066's Part 3 Deciders
    and N29.
  - With #82, two conflicts are expected, and the PR merged second resolves both under rule 6, keeping both sides:
    ADR 0066's Date line (`:28`), and the end of reconciliation-001's 2026-10-26 ruling (both append after `:657`).
  - With #42: `reconciliation-001.md` is clean, since #42 adds its lines after `:640`.
  - On the merged trees, #82's ci.yml assertion
    (`not.toMatch(/secrets\.|github\[|toJSON\(\s*(?:github|secrets)\b/)`) passes, and so do T3 and T6.
- **A10, hygiene.**
  - Only synthetic data is used.
  - No model name or identifier appears in any file, commit or comment.
  - Each commit holds one concern and ends with the session's two trailer lines.
  - The merge takes an explicit commit message (§6.3, "The merge").

---

## 2. The facts, with evidence

### 2.1 The defect, in #42's failing job

The job was read through `get_job_logs` at 2026-10-28 05:25 UTC and saved to
`scratchpad/imgdigest/joblog/job-122624309161.txt`: 5,000 lines (the last without a newline), 815,564 bytes.
- **Not the whole log.** These are the last 5,000 of the log's 5,400 lines. `original_length` is 5,400, re-read with
  `tail_lines: 1` at about 06:22 UTC, and the tool returns at most 5,000 lines (the review's read with
  `tail_lines: 30000` at 06:12 UTC).
- **What was not read.** The file starts at 04:03:29 inside the builder's info group. The first 400 lines (set-up,
  checkout and the builder's start) were not read, which is why the runner version is missing (§2.5).
- **What was read.** Every line quoted below is from the part read.

- **The job.** Job 122624309161 of run 40630123457: event `pull_request`, head 46974a25, `run_attempt` 1, job
  `images`, runner `ubuntu-26.04`.
  - Step 10, "The web archive holds the image buildx built", and step 11, "The worker archive holds the image buildx
    built, and loads as itself", both concluded `failure` at 04:06:41.
  - Step 12, the browser check, was skipped. Steps 5 and 7, the two builds, and steps 6 and 8, the scans, succeeded.
- **The two errors**, at 04:06:41.3049098Z and 04:06:41.4029794Z (saved-log lines 4287 and 4914):
  `##[error]An error occurred trying to start process '/usr/bin/bash' with working directory
  '/home/runner/work/PhysicalTherapy/PhysicalTherapy'. Argument list too long`. The script never ran.
- **What the env carried.** The step header's `env:` block held `METADATA` for each step, measured from the log's env
  blocks (the lines after `METADATA: ` up to `##[endgroup]`):
  - **web:** 132,377 bytes, so `METADATA=` + value + NUL is **132,387**;
  - **worker:** 132,383 bytes, so 132,393.
  - The builds' own `Metadata` groups measure the same, 132,377 and 132,383 bytes, with the timestamp prefixes, the
    `::stop-commands::` line and the masked `::***::` line removed. The review measured them with `review/measure.py`,
    and the fold re-measured them with `fold/payload_size.py`.
- **The keys** of each: `buildx.build.provenance`, `buildx.build.ref`, `containerimage.config.digest`,
  `containerimage.descriptor`, `containerimage.digest` and `image.name`.
  - Without the provenance key, the metadata is about 0.8 KB.
  - The provenance's `invocation.environment.github_event_payload` is the whole event. Its top-level keys are `action`,
    `after`, `before`, `number`, `pull_request`, `repository` and `sender`.
  - **Its size.** It is 120,430 bytes as compact JSON in UTF-8 (`json.dumps(…, separators=(',', ':'),
    ensure_ascii=False)`, `scratchpad/imgdigest/fold/payload_size.py`). It is 120,615 bytes with non-ASCII escaped, and
    121,365 with Python's default separators.
  - The earlier figure of 121,550 had no stated method and is not reproduced. Nothing depends on it.
  - Its `pull_request.body` is **95,324 characters** (95,445 bytes in UTF-8).
- **Four copies of the description per run.** The `"body"` lines of about 96 KB each are at saved-log lines 815, 2975,
  3916 and 4543. They come from:
  - each build step's `Metadata` group (04:04:52.3200096Z, web; 04:06:30.4315647Z, worker), which build-push-action
    prints;
  - and each identity step's `env:` display.
- **Where buildx adds it.** The log line `#24 resolving provenance for metadata file` (04:04:52.3056845Z) is buildx
  adding the provenance after the export.
- **Versions.** buildx is `github.com/docker/buildx v0.38.1 0dbe87f36ed472fe36b6796c3f70b4210a731fc5` (the "Buildx
  version" groups at 04:03:29.8026633Z and 04:05:06.3179837Z). BuildKit is `v0.34.1` ("BuildKit version" and "Builder
  info").
- **The base's push runs pass.**
  - Run 40615991431 is a push of a6e754fc, conclusion `success`. Run 40624946717 is a push of 165c5993, `success`. Both
    were read at 05:25 UTC.
  - A push event carries no description, though it does carry commit messages (§11, R5).
- **What the steps are.** `ci.yml:732-742` (web) and `:743-767` (worker) were added by #77, ci-browser. Each passes the
  whole `steps.<id>.outputs.metadata` as `METADATA` (`:734`, `:746`) and extracts one key with jq (`:736`, `:748`).
  - Their conditions are `${{ !cancelled() && steps.web.outcome == 'success' }}` (`:733`) and the worker's (`:745`).
  - The worker build runs whatever the web build did (`:703`, `if: ${{ !cancelled() }}`).
  - #42's head 46974a25 still has these lines (`git show 46974a25:.github/workflows/ci.yml`, 06:20 UTC).

### 2.2 The limit

- **The kernel's definition.** `MAX_ARG_STRLEN` is `(PAGE_SIZE * 32)`, at `/usr/include/linux/binfmts.h:15` (package
  linux-libc-dev 6.8.0-147, the uapi header). `getconf PAGE_SIZE` is 4096 here, so the limit is 131,072 bytes for one
  argument or one environment string, its NUL included. The total `ARG_MAX` is 2,097,152 here (`getconf ARG_MAX`).
- **Reproduced locally** (kernel 6.18.44, bash 5.2.21). `scratchpad/imgdigest/scripts/e2big.sh` exports one `METADATA`
  of the given total length and `exec`s `/usr/bin/bash --noprofile --norc -c …`, as the runner starts a step:

  | `METADATA=` + value (bytes) | with its NUL | result |
  | --- | --- | --- |
  | 131,070 | 131,071 | started |
  | 131,071 | 131,072 | started |
  | 131,072 | 131,073 | exit 126, `/usr/bin/bash: Argument list too long` |
  | 131,073 | 131,074 | exit 126, `/usr/bin/bash: Argument list too long` |

  `scripts/e2big_errno.py` (Python `subprocess` with that env) names the errno: 131,071 bytes start, and 131,072 give
  `E2BIG (Argument list too long)`. The commands:

  ```
  METADATA_NAME_EQ="METADATA=" bash scratchpad/imgdigest/scripts/e2big.sh
  /opt/py312-ci/bin/python3 -I scratchpad/imgdigest/scripts/e2big_errno.py
  ```
- **What Node reports.** With Node 24.22.0, `spawnSync` of bash with a 132,377-byte env value returns `error.code`
  `E2BIG`, `status` null, `output` null and no `stdout` (checked at about 06:28 UTC). T2 therefore asserts `error` first (§6.1).

### 2.3 buildx and BuildKit: where the event enters the metadata

The sources are at the versions the run used, read through blobless clones of github.com/docker/buildx (tag v0.38.1 =
0dbe87f3, the runner's own) and github.com/moby/buildkit (tag v0.34.1 = f5b59a1f).

- **buildx copies the event into the builder.** `util/ghutil/ghutil.go:33-41` reads `GITHUB_EVENT_PATH` whole into
  `github_event_payload`, beside `github_event_name`, the actor, the ref, the repository, the run and the runner
  (`:43-142`).
  - `driver/docker-container/driver.go:177-185` writes the result into the builder container as
    `provenance.d/github_actions_context.json` when `writeProvenanceGHA` is set.
  - That is set by default (`driver/docker-container/factory.go:53`) and turned off by the driver option
    `provenance-add-gha=false` (`:115-119`). It came in with buildx commit 7652057da (2025-10-06).
- **BuildKit puts it in every build record.** `cmd/buildkitd/util.go:74-102` loads every `provenance.d/*.json` into the
  daemon's provenance environment.
  - `solver/llbsolver/history.go:136` gives it to every build record's provenance, and `provenance.go:516` stores it as
    `ProvenanceCustomEnv`.
  - This happens whatever the build's own `provenance:` input says: `provenance: false` (`ci.yml:687`, `:711`) only
    drops the attestation manifest from the image.
- **buildx copies the record's provenance into the metadata file.** `build/build.go:979-985` calls
  `setRecordProvenance` after the build.
  - `build/provenance.go:41-112` reads the provenance from the build record and sets `buildx.build.provenance`, or
    `buildx.build.provenance/<platform>` for a multi-platform build.
  - The mode is set by `BUILDX_METADATA_PROVENANCE` (`util/confutil/metadata.go:12-41`), and it is used only when
    `--metadata-file` is passed (`commands/build.go:217-221`):

    | Value | What buildx writes |
    | --- | --- |
    | `min`, the default (also any unknown value) | the provenance with only `BuildConfig` and `Metadata` removed (`provenance.go:139-143`); the invocation's environment stays, `github_event_payload` included |
    | `max` | the whole provenance |
    | `disabled`, `false` or `0` | no provenance key at all (`provenance.go:26-28` returns before reading the record) |

  - The documentation of the three values is `docs/reference/buildx_build.md:634-640` at v0.38.1.
  - The parse is case-sensitive: `Disabled` would mean `min` (`util/confutil/metadata.go:30-40`). So T5 requires the
    exact `'disabled'`.
  - `buildx.build.ref` is still written with `disabled` (`build/build.go:980`), so build-push-action's reference,
    summary and record export still work (`src/main.ts:241-258`).
- **The image ID file.** buildx's `--iidfile`, which build-push-action's `imageid` output reads, holds
  `containerimage.config.digest`, or `containerimage.digest` when the config digest is absent
  (`commands/build.go:469-475`).

### 2.4 build-push-action v7.4.0 (c3c9e263), the pin the workflows use

The source was read from a blobless clone. The tag `v7.4.0` points at c3c9e263; actions-toolkit is 0.100.0
(e0f279f2).

- **It passes the step's env to buildx.** `src/context.ts:221` passes `--metadata-file`. `src/main.ts:104-108` runs
  buildx with `process.env` plus `BUILDX_METADATA_WARNINGS`, so a step's `env:` reaches buildx.
- **It prints the metadata and sets the output.** `src/main.ts:137-143` prints the metadata in the `Metadata` group
  (`GitHub.printUntrusted`, hence the log's `::stop-commands::`) and sets `metadata` to `JSON.stringify(metadata, null,
  2)`.
- **The build summary does not print the provenance.** The post step (`src/main.ts:193-228`) exports the build record
  and uploads it as a `.dockerbuild` artifact. The log shows 76.03 KB and 70.58 KB for #42's two builds. It then writes
  the step summary through actions-toolkit's `src/github/summary.ts:40-177`: links, the build table, any error, the
  inputs and the builder.
- **The build record still holds the event.** The record carries BuildKit's own copy of the provenance, the event with
  it (§2.3), and `BUILDX_METADATA_PROVENANCE` does not change the record.
  - These sessions cannot read the record. The review got #42's record's download URL from `actions_get
    download_workflow_run_artifact` (artifact 12791306593, 06:13 UTC), and the proxy refused the download:
    `curl: (56) CONNECT tunnel failed, response 403`.
- **Switches.** `DOCKER_BUILD_SUMMARY` and `DOCKER_BUILD_RECORD_UPLOAD` turn the summary and the upload off
  (`src/main.ts:268-283`).

### 2.5 The runner: how it reads an expression, what it yields and when

The runner source is actions/runner tag v2.338.2 (d1eb12d), from a blobless clone; it is the newest tag. The job's
runner version was not read, since the log read lacks its first lines (§2.1).

- **A step's `env` is evaluated before its `if:`.** `src/Runner.Worker/StepsRunner.cs:114-138` evaluates and merges
  the step's env, and only then evaluates the condition (`:203-237`).
  - An error in the env expression marks the step failed (`:131-137`, `CompleteStep(step, TaskResult.Failed)`), even
    when its `if:` would have skipped it.
  - No earlier skip exists for a cancelled job: every dequeued step goes through `:79-138`.
  - So an `if:` guard cannot protect an env expression. The guard has to sit inside the expression.
- **`fromJSON('')` is an error.** `src/Sdk/DTExpressions2/Expressions2/Sdk/Functions/FromJson.cs:16-21` calls
  Newtonsoft's `JToken.ReadFrom` on the string. An empty string throws, so `fromJSON` of an empty output is an evaluation
  error.
  - A duplicate object key replaces the earlier one instead of throwing (`JTokenExtensions.cs`,
    `subContext[property.Name] = …`).
  - A non-JSON output fails the step, closed.
- **`||` returns the first truthy operand's value**, not a boolean (`Expressions2/Sdk/Operators/Or.cs`,
  `EvaluateCore`).
- **A missing key is null.** `.../Sdk/Operators/Index.cs:148-181` (`HandleObject`): a string index that the object
  lacks returns `null`.
- **Null becomes the empty string.** `src/Sdk/DTObjectTemplating/ObjectTemplating/TemplateEvaluator.cs:369-380`
  converts a non-string literal to a string for a string-typed value. `Tokens/NullToken.cs:27-30` makes `null` the
  empty string. An env value must be a string (`PipelineTemplateConverter.cs:162`).
  - So an empty output, a missing key or a non-object JSON all reach the `-z` branch.
- **Whitespace anywhere, names without case.** The lexer, `Expressions2/Tokens/LexicalAnalyzer.cs`:
  - It skips whitespace before every token (`:21-25`).
  - It reads a name as a function when the next non-blank character is `(` (`:187-198`). So `toJSON (github.event)` is
    a call, and `github . event . pull_request . body` is a path.
  - Function names are matched without case (`ExpressionConstants.cs:37`, `StringComparer.OrdinalIgnoreCase`), and so
    are context names (`ExpressionParser.cs:426-427`) and object keys (`Pipelines/ContextData/DictionaryContextData.cs:77`).
    So `ToJson(GitHub.Event)` and `steps.web.outputs.METADATA` both work.
  - T3 reads expressions the same way (§6.1).
- **GitHub's documentation agrees.** It was read from github.com/github/docs at 3869faed (2026-10-27), through a
  blobless sparse clone; docs.github.com itself does not resolve from this session.
  - `content/actions/reference/workflows-and-actions/expressions.md:30`: falsy values are `false`, `0`, `-0`, `""`,
    `''` and `null`.
  - `:93`: Null converts to `''`.
  - `:191-197`: `fromJSON` "Returns a JSON object or JSON data type for `value`".
  - `contexts.md:44-47`: index syntax `github['sha']`; property dereference needs a name of letters, digits, `-` or
    `_`, so a dotted key like `containerimage.config.digest` needs the index form.
  - `data/reusables/actions/output-limitations.md:1`: "Outputs can be a maximum of 1 MB per job. … Size is
    approximated based on UTF-16 encoding."
  - `content/actions/reference/workflows-and-actions/variables.md:110`: "Individual variables are limited to 48 KB in
    size". `content/actions/reference/security/secrets.md:37`: "Secrets are limited to 48 KB in size".
  - **Dispatch inputs: no limit found.** The longest `workflow_dispatch` string input was not found in the docs read.
    The 65,535 characters at `events-that-trigger-workflows.md:955` are `repository_dispatch`'s `client_payload`.
    Characters are not bytes either: 65,535 three-byte characters would be 196,605 bytes. So T3 admits only inputs
    whose declared type bounds them (C8).
- **actionlint accepts the expression.** actionlint 1.7.7 (`-shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is
  unknown'`, the test's flags) passes `scratchpad/imgdigest/proof/wf/ci.yml`, which is `ci.yml` with §4's lines
  applied: exit 0, no output. The base's `ci.yml` also gives exit 0.

### 2.6 The event: what a pull_request run carries, and when

- **Which edits start ci.yml.** `events-that-trigger-workflows.md:458-468` (github/docs at 3869faed): by default a
  `pull_request` workflow runs on `opened`, `synchronize` and `reopened` only. ci.yml declares `pull_request:` with no
  `types` (`ci.yml:8-11`), so editing a description (`edited`) does not start ci.yml.
- **What an edit does start.** Only `approval-of-record.yml` lists `edited` (`approval-of-record.yml:10-11`). Every
  edit therefore leaves an approval-of-record run on the pull request's head SHA, and §6.3 uses that trail.
- **The description is in the payload.** The payload is the pull request's state at the event: #42's run's
  `github_event_payload.pull_request.body` is the description (§2.1).
- **A comment is not.** A comment is an `issue_comment` event of its own (`events-that-trigger-workflows.md:598-601`),
  and no fixture or file in the tree reaches `GITHUB_EVENT_PATH`.
- **Re-runs.** The status file says a re-run reuses the original event. I did not verify that for the payload's body;
  the re-run documentation was not read.
- **Length limit not verified.** I did not verify the longest description GitHub accepts. #42's 95,324 characters were
  accepted.

---

## 3. Every place a value can reach a process: the inventory

`scratchpad/imgdigest/scripts/inventory.mjs` reads every workflow with the `yaml` package. It lists every `${{ … }}` in
a workflow, job or step `env`, a `with:` input, a `run:` script or a job `outputs:`: 244 expressions, in
`scratchpad/imgdigest/inventory.tsv`. There are no composite actions in the repository (`.github/actions` does not
exist).

**The fold's prototype reads more** (`scratchpad/imgdigest/fold/allowlist-proto.mjs`, §6.1, T3). It also reads
`strategy`, `container`, `services`, a job's `with` and `secrets`, and every `$GITHUB_ENV` write. That adds four
things, none unbounded:
- the matrices at `ci.yml:301` and `:502` (`fromJSON(github.event.repository.private && '[…]' || '[…]')`);
- the matrix at `mutation.yml:77` (`fromJSON(needs.changes.outputs.shards)`, reaching env at `:79`);
- the one `$GITHUB_ENV` write, `ci.yml:285` (`ENGINE_FREEZE_BASE`, a commit SHA).

- **No event free text or event objects.** No workflow names `github.event.pull_request.body` or `.title`, any
  `github.event` object whole, `toJSON(github…)`, `toJSON(steps)` or `github[…]`.
- **The `github.event` fields in use are bounded scalars:**
  - `before` (`ci.yml:61`, `:272`);
  - `pull_request.number` (`ci.yml:127`, and the concurrency groups);
  - `pull_request.base.sha` (`mutation.yml:63`, `screening-capacity.yml:92`);
  - `pull_request.head.sha` (`screening-capacity.yml:93`);
  - `repository.private` (`ci.yml:301`, `:502`, in `strategy.matrix`).
- **Inputs are env too.** A `with:` input reaches a JavaScript or Docker action as an `INPUT_<NAME>` environment
  variable, so the same limit applies. The step outputs passed as inputs are all short: paths, tags, the static host,
  `runner.temp`.
- **Every step output and cross-job value.** 67 values in all: 53 step outputs used in their own job, two of them the
  pinned digest forms after c2, and 14 values one job hands another (`fold/head-table.tsv`). T6 lists each with its
  bound.

| Where | Value | Can it exceed 131,072? |
| --- | --- | --- |
| `ci.yml:734` (web identity, `METADATA`) | `steps.web.outputs.metadata`, whole | **Yes**: 132,387 bytes on #42 (§2.1); the description's length has no bound this repository sets. **Fixed here** (c2). |
| `ci.yml:746` (worker identity, `METADATA`) | `steps.worker.outputs.metadata`, whole | **Yes**: 132,393 bytes on #42. **Fixed here** (c2). |
| `content-calendar.yml:78` (notify, `FINDINGS_B64`) | `needs.check.outputs.findings`: base64 of `findings.json`, bounded at 700,000 bytes (`tools/content-calendar/render.ts:17-18`, `:127-135`) | **Yes**, up to 4 × ⌈700,000 / 3⌉ = 933,336 characters (see below). **Out of this change** (C7): T6 records it as the one value over the limit, and its transport is `ci-findings-transport` (§12, P3). |
| `release-capacity.yml:137` (`ADVISORIES_B64`) | base64 of the advisory lines | No: at most two lines (`tools/release-capacity/checks.ts:181-195`) |
| `screening-capacity.yml:344` (`MEASURE`) | `true` or `false` (`:97-130`) | No |
| `screening-capacity.yml:346-347` (`SIZING`, `TIME_WARNINGS`) | one sentence (`report.ts:835-838`); one warning per judged scenario upload (`report.ts:639`, a fixed list) | No |
| `mutation.yml:124-126`, `:190` (`ANY`, `PACKAGES`, `SHARDS`); `:77` (the matrix) | written by `tools/stryker/affected.ts:776`: a boolean and JSON lists of package names and shards | No |
| `release.yml:242`, `:350`, `:392`; `release-dry-run.yml:229`, `:284` (`BUILD`) | `toJSON(needs.build.outputs)`: twelve (dry run six) digests (`release.yml:56-67`) | No |
| `ci.yml:785` (`NEEDS`) | `toJSON(needs)`: eight jobs' `result` and `outputs` | No: no ci.yml job declares `outputs` (`grep '^    outputs:'` finds none in ci.yml) |
| `ci.yml:285` (`$GITHUB_ENV`, `ENGINE_FREEZE_BASE`) | a commit SHA | No |
| `publish-content.yml:55` (`run:` interpolation) | `steps.publish.outputs.releases`, release numbers | No, and a script file has no exec limit. The file is frozen to its copy (`workflows.test.ts:2347-2361`, the founder’s F4), so it is out of this change (§12, P1). |

**What the content calendar's row means.** Any findings file over 98,292 bytes stops the notify step before bash
starts. No issue is opened, and the job is red. The same bound is also past GitHub's 1 MB job-output limit once counted
as UTF-16, about 1.87 MB (§2.5). The notify job runs on schedule, push and dispatch (`:65-67`).
- The defect is latent, not live. The last scheduled run, 40510094317 (2026-10-27 13:13 UTC), succeeded, and so did
  every run listed (read at about 06:22 UTC, `actions_list list_workflow_runs content-calendar.yml`).

The two images steps are the places this change fixes. T3 and T6 keep every other row in its place and name the content
calendar's.

---

## 4. The change

There are five commits, one concern each, in this order (§6.3 places the pushes of record between them). Every commit
message ends with a blank line and the session's two trailer lines.

**Before c1**, two steps, in this order:
- **Hand #42 its patch (§9.1).** Write `scratchpad/imgdigest/handoff/42-port.patch` (SHA-256
  `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`) into the status file's RESUME-BLOCK, and send it
  to the orchestrator.
  - The same message gives the one-line reason for `|| '{}'` (C2) and the content calendar's move to its own item (C7).
  - The build starts only once it is sent.
  - If the shape changes after that, the new patch and its SHA-256 go out the same way before any push.
- **Fast-forward the branch to the current base.** Run `git merge --ff-only origin/claude/build-platform` (56ed6279 at
  06:19 UTC).
  - The branch has no commit of its own yet.
  - Neither this design's files nor the lockfile differ (`git diff --name-only 165c5993 56ed6279`). So every line
    number here holds, the install stands, and the runs of record test the branch on the base it merges into.

### c1 (red): the identity steps' tests and the value rule

`tools/test/workflows.test.ts`:
- **The pins** in "proves on every pull request, on ubuntu-26.04's image store, the release's identity rules …"
  (`:1794-1824`). These four lines are the patch's test hunk, byte for byte (§9.1):
  - `:1802`: `expect(web.env).toEqual({ BUILT: "${{ fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest'] }}" });`
  - `:1803`: `expect(web.run).toContain('built="$BUILT"');`
  - `:1811`: `expect(worker.env).toEqual({ BUILT: "${{ fromJSON(steps.worker.outputs.metadata || '{}')['containerimage.config.digest'] }}" });`
  - a new line after `:1811`: `expect(worker.run).toContain('built="$BUILT"');`
- **The behaviour test** (§6.1, T2), new, placed after the pins' test.
- **A new top-level describe** after "concurrency groups" (which ends at `:2660`):
  `describe('one environment string under Linux’s 131,072 bytes (docs/adr/0066, Part 3, N29)')`. It holds:
  - T3, T4 and T6 (§6.1);
  - their pure function `unboundedValueProblems`, with its lexer and parser;
  - the table `BOUNDED_VALUES`;
  - the import of `MAX_FILE_BYTES` beside `MAX_OPENED_PER_RUN` (`:13`).

### c2: each identity step takes only the digest it compares

`.github/workflows/ci.yml`. These two hunks are the patch's ci.yml hunks, byte for byte (§9.1).

`:734-736` (web):
```
-        env: { METADATA: "${{ steps.web.outputs.metadata }}" }
+        env: { BUILT: "${{ fromJSON(steps.web.outputs.metadata || '{}')['containerimage.config.digest'] }}" }
         run: |
-          built="$(jq -r '."containerimage.config.digest" // empty' <<< "$METADATA")"
+          built="$BUILT"
```

`:746-748` (worker):
```
-        env: { METADATA: "${{ steps.worker.outputs.metadata }}" }
+        env: { BUILT: "${{ fromJSON(steps.worker.outputs.metadata || '{}')['containerimage.config.digest'] }}" }
         run: |
-          built="$(jq -r '."containerimage.config.digest" // empty' <<< "$METADATA")"
+          built="$BUILT"
```

Everything after `built=` is unchanged. The `-z` branches (`:738-741`, `:752-755`) still report "buildx built nothing
it reported" for a missing key or an empty output (§7). The step names, ids and conditions are unchanged.

The job's header comment (`:654-660`) gains three lines after `:660`. They stay out of #42's hunks, 70 lines away:

```
  # Each identity step takes only the config digest it compares, never the whole metadata output: buildx puts the whole
  # event there, a pull request's description with it, and one environment string over 131,072 bytes stops bash from
  # starting (docs/adr/0066, Part 3, N29).
```

### c3 (red): the build-provenance rule

`tools/test/workflows.test.ts`, in the new describe (§6.1, T5).
- Every `docker/build-push-action` step, matched in lower case, sets `BUILDX_METADATA_PROVENANCE: disabled`.
- No step uses `docker/bake-action`.
- No `run:` passes `--metadata-file`.
- No workflow names `buildx.build.provenance`.

### c4: no build provenance in any metadata output

Each of the seven `docker/build-push-action` steps gains `env: { BUILDX_METADATA_PROVENANCE: disabled }`, as the line
after its `uses:`:
- `ci.yml:680` (web) and `:704` (worker);
- `release.yml:103`;
- `release-dry-run.yml:112`, which `workflows.test.ts:2271-2295` holds equal to release.yml's step;
- `release-capacity.yml:63`;
- `screening-capacity.yml:175` and `:188`.

Each file's comment over its build gains one sentence: "Its metadata output carries no build provenance
(`BUILDX_METADATA_PROVENANCE: disabled`): buildx would put the whole event in it, and in the log (docs/adr/0066, Part
3, N29)."
- The comments are at `ci.yml:676-677`, `release.yml:100-101`, `release-capacity.yml:58-61` and, in
  `screening-capacity.yml`, above `:174`.
- `release-dry-run.yml` has no comment at `:111`, so one line is added there.

### c5: documents

The edits are listed in §8: ADR 0066 (N29, its Date line and Part 3's Deciders), `docs/runbooks/ci.md` and
reconciliation-001.

### What left this change

**The content calendar** moves out to `ci-findings-transport` (§12, P3; C7). These parts of the design before the fold
go with it:
- c5's second half and c6 (`render.ts`, `index.ts` and the check step);
- T7, T8 and the check step's test;
- the ADR 0071 and `content-updates.md` edits;
- the summary written past the bound (the earlier C8).

---

## 5. What does not change

- **The images themselves.** The images, their config digests, `tools/screening-capacity/image-id.ts`, the identity
  comparisons and the worker's load rule.
  - `BUILDX_METADATA_PROVENANCE` acts after the export, on the metadata file alone (`build/build.go:979-985`;
    `provenance.go:26-28`).
  - The exporter response holds the digests either way (§2.3).
- **The release's attestation.** It is `actions/attest-build-provenance` on the capacity report
  (`release.yml:441-446`, `subject-path: …/screening-capacity.json`). It is not attached to the image digests, and not
  to buildx's provenance: the release builds with `provenance: false` (`release.yml:110`).
- **No reader of the provenance.** No step reads `buildx.build.provenance` or the `metadata` output other than
  `ci.yml:734` and `:746`. `git grep "buildx.build.provenance\|outputs.metadata\|BUILDX_METADATA" 165c5993` finds those
  two lines and the pins at `workflows.test.ts:1802` and `:1811`.
- **The content calendar.** Unchanged:
  - `tools/content-calendar/*`;
  - `content-calendar.yml`;
  - ADR 0071;
  - `docs/runbooks/content-updates.md`.

  T6 only names its findings as over the limit (C7).
- **Unchanged otherwise:**
  - the build record that build-push-action uploads, which still carries BuildKit's copy of the event (§11, R4; §12,
    P2);
  - the step summary;
  - the builder's `driver-opts`;
  - every job, required check, permission and timeout.

---

## 6. Tests

### 6.1 The tests

All of these are in `tools/test/workflows.test.ts`. They read the workflows through `CI_ROOT` (`:81-82`).

- **T1, the pins** (c1, §4). They fail at 165c5993 on `toEqual({ METADATA: … })`.
- **T2, the behaviour test.** "starts and passes both identity steps when buildx's metadata is 132,377 bytes, and
  names a missing or other digest (run 40630123457)".
  - **How it runs a step.** It runs each identity step's `run:` as the runner does: `bash --noprofile --norc -e -o
    pipefail`, with `cwd` at the repository root and `RUNNER_TEMP` a scratch directory. `image/web.tar` and
    `image/worker.tar` there are synthetic archives made with `tools/screening-capacity/test-support/image-archive.ts`.
  - **The env** is built from the step's own `env:` by an emulator of exactly two forms:
    - `${{ steps.<id>.outputs.metadata }}` gives the whole metadata;
    - `${{ fromJSON(steps.<id>.outputs.metadata || '{}')['<key>'] }}` gives `JSON.parse(m || '{}')[key] ?? ''`, as
      §2.5 establishes.
  - Any other form fails the test as "a form this emulator does not know".
  - **The metadata** is synthetic, laid out as buildx writes it: a provenance key holding an event whose body is the
    §6.3 ruler, sized to 132,377 bytes, then `JSON.stringify(…, null, 2)` as `src/main.ts:139` does.
  - **The worker step** runs with a stand-in `docker` on `PATH` that answers `load`, `info` (containerd, then classic)
    and `image inspect`. Reuse the stand-in of `:821-868` ("the archive check, run as the runner runs it with a
    stand-in docker") by lifting it to file scope if its answers fit. Otherwise write a stand-in of about ten lines in
    the same style.
  - **The cases:**
    - the digest passes and prints `web: config <digest>` and `worker: config …, loaded as …`;
    - an empty output and a metadata without the key each print `buildx built nothing it reported` and exit 1;
    - another digest prints both digests and exits 1;
    - and the env given to bash, with each name, `=` and NUL, stays under 131,072 bytes.
  - **Every case asserts `result.error` is undefined before it reads `stdout`.** On E2BIG, `spawnSync` sets `error` and
    returns no `stdout` (§2.2). At 165c5993 the base's `METADATA` form gives 132,387 bytes, and the web case fails with
    an AssertionError naming `E2BIG`, the defect itself, not a TypeError.
- **T3, the value rule.** It sits in the new describe, under the name "admits into a step's environment, an input or
  a script only values GitHub, the workflow or the table bounds, read as the runner reads an expression, in every
  workflow".
  - **Where it reads.** For every workflow under `CI_ROOT`, `unboundedValueProblems(file, workflow)` reads each
    `${{ … }}` in:
    - the workflow's `env`;
    - each job's `env`, `outputs`, `strategy` (the matrix), `container`, `services`, `with` and `secrets`;
    - each step's `env`, `with` and `run`.

    It returns its problems and the values it found, for T6. `if:` and `name:` reach no process, and it does not read
    them.
  - **How it reads.** It uses a lexer after the runner's (§2.5):
    - whitespace is skipped before every token outside a string literal;
    - a name followed, after blanks, by `(` is a function;
    - `''` inside a literal is one quote;
    - names, functions and literal keys are compared in lower case;
    - `x['name']` is read as `x.name`;
    - `[`, `]`, `*`, `.` and `,` are tokens of their own.

    A small parser builds the reference chains and the calls. An expression that does not parse is a problem.
  - **What it admits, and nothing else:**
    - literals, and the operators `!`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&` and `||` over admitted operands;
    - `runner.<name>`, `strategy.<name>`, `matrix.<name>`, `job.<name>`, `env.<name>`, `vars.<name>` and
      `secrets.<name>`, one level each (a variable or a secret is at most 48 KB, §2.5);
    - `inputs.<name>` only when the workflow declares that input with `type` `choice`, `boolean` or `number` (C8);
    - `github.<path>` from a closed list, the scalars in use today: `actor`, `base_ref`, `event_name`, `ref`,
      `ref_name`, `repository`, `run_id`, `server_url`, `sha` and `token`; `event.before`, `event.pull_request.number`,
      `event.pull_request.base.sha`, `event.pull_request.head.sha` and `event.repository.private`;
    - `needs.<job>.result`, `steps.<id>.outcome` and `steps.<id>.conclusion`;
    - `steps.<id>.outputs.<name>`, `needs.<job>.outputs.<name>`, `toJSON(needs)` and `toJSON(needs.<job>.outputs)`,
      each as a value T6 must find in its table;
    - `fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest']`, that key pinned, also a T6 value;
    - `fromJSON(<admitted>)` with only literal keys after it (the matrices, §3);
    - `hashFiles(…)` and any other function whose arguments are all literals;
    - `success()`, `failure()`, `always()` and `cancelled()`.
  - **What it refuses**, among everything else:
    - a whole `steps.<id>.outputs.metadata`, in any form or case;
    - `fromJSON` of it without `|| '{}'`, or with any other key;
    - any `*`;
    - any computed index;
    - `toJSON` of anything but `needs` or `needs.<job>.outputs`;
    - any other function taking a context (`format`, `join`, `contains`, …);
    - any `github` path off the list, `github.event` itself included.
  - **`$GITHUB_ENV`.** Every line of a `run:` that names `GITHUB_ENV` must be `echo "<NAME>=…" >> "$GITHUB_ENV"`, with
    `<NAME>` in a closed list. Today the list holds `ENGINE_FREEZE_BASE` alone (`ci.yml:285`, a commit SHA). Any other
    form or name is a problem.
  - **The result.** Each problem names its file, job, step name (or index) and key. The expected result is `[]`. At
    165c5993 it is exactly the two images steps (`ci.yml:734`, `:746`).
  - **The prototype.** `scratchpad/imgdigest/fold/allowlist-proto.mjs` (SHA-256 `e6b40099…f428`) implements these
    rules:
    - at 165c5993 it finds exactly those two problems;
    - on `proof/wf/ci.yml` it finds none;
    - on the workflows of 56ed6279, #42's 46974a25 and #82's b574d4e8 it finds the same two, and the same 65 values.
- **T4, the rule bites.** "refuses each route a value could take whole", on fixture workflows parsed from strings, in
  the style of `:2641-2659`.
  - **Refused**, each named with its file, job, step and key. These are the 25 the prototype refuses:
    - `steps.web.outputs.metadata`, also as `steps.web.outputs.METADATA` and `steps.*.outputs.metadata`;
    - `toJSON(github)`, `toJSON(github.event)`, `ToJson(GitHub.Event)`, `toJSON (github.event)` and `toJSON(steps)`;
    - `github.event`, `github.event.pull_request.body`, `github . event . pull_request . body`,
      `github.event.pull_request['body']` and `github.event.pull_request.title`;
    - `github.event.head_commit.message`;
    - `github['event']` and `github['event']['pull_request']['body']`;
    - `join(steps.web.outputs.*, '')` and `steps.web.outputs[format('meta{0}', 'data')]`;
    - `fromJSON(steps.web.outputs.metadata || '{}')['buildx.build.provenance']`;
    - `fromJSON(steps.web.outputs.metadata)['containerimage.config.digest']`, the hand-over's unguarded form;
    - `toJSON(fromJSON(steps.web.outputs.metadata || '{}'))`;
    - `format('{0}', github.event.pull_request.body)`;
    - `inputs.note` with `type: string`;
    - `toJSON(needs.build)` and `needs.build.outputs[github.ref]`.
  - **Refused in every place.** The first form is also refused in each place T3 reads: a workflow `env`, a job `env`,
    `outputs`, `strategy.matrix`, `container.env`, `services.<id>.env`, a job's `with` and `secrets`, and a step's
    `with` and `run`.
  - **Refused `$GITHUB_ENV` writes:** `echo "BODY=$x" >> "$GITHUB_ENV"` and `cat file >> $GITHUB_ENV`.
  - **Accepted:**
    - the `BUILT` form, also as `FromJSON( steps.web.outputs.metadata || '{}' )[ 'containerimage.config.digest' ]`;
    - `github.event.pull_request.number` and `github['sha']`;
    - `toJSON(needs)`;
    - `runner.temp` and `hashFiles('pnpm-lock.yaml')`;
    - `inputs.runner` with `type: choice`;
    - `echo "ENGINE_FREEZE_BASE=$base" >> "$GITHUB_ENV"`.
  - This test passes at 165c5993 as well: it guards the function and fixes no behaviour of the tree.
- **T5, the build-provenance rule** (c3). Its name: "sets BUILDX_METADATA_PROVENANCE: disabled on every
  docker/build-push-action step of every workflow, and nothing else writes or reads buildx's metadata provenance".
  - **Finding the steps.** It compares `uses:` in lower case: `step.uses?.toLowerCase().startsWith('docker/build-push-action@')`.
    `usesAction` is a case-sensitive prefix (`:254`), so a differently cased `uses:` would escape it. Whether GitHub
    resolves such a `uses:` is not verified, and matching in lower case costs nothing.
  - **The steps found.** It finds seven (`expect(...).toHaveLength(7)`). Each one's `env` has
    `BUILDX_METADATA_PROVENANCE` exactly `'disabled'`, since buildx reads `Disabled` as `min` (§2.3).
  - **What it refuses:**
    - any step whose `uses:`, in lower case, starts with `docker/bake-action@`;
    - any `run:` containing `--metadata-file`;
    - any workflow text containing `buildx.build.provenance`.

    None of these exists today.
  - At 165c5993 it fails on all seven.
- **T6, every value with its bound** (c1). "hands a step another step's or job's output only from the list below, each
  with its bound".
  - **The table.** The values T3 found, as `{ file, job, value }` in lower case, must equal `BOUNDED_VALUES`. Its rows
    are `{ file, job, value, bound }`, where `bound` is a sentence naming the producer and its bound with file and line.
  - **The rows.** There are 67 today (`scratchpad/imgdigest/fold/head-table.tsv`, SHA-256 `c9a89e4c…b0ff`):
    - 53 step outputs used in their own job, the two pinned digest forms among them;
    - 14 values one job hands another.

    The build writes each bound. A new step output or cross-job value anywhere then fails T6 until a reviewed row names
    its bound.
  - **One row is over the limit, and says so.** It is the content calendar notify job's `needs.check.outputs.findings`
    (`FINDINGS_B64`, `content-calendar.yml:78`).
    - Its row carries `over: 'ci-findings-transport'`.
    - The test asserts that this value is over the limit, computing it from `render.ts`'s constant (933,350 today):
      `4 * Math.ceil(MAX_FILE_BYTES / 3) + 'FINDINGS_B64='.length + 1 > 131_072`.
    - It turns red the day that item changes the bound or the transport, and that item then rewrites the row.
    - No other row may carry `over`.
  - The `ci.yml` `toJSON(needs)` row asserts that no ci.yml job declares `outputs`.
  - At 165c5993 it is red: the two pinned digest rows are missing from what T3 finds there.

### 6.2 Failing first

This is the repository's mechanism, as ci-deps and ci-browser ran it (`/home/user/ops/designs/lane-b-ci.md:1244-1252`,
`:2335-2345`). `CI_TREE` reroutes the tests' file reads (`workflows.test.ts:39-41`, `:81-82`):

```
tmp=$(mktemp -d) && git -C /home/user/ci-images-digest archive 165c5993 | tar -x -C "$tmp"
cd /home/user/ci-images-digest && flock /tmp/laneb-heavy.lock env CI_TREE="$tmp" pnpm exec vitest run --project unit \
  tools/test/workflows.test.ts -t '<each name below>'
```

Each of these must be red there with an AssertionError:
- T1;
- T2 (the web case's `spawnSync` error is `E2BIG`, asserted before `stdout` is read; the worker's as well);
- T3 (ci.yml's `images` at `:734` and `:746`);
- T5 (seven steps);
- T6 (the two pinned digest rows missing).

T4 passes there, and the PR says why: it guards its function.

**No second run is needed.** The modules the tests import, `render.ts` and `image-archive.ts`, do not change in this
branch, so `CI_TREE` reaches every behaviour these tests hold. The PR records the red run's counts beside the head's
green.

### 6.3 The CI runs of record

**What the event must carry.** Only a `pull_request` event's payload holds the description, and only `opened`,
`synchronize` and `reopened` start ci.yml (§2.6). So every run of record needs the description over 100,000 characters
at the moment of its push. A comment does not reach the payload, and neither does a file.

**The appendix.** The description is the template's (`.github/pull_request_template.md`), filled as every pull request
is. It ends, before the attribution lines, with a clearly labelled synthetic appendix, collapsed:

```
<details><summary>Length-test appendix (synthetic, 100,061 characters): keeps this pull request's every CI run a run
of record for the 131,072-byte limit; kept until the merge</summary>

<1,000-row ruler>

</details>
```

- **The ruler.** `scratchpad/imgdigest/scripts/appendix.mjs` generates it: a two-line table header and 1,000 rows of
  exactly 100 characters, the newline included. Each row names its number and the appendix's length at its end, for
  example `| 0001 | 0000161 | … | synthetic length-test row, no data |`, and the last row reads `0100061`.
- **Its identity.** It is 100,061 characters with SHA-256
  `5bb5e558463de9bf85c0b6dc560387edbd87a6b45f444d2f6ffe05191a55675f` (generated and measured here). It holds no data
  of any kind. It is plainly a ruler, and a reader can check the length at any row.
- **Why a ruler.** It is the most meaningful content that is still plainly a length test: it measures itself.
- **What the description says about it.** Under "Checks", one paragraph:

  > Every CI run of this pull request is a run of record for the defect: GitHub copies the description into each
  > `pull_request` event, buildx copied that event into its metadata (the root cause, #42's job 122624309161), and
  > the description stays over 100,000 characters until the merge (the synthetic ruler collapsed at the end; SHA-256
  > `5bb5e558…`). Editing a description starts no ci.yml run, so the length is in place before each push, each push's
  > read of it is recorded below, and nobody removes or shortens the ruler before the merge. The merge takes an
  > explicit commit message, which carries none of it.

**Before each push (A7).**
- **Read the description.** Immediately before the push, read it with `pull_request_read get`, and record its length,
  the appendix's SHA-256 and the time. For R0 the read is the create call's own response.
- **Check for edits.** After the push's ci.yml run starts, list the branch's `approval-of-record.yml` runs
  (`actions_list list_workflow_runs`). That workflow runs on `edited` (`approval-of-record.yml:10-11`), so an edit
  between the read and the push would show as a run created in that window. Record that none was, beside the push's
  own run and its head SHA.
- **Where it goes.** Both records go in the PR description's evidence.

**The order of pushes.** A newer push cancels a pull request's older ci.yml run (`ci.yml:19-21`), and its older
screening-capacity run (`screening-capacity.yml:67-68`). So each push waits for the `images` job of the one before it
to finish:
- **R0, red.** Push c1 alone, then open the draft pull request with the whole description, ruler included: the
  `opened` event.
  - `images` fails both identity steps with "Argument list too long". That reproduces #42 on synthetic text and proves
    the ruler crosses the limit.
  - The unit job is red on c1's tests.
- **R1.** Push c2: a `synchronize` event.
  - `images` passes. Both builds' `Metadata` groups still hold the payload, so they measure over 131,072 bytes (§6.4).
  - c1's tests pass.
- **R2, the head.** Push c3, c4 and c5 together, so the measurement below runs once.
  - **The capacity measurement.** c4 changes `screening-capacity.yml`, a watched path (`watched-paths.txt:4`). So from
    this push on, the required `screening-capacity gate` measures: the `capacity` job runs, with `timeout-minutes: 100`
    (`:153`), and its two builds run with the new env (A6).
  - **The images job.** Its log holds no copy of the ruler, and its `Metadata` groups lack `buildx.build.provenance`.
  - **The other runs.** `release-dry-run.yml` runs, since `release.yml` changes, and passes. All four required checks
    pass.
  - **A later push.** A fix-round push measures again, and a push cancels the running measurement before starting its
    own.

**The merge.** Merge with an explicit commit message: "Merge pull request #<n>: <title>", with the title again as its
body. #48's merge (e908c214, the head commit of run 40510094317) has that form, and #77's (ecebdc90, the head of run
40593100120) carries its title only.
- Never take a "title and description" default: it would put the 100,061-character ruler into the build branch's
  history and into every later push event.
- The repository's default merge-message setting was not read (§12, P5).

**If GitHub refuses the length.** If GitHub will not take a description over 100,000 characters (not verified), the
ruler is cut to the longest it takes. R1's `Metadata` groups must still measure over 131,072 bytes. The event's other
parts add about 25 KB (120,430 − 95,445 bytes, §2.1) and the metadata's other keys and indentation about 12 KB more, so
a body of about 94,700 bytes is enough. The orchestrator is told before R0.

### 6.4 Reading a run's sizes from its log

Read the job's log with `get_job_logs` (`return_content`, `tail_lines: 5000`; the tool saves a long result to a file
and returns at most the last 5,000 lines). Record its `original_length`. Then:
- **The `Metadata` group's size.** Take the lines after `##[group]Metadata` up to `##[endgroup]`. Strip each line's
  timestamp prefix (`^\S+Z `), drop the `::stop-commands::` line and the masked `::***::` line, and join with `\n`. The
  result's UTF-8 byte count is the metadata output's size.
- **The body's length.** Parse the result as JSON and take
  `["buildx.build.provenance"].invocation.environment.github_event_payload.pull_request.body`. Its length is the
  event's description.
- **The ruler count.** Count `synthetic length-test row` in the log.
  - It is complete only when `original_length` is 5,000 or less.
  - Otherwise the PR says which first lines went unread, and which steps they belong to, matched by the first line
    read's timestamp against the job's steps (`actions_get get_workflow_job`).
  - Whether a whole job log can be downloaded here (`get_workflow_run_logs_url`) is not verified; the artifact
    download was refused (§2.4).

The scripts are `scratchpad/imgdigest/review/measure.py` and `fold/payload_size.py`. The build copies them to the PR's
evidence.

---

## 7. Local proof (done)

`scratchpad/imgdigest/scripts/local-proof.mjs <worktree> <old ci.yml> <new ci.yml> <out>` takes the web identity
step's `run:` and `env` from each `ci.yml` and runs each script as the runner starts it. The old `ci.yml` is
165c5993's. The new one is `proof/wf/ci.yml`, with §4's lines (c2 and c4's two ci.yml lines).

- **The runner's start.** `/usr/bin/bash --noprofile --norc -e -o pipefail <file>`, with `cwd` the worktree and
  `RUNNER_TEMP` the out directory.
- **The archive.** A synthetic ustar docker archive holding one config blob and `manifest.json`, read by the real
  `tools/screening-capacity/image-id.ts`.
- **The metadata.** It is synthetic, with buildx's keys and nesting (a provenance key holding an event whose body is a
  ruler), pretty-printed as build-push-action prints it. It is 132,377 bytes, so the env string is 132,387 bytes.
  SHA-256 `be1a9dac13ddc3e4ee3b7733f7def70c924900d0359e0f75c5e9b5dcb3571915`.
- **`BUILT`** is computed as the expression yields it: `JSON.parse(m || '{}')['containerimage.config.digest'] ?? ''`.

**The result.** It was re-run at 06:24:25 UTC and saved to `scratchpad/imgdigest/proof/local-proof.txt` (SHA-256
`2001a7ae65ab617abea808056073cb344ecf997adc8c17284e4ef3b61ce902ae`), all five cases. The review's run at 06:08 UTC
(`review/local-proof-rerun.txt`) gives the same.

| Case | Result |
| --- | --- |
| old, `METADATA` = the 132,377-byte metadata | `spawnSync /usr/bin/bash E2BIG` (bash never starts) |
| new, `BUILT` from that metadata | exit 0, `web: config sha256:3fece917…49940` |
| new, empty output (`'' \|\| '{}'`) | exit 1, `::error title=The web archive::its config digest is sha256:3fece917…, and buildx built nothing it reported` |
| new, metadata without the key | exit 1, the same message |
| new, another digest | exit 1, `… and buildx built sha256:1111…` |

---

## 8. Documents

`grep -rn "containerimage.config.digest\|METADATA\|outputs.metadata" docs/` finds two places. Both say what stays true
and need no edit:
- `docs/adr/0062-…md:1428-1430`: "holds image-id.ts's config digest to buildx's own `containerimage.config.digest`";
- `docs/adr/0066-…md:829-831`: the same.

No runbook names `METADATA`. The edits, in c5:

- **ADR 0066, Part 3, a notice after N22** (`:951-965`), before "### Consequences" (`:967`):
  > - **N29** (`co-001/ci-images-digest`, 2026-10-28). The images job's two identity steps take only the config digest
  >   they compare, `fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest']`, never the whole
  >   metadata output.
  >   - **Why.** buildx v0.38.1 copies the whole event into every build record's provenance and, by default, into the
  >     metadata output. On #42's description of 95,324 characters, that output reached 132,377 bytes, 132,387 as one
  >     environment string, over Linux's 131,072 (`MAX_ARG_STRLEN`), so bash never started (job 122624309161).
  >   - **The guard.** The `|| '{}'` keeps an empty output on the step's own message: the runner evaluates a step's
  >     `env` before its `if:`, so no condition could guard it.
  >   - **The builds.** Every `docker/build-push-action` step also sets `BUILDX_METADATA_PROVENANCE: disabled`. No step
  >     reads the provenance, and the event stops being printed in each build's log. The build record, which
  >     build-push-action uploads as an artifact, keeps BuildKit's copy.
  >   - **What holds it.** `workflows.test.ts` reads every expression that reaches a step's environment, an input or a
  >     script as the runner reads it, and admits only a closed list. That list holds values GitHub or the workflow
  >     bounds, and every step output and value one job hands another, each listed with its bound.
  >     - One listed value is over the limit and named so: the content calendar's findings (`FINDINGS_B64`). Their
  >       transport is an item of its own.
  >     - A `$GITHUB_ENV` write names a variable from a closed list.

  The number is N29, after the N23 to N28 of #82's Part 5 (b574d4e8, ADR 0066 lines 1521-1530 there), so no merge order
  collides (C9).
- **ADR 0066's header** (LANES rule 8, `LANES.md:43`):
  - **The Date line** (`:28`) becomes `- **Date:** 2026-10-25; Parts 2 and 3 2026-10-26; N29 2026-10-28`.
  - **Part 3's Deciders** (`:34-37`) gain a sentence after `:37`: "N29 is made under the same ruling of 2026-10-26, for
    the item Lane A's orchestrator handed Lane B on 2026-10-28 at 05:45 UTC (reconciliation-001)."

    The ruling is already named there for ci-browser's choices. The sentence ties N29 to it.
- **`docs/product/reconciliation-001.md`**, after the 2026-10-26 ruling's last bullet (`:657`; after #82's paragraph
  once both have merged). A paragraph and one bullet, in #82's form:
  > Under the same ruling of October 26, 2026 (about 00:20 UTC), the item Lane A's orchestrator handed Lane B on
  > October 28, 2026 (05:45 UTC), `images` refusing a long pull-request description (#42's job 122624309161), is taken,
  > each choice its recommended and safer option (`co-001/ci-images-digest`, `docs/adr/0066`, Part 3, N29):
  >
  > - **The identity steps, the builds and the rule:**
  >   - Each identity step takes only the config digest it compares, guarded against an empty output (C1, C2).
  >   - Every `docker/build-push-action` step sets `BUILDX_METADATA_PROVENANCE: disabled`, and the builder's
  >     `provenance-add-gha` stays (C3, C4).
  >   - `workflows.test.ts` admits into a process only a closed list of values, each step output and cross-job value
  >     with its bound. The content calendar's findings are recorded over the limit, and their transport is its own
  >     item (C5 to C8).
  >   - The run of record is a `pull_request` run whose description is over 100,000 characters, run <id> on #<n> (C11).
  >   - Not an exception to a check above.

  The build fills `<id>` and `<n>`.
- **`docs/runbooks/ci.md`:**
  - In the failure list's `images` item (`:125-126`), add a sentence: "An identity step's `::error` names the archive's
    config digest and the one buildx reported ("nothing it reported" when the metadata lacked it); "Argument list too
    long" on any step means a value over 131,072 bytes reached its environment, which `workflows.test.ts` refuses for
    every value it does not list with its bound (docs/adr/0066, Part 3, N29)."
  - In "Changing CI", add a bullet after `:393-394` (the required-check bullet; the design before the fold said
    `:392-393`): "A step takes only the value it uses
    (one environment string stops at 131,072 bytes). `workflows.test.ts` reads every expression in an env, an input,
    a script, a job's outputs or a matrix as the runner does, and admits only bounded values. Never use a build's
    whole metadata, an event object, a description or title, or `toJSON` of anything but `needs`. A new step output or
    value one job hands another joins its list with its bound, and a new `$GITHUB_ENV` variable joins its closed list.
    Every `docker/build-push-action` step sets `BUILDX_METADATA_PROVENANCE: disabled` (docs/adr/0066, Part 3, N29)."
- **No test-matrix row** (C10).

---

## 9. Interplay

### 9.1 #42 (head 46974a25, open; read only)

- **#42 today.** #42 changes none of `.github/workflows/*`, `tools/test/workflows.test.ts`, ADR 0066 or
  `docs/runbooks/ci.md`: `git diff --name-only a6e754fc 46974a25` lists none of them, and a6e754fc is its merge base with
  165c5993.
  - It does change `reconciliation-001.md`, adding ten lines after `:640`. This branch's lines go after `:657`, so the
    trial merge is clean (A9).
  - Its head still holds the `METADATA` lines (`ci.yml:734`, `:736`, `:746`, `:748`; 06:20 UTC), so #42 is blocked on
    this defect now.
- **What #42 ports.** Exactly three hunks, in one patch file, `scratchpad/imgdigest/handoff/42-port.patch`: 49 lines,
  3,456 bytes, SHA-256 `8cf981fbd42a39a00357c293454440774c101699f2cd96a55dc5e0b28eec221f`.
  - `ci.yml`, the web hunk (`:734-736`: the env line and the `built=` line, §4 c2);
  - `ci.yml`, the worker hunk (`:746-748`, the same);
  - `tools/test/workflows.test.ts`, the pins (`:1802`, `:1803` and `:1811` replaced, one line added after `:1811`; §4
    c1).
- **How the patch is made.** For each file, ci.yml first, it runs `diff -u --label a/<path> --label b/<path> <old>
  <new>`, run in `scratchpad/imgdigest/handoff/`. That form has no timestamps, so the same input gives the same bytes.
  - `git apply --check` passes at 165c5993, at 56ed6279, at #42's 46974a25 and at #82's b574d4e8 (06:28 UTC).
  - The build's c1 and c2 hold these lines byte for byte. Their other hunks (T2 to T6, the header comment) sit at least
    70 lines away.
- **When #42 gets it.** Before the build starts, not at A8. Two reasons:
  - The hand-over's line, `fromJSON(steps.web.outputs.metadata)['containerimage.config.digest']`, lacks `|| '{}'` and
    the fourth pin. If Lane A ported it first, both PRs would change the same lines differently, and the PR merged
    second would conflict.
  - T3 refuses that form (T4). It fails a skipped step with a JSON error instead of skipping (C2).
- **What goes with it.** The status file's RESUME-BLOCK and the message to the orchestrator carry the patch and its
  SHA-256, the one-line reason for `|| '{}'`, and the content calendar's move (C7). If the shape changes after that, the
  new patch goes out the same way before any push.
- **Either merge order is clean.** Git takes an identical change on both sides without a conflict. After #42's port,
  A8 regenerates the patch from the port commit and compares SHA-256s, then runs `git merge-tree` on the two heads.
- **#42 does not need the rest.** If this branch merges first, #42's own merge of the build branch brings everything
  else. If #42 merges first, nothing else of this branch touches its files except reconciliation-001, which merges
  cleanly.

### 9.2 #82, `co-001/ci-pin-age` (head b574d4e8, open draft, base 0dd1ba7e; read only)

#82's head is b574d4e8 (`git ls-remote`, 06:19 UTC). Its hunks in the shared files (`git diff -U0 0dd1ba7e b574d4e8`):

| File | #82's hunks | This branch's | Result |
| --- | --- | --- | --- |
| `ci.yml` | `@@ -10,7` (the permissions comment, `:13`); `@@ -81,10` (Action pins' comment and its `env` gaining `GITHUB_TOKEN`) | `:660` (+3 comment lines), `:676-704` (comments, two `env` lines), `:734-736`, `:746-748` | No overlap; clean |
| `workflows.test.ts` | `@@ -1315,13` (+7: `github.token` named once, and `expect(text).not.toMatch(/secrets\.\|github\[\|toJSON\(\s*(?:github\|secrets)\b/)` on ci.yml); `@@ -1393,12` (the static step loop) | `:1802-1812`, a new test after `:1824`, a new describe after `:2660` | No overlap; clean |
| ADR 0066 | Status `:4-5`; Date `:28` (replaced, with Part 5's amends before it); Deciders and PRD lines inserted after `:31` and `:44`; `:121`, `:454`; Part 5 appended after `:1258` (N23 to N28) | Date `:28`; a sentence after `:37`; N29 after `:965` | **Conflict at `:28`**: both edit the Date line. The rest is clean. |
| `reconciliation-001.md` | a paragraph and one bullet appended after `:657` | a paragraph and one bullet appended after `:657` | **Conflict**: both append at the same place |
| `docs/runbooks/ci.md` | `@@ -26`, `-93`, `-100`, `-374`, `-387`, `-398` | after `:394` (three unchanged lines before `-398`'s hunk), `:125-126` | No overlap; clean |

- **How the second keeps both.** The PR merged second merges the build branch in and keeps both sides' lines (rule 6,
  `LANES.md:34`):
  - the Date line reads `2026-10-25; Parts 2 and 3 2026-10-26; Part 5 2026-10-28; N29 2026-10-28`, or #82's order if
    it merged first;
  - reconciliation-001 keeps #82's paragraph, then this one.

  It then runs `pnpm exec vitest run tools/test/workflows.test.ts` on the merged tree.
- **The tests hold either way.**
  - #82's ci.yml assertion holds on this branch's ci.yml, which adds no `toJSON(`, no `github[` and no
    `github.token`. Checked: `github\.token` appears once, and there is no `secrets\.|github\[|toJSON\(\s*(?:github|secrets)\b`.
  - T3 and T6 hold on #82's workflows: `${{ github.token }}` is on the closed list, and the prototype finds the same 65
    values at b574d4e8 (§6.1).
- **If #82 renumbers its notices** in its fix round, the PR merged second renumbers N29 to follow them.
- **Shared machine.** #82's fix round shares this machine and its lock. Every heavy command here runs under `flock
  /tmp/laneb-heavy.lock`.

### 9.3 The base moved

`claude/build-platform` is 56ed6279 (#81, merged 05:37:48 UTC; `git ls-remote` at 06:19 UTC).
- None of this design's files changed (`git diff --name-only 165c5993 56ed6279`, 27 files). Nor did the lockfile.
- The build fast-forwards to it before c1 (§4).
- A8 and A9 run against the base current at the time.
- Before the merge, the latest base is merged in with a merge commit (rule 6, `LANES.md:32`).

---

## 10. Choices, with their reasons

- **C1. Take only the digest in the expression, not `imageid` and not the whole metadata.**
  - `fromJSON(…)['containerimage.config.digest']` names the exact key the check compares.
  - build-push-action's `imageid` output (`--iidfile`) would compare the same value today, but when the config digest
    is absent buildx substitutes the manifest digest (`commands/build.go:469-475`). The `-z` branch's "nothing it
    reported" would then become a misleading mismatch.
  - Keeping the whole metadata and only shrinking it (C3 alone) would leave a step whose env grows with whatever buildx
    adds next.
- **C2. `|| '{}'` inside the expression, no `if:` guard.**
  - The runner evaluates `env` before `if:` (§2.5), so an `if:` cannot keep `fromJSON('')` from failing a step that
    should have been skipped. A failed or cancelled build leaves its `metadata` output empty.
  - **Without the guard**, which is the hand-over's form, an identity step whose build failed, or ran when the run was
    cancelled, fails with a JSON error (`FromJson.cs:16-21`) instead of skipping.
    - The web build can fail while the worker's steps run on (`:703`).
    - The job is already failing or cancelled then, so its conclusion is the same either way.
    - The cost is a misleading annotation, not a wrong verdict.
  - **With `'{}'`**, an empty output yields `''`, which either skips cleanly or reaches the `-z` branch's own message.
  - Invalid JSON still fails the step, closed.
  - This changes the orchestrator's suggested line by those six characters only. The tests add a fourth pin, the
    worker's `built="$BUILT"`. #42 gets both as one patch before the build (C12).
- **C3. `BUILDX_METADATA_PROVENANCE: disabled`, taken, on all seven build steps.** Taking it on only the pull-request
  workflows was rejected, and so was not taking it.
  - It removes the event from the only output a step reads and from the log, twice per job.
  - It changes nothing any step reads, nor the image (§5).
  - It skips a history read per build: `#24 resolving provenance for metadata file`.
  - **Why all seven.** Push, tag and dispatch events carry their own unbounded text, such as commit messages. One rule
    ("every step") is simpler to hold and to read than a rule by trigger. And `release-dry-run.yml` must equal
    `release.yml` step for step anyway.
  - `disabled` is the documented name, preferred over `false` and `0`. It must be exact (§2.3).
- **C4. Not `provenance-add-gha=false`.** It would stop BuildKit from receiving the event at all, the uploaded build
  record included, but:
  - it changes the builder's `driver-opts`, which `workflows.test.ts:2805-2807` holds to exactly `image=…@sha256:…` and
    which #82's image rule parses;
  - it drops the run's GitHub context from release build records, which a person may read;
  - buildx's own reference documents nothing about it: `git grep` at v0.38.1 finds it in the source only.
  - What it would remove beyond C3, the artifact copy, reaches no one who cannot already read the description.
  - Recorded as P2.
- **C5. A static rule over every workflow, as an allowlist over tokens read as the runner reads them.**
  - **Why a rule over every workflow.** The defect is a class: any whole output or event object in any env. The rule
    reaches `with:` inputs too, since they are `INPUT_*` env (§3), as well as scripts, job outputs, matrices and
    `$GITHUB_ENV`.
  - **Why an allowlist.** A denylist of patterns can be slipped past: by whitespace (`toJSON (github.event)`), by case,
    by a wildcard (`join(steps.web.outputs.*, '')`), by a computed index, by another key of the metadata, or by any
    other whole output (§2.5). A closed list makes every new form a reviewed one, and the runner's own lexing rules
    leave no spelling outside it.
  - **Why not a regular expression after removing whitespace.** That still misses computed indexes and wildcards, and
    it cannot tell a literal key from a string inside one.
- **C6. One table for every step output and every value one job hands another, each with its bound.**
  - That is how `FINDINGS_B64` slipped through: a bound chosen for a job output, never for the environment.
  - The metadata output was a step output, not a cross-job value. So the table covers both, one rule for one class.
  - The content calendar's row says it is over the limit, and the test asserts that it is (C7).
  - Leaving the cross-job values out of the table, as the review's S4 proposed, would leave T3 either refusing them
    all, and failing today, or admitting any `needs.<job>.outputs.<name>` whole: the route S2 closes.
- **C7. The content calendar's transport is its own item, `ci-findings-transport`; this change only names it.**
  - **The bound this design first proposed (98,292 bytes) was below the job's own capacity.**
    - The notify job opens up to `MAX_OPENED_PER_RUN = 20` issues a run (`render.ts:15`), each body up to
      `MAX_BODY = 6_000` characters (`:16`), counted as `MAX_BODY + 60` bytes by the file test
      (`content-calendar.test.ts:580`).
    - So ⌊98,292 / 6,060⌋ = 16 fit, while 20 need about 121,200 bytes.
    - The earlier claim that the bound "keeps every property" was false.
  - **The right fix is a transport choice under ADR 0071**, whose owner decides what an issue says. The candidates are
    fixed `FINDINGS_B64_0` to `_3`, or an artifact read with `gh run download`. Both are weighed in P3.
  - **Scope.** The hand-over asks for a minimal change with a stable shape, and an improvement outside this change's
    files is a proposal. The content calendar's files are outside them.
  - **The defect is latent.** The last scheduled run, 40510094317, succeeded (§3). Today's code already files nothing
    on a day past 98,292 bytes, so waiting for its own item loses nothing that is filed now.
  - **What stays here.** T6 names its row as over the limit, owned by `ci-findings-transport`. That item must change
    the row when it changes the bound or the transport.
- **C8. `inputs` admitted only when its declared type bounds it** (`choice`, `boolean`, `number`). A `string`
  dispatch input has no bound read from GitHub's docs. The one 65,535-character limit found is `repository_dispatch`'s,
  and it counts characters, not bytes (§2.5). Today no input reaches a process. `screening-capacity.yml:31-36`'s
  `runner` is a `choice`.
- **C9. Notice N29 in Part 3, not a new Part.** The fix belongs to ci-browser's identity steps (Part 3), and the task
  asked for a Part 3 notice if its numbering allows.
  - It does: notices are numbered across the ADR, and #82 holds N23 to N28.
  - N29 collides with nothing in either merge order.
  - It is ADR 0066's own sequence, not an ADR or test-matrix number, so no counter request.
  - The Date line and Part 3's Deciders record it (LANES rule 8). The Status line is left alone: N29 names its branch
    itself, and a Status edit would add a third conflict with #82 for no information.
- **C10. No test-matrix row.** The rules guard CI's wiring, as "concurrency groups" (`workflows.test.ts:2634-2660`) and
  "workflows all parse" (`:468`) do, which have no row either. A row would need a counter, a synth case and a shared
  document edit beside #42's and #82's (`test-matrix.md:255-286`), and it would add no assertion.
- **C11. Red runs of record (R0) as well as green ones.** R0 proves on this pull request's own event that the ruler
  crosses the limit. Without it, the proof rests on #42's run and a computation. It costs one red run on a draft.
- **C12. #42 gets the exact patch before the build, with its SHA-256.** #42 is blocked on this defect now, and the
  hand-over's line differs from this design's. Sending the patch first is the only order in which Lane A's port cannot
  diverge (§9.1).
- **C13. c3, c4 and c5 in one push (R2).** c4 starts the required capacity measurement, of up to 100 minutes. c5 changes
  documents only, so a separate push would only cancel and restart that measurement.

---

## 11. Risks and rollback

- **R1. A metadata output that is not JSON.** The env expression fails, so the step fails, closed. buildx writes JSON
  by construction (`src/main.ts:139`).
- **R2. GitHub refuses a description over 100,000 characters.** This is not verified. The fallback is in §6.3, and the
  orchestrator is told before R0.
- **R3. #42's port differs by a byte.** The second merge then conflicts in those lines, and the conflict is trivial to
  resolve. Mitigation: #42 gets the patch file and its SHA-256 before the build (C12), and A8 compares SHA-256s.
- **R4. The uploaded build record still carries the event**, an artifact readable by anyone who can read the pull
  request, for the artifact's retention. There is no new exposure: the description is in the pull request itself. P2
  covers it.
- **R5. A push's payload carries commit messages.** A push run's `images` was never at risk with the fix (it takes 71
  characters). Without the fix, a merge with very long commit messages could also have crossed the limit. The merge's
  explicit message (§6.3) keeps the ruler out of the build branch's history.
- **R6. The content calendar stays as it is** until `ci-findings-transport` lands. On a day whose findings file passes
  98,292 bytes, its notify job cannot start bash, as today. T6 keeps that written down, and P3 carries the fix.
- **R7. `release-capacity.yml` runs only on schedule and dispatch,** so no pull-request run exercises its new `env`.
  - The step's form is identical to the six others. ci.yml's two and screening-capacity's two run on this pull request
    (A6), and release-dry-run's runs too.
  - After the merge, the first proof comes either from a `workflow_dispatch` of `release-capacity.yml` (any person with
    write access) or from the next Tuesday run. The status file records which.
- **R8. The capacity measurement runs on every push from R2 on** (up to 100 minutes, required). Pushes are batched
  (C13), and each waits for the one before it to finish its `images` job.
- **R9. An edit between the read and a push** would change the event unseen. The approval-of-record trail shows it
  (§6.3), and the push is then repeated after a fresh read.
- **R10. T6's table must be kept.** Every new step output or cross-job value needs a row. That is the intent: each one
  is a reviewed value with a stated bound. The failure names the missing row.
- **Rollback.** Revert the merge commit. Each concern is its own commit, so c4 (the build env) can be reverted alone.
  Reverting c2 brings the defect back for any description over about 94 KB.

---

## 12. Proposals, outside this change

- **P1. `publish-content.yml:55`** interpolates `steps.publish.outputs.releases` into its script. It is bounded and
  only release numbers, but an env value is the hygienic form. The file is frozen to its copy under the founder's F4
  (`workflows.test.ts:2347-2361`), so this is the founder's call.
- **P2. The build-record artifact.** For pull-request runs, either `DOCKER_BUILD_RECORD_UPLOAD: false` on the build
  steps or `provenance-add-gha=false` on the builder. Weigh the record's use to a person reading a failed build against
  carrying the event, and the latter against `:2805-2807` and #82's image rule.
- **P3. `ci-findings-transport`, an item of its own** (C7), with its own claim, design and reviewer, under ADR 0071's
  owner. It starts from what this design and its review found.
  - **The defect.** `FINDINGS_B64` can reach 933,336 characters (§3). Any findings file over 98,292 bytes stops notify
    before bash starts, and it files nothing.
  - **The property to hold in a test, whatever the transport:**
    `MAX_OPENED_PER_RUN × (MAX_BODY + overhead) + the titles of the rest ≤ the transport's capacity`. The capacity is
    computed from 131,072 bytes per environment string and 1 MB of job outputs counted as UTF-16.
  - **The candidates:**
    - fixed `FINDINGS_B64_0` to `_3`, each at most 131,056 characters, which holds about 60 full findings under the
      1 MB output limit;
    - or an artifact read with `gh run download "$GITHUB_RUN_ID" -n findings`. That keeps notify free of `uses:`
      (`workflows.test.ts:1124`), since `gh` already runs there (`content-calendar.yml:86`, `:94`, `:123`), and it
      needs `actions: read`. Whether a running run's own v4 artifact downloads through the API is not verified.
    - A total budget for bodies, cutting every body further when the file would pass its bound, changes what an issue
      says.
  - **Carried from this design:**
    - write `summary.md` before `findingsJson`, so a check stopped at the bound still names every finding;
    - the check step appends the summary whenever it was written, then exits with the CLI's status;
    - a test of the failure message expects the bound without separators, since `findingsJson` prints
      `String(MAX_FILE_BYTES)` (`render.ts:132`): "over 98292", not "over 98,292" (the review's N7);
    - T6's `over` row, which that item rewrites.
- **P4. ADR 0066's notice numbers.** Part 4 reuses N4 and N5 (`:1226-1228`), and Part 2 also has an N5 (`:672`). A
  renumbering would need every reference found first. Recorded only.
- **P5. The repository's merge-message default.** It was not read here. If the founder sets merge commits to "Default
  message" or "Pull request title", no long description can reach the build branch's history through a merge.
  Settings are the founder's.

---

## 13. Corrections to the hand-over

- **"buildx writes `buildx.build.provenance` into that metadata even with `provenance: false`."** Confirmed. The source
  is precise about why: buildx's docker-container driver hands BuildKit the event for every build record
  (`driver.go:177-185`), and buildx's default `min` mode keeps the invocation's environment
  (`provenance.go:139-143`).
- **"BUILDX_METADATA_PROVENANCE … drops the event payload from the metadata and from the logs, where the description is
  printed four times per run."** Two of the four copies are the builds' `Metadata` groups, which it removes. The other
  two are the identity steps' `env:` display, which c2 removes. The step summary never prints it (§2.4).
- **"release.yml uses actions/attest-build-provenance on pushed digests."** It attests the capacity report
  (`release.yml:441-446`). The images carry no attestation (`provenance: false`, `:110`).
- **"132,387 bytes."** That size includes the name and the NUL: the value is 132,377 bytes and the string is 132,387.
- **The suggested line.** It gains `|| '{}'` (C2), and the pins gain a fourth line. #42 gets the exact patch before
  the build (C12).
- **"a new test that no step's env takes a whole steps.*.outputs.metadata or any github.event object."** It becomes an
  allowlist, read as the runner reads an expression, over every place a value reaches a process. A pattern test could
  be slipped past (C5).

---

## Appendix: commands and files

All of these are under `/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/imgdigest/`:

- `joblog/job-122624309161.txt`, #42's job log (its last 5,000 of 5,400 lines);
- `scripts/e2big.sh` and `scripts/e2big_errno.py`, the limit;
- `scripts/inventory.mjs` and `inventory.tsv`, §3;
- `scripts/local-proof.mjs`, `proof/wf/ci.yml`, `proof/run/` and `proof/local-proof.txt`, §7;
- `scripts/appendix.mjs` and `proof/appendix.md`, §6.3;
- `src/{buildx,buildkit,bpa,toolkit,runner,ghdocs}`, the blobless clones read in §2;
- `review/measure.py` and `review/local-proof-rerun.txt`, the review's;
- `fold/allowlist-proto.mjs`, `fold/head-table.tsv` and `fold/table-<commit>.tsv`, T3's and T6's prototype and rows;
- `fold/payload_size.py`, §2.1's sizes; `fold/design-before-fold.md`, this design before the fold;
- `handoff/42-port.patch`, #42's patch, with `handoff/{old,new}` its inputs;
- `progress/design.progress.md`, `progress/review.progress.md` and `progress/fold.progress.md`, the notes.

---

## Review (2026-10-28)

The adversarial review, `designs/lane-b-ci/ci-images-digest-review.md` (saved 06:17 UTC), was folded in between 06:19
and 06:37 UTC. Each finding was re-checked against the code and the sources before the design changed. The evidence is
in `scratchpad/imgdigest/progress/fold.progress.md` and `fold/`.

**Totals.** There are 16 items: 6 findings (S1 to S6), 10 notes (N1 to N10) and no blocker.
- 14 are fixed as the review recommends. Two of them carry a refinement: S2 and S5.
- 1 is fixed in part, with evidence for the rest: S4.
- 1 moves with the content calendar: N7.
- None is rejected.

- **S1, fixed.** The patch is built: `handoff/42-port.patch`, SHA-256 `8cf981fb…221f`. It applies at 165c5993,
  56ed6279, 46974a25 and b574d4e8. It goes out before the build (§4, §9.1, C12). C2 now says the cost is an annotation,
  not a verdict. A8 compares SHA-256s, and T4 refuses the hand-over's unguarded form.
- **S2, fixed, refined.** T3 is a token-level allowlist after the runner's lexer, over every place S2 lists, with the
  `$GITHUB_ENV` closed list. The prototype finds exactly the two images steps at 165c5993, and T4 takes each bypass.
  - One correction: `inputs` is not "bounded by GitHub". No dispatch-input limit was found, and the 65,535 is
    `repository_dispatch`'s and in characters. So only `choice`, `boolean` and `number` inputs are admitted (C8).
  - Three additions: `needs.<job>.result` and `steps.<id>.outcome|conclusion` are admitted, and so is `fromJSON` of
    an admitted value, for the matrices.
- **S3, fixed.** C7's "keeps every property" is withdrawn, since ⌊98,292 / 6,060⌋ = 16 < 20 (`render.ts:15-16`,
  `content-calendar.test.ts:580`). Its numbers and its property test go to `ci-findings-transport` (P3).
- **S4, fixed in part.** Every content-calendar change leaves this PR for `ci-findings-transport` (§4, "What left this
  change"). The cross-job rows stay in T6's one table, because S2's own fix needs them and leaving them out would admit
  any `needs` output whole. The content calendar's row is asserted over the limit, not allowed (C6, C7).
- **S5, fixed, refined.** It adds a reconciliation-001 paragraph and bullet, ADR 0066's Date `; N29 2026-10-28`, and a
  Part 3 Deciders sentence. Part 3 already names the ruling, so the sentence ties N29 to it. A9 expects the `:28` and
  reconciliation-001 conflicts with #82 and finds #42's clean.
- **S6, fixed.** Each push is preceded by a description read (length, appendix SHA-256 and time), and the
  approval-of-record `edited` trail shows no edit before the push (§6.3; A7). R1's log stays the run of record that
  proves the fix.
- **N1, fixed.** `original_length` is 5,400; the saved log is its last 5,000 lines (re-read at about 06:22 UTC). §2.1
  is corrected. A6 and §6.4 count the ruler as complete only at 5,000 lines or fewer.
- **N2, fixed.** Case and whitespace are cited from `ExpressionConstants.cs:37`, `ExpressionParser.cs:426-427`,
  `DictionaryContextData.cs:77` and `LexicalAnalyzer.cs:21-25`, `:187-198` (§2.5). "not verified" is removed.
- **N3, fixed.** `proof/local-proof.txt` is re-run at 06:24:25 UTC with all five cases (SHA-256 `2001a7ae…02ae`).
- **N4, fixed.** The base is 56ed6279, and none of the design's files or the lockfile changed. The build fast-forwards
  before c1, and A8 and A9 run against the current base (§9.3).
- **N5, fixed.** The capacity measurement is planned (R2, C13, R8). Its two builds are named in A6.
- **N6, fixed.** T5 matches `uses:` in lower case. It refuses `docker/bake-action` and any `run:` with
  `--metadata-file`.
- **N7, moved.** The content calendar's T7 left with S4. P3 carries "over 98292" for `ci-findings-transport`.
- **N8, fixed.** T2 asserts `result.error` first. On E2BIG, Node 24.22.0 gives `error.code` `E2BIG` and no `stdout`
  (§2.2).
- **N9, fixed.** The size is 120,430 bytes, compact UTF-8, with the method named. 121,550 is not reproduced (§2.1).
- **N10, fixed.** The merge takes an explicit message in #48's form (§6.3). The repository default was not read (P5).
