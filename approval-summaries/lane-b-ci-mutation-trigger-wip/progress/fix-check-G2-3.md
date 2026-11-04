# Fix check G2, round 3 (S1, C-G1, S2, C-G2) after repair 2

Head under check: f23850fa… expected. Clone /home/user/fx-p4-G2-3 (read only, removed at end).
Logs: scratchpad p4/logs/fix/G2-3/; adversarial scripts in scratchpad p4/g2adv3/.

## Progress
- Started; no earlier run of this round.
- Clone at f23850fa… (= origin WIP); co-001/ci-mutation-trigger still 50029e64… on origin. pnpm install --frozen-lockfile exit 0 (G2-3/install.log).
- Read repair-2 source diff (05d3291b..f23850fa): every git in affected.ts now via runGit (spawnSync, stderr piped; failure throws through printable with control-character args quoted; success stderr written through printable). printable quotes a line holding a control character or matching /^\s*(?:::|##\[)/. main/cli split; cli prints errorText (printable) and sets exitCode 1. runtime.ts runs no git (reads .git as files). No other spawn or console output in affected.ts.
- Batch 1 running under one lock hold (g2adv3/batch1.sh): head suite, 50029e64's tests at head, affected() dump head vs 50029e64 (same 80 paths as round 2).
- Prepared g2adv3/e2e.sh (CLI end to end: control files; gitlinks with LF, CR, U+2028, LF+NBSP, LF+spaces+##[, LF+U+3000+::add-mask, LF+BOM; harmless gitlink; nested .gitattributes; docs; bad bases with LF, CR, U+2028) and g2adv3/scan.py (lines the runner would parse as commands after .NET TrimStart; raw control characters). mut.py: round-2 set plus Y1–Y10 over repair 2.
- INTERRUPTED: batch 1 never got the heavy lock (another session held it) before this run had to return. Stopped batch1.sh before it touched the clone; clone /home/user/fx-p4-G2-3 removed. No suite, dump, end-to-end or mutant run happened this round. A resumed run should re-clone f23850fa… and run g2adv3/batch1.sh, e2e.sh (+ scan.py over its *.stdout/*.stderr) and mut.py (under flock), all prepared in scratchpad p4/g2adv3/.
- Static reading only: no defect found in runGit/printable/errorText/cli. Leads still to test: Y5 (git's stderr on success written raw) and Y7 (entry line calling main instead of cli) may survive, since the child-process test imports cli directly.
