# Fix check K1, round 2 (workflow and tests: ci-infra S1, S2, N1, security S1, critic G1, G2)

Clone /home/user/fx-cft-K1-2 (read only) at 14e71f0c… = origin/co-001/wip-ci-findings-transport. gh 2.89.0 installed.
Logs: scratchpad/cft/logs/fix/k1-2/

## Checks
1. Clone at 14e71f0c…, clean; pnpm install --frozen-lockfile under the lock: 0.
2. Real gh 2.89.0, the handoff step extracted from the workflow (yaml), against a real run of this repository (no findings artifact there): three tries, each logs only the fixed line (exit 1), then the could-not-read message, exit 1. With only the artifact name swapped to a real one: gh's own error holds the blob's signed address (seen in a raw run, log redacted), the block logs none of it (0 matches). `real-gh-block.log`, `real-gh-oexcl.log` (redacted).
3. Real gh stalled (proxy pointed at a local listener that never answers), DOWNLOAD_LIMIT 2, PAUSE 1: three tries exit 124, 8 s in all, exit 1. `real-gh-stall.log`. The blob host is refused by this session's proxy, so a real successful download (and a real second extract over a file) could not be run.
4. gh source at v2.89.0 (internal/zip: os.OpenFile O_WRONLY|O_CREATE|O_EXCL) and v2.103.0 (safepaths Root.Create, replace=false: exclusive); one -n name is not isolated, so the file lands directly in -D. The fake's "file exists" refusal matches. `gh-source.log`.
5. GNU timeout -k with a command that ignores TERM: exit 137, and the step's bash adds its own "line N: PID Killed  timeout -k 10 ... > /dev/null 2>&1" line (the command text unexpanded, no address). Outside K1 (R4); noted.
6. Mutant run (26 mutants of the workflow, each against the 12 content-calendar tests of workflows.test.ts, workflow restored after each, one lock hold): green before 12/12; every mutant red: rm -rf removed 2, rm -rf once before the loop 2, notify only 2; pause removed 2, pause after the last try 2, sleep 0 2, /bin/sleep 2; -le to -lt 3, bound +1 3; head -c to cat 1 (static), to cp 1, head -c "$MAX_FILE_BYTES" 3; size check removed 3, in handoff only 1; read check moved after the marker in handoff 1, in both 1, weakened there 1, weakened inside handoff's block 1; old non -s check 2; handoff exit 0 1; G2 fallback dropped 3, only "|| :" 3, only 2>/dev/null 2; timeout removed 3; stderr redirect dropped 3, both dropped 3. Green after 12/12; worktree clean at 14e71f0c…. `summary.txt`, one log and diff per mutant.
7. Failure reasons spot-read (rm -rf, sleep 0, -lt, cat, handoff size, handoff weak check, 2>/dev/null, stderr leak): each fails on the assertion meant for it.
8. Result: K1 resolved, nothing loosened. One nit outside K1 (R4 wording): a try killed at 137 also gets bash's own "Killed" line in the log, so "one fixed line" is two there; no address or data in it.
9. Clone removed.
