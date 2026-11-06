# Skeptic 1 of 3, ci-infra S2 (no test holds the pause between download tries)

Clone /home/user/sk-cft-ci-infra-S2-0 at origin/co-001/wip-ci-findings-transport = 1322c7cf... (removed after).

Reproduction: deleted `if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi` from both download blocks of
.github/workflows/content-calendar.yml. `vitest run tools/test/workflows.test.ts -t content-calendar`: 12 passed;
`vitest run tools/test/ tools/content-calendar`: 21 files, 340 tests passed, 0 failed (logs skS2-0-W2*.log).
Why: runNotify sets DOWNLOAD_PAUSE '0'; the only pause assertions are env.DOWNLOAD_PAUSE === '10' and the
timeout arithmetic; the word-for-word block equality between jobs still holds when both lose the line.

Verdict: not refuted, severity should. Fix: a stub `sleep` on the fake's PATH that logs "sleep $*" and exits 0;
the fake gh's stall uses /bin/sleep 30 so it is not logged; runNotify keeps the step's DOWNLOAD_PAUSE ('10')
instead of forcing 0; 0, 1, 2, 3-failure cases expect 0, 1, 2, 2 logged `sleep 10` lines (none after the last try).
