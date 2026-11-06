# Lane B: ci-findings-transport, fix round (2026-11-04 to 2026-11-05, UTC)

Acting S3 (https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3), workflow wf_e37dde4a-f34. Worktree
/home/user/ci-findings-transport. The WIP `co-001/wip-ci-findings-transport` went 1322c7cf… → 6a3c9258… (build) →
14e71f0c… (repair 1) → 3d48d0b3… (repair 2) → 811c65b7… (base merge) → cd2c91c0… (base merge 3). Pushed as `co-001/ci-findings-transport`
at **cd2c91c0…** on 2026-11-05 at 01:15:20 UTC (new branch, through the pre-push hook: 2 commits checked, gitleaks clean), the WIP ref fast-forwarded to the same sha at 01:15:29 UTC. Every choice the recommended option, security the safer. Synthetic data only. Progress:
`lane-b-ci-findings-transport-wip/progress/fix-{build,repair-1,repair-2,integrate}.md` and the verifiers'
`fix-check-*.md`. Logs: scratchpad `cft/logs/fix/` (with `repair-1/`, `repair-2/`, `k1-2/`) and `cft/logs/suite/`.

## Findings (reviews of 1322c7cf…, three skeptics a finding, and the critic)

| Finding | Severity | Skeptics | Resolution | Commit |
| --- | --- | --- | --- | --- |
| ci-infra S1: no test held the per-try `rm -rf`; the fake gh overwrote where gh 2.89/2.103 refuse (O_EXCL) | should | 3 of 3 real (should) | fake gh refuses a findings.json already in -D; a partial (cut-file) mode; notify with one partial try, handoff with one partial try and one stall, never "file exists" | a62a0fa6… |
| ci-infra S2: no test held the pause | should | 3 of 3 real (should) | stand-in `sleep` logs each pause (the stall uses /bin/sleep); try, sleep 10, try; never after the last | 086d2953… |
| ci-infra N1: no case at exactly `MAX_FILE_BYTES` | nit | 3 of 3 real (nit) | with the bound 100: 100 bytes read, 101 refused, notify and handoff | fb29b355… |
| ci-infra N2: "(the check: success)" after a failed download | nit | 2 of 3 refuted | not a defect (every word true, the run linked, content-updates.md lists the case); unchanged | none |
| security S1: no test failed with the size refusal removed | should | 3 of 3 real (2 should, 1 nit) | padded list and list followed by other bytes refused in both jobs; static check of the one read through `head -c "$((MAX_FILE_BYTES + 1))"`, the refusal next | 44757e39… |
| security N1: a failed blob download wrote the signed address into the public log | nit | 2 of 3 real (nit), 1 refuted | safer option: gh's stdout and stderr to /dev/null, one fixed line a failed try with its exit status; the fake prints a synthetic signed address no output may hold; then each try inside `{ …; } > /dev/null 2>&1` (repair 2) | 6a3c9258…, 3d48d0b3… |
| critic G1: handoff's read check outside the block T-H holds equal | should | critic | `readable` set inside the shared block; after the marker each job only branches on it; handoff rows: no body, title not a string | 1bf36150… |
| critic G2: no test of `2>/dev/null \|\| : > findings.json` | nit | critic | artifact with no findings.json: notify "check failing" after 1 try, handoff exit 1 with its message | 5f45db7c… |
| critic G3: §7 proof predated the timeout | should | critic | `proof/scripts/extract.mjs` takes the steps from the workflow; `prove.mjs` rewritten; §7 regenerated at 6a3c9258…, 14e71f0c…, 3d48d0b3… | ops only |
| critic G4: records named a stale base | nit | critic | records name the live base; base merged (below) | ops only |

## Failing first

| Change | Red (log) | Green |
| --- | --- | --- |
| ci-infra S1 | clearing deleted in both jobs: 2 failed (`ci-infra-S1-red.log`) | 12/12 |
| ci-infra S2 | pause deleted: 2 (`ci-infra-S2-red.log`); `sleep 0`: 2 (`…-red-C23.log`) | green |
| ci-infra N1 | `-le` → `-lt`: 2; bound + 1: 2 | green |
| security S1 | refusal removed: 3; `head -c` → `cat`: 1; `head -c "$MAX_FILE_BYTES"`: 3 | green |
| critic G2 | fallback dropped: 3 | green |
| critic G1 | new test on 1322c7cf…: 1; handoff's check weakened after the fix: 1 | green |
| security N1 | new tests on 1322c7cf…'s lines: 3; redirect removed: 3; stdout only: 3 | green |
| check K1 (473b9e7d…) | 2 (two-document file passed; SHAPE_CHECK not in block) | 12/12 |
| repair K1 (3d48d0b3…) | 2 (bash's "Killed" line in stderr) | 12/12 |
| critic G3 | old work scripts have no `timeout` and differ from the built steps (`critic-G3-red.log`) | both scripts exit 0, every case as expected |

After every build commit: tools/test plus tools/content-calendar, 23 files, 353/353.

## Check rounds and repairs

- **Round 1** (verifiers K1, K2 and a whole-diff adversary on 6a3c9258…): K1 should, the read check accepted a file
  of two JSON documents → `jq -e -s 'length == 1 and (.[0] | …)'` (473b9e7d…); nits: orphaned doc comment
  (e7241327…), the cut-file row's DOWNLOAD_LIMIT 1 (e67d16cf…), exit 137 when killed (02e5cd8e…), ci.md's handoff row's
  log clause (14e71f0c…), §7's leak row (ops), the stale base (ops). Repair 1 → 14e71f0c…; 353/353, typecheck, lint,
  lint:logs, actions:check --offline 0.
- **Round 2** (K1 on 14e71f0c…): every round-1 fix holds; 26 workflow mutants each red; real gh 2.89.0 on the handoff
  step (fixed line only; gh's own error held the signed address, the block's log none); a real stall (three exit 124,
  8 s); gh source at v2.89.0 and v2.103.0 read (O_EXCL; Root.Create replace=false). One nit: a killed try also logged
  bash's "Killed" line → each try in `{ …; } > /dev/null 2>&1` (3d48d0b3…), a SIGKILL case in both jobs. Repair 2:
  353/353, typecheck, lint, lint:logs, actions:check --offline 0. Final check: K1 resolved, nothing loosened.
- §7 at 3d48d0b3…: no signed address in 37 of 37 cases, no stray stderr line in 21 of 21, the block equal (31 lines);
  notify `38896660…0b22`, handoff `8751509e…7b24`, byte-identical at 811c65b7… (the merge leaves the workflow as it was).

## Base merges

| Merge | Base | PRs | Conflicts | Generators | Checks |
| --- | --- | --- | --- | --- | --- |
| a552f770… | 30871f72… | 20 (#92 … #96) | workflows.test.ts 11 hunks: #86's final rule kept whole, the two findings rows, FINDINGS_BYTES and the over exemption removed; `sites` kept (the §16.4 departure, design "Fix round") | synth wrote nothing | workflows.test.ts 142/142 |
| 811c65b7… | 7fb3e102… | #117, #116, #84 (42 commits) | none; ADR 0066, test-matrix.md, ci.md, synth matrix.ts auto-merged, both sides kept | install 0; watched.ts --write 0; synth --all 309 cases, 0 written, 710 unchanged; 8 EMR formats 0 written; nothing to commit | workflows.test.ts 142/142 (97.7 s) |
| cd2c91c0… | 370b8973… | #119 (test-flakes-6; apps/worker/src/screening/threads.test.ts only) | none, both sides kept | install 0; watched.ts --write 0; synth --all 0 written; nothing to commit | typecheck 0 (22 projects); lint 0 (1,819 files); lint:copy 0 (584); lint:logs 0 (1,152); check:fixtures 0; synth clean; workflows.test.ts 142/142; vitest unit tools/test + tools/content-calendar 23 files 353/353 |

## The full suite (merged tree 811c65b7…)

On 811c65b7… (base 7fb3e102…), under the heavy lock; the container restarted during the first unit run at ~00:10
UTC, so unit and everything after it ran again under a second hold (00:14-01:04 UTC). Logs `cft/logs/suite/`.

| Check | Result |
| --- | --- |
| typecheck | 0, 22 projects (66 s) |
| lint | 0, 1,819 files, 0 errors, 0 warnings |
| lint:copy | 0, 584 files |
| lint:logs | 0, 1,152 files |
| check:fixtures | 0, 342 guarded, 4,144 searched |
| verify-content | 0, every content set |
| pnpm test (unit, coverage) | 461 files, 9,261 passed, 0 failed, 4 skipped; lines 68.74%, statements 68.61%, branches 66.2%, functions 63.12%. Local skips: 3 in tools/engine-freeze/differential.test.ts (ENGINE_FREEZE_BASE unset outside CI), 1 in packages/rules/src/content.test.ts "throws when content/outgoing is unreadable" (root uid) |
| test:golden | 5 files, 381 passed |
| test:oracle | 0: pyx12 4.0.0 agrees with all 689 synthetic 835s (678 valid, 11 malformed rejected); edi835 agrees on every one |
| test:db 1/4 | 36 files, 3,292 passed, 1 skipped (restore-drill pg_dump: local 16 vs server 18), 619 s |
| test:db 2/4 | 36 files, 2,773 passed, 247 s |
| test:db 3/4 | 36 files, 2,765 passed, 474 s |
| test:db 4/4 | 35 files, 975 passed, 168 s |
| test:db total | 143 files, 9,805 passed, 0 failed, 1 skipped; each shard on a fresh PG18 database on 5433; the route-tests.8 flake S4 reported did not occur |
| build + stamp | 0 (108 s); stamped 811c65b7… |
| e2e (E2E_PREBUILT=1, --workers=2) | 81 passed (13.1 min) |
| stryker affected (merge base 7fb3e102…) | money, pricing, ledger, packets not affected; any=false, no shard; gate not run |
| synth --all | 309 cases, 0 written, 710 unchanged; 8 EMR formats 0 written; status clean |
| actions:check --offline | 0 |
| BASE=origin/claude/build-platform actions:check | 0; no pin new against the base |
| BASE=origin/claude/build-platform toolchain:check | 0 errors, 1 warning (pnpm 10.34.9 newer than 10.34.8: the base's, weekly triage) |
| actionlint 1.7.7 | plain exit 1: 46 messages, all `label "ubuntu-26.04" is unknown`; with `-shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown'` exit 0 |
| workflows.test.ts whole | 142/142 on 811c65b7… and on cd2c91c0… |

Nothing red; no fix commit was needed.

## Open

- The draft pull request (S3 opens it from scratchpad `cft/pr-body.md`, 24,473 characters, and `cft/pr-title.txt`).
- The runs of record (design §10): this pull request's content-calendar run with `handoff` green (first), the merge's
  push run (second).
- ADR 0071's two `<merge date, UTC>` placeholders, at the merge (§11 step 7).
- Proposals P1 to P5 (description), outside this change.
