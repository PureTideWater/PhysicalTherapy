# ci-findings-transport: fix repair round 2 (verifier round 2 issues)

Start: WIP 14e71f0c… = origin/co-001/wip-ci-findings-transport; clean. End: WIP 3d48d0b3…, pushed fast-forward
(pre-push hook ran: fixture guard and gitleaks). Round 2 real issues: none. Nits: K1. Live base origin/claude/build-platform
still 35422a92… (#116, checked 23:49 UTC); the base merge is still to do; co-001/ci-findings-transport not pushed.
Logs: scratchpad/cft/logs/fix/repair-2/.

| # | Issue | What was done | Commit |
| --- | --- | --- | --- |
| K1 | nit: a try killed after -k 10 also logs bash's own "line N: PID Killed  timeout -k 10 … gh run download …" line, so "one fixed line" is two | Safer option taken: the try runs as `{ timeout -k 10 "$DOWNLOAD_LIMIT" gh run download …; } > /dev/null 2>&1 \|\| code=$?` in both jobs (word for word), so bash's job report goes to the group's /dev/null (checked: a subshell does not work, bash execs its last command and the parent still reports). Fake gh gains a kill mode (`kill -9 $$`: timeout dies of SIGKILL as when -k fires, exit 137, no 11 s wait); notify and handoff cases hold stderr equal to the one fixed line (exit 137) and no "Killed" or "gh run download" in the output; DOWNLOAD constant and the line expectation updated; block comment and ADR 0071 Amendment say bash's report stays out too (ci.md and content-updates.md already say "one fixed line", now true). Red: 2 tests (the Killed line in stderr), green 12/12 | 3d48d0b3… |
| §7 | proof follows the block | prove.mjs adds kill and ignore-the-stop (real -k 10 path, 11 s) cases in section 4, a killed case in section 5, a stray-stderr count, and a counter-proof with the old line (one extra "Killed" line); re-extracted at 3d48d0b3…: 37 of 37 no leak, 21 of 21 no stray line, block 31 lines; §7 hashes and rows, §16.8 updated | ops only |
| G4 | records name the live base | status, build summary, design §16.8: base 35422a92… re-checked 23:49 UTC | ops only |

Checks at 3d48d0b3… under one lock hold: vitest tools/test + tools/content-calendar 353/353 (23 files), typecheck 0,
lint 0, lint:logs 0, actions:check --offline 0.
