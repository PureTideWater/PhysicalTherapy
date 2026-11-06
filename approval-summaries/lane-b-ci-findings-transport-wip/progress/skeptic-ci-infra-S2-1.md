# Skeptic 2 of 3, ci-infra finding S2 (no test holds the pause between download tries)

Clone /home/user/sk-cft-ci-infra-S2-1 at origin/co-001/wip-ci-findings-transport (head 1322c7cf…), read only, removed after.

## Reproduction
- Both blocks in .github/workflows/content-calendar.yml (lines 109, 184): `if [ "$try" -lt 3 ]; then sleep "$DOWNLOAD_PAUSE"; fi`.
- runNotify (tools/test/workflows.test.ts ~1332) forces DOWNLOAD_PAUSE '0'; the only pause assertions are static (env.DOWNLOAD_PAUSE is '10'; the 3*(limit+10)+2*pause < 300 bound).
- Mutation: both sleep lines deleted. `vitest run tools/test/workflows.test.ts -t content-calendar`: 12 passed, 0 failed. Whole tools/test: 19 files, 305 passed, 0 failed. Logs: scratchpad/cft/logs/sk-S2-1-W2.log, sk-S2-1-W2-all.log.
- Nothing else in the repository references DOWNLOAD_PAUSE or the sleep.

## Verdict
Not refuted. Real, severity should (a reliability property the design and ADR 0071 document, three tries DOWNLOAD_PAUSE seconds apart, with no behavioural test; no security or money impact).

## Fix
Stub `sleep` in the fake's bin: append "sleep $*" to $FAKE_DIR/log, then exec /bin/sleep "$@". Change the fake gh's stall to `exec /bin/sleep 30` so stalls are not logged as pauses. runNotify takes the pause from values (default '0'). Assert the log in order for notify and handoff: 0 failures -> no sleep; 2 failures -> run download, sleep P, run download, sleep P, run download; 3 failures -> exactly two `sleep P`, none after the third try; the oversize refusal -> no sleep.
