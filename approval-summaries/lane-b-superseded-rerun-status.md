# Lane B: a superseded re-run cannot be accepted (audit #10; queue item 5): status

Open questions: none.

| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-25 23:40 | Started | Parallel Lane B session, started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh). The machine is set up (setup-container OK), and `gh api user` reads PureTideWater. |
| 2026-10-25 23:55 | Design | Worktree `/home/user/superseded-rerun`, branch `co-001/superseded-rerun`, cut from 6ddd587. None of #42's 143 files is touched (`apps/worker/src/price/rerun.ts`, `apps/web/src/lib/routes/pricing.ts` and the pricing-run pages are outside it). Design workflow running: an author, then one adversarial reviewer, then a revision. |
| 2026-10-26 00:45 | Design done | `designs/lane-b-superseded-rerun.md` (wf_9cfe4f6c-448: an author, one adversarial review `designs/lane-b-superseded-rerun/review.md` with 1 blocking, 6 should-fix and 5 nits, all dispositioned in its §12). **No migration** (§5.1): every input and the lock already exist. The rule: acceptance under the practice's `pricing_current` lock at READ COMMITTED, refused as `superseded`, `newer_run_pending` or `changed_meanwhile`; only a run in effect is re-run (`not_in_effect`). ADR 0037 amended (0069 not used). Test-matrix PRC-25 to PRC-28 in this PR, with their synth matrix and registry entries (the orchestrator's correction, 2026-10-26 ~00:24 UTC). No fixtures. Visible changes on the run, compare and release pages, so the UX and brand review and screenshots apply. Q1 (a stuck `running` run blocks acceptance) is decided as recommended: keep the refusal, under the co-founder's ruling of 2026-10-26 ~00:20 UTC. |
| 2026-10-26 00:55 | Build | Build workflow wf_dfe5dba3-fd5: the worker builder, the documents builder and the BEFORE screenshots (base 6ddd587) run in parallel; then the web builder, then an integration check. |

**Proposal for Lane A:** the trigger mirror in `pricing_run_rules()` (design §5.2). Recommended, not urgent; it needs the founder's exception for a pricing table.

**Next step:** commit the build and open the draft PR.
