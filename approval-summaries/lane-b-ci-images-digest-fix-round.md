# Lane B: ci-images-digest (#86), fix round: summary

2026-11-01 to 2026-11-04. Acting Lane B session S3 (Lane A's account). PR #86, branch `co-001/ci-images-digest`, base
`claude/build-platform`. Runs `wf_401c564d-6b7` (build, check round 1, repair 1, check round 2 in part) and
`wf_2970023f-7c8` (check rounds 3 and 4, repair 3, integration). Step records: `lane-b-ci-images-digest-wip/progress/`.

## Result
- Pushed (R3): 932ea45f… to `co-001/ci-images-digest` (fast-forward from 83167b8f…) at 2026-11-04 08:37:10 UTC; WIP ref the same.
- Base merges: b8837f47… (4846f043…: #92, #93, #90, #42, #95, #91, #94); 2e880412… (7bf7b252…: #107); base merge 3 932ea45f… (881e2bbd…: #105, #75, #106; no conflict; generators wrote nothing).
- Pre-push read: 08:36:52 UTC, body 125,892 characters, ruler 100,061 characters, SHA-256 5bb5e558… (as expected). approval-of-record runs between read and push: none (newest before the push 2026-10-28 08:01:41; 41800917267 at 08:37:17 is the push's own). ci run for R3: 41800917824 (created 08:37:17 UTC, queued).
- The notice is ADR 0066 Part 3 **N32** (commit messages before b2a41a00… say N29; they stay).

## Dispositions
Skeptics: three per finding in the review round (`lane-b-ci-images-digest-review-{ci-infra,security-supply}.md`).

| Finding | Reviewer | Skeptics | Resolution | Commits (build; repairs 1, 2, 3; integration) |
|---|---|---|---|---|
| D1 T6's line citations go stale; a changed producer stays green | CI S1, security S2, critic C2-F2 | 3/3, 3/3, confirmed | structural refs (step, output, matrix, needs, symbol, test); `run:` producers fingerprinted with what they inherit; tool code names its test | 8681adb9…; ff3793b0…, 646c5bc1…, 66350147…, ca54de5d…, 197686ce…; 2aaaa3d9…, b133ee52…, 707e436a…, 66246ad0…; ec5a5046…, 67a7a119…, 6eec71ce… |
| D2 an expression in a mapping key is never read | security S1 | 3/3 | whole-tree key walk refuses `${{` in any key | 330deea0…; 31735bb7…, 633c2c0e…; 952051d0…, c28832e1…; 3ec9349c… |
| D3 bounds per expression, not per string | CI N4, security N1 | confirmed | byte sum per environment string and argument, over 131,072 refused | c1e80912…; c06f3f3e…, 30d05555…, 14a9e6bf…, 81be3473…; 0c95476b…, 10ac5bb1…, 8de91f26…, 944c57b8…, 451759dc…; 30929b2e…, efba7d6d…, 9fe834e6…, 328f0a18… |
| D4 the over value held per (file, job, value), not per use | critic C2-F1 | confirmed | exact `sites`; exempt only alone in its string | 9ac28806…; 46e555e9…, 11534e93…; 01855cb4…, e5c17c37… |
| D5 T5's fixed count of 7 | CI N1 | confirmed | builds counted by parsed `uses:` keys against the text; container env and options, triggers | 6adc518f…; 5e42c2fa…; d6f70cb8…, f507f668…, ae6a566d…; 0b720a92…, 2648ccf0… |
| D6 `$GITHUB_ENV` closes the name, not the value | security N2 | confirmed | closed map by name, place, exact line, fingerprint, behavioural test; `$GITHUB_PATH`, file-command names, repository scan | a7ccead0…; 942a6b02…, 1b8e595a…; bfc19c39…, 9ca2b3d0…; 09351c17…, b3196a08…; 9936688b… (#107's two writes) |
| D7 pull-request build records hold the event, public 90 days | security S3 (CI N5 folded in) | 3/3 real | `DOCKER_BUILD_RECORD_UPLOAD: ${{ github.event_name != 'pull_request' }}` on seven builds (premise read at the pin; no fallback) | 19cc7bf5…; ed43d78f…, 3409fb65… |
| D8 "under GitHub's 1 MB" counts characters, not UTF-16 | CI N2 | confirmed | row says 1,866,672 bytes as UTF-16, over, ci-findings-transport's | 91910da1…; c4de5872…; c0a73c37…; cb77264e… |
| D9 reconciliation-001's undefined C labels | CI N3 | confirmed | labels removed; R1, R2 named | d5f987a4…; 0dd58dbf…, b9f9ca4c…; 0ad217aa… |
| D10 the rule's scope unstated | critic C1-F3 | confirmed | scope stated (this repository's workflows; a pinned action's files not read) | f89770ca…; 2fbff79b…; 5c01f150… |

Refuted: CI N5 (a recorded retention proposal; folded into D7). Security N3 (`name:`/`run-name:` reach no process; by
design).

## Check rounds and repairs
- Build: d257fe6d… (29251dbb… merge of 43565235… #83, then D1–D10, an ADR wording fix). Each disposition red-before /
  green-after (`fix-build.md`).
- Check round 1 (11 verifiers on d257fe6d…): every disposition had issues; two loosenings (D4 removed FINDINGS_B64's
  exact-value pin; D3+D4 exempted a whole string holding the over row).
- Repair 1 (d257fe6d…..a5bc1170…, 26 commits): both loosenings undone, every issue fixed or made a proposal
  (`fix-repair-1.md`).
- Check round 2: cut by the window; surviving verdicts D1 (fingerprints miss inherited job/workflow env and
  defaults), D2 (no-space key spelling, an overstatement), D3 (matrix include gap).
- Repair 2 (a5bc1170…..5c01f150…, 21 commits, 2026-11-02 08:44–09:18 UTC): its record was lost; check round 3 read it.
- Check round 3 (A1, A2, A3, whole on 5c01f150…): repair 2 confirmed, nothing loosened; shoulds: A1 capital job ids,
  testTitles hook skips / describe return; A2 two joined secrets unpinned; A3 container options `--env`, file commands by
  built path, a repository script writing `$GITHUB_ENV`; nits.
- Repair 3 (5c01f150…..2648ccf0…, 13 commits): every should and nit but one (file-command over-reach: strict, kept).
- Check round 4 (A1, A2, A3 on 2648ccf0…): all resolved, nothing loosened. Nits left open (below).
- Integration: base merge 1 b8837f47…; base merge 2 2e880412… (#107; ci.md images bullet conflict, both kept); 9936688b…
  (T3/T6 list #107's TRIVY_CMD `$GITHUB_ENV` and trivy-bin `$GITHUB_PATH` writes in the three install steps,
  fingerprints, bound re-read, a behavioural test); base merge 3 932ea45f… (881e2bbd…: #105, #75, #106; no conflict; generators wrote nothing).

## Full local suite (once, on 9936688b…, 2026-11-04 06:29–08:11 UTC; logs `scratchpad/imgdigest/logs/suite/`)
| Part | Result |
|---|---|
| typecheck | 22 projects passed |
| lint | 1,749 files, 3 groups, 0 errors, 0 warnings |
| lint:copy | 557 files |
| lint:logs | 1,116 files |
| check:fixtures | 334 guarded, 4,032 searched |
| verify-content | every content set passes |
| test (unit, coverage) | 432 files, 7,317 passed, 0 failed, 4 skipped (3 differential.test.ts: ENGINE_FREEZE_BASE unset locally, CI sets it; 1 content.test.ts "throws when content/outgoing is unreadable": root uid); lines 67.84% |
| test:golden | 5 files, 376 passed |
| test:oracle | pyx12 agrees on 688 (677 valid, 11 malformed) |
| test:db 1/4 | 35 files, 3,218 passed, 1 skipped (restore-drill pg_dump: local pg_dump 16 vs server 18) |
| test:db 2/4 | 35 files, 2,787 passed |
| test:db 3/4 | 35 files, 2,666 passed |
| test:db 4/4 | 34 files, 977 passed |
| test:db total | 139 files, 9,648 passed, 1 skipped, 0 failed; each shard on a fresh database |
| build + stamp | passed; stamped 9936688b… |
| e2e (E2E_PREBUILT=1, 2 workers) | 70 passed (14.2 min); first attempt cut by SIGTERM at the run's stop, rerun whole |
| stryker affected (base 7bf7b252…) | any=false, no shard: gate not run |
| synth --all | 0 written (680 + 16 unchanged); git status clean |
| actions:check --offline / BASE | passed / passed (no pin new) |
| toolchain:check BASE | 0 errors, 1 warning (pnpm 10.34.9 newer than 10.34.8: base's, weekly triage) |
| actionlint | exit 0, 10 files |

Base merge 3's checks (fast checks and workflows.test.ts on the merged tree): install, watched --write, synth --all wrote nothing; typecheck 22 projects; lint 1,759 files 0/0; lint:copy 557; lint:logs 1,120; check:fixtures 342 guarded / 4,050 searched; workflows.test.ts 133/133; vitest unit tools/test 21 files, 309 passed. CI is the suite of record
for the base's own changes (#105, #75).

## Failing first (red / green; logs `scratchpad/imgdigest/logs/`)
| Change | Red | Green |
|---|---|---|
| D1–D10 (build) | `<id>-red.log` per disposition (`fix-build.md`, build scratchpad) | `<id>-green.log` |
| Repair 1 | `R1-c1`…`R1-c20-*` | `R1-final-*` (workflows.test.ts 124/124) |
| A1.1 capital job id | R3-c1-red.log | R3-c1-green.log |
| A1.2 testTitles | R3-c2a…c2d-red.log | R3-c2-green.log (124/124) |
| A1.3 D8 negation | R3-c3p1-red.log, R3-c3p2-red.log | R3-c3p1old / c3p2old (old regex passes), R3-c3g |
| A2.1 two secrets | R3-c4m-red.log | R3-c4-green.log |
| A2 include expression / 131,072 argument / container prefix | R3-c5m, c6m, c7m-red.log | R3-c5, c6, c7-green.log |
| A3.1 container options | R3-c8-envopt, eopt, joined, envfile, expr, svc, envopt2 | R3-c8-cpus.log |
| A3.2a file-command names | R3-c9m-red.log | R3-c9-green.log |
| A3.2b repository scan | R3-c10-probe-red.log | R3-c10-green.log |
| NEEDS_JOB_BYTES 96 | R3-c11m-red.log | R3-c11-green.log |
| #107's file-command writes | int2-m-installer2lines.log, int2-m-secondvar.log | int2-fix-green.log (128/128) |

## Trial merges
| Branch (head) | Against | merge-tree | Whole workflows.test.ts |
|---|---|---|---|
| claude/build-platform 4846f043… | 2648ccf0… | clean | 124/124 (became b8837f47…) |
| claude/build-platform 7bf7b252… (#107) | b8837f47… | ci.md images bullet, both kept | 128/128 after 9936688b… (became 2e880412…) |
| co-001/ci-mutation-trigger 50029e64… (#96) | 9936688b… | ADR 0066, reconciliation-001 (docs; union for the trial) | merged file 130/130; head file with CI_TREE 1 failed / 126 / 1 skipped: #96's own canary command row |
| co-001/wip-ci-mutation-trigger | b8837f47… | same docs | merged 126/126; CI_TREE same canary row |
| 11 other relevant co-001 heads | b8837f47… | conflicted (trivy-install/trivy-pin ci.md; wip-ci-findings-transport ADR, reconciliation-001, workflows.test.ts; wip-interest-chain release.yml, reconciliation-001, workflows.test.ts, stale; 7 with the base only) | not materialised |
| claude/build-platform 72096e94…, then 881e2bbd… (#105, #75, #106) | 9936688b… | clean | merged 881e2bbd… instead (moved again, #106): no conflict, 133/133 (932ea45f…) |

For #96's base merge: test "mutation testing … runs every selected shard, the canary first" (workflows.test.ts ~2679)
expects `pnpm stryker run tools/stryker/canary/stryker.config.mjs`; #96 has `pnpm -s exec tsx tools/stryker/stryker.ts
run tools/stryker/canary/stryker.config.mjs`. #96's to change, not #86's.

## For ci-findings-transport (by anchor text)
#86's notice is ADR 0066 Part 3 N32; N29 is #82's Part 5 revert-path notice; the sentence to rewrite is in N32's 'What
holds it' bullet, starting 'One listed value is over the limit' (re-locate by text); the T6 rows are the two findings
rows (FINDINGS_B64 with over: 'ci-findings-transport', and their sites lists) and the over-98,292-bytes bound.

## Open
- Round 4 nits (not fixed; no check round left): A1 aliased hooks and `arguments[0]['skip']` pass testTitles; no
  fixture for toJSON's case-insensitive job sum or the D8 /i and n't forms; `needs: build` for a job `Build` errs red;
  D8's deny-list admits other denials. A2 no fixture at 49,153 for a called workflow's secret; no non-ASCII env name
  fixture; ADR/strings() list omits a called job's `secrets:`. A3 quoted `"-e"` in container options passes.
- Proposals: #82's parseActionMeta to keep composite env/run (D10); provenance-add-gha=false (P2); old `.dockerbuild`
  artifacts of past pull-request runs (founder/ops, D7-4); length assertions in the tool owners' tests (D1-3).
- Not changed: the file-command over-reach (a `name:`/`if:` naming GITHUB_ENV is refused; strict only).
