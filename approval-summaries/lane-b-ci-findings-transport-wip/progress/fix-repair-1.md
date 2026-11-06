# ci-findings-transport: fix repair round 1 (verifier round 1 issues)

Start: WIP 6a3c9258… = origin/co-001/wip-ci-findings-transport; clean. End: WIP 14e71f0c…, pushed fast-forward
(pre-push: fixture guard and gitleaks clean). Live base origin/claude/build-platform 35422a92… (#116, checked 23:32 UTC);
the base merge is still to do; co-001/ci-findings-transport not pushed. Logs: scratchpad/cft/logs/fix/repair-1/.

| # | Issue | What was done | Commit |
| --- | --- | --- | --- |
| R1 | K1 should: the read check took a file of two JSON documents (jq -e judges the last) | Both download blocks read `jq -e -s 'length == 1 and (.[0] \| …)'`; SHAPE_CHECK updated; handoff row "two lists in one file"; notify case ending in "check failing"; ADR 0071 Amendment and ci.md handoff row say one JSON document. Red: 2 tests (notify case filed nothing; SHAPE_CHECK not in block), green 12/12 | 473b9e7d… |
| R2 | nit: orphaned `paced` doc comment | moved onto `const paced` | e7241327… |
| R3 | nit: handoff partial row ran with DOWNLOAD_LIMIT 1 | partial row uses the step's 60; stall row keeps 1 (flake risk only, no red possible) | e67d16cf… |
| R4 | nit: a try killed by -k 10 logs 137 | block comment (both jobs), ADR 0071 Amendment, content-updates.md say 124 when stopped, 137 when killed 10 s later (checked: GNU timeout gives 137). Doc only: a test would cost 11 s a try | 02e5cd8e… |
| R5 | nit: ci.md handoff row lacked the log-hygiene clause | added | 14e71f0c… |
| R6 | nit: §7 leak row claimed more than the proof printed | prove.mjs prints the leak flag in sections 2 and 3 and adds a two-document case (sections 3, 5); re-extracted at 14e71f0c… and regenerated: 34 of 34 cases false; §7 hashes, rows and history updated | ops only |
| R7 | nit: records named c7bed0f7… (#117) as live base | status, build summary, merge.md, fix-build.md name 35422a92… (#116), checked 23:32 UTC, base merge still to do | ops only |

Checks at 14e71f0c… under one lock hold: vitest tools/test + tools/content-calendar 353/353 (23 files), typecheck 0,
lint 0, lint:logs 0, actions:check --offline 0.
