# Skeptic 3/3, ci-infra S2 (no test holds the pause between download tries)

Clone /home/user/sk-cft-ci-infra-S2-2 at origin/co-001/wip-ci-findings-transport = 1322c7cf... (removed after).

## Reproduction
- Mutation: deleted `if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi` from both notify (l.109) and handoff (l.184) in .github/workflows/content-calendar.yml (2 deletions).
- `vitest run tools/test/workflows.test.ts -t content-calendar`: 12 passed, 0 failed (logs/sk-S2-2-W2.log).
- `vitest run tools/test/`: 19 files, 305 passed, 0 failed (logs/sk-S2-2-W2-all.log). No other test holds the line.
- Cause: runNotify sets DOWNLOAD_PAUSE '0' and nothing observes sleep; the tests check only env.DOWNLOAD_PAUSE === '10' and the time-budget arithmetic.

## Verdict
Not refuted. Severity: should. Fix: a sleep stub in the fake's bin that logs `sleep $*` to $FAKE_DIR/log and execs /bin/sleep; the fake gh's stall uses `exec /bin/sleep 30` so it is not logged; in the 0/2/3-failure and stall cases for notify and handoff, expect 0/2/2 `sleep 0` lines (pause stays 0 so no slowdown).
