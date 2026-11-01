# p4-finish-fix progress (PR #83, worktree /home/user/ux-screening-result-tables)
Started 2026-11-01 from HEAD a4efd583.

## Items
- [ ] 1+2 ADR 0078 wording (P4-FX-correctness-1, P4-FX-words-scope-1)
- [ ] 3 result-view order (P4-FX-words-scope-2)
- [ ] 4 MOD-13 flake: out of lane, record only
- [ ] 5 merge commit trailer: needs amend, record only

## Checks
- 1+2 applied in worktree (uncommitted): ADR 0078:122 "8 px apart there, as each value keeps 8 px below it under 24rem"; :130 "390, 820 and 1280 px and where the cards' content is exactly 54rem (...), and without script, by"; tail of paragraph reflowed to 120 cols. Verified vs stacked-rows.tsx:55-59,:95 (gap-y-1 + pb-2 = 12 px under 24rem; gap-y-2 = 8 px from 24rem).
- 1+2 COMMITTED a006e609 (docs: ADR 0078 wording).
- 3 applied in worktree (uncommitted): result-view.tsx renders ScreeningReleaseWithdrawn before ScreeningConvertLink, doc comment reordered; new unit case in result-tables.test.tsx ("puts the withdrawn release's notice before the link ..."). No shot shows a withdrawn release (findings.json .shots, p4-shots-index.md), and the notice renders null otherwise, so every taken shot and e2e page is byte-identical: no re-shoot, no UX re-check, no e2e (no e2e renders a withdrawn result).
- 4 confirmed record-only: git diff bce57f16..HEAD -- packages/model-gateway packages/packets pnpm-lock.yaml is empty; redact.ts:102-111 years('0023') -> [23], iso(23,4,26) -> '0023-04-26'.
- 5 confirmed record-only: a4efd583's message ends with "# Conflicts:" + 2 paths after the trailers; amend forbidden.
- Checks running under lock (bg): typecheck, eslint on 2 changed files, lint:copy, vitest result-tables/result/stacked-rows/watched/tables tests. Logs /tmp/p4ff-*.log
- Checks (under /tmp/laneb-heavy.lock, 18:26:20-18:27:17 UTC): pnpm typecheck exit 0 (22 projects); eslint --max-warnings=0 on result-view.tsx + result-tables.test.tsx exit 0; pnpm lint:copy exit 0 (538 files); vitest unit result-tables, result (#42 pins), stacked-rows, tables guard, screening-capacity watched: 5 files, 76 tests passed. Imports unchanged so watched.ts --write not needed (watched.test.ts passes); no matrix rows changed so no synth; no e2e renders a withdrawn result, so no e2e build/run.
- 3 COMMITTED 621ef0d6.
- DONE. HEAD 621ef0d6; git status --porcelain empty: yes.
