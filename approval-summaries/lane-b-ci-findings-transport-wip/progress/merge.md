# ci-findings-transport: base merge into the WIP (progress)

Worktree /home/user/ci-findings-transport, branch co-001/wip-ci-findings-transport.

## Steps
- 21:2x UTC start: HEAD b9a83bd3… = origin/co-001/wip-ci-findings-transport; base origin/claude/build-platform 30871f72…; merge-base d257fe6d…. 20 first-parent merges new to the WIP: #92, #93, #90, #42, #95, #91, #94, #107, #105, #75, #106, #86, #108, #104, #109, #113, #114, #85, #115, #96.
- Merge committed 4fd30937… (not pushed yet). Conflicts: tools/test/workflows.test.ts (11 hunks), docs/product/reconciliation-001.md (1), ADR 0066 (1).
  - workflows.test.ts: #86's final rule kept whole; over machinery removed (Reading.over, overAlone, the "beside it" refusal + fixture cases, BoundedValue.over, FINDINGS_BYTES, FINDINGS, the two findings rows, T6's over/wording assertions). `sites` KEPT (deviation from design §16.4, which predates it: publish-content's release-numbers row uses sites, and #86's T6 asserts every row past 131,072 bytes has sites). Sites fixture test kept, notify fixture row's `over` dropped. T6: this branch's two assertions + #86's sites assertion.
  - reconciliation-001: base's #86 entry and #96 P4 entry, then this branch's entry.
  - ADR 0066: base side taken; rewrite of N32 in a separate commit (step 3). ci.md :163 and :454 (base) also name the FINDINGS_B64 exception: fix in that docs commit.
- Merge amended before any push (a stray closing brace outside the strings() hunk, a parse error): merge now a552f770…. workflows.test.ts + tools/content-calendar: 3 files, 177/177 passed (logs/merge-wf2.log).
- Follow-ups: b4881927… test (sites fixture test retitled, comment; wording only, no case changed: green 1/1 before and after, logs/sites-title.log); 1322c7cf… docs (ADR 0066 N32: sum bullet "with no exception", the "One listed value is over the limit" bullet rewritten per design §16.5, keeping #86's "every value past 131,072 held to its places: publish-content's release numbers"; ci.md :163 and :454 drop the FINDINGS_B64 exception). ADR notice list identical to the base's (N32 once; no new notice; the pre-existing duplicate N5 is Part 2's and Part 4's, the base's).
- Next: generators, then the checks under one lock hold.
- Generators under the lock (pnpm install --frozen-lockfile, watched.ts --write, synth --all: 307 cases, 0 written): nothing to commit.
- Checks under one lock hold 21:16-21:24 UTC, all exit 0: typecheck, lint, lint:copy, lint:logs, check:fixtures, workflows.test.ts 142/142, vitest unit tools/test tools/content-calendar packages/synth 37 files 545/545, actionlint (1.7.7, -shellcheck= -pyflakes=, ubuntu-26.04 label ignored), actions:check --offline. Logs scratchpad cft/logs/check-*.log.
- Pushed 21:25 UTC: co-001/wip-ci-findings-transport b9a83bd3…..1322c7cf… (fast-forward, the hook: 3 commits checked, gitleaks clean). DONE.

- 2026-11-04 ~22:30 UTC (fix round build, critic G4): the live base is now c7bed0f7… (#117); this merge record's 30871f72… is the base the WIP holds, not the live one. The next base merge takes c7bed0f7… or later.
- 2026-11-04 23:32 UTC (fix repair round 1): the live base is now 35422a92… (#116); the next base merge takes 35422a92… or later. Still to do.
