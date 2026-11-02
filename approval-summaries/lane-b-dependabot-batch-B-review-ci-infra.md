# PR #94 (dependabot-batch, PR B: aws-cdk-lib 2.275 with its CLI, @aws-sdk and stripe) review: CI and test infrastructure

Written 2026-11-02 from 03:34Z (`date -u`: Mon Nov 2 03:34:04 UTC 2026). It records the adversarial reviewer for CI and
test infrastructure across three rounds (2026-11-01T20:50Z to 2026-11-02T03:19Z) and the skeptics' verdicts (r1
2026-11-01T21:24Z to 21:34Z; r2 2026-11-02T01:17Z to 01:31Z). Round 3's findings are nits and had no skeptic. This file
is not committed.

- **Pull request:** #94, `co-001/deps-aws-cdk-minor-patch`, replacing Dependabot #88 (the `aws-cdk` group) and #89
  (minor-and-patch: nine `@aws-sdk/*` and `stripe`). Draft, 15 commits, 13 files, +379/-292 (`pull_request_read get`,
  03:32Z; `git diff --shortstat 43565235 484e9f06`).
  - `aws-cdk-lib` `^2.275.0` with the `aws-cdk` CLI `^2.1146.1` (lib 2.275's assembly needs CLI >= 2.1146.1);
  - the CDK CLI's telemetry, notices and daily version check off for every cdk run in infra (the synth script's env and
    flags, `cdk.json`'s top-level `notices: false`, `infra/scripts/cdk-diff.ts`'s env), held by the new
    `infra/test/cli-settings.test.ts`;
  - an ADR 0012 amendment and one runbook sentence;
  - the ten `@aws-sdk` ranges (nine packages, infra's `client-sts` included) at `^3.1160.0` in six manifests, and
    `stripe` `^23.1.0` in packages/billing (Stripe-Version moves to `2026-10-28.endive`, because `stripe.ts` pins none);
  - lockfile +249/-261 in a487f133 (+263/-275 over the whole pull request), with `@smithy/core` 3.38.0 (npm-deprecated;
    3.38.1 arrives with the merge-time regeneration after 2026-11-02T23:12Z).

  The synth comparison of tp-dev, tp-staging and tp-production stands in for the credentialed `cdk:diff`. B(6), aligning
  #42's three `@aws-sdk` ranges, waits for #42's merge.
- **Head:** `484e9f068199d25711e5d6c69fff485223186538` (committed 2026-11-01T20:41:23Z, the merge of 43565235 (#83) into
  93fa7dbb). `git ls-remote` at 03:31:52Z shows it unchanged.
- **Base:** `claude/build-platform` at `43565235`. The branch has since moved to `877e662f` (#92 at 02:14:46Z, #93 at
  02:42:44Z); `pull_request_read get` shows `mergeable_state: behind`. Round 3 found `git merge-tree` clean against
  877e662f and no manifest or lockfile line moving (sound, round 3, A8).
- **Lens:** CI and test infrastructure (design `designs/lane-b-dependabot-batch.md` §8.4): the lockfile and generated
  files, the new test and its failing-first commits, the synth comparison, the mutation selection, CI on the head, the
  description's checks and counts, and the merge-time regeneration. Rounds 2 and 3 took the areas the completeness critic
  named: AWS responses, Textract and the golden gate, the credentialed diff branch, trial merges, context synths, HTTP
  transport on real sockets, credential providers, Stripe retries, the regeneration's versions, the production bundles
  and the base move.

How the review was done:
- **Clones.** Each round worked in its own fresh blobless clone under `review-B/` (`clone-ci-infra`, `clone-ci-r2`,
  `clone-ci-r3`) with base worktrees at 43565235 and, in r3, a merged tree and a regeneration simulation. Every one was
  installed with `pnpm install --frozen-lockfile`; every heavy command ran under `flock /tmp/laneb-heavy.lock`. All are
  removed.
- **GitHub, read only.** `pull_request_read` (get, get_files, get_check_runs) and job logs (`gh api` and `get_job_logs`)
  saved under `review-B/tmp/`. Nothing was pushed, commented, reviewed, approved or merged.
- **Writer's spot check (03:31Z to 03:33Z).** In a fresh blobless clone (`review-B/clone-writer`, checked out at 484e9f06
  at 03:31:57Z, clean, removed at 03:33:29Z) every line below was re-read and matched:
  - `infra/test/cli-settings.test.ts:6-8, 13-26, 28-56`; `infra/cdk.json:7-8`; `infra/scripts/cdk-diff.ts:8`;
    `infra/package.json:8, 14, 18, 20`; `infra/lib/cdk-diff-plan.ts:25, 29, 39`;
  - ADR 0012 `:3` ("amended 2026-11-01 (CDK CLI telemetry, notices and version check)") and `:148-160`;
    `dependency-upgrades.md:68-69, 321-325`; `screening-capacity.md:101-108, 384`; `ci.md:150`;
    `deploy-and-rollback.md:13, 112, 117, 207`;
  - `packages/model-gateway/eval/sets.ts:71, 79-92`; `gate.golden.test.ts:311, 316`; ADR 0070 `:180-181, 374-375`;
    `tools/stryker/affected.ts:112-118`; `pnpm-workspace.yaml:33-34, 44`; `tools/check-toolchain/check.ts:788-797`;
    `packages/billing/src/stripe.ts:50-52`; `bedrock.ts:39-40`;
  - `pnpm-lock.yaml:2191-2194` (`@smithy/core@3.38.0`, deprecated), `:2208` and `:5290` (`@smithy/signature-v4@5.7.4`),
    `:2529-2530` (`aws-cdk@2.1146.1`);
  - `git diff --numstat` of the lockfile: ed29c77a 14/14, a487f133 249/261, 43565235..484e9f06 263/275;
  - 13 committed `MOD-01/contract-set/*/textract.json` and 4 `MOD-09/contract-set-v2/*/textract.json`.
- **The description** was read back read-only at 03:33:04Z (`gh api …/pulls/94 --jq .body`, saved to
  `review-B/tmp/dl-prbody-writer-H9v1/body.md`, 367 lines, last updated 2026-11-01T20:48:27Z). Line numbers below are
  that readback's.
- **Paths.** `review-B` means
  `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-B`. Commit hashes
  are shortened to 8 hex; any other 64-hex digest to 8 hex and an ellipsis. All data is synthetic.

## Verdict

**0 B, 4 S, 7 N.** Nothing blocks the merge. The four S findings are fixes to the description, one test file, and the
merge-time procedure; none needs product code.
- **S1.** CI's capacity gate on the head raised the O9 sizing question (S4's middle run 45.6 s, over 44 s), and the
  description neither records it nor takes it to the founder, as the runbook requires before merge.
- **S2.** No test checks that the installed CDK CLI still reads the three settings; a CLI bump that dropped one would
  stay green.
- **S3.** `test:golden`, named as the ADR 0070 check for the `client-textract` and `@smithy/core` codec moves, stubs the
  Textract client and cannot fail on an SDK parsing change.
- **S4.** The merge-time `@smithy/core` 3.38.1 step, as written, either keeps 3.38.0 or moves unreviewed test tooling
  (rolldown, oxc, postcss), which turns the Stryker selection into 7 shards. A validated override procedure replaces it.

The seven N findings: the every-script test's blind spots (N1), one miscount (N2), the description's missing mutation
scores, reviewer rows and stale counts (N3, N4, N5), the runbook's AWS paragraph (N6) and the merge plan's re-checks
(N7).

Several findings were also raised by the security and supply-chain lens
(`lane-b-dependabot-batch-B-review-security-supply.md`). Where both lenses rated an issue, the fix round takes the higher
rating and one fix:
- S3 here is S3 there (SEC-B-R2-S2): both S. The two corrected fixes are combined in S3 below.
- S4 here is S2 there (SEC-B-R2-S1): both S; both skeptics arrived at the same override procedure.
- N1 here overlaps N2 and N3 there (SEC-B-N2, SEC-B-N3): all N. One test rewrite covers the three (N1's fix).
- N4 here is N8 there (SEC-B-R2-N2); N5 here is N11 there (SEC-R3-N3); N7 here overlaps N10 and N9 there (SEC-R3-N2,
  SEC-R3-N1). All N.
- **Interaction.** S2 here and S1 there (SEC-B-S1, notices) touch the same test, ADR sentence and runbook sentence. If
  the fix round drops `"notices": false` from `cdk.json` (SEC-B-S1's best option), S2's notices assertion must follow
  the `--no-notices` flag path, not `configuration.settings.get(["notices"])` (see S2's writer's note).

## Findings

### S1 (ci-infra-r1-CI-B-S1). The head's screening-capacity gate raised the O9 sizing question (45.6 s, over 44 s); the description does not record it, and the runbook says it goes to the founder before merge

**Where:** PR #94 description, "Checks" (lines 294-331) and "What waits on a person (none blocks this merge)" (line 246);
`docs/runbooks/screening-capacity.md:101-103`.

**Scenario:** The pull request is marked ready and merged on its four green required checks with the description as it
stands. That skips the runbook step "the builders take it to the founder before merge as a question of the consumer's
size (open item O9)". The description also says `screening:capacity` and the Stryker shards have not run on this head
(lines 330-331), although CI has run both.

**Evidence:**
- Gate job 124977984730 (run 41348572625, pull_request, head 484e9f06) finished success at 2026-11-01T21:03:51Z with
  `SIZING: the worst time, S4#3 S4-3's 45.6 s (the middle of S4's three runs), is above 44 s: the consumer's size goes
  to the founder before merge`, and a warning with the same text. `TIME_WARNINGS` is empty: no judged time reached 48 s.
- Capacity job 124973631983 (21:03:19Z): S4#1 43.6/40.0/43.0/29.2 s, S4#2 45.3/45.9/46.0/34.9 s, S4#3
  44.3/44.7/45.6/34.2 s; `verdict: pass (time advisory)` and the O9 line.
- Variance on other runs (gh api job logs, 21:05Z): base push 41348076076 (43565235) had no SIZING line, middle run
  37.1 s; base push 41330911481 (bce57f16) 52.3 s; #42's run 41347544317 (6c28d6a2) 55.1 s. Round 3 added the base push
  at 4eaf7124 (job 125058359893, SDK 3.1152.0): S4 middle run 51.8 s with three 48-s warnings and O9. `git diff
  --name-only bce57f16 43565235` touches nothing in the worker, pricing or db packages or the lockfile.
- The PR's consumer source is unchanged, but `apps/worker/package.json` moves `client-s3`, `client-rds` and
  `client-sesv2`, and the lockfile moves `@smithy/core`, which is why the gate measured. The capacity run used local
  providers only (`tools/screening-capacity/env.ts:190-260`), so no AWS client ran in it. The time is most likely runner
  variance; the runbook routes it to the founder all the same.
- The runbook's lines 105-107: only a worst time still above 44 s after the web resize goes back to the founder; 45.6 s
  is above it. The question is already open in issue #41 (label "revisit", option 3: "settle the sizing question (O9)").
- Precedent: 6b-4's review M5 (should fix) was this exact gap; #42's body lists the consumer's size among the founder's
  actions (`lane-a-pr42-status.md:96-98`).
- `docs/runbooks/ci.md:150` allows a re-run only for an infrastructure failure, so re-running to clear the warning is
  not allowed.

**Fix (the skeptic's corrected fix):** Edit the description only; change no code and do not re-run the capacity workflow.
1. In "Checks", add CI rows for 484e9f06:
   - `screening-capacity` (run 41348572625; capacity job 124973631983; gate job 124977984730, success 21:03:51Z): pass
     (time advisory), no time warning (every judged time under 48 s). S4#1 worst 43.6 s, S4#2 46.0 s, S4#3 45.6 s. The
     middle run is S4#3, whose S4-3 at 45.6 s is above 44 s, so the gate raised "Sizing question (O9)".
   - `mutation` with the six `stryker` shards: success, with each score (N3).
   - `all green` and `approval-of-record`: success.
2. Keep lines 330-331, reworded to "Not yet run locally on this head: … (CI's capacity and mutation runs of this head are
   in the rows above)", and update them when the fix round's local suite runs.
3. Under "What waits on a person", drop or qualify "(none blocks this merge)" and add:

   > The consumer's size (O9, the open question in issue #41): CI's capacity run on this head measured S4's middle run
   > at 45.6 s, over the 44-s question (pass, time advisory). The consumer's source is unchanged. Only its AWS clients
   > (`client-s3`, `client-rds`, `client-sesv2` at 3.1160.0) and `@smithy/core` 3.38.0 move, and the request captures
   > show the same request shapes. The same consumer code measured 37.1 s on base 43565235 (run 41348076076), 52.3 s on
   > bce57f16 (run 41330911481) and 51.8 s on 4eaf7124 (job 125058359893), and #42's head 55.1 s (run 41347544317),
   > the host spread issue #41 describes. Recommended: no change to the consumer from this pull request. The founder
   > settles O9 on the faithful measurement, as issue #41 says. This blocks the screening's launch, not this merge,
   > unless the founder rules otherwise.

   Before 3i, ask the founder directly; after, the founder's approving review carries it. Read the description back
   after the edit.

**Skeptic:** Real; could not refute (read-only, 21:24Z to 21:27Z, git show at 484e9f06, the API and job logs). The
skeptic corrected the original fix: keep the local "not yet run" record rather than replace it; name issue #41's open
question rather than a new one; say plainly that the worker's AWS clients and `@smithy/core` move; report "pass (time
advisory)" rather than the gate's fixed phrase; record the mutation and shard runs too. The writer added round 3's
4eaf7124 measurement to the variance list.

### S2 (ci-infra-r1-CI-B-S2). No test checks that the installed CDK CLI still reads the three settings; only a manual runbook step covers each CLI bump

**Where:** `infra/test/cli-settings.test.ts:28-56` (it reads only `package.json`, `cdk.json` and `scripts/cdk-diff.ts`,
lines 13-14 and 26); `docs/runbooks/dependency-upgrades.md:323-324`; ADR 0012 `:155-160`.

**Scenario:** A later CLI bump (the merge regeneration takes 2.1147.0, usable from 2026-11-02T18:57:11Z; Dependabot's
`aws-cdk` group brings more) renames or drops `CDK_DISABLE_CLI_TELEMETRY`, accepts only `"1"`, or stops reading the
notices setting. All 7 tests and every CI job still pass. Telemetry or the version check comes back silently unless
someone remembers the runbook sentence.

**Evidence:**
- In the installed CLI 2.1146.1, `lib/index.js:307005` reads `["true", "1"].includes(process.env.CDK_DISABLE_CLI_TELEMETRY
  ?? "")`, `:317577` reads `!process.env.CDK_DISABLE_VERSION_CHECK`, and `:374172` reads
  `configuration.settings.get(["notices"])`. Each appears exactly once in 2.1145.0 and in 2.1146.1 (21:02Z), and in
  2.1147.0 at `:307232`, `:316037` and `:374720` (skeptic, 21:29Z).
- `aws-cdk`'s `exports` field allows `./package.json`, so `createRequire` can resolve the bundle.
- `git grep` at the head (21:27Z) finds no test that loads the installed CLI. CI runs `pnpm test` (`vitest run --project
  unit`, `ci.yml:291`), so a test in this file runs on every CLI-bump pull request.
- The skeptic's behaviour runs (21:33Z): the CLI's own `cli-telemetry --status` from infra/, with an empty HOME and the
  synth script's variables, prints "CLI Telemetry is disabled". A copy reading a renamed variable prints "enabled";
  `CDK_DISABLE_CLI_TELEMETRY=yes` prints "enabled"; a `~/.cdk.json` with `{"context":{"cli-telemetry":false}}` prints
  "disabled" with no variable, so a developer's own settings can hide a regression. None of these turns a current test
  red.
- Why not source-text matching for telemetry: the skeptic changed the check to the equivalent
  `["1", "true"].includes(process.env.CDK_DISABLE_CLI_TELEMETRY || "")`; status still printed "disabled", but the
  proposed regex no longer matched (a false red). The status command runs the real `canCollectTelemetry`, offline, in
  under a second, and printed "disabled" on 2.1145.0, 2.1146.1 and 2.1147.0 (21:34Z). Notices and the version check have
  no status command, and the version check runs only on a terminal, so text matching is right for those two.

**Fix (the skeptic's corrected fix):** In `infra/test/cli-settings.test.ts`, add two tests.
1. **Telemetry, by behaviour.** Resolve the CLI directory with
   `path.dirname(createRequire(import.meta.url).resolve('aws-cdk/package.json'))`. Take the `VAR=value` prefix of
   `manifest.scripts.synth` and assert it includes `CDK_DISABLE_CLI_TELEMETRY`. Run
   `spawnSync(process.execPath, [<cliDir>/bin/cdk, 'cli-telemetry', '--status', '--no-notices'], { cwd: infraDir,
   encoding: 'utf8', timeout: 60_000 })` with only this env: `PATH`; `HOME` a fresh `mkdtemp` folder (no `~/.cdk.json`);
   `TELEMETRY_ENDPOINT: ''`; `HTTPS_PROXY` and `HTTP_PROXY` `http://127.0.0.1:9`; `AWS_EC2_METADATA_DISABLED: 'true'`;
   `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointing at a missing file; and the synth variables. Assert exit 0
   and `/CLI Telemetry is disabled\./` in stdout plus stderr. Remove HOME in a `finally`.
2. **Notices and the version check, by source text.** Read `<cliDir>/lib/index.js` and assert
   `/\bconfiguration\.settings\.get\(\["notices"\]\)/` and
   `/return !!process\.stdout\.isTTY && !process\.env\.CDK_DISABLE_VERSION_CHECK;/`.

A ready copy is `review-B/scripts-ci/cli-settings.refute-s2.test.ts` with `cli-settings.refute-s2.diff`: 9 of 9 pass, and
eslint and infra tsc return 0 (`logs-ci/refute-s2-final.log`, 21:34Z). Then the documents:
- `dependency-upgrades.md:323-324`: "`infra/test/cli-settings.test.ts` asks the installed CLI whether telemetry is off
  (its `cli-telemetry --status`, under the synth script's variables) and fails when its `lib/index.js` no longer reads
  the `notices` setting or `CDK_DISABLE_VERSION_CHECK`. When it fails on a CDK CLI bump, read `canCollectTelemetry`, the
  notices setting and `shouldDisplayVersionMessage`, and change the settings and the test together."
- ADR 0012 `:155-156`: add "and that the installed CLI still honours them"; `:158-160`, Revisit when
  "`infra/test/cli-settings.test.ts` fails on a CLI bump".

**Writer's note (interaction with security-supply S1):** if `"notices": false` leaves `cdk.json`, the repository's runs
rely on `--no-notices` alone. The notices assertion should then hold the flag path (`argv.notices` deciding first, at
2.1146.1 `lib/index.js:374166-374191`) instead of, or as well as, the settings read, and the runbook and ADR sentences
above should say "`--no-notices`" where they say "the notices setting". The exact pattern for the flag path was not
verified by the writer; the fix round reads it from `lib/index.js` and validates it on 2.1146.1 and 2.1147.0.

**Skeptic:** Real at S; could not refute (fresh clone, 21:27Z to 21:34Z; clone and downloads removed). The original fix
(three source-text regexes) tests spelling, not behaviour; the corrected fix asks the CLI for telemetry and keeps text
matching only where no behaviour check exists.

### S3 (ci-infra-r2-CI-B-R2-S1). `test:golden` is named as the ADR 0070 check for the `client-textract` and `@smithy/core` codec moves, but it stubs the Textract client, so it cannot fail on an SDK parsing change

Also raised by security-supply as SEC-B-R2-S2 (S3 there).

**Where:** `packages/model-gateway/eval/sets.ts:79-83`; PR #94 description, "ADR 0070 and `test:golden` for
`client-textract`" (lines 220-225) and "Merge order", third bullet (lines 261-264); design §5.3
(`lane-b-dependabot-batch.md:480-491`, "That is tested, not argued") and §8.5 (`:790-791`, "for B it is also the ADR 0070
check").

**Scenario:** At the merge-time regeneration, `client-textract` moves to 3.1161.0 and `@smithy/core` to 3.38.1. Since
this bump, `@smithy/core` holds the JSON codec that deserializes GetDocumentTextDetection. If that codec changed
`Blocks[].Text` (an escape-handling regression, say), production's `TextractPageReader` would send different page text
to the model, and `pnpm test:golden` would still pass with every `set_sha256` unchanged: `recordedTextractClient`'s
`send` returns the recording's plain objects, so no SDK serializer or deserializer runs. The description would again
record "no `set_changed`, no re-baseline" on a check that could not have failed.

**Evidence:**
- `sets.ts:79-83`: `send = (command) => Promise.resolve('DocumentLocation' in command.input ? { JobId } : { JobStatus,
  DocumentMetadata, Blocks })`. `sets.ts:86-91` passes it to `TextractPageReader`; `:252-256` reads the scanned pages
  through it. `packages/contracts/src/evidence/scan.ts:48, 56, 67` only call `options.client.send(new …Command(…))`, so
  only the command constructors run.
- `gate.golden.test.ts:311` and `:316` compare `set_sha256` only. ADR 0070 `:180-181` says the hash covers pages "as
  read"; in the evaluation they are read through the stub.
- The conclusion for 3.1160.0 holds; the cited method does not establish it. `scripts-ci-r2/textract-real.mts`
  (2026-11-02T01:05:14Z) drove the checkout's own `TextractPageReader` over a real `TextractClient` whose request handler
  answered each of the 13 MOD-01 recordings as an x-amz-json-1.1 response, whole and in 3 NextToken pages. Base
  (3.1152.0, `@smithy/core` 3.36.0) and head (3.1160.0, 3.38.0) gave pages equal to the stub's for 13 of 13 (36 pages,
  14,891 characters), with 2 and 4 requests per document (`logs-ci-r2/textract-real-{base-ci-r2,clone-ci-r2}.json`).
- The skeptic found the run incomplete: the contract set v2 reads 18 recordings, the 13 in MOD-01, V05, V14, V15 and V18
  in MOD-09/contract-set-v2 (V05 is the unfaithful scan: 6 pages, 128 blocks, 7,165 characters) and L03, generated at
  test time (`MOD-09/expected.json:326-335`).
- **Already closed by the other lens's skeptic:** security-supply's replay driven by the set manifest
  (`scripts-refute-s2b/replay-set.mts`, 01:41:14Z to 01:41:19Z) served all 18, whole and in NextToken pages of at most
  1000 blocks (L03: 2,546 blocks, 80 pages, 3 responses). Real client equals stub on 18 of 18 at base and head, base
  equals head (`logs-refute-s2b/replay-{base,head}.json`). The only stub/SDK divergence is a block with `"Text": null`,
  which `sets.ts:71` refuses, so it cannot reach the set.

**Fix (the two skeptics' corrected fixes, combined by the writer):**
1. Rewrite "ADR 0070 and `test:golden` for `client-textract`": `test:golden` passed (5 files, 376 tests, `set_sha256`
   equal for both local entries) but cannot see a `client-textract` or `@smithy/core` change, because the evaluation's
   `recordedTextractClient` (`sets.ts:79-83`) answers without a `TextractClient`. The SDK-path evidence is the real-client
   replay over every recording the set names: 18 of 18 equal to the stub at 3.1152.0 / 3.36.0 and at 3.1160.0 / 3.38.0,
   base equal to head, whole and paged, with the log path. Name the one unreachable difference (null `Text`). So there is
   no `set_changed`, by a check that could have seen one.
2. "Merge order", third bullet: re-run that replay over the set manifest on the merged tree, beside the synth comparison,
   `test:golden` (kept, as the gate for pdf.js, the in-repo reader, the fixtures and the baseline) and `toolchain:check`.
   A recording whose real-client pages differ from the stub's or the base's is a set change under ADR 0070 `:259` and
   `:374`: the bump waits for the two-step re-baseline.
3. The same corrections in design §5.3 and §8.5.
4. The durable fix is outside the PR's files (proposal P6).

**Skeptic:** Real at S; could not refute (read-only git show of 484e9f06 after a fetch, 01:17Z to 01:19Z). The skeptic
widened the evidence from 13 to 18 recordings and asked for a command at merge time. The security lens's skeptic kept
`test:golden` in the merge step beside the replay rather than replacing it; the combined fix takes both.

### S4 (ci-infra-r2-CI-B-R2-S2). The merge-time `@smithy/core` 3.38.1 step as written either keeps 3.38.0 or moves unreviewed test tooling (rolldown, oxc, postcss), which changes the Stryker selection to 7 shards

Also raised by security-supply as SEC-B-R2-S1 (S2 there).

**Where:** PR #94 description, "The lockfile's moves", the "`@smithy/core` 3.38.0 is npm-deprecated" bullet (line 160:
"re-resolved with pnpm's update command (lockfile only) and every `package.json` is diffed afterwards") and "Merge order"
(lines 261-264); design §7 (`lane-b-dependabot-batch.md:636-640`, which marks the step "Not verified");
`pnpm-workspace.yaml:33-34` (overrides) and `:44` (`minimumReleaseAge`).

**Scenario:** After 23:12Z the builder regenerates. `pnpm install --lockfile-only` keeps `@smithy/core` 3.38.0, because
`@aws-sdk/core` 3.979.1 and the 3.1161.0 clients need only `^3.38.0` and pnpm keeps a locked version that satisfies the
range. Then:
- `pnpm -r update @smithy/core --lockfile-only` takes 3.38.1 but also moves rolldown 1.2.15 to 1.2.16 (with 15 platform
  bindings), `@oxc-project/types` 0.155.0 to 0.156.0, and adds postcss 8.5.32. These sit below vite 8.3.4, under
  vitest, so `tools/stryker/affected.ts` (`TEST_TOOLING`, `:112-118`, "or below them") also selects money and ledger:
  7 shards with money-ledger. No `package.json` changes, so the step's own check sees nothing.
- The root form and the six-importer `--filter` form keep 3.38.0 and make the same tooling moves.

**Evidence:**
- `npm view` (01:08:35Z; skeptic 01:20:31Z): `@aws-sdk/core@3.979.1` needs `@smithy/core` `^3.38.0`; `client-textract`,
  `client-s3` and `client-rds` at 3.1161.0 need `^3.38.0` and `node-http-handler` `^4.14.0`; only
  `@smithy/node-http-handler@4.14.1` needs `^3.38.1`. 3.38.1 was published 2026-10-30T23:11:40Z.
- Finder's simulation (01:10:13Z, `scripts-ci-r2/regen-sim.sh`, `minimumReleaseAge` 2700): install-only changed 0 lines;
  `-r update` 215 lines; `--filter` 148 lines with 3.38.0 kept. `affected.ts` on the `-r` lockfile (01:12Z): packages
  money, pricing, ledger, packets; shards money-ledger plus the six. Override variant: only `@smithy/core` moved, 67
  lines; every `package.json` byte-identical; a further install a no-op; 6 shards (01:14:31Z).
- Skeptic's tighter simulation (01:29Z, `review-B/scripts-refute-s2/sim.sh`, logs `review-B/sim-refute-s2/*.log`):
  `minimumReleaseAge` 3017 puts the cutoff at 2026-10-30T23:12Z, exactly what 4320 gives at 2026-11-02T23:12Z, with the
  ranges first raised to `^3.1161.0` and the CLI to `^2.1147.0`. Regeneration keeps 3.38.0 and node-http-handler 4.14.0
  (pnpm warns "deprecated subdependencies found: @smithy/core@3.38.0"). `-r update`: +112/-103 with 3.38.1 and the
  tooling moves. Root, `--filter` and `-r update @smithy/core@3.38.1`: +79/-69 each, 3.38.0 kept, same tooling moves.
  Override then removal: +33/-34, all `@smithy/core`; the lockfile's `overrides:` again holds only
  `typed-rest-client>qs`; a third install is a no-op.
- `affected.ts --base 43565235` (01:30Z to 01:31Z): head, regeneration and override results give the 6 shards; `-r` and
  root forms give 7, "pnpm-lock.yaml moves @oxc-project/types… @rolldown/binding-…".
- A committed override fails `check.ts:788-797`: `overrides.json` must hold every override, and the lockfile's
  overrides map must match it.

**Fix (the skeptic's refined procedure)** in the description's bullet, "Merge order" and design §7:
1. Do the normal regeneration first: merge the latest `claude/build-platform`, apply the versions rule (`@aws-sdk`
   `^3.1161.0`, CLI `^2.1147.0`), run `pnpm install --lockfile-only`, and keep that as the pre-step state.
2. Only at or after 2026-11-02T23:11:40Z, with 3.38.0 still locked: add `'@smithy/core': 3.38.1` under `overrides:` in
   `pnpm-workspace.yaml`; `pnpm install --lockfile-only`; delete the line; `pnpm install --lockfile-only`, then once more,
   confirming no change.
3. Gates before committing: against the pre-step state the lockfile diff touches only `@smithy/core` lines (about
   +33/-34) and `overrides:` holds only `typed-rest-client>qs`; `git diff --exit-code -- '*package.json'
   pnpm-workspace.yaml` passes; `pnpm exec tsx tools/stryker/affected.ts --event pull_request --base <base sha>` still
   gives the 6 shards; `BASE=origin/claude/build-platform pnpm toolchain:check` passes and the version table gains 3.38.1
   with its age.
4. Never commit the override.
5. Say plainly: do not use `pnpm update` for this transitive dependency in any form.

**Skeptic:** Real; could not refute, under conditions closer to the merge than the finder's. Not verified: the result once
#42 merges (`client-sqs`), and runs after 23:12Z with releases newer than 01:29Z.

### N1 (ci-infra-r1-CI-B-N1). The every-script rule checks the variables per script, not per cdk command, and the cdk:diff check parses source with a regex that comments and decoys defeat

Overlaps security-supply N2 (SEC-B-N2, the launcher list) and N3 (SEC-B-N3, the spread order).

**Where:** `infra/test/cli-settings.test.ts:20-21, 24-26, 38-48`; ADR 0012 `:155-156`; PR description line 23.

**Scenario:** Each of these passes all 7 tests while a CLI run goes out with telemetry on:
- (M9) synth becomes `CDK_DISABLE_CLI_TELEMETRY=true CDK_DISABLE_VERSION_CHECK=true cdk synth --quiet --no-notices &&
  cdk ls`: the variables reach only the first command.
- (M2) a new `deploy` script: `CDK_DISABLE_… tsc --noEmit && cdk deploy --no-notices`.
- (M11) in `cdk-diff.ts` both settings move into a trailing `//` comment on the `env:` line. The description says "a
  commented-out line not counting", but the regex strips only whole-line comments (`:24`).
- (M12) the spawn uses `env: process.env` while an unrelated `{ env: { CDK_DISABLE_…: 'true' } }` sits earlier.
- The matcher also misses `env AWS_REGION=x cdk deploy`, `npx --package aws-cdk cdk deploy` and
  `./node_modules/.bin/cdk deploy`.

**Evidence:** `logs-ci/mutants.log` (20:54Z): M2, M9, M5, M6, M10, M11 and M12 each pass 7 of 7. In the same run the
full revert (M0) fails 4 tests, base `cdk-diff.ts` alone fails 1 and base `cdk.json` alone fails 1, so the test is real
for what it covers.

**Fix:** (a) Assert per cdk command: each command's own `VAR=value` prefix holds both variables and its own arguments
hold `--no-notices`. (b) Replace the env-object regex with a behavioural test: run `node <tsx cli> scripts/cdk-diff.ts`
with a stand-in `cdk` first on `PATH` that records argv and the `CDK_` variables, under a minimal env (no AWS
credentials, `AWS_EC2_METADATA_DISABLED=true`, `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` at a missing file;
0.77 s locally), with the temp dir made inside the test. Never run package scripts for real. (c) Optionally widen the
launcher. Validated: `review-B/scripts-ci/cli-settings.proposed3.test.ts` (diff `.proposed3.diff`): 9 of 9 on the head;
M2, M9, M11, M12 and base `cdk-diff.ts` each red; three repeats green; eslint and tsc 0 (`logs-ci/proposed3.log`,
21:08Z). Then reword description line 23 and ADR 0012 `:155-156`.

**Writer's note:** one rewrite can close this, SEC-B-N2 and SEC-B-N3. Select scripts fail-closed with SEC-B-N2's
`/(?<![\w-])cdk(?![\w:.-])/` per command part (not a launcher list, which makes (c) unnecessary), require (a) per
command, and in (b) start the stand-in with `CDK_DISABLE_CLI_TELEMETRY=0` and `CDK_DISABLE_VERSION_CHECK=` in the
parent env so a `...process.env` spread after the settings turns it red.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N2 (ci-infra-r1-CI-B-N2). The description miscounts the CDK commit's lockfile change: it says 16 lines, git says 14

**Where:** PR #94 description, "The lockfile's moves", line 110.

**Scenario:** A reader checking "ed29c77a (CDK), 16 lines added and 16 removed" against git finds 14 and 14, and cannot
tell whether a lockfile line is missing.

**Evidence:** `git diff --numstat ed29c77a^ ed29c77a -- pnpm-lock.yaml` gives 14 and 14 under myers, patience and
histogram (20:59Z; writer's clone 03:32Z: 14/14). The 28 lines move only `aws-cdk-lib`, `aws-cdk` and
`@aws-cdk/cloud-assembly-schema`, so "Nothing else moves" holds. a487f133 is +249/-261 as stated.

**Fix:** "14 lines added and 14 removed". Optionally add the lockfile's total over the pull request, +263/-275.

**Writer's correction:** the finding called +263/-275 "the whole PR"; it is the lockfile's total across the pull
request (`git diff --numstat 43565235 484e9f06 -- pnpm-lock.yaml`). The whole pull request is +379/-292 over 13 files.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N3 (ci-infra-r1-CI-B-N3). The description does not record the mutation scores or survivors of the six shards

**Where:** PR #94 description, "Stryker shards CI selects" (line 227, with "each run in full by the `mutation` check on
this page" at 230-231) and "Checks"; `docs/runbooks/dependency-upgrades.md:69`.

**Scenario:** The runbook says a group that moves a money closure "runs mutation in full; read its survivors like any
other", and design §8.4 item 5 asks for the six shards' scores. The scores live only in a 14-day artifact and a job log.

**Evidence:** Mutation gate job 124977781828 (run 41348572583), 2026-11-01T21:03:24Z: pricing 98.67% (1,934 detected of
1,960; 26 undetected, all recorded equivalents; 12 load failures left out); packets 97.75% (4,310 of 4,409; 99
undetected, all recorded equivalents; 2 load failures left out); money and ledger not affected; "mutation gate: passed".
Identical to base push run 41348076075 (43565235).

**Fix:** Add a Checks row with the run ID, both scores, "every survivor a recorded equivalent, identical to the base push
run 41348076075" and "mutation gate: passed". Handle the "Not yet run" clause as S1's fix says.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N4 (ci-infra-r2-CI-B-R2-N1). The security-reviewer and payment-engine-reviewer rows still say "Pending"; the data is on the head's CI, and the edi-reviewer reason checks out

Also raised by security-supply as SEC-B-R2-N2 (N8 there).

**Where:** PR #94 description, "Reviewer agents' findings", rows at lines 344-345; design §8.4 item 5;
`.github/pull_request_template.md`, "Reviewer agents' findings".

**Scenario:** The fix round starts with no payment-engine or security-reviewer record, although design §8.4 puts them
before it.

**Evidence:** `git diff --stat 43565235 484e9f06` lists 13 files, none under packages/pricing, ledger or packets. The
lockfile importers of edi835, money, rules, synth, pricing, ledger and packets are byte-identical base to head (01:04Z).
Mutation job 124977781828, read in full (840 lines): changes gave pricing and packets and 6 shards; scores as in N3; gate
passed at 21:03:22Z. edi835 depends on `@tp/money` and `@tp/rules` (dev: `@tp/synth`, `@types/node`, fast-check,
typescript, vitest), none of which moved.

**Fix:** Fill payment-engine-reviewer with the scores and the empty money-package diff. Record security-reviewer's pass
over `kms-key-provider.ts`, `evidence/scan.ts` and the web and worker clients: no AWS client passes a logger
(`services.ts:107, 207, 229`; `targets.ts:63`; `wiring.ts:20, 30, 41`; `mail.ts:85`; `intake/wiring.ts:19`;
`config.ts:137`; `kms-key-provider.ts:44`; `scan.ts:92`; `cdk-diff-plan.ts:39`). Keep edi-reviewer's "Not run", citing
the unchanged importers.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N5 (ci-infra-r3-CI-R3-N1). The Checks table's lint, lint:logs and unit counts come from commits before the #83 merge, and no longer match the head

Also raised by security-supply as SEC-R3-N3 (N11 there).

**Where:** PR #94 description, "Checks": `pnpm lint (93fa7dbb)` (line 317), `pnpm lint:logs (93fa7dbb)` (line 318) and
"Unit tests on gateway, billing, db, contracts, web and worker (a487f133)" (line 320).

**Scenario:** A reader checks the head against the table and finds different counts. The description says a check on
a487f133 or 93fa7dbb "stands for the head's dependency tree"; these rows are not dependency checks, and #83's merge added
files.

**Evidence:** lint job 124973596405 (20:48:51Z): "lint: passed, 1,681 files in 3 groups, 0 errors, 0 warnings" (the
table says 1,677). static job 124973596362 (20:50:37Z): "lint:logs: 1087 files scanned" (the table says 1,086). Local run
on 484e9f06, 03:05Z to 03:09Z (`logs-ci-r3/head-checks.log`): lint 1,681, rc 0; lint:logs 1,087; verify-content
passes; `pnpm exec vitest run --project unit packages/model-gateway packages/billing packages/db packages/contracts
apps/web apps/worker` gives 196 files and 2,779 tests (the table: 194 and 2,753, `builder-B2.md:124`); infra 25 files and
609 tests, matching. The other rows hold on the head.

**Fix:** Restate the three rows for the head and cite its CI jobs: lint 124973596405 (1,681 files); static 124973596362
(lint:logs 1,087, verify-content, audit --prod); unit on 484e9f06 (196 files, 2,779 tests). Or label them "before the
#83 merge" and keep them out of the "stands for the head" sentence.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N6 (ci-infra-r3-CI-R3-N2). The runbook's AWS paragraph does not ask an `@aws-sdk` bump to run the SDK over a real socket or inside the production bundle, and no CI job does

**Where:** `docs/runbooks/dependency-upgrades.md:325` (the `@aws-sdk/*` sentence of the paragraph this pull request edits
at `:321-325`).

**Scenario:** A later `@aws-sdk`, `@smithy/node-http-handler` or credential-provider move breaks one of these: Bedrock's
default `NodeHttp2Handler` (one HTTP/2 session per call), `Expect: 100-continue` on S3 parts over 2 MB, ECS container
credentials, or resolution inside the worker's esbuild bundle. Every CI job stays green: the capacity job runs the built
images with local providers (`tools/screening-capacity/env.ts:190-260`), e2e imports the worker's sources
(`apps/web/e2e/journeys.ts:25-26`, `screening.ts:5`), and the images job only builds and loads (`ci.yml:748-775`). Every
capture in rounds 1 and 2 used a custom request handler.

**Evidence (this pull request is sound):** `scripts-ci-r3/socket.mts` (02:51Z to 03:04Z) ran our own classes with default
handlers (`createProvider`/`BedrockProvider` over h2c, `S3SealedBytes`, `S3SupportInbox`, `SesMailSender`), 41 cases:
base (3.1152.0, `@smithy/core` 3.36.0, node-http-handler 4.12.1), head (3.1160.0, 3.38.0, 4.14.0) and regen (3.1161.0,
3.38.1, 4.14.0) identical on all 41 (`logs-ci-r3/socket-*.json`). `creds.mts` resolved container credentials through
FULL_URI and RELATIVE_URI on 169.254.170.2 in an `unshare -rn` namespace, 10 scenarios each, identical
(`logs-ci-r3/creds*-*.json`). `bundle/zz-r3-probe.ts`, bundled with `build.ts`'s exact esbuild options and run from an
empty directory: S3, KMS, SES, RDS and Bedrock h2 with container credentials, all identical (`logs-ci-r3/probe-*.json`).

**Fix:** Extend the sentence at `:325`, for example: "…so its pull request runs those packages' mutation, and compares
base against head over real sockets and in the worker's esbuild bundle (Bedrock over HTTP/2, S3 multipart with
100-continue and checksum validation, KMS, SES, RDS, ECS container credentials), since no CI job runs the SDK that way
(capacity uses local providers, e2e imports sources, images only build)." #91 also edits this paragraph; whichever
merges second keeps both. A committed test is proposal P11.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N7 (ci-infra-r3-CI-R3-N3). The merge plan moves the CLI to 2.1147.0 but does not re-run the CLI-settings check this pull request adds to the runbook, and none of its checks can see the 3.1161.0 / `@smithy/core` 3.38.1 changes

Overlaps security-supply N10 (SEC-R3-N2) and N9 (SEC-R3-N1).

**Where:** PR #94 description, "Merge order", third bullet (lines 261-264: "…each time with the synth comparison,
`test:golden` and `toolchain:check` again"); `docs/runbooks/dependency-upgrades.md:323-324`.

**Scenario:** The regeneration takes CLI 2.1147.0, `@aws-sdk/core` 3.979.1 (`getUpdatedSystemClockOffset` changes from
the sent/received midpoint to `serverTime - timeResponseReceived`, which drives signing after skew) and `@smithy/core`
3.38.1. The re-run list reads none of the CLI's three gates, which the runbook sentence requires "after a CDK CLI bump",
and exercises neither signing nor transport: `test:golden` is stubbed (S3), and `toolchain:check` reads metadata only.

**Evidence:** Run on a regen simulation (02:44Z to 03:19Z: the head with `^3.1161.0` and `^2.1147.0`, a
2026-10-30T23:13Z cutoff, and S4's override procedure; build 21b5c6f): `@smithy/core` 3.38.1, `@aws-sdk/core` 3.979.1,
CLI 2.1147.0. node-http-handler stays 4.14.0 and cloud-assembly-schema stays 55.2.0 under every procedure tried. In
2.1147.0, `canCollectTelemetry` (`lib/index.js:307231`), the notices block (`:374716-374748`) and
`shouldDisplayVersionMessage` (`:316036-316037`) are text-identical to 2.1146.1's. An offline TTY capture
(`scripts-ci-r3/cli-capture.sh`) made 0 attempts for `pnpm run synth`, `pnpm run cdk:diff` and `cdk --version`; a bare
`cdk synth` made the known telemetry attempt and two registry attempts, no notices fetch, as on 2.1146.1. `cdk.out` is
byte-identical apart from checkout paths. The checker's 28-request capture with `FIX_UA=1` is identical 28/28 on regen,
head and base. Forcing schema 55.3.0 only moves `minimumCliVersion` to 2.1147.0, which CLI 2.1146.1 still synthesizes
(rc 0; it enforces only the schema major, `lib/index.js:6101-6121`).

**Fix:** Add to the Merge-order bullet: "re-read the three CLI gates in 2.1147.0 and re-run an offline capture of `pnpm
run synth` and `pnpm run cdk:diff` (runbook `:323-324`), or run S2's test; re-run the request capture on the regenerated
lockfile". Cite this round's results as the evidence for 3.1161.0, `@aws-sdk/core` 3.979.1, `@smithy/core` 3.38.1 and
CLI 2.1147.0, and note that a plain regeneration keeps node-http-handler 4.14.0 and schema 55.2.0 (the description's
list at lines 103-106 names schema 55.3.0).

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

## Refuted findings

None. Every finding this lens raised was confirmed. What the skeptics and the writer corrected:
- **S1.** Keep the local "not yet run" sentence; frame O9 as issue #41's open question; say the worker's AWS clients and
  `@smithy/core` move; record the mutation and shard rows. The writer added 4eaf7124's 51.8 s.
- **S2.** The telemetry check is by behaviour (`cli-telemetry --status`), not source text; notices and the version check
  by text. The writer flags the interaction with security-supply S1.
- **S3.** The evidence covers all 18 recordings (already run by the security lens's skeptic, 18 of 18), and
  `test:golden` stays in the merge step beside the replay.
- **S4.** The override procedure, with the regeneration first and four gates, replaces any `pnpm update`.
- **N2.** +263/-275 is the lockfile's total, not the whole pull request's (+379/-292).

## What I checked and found sound

### Lockfile and generated files (r1, 20:51Z to 20:55Z)

- `pnpm install --frozen-lockfile` returned 0; `--lockfile-only` left the lockfile unchanged (20:52Z).
- Re-locking from the base lockfile with the head's manifests (`--lockfile-only --ignore-scripts`) gave a lockfile
  byte-identical to the committed one (20:53Z). The only warning was the deprecated `@smithy/core` 3.38.0.
- No `@aws-sdk`, `@smithy`, `stripe` or `aws-cdk` name resolves to two versions. No old or new version string appears
  outside the manifests and the lockfile (ADR 0066 Part 2 holds).
- `pnpm synth --all` wrote nothing (265 cases, 657 unchanged; 8 EMR formats); the tree stayed clean. `watched.ts --write`
  gave 541 lines and no diff (20:55Z).
- No test-matrix row or synth registry entry is needed: no ID names a CDK CLI or egress assertion.

### The new test (r1)

- It is in Vitest's unit project (`vitest.config.ts:80-88`), deterministic (static reads only), and CI's unit job ran
  it (job 124973596293: 7 tests; 407 files passed).
- A full revert to the base settings fails 4 of 7. Red and green by commit (20:58Z):

  | Commit | Result |
  | --- | --- |
  | 692ec2d8 | 3 failed, 3 passed |
  | 42e85263 | 2 failed, 4 passed |
  | 407ec5a3 | 1 failed, 6 passed |
  | The commit after each | green |
  | 8a08c0f8 | its red was the matcher's own cases against the old matcher (`IB-N2-red.log`) |

- `pnpm --filter @tp/infra test`: 25 files, 609 tests. CLI 2.1146.1 honours all three settings (`lib/index.js:307005`,
  `:317577`, `:374172`).

### The synth comparison, redone (r1, 20:57Z)

- The head with its own script against the base with the variables and `--no-notices`. The base's infra and manifests
  are unchanged since bce57f16, so the comparison holds against 43565235.
- tp-dev, tp-staging and tp-production: templates equal as JSON once CDKMetadata Analytics is removed (228, 231 and 230
  resources each side). Parameters, Rules, Conditions, Mappings and Outputs equal; Analytics equal after swapping 2.273.0
  for 2.275.0. The three file assets identical.
- `manifest.json` changes only the template URL hashes, two flag-report entries and `minimumCliVersion` 2.1144.0 to
  2.1146.1; `metadata.json` only adds `aws:cdk:templateFile`; `tree.json`, `validation-report.json` and `cdk.out` only
  version strings. Head template hashes 969871e1, 6ebcd4a6 and e1a13f2d, as described. No output has a `notices` key.

### Mutation selection (r1)

`affected.ts` locally matches CI: packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute and
pricing-rest. Ledger is correctly not affected: it declares `@tp/db`, but nothing in packages/ledger imports it.

### CI on the head (r1, read 21:09Z; r2 re-read: 27 runs)

All runs succeeded except `notify` (skipped).
- **The four required checks:** `all green` success at 20:56:56Z; `mutation` passed (N3's scores);
  `screening-capacity gate` passed, measuring because 7 watched paths changed (six manifests and the lockfile), with the
  O9 warning (S1); `approval-of-record` success on both runs.
- **build** (job 124973596346): `cdk:diff` synthesized with the "no usable AWS credentials" annotation and 85 feature
  flags.
- **static** (job 124973596362): `toolchain:check` passed (35 added versions, 612 entries, 0 errors, 1 warning: pnpm
  10.34.9); `actions:check` no new pin; synth clean; typecheck 22 projects; `test:golden` 5 files (`gate.golden.test.ts`
  52 tests); `test:oracle` 687 fixtures; `licenses:check` 185; audit 1 moderate, as on the base.
- **images** (job 124973596486): Trivy 0 HIGH/CRITICAL on the web image, no ignore entries.
- **db 1-4:** 33+32+32+32 = 129 files, equal to `git ls-files '*.db.test.ts'`; db 2/4 ran 2,615 tests including
  `catalog.db.test.ts`. **e2e 1/2 and 2/2:** 32 passed plus the 4 brand-baseline tests.

### Description and rules (r1)

- All eight template headings are present, with the required-checks marker; the founder's-approval text equals the
  template's.
- Verified counts: 7 tests; 25 files and 609 tests; 265 synth cases and 657 unchanged; 541 watched lines; 35 added
  versions and 612 entries; +249/-261 in a487f133. The one miscount is N2.
- No workflow or GitHub setting changes, no conflict with ADR 0066 or `ci.md` (`ci.md:31` still accurate). The runbook
  sentence's 125-character line matches the file's existing lines of that length.

### Round 2 (2026-11-01T21:53Z to 2026-11-02T01:16Z)

1. **AWS responses** (21:58:58Z, `scripts-ci-r2/parse-r2.cjs`): the checker's 32 cases plus 109 new, 141 in all
   (escapes, control characters, surrogates, long Textract text; null members; `__proto__` and `constructor` keys; 9
   Textract, 11 KMS, 14 Cognito and 8 SES error types; every Bedrock error form; 502 HTML, 503 empty, 500 bad JSON; S3,
   RDS and STS errors). Base and head parse identically except RDS's additive `DBCapacityReservationIdentifier`. No
   prototype pollution. Request-side escapes round-trip 18 of 18 on both.
2. **Textract through a real client:** 13 of 13 MOD-01 recordings, whole and paged, real = stub, base = head (01:05:14Z);
   widened to 18 of 18 by the security skeptic (S3).
3. **The credentialed `cdk:diff` branch**, simulated with an AWS stub, an offline namespace and a fresh `CDK_HOME`
   (22:06:15Z): CLI 2.1146.1 accepts `diff tp-staging --method template --no-notices` (rc 0) and makes exactly
   2.1145.0's calls (GetCallerIdentity twice, the lookup-role AssumeRole denied then "Proceeding with default
   credentials", DescribeStacks, GetTemplate), all within `pull-request-diff-role.ts:8-17`. ssm GetParameter is denied
   and tolerated alike. Real IAM evaluation: not verified.
4. **Context synths** (22:03Z to 22:05Z): empty; operatorEmail and operatorSms; skipMigrations; account and region; launch
   report and attestation, alone and combined; closed. All 21 templates equal base to head once the Analytics version is
   swapped.
5. **TTY network capture** (22:06Z to 22:11Z): `pnpm cdk:diff` with CLI 2.1146.1 makes zero outbound attempts. A bare
   `cdk` from infra/ makes no notices call, but the version check and telemetry still go out (the known residual).
6. **Trial merges** (`git merge-tree`, heads fetched 01:02:41Z): clean with #95, #93, #92, #85 and #84; #91 conflicts
   only in the runbook's AWS paragraph; #90 only in `model-gateway/package.json`; #42 in the web and worker
   `package.json` and the lockfile; #86 and #75 conflict exactly as the base does. The description's claims hold.
7. **Head + #42 with B(6) applied:** one version per `@aws-sdk` and `@smithy` name; infra tests 27 files, 707 passed
   (01:03Z); `deploy-parameters.test.ts:362-364` reads only context; synth base+#42 against head+#42 (01:10Z, offline)
   equal across all six stacks once Analytics is swapped.
8. **Merge-time times** (`npm view`, 01:16:06Z): `aws-cdk` 2.1147.0 2026-10-30T18:57:11Z; cloud-assembly-schema 55.3.0
   18:22:03Z; `client-textract` 3.1161.0 18:52:27Z; `@smithy/core` 3.38.1 23:11:40Z. The builder's "usable from" times
   hold. No form of `pnpm update` touched a `package.json` (design §7's open item), but see S4.
9. **Not verified:** Stripe's API changelog for `2026-10-28.endive` (docs.stripe.com answered 403 at the proxy,
   01:06:39Z). As a stand-in, stripe-node 23.1.0's CHANGELOG lists only additions, `SubscriptionSchedule.pause_schedules`
   made required, and new error types; the 23.0.0 to 23.1.0 type diff removes or retypes no field billing reads.

### Round 3 (2026-11-02T02:41Z to 03:19Z)

- **A1, HTTP transport on a real socket** (02:51Z): 41 cases identical on base, head and regen, including Bedrock over
  h2c (the runtime client defaults to `NodeHttp2Handler` with `disableConcurrentStreams`, which no custom-handler capture
  exercised): slow bodies, 3.5 s silences (no idle timeout), aborts ("timeout" in under 1 s), RST_STREAM, session reset,
  429 throttled, ModelTimeout, 8 and 70 concurrent first calls, keep-alive, clock skew of +20 minutes corrected; S3
  100-continue on parts over 2 MB, 403 at continue, Complete returning 200 with an error body (InternalError after 3
  attempts), 412 ObjectConflictError, checksum mismatches (CRC32, CRC64NVME, SHA256) thrown, composite checksums
  skipped, ranges, truncation, HeadObject, ListObjectsV2 over two pages; SES success and MessageRejected. The
  node-http-handler 4.12.1 to 4.14.0 diff adds only `defaultSocketTimeout`, which no client sets.
- **A2, credential providers:** the eight `credential-provider-*` packages, xml-builder and signature-v4-multi-region
  show 0 changed lines base to head to regen; nested-clients only version strings; middleware-sdk-rds only braces.
  Container credentials (FULL_URI and RELATIVE_URI on 169.254.170.2 in a namespace), 10 scenarios each (refresh inside
  the 5-minute window, cached, expired, 500 then 200, 500 five times, slow, missing Token, malformed, 5 concurrent calls
  sharing one fetch, 4 clients): identical.
- **A4, Stripe** (`stripe-retry.mts`, the real `StripeBillingProvider` and `stripe.ts:52`'s options): 14 scenarios
  identical on 23.0.0, 23.1.0 and regen apart from `Stripe-Version`; every attempt carries the same `Idempotency-Key`;
  23.1.0's new error classes are `generateV2Error` only (`esm/Error.js:47-100`), and billing calls v1 endpoints.
- **A6, production images:** the PR's capacity job ran local providers only, so no AWS client ran there. The worker
  bundles build at base, head and regen and inline 3.1152.0, 3.1160.0 and 3.1161.0; the bundled probe succeeds
  identically on all three.
- **A7:** the freeze-exception "No" holds against `change-order-001.md:10` and `reconciliation-001.md:486-494`. Pinned
  gitleaks 8.24.3 with `ci.yml:108-110`'s flags over 43565235..484e9f06: 13 commits, no leaks (02:59:50Z).
- **A8, the base move:** the base moved to 877e662f (#93, 02:42:44Z). `git merge-tree` clean; on the merged tree,
  `install --frozen-lockfile` passes, `watched.ts --write` leaves 543 lines unchanged, `synth --all` writes 0 of 273
  cases, `affected.ts` gives the same 6 shards, and `toolchain:check` against 877e662f passes (0 errors, 1 warning, 35
  added). screening-capacity will measure the merged head, because the lockfile and manifests are watched paths.

## Proposals outside PR B's files (not built)

- **P1. Hold every direct `@aws-sdk/*` range equal across the workspace** with a test (for example
  `tools/test/no-duplicated-versions.test.ts`), so #42's three `^3.1152.0` ranges cannot merge out of line if B(6) were
  forgotten.
- **P2. Move cdk:diff's environment into `planCdkDiff`** (`infra/lib/cdk-diff-plan.ts`) and assert it in
  `cdk-diff-plan.test.ts`, removing the source parsing in `cli-settings.test.ts` entirely.
- **P3. Cover every documented bare `cdk deploy`** when design P7 lands: `deploy-and-rollback.md:13, 112, 117, 207` and
  also `screening-capacity.md:384`, plus #42's `deploy-and-rollback.md:25, 149, 154, 283` and `deliverability.md:116,
  120`. Deploy through a repository script that sets `CDK_DISABLE_CLI_TELEMETRY` and `CDK_DISABLE_VERSION_CHECK` (and,
  per security-supply S1, leaves notices on). The r2 TTY capture is the evidence that bare runs still reach out.
- **P4. Have `toolchain:check` warn on an npm-deprecated added version** (reinforces design P5 and P-B2-3): CI's static
  job passed with `@smithy/core` 3.38.0 and printed nothing about it.
- **P5. One founder decision on the consumer's size, or a recorded standing answer**, to stop the per-PR O9 noise: it
  appeared at 52.3 s on bce57f16, 51.8 s on 4eaf7124, 55.1 s on #42 and 45.6 s here, and was absent on 43565235 and #90,
  with the consumer unchanged. Record in S1's resolution that the warning is runner variance.
- **P6. A committed wire-level Textract path:** make the evaluation's scan reader a real `TextractClient` answering from
  the recording's bytes through a request handler (exported from `@tp/contracts`, used by `sets.ts:85-92`), paging large
  recordings by NextToken. The set hash then covers the SDK's deserializer and `test:golden` is the ADR 0070 check by
  construction; today's 18 recordings would not move the hash. `scripts-ci-r2/textract-real.mts` and
  `scripts-refute-s2b/replay-set.mts` are models.
- **P7. Bedrock failure mapping** (pre-existing, identical on base and head): a non-JSON 5xx surfaces as `SyntaxError` or
  "Unknown", and an `InvalidSignatureException` after clock skew or an HTTP/2 stream or session reset maps to
  "rejected", which `provider.ts:52-58` does not retry (`bedrock.ts:39-40`; `gateway.ts:333-334`). Map
  `$metadata.httpStatusCode >= 500` or `$fault === 'server'`, skew and transport resets to a retryable code, with tests.
- **P8. The images job's Trivy scan cannot see the worker's npm dependencies** (the worker is one bundled file; worker.tar
  shows only playwright-core and yarn), and the web image lists no stripe, cognito, presigner, kms, textract or bedrock.
  Add a lockfile scan (`trivy fs --scanners vuln pnpm-lock.yaml`) or an SBOM built from the lockfile.
- **P9. Pin the Stripe API version in a test:** a billing unit test asserting `Stripe.API_VERSION` equals a constant
  recorded beside ADR 0050:48, so a stripe bump that moves it fails until a person checks the webhook endpoint's version.
- **P10. The trial result for #42** (base+#42 against head+#42 equal across six stacks; infra 707 tests) can replace the
  description's "Not covered here: #42's new stack" until it is redone on the real merged tree.
- **P11. A committed smoke test of the AWS clients over real sockets and inside the worker bundle**, adapted from
  `scripts-ci-r3/socket.mts`, `creds.mts` and `bundle/zz-r3-probe.ts` with `build.ts`'s esbuild options, run for any
  lockfile move of `@aws-sdk`, `@smithy` or `stripe`. The web image's standalone Next bundle (Cognito, presigner, KMS,
  S3) is not exercised by any CI job and was not verified here.
- **P12. S3 SHA512/XXHASH64 checksums** (pre-existing): `S3SealedBytes.get` throws "checksum algorithm … is not
  supported by the client" when S3 answers with those headers; unreachable with today's CRC32 and CRC64NVME uploads.
- **P13. Stripe's worst-case wait:** 2 attempts in under 70 s at the production 20 s timeout; worth one line in the
  billing runbook.
- **P14. Harness hygiene:** give `timeout` a non-zero duration in every scratch harness. Round 2's netns harness ran
  `timeout 0 tail`, which lingered and held `/tmp/laneb-heavy.lock` from about 01:04Z to 01:08Z; it was killed.
- **P15 (writer's). One wording for the runbook and ADR sentences.** S2 here and security-supply S1 both rewrite
  `dependency-upgrades.md:323-324` and ADR 0012 `:148-160`; write them once, after deciding S1's notices question.
- **P16 (writer's). Record naming.** Design §8.4 (`:758`) names the records
  `lane-b-dependabot-batch-review-{A,B,C}-{ci-infra,security-supply}.md`; these are written as
  `lane-b-dependabot-batch-B-review-*.md`, as for PR A (its P14). Align the design's name with the files.

## Commands and logs

All under `review-B/`:
- **Progress notes:** `progress/ci-infra-r1.progress.md`, `ci-infra-r2.progress.md`, `ci-infra-r3.progress.md`.
- **Round 1:** `logs-ci/` (install, `lockfile-only.log`, `relock-from-base.log`, `synth-*.log`, `watched.log`,
  `infra-test.log`, `percommit.log`, `mutants.log`, `proposed*.log`, `refute-s2-*.log`); scripts in `scripts-ci/`
  (`mutants.sh`, `percommit.sh`, `cmp_synth.py`, `cli-settings.proposed3.test.ts` and `.diff`,
  `cli-settings.refute-s2.test.ts` and `.diff`, `stubbin/`).
- **Round 2:** `logs-ci-r2/` (`parse-r2-{base,head}.json`, `textract-real-*.json`, `diff-sim*.log`, `cmp-ctx.log`,
  `cmp-trial42.log`, `trial42-*.log`, `tty-capture.log`, `affected-{a,c}.out`); scripts in `scripts-ci-r2/`
  (`parse-r2.cjs`, `textract-real.mts`, `regen-sim.sh`, `diff-sim.sh`, `awsstub.py`, `netns-run.sh`, `tty-capture.sh`).
- **Round 3:** `logs-ci-r3/` (`head-checks.log`, `socket-*.json`, `creds*-*.json`, `probe-*.json`, `shape-*.json`,
  `stripe-*.json`, `cli-capture.log`, `regen-*.log`, `schema553*.log`, the dist diffs); scripts in `scripts-ci-r3/`.
- **Skeptics:** `scripts-refute-s2/` and `sim-refute-s2/` (S4); `scripts-refute-s2b/` and `logs-refute-s2b/` (the
  18-recording replay, from the security lens); `logs-ci/refute-s2-final.log` (S2).
- **CI logs:** `tmp/ci-gates-log`, `tmp/ci-cap-history`, `tmp/ci-mut-base`, `tmp/ci-static-log`, `tmp/ci-unit-log`,
  `tmp/r2-images-log`, `tmp/r2-mutation-log-1793581419`, `tmp/dl-ci-logs-r3-5xoS`.
- **The writer's clone:** `clone-writer`, 03:31:57Z to 03:33:29Z, clean, removed. The description readback:
  `tmp/dl-prbody-writer-H9v1/body.md` (03:33:04Z).
