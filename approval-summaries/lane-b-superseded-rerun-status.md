# Lane B: a superseded re-run cannot be accepted (audit #10; queue item 5): status

Open questions: none.

| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-25 23:40 | Started | Parallel Lane B session, started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh). The machine is set up (setup-container OK), and `gh api user` reads PureTideWater. |
| 2026-10-25 23:55 | Design | Worktree `/home/user/superseded-rerun`, branch `co-001/superseded-rerun`, cut from 6ddd587. None of #42's 143 files is touched (`apps/worker/src/price/rerun.ts`, `apps/web/src/lib/routes/pricing.ts` and the pricing-run pages are outside it). Design workflow running: an author, then one adversarial reviewer, then a revision. |

**Next step:** the design `designs/lane-b-superseded-rerun.md`, confirming no migration; then the builders.
