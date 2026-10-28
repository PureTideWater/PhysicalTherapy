# Lane B: ci-images-digest, adversarial review of the design

Review of `/home/user/ops/designs/lane-b-ci/ci-images-digest.md` (825 lines, written 05:20 to 06:05 UTC), done
2026-10-28 between 06:00 and 06:30 UTC by Lane B (session_01UzQ6wgZgtThBRBxXTFYhRB). Line numbers are at 165c5993
(`/home/user/ci-images-digest`) unless a line says otherwise. Sources: the runner at tag v2.338.2 (d1eb12d), buildx
v0.38.1 (0dbe87f3) and build-push-action v7.4.0 (c3c9e263), the blobless clones under
`scratchpad/imgdigest/src/`; #42's job 122624309161 (the design's saved log, plus a fresh `get_job_logs` read at
06:12 UTC); `git ls-remote` at 06:04 UTC; the content-calendar run list read at 06:10 UTC. My scripts and outputs are
under `scratchpad/imgdigest/review/` (the scratchpad is
`/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad`).

**Verdict.** There is no blocker. The images fix (c1, c2), `BUILDX_METADATA_PROVENANCE` (c3, c4) and the local proof
hold. Six findings should change the design before the build:
- S1: hand #42 the changed shape now;
- S2: make T3 an allowlist over tokens;
- S3 and S4: take the content calendar out into its own item, because its new bound is below its own per-run capacity;
- S5: record the ruling in reconciliation-001 and ADR 0066's header;
- S6: make A7 measurable after c4.

Ten notes follow.

**LANES.md check: holds.** Nothing the design changes is on the "Not while #42 is open" list (`LANES.md:84-91`):
`.github/workflows/*`, `tools/test/workflows.test.ts`, `tools/content-calendar/*`, ADR 0066 and 0071,
`docs/runbooks/ci.md` and `content-updates.md`. T2 only reads `tools/screening-capacity/test-support/image-archive.ts`,
which is not `{run,report}.ts`. S5 adds `docs/product/reconciliation-001.md`, which #42 also changes
(`git diff --name-only a6e754fc 46974a25`). It is a rule 6 shared document (`LANES.md:34`, `:93`), not a listed file.

---

## What I checked and found true

- **The defect's numbers.** In #42's job, the web `Metadata` group is 132,377 bytes and the worker's is 132,383, with the
  log prefixes, the `::stop-commands::` line and the masked `::***::` line removed. The body is 95,324 characters, and
  the keys are as listed. The errors are at saved-log lines 4287 and 4914
  (`scratchpad/imgdigest/review/measure.py`).
- **The runner evaluates a step's `env` before its `if:`, and an error fails the step.**
  `src/Runner.Worker/StepsRunner.cs:114-138`, then the condition at `:203-237`. No earlier skip exists for cancelled
  jobs: every dequeued step goes through `:79-138`. So C2's `|| '{}'` is needed for an honest message.
- **`||` returns the first truthy operand's value**, not a boolean (`Expressions2/Sdk/Operators/Or.cs`, `EvaluateCore`).
- **`fromJSON` uses Newtonsoft's `JToken.ReadFrom`** (`Sdk/Functions/FromJson.cs:16-21`). Object keys go through the
  indexer, so a duplicate key replaces the earlier one instead of throwing (`JTokenExtensions.cs`,
  `subContext[property.Name] = …`).
- **A missing key is null** (`Index.cs:148-180`, `HandleObject`), and an env value must be a string (`PipelineTemplateConverter.cs:162`).
  An empty output, a missing key or a non-object JSON therefore reaches the `-z` branch. A non-JSON output fails the
  step, closed.
- **`BUILDX_METADATA_PROVENANCE`.**
  - `disabled` returns before the history read (`build/provenance.go:26-28`).
  - `buildx.build.ref` is still written (`build/build.go:980`), so build-push-action's reference, summary and record
    export still work (`src/main.ts:241-258`).
  - The env reaches buildx (`src/main.ts:104-108`).
  - The parse is case-sensitive: `Disabled` would mean `min` (`util/confutil/metadata.go:30-40`), so T5's exact
    `'disabled'` is right.
  - The images, the digests, the identity checks and `attest-build-provenance` (`release.yml:441-446`, on the capacity
    report) are untouched.
- **No step reads the metadata output** other than `ci.yml:734` and `:746`
  (`git grep "buildx.build.provenance\|outputs.metadata\|BUILDX_METADATA" 165c5993` finds those two lines and the pins
  at `workflows.test.ts:1802` and `:1811`).
- **The local proof reproduces.** I re-ran `scripts/local-proof.mjs` on the base's ci.yml and `proof/wf/ci.yml`:
  - the old step gives E2BIG;
  - the new step exits 0;
  - an empty output, a missing key and another digest each exit 1 with the step's own `::error`.

  The output is in `scratchpad/imgdigest/review/local-proof-rerun.txt`; N3 covers the saved copy.
- **#82** is still at b574d4e8 (`ls-remote`, 06:04 UTC).
  - Its ci.yml assertions hold on this branch's ci.yml: `github\.token` once, and no
    `secrets\.|github\[|toJSON\(\s*(?:github|secrets)\b`.
  - Its ADR 0066 Part 5 holds N23 to N28 (lines 1521-1530 at b574d4e8).
- **Every file this design changes** is identical at 165c5993, 0dd1ba7e and 46974a25
  (`git diff --stat` is empty for each pair).

---

## Findings

### S1. #42's port no longer matches the line it was handed; send it the exact patch now, not at A8

- **Evidence.**
  - The hand-over's fix, as #42 will port it, is
    `fromJSON(steps.web.outputs.metadata)['containerimage.config.digest']`
    (`approval-summaries/lane-b-ci-images-digest-status.md`, "Recommended fix").
  - The design changes it to `… || '{}')…` and adds a fourth pin line, `expect(worker.run).toContain('built="$BUILT"')`
    (§4 c1, c2).
  - #42 is blocked on this defect now: its head 46974a25 (06:04 UTC) still has the `METADATA` lines.
  - The design gives #42 the patch only at build time (§9.1, "The build hands #42 the three hunks as one patch file").
- **Failure.** If Lane A ports the hand-over's line first, both PRs change ci.yml `:734`, `:736`, `:746` and `:748` and
  `workflows.test.ts:1802-1811` differently, so the PR merged second conflicts.
  - #42's form also turns a skipped identity step into a failed one with a JSON error whenever the web build fails or
    the run is cancelled.
  - That error comes from `fromJSON('')` (`FromJson.cs:17-21`) and is evaluated before `if:`
    (`StepsRunner.cs:114-138`).
  - The job's conclusion is the same either way: it is already failing or cancelled. So the cost is a misleading
    annotation, not a wrong verdict, and C2's text should say that plainly.
- **Fix.**
  - Before the build starts, write the patch to the status file's RESUME-BLOCK and send it to the orchestrator. The patch
    is the two ci.yml hunks plus the pins hunk, with `|| '{}'` and the fourth pin. Record its SHA-256 with it.
  - In the same message, give the one-line reason for `|| '{}'`.
  - A8 then compares #42's port to that SHA-256.
  - Do not change the shape after review without sending the new patch the same way.

### S2. T3 can be slipped past; make it an allowlist over a token stream, and close the other routes into a process

- **Evidence.** The runner's lexer, `Expressions2/Tokens/LexicalAnalyzer.cs` at v2.338.2 (read with `git show`):
  - It skips whitespace before every token (`:21-25`).
  - It treats a name as a function when the next non-blank character is `(` (`:187-198`).
  - So `toJSON (github.event)` is a call, and `github . event . pull_request . body` is a path.
  - Names are matched without case: functions at `ExpressionConstants.cs:37` (`OrdinalIgnoreCase`), contexts at
    `ExpressionParser.cs:426-427`, object keys at `DictionaryContextData.cs:77`. So `steps.web.outputs.METADATA` also
    works.
- **What T3, as §6.1 specifies it, passes.** The spec gives (a) `toJSON(`, (b) `outputs.metadata` and `['metadata']`,
  (c) `github[` and `github.event` paths, and case-insensitive names. These pass it:
  - `${{ toJSON (github.event) }}` and `${{ github . event . pull_request . body }}`, unless T3 removes whitespace
    before matching; the spec does not say so.
  - `${{ join(steps.web.outputs.*, '') }}` and `${{ steps.web.outputs[format('meta{0}', 'data')] }}`: a wildcard or a
    computed index.
  - `${{ fromJSON(steps.web.outputs.metadata || '{}')['buildx.build.provenance'] }}`: rule (b) allows any `'<key>'`.
  - Any other step's output taken whole. Rule (b) names only `metadata`, while same-job step outputs reach env and
    inputs in 40-odd places (`inventory.tsv`, for example `ci.yml:87`, `release.yml:106`, `:109`, `:453`).
  - Two routes are not expressions at all: a `$GITHUB_ENV` write, which puts a value into every later step's
    environment (today only `ci.yml:285`, a commit SHA), and `strategy.matrix`, which T3 and T6 do not scan
    (`mutation.yml:77`, `fromJSON(needs.changes.outputs.shards)`, reaching env at `:79`).
- **Fix.** Write `unboundedValueProblems` over tokens that follow the lexer's rules: remove whitespace outside string
  literals, compare names in lower case, and treat `[` and `*` as tokens. Then allow only a closed set:
  - `runner`, `matrix`, `strategy`, `vars`, `secrets`, `inputs`, `job`, `env` and `hashFiles(…)`, all bounded by GitHub
    or by this file;
  - `github.<a closed list of scalars>`, and `github.event.<before | pull_request.number | pull_request.base.sha |
    pull_request.head.sha>`;
  - `steps.<id>.outputs.<name>` and `needs.<job>.outputs.<name>` only when the triple is in a table with its bound.
    Extend T6's `CROSS_JOB_VALUES` with the same-job step outputs, or add a sibling `STEP_VALUES` table;
  - `toJSON` only of `needs` or `needs.<job>.outputs`;
  - `fromJSON(steps.<id>.outputs.metadata || '{}')['containerimage.config.digest']`, with that key pinned.

  Everything else fails: any `*`, any non-literal index, any other function call taking a context argument.

  Scan the workflow's, each job's and each step's `env`; `with`; `run`; job `outputs`; `strategy.matrix`;
  `container.env` and `services.*.env`; and `jobs.<id>.with` and `secrets`.

  Add one more rule: every `>> "$GITHUB_ENV"` in a `run:` writes a name from a closed list. Today that list holds
  `ENGINE_FREEZE_BASE` alone.

  T4's fixtures take each bypass above as a refused case.

### S3. The content calendar's new bound is below what one run files, so C7's "keeps every property" is false

- **Evidence.**
  - The notify job opens up to `MAX_OPENED_PER_RUN = 20` new issues a run and lists the rest
    (`render.ts:15`; `content-calendar.yml:6`, `:112-131`; ADR 0071 `:240-242`).
  - A body is up to `MAX_BODY = 6_000` characters (`render.ts:16`), and the file test counts each finding as
    `MAX_BODY + 60` bytes (`content-calendar.test.ts:580`).
  - At `MAX_FILE_BYTES = 98_292`, that test's own `fits` is ⌊98,292 / 6,060⌋ = **16**. Twenty full-length findings
    need about 121,200 bytes.
- **Failure.** On a day with 17 to 20 full-length findings, the head's check throws at `findingsJson`
  (`render.ts:128-134`). The notify job then files only "Content calendar check failing" and none of the findings, where
  ADR 0071 files 20.
  - Today's code also files none on those days: notify cannot start bash. So the change is louder, but not more capable.
  - It also writes the shortfall into a test (T8) as if it were a property.
- **The rejected options undercount.** C7 weighed splitting against a "four times" gain. Four times is exactly what
  crosses 20.
  - With fixed `FINDINGS_B64_0` to `_3`, each at most 131,056 characters and the job's outputs under 1 MB, about 60
    full findings fit.
  - An artifact read with `gh run download "$GITHUB_RUN_ID" -n findings` keeps the notify job free of `uses:`, which
    `workflows.test.ts:1124` checks. `gh` already runs there (`content-calendar.yml:86`, `:94`, `:123`). It needs
    `actions: read` on that job.
  - Whether a running run's own v4 artifact can be downloaded through the API is not verified.
- **Fix.** Whatever the transport, hold the property in a test:
  `MAX_OPENED_PER_RUN × (MAX_BODY + overhead) + (titles of the rest) ≤ the transport's capacity`, with the capacity
  computed from the 131,072-byte limit and the 1 MB job-output limit. Choose the transport under ADR 0071 (S4).

### S4. Take the content calendar out of this pull request, as its own item

- **Evidence.**
  - The hand-over asks for a minimal change with a stable shape (status file; the task's "keep the change minimal").
  - The rule for improvements says one outside this change's files goes in the notes as a proposal. This change's
    files are ci.yml and `workflows.test.ts`.
  - c5's second half, c6, T6's `FINDINGS_B64` bound, T7, T8 and the ADR 0071 and `content-updates.md` edits change
    `tools/content-calendar/{render,index}.ts`, its test, its workflow and ADR 0071's stated bound.
  - The defect is latent, not live: the last scheduled run, 40510094317 (2026-10-27 13:13 UTC), succeeded, and so has
    every run listed (read 06:10 UTC).
  - The right fix is a transport choice under ADR 0071 (S3), which the design itself sends to "ADR 0071's owner" (P3).
- **Fix.**
  - Keep the finding in §3's inventory, and keep T2 to T5 here.
  - Move T6 (the cross-job table) and every content-calendar change to an item of its own, such as
    `ci-findings-transport`, with its own claim, design and reviewer. T6 cannot pass here without either the new bound
    or a test that writes the known defect down as allowed, and neither belongs in this pull request.
  - Tell the orchestrator in the same message as S1.
  - If the orchestrator rules to keep it here, S3 still applies in full.

### S5. The ruling and N29's date are not recorded where LANES rule 8 puts them, and two shared-file merges are unplanned

- **Evidence.**
  - Rule 8 says: "Every ruling is recorded with who made it and when: in the lane's log, and in the PR's ADR and
    reconciliation-001" (`LANES.md:43`).
  - #82 did both. It added "Under the same ruling of October 26, 2026 (about 00:20 UTC), the CI series' follow-up P1 is
    taken…" after `reconciliation-001.md:657`. It also extended ADR 0066's Status, Date and Deciders lines for Part 5
    (`git diff 0dd1ba7e b574d4e8`).
  - The design's §8 touches neither reconciliation-001 nor ADR 0066's header. Its Date line still reads "Parts 2 and 3
    2026-10-26".
  - #42 also changes reconciliation-001 (`git diff --name-only a6e754fc 46974a25`).
- **Fix.**
  - Add one reconciliation-001 bullet under the 2026-10-26 ruling, after #82's paragraph. It names this item, C1 to C4,
    C11 and the run of record, and cites ADR 0066 Part 3, N29.
  - In ADR 0066: "Date:" gains "; N29 2026-10-28". Part 3's Deciders gain the 2026-10-26 ruling for N29.
  - A9 adds trial merges of both files with #82's head (both append or edit at the same places, so expect a conflict for
    the second PR to resolve under rule 6) and of reconciliation-001 with #42's head.

### S6. A7 cannot be measured as written for runs after c4; tie the description's length to the moment of each event

- **Evidence.**
  - After c4 no log carries the event (§6.3, R2). §6.1 says A7 for later runs "is read from the description's own
    length" but does not say when.
  - An edit between that read and a push would change the event unseen.
  - The other evidence, the uploaded `.dockerbuild` record (§2.4), cannot be fetched from these sessions. I got #42's
    record's download URL from `actions_get download_workflow_run_artifact` (artifact 12791306593, 06:13 UTC), and the
    proxy refused it: `curl: (56) CONNECT tunnel failed, response 403`.
- **Fix.**
  - Immediately before each push, read the description (`pull_request_read get`). Record its length, the appendix's
    SHA-256 and the time.
  - After the run starts, list `approval-of-record` runs. That workflow runs on `edited` (`approval-of-record.yml:10-11`),
    so an edit creates a run with the same head SHA. Show that none was created between the read and the push's run.
  - Put both in the PR.
  - R1, read from its log, stays the run of record that proves the fix. The head's record proves that nothing went back.

---

## Notes

- **N1. The saved log is not whole, and the log tool returns at most the last 5,000 lines.**
  - A fresh `get_job_logs` read of job 122624309161 with `tail_lines: 30000` (06:12 UTC) returned 5,000 lines with
    `original_length: 5400`.
  - The design's file starts at 04:03:29 inside a group, which is why the runner version was missing (§2.5). Correct
    §2.1's "saved whole".
  - For R0, R1 and the head, record `original_length`. Treat A6's "0 copies of the ruler" as complete only when it is
    5,000 or less; otherwise say which first lines went unread.
- **N2. The design calls case-insensitivity "not verified", but the runner's source settles it.** Cite
  `ExpressionConstants.cs:37`, `ExpressionParser.cs:426-427` and `DictionaryContextData.cs:77` instead.
- **N3. The saved proof is missing three cases.** `proof/local-proof.txt` holds only the old and new cases, while §7's
  table cites five. Replace it with a fresh run (mine: `review/local-proof-rerun.txt`, all five as §7 states).
- **N4. The base moved.** `claude/build-platform` is now 56ed6279 (#81, merged 05:37:48 UTC). None of this design's
  files changed (`git diff --name-only 165c5993 56ed6279`). The pull-request runs test the merge with #81. Re-run A8
  and A9 against the current base, and merge it in before the merge (rule 6).
- **N5. c4 turns on the required screening-capacity measurement for every later push.**
  - `screening-capacity.yml` is in `tools/screening-capacity/watched-paths.txt:4`, so `changes` sets `measure=true`
    from R2 on.
  - The `capacity` job runs, with a timeout of up to 100 minutes (`:153`), and `screening-capacity gate` is required
    (`tools/required-checks.ts:24`).
  - Plan for it in §6.3. Name it in A6, since its two builds prove two of the seven env lines on a pull request.
- **N6. T5's finder can miss a build step.**
  - `usesAction` is a case-sensitive prefix (`workflows.test.ts:254`), so a differently cased `uses:` escapes T5's
    count. So does a `run:` that calls `docker buildx build` or `bake` with `--metadata-file`, and so does
    `docker/bake-action`.
  - Compare in lower case, and refuse those forms.
- **N7. T7's message is wrong if the content calendar stays.** `findingsJson` prints `String(MAX_FILE_BYTES)`
  (`render.ts:132`), so the message reads "over 98292", not "over 98,292".
- **N8. T2's base run could fail with a TypeError instead of an AssertionError.** On E2BIG, `spawnSync` sets `error`,
  and `stdout` can be null. Assert `error` first, so A2's "every failure an AssertionError" holds.
- **N9. Say how the payload size was measured.** Compact JSON of #42's `github_event_payload` is 120,430 bytes as UTF-8
  without escaping (my measure). §2.1 says 121,550. Name the method; nothing depends on it.
- **N10. Make the merge message explicit.** "The merge commit's message carries none of it" (§6.3) should be a step:
  merge with an explicit commit message, as #77's and #48's merges did (the head commits of runs 40593100120 and
  40401493955). A "title and description" default would put the 100,061-character ruler into the build branch's history
  and every later push event. The repository's default merge message setting was not read here.
