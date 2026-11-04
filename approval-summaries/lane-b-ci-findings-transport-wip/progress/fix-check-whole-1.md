# Lane B ci-findings-transport: fix round, whole-diff adversary round 1 (progress)

Started 2026-11-04. Clone /home/user/fx-cft-whole-1 (read only), WIP head 6a3c9258… = origin. Live base
origin/claude/build-platform 35422a92… (moved past the c7bed0f7… the records name).

## Checked
- git diff 1322c7cf..6a3c9258 whole (workflow, ADR 0071, ci.md, content-updates.md, workflows.test.ts) and the item's
  diff against origin/claude/build-platform (13 files). Notify and handoff download blocks equal; push and schedule
  path (notify `always() && event != pull_request`) unchanged; no new env value, so #86's value rule untouched (the
  fix round touches no ADR 0066 text and no value-table test); notify's permissions unchanged (actions: read, issues: write).
- Removed test lines: only the old fake, the forced DOWNLOAD_PAUSE 0, the 502 message count and the old download
  line, each replaced by a stricter assertion. No assertion loosened.
- Trial merge `git merge-tree` with 35422a92…: clean, tree 1c5fc9b5…; its CI files equal the WIP's. workflows.test.ts
  with CI_TREE on the merged tree: 140 passed, 2 skipped (the two that skip under CI_TREE by design), exit 0.
- Under the lock: vitest --project unit tools/test tools/content-calendar 23 files 353/353; typecheck 0 (22 projects).
- Timing: the content-calendar cases run three times, all green; the download case 5.25-5.35 s, handoff 1.75-1.97 s
  (testTimeout 30 s). Logs `whole1-*.log`.
- Proof: the notify and handoff step scripts at 6a3c9258 hash to 651d4854…6f20 and 495a4dde…e6fe, as the design's §7 says.

## Found
- nit (records, G4 again): the live base is now 35422a92… (#116), past the c7bed0f7… (#117) the status file, merge.md
  and the build summary name. Fix: name 35422a92… (#116); the base merge is still to do.
- nit (docs): "124 when stopped" (workflow comment, ADR 0071 Amendment, content-updates.md "124: stopped after 60
  seconds"): a gh that ignores TERM is killed 10 s later and the try logs 137 (checked: `timeout -k 1 1` on a
  TERM-ignoring child exits 137). Fix: "124 when stopped, 137 when killed 10 seconds later".
- nit (flake margin): handoff's `partial` row runs with DOWNLOAD_LIMIT 1 though it does not stall, so its succeeding
  try must finish within 1 s on a loaded runner. Fix: give the partial row the default limit (only the stalled row needs 1).
- nit (test text): an orphaned JSDoc line "A run's download tries and pauses in order …" sits above listOf's comment;
  move it to `paced`.
- No regression, no loosened rule, no blocking or should issue.

Clone /home/user/fx-cft-whole-1 removed.
