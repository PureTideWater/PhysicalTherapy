# P1 fix round: ci-pin-age (#82), 2026-10-28

Written 2026-10-28 by the integrator of the fix round. This file is not committed. Every 40- or 64-hex hash here is
shortened to 8 hex digits and an ellipsis. Logs are in
`/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/p1fix/logs/`, each with its
command, its tree's head and its UTC times; the failing-first record is
`/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/p1fix/failing-first.md`.

## Result

- **Pushed head: `03e18576…`** on `co-001/ci-pin-age` (b574d4e8…..03e18576…, 2026-10-28T07:05:47Z), through the
  pre-push hook: 22 commits checked, the fixture check clean, gitleaks 8.24.3 found no secret. One push; nothing
  forced, amended or rebased on the remote.
- **Every finding of both reviews is fixed** (CI and test infrastructure 0 B, 4 S, 7 N; security and supply chain
  0 B, 4 S, 4 N), with the integrator's three proposals and the security reviewer's proposal of one Dockerfile reader.
  Each was re-checked against the code first; every one held.
- **The full local suite passed once at the pushed head**, every step exit 0, no fix needed.
- **#82's description** is updated (body only; still a draft) and read back identical under `cmp` (25,328
  characters): `scratchpad/p1fix/pr-body-v2.md` and `pr-body-v2-readback.md`.
- **The design** (`designs/lane-b-ci/follow-up-p1-pin-age.md`) gains §16 (one line per finding and its disposition,
  the deviations, the proposals not built, the pushed head) and "(§16)" notes on E1, E3, E16 (superseded) and E17.
  Written, not committed: the session commits it on `claude/build-ops`.
- **The fixers' worktrees** `/home/user/ci-pin-age-f1` and `-f2` are removed; their branches are kept
  (`co-001/ci-pin-age-f1` at e39d469a…, `-f2` at 2048f733…).

## Commits on top of b574d4e8… (in first-parent order, then each merge's own)

| Commit | Who | What |
| --- | --- | --- |
| e2c2e773… | F1 | CI-N2: the deadline message names the caller's deadline; `READ_DEADLINE_MS` in `exclude-window.ts` |
| 39f45ec5… | F1 | CI-N3: an image exceptions entry outside its window warns on a push |
| 47bc4985… | F1 | CI-S2: an image file is one of Docker's own names |
| 7f3d8cbb… | F1 | SEC-N1: compose merge keys honoured; `extends:` in any form refused |
| 63c2188b… | F1 | SEC-S1 (and SEC-S2's frontend): `readDockerfile`, a port of BuildKit v0.34.1's parser, exported, failing closed |
| edd3e691… | F1 | SEC-S2: build-push-action's `BUILDKIT_SYNTAX`, non-local `context:`, literal `file:`, non-gha caches refused |
| e9f6e2cb… | F1 | CI-S3: the build branch's first-parent history vouches for a reverted digest |
| 26ff2eac… | F1 | Improve as you go: any `build-contexts`, SBOM scans, other buildx drivers refused; setup-qemu's image read |
| fe9af0ec… | integrator | `--no-ff` merge of F1 at 26ff2eac… |
| 5f06218a… | integrator | F1's e39d469a… (comment-only) cherry-picked with its subject reworded (it held an invisible U+FEFF) |
| 413e5812… | F2 | SEC-S3: base workflows at the top level; subdirectory files refused offline |
| 31662c7d… | F2 | SEC-S4: `runs.using` in any case |
| 8406c899… | F2 | CI-S4: on a push every ref's faults warn (E16 superseded) |
| 257d2fef… | F2 | CI-N1, SEC-N3: nothing in the arrival read throws; out-of-range times are findings |
| 7e14ea0e… | F2 | CI-N7: a force push's `before` fetched by its SHA |
| 87739d3e… | F2 | SEC-N4: git and gpgv without the job's token |
| 5a8e8519… | F2 | CI-N4: the base's paths named once in `base.ts`, guarded |
| 2048f733… | F2 | Integrator's proposal: the builder's Hub reads wait out a rate limit |
| 9d576b26… | integrator | `--no-ff` merge of F2 at 2048f733… |
| 54610150… | integrator | The seam: check-action-pins' age deadline is `READ_DEADLINE_MS` (red first) |
| e9ec332e… | integrator | CI-S1, SEC-N2: the token asserts read names as the runner does; a whole `github` context refused (red first) |
| c10011b6… | integrator | SEC-S2's CI-13 part: CI-13 reads Dockerfiles through `readDockerfile` (red first) |
| 7e816ed4… | integrator | CI-N5: the five builder comments |
| 1b794873… | integrator | CI-N6: `ci.md`'s hosts |
| 137aed85… | integrator | ADR 0066 Part 5: "The pins, on CI" from job 122611334491 (read again with `get_job_logs`), the fix round, N29 to N31 |
| 10995d73… | integrator | The runbooks (`dependency-upgrades.md`, including what a revert meets; `ci.md`) |
| 03e18576… | integrator | Merge of `claude/build-platform` at 56ed6279… (#74, #79, #81), no conflict; `pnpm synth --all` wrote nothing |

Every commit message ends with the two required trailer lines. 55 files change against 56ed6279…, +7,076 −280.

## Dispositions

| Finding | Disposition | Commit |
| --- | --- | --- |
| CI-S1 token asserts case-sensitive | Fixed (with SEC-N2): count `github.token` in any case once, step JSON lower-cased, five more spellings forbidden; a negative case with seven spellings; a whole `github` context refused (improve as you go) | e9ec332e… |
| CI-S2 `isImageFile` too wide | Fixed: Docker's own names only (slightly wider than worded: `compose.<x>.yaml`, `docker-compose-<x>.yml`) | 47bc4985… |
| CI-S3 a revert blocked for good | Fixed as recommended (first-parent history of `origin/claude/build-platform`, at or behind the merge base) | e9f6e2cb… |
| CI-S4 a push of a new pin red on an outage | Fixed: every ref warns on a push; E16 superseded | 8406c899… |
| CI-N1 the arrival read can throw | Fixed | 257d2fef… |
| CI-N2 the deadline message | Fixed | e2c2e773… |
| CI-N3 window problems on a push | Fixed | 39f45ec5… |
| CI-N4 the marker named twice | Fixed (refactor and guard; no behaviour red) | 5a8e8519… |
| CI-N5 builder comments | Fixed (comment only) | 7e816ed4… |
| CI-N6 `ci.md` hosts | Fixed (document only) | 1b794873… |
| CI-N7 force push makes pins young | Fixed | 7e14ea0e… |
| SEC-S1 the reader diverges from BuildKit | Fixed: a port of BuildKit's parser, failing closed; 23,037 inputs agree with BuildKit's own | 63c2188b… |
| SEC-S2 frontends and build inputs | Fixed: frontend forms (63c2188b…), build inputs (edd3e691…), CI-13 through the same reader (c10011b6…) | three |
| SEC-S3 recursive base read | Fixed | 413e5812… |
| SEC-S4 `runs.using` case | Fixed | 31662c7d… |
| SEC-N1 compose merge keys | Fixed | 7f3d8cbb… |
| SEC-N2 E8's case | Fixed with CI-S1 | e9ec332e… |
| SEC-N3 two crash paths | Fixed | 257d2fef… |
| SEC-N4 token in children | Fixed, `base.ts`'s git included | 87739d3e… |
| Integrator: builder rate-limit wait | Built | 2048f733… |
| Integrator: one 180 s constant | Built | e2c2e773…, 54610150… |
| Integrator: deadline message | Built (CI-N2) | e2c2e773… |
| Security reviewer: one Dockerfile reader | Built | 63c2188b…, c10011b6… |

## Checks at the pushed head 03e18576… (06:20:56Z to 07:05:15Z, each heavy step under the lock, in order)

| Command | Result | Log |
| --- | --- | --- |
| `pnpm typecheck` | passed, 22 projects, 54.7 s wall | int-suite-typecheck.log |
| `pnpm lint` | passed, 1,657 files in 3 groups, 0 errors, 0 warnings | int-suite-lint.log |
| `pnpm lint:logs` | 1,075 files, every log call allowlisted | int-suite-lint-logs.log |
| `pnpm verify-content` | every content set passes | int-suite-verify-content.log |
| `pnpm check:fixtures` | 333 read, 3,862 searched, every interchange synthetic | int-suite-check-fixtures.log |
| `ENGINE_FREEZE_BASE=56ed6279… pnpm test` | **397 files, 6,666 passed, 1 skipped (6,667)**, 309 s. Expected exactly: base 56ed6279…'s push run 40639109816 (unit job 122652834138, read with `get_job_logs`): 394 files, 6,573 + 1; plus P1's 3 files and 62; plus the fix round's 31 (F1 16, F2 12, integrator 3). Local skip: packages/rules `content.test.ts` "throws when content/outgoing is unreadable (review m3)" (skips as root) | int-suite-test.log |
| `pnpm test:golden` | 376 passed, 5 files | int-suite-test-golden.log |
| `pnpm synth --large`, `pnpm test:oracle` | pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed rejected); edi835 agrees on every segment, amount, balance and verdict | int-suite-synth-large.log, int-suite-test-oracle.log |
| `pnpm test:db --shard=k/4`, k = 1 to 4, PostgreSQL 18.4 on 5433 | 3,190 + 1 skipped (33 files), 2,615 (32), 2,552 (32), 926 (32): **9,283 passed, 1 skipped, 129 files**. Skip: the restore drill (pg_dump 16 against an 18 server) | int-suite-test-db-k-of-4.log |
| `pnpm build`, build stamp, `E2E_PREBUILT=1 pnpm test:e2e --workers=2` | built; stamped 03e18576…; **62 passed**, 9.6 min | int-suite-build.log, -build-stamp.log, -e2e.log |
| `tools/stryker/affected.ts --event pull_request --base 56ed6279…` | money, pricing, ledger, packets not affected: no shard, so no gate | int-suite-mutation-affected.log |
| `pnpm actions:check --offline` | exit 0 | int-suite-actions-check-offline.log |
| `BASE=origin/claude/build-platform pnpm actions:check` | exit 0: bootstrapping (56ed6279… lacks `age.ts`), every pin read, 12 commits aged and old enough, builder ok; API reads skipped locally | int-suite-actions-check-networked.log |
| `BASE=origin/claude/build-platform pnpm toolchain:check` | 0 errors, 0 warnings; no image new against the base | int-suite-toolchain-check-networked.log |
| actionlint 1.7.7, ci.md's flags | exit 0 | int-suite-actionlint.log |
| `pnpm synth --all`; clean status | 0 written, 649 unchanged, 0 removed; clean | int-synth-all.log, int-suite-synth-clean.log |
| `pnpm install --frozen-lockfile` after the base merge | lockfile up to date | int-install.log |

## Failing first

| Finding | Red (log, UTC) | Green at the fix |
| --- | --- | --- |
| CI-S1, SEC-N2 | int-ci-s1-red.log 06:08:04Z; int-ci-s1-red-soft-7.log 06:09:57Z (6 of 7 spellings pass the old asserts) | int-ci-s1-green.log |
| CI-S2 | f1-ci-s2-red.log 05:28:49Z | f1-ci-s2-green.log (68) |
| CI-S3 | f1-ci-s3-red.log 05:49:00Z | f1-ci-s3-green.log (81) |
| CI-S4 | f2-ci-s4-red.log 03:58:19Z (+ soft) | f2-ci-s4-green.log (14), -green-dir.log (69) |
| CI-N1, SEC-N3 | f2-n1-n3-red.log 04:00:58Z (4 failed) | f2-n1-n3-green.log (73) |
| CI-N2 | f1-ci-n2-red.log 05:25:02Z (timed out at 15 s) | f1-ci-n2-green.log (66) |
| CI-N3 | f1-ci-n3-red.log 05:27:47Z | f1-ci-n3-green.log (67) |
| CI-N4 | no behaviour red: f2-ci-n4-gap-at-old-code.log 05:18:02Z passes the drift; f2-ci-n4-red.log 05:19:08Z fails it | f2-ci-n4-green(-final).log (78) |
| CI-N5, CI-N6 | no red run (comment, document) | — |
| CI-N7 | f2-n7-red-at-b574d4e8.log 04:03:43Z | f2-n7-green.log (74) |
| SEC-S1 | f1-sec-s1-red.log 05:37:32Z (10 failed); differential f1-sec-s1-differential.log | f1-sec-s1-green.log (78) |
| SEC-S2 | f1-sec-s2-frontend-red-at-b574d4e8.log 05:44:21Z; f1-sec-s2-inputs-red.log 05:45:36Z; int-ci13-red.log 06:11:31Z | f1-sec-s1-s2-frontend-green.log (79), f1-sec-s2-inputs-green.log (80), int-ci13-green.log |
| SEC-S3 | f2-sec-s3-red.log 03:56:01Z | f2-sec-s3-green.log (14) |
| SEC-S4 | f2-sec-s4-red.log 03:57:34Z | f2-sec-s4-green.log (17) |
| SEC-N1 | f1-sec-n1-red.log 05:29:35Z | f1-sec-n1-green.log (69) |
| SEC-N4 | f2-n4-sec-red.log 04:04:16Z; f2-n4-sec-base-red.log 05:15:51Z | f2-n4-sec-green.log (76), -base-green.log (77) |
| Builder wait | f2-builder-wait-red.log 05:21:11Z | f2-builder-wait-green.log (79) |
| READ_DEADLINE_MS seam | int-seam-deadline-red.log 06:03:59Z (still reading after 5 s) | int-seam-deadline-green.log (11 files, 162) |
| F1 improvements | f1-improve-images-red.log 05:51:07Z | f1-improve-images-green.log (82) |

Green at the head: every named test passes in the suite's `pnpm test` at 03e18576… (397 files, 6,666 + 1).

## Deviations and notes

- **CI-S4 supersedes E16** (the session's disposition); ADR Part 5's "A push warns", N26 and the design's E16 record
  say so.
- **CI-S3 reads `origin/claude/build-platform`**, not BASE (a pull request into another branch cannot offer its own
  history); **CI-S2 is slightly wider** than worded; **the reader is stricter than BuildKit** in four places; **SEC-N4
  covers `base.ts`'s git too**; **CI-N4 has no behaviour red**.
- **The base moved** to 56ed6279… (#81, pushed 05:37:48Z) after the task named 165c5993…; merged with no conflict.
- **The U+FEFF subject.** F1's e39d469a… entered as 5f06218a…, reworded by cherry-pick. The integrator's first try
  (f7ad5635…, local, never pushed) took the same invisible character, because the tool layer decodes a backslash-u
  escape in a command's text; it was undone with `git reset --soft HEAD~1` and committed again. No pushed commit was
  rewritten. Messages are now written from files with the escape built in code.
- **A miscount in e9ec332e…'s message:** it says "five of the seven" spellings pass the old asserts; the soft red with
  all seven shows six (`int-ci-s1-red-soft-7.log`). Recorded in failing-first.md; not amended.
- **Docker Hub rebuilt node and postgres** again (05:40Z, 04:13Z): `43b9ba11…` and `edb0c08d…` are on none of the 500
  most recent tags. Pull requests are unaffected (their base names both); the revert path vouches for both through
  e908c214… from 2026-10-29T21:06:13Z. ADR Part 5's measured state records it.

## For the session to decide

- **CI on 03e18576…:** read the run (unit should be 397 files, 6,666 + 1; "Action pins" bootstraps again since
  56ed6279… lacks `age.ts`; `mutation` no shard; `capacity` runs), record it in #82's "The new head's run", then the
  draft's readiness.
- **Commit the design** (§16 and the E-record notes) on `claude/build-ops`; it is written, not committed. That
  worktree also holds other sessions' uncommitted files (`lane-b-ci-images-digest-status.md`,
  `ci-images-digest*.md`), which this round did not touch.
- **The two process notes above** (the local `reset --soft`, the commit-message miscount): accept as recorded, or say
  otherwise.
- **Proposals not built** (in #82's description and the design's §16): setup-buildx-action's `version:` input;
  images pulled in `run:` steps; a custom frontend's own pulls; `dockerfileRule` through `readDockerfile`; the gitleaks
  download's timeouts; a weekly read of `web-flow.gpg`; the design's P18 to P28.
