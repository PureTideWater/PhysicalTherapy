# Lane B: release-content-checks (#7, #30, #31, #59; LANES queue item 14): status

Session: a parallel Lane B session started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh) on the co-founder's direction of 2026-10-25 ~23:40 UTC. Branch `co-001/release-content-checks`, worktree `/home/user/release-content-checks`. Reserved: ADR 0071; test-matrix RCC-01 to RCC-08; `packages/synth` cases RCC-01 to RCC-08 (MODULE_NUMBER RCC = 14); fixture release 900007; scale release 900110 (generated outside the repository).

## Open questions
None. Q1 and Q2 (below) were taken as recommended under the co-founder's ruling of 2026-10-26 ~00:20 UTC ("Don't ask for approvals anymore just build and optimize").

## PR
#49, draft, into `claude/build-platform`. Pushed head ac162d6c (CI all green on it). The fix round's commits (b20b85ef .. abd4d0bb and the suite's) are local until its one push.

## Next step
The fix round's full local suite (running, wf_695df8eb-4c5) → merge the latest `claude/build-platform` (#54, 7ef421b, merged at 08:56) and re-check what it touched → one push → CI green → the fresh-clone verification → mark ready → merge with `expectedHeadSha` → unsubscribe, clean the machine, send the orchestrator the merge commit.

## Stage (times UTC, from date -u)
- 2026-10-26 ~00:10: machine set up (`tools/setup-container.sh` OK; `gh api user` = PureTideWater). Base 6ddd587.
- ~00:20: read LANES.md, lane-b.md, CLAUDE.md, reconciliation-001's checks, audit #7, #8, #30, #31, #59. The orchestrator relayed the co-founder's ruling "Don't ask for approvals anymore just build and optimize" (recommended option for every choice, the safer one for security; founder-kept matters unchanged) and the correction that the four shared documents #42 changes follow rule 6.
- ~00:20-01:40: **design** (wf_9a4b4106-ef9: five scouts, an author, one adversarial reviewer, a revision): `designs/lane-b-release-content-checks.md`. Review: 1 blocker, 7 major, 8 minor, 1 nit, all fixed (Appendix A). **No migration** (the reviewer agreed). Q1 (content-due issues on the public repository, which hold only public data) and Q2 (two scheduled workflows, free while public, ~1,000 min/month once private): taken as recommended (accept); reasons in the design's 10.1 and ADR 0071.
- ~01:45-05:25: **builders** (wf_8156f505-4a0: ten work packages and an integration check). Draft PR #49 opened ~01:55 at 38088c68 (description from the template via update_pull_request, read back; subscribed). The session limit stopped WP4-WP10 at ~02:40; resumed ~03:55 after the reset, with 42b14150 (packages/rules/src/index.ts is not a #42 file; the helpers are re-exported from `@tp/rules`). Integration on 45fe117f: typecheck, lint, lint:logs, lint:copy, verify-content (drafts, 900001-900007), check:fixtures, synth unchanged, watched-paths unchanged, engine freeze clean, `pnpm test` 5,224 passed 1 skipped, golden 188/188, actionlint, 27 db files 204/204, `affected.ts` passing (9ca39962 accounts for the new content-directory reads that turned CI red on 38088c68). 141 files, +12,185 -283. Pushed 45fe117f.
- ~05:35: the PR was `dirty` (#46, #47 merged on the base) so CI had not run. Merged the base in a side worktree (ac162d6c; only the shared lists conflicted, both kept: DBF 13, RCC 14, BIL 15); local checks clean; pushed. **CI on ac162d6c: all green** (db 1-4, e2e 1-2, mutation with all six shards, domain model, approval-of-record, screening-capacity).
- ~05:30-06:10: **two adversarial reviews** (wf_9ab8bb48-29a; integrity: pipeline, money paths, surfaces; security: application, jobs/logs/content publisher), a skeptic per finding: `lane-b-release-content-checks-review-summary.md` and `-review-findings.json`. 0 blockers; 3 major (INT-PIPE-1 an unchanged quarterly file cannot be kept for two quarters; SEC-APP-1 a failure text promised an alert nothing sent; SB-1 the source watch failed open on unplain file names); 17 minor; 7 nits; S7 refuted (kept as a nit).
- ~06:15-10:05: **fix round** (wf_695df8eb-4c5): every finding, nits and improvements, in three groups (pipeline 12e2671a; money and app b20b85ef, 22785126, 3dfc5376, fb9ffd79, e673fc19; calendar, workflows and docs 25a88196 .. abd4d0bb). Stopped by the session limit at ~06:35, resumed ~09:00. Full local suite running since ~10:05.

## Later PR, for after #42 merges (not started; Lane B hands it to Lane A with the lane)
Design 7.2 is its contract. It holds:
- the heap flags wired into the task commands: `infra/lib/constructs/compute.ts` and `infra/test/compute.test.ts` (worker, platform and web take this PR's `infra/lib/heap.ts`);
- the content alarms: `CONTENT_NOT_LOADED` and `WAITING_ON_CONTENT` metric filters and alarms in `infra/lib/constructs/monitoring.ts` and `infra/test/monitoring.test.ts`; then content-gap lines leave the `PRICING_ENGINE_ERROR` page (`apps/worker/src/price/execute.ts`);
- the daily `content_due` platform job: `apps/worker/src/jobs/platform.ts`, `platform.test.ts`, `apps/worker/src/worker.test.ts`, its stage alarms in `monitoring.ts` with a new `infra/lib/content.ts`, its log fields in `packages/observability/src/fields.ts` if any are new. It needs Lane A's migration `operator_content_coverage()` first (in LANES.md "Handed to Lane A");
- `tools/screening-capacity/watched-paths.txt` regenerated (`platform.ts` will import `@tp/rules/calendar`), and screening-capacity moved to the quarterly scale release 900110 (`run.ts`);
- the digest line for months waiting on Medicare content (`apps/worker/src/digest/job.ts`) and the Pricing settings list of them (`apps/web/src/lib/routes/settings.ts`);
- new test-matrix rows, numbers to reserve then.

## Proposals outside this item
- Lane A, with #8: stored release counts for the release listings (`apps/web/src/lib/releases/queries.ts:40`, `:99-107`), and stored per-content windows; the impact dry run applying #7's content test.
- Later: a `--quarter 2026Q4` import flag; a way to close an MPPR list's window mid-year without re-verifying unchanged records.
