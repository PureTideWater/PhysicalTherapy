# Lane B, dependabot-batch, PR A (#90): the fix round

The record of PR A's fix round, from the two adversarial reviews to the push. Written 2026-11-02 by the pusher; not
committed (the session commits it with the status file).

- **Pull request.** #90, "Anthropic SDK 1.3.0 with its tracing, propagation and logging off (replaces Dependabot #87)",
  branch `co-001/deps-anthropic-sdk-1` into `claude/build-platform`; draft. Worktree `/home/user/deps-anthropic-sdk-1`.
- **Pushed head: 4e70738df19ada1ca7ce5dc3ad29e24dcb3b53a1** (4e70738d), pushed 2026-11-02T02:34:50-53Z as
  `06f79c07..4e70738d` through the pre-push hook. It is the merge commit "Merge claude/build-platform into
  co-001/deps-anthropic-sdk-1" of the base 4eaf7124 (#92) into 442d7a81, the fix round's last commit.
- **Commits of the round** (each message ends with a blank line and the two required lines; no amend, rebase, reset,
  force or `--no-verify`):
  - f5664b5b, merge of the base 43565235 (#83), no conflict.
  - c134a5ad, 54327099, 43531dcf, 68194bd3, 27ad0ec1, 00567d18, 8540a129, 78756d3e, fe258999, 5bad12e9, 5b1539d2: the
    review findings (the fixer, `fix-A/fix.md`).
  - 950e8ca8, c7bdcbe4, 48ba78d4, c30be8ea, 442d7a81: the check's S1, N1, N7, N6, N8 (`fix-A/suite.md` section 1).
  - 4e70738d, merge of the base 4eaf7124 (#92), no conflict.
- **The hook on this push** checked one commit (the merge; 3 text files searched; gitleaks found no secret). The fix
  commits up to 442d7a81 were already on the remote under `co-001/wip-dependabot-batch-a` (head 442d7a81, an earlier
  save), so the hook, which excludes what any `origin` ref already has, did not check them again. The full suite's
  gitleaks over `origin/claude/build-platform..442d7a81` covered them: 23 commits, no leaks. The remote reported 1
  moderate alert on the default branch, unchanged.
- **The description** was rewritten from `fix-A/description-changes.md` sections 1-7 with the conflict list below, #92
  named as merged, the findings table, both suites and the merge order (40,170 characters). Read back with `gh api
  .../pulls/90 --jq .body` and `pull_request_read get`: identical apart from one trailing newline; the footer intact.

Evidence: `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/fix-A/` (`fix.md`,
`check.md`, `suite.md`, `suite-merge.md`, `pr-body.md`, `pr-body-readback.md`, `logs/`, `progress/push2.progress.md`).

## 1. Every finding and its disposition

"Status file" means `approval-summaries/lane-b-dependabot-batch-status.md`, "Proposals (outside this PR)", items 1-8,
written before the push.

### The build's adversarial checker (before the reviews)
| Finding | Disposition |
| --- | --- |
| N1: ADR 0048 body line at 136 columns | Fixed in 06f79c07 (rewrap) |
| N2: a refused `ANTHROPIC_CUSTOM_HEADERS` logged as `MODEL_PATH_UNAVAILABLE` in `apps/web/src/lib/models/path.ts` | Deferred: status file, item 1 |
| N3: MOD-18 alone passes with `propagation: true` | Not a defect: MOD-17 holds the setting |

### The two adversarial reviews (26 confirmed, 18 distinct)
Records: `approval-summaries/lane-b-dependabot-batch-A-review-ci-infra.md` and
`approval-summaries/lane-b-dependabot-batch-A-review-security-supply.md`.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | ci-infra-r1-S1: MOD-18 red whenever the runner sets `ANTHROPIC_CUSTOM_HEADERS` | c134a5ad |
| 2 | SEC-S1: the SDK's environment reads re-checked only at each major | 54327099, completed by 950e8ca8 and c7bdcbe4 (check S1, N1) |
| 3 | SEC-S2: the amendment silent on an API-version change under ADR 0070 | 43531dcf; outside-PR parts deferred: status file, item 2 |
| 4 | ci-infra-r2-S1, SEC2-N1: D2's "fails closed at startup" false for the web | Description (D2); the design's line 36 corrected on `claude/build-ops`; refusal's own log code: status file, item 1 |
| 5 | SEC3-S1, ci-infra-r3-N1: merge order stale against the 20:36 UTC rule | Description (Merge order) |
| 6 | SEC3-S2 (N by its skeptic), ci-infra-r3-N2: operator docs silent on the refusal | 68194bd3; the evaluation CLI's errors deferred: status file, item 4 |
| 7 | ci-infra-r1-N2: the checker's N2 deferred without saying where | Description (row names the file and branch); deferred: status file, item 1 |
| 8 | ci-infra-r1-N3: MOD-17's row left out the webhook key | 54327099 |
| 9 | ci-infra-r1-N4: the jump from MOD-14 to MOD-17 unexplained | 8540a129 |
| 10 | ci-infra-r2-N1, SEC2-N2: ADR 0048's Status line | 78756d3e |
| 11 | ci-infra-r2-N2, SEC2-N3: provenance's workflow move at 0.132.1, not 1.0.0 | Description (Provenance); the design's section 3.1 corrected on `claude/build-ops` |
| 12 | ci-infra-r2-N3, SEC2-N4: the moderate alert unidentified | Description (GHSA-g3hv-75wg-m249, development only, unchanged) |
| 13 | ci-infra-r2-N4, SEC2-N5: failure mapping tested only on hand-built errors | 00567d18, with 442d7a81 (check N8); 408/409 deferred: status file, item 6 |
| 14 | SEC-N1: two risks understated, one guarantee overstated | fe258999 |
| 15 | SEC-N2: the SDK's direct deprecation warnings | fe258999; a CI check of pins against the SDK's lists deferred: status file, item 5 |
| 16 | SEC-N3: MOD-18 sent through a `withOptions()` clone | 27ad0ec1 |
| 17 | SEC3-N2, ci-infra-r3-N3: the SDK's platform headers not recorded | 5bad12e9 |
| 18 | SEC3-N1: the eligibility record left out effort | 5b1539d2, with c30be8ea (check N6); PRD.md:571 deferred: status file, item 3 (the founder's text) |

The reviews' other proposals outside PR A's files (ci-infra P1-P3, P7, P13, P14; security-supply P3, P5-P7, P9,
P11-P14) stand in those records; status file, item 8.

### The check of the fix round (`fix-A/check.md`, head 5b1539d2, verdict "defects")
| Finding | Disposition |
| --- | --- |
| S1: MOD-17 pinned the files that touch the environment, not how often | 950e8ca8 (touches per file: 4, 2, 4); red on the helper mutant (`internal/utils/env: 6`) |
| N1: only `dependencies` compared; no dependency's code read | c7bdcbe4 (every manifest kind; every package brought in scanned); red on four SDK copies |
| N2: merge order left out Dependabot's #87 and #89 conflicts | Description (Merge order) |
| N3: merge order left out README.md (#95), model-evaluation.md (#75), pnpm-lock.yaml (#42) | Description (Merge order) |
| N4: description text made stale, beyond the list | Description (client and configuration bullets, MOD-18, Gate results, Checks, the two reviewer rows) |
| N5: status-file proposals misattributed 408/409 and dropped the JSON-schema caveat | Corrected in the status file, items 3, 6 and 8 |
| N6: eligibility record left out structured outputs' condition | c30be8ea |
| N7: "These reads were already in 0.x" read as the warnings | 48ba78d4 |
| N8: the "refused connection" case was a reset | 442d7a81 (`connect ECONNREFUSED`); still red on the raw-rejection SDK copy |
| N9: the fixer's scratch worktree left registered | Removed, 2026-11-02T01:10:57Z (no repository change) |
| N10: the deferral and the D2/provenance corrections relied on records not yet written | Description row names file and branch; status-file items 1-8 and the design's two corrections written on `claude/build-ops` before the push |

The check's header counts "1 S and 9 N" but its body lists N1 to N10; all eleven are dispositioned above. What the
check confirmed held at 5b1539d2: the merge f5664b5b exact (tree equal to `git merge-tree` of 06f79c07 and 43565235);
the generators clean; whole-repo lint; the gateway tests with eight ambient `ANTHROPIC_*` variables set; the installed
SDK byte-identical to the registry's 1.3.0 tarball (sha512 equal to the lockfile's); the eligibility page re-read
(HTTP 200, 309 lines, sha256 8ba5c7dd…); provenance re-read; the alert's identity; every other mutant red.

## 2. The full local suite at 442d7a81

Base 43565235; 2026-11-02 01:11Z to 02:25Z; one heavy step at a time under `flock /tmp/laneb-heavy.lock`; database
steps on PostgreSQL 18.4 (5433); `git status` clean after every step (`fix-A/suite.md`, `logs/suite-*.log`).

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; nothing installed |
| `pnpm typecheck` | pass, 22 projects |
| `pnpm lint` | pass, 1,681 files, 0 errors, 0 warnings |
| `pnpm lint:logs` | pass, 1,087 files |
| `pnpm verify-content` | pass; content/drafts 10 records |
| `pnpm test` (unit, coverage, `ENGINE_FREEZE_BASE` 43565235) | pass; 407 files; 6,937 tests: 6,936 passed, 0 failed, 1 skipped (root guard); coverage statements 68.01%, branches 65.48%, functions 62.37%, lines 68.2%; the gateway 25 files, 478 tests, `anthropic-client.test.ts` 16 |
| `pnpm test:golden` | pass; 5 files, 376 tests |
| `pnpm synth --large`, `pnpm test:oracle` | pass; 687 synthetic 835s agree (676 valid, 11 malformed and rejected) |
| `pnpm db:migrate`, `pnpm test:db` shards 1-4 | pass; 44 migrations; 3,190 + 2,615 + 2,552 + 926 passed, 1 skipped (pg_dump 16 against server 18); 129 of 129 db files, none twice; 9,284 tests: 9,283 passed, 1 skipped |
| restore drill on PostgreSQL 16 | 7 passed, the pg_dump step included |
| `pnpm db:domain-model --check --strict --require-approval` | pass; schema at 20261106090000; approval carried |
| `pnpm build`, the build stamp, the tar | pass; stamp 442d7a81; 29.3 MB |
| `pnpm cdk:diff` | pass; stacks synthesized (staging diff needs credentials) |
| `E2E_PREBUILT=1 pnpm test:e2e --workers=2` | pass; 64 passed, 0 failed, 0 skipped, 9.6 min, retries 0 |
| `tools/stryker/affected.ts --base 43565235` and the mutation gate | no shard; "No money path changed: no mutation run." |
| `pnpm synth --all` | 267 cases: 0 written, 659 unchanged |
| `watched.ts --write` | 541 lines, no change |
| `actions:check` (offline and against the base), `toolchain:check`, `licenses:check`, actionlint | pass; toolchain 0 errors, 1 warning (pnpm 10.34.9 newer than `packageManager`, not this PR's); 185 production packages |
| `pnpm screening:capacity`, local form (`--runtime process`) | exit 1, the local form's red only: ten "limit not applied" / "cold start not applied" checks; every other check passes (20 uploads in time, worst 29.3 s; 4 of 4 oracles equal; no OOM). Red the same way on the base 43565235. No Docker here |
| gateway unit and golden with `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_LOG=debug` set | pass; 478 and 376 |
| audits, `check:fixtures`, released prompts, engine freeze, gitleaks | pass; 1 moderate (GHSA-g3hv-75wg-m249, dev); 333 guard files; 4 released prompt versions unchanged; 23 commits, no leaks |

## 3. The targeted re-check after the base merge (4e70738d)

The base moved 43565235 to 4eaf7124 (#92, UX PR 6, sign-in step limits; 5 commits, 43 files). It shares with A only
`docs/product/test-matrix.md`, the synth `matrix.ts` and `registry.ts` (separate hunks), and touches no manifest,
lockfile or gateway file. Per the co-founder's pacing (2026-11-02 02:10 UTC), only what the merge touches ran again,
02:30:04Z to 02:34:22Z, each under the lock, the tree clean after each (`fix-A/suite-merge.md`, `logs/merge2-*.log`):

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; nothing installed |
| `pnpm synth --all` | 271 cases: 0 written, 663 unchanged; EMR 16 unchanged |
| `watched.ts --write` | 542 lines (#92's line), no change, nothing to commit |
| `pnpm verify-content` | pass |
| `pnpm check:fixtures` | pass; 333 guard files, 3,912 text files searched |
| `pnpm typecheck` | pass, 22 projects |
| `pnpm lint` | pass, 1,691 files, 0 errors, 0 warnings |
| `vitest run --project unit packages/synth packages/model-gateway apps/web` | 127 files, 1,878 tests passed, 0 failed, 0 skipped |
| `tools/stryker/affected.ts --base 4eaf7124` | no shard (as expected) |

The base did not move again before the push (fetched 02:34Z: 4eaf7124).

## 4. Conflicts (2026-11-02T02:35:27Z, `logs/merge-tree-push2.txt`)

`git merge-tree --write-tree` of 4e70738d with each of the 15 other open heads, and of the base with each:

| PR | Head | With A | With the base alone | Shared files with A |
| --- | --- | --- | --- | --- |
| #94 (CDK and AWS SDK, draft; 27 check runs success or skipped) | 484e9f06 | **conflict**: `packages/model-gateway/package.json` | clean | package.json, pnpm-lock.yaml |
| #87 (Dependabot, replaced by A) | 20c180a0 | **conflict**: `pnpm-lock.yaml` | clean | package.json, pnpm-lock.yaml |
| #89 (Dependabot, replaced by #94) | 83f04cbd | **conflict**: `packages/model-gateway/package.json` | clean | package.json, pnpm-lock.yaml |
| #75 | 871faff9 | conflict, three uploads files | the same conflict | test-matrix, matrix.ts, registry.ts, model-evaluation.md |
| #86 | 83167b8f | conflict, ADR 0066, reconciliation-001, workflows.test.ts | the same conflict | none |
| #42 | 6c28d6a2 | clean | clean | test-matrix, matrix.ts, registry.ts, pnpm-lock.yaml |
| #84 | e3299ea2 | clean | clean | test-matrix, matrix.ts, registry.ts |
| #85 | a97d6011 | clean | clean | test-matrix, matrix.ts, registry.ts |
| #88 (Dependabot) | f69063f0 | clean | clean | pnpm-lock.yaml |
| #91 | 651f8b80 | clean | clean | test-matrix, matrix.ts |
| #93 | d1e4c4c4 (moved) | clean | clean | test-matrix, matrix.ts, registry.ts |
| #95 | 8517ee3a | clean | clean | README.md, test-matrix, matrix.ts, registry.ts |
| #96 (new: CI follow-up P4, ci-mutation-trigger) | 50029e64 | clean | clean | test-matrix, matrix.ts, registry.ts |

#92 is merged (it is the base). Merge order under the 2026-11-01 20:36 UTC rule: A merges as soon as it is verified and
green; it orders only against #94. If #94 is ready, green and waiting first, #94 merges first and A takes the merge
(keep both ranges, `pnpm install --lockfile-only`, which changed nothing in the 21:40:50Z trial); otherwise A first.
The Dependabot pull requests never merge.

## 5. What the verification must read on CI (head 4e70738d)

At 02:39:20Z CI was running on 4e70738d: build, changes, db 2/4 and 4/4, domain model, images, lint, mutation, static
and approval-of-record (first run) success; the Stryker shard skipped; unit, db 1/4 and 3/4, e2e 1/2 and 2/2, capacity
and a second approval-of-record run in progress or queued. The verification reads, on that head (or on any later head,
with these again):
- **The four required checks**: `all green`, `mutation`, `screening-capacity gate`, `approval-of-record`.
- **screening-capacity**: the one check never passed locally. `changes` must say `measure=true` (watched files touched:
  the gateway's package.json, `config.ts`, `anthropic.ts`, the synth `matrix.ts` and `registry.ts`, `pnpm-lock.yaml`);
  the `capacity` job's Docker measurement under production limits must pass (limits and cold starts applied), and
  the gate must read it as passing. If it fails, compare with the base's latest measurement before calling it A's.
- **unit**: 0 failed; the root-guarded test runs there (not skipped); the gateway's 25 files and 478 tests, among them
  `anthropic-client.test.ts`'s 16 (MOD-17 inventory and failure mapping, MOD-18, the control).
- **db (1/4)-(4/4)**: every shard green, the restore drill's pg_dump step run (client tools 18), not skipped.
- **mutation**: `affected.ts` selects no shard; "No money path changed: no mutation run"; the gate passes.
- **static**: frozen install, synth and watched paths clean (271 cases; 542 lines), verify-content, fixtures guard,
  oracle, audits (only GHSA-g3hv-75wg-m249, moderate, dev), toolchain and actions checks, licences.
- **e2e (1/2, 2/2)**, **build**, **domain model**, **images**: green.
- **approval-of-record**: re-run after the pull request is marked ready, on the latest commit.
- Before the merge: `git merge-tree` again against the then-current heads (above), recorded in the status file.

## 6. Open for the session
- `co-001/wip-dependabot-batch-a` on origin (442d7a81) duplicates the pushed commits; whether to keep or delete it is
  the session's call.
- PR A is still a draft; ready, the approval-of-record re-run and the merge follow CI and the fresh-clone verification.
- #94's readiness decides the order (above).
- The Dependabot alert's identity is for the founder or co-founder to confirm on the alerts page (403 to the build).
