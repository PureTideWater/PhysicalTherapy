# PR #94 (dependabot-batch, PR B: aws-cdk-lib 2.275 with its CLI, @aws-sdk and stripe) review: security and supply chain

Written 2026-11-02 from 03:37Z (`date -u`: Mon Nov 2 03:37:25 UTC 2026). It records the adversarial reviewer for
security and supply chain across three rounds (2026-11-01T20:50Z to 2026-11-02T03:11Z) and the skeptics' verdicts (r1
2026-11-01T21:27Z to 21:31Z; r2 2026-11-02T01:21Z to 02:26Z). Round 3's findings are nits and had no skeptic. This file
is not committed.

- **Pull request:** #94, `co-001/deps-aws-cdk-minor-patch`, replacing Dependabot #88 (`aws-cdk` group) and #89
  (minor-and-patch). Draft, 15 commits, 13 files, +379/-292 (`pull_request_read get`, 03:32Z).
  - `aws-cdk-lib` `^2.275.0` with the `aws-cdk` CLI `^2.1146.1` (the lib requires CLI >= 2.1146.1);
  - the CDK CLI's telemetry, notices and daily version check off for every cdk run in infra (the synth script's env and
    flags, `cdk.json` top-level `notices: false`, `infra/scripts/cdk-diff.ts`'s env), held by
    `infra/test/cli-settings.test.ts`; an ADR 0012 amendment and a runbook sentence;
  - the ten `@aws-sdk` ranges (nine packages, infra's `client-sts` included) at `^3.1160.0` in six manifests; `stripe`
    `^23.1.0` in packages/billing (Stripe API version `2026-10-28.endive`, because `stripe.ts` pins none);
  - lockfile +249/-261 in a487f133, with `@smithy/core` 3.38.0 (npm-deprecated; 3.38.1 arrives with the merge-time
    regeneration after 2026-11-02T23:12Z).

  The synth comparison of tp-dev, tp-staging and tp-production stands in for the credentialed `cdk:diff`. B(6), aligning
  #42's three `@aws-sdk` ranges, waits for #42's merge.
- **Head:** `484e9f068199d25711e5d6c69fff485223186538` (2026-11-01T20:41:23Z). `git ls-remote` at 03:31:52Z: unchanged.
- **Base:** `claude/build-platform` at `43565235`; the branch has since moved to `877e662f` (`mergeable_state: behind`).
  Round 3 merged it locally: clean, no manifest or lockfile line moves (sound, round 3, item 8).
- **Lens:** security and supply chain (design `designs/lane-b-dependabot-batch.md` §8.4): every added version's age,
  integrity, publisher, provenance, licence and install scripts; the deprecation; what our code sends to AWS and Stripe
  and what comes back; what the CDK CLI sends and fetches; tenancy, keys and logging; the merge-time regeneration. Rounds
  2 and 3 took the critic's areas: AWS responses through our code, the golden stub, the credentialed diff, trial merges,
  Stripe types and retries, real-socket transport, credentials, the production bundle and the regeneration's 30 moves.

How the review was done:
- **Clones.** Each round worked in its own fresh blobless clone under `review-B/` (`clone-secsupply`,
  `clone-secsupply-r2`, `clone-sec-r3`) with base worktrees at 43565235 and, in r3, regen-simulation and merged
  worktrees. Each was installed with `pnpm install --frozen-lockfile`; heavy commands ran under
  `flock /tmp/laneb-heavy.lock`. All were removed (r1 at 21:10:22Z; r3 at 03:10Z to 03:11Z).
- **Downloads.** Tarballs and registry documents each went into a new empty directory under `review-B/tmp/` and were
  integrity-checked against the lockfile before reading.
- **GitHub, read only.** `pull_request_read` and job logs through `gh api`. Nothing was pushed, commented, reviewed,
  approved or merged.
- **Writer's spot check (03:31Z to 03:33Z).** In a fresh blobless clone (`review-B/clone-writer` at 484e9f06, clean,
  removed 03:33:29Z) these were re-read and matched: `infra/cdk.json:7-8`; `infra/package.json:8`;
  `infra/lib/cdk-diff-plan.ts:25, 29, 39`; `infra/scripts/cdk-diff.ts:8`; `infra/test/cli-settings.test.ts:6-8, 16-26,
  35-52`; ADR 0012 `:3, 148-160`; `dependency-upgrades.md:295-325` (no Stripe entry: `grep -n -i stripe` empty);
  `deploy-and-rollback.md:13, 112, 117, 207`; `screening-capacity.md:384`; `docs/runbooks/billing.md:13-17`;
  `packages/billing/src/stripe.ts:50-52`; `packages/billing/src/events.ts` (exists); `eval/sets.ts:71, 79-92`;
  `gate.golden.test.ts:311, 316`; ADR 0070 `:180-181, 374-375`; `affected.ts:112-118`; `pnpm-workspace.yaml:33-34, 44`;
  `check.ts:788-797`; `bedrock.ts:39-40`; `pnpm-lock.yaml:2191-2194, 2208, 2529-2530, 5290`.
- **The description** was read back read-only at 03:33:04Z (`review-B/tmp/dl-prbody-writer-H9v1/body.md`, 367 lines,
  last updated 2026-11-01T20:48:27Z). Line numbers below are that readback's.
- **Paths.** `review-B` means
  `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-B`. Commit hashes
  are shortened to 8 hex; any other 64-hex digest to 8 hex and an ellipsis. All data is synthetic.

## Verdict

**0 B, 3 S, 11 N.** Nothing blocks the merge. No request our code sends changes apart from the user-agent's SDK version
and Stripe-Version; no response our code reads parses differently apart from one additive RDS field; every added version
keeps its publisher, provenance and licence; and no AWS client passes a logger, so the `@smithy/core` deprecation does
not reach us. The three S findings:
- **S1.** `cdk.json`'s top-level `notices: false` hides CDK's version-matched and bootstrap security notices from a
  person's production deploy, and adds nothing for automated runs, which already pass `--no-notices`.
- **S2.** The merge-time `@smithy/core` 3.38.1 step does nothing in one form and makes unreviewed test-tooling moves in
  the other. A validated override procedure replaces it.
- **S3.** `test:golden`, cited as the ADR 0070 check for the `client-textract` bump, never runs the SDK's Textract
  deserializer. A manifest-driven real-client replay (18 of 18 equal) is the evidence that does.

The eleven N findings are records (N1, N4, N5, N6, N7, N9), test blind spots (N2, N3), the reviewer rows (N8), the merge
plan (N10) and stale counts (N11).

Several findings were also raised by the CI and test-infrastructure lens
(`lane-b-dependabot-batch-B-review-ci-infra.md`). Where both rated an issue, the fix round takes the higher rating and
one fix:
- S2 here is S4 there (CI-B-R2-S2); S3 here is S3 there (CI-B-R2-S1). Both S on both sides.
- N2 and N3 here overlap N1 there (CI-B-N1): one test rewrite covers the three (see N2's writer's note).
- N8 here is N4 there (CI-B-R2-N1); N11 here is N5 there (CI-R3-N1); N10 and N9 here overlap N7 there (CI-R3-N3).
- **Interaction.** S1 here and CI S2 (a test that the installed CLI still reads the settings) touch the same test, ADR
  sentence and runbook sentence. If S1 drops `"notices": false`, CI S2's notices assertion must hold the `--no-notices`
  flag path instead of the settings read.

## Findings

### S1 (security-supply-r1-SEC-B-S1). `cdk.json`'s top-level `notices: false` hides CDK's version-matched and bootstrap security notices from a person's production deploy; both scripts already pass `--no-notices`, so it adds no protection to automated runs

**Where:** `infra/cdk.json:8`; also ADR 0012 `:148-160` and `infra/test/cli-settings.test.ts:50-52` (and the comment at
`:6-8`).

**Scenario:** AWS publishes a CDK notice for `aws-cdk-lib` 2.275.x, CLI 2.1146.x or the bootstrap stack version our
environments use (a construct granting too much, or a bootstrap trust-policy problem). Before this pull request, a person
running `cdk deploy tp-production …` from infra/ (`deploy-and-rollback.md:13, 112, 117, 207`; `screening-capacity.md:384`)
saw it on stderr. After it, nothing is fetched or shown, and no step replaces it. Bootstrap notices are matched only
while the toolkit validates the bootstrap stack, so a deliberate `cdk notices` cannot show them either. CI and the synth
script lose nothing if the setting goes: both pass `--no-notices`.

**Evidence:**
- **No effect on automated runs.** `infra/package.json:8` (`synth … --no-notices`) and `infra/lib/cdk-diff-plan.ts:25, 29`
  (both the diff and the synth fallback) already pass the flag. The workflows run the CLI only through `pnpm cdk:diff`
  (`ci.yml:492`; `git grep -i cdk -- .github` finds nothing else). So the setting changes only a person's own `cdk`
  commands from infra/, where cdk.json carries the app.
- **It does suppress them there.** aws-cdk 2.1146.1 downloaded with `npm pack` into a fresh directory, sha512 equal to
  `pnpm-lock.yaml:2530`. In `lib/index.js:374168-374191`, `argv.notices` wins; otherwise the `notices` setting decides,
  and when false the destination is "drop" and `refresh()` is never called; display (`:374253`) needs
  `shouldDisplayNotices`. Skeptic's test at 2026-11-01T21:29:27Z (telemetry and version check off, `cdk context -vv`):
  with the key, the merged settings showed `notices: false`, no fetch and no cache written; without it, "Could not
  refresh notices: HttpStatusError … 403" (this sandbox's proxy) and a cache directory created. Finder's control at
  21:08:33Z with `--notices`: the CLI tried `cli.cdk.dev-tools.aws.dev`. The channel is live.
- **Bootstrap notices are deploy-path only.** `addBootstrappedEnvironment` (`:115570`) is called only from `doValidate` in
  `EnvironmentResources.validateVersion` (`:115919`), whose only caller `validateBootstrapStackVersion` (`:116662`) is
  called only from `deployStack` (`:116369`), `rollbackStack` (`:116482`) and `buildSingleAsset` (`:116609`).
  `NoticesFilter` (about `:115160-115215`) builds bootstrap components only from those environments. So `cdk notices`
  (`:374247-374252`, forced refresh) shows CLI, framework and Node notices, never bootstrap ones.
- **The channel carries security items.** The public feed source (cdklabs/aws-cdk-notices `data/notices.json`, fetched
  21:29:59Z) includes 31885 "(cli): Bootstrap stack outdated" (bootstrap < 21, "rebootstrap"), 27964 "bootstrap template
  can result in public access for bootstrap buckets", 25356 "(pipelines) … overly permissive trust policy", 25674 "(eks)
  … overly permissive trust policies" and 36239 "(ecs-patterns) … can cause replacement". Bootstrap-stack state is
  deployed state that Dependabot cannot see; `git grep -iE 'bootstrapVersion|cdk bootstrap'` in infra and docs and
  `git grep -i notice docs/runbooks` find no other check.
- **Turning it off protects little.** `WebsiteNoticeDataSource` (`:115437`) does a plain HTTPS GET of
  `https://cli.cdk.dev-tools.aws.dev/notices.json` with no project data, cached an hour (`TIME_TO_LIVE_SUCCESS =
  60*60*1e3`, `:115022`, used at `:115064`), filtered locally. Telemetry is the separate leak (N1).
- The design weighed only the fetch (`lane-b-dependabot-batch.md:40` and `:372-376`). Two smaller inaccuracies sit in
  text the fix rewrites anyway: "fetches notices on every command" (ADR 0012 `:150`, test comment `:6`) is wrong, because
  the fetch is cached for an hour.

**Fix (the skeptic's corrected fix: drop the setting and scope the claim to the repository's own runs; one commit):**
1. `infra/cdk.json`: delete line 8 and the comma after `"context": {}` on line 7, restoring the base bytes (blob
   58f9fe26).
2. `infra/test/cli-settings.test.ts:50-52`: replace the test with
   `it("leaves notices to the CLI default for a person's own cdk commands: cdk.json sets no notices key", () => {
   expect(cdkJson).not.toHaveProperty('notices'); });`. Keep `:31-43`, which hold `--no-notices` on every direct script.
3. The same file, `:6-8`: reword the comment to say the CLI posts telemetry on every command, fetches notices (cached an
   hour) and on a terminal checks npm daily; the repository's scripts turn all three off by variable and
   `--no-notices`; `cdk.json` sets none of them, so a person's own `cdk deploy` still shows notices matched to our CLI,
   constructs, Node and bootstrap stack; context stays empty. Retitle the describe to "the repository's cdk runs send no
   telemetry, fetch no notices and skip the version check".
4. ADR 0012 `:148-160`: heading "…: the CDK CLI's telemetry and version check off, and notices off in the repository's
   scripts"; "fetches notices (an anonymous GET of a public file, cached an hour)"; replace the `cdk.json` clause with
   "notices stay on for a person's own `cdk` commands from `infra/` (docs/runbooks/deploy-and-rollback.md), where they
   carry advisories matched to our CLI, construct, Node and bootstrap-stack versions. Bootstrap notices are matched only
   while a deploy, rollback or asset publish validates the bootstrap stack, so nothing else can show them."; say the test
   holds that `cdk.json` sets no `notices` key; in "Revisit when", read `canCollectTelemetry`, `--no-notices` and
   `shouldDisplayVersionMessage`.
5. `dependency-upgrades.md:323-324`: "the `notices` setting" becomes "`--no-notices`", in both places.
6. Re-run `pnpm --filter @tp/infra test` and synth; templates do not change (notices never reach `cdk.out`).

The finding's fallback (keep `notices: false` and add a weekly `cdk notices`) is inferior: it can never show bootstrap
notices such as 31885, so it is not an equivalent option.

**Skeptic:** Confirmed (git show at 484e9f06 after a fetch at 21:27:59Z; the 2.1146.1 tarball read at 21:29Z; download
and script directories removed 21:30:59Z; no clone). Precision: bootstrap notices are matched on deploy, rollback and
asset publishing, not only deploy. Proposals P3 and P4 below come from this verdict.

**Writer's note:** CI-infra S2 adds a test that the installed CLI still reads the notices setting. With this fix, the
repository depends on `--no-notices` instead, so that assertion should hold the flag path (`argv.notices`, 2.1146.1
`lib/index.js:374166-374191`); write the runbook and ADR sentences of both findings once.

### S2 (security-supply-r2-SEC-B-R2-S1). The merge-time `@smithy/core` 3.38.1 step does nothing in one form and makes unreviewed test-tooling moves in the other

Also raised by CI and test infrastructure as CI-B-R2-S2 (S4 there).

**Where:** PR #94 description, the "`@smithy/core` 3.38.0 is npm-deprecated" bullet (line 160) and "Merge order" (lines
261-264); design §7 (`lane-b-dependabot-batch.md:636-640`); `pnpm-lock.yaml`.

**Scenario:** After 2026-11-02T23:12Z the builder runs the described step ("re-resolved with pnpm's update command
(lockfile only) and every `package.json` is diffed afterwards"):
- the root form `pnpm update @smithy/core --lockfile-only` exits 0, keeps the deprecated 3.38.0, and still changes the
  lockfile (+79/-69);
- the recursive form `pnpm -r update @smithy/core --lockfile-only` takes 3.38.1 but also moves vite 8.3.4's dependencies:
  rolldown 1.2.15 to 1.2.16 (with its platform bindings), postcss to 8.5.32 and `@oxc-project/types` 0.155.0 to 0.156.0.
  These sit below vitest, so `affected.ts:112-118` marks money, pricing, ledger and packets affected: 7 shards, not 6.
  None is in the version table, no changelog was read, and a `package.json` diff cannot show them;
- the filtered form keeps 3.38.0 and still moves them.

**Evidence:**
- Finder (worktree efddfb48: the head with `^3.1161.0`, `^2.1147.0` and `minimumReleaseAge` 2700). Install alone keeps
  3.38.0 and moves nothing else (22:10:58Z). Root update (01:06:52Z): rc 0, WARN deprecated `@smithy/core@3.38.0`,
  `+rolldown@1.2.16 -rolldown@1.2.15 +@oxc-project/types@0.156.0 +postcss@8.5.32`
  (`logs-secsupply-r2/regen-sim2-update-root.log`). `-r` update (01:10:02Z): 3.38.0 to 3.38.1 plus the same moves
  (+112/-103), no `package.json` changed. Filtered (01:10:33Z): 3.38.0 kept, same moves. `affected.ts` on the `-r`
  result (01:11:25Z): "money: affected by pnpm-lock.yaml moves @oxc-project/types@0.155.0 … and 33 more", and 7 shards
  with money-ledger. Publish times (`npm view`, 22:10Z): rolldown 1.2.16 2026-10-29T14:31:26Z, `@oxc-project/types`
  0.156.0 10-27, postcss 8.5.32 10-26, all past the 72-hour floor, so `toolchain:check` would not stop them.
- Skeptic, fresh clone with pnpm 10.34.8 and `minimumReleaseAge` reset before each run so the cutoff falls at
  2026-10-30T23:12-23:13Z (`scripts-refute-smithy/run-sim.sh`). Install-only (01:32:36Z) moves only the `@aws-sdk`
  family, `@smithy/signature-v4` and aws-cdk and keeps 3.38.0. Root (01:38:48Z) +79/-69, 3.38.0 kept (it printed
  "Packages: +340", not "Already up to date"). `-r` (01:41:11Z) +112/-103. `--filter @tp/db` (01:41:20Z) and `-r update
  '@smithy/core@3.38.1'` (01:42:39Z) keep 3.38.0 and still move the vite subtree. `affected.ts --base 43565235`: the real
  head (02:07:20Z) and install-only (02:10:12Z) give 6 shards; `-r` (02:10:36Z) gives 7.
- Skeptic's override sequence: add `'@smithy/core': 3.38.1` under `overrides:` and install (01:52:29Z), remove and
  install (01:52:38Z): +33/-34, only `@smithy/core@3.38.0` to `@smithy/core@3.38.1`, no override left, no deprecation
  warning; a further install changes nothing (02:26:19Z); its `@smithy/core` lines equal the `-r` result's; 6 shards
  (02:12:05Z).
- Impact limit: CI's mutation job recomputes the selection on the committed head, so money-ledger would still run in CI.
  The cost is a stale description, extra shards and versions whose notes nobody read, not silently missing coverage.

**Fix (the skeptic's corrected fix):** in the bullet, "Merge order" and design §7, replace the update step with one that
moves only `@smithy/core`:
1. Temporarily add `'@smithy/core': <V>` under `overrides:` in `pnpm-workspace.yaml` (V the newest version past 4,320
   minutes: 3.38.1 from 2026-11-02T23:11:40Z) and run `pnpm install --lockfile-only`.
2. Remove the line (`git diff --exit-code pnpm-workspace.yaml`), run `pnpm install --lockfile-only` again, then a third
   time to confirm no change. No override is committed (`check.ts:788-797` would need an `overrides.json` entry).
3. Guard with the lockfile: `git diff pnpm-lock.yaml | grep -E "^[-+]  '?[@a-z]"` lists only `@smithy/core@3.38.0` and
   `@smithy/core@<V>`; `git diff --exit-code -- '*package.json' pnpm-workspace.yaml` passes; `toolchain:check` reports
   exactly one added version for this step.
4. Re-run `tsx tools/stryker/affected.ts --base origin/claude/build-platform`: still the 6 shards, or update "Stryker
   shards CI selects".
5. Do not use `pnpm update` for this in any form. If anything else moves anyway (from the base merge), handle each name
   under the versions rule (a version-table row with age, provenance and licence; its changelog read; the selection
   recomputed and restated). Add one sentence to "Stryker shards CI selects" that the merge-time selection is recomputed
   and recorded there.

**Skeptic:** Real; could not refute, re-run in a fresh clone under a tighter window (logs
`review-B/logs-refute-smithy/`; clone and worktrees removed). Not verified: pnpm versions other than 10.34.8, and a base
that moves before the merge. The finder's fix (accept and review the side moves) works but is not the best option.

### S3 (security-supply-r2-SEC-B-R2-S2). `test:golden`, cited as the ADR 0070 check for the `client-textract` bump, never runs the SDK's Textract deserializer

Also raised by CI and test infrastructure as CI-B-R2-S1 (S3 there).

**Where:** PR #94 description, "ADR 0070 and `test:golden` for `client-textract`" (lines 220-225) and "Merge order"
(lines 261-264: "each time with the synth comparison, `test:golden` …"); `packages/model-gateway/eval/sets.ts:79-83`.

**Scenario:** A `client-textract` or `@smithy/core` release changes how GetDocumentTextDetection's JSON is deserialized
(null members, numeric strings, escapes, the `hasOwn` guards this bump brings). `test:golden` still passes with an
unchanged `set_sha256`, because `recordedTextractClient`'s `send` returns plain objects built from the recording. ADR
0070 `:180-181` and `:374` then believe the pages as read are unchanged when they may not be. The 3.1161.0 regeneration
repeats the same blind check.

**Evidence:**
- `sets.ts:79-83` resolves `{ JobStatus, DocumentMetadata, Blocks }` with no `TextractClient`; `sets.ts:253` is the only
  way the evaluation reads a scan; `scan.ts:48, 56, 67` send every Textract call through `options.client.send`. Only the
  command constructors of `@aws-sdk/client-textract` run.
- `gate.golden.test.ts:311` and `:316` compare `set_sha256` with a hash computed from the stub's pages
  (`sets.ts:270-278`). No committed test drives a real client on a response body (`git grep TextractClient`;
  `evidence.test.ts:201-229` also stubs `send`).
- The bump moves exactly that code: the description's own "What was read" says the JSON codec moves into `@smithy/core`
  with `hasOwn` guards and a string-escape fix. The description relies on the blind check twice.
- Finder's replay (`scripts-secsupply-r2/responses.mts:100-139`, 22:02Z) drove `TextractPageReader` through a real client
  over the 13 MOD-01 recordings, whole and paged: base equal to head in all 187 cases, and real equal to stub on all 13.
- **Skeptic's manifest-driven replay** (`scripts-refute-s2b/replay-set.mts`, 01:41:14Z to 01:41:19Z) served every
  recording the set hash covers: C28-C40, V05, V14, V15, V18 and the generated L03 (2,546 blocks, 80 pages, 3 responses),
  whole and in NextToken pages of at most 1000 blocks. Real equals stub on 18 of 18 at base (3.1152.0, `@smithy/core`
  3.36.0) and at head (3.1160.0, 3.38.0), base equals head (`logs-refute-s2b/replay-{base,head}.json`). The checker's
  one-response parse (`build/c2/shape/parse.cjs:52`) agrees.
- **The edge-case divergence, isolated** (`scripts-refute-s2b/stubdiff.mjs`, 01:34Z): the only difference is a block
  with `"Text": null`, which the stub keeps (page 2 gains a trailing "\n") and the SDK drops. Control characters,
  escapes, lone surrogates, Confidence "NaN" and `__proto__` keys agree. `sets.ts:71` (`Text: z.string().optional()`)
  refuses a null `Text`, so the case cannot reach the set.

**Fix (the skeptic's corrected fix):**
1. Rewrite "ADR 0070 and `test:golden` for `client-textract`": `test:golden` passed (5 files, 376 tests, `set_sha256`
   equal for both local entries) but cannot detect a `client-textract` or `@smithy/core` change, because
   `recordedTextractClient` answers without a `TextractClient`. The SDK-path evidence is the real-client replay of all
   18 recordings (a real `TextractClient` with a request handler, sending nothing, through `TextractPageReader`, whole
   and paged): pages equal the stub's at 3.1152.0 / 3.36.0 and at 3.1160.0 / 3.38.0, base equal to head. The stub
   differs from the SDK only on a null `Text`, which the loader refuses. So there is no `set_changed`, by a check that
   could have seen one.
2. "Merge order": "each time with the synth comparison, `test:golden`, the Textract real-client replay over the set
   manifest (all recordings, generated ones included, base against the merged tree) and `toolchain:check` again". A
   recording whose real-client pages differ from the stub's or the base's is a set change under ADR 0070 `:259` and
   `:374`: the bump does not merge until the two-step re-baseline is done.
3. List the replay script and its outputs with the session's records, as for the request captures.

The durable fix is proposal P1 below.

**Skeptic:** Real (git show of 484e9f06 after a fetch at 01:32Z, and a fresh clone, since removed). Corrected: the
finder's replay covered 13 of the 18 recordings; "not equivalent on edge cases" overstated a single, unreachable
difference; and `test:golden` stays in the merge step beside the replay, not swapped out.

### N1 (security-supply-r1-SEC-B-N1). The ADR amendment does not record what stays open: a person's bare `cdk deploy` from infra/ still sends CLI telemetry and runs the version check, and the description's headline overclaims

**Where:** ADR 0012 `:150-160`; PR #94 description, "What changes", bullet 2 (line 12: "The CDK CLI sends nothing it does
not need to").

**Scenario:** A person deploys production with the documented command (`cdk deploy tp-production -c
tp:launchReport=…`: `infra/lib/screening-launch.ts:15`, `tools/screening-capacity/launch-check.ts:20`,
`infra/lib/app.ts:8, 13`, `deploy-and-rollback.md:13, 112, 117, 207`, `screening-capacity.md:384`). The CLI posts
telemetry to `cdk-cli-telemetry.us-east-1.api.aws` and, on a terminal, queries `registry.npmjs.org`. The amendment reads
as if the CLI's telemetry were closed for infra/. The telemetry is sanitized (no PHI), so this is a record gap, not a
leak.

**Evidence:** `lib/index.js:307004-307010`: `canCollectTelemetry` reads only `CDK_DISABLE_CLI_TELEMETRY`, context
`cli-telemetry` and argv `version-reporting`; no `cdk.json` setting other than context turns it off, and
`--no-version-reporting` also removes `AWS::CDK::Metadata`. `:308843-308885`: argument values "<redacted>", only
feature-flag context, as booleans. Control run at 21:08:33Z with no variables: the telemetry sender
(`telemetry/sender-bundle.js`) opened TLS to `cdk-cli-telemetry.us-east-1.api.aws`, and the version check opened
`registry.npmjs.org` twice (`logs-secsupply/netlog-control5.log`).

**Fix:** One sentence in the amendment: "A person's own `cdk deploy` from infra/ still sends telemetry and, on a
terminal, runs the version check unless both variables are set; only a context key or the variable can turn telemetry
off, so until a repository deploy script exists the deploy commands are run with `CDK_DISABLE_CLI_TELEMETRY=true
CDK_DISABLE_VERSION_CHECK=true`." Reword the headline to "The repository's CDK scripts send nothing they do not need
to", and keep the pointer to P7. If S1's fix lands, the same sentence says notices stay on there on purpose.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N2 (security-supply-r1-SEC-B-N2). The "every infra script that runs the CLI directly" rule allows only listed launchers, so common spellings slip through with telemetry on

Overlaps CI-infra N1 (CI-B-N1).

**Where:** `infra/test/cli-settings.test.ts:16-21, 35-43`.

**Scenario:** A later script such as `"deploy:staging": "npm exec -- cdk deploy tp-staging"`, `env AWS_PROFILE=x cdk
deploy`, `node_modules/.bin/cdk deploy`, `bunx cdk deploy`, `pnpm -s cdk deploy`, `pnpm --silent exec cdk deploy`,
`cross-env A=1 cdk deploy` or `tsc && (cdk ls)` carries none of the three settings, and all 7 tests pass.

**Evidence:** The test's own `launcher`, `directCdk` and `runsCdkDirectly`, copied verbatim and run with node at 21:03Z,
return false for all 12 such spellings ("MISSED npm exec -- cdk deploy tp-staging", …, "MISSED tsc && (cdk ls)").

**Fix:** Fail closed instead of listing launchers: every script whose command contains the cdk command word must carry
all three settings, for example `const mentionsCdk = (c: string) => /(?<![\w-])cdk(?![\w:.-])/.test(c);`. It excludes
`cdk:diff` and `scripts/cdk-diff.ts`, matches `node_modules/.bin/cdk`, and today selects only `synth`. Add the 12
spellings as true cases and keep the existing false cases.

**Writer's note:** apply `mentionsCdk` per command part and require each part's own prefix and `--no-notices` (CI-infra
N1 (a)), so `… && cdk ls` is caught too; with that, CI-infra N1 (c) (widening the launcher) is unnecessary.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N3 (security-supply-r1-SEC-B-N3). The cdk:diff env assertion passes when `...process.env` is spread after the settings, which lets the parent environment switch telemetry back on

Overlaps CI-infra N1 (CI-B-N1 (b)).

**Where:** `infra/test/cli-settings.test.ts:24-26, 45-48` (subject `infra/scripts/cdk-diff.ts:8`).

**Scenario:** `cdk-diff.ts:8` is rewritten as `env: { CDK_DISABLE_CLI_TELEMETRY: 'true', CDK_DISABLE_VERSION_CHECK:
'true', ...process.env }`. A shell or CI step that exports `CDK_DISABLE_CLI_TELEMETRY=0` or an empty
`CDK_DISABLE_VERSION_CHECK=` now wins: the CLI sends telemetry and, on a terminal, checks its version. The test stays
green.

**Evidence:** The test's `envObject` and both regexes on that mutant (21:04Z): "telemetry assertion passes: true  version
assertion passes: true". The child env becomes `{CDK_DISABLE_CLI_TELEMETRY:'0', CDK_DISABLE_VERSION_CHECK:''}`:
telemetry on (`index.js:307005` accepts only "true" or "1"), version check on (`:317577`).

**Fix:** Assert the order: `expect(cdkDiffEnv).toMatch(/\.\.\.process\.env[\s\S]*\bCDK_DISABLE_CLI_TELEMETRY:\s*'true'/)`
and the same for `CDK_DISABLE_VERSION_CHECK`, with a matcher case for the reordered mutant (expected false). If CI-infra
N1 (b)'s behavioural test replaces the regex, start it with those two hostile values in the parent env instead.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N4 (security-supply-r1-SEC-B-N4). The supply-chain account leaves out the four packages `aws-cdk-lib` bundles that moved, among them a new package and a minimatch inside the open advisory's range; `toolchain:check`, `licenses:check` and `pnpm audit` cannot see them

**Where:** PR #94 description, "The lockfile's moves" and "What waits on a person" (the minimatch line).

**Scenario:** A reader takes "35 added versions" as all third-party code this pull request adds. `aws-cdk-lib` 2.275.0
also ships bundled `cloud-assembly-api` 2.2.6 to 2.5.0, `fs-extra` 11.3.6 to 11.4.1, `minimatch` 10.2.5 to 10.2.6 and a
new `json-source-map` 0.6.1. The description says the moderate advisory (minimatch, GHSA-g3hv-75wg-m249) comes through
`@stryker-mutator/core`, "a development tool this pull request does not move"; the pull request also moves the minimatch
bundled in `aws-cdk-lib`, still in the advisory's `<11.0.1` range. The base's 10.2.5 was in range too, so nothing
regresses, and the globs are our own asset patterns at synth time.

**Evidence:** Installed `aws-cdk-lib` 2.275.0 against the 2.273.0 tarball (integrity checked), 21:00Z: exactly those four
lines differ (`logs-secsupply/cdklib-2.27{3,5}.0-bundled.txt`). Registry, 21:00:30Z: `json-source-map` 0.6.1 published
2019-08-07, MIT; `fs-extra` 11.4.1 2026-09-22; `minimatch` 10.2.6 2026-07-27; `cloud-assembly-api` 2.5.0 2026-10-08,
with the same aws/aws-cdk-cli `release.yml` provenance as before. `pnpm audit --json` (20:59:59Z): minimatch `<11.0.1`,
paths only via `@stryker-mutator/core`.

**Fix:** One line in the description: "`aws-cdk-lib` bundles (not in the lockfile, so not seen by `toolchain:check`,
`licenses:check` or `pnpm audit`): `cloud-assembly-api` 2.5.0, `fs-extra` 11.4.1, `minimatch` 10.2.6 (in
GHSA-g3hv-75wg-m249's range, as the base's 10.2.5 was; synth-time globs of our own) and new `json-source-map` 0.6.1 (2019,
MIT)."

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N5 (security-supply-r1-SEC-B-N5). The upgrades runbook has no Stripe entry; each stripe minor moves the pinned API version of every request, and the matching person's check lives only in this pull request's description

**Where:** `docs/runbooks/dependency-upgrades.md:295-325` ("The upgrades made on purpose"; this pull request edits
`:321-324`).

**Scenario:** Next month Dependabot's minor-and-patch group takes a stripe minor that pins a newer API version. The
triage has entries for Next, pg-boss, Playwright, TypeScript, the Anthropic SDK and AWS, but nothing tells the reviewer
that every request's Stripe-Version moves while webhook payloads, which billing parses with its own schema
(`packages/billing/src/events.ts`), follow the webhook endpoint's API version set in the dashboard.
`docs/runbooks/billing.md:13-17` creates the endpoint without saying which version to choose.

**Evidence:** stripe 23.1.0 `cjs/apiVersion.js`: `2026-10-28.endive` (23.0.0: `2026-09-30.endive`). `stripe.ts:50-52`
passes no `apiVersion`. ADR 0050:48 says only "at the API version its release pins". `grep -n -i stripe
docs/runbooks/dependency-upgrades.md` finds nothing (writer, 03:33Z).

**Fix:** A bullet beside "AWS": "**Stripe.** billing passes no `apiVersion` (ADR 0050), so a stripe release that changes
its pinned API version (its CHANGELOG says so) changes every request's `Stripe-Version`; webhook payloads follow the
endpoint's own API version, set in the dashboard: read the version change notes against `packages/billing/src/events.ts`
and record the endpoint's version in the pull request (a person's check)." #91 also edits this section; whichever
merges second keeps both.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N6 (security-supply-r1-SEC-B-N6). "Byte-identical Stripe requests" skipped the user-agent and telemetry headers, and the description does not say that Stripe's SDK telemetry is on by default (it predates this pull request)

**Where:** PR #94 description, "What reaches AWS and Stripe", third bullet (line 180).

**Scenario:** A reader concludes that only Stripe-Version reaches Stripe differently and that nothing else of note is
sent. The harness removed `user-agent`, `x-stripe-client-user-agent` and `x-stripe-client-telemetry` before comparing.
Those carry the OS platform and release, a persistent per-host `telemetry_id` (the SDK also writes
`~/.config/stripe/telemetry_id`) and the previous request's id and duration. Unchanged between 23.0.0 and 23.1.0.

**Evidence:** `build/c2/stripe/harness.mts:34` filters the three headers. stripe 23.1.0 `cjs/stripe.core.js:208`
(`_enableTelemetry = props.telemetry !== false`), `:431-449`, `RequestSender.js:295-296, 344-352`,
`platform/NodePlatformFunctions.js:50-98`. `stripe.ts:52` sets no `telemetry`. `diff` of `stripe.core.js` 23.0.0 against
23.1.0 shows only `PACKAGE_VERSION`.

**Fix:** "… byte-identical apart from Stripe-Version, comparing bodies and every header except user-agent,
X-Stripe-Client-User-Agent and X-Stripe-Client-Telemetry, which were excluded. Those carry Stripe's SDK telemetry (OS
platform and release, a persistent telemetry id, last-request metrics), on by default and unchanged by this pull request;
see the proposal to set `telemetry: false`."

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N7 (security-supply-r2-SEC-B-R2-N1). "No AWS client passes a logger" overlooks the CDK CLI, whose own SDK clients log through a pre-fix redaction filter

**Where:** PR #94 description, the "`@smithy/core` 3.38.0 is npm-deprecated … We are not exposed" bullet; aws-cdk 2.1146.1
`lib/index.js:374196, 304909, 290983, 22781`.

**Scenario:** A person runs `cdk diff -vvv` (or any CLI command at trace level) from infra/. The CLI's `SdkProvider` is
built with `logger: new IoHostSdkLogger(…)` (`:374196` on the main path, `:304909` in the toolkit), which emits
`CDK_SDK_I0100` at trace level (`:88233`, `:290983`). Its bundled `schemaLogFilter` (`:22781`) is the pre-fix version and
does not recurse into list or map members. The merge-time move to `@smithy/core` 3.38.1 does not reach the CLI's bundled
copy. Nothing is exposed today: our stacks have no docker assets (no ECR token), and the diff path's calls (STS,
CloudFormation DescribeStacks and GetTemplate, SSM version) carry no such member.

**Evidence:** Read at 01:11Z in the installed CLI: `schemaLogFilter` returns the sensitive marker for a list only when the
value schema itself is sensitive, and recurses only into structures. 2.1145.0 has the same code (`:22778`, 22:06Z). The
fixed `@smithy/core` 3.38.1 recurses (`dist-cjs/submodules/client/index.js:553-590`).

**Fix:** One sentence in the bullet: the CDK CLI passes its own SDK logger, which runs at trace level only and through the
CLI's bundled pre-fix filter; our lockfile does not reach it, and it is re-read at each CLI bump (the ADR 0012 amendment
and runbook sentence).

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N8 (security-supply-r2-SEC-B-R2-N2). The reviewer-agent rows still read "Pending"; their results are available

Also raised by CI and test infrastructure as CI-B-R2-N1 (N4 there).

**Where:** PR #94 description, "Reviewer agents' findings", rows `security-reviewer` and `payment-engine-reviewer`
(lines 344-345).

**Scenario:** The pull request is marked ready with design §8.4 item 5 unmet.

**Evidence:** security-reviewer lens: `kms-key-provider.ts:19-44` (encryption context `{practice_id}` unchanged,
`KMSClient({})` with no logger); `evidence/scan.ts:46-92`; worker `intake/textract-staging.ts:26-31` (opaque random
key, SSE-KMS); `bedrock.ts:32-59`; every AWS client constructor (gateway `config.ts:137`; web `services.ts:107, 207,
229`, `uploads/targets.ts:63`; worker `platform/wiring.ts:20, 30, 41`, `mail/mail.ts:85`, `intake/wiring.ts:19`; infra
`cdk-diff-plan.ts:39`). None of these files changes in the pull request, none passes a logger, and the 187-case
response replay is identical at base and head: no finding. payment-engine: `git diff --name-only 43565235 484e9f06 --
packages/pricing packages/ledger packages/packets packages/edi835` returns 0 files; mutation gate job 124977781828
(21:03:22Z): pricing 98.67% (1,934 of 1,960; 26 undetected, all recorded equivalents), packets 97.75% (4,310 of 4,409; 99
undetected, all recorded equivalents), "mutation gate: passed". edi-reviewer's "Not run" holds: edi835 depends on
`@tp/money` and `@tp/rules` (dev: `@tp/synth` plus catalog tools), none of which moves.

**Fix:** Fill the two rows with this evidence (job id, scores, the file:line list) and keep edi-reviewer's "Not run"
with its dependency list.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N9 (security-supply-r3-SEC-R3-N1). The description says the head signs prototype-named headers; the head's signer does not, and the fix arrives only with the regeneration's `@smithy/signature-v4` 5.7.5, which the description never names

**Where:** PR #94 description, line 69; `pnpm-lock.yaml:2208` and `:5290`.

**Scenario:** A reviewer reads "`@smithy/core` 3.38.0 signs prototype-named headers" and concludes the head signs a header
named after an `Object` prototype property (an S3 user-metadata key `constructor`, say). The head's signer still leaves
such a header out. The fix arrives silently at the merge-time regeneration, which moves a SigV4 signing package the
description never mentions. No request our code builds carries such a header, so nothing is mis-signed now.

**Evidence:** Head lockfile: `@smithy/signature-v4@5.7.4` (`:2208`, `:5290`); its `dist-cjs/index.js:334` reads `if
(canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS ||`, so a prototype name is skipped. `@smithy/core` 3.38.0's
`CHANGELOG.md:8` claims the fix (0f58fed), but core only exports `writeKey` (`serde/index.js:1689`). The signer that uses
it is 5.7.5: `hasOwn(ALWAYS_UNSIGNABLE_HEADERS, …)` plus `if (canonicalHeaderName === "__proto__") writeKey(canonical)`
(`logs-sec-r3/dist-diff-regen.txt`). 5.7.5 (2026-10-29T15:49:12Z, GitHub Actions trusted publishing, attested) enters
only in the regen-simulation lockfile (`logs-sec-r3/regen-added.txt`). The fixed-clock capture with `FIX_UA=1` (03:08Z):
28 of 28 identical, signatures included, base against head and head against regen (`logs-sec-r3/shapeua-*.json`).

**Fix:** In "What was read": "`@smithy/core` 3.38.0 exports `writeKey`; the signer that uses it, `@smithy/signature-v4`
5.7.5, is not taken here (5.7.4 stays) and arrives with the merge-time regeneration". Add signature-v4 5.7.4 to 5.7.5 to
the merge-order list of regeneration moves (N10).

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N10 (security-supply-r3-SEC-R3-N2). The merge-time plan names only checks that cannot see what the regeneration moves (signing, clock skew, transport, credentials), and its version list is wrong

Overlaps CI-infra N7 (CI-R3-N3).

**Where:** PR #94 description, "Merge order", third bullet (lines 261-264) and "Not yet usable at resolution, so not
taken" (lines 103-106; the finding cited 258-264 and 95-98 from an earlier readback).

**Scenario:** The build regenerates after 2026-11-02T23:12Z and re-runs synth (CDK only), `test:golden` (stubbed, S3)
and `toolchain:check` (age, integrity and trust). Meanwhile the lockfile moves 30 runtime versions, among them
`@smithy/signature-v4` 5.7.5 (the signer), `@aws-sdk/core` 3.979.1 (`getUpdatedSystemClockOffset` drops the midpoint
estimate, changing every later x-amz-date after skew), `@smithy/core` 3.38.1 and `@aws-sdk/checksums` 3.1002.1. A signing
or skew regression would merge with every named check green. The list ("CLI 2.1147.0, cloud-assembly-schema 55.3.0,
`@aws-sdk` 3.1161.0, `@smithy/core` 3.38.1") also misstates the result: the schema stays 55.2.0, and signature-v4 and
checksums move unmentioned.

**Evidence:** Regen-simulation tree (manifests at `^3.1161.0` and `^2.1147.0`, `minimumReleaseAge` 3091 reproducing the
2026-10-30T23:13Z cutoff; lockfile sha256 75262029…; `install --frozen-lockfile` rc 0 at 02:54Z): 30 added and 30 removed
(`logs-sec-r3/regen-added.txt`); schema 55.2.0 and node-http-handler 4.14.0 kept. What the plan omits, run on that set:
fixed-clock capture head against regen 28/28 identical (03:08Z); real-socket harness (TLS, Bedrock over h2, S3 and SES
over HTTP/1.1, the default handler, credentials from an `AWS_CONTAINER_CREDENTIALS_FULL_URI` stub): S3/SES 28 of 29
identical (one retry-backoff timing bucket), Bedrock and credentials 20 of 21 (SDK versions) (`logs-sec-r3/socket{,B}-
regen.json`, 02:55Z to 02:56Z); worker bundle probe with `build.ts:41-62`'s options, 9 of 9 AWS paths, the same stub
requests on base, head and regen (03:03Z); error shapes identical (03:06Z).

**Fix:** In "Merge order", list the regeneration's actual moves (the 30 versions, including signature-v4 5.7.5 and
checksums 3.1002.1; schema stays 55.2.0; node-http-handler stays 4.14.0). Add to the re-checks: "the fixed-clock request
capture and the real-socket and container-credentials comparison against the head, which review round 3 ran on the
regen-simulation set with no difference". If the regeneration happens later than 2026-11-03T00:00Z, compare the
regenerated lockfile with that set first.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

### N11 (security-supply-r3-SEC-R3-N3). The lint and lint:logs rows in "Checks" give 93fa7dbb's counts; the head's own CI reports different counts

Also raised by CI and test infrastructure as CI-R3-N1 (N5 there).

**Where:** PR #94 description, lines 317-318.

**Scenario:** Someone checks the table against the head's CI and finds 1,677 against 1,681 lint files and 1,086 against
1,087 lint:logs files, and cannot tell whether a file escaped the log lint. The difference is #83's files, which the head
merged after 93fa7dbb. The rows are labelled 93fa7dbb, so they are not wrong, but nobody re-verified them on the head.

**Evidence:** static job 124973596362 on `refs/pull/94/merge` = 87c54142 ("Merge 484e9f06 into 43565235", log `:237`):
"lint:logs: 1087 files scanned; every log call uses allowlisted fields." (`:738`); "verify-content: every content set
passes." (`:561`); audit --prod "No known vulnerabilities found" (`:436`); audit high "1 vulnerabilities found", exit 0
(`:449`); gitleaks "13 commits scanned … no leaks found" (`:510-521`). lint job 124973596405: "lint: passed, 1,681 files
in 3 groups, 0 errors, 0 warnings" (`:262`). unit job 124973596293: 407 files, 6,926 passed, 1 skipped (`:1402-1403`).
Fetched read-only with `gh api` at 03:06Z into `tmp/dl-ci-logs-r3-5xoS`.

**Fix:** Cite the head's CI: lint 1,681 files (job 124973596405); lint:logs 1,087 and verify-content pass (job
124973596362); audit --prod none (same job). Or relabel the rows "on 93fa7dbb, before #83's files", with the head's
counts beside them. Take CI-infra N5's unit row (196 files, 2,779 tests on 484e9f06) in the same edit.

**Skeptic:** Nit; not verified by a skeptic; the fix round checks it.

## Refuted findings

None. Every finding this lens raised was confirmed. What the skeptics and the writer corrected:
- **S1.** The best option stands (drop `notices: false`); the fallback (keep it and add a weekly `cdk notices`) is not
  offered as equivalent; bootstrap notices are matched on deploy, rollback and asset publishing. The writer flags the
  interaction with CI-infra S2.
- **S2.** The finder's fix (review the side moves) is replaced by the override procedure that moves only `@smithy/core`.
- **S3.** 18 recordings, not 13; the single stub/SDK difference is named and unreachable; `test:golden` stays in the
  merge step beside the replay.
- **N10.** The description lines are 261-264 and 103-106 in the 03:33Z readback.

## What I checked and found sound

### Supply chain (r1, at 484e9f06, 2026-11-01)

- **The 35 added versions** (registry at 20:52Z, `logs-secsupply/registry-analysis.txt`): none has an install script;
  licences unchanged (Apache-2.0; MIT for stripe); publishers unchanged (aws-sdk-bot for `@aws-sdk/*`, aws-cdk-team for
  `aws-cdk-lib`, GitHub Actions trusted publishing for the CLI, the schema, `@smithy/*` and stripe); every provenance
  attestation names the same repository and workflow as the version it replaces (`aws-cdk-lib` and `@aws-sdk/*` never
  carried provenance, so no downgrade); no new dependency names; no engines or bin changes. The youngest is stripe
  23.1.0 at 72.9 h at 20:52Z (4,321.3 minutes at the 19:59:33Z resolution).
- **The deprecation.** Only `@smithy/core` 3.38.0 is deprecated, as the base's 3.36.0 is ("Deprecated due to a bug in
  custom logger data redaction. See https://github.com/aws/aws-sdk-js-v3/issues/8393."). The issue body is not
  verified (GitHub API 403 for that repository, 20:55:34Z and 20:55:40Z). The 3.38.1 tarball shows the bug: its
  CHANGELOG says "Redact sensitive fields within list items and map values in schema-based logging", and the fix is to
  `schemaLogFilter.js`, identical in 3.36.0 and 3.38.0, so the base has the same bug. It bites only with a custom logger;
  all 12 AWS client constructions pass none, and all 8 clients at 3.1160.0 default to `logger: config?.logger ?? new
  NoOpLogger()` in `dist-cjs/index.js` and `dist-es/runtimeConfig.shared.js`. This closes the design's "not verified"
  item (the CLI's own logger is N7).
- **Gates run:** `BASE=origin/claude/build-platform pnpm toolchain:check` (21:00:40Z to 21:00:43Z): passed, 0 errors, 1
  warning (pnpm 10.34.9); 35 added versions passing release age, integrity and trust; 612 entries by sha512; 0 audit
  exceptions; 0 excludes. `pnpm licenses:check`: 185 ok. `pnpm audit`: 1 moderate (minimatch via stryker), as on the
  base.
- **Tarballs read** (integrity-checked; old and new of each): `@aws-sdk/core`, `@smithy/core`, node-http-handler,
  token-providers, checksums, middleware-sdk-s3, stripe, aws-cdk. No new `process.env` reads, requires, OpenTelemetry or
  tracer hooks, or console or stderr writes. The JsonCodec warning predates the bump and is a harness artifact.
  node-http-handler 4.14's `defaultSocketTimeout` is inert (no installed client offers it); token-providers changes only
  SSO in-flight refresh.

### Requests (r1)

The checker's harness re-run on the fresh head (20:57Z) and a base worktree at 43565235 (21:02Z): all 28 AWS requests
identical once user-agent and authorization are normalized (Bedrock InvokeModel, both presigned URLs identical raw, KMS
with the `practice_id` context, Textract, Cognito, RDS, SESv2, STS). Stripe 23.1.0 against 23.0.0: `stripe.core.js`
differs only in `PACKAGE_VERSION`; the request path adds `statusCode` and disposes the response before a retry;
whitespace-only webhook secrets are rejected; Stripe-Version moves to `2026-10-28.endive`, as ADR 0050:48 intends.

### The CDK CLI 2.1146.1 (r1, read in the installed `lib/index.js`, then measured)

- Outbound calls on synth and diff: telemetry (`:309836-309850`, `:307004-307010`) off with the variable; notices
  (`:374166-374191`) off with the flag or setting; version check (`:317576-317582`, `:374243`) off with the variable and
  when stdout is not a TTY; STS GetCallerIdentity for `CDK_DEFAULT_ACCOUNT`, only with credentials (`:295629-295638`);
  IMDS region lookup only on EC2 (`:290426-290431`). Telemetry, when on, is sanitized (`:308843-308885`).
- At 21:08:26Z, `pnpm --filter @tp/infra synth` on a TTY with a fresh `CDK_HOME` and a preload logging every TLS and TCP
  attempt in all 5 Node processes made zero outbound attempts. The control at 21:08:33Z (no variables, `--notices`) made
  TLS to `registry.npmjs.org` twice and to `cdk-cli-telemetry.us-east-1.api.aws`, so the harness detects them.
- CI build job 124973596346: `cdk:diff` synthesized with no credentials. `cli-settings.test.ts`: 7 of 7 (21:04:41Z).

### Tenancy, logging and repository rules (r1)

No source change in apps/ or packages/; the KMS encryption context and request shape unchanged; no new log path for
request bodies or document text; the pull request's files hold no PHI, names or model identifiers.

### CI (r1, about 21:09Z)

All 27 check runs on the head succeeded except `notify` (skipped), including the 6 Stryker shards, `mutation`, the
screening-capacity gate (with the O9 warning that CI-infra S1 records), e2e, db 1-4, unit, static, build and
approval-of-record.

### Round 2 (2026-11-01T21:57Z to 2026-11-02T01:12Z)

1. **AWS responses** (22:00:21Z): the checker's parse script re-run, 32 responses, 31 identical, RDS's
   `DBCapacityReservationIdentifier` the only (additive) difference. My harness drove our code with each checkout's SDK:
   `BedrockProvider` and `bedrockFailure` (12 error types in 4 wire forms, untyped, ok, refusal, malformed),
   `KmsKeyProvider` (11 errors, prototype keys, short or empty plaintext), `TextractPageReader` over a real client, and
   Cognito (14 error names, prototype maps): 187 cases and 238 requests, identical. The codec diff (`@aws-sdk/core`
   3.978.3 `JsonShapeDeserializer` against `@smithy/core` 3.38.0) differs only by `hasOwn` guards and `isNumericSchema`
   in `needsTransform`; the error-code loaders are identical; the serializer escape fix sizes its buffer correctly.
2. **The golden stub** confirmed at `sets.ts:79-83` (S3).
3. **The credentialed diff:** the CLI 2.1145.0 to 2.1146.1 `diff()` differs only in passing `currentTemplate` to the
   change-set path, which `--method template` does not use; `EnvironmentAccess` and `loadCurrentTemplate` are identical.
   Offline-namespace captures (22:05Z to 22:07Z): `pnpm cdk:diff` makes zero CLI outbound calls; `diff tp-staging
   --method template --no-notices` is accepted with STS calls only. The CI lens's AWS stub shows DescribeStacks and
   GetTemplate within `pull-request-diff-role.ts:8-17` and the ssm deny tolerated by both CLIs. Live IAM: not verified.
4. **Reviewer-agent scope:** no finding (N8 gives the evidence).
5. **Trial merges** (01:04:28Z, `git merge-tree` against every open pull request): the description's claims hold (#91
   runbook only; #90 `model-gateway/package.json` only; #42 web and worker `package.json` and the lockfile; #86 and #75
   as the base; #95, #93, #92, #85 and #84 clean). #42's `deploy-parameters.test.ts:362-363` reads only `cdk.json`'s
   context, so `notices: false` passes it.
6. **Stripe types, 23.0.0 against 23.1.0:** the Subscription and Invoice status unions are unchanged
   (`Subscriptions.d.ts:490`, `Invoices.d.ts:732`); no field billing reads changes type (`events.ts:20-67`;
   `stripe.ts:114-275`). The two doc-only changes (subscriptions.cancel; "paused" via the pause endpoint) do not apply.
   Stripe's API changelog: not verified (docs.stripe.com ENOTFOUND, about 01:05Z, not among the session's allowed
   domains).
7. **Context synth:** not re-run by me; the CI lens compared four context variants and the launch path, equal.
8. **TTY captures** (22:05Z to 22:07Z): the head's `cdk:diff` and synth scripts made zero outbound calls; a bare `cdk`
   from infra/ fetches no notices (cdk.json honoured) but runs the version check and telemetry (N1's residual).
9. **CI logs:** images 124973596486, Trivy 0.70.0 HIGH and CRITICAL, no ignore entries, all targets 0 (the worker image is
   bundled, so Trivy cannot see its `@aws-sdk`, `@smithy` or stripe; pre-existing). e2e 1/2 and 2/2 passed. db 1/4
   passed, including `cross-tenant.db.test.ts` and `practice-keys.db.test.ts`.
10. **Publish times** (`npm view`, 22:10Z): aws-cdk 2.1147.0 2026-10-30T18:57:11Z, cloud-assembly-schema 55.3.0
    18:22:03Z, `@aws-sdk` 3.1161.0 18:52:27Z, `@smithy/core` 3.38.1 23:11:40Z; nothing newer then.

### Round 3 (2026-11-02T02:45Z to 03:11Z)

No B or S in the eight unchecked areas; the three nits are N9 to N11. Base 43565235, head 484e9f06, and a regen-simulation
set reproducing the 2026-10-30T23:13Z cutoff (`@aws-sdk` 3.1161.0, `@aws-sdk/core` 3.979.1, `@smithy/core` 3.38.1,
node-http-handler 4.14.0, CLI 2.1147.0).
1. **HTTP transport on a real socket** (02:52Z to 02:56Z, `scripts-sec-r3/aws-socket.mts`, loopback-only namespace,
   `env -i`, clients built as our wiring builds them, real `NodeHttpHandler` and `NodeHttp2Handler` over TLS). S3/SES 50
   cases: base and head 48 of 50 identical (SDK versions and one retry timing bucket); head and regen 28 of 29. Bedrock
   and credentials 21 cases: 20 of 21 on every pair (versions). Aborts give "timeout" within about 1.0 s with the h2
   session closed and the next call succeeding; a 3 s silence succeeds; a 6 MiB body parses; GOAWAY and server
   idle-close work; 8 concurrent first calls work; 100-continue on UploadPart (8 MiB) and PutObject (3 MiB) works, and an
   unanswered one waits 6 s per part, the same on base and head. No 3.1160.0 or 3.1161.0 client sets
   `defaultSocketTimeout`.
2. **Credentials:** every `credential-provider-*`, xml-builder and signature-v4-multi-region shows 0 diff lines base to
   head; nested-clients only its version; middleware-sdk-rds only braces; token-providers adds an SSO in-flight dedupe
   (`logs-sec-r3/dist-diff-creds.txt`). Through the default chain with the container stub: the token sent; 8 concurrent
   first calls made 1 fetch; refresh inside the 5-minute window moved to a new key; a 500 once retried; 500 five times
   gave 5 fetches then "rejected"; expired credentials refetched; base, head and regen identical.
3. **S3 success parsing through our classes** (`S3SealedBytes`, `S3ObjectLockStore`, `S3SupportInbox`): checksum mode
   sent; CRC32, SHA256, SHA1, CRC32C and CRC64NVME mismatches throw; composite checksums skipped; ranged 206 and slow
   streams work; HeadObject metadata and retain-until parse; ListObjectsV2 across 2 pages; a CompleteMultipartUpload 200
   with an Error body gives InternalError after 3 attempts then Abort; 412 gives ObjectConflictError; SESv2 SendEmail
   works. Identical on all three; a SHA512- or XXHASH64-only answer throws "not supported" on all three (pre-existing).
4. **Stripe** (`scripts-sec-r3/stripe-retry.mts`, 17 cases, `stripe.ts:52`'s options, timeout 20000): 23.0.0 and 23.1.0
   identical except Stripe-Version; at most 3 attempts; a 429 without a header not retried; `Stripe-Should-Retry: false`
   honoured; one Idempotency-Key per call in all 17; `providerError` receives `error.code`, including 23.1.0's
   `already_canceled` (the new types are V2-only); three timeouts total about 61 s.
5. **Regeneration:** the dists of all 30 moved versions diffed; registry metadata read (Apache-2.0; aws-sdk-bot or
   attested GitHub Actions; no install scripts; no new dependency names; only the 3.38.0 it removes is deprecated); the
   28-request capture 28 of 28. CLI 2.1147.0: `canCollectTelemetry` (`:307231`), `shouldDisplayVersionMessage`
   (`:316036`) and the notices dispatch (`:374716-374727`) match 2.1146.1 apart from renamed imports; on a TTY in the
   namespace, `pnpm synth` made zero outbound attempts and wrote no telemetry file; `pnpm cdk:diff` made only our own
   IMDS probes; bare synth and diff still run the version check and spawn the telemetry sender, without a notices fetch.
6. **Production bundle** (`scripts-sec-r3/probe-entry.ts`, the worker's own factories, `build.ts:41-62`'s esbuild
   options): 0 warnings, 0 errors, every credential provider inlined; with container credentials 9 of 9 AWS paths
   succeeded (S3 four ways, KMS, Textract, RDS, SES, Bedrock), the same stub requests on base, head and regen. The CI
   images ran local providers only (`env.ts:190-260`). The web (Next.js) image: not verified.
7. **Description claims:** the freeze exception's "No" holds (none of the 13 files is a catalog, migration, role, header
   or crypto file: `change-order-001.md:10`, `reconciliation-001.md:486-494`; the KMS path is unchanged on the wire).
   Gitleaks: the pinned 8.24.3 binary (sha256 e18325d5…) matches the pinned archive (sha256 9991e0b2…, `release.txt`);
   with the pre-push hook's arguments over 43565235..484e9f06, 13 commits, no leaks (02:57Z).
8. **The base move:** merged locally with 877e662f (670bd16b): clean, no manifest or lockfile line moves; `watched.ts
   --write` 543 lines, no change; `toolchain:check` passed (0 errors, 1 warning); `licenses:check` 185 (03:04Z). #92's
   auth files import no `@aws-sdk`.

Logging across all harnesses: no console call and no process warning; no AWS client in apps, packages or infra passes a
logger; the SDK's `$response` is non-enumerable and parse errors carry no body text, on base, head and regen.

### Disclosure (r1)

The r1 control runs (2026-11-01T21:05:22Z to 21:08:33Z) ran the CLI with telemetry on, and the preload let the sandbox's
`npm_config_https_proxy` through. Sanitized CLI telemetry (command synth, CLI and library versions, OS platform, a random
installation id, region) and the version check therefore probably reached AWS and npm. No repository content was in them.
Files were also written into `/root/.cdk/cache` at 21:05Z to 21:06Z. Rounds 2 and 3 ran no CLI with telemetry, notices or
the version check on (r2's rule; r3 in a loopback-only namespace).

## Proposals outside PR B's files (not built)

Best option first within each group.

- **P1. A real Textract client in the evaluation.** Make the evaluation's scan reader a real `TextractClient` that
  answers from the recording's bytes through a request handler, exported from `@tp/contracts` (which already depends on
  `@aws-sdk/client-textract`) and used by `sets.ts:85-92` in place of the plain-object `send`, paging large recordings by
  NextToken. The set hash then covers the SDK's deserializer, `test:golden` becomes the ADR 0070 check by construction,
  and today's 18 recordings would not move the hash. Better than a side test asserting stub equals real, which leaves the
  hash blind. Also correct design §5.3 (`:480-491`) and add the replay or the reader to the runbook's AWS paragraph for
  any `client-textract` or `@smithy/core` move.
- **P2. Commit this review's AWS evidence as tests:** a fixed-clock request snapshot per AWS call site (capturing
  handler, fixed clock and credentials, UA normalized); a real-socket comparison against a local TLS stub (h2 for
  Bedrock, credentials from a container-credentials stub); the worker esbuild bundle probe. Scripts:
  `review-B/scripts-sec-r3/` (`aws-socket.mts`, `stub-server.mjs`, `probe-entry.ts`, `build-probe.mts`, `run-probe.sh`,
  `err-shape.mts`, `stripe-retry.mts`). Probe the web image's standalone Next.js build the same way (not verified).
- **P3. Deploys through a repository script** that sets `CDK_DISABLE_CLI_TELEMETRY=true` and
  `CDK_DISABLE_VERSION_CHECK=true` and leaves notices on (design P7, widened): replace every documented bare `cdk
  deploy` (`deploy-and-rollback.md:13, 112, 117, 207`; `screening-capacity.md:384`; the doc comments at
  `infra/lib/app.ts:8, 13`, `infra/lib/screening-launch.ts:15`, `tools/screening-capacity/launch-check.ts:20`). The
  script must not pass `--no-notices` (S1). Update D6 in the design.
- **P4. Read the NOTICES block after each deploy:** in #42's `deploy-and-rollback.md`, after each `cdk deploy`, read any
  NOTICES block and report a security notice to the founder before the next deploy (S1).
- **P5. Stripe telemetry off:** `packages/billing/src/stripe.ts:52` builds the client with `telemetry: false`, as D2 did
  for the Anthropic SDK, with an ADR 0050 amendment and a test asserting no `telemetry_id` or `platform` in
  X-Stripe-Client-User-Agent and no X-Stripe-Client-Telemetry (N6).
- **P6. Enforce "no AWS client gets a logger"** with an eslint rule in `tools/eslint-rules` or a unit test, not a one-time
  grep. With `@smithy/core` up to 3.38.0, a custom logger (`logger: console` while debugging) would log list items and
  map values unredacted, for example Cognito AdminCreateUser's UserAttributes (`apps/web/src/lib/auth/cognito-provider.ts
  :330`), which carry emails and names.
- **P7. `toolchain:check` coverage:** list each bundled dependency of `aws-cdk-lib`
  (`node_modules/aws-cdk-lib/node_modules/*/package.json`), diff it against the base with licence, age and audit lookups,
  and name the CLI's single-file bundle as not inspectable (N4); warn on an added version npm marks deprecated, quoting
  the text (design P5, P-B2-3); warn when the lockfile moves names outside a declared set (S2's side moves).
- **P8. Image scans from the lockfile:** the images job cannot see the worker's bundled dependencies, and web.tar omits
  stripe, cognito and the presigner. Scan a lockfile-derived SBOM for each image.
- **P9. Bedrock failure mapping** (pre-existing, identical on base and head): `bedrock.ts:39-40` looks up `FAILURES[name]`
  on a plain object, so an error named `constructor` or `toString` yields a code that is a function: use `Object.hasOwn`
  or a Map. Map a non-JSON 5xx (`SyntaxError` or "Unknown") by `$metadata.httpStatusCode`, and `CredentialsProviderError`
  and `TimeoutError`, to "unavailable" rather than the non-retried "rejected".
- **P10. Stripe's 61-second worst case:** `stripe.ts:52` (`maxNetworkRetries` 2, timeout 20_000) lets one billing call
  block for about 61 s on timeouts. If a billing call runs inside a web request, add a per-request deadline or move it to
  a job (pre-existing).
- **P11. S3 checksums:** a GetObject answered with only an x-amz-checksum-sha512 or xxhash64 header throws on base, head
  and regen; our writers use only CRC32 and SHA-256. Record it in the runbook's AWS paragraph as a thing to re-test when
  S3 defaults change.
- **P12. node-http-handler 4.14.1:** the regeneration keeps 4.14.0; 4.14.1's memoized HTTP agent provider matters only for
  plain-HTTP endpoints. If ever wanted, it takes a deliberate update; the description should not imply the regeneration
  takes it.
- **P13. Allow docs.stripe.com** in the session's network settings so the `2026-10-28.endive` changelog can be read
  against billing; until then it stays not verified, and the webhook endpoint's API version remains a person's check.
- **P14. Harness hygiene:** a network-capture preload must also block local proxies, or unset `npm_config_https_proxy`
  and `GLOBAL_AGENT_HTTPS_PROXY`, or a control run sends real telemetry (the disclosure above). Point `CDK_HOME` at a
  scratch directory: the CLI ignores HOME (`index.js:75291-75303`).
- **P15 (writer's). One wording for the runbook and ADR sentences** that S1 here and CI-infra S2 both rewrite
  (`dependency-upgrades.md:323-324`, ADR 0012 `:148-160`), written once after S1 is decided.

## Commands and logs

All under `review-B/`:
- **Progress notes:** `progress/security-supply-r1.progress.md`, `security-supply-r2.progress.md`,
  `security-supply-r3.progress.md`.
- **Round 1:** `logs-secsupply/` (`registry-analysis.txt`, `toolchain-check.log`, `licenses-check.log`,
  `audit-head.json`, `cdklib-2.27{3,5}.0-bundled.txt`, `shape-{base-43565235,head-484e9f06}.json`, `netlog-*.log`,
  `synth-*-tty.log`, `proxy-*.log`); scripts in `scripts-secsupply/`.
- **Round 2:** `logs-secsupply-r2/` (`checker-parse-*.json`, `responses-{base,head}.json`, `regen-sim*-update-*.log`,
  `netlog-*.log`, `tty-*.log`, `ci-images-124973596486.log`, `ci-e2e*-*.log`, `ci-mutation-gate-124977781828.log`);
  scripts in `scripts-secsupply-r2/` (`responses.mts`, `checker-parse.cjs`, `netcap.sh`, `netlog-hook.cjs`).
- **Round 3:** `logs-sec-r3/` (`dist-diff-{creds,regen}.txt`, `regen-added.txt`, `socket*-*.json`, `shapeua-*.json`,
  `probe-*.json`, `errshape-*.json`, `netlog-regen-*.log`, `gitleaks-43565235.{json,log}`, `merged-*.log`); scripts in
  `scripts-sec-r3/`.
- **Skeptics:** `logs-refute-smithy/` and `scripts-refute-smithy/` (S2); `scripts-refute-s2b/` and `logs-refute-s2b/`
  (S3: `replay-set.mts`, `stubdiff.mjs`, `replay-{base,head}.json`).
- **Downloads:** each in its own directory under `tmp/` (`dl-npmview-*`, `dl-smithy-core-3381-mlDL`, `npmview-refute1`,
  `netcap-*`, `r3-cli`, `dl-ci-logs-r3-5xoS`).
- **The writer's clone:** `clone-writer`, 03:31:57Z to 03:33:29Z, clean, removed. The description readback:
  `tmp/dl-prbody-writer-H9v1/body.md` (03:33:04Z).
