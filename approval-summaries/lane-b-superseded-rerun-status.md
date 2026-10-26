# Lane B: a superseded re-run cannot be accepted (audit #10; queue item 5): status

Open questions: none.

| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-25 23:40 | Started | Parallel Lane B session, started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh). The machine is set up (setup-container OK), and `gh api user` reads PureTideWater. |
| 2026-10-25 23:55 | Design | Worktree `/home/user/superseded-rerun`, branch `co-001/superseded-rerun`, cut from 6ddd587. None of #42's 143 files is touched (`apps/worker/src/price/rerun.ts`, `apps/web/src/lib/routes/pricing.ts` and the pricing-run pages are outside it). Design workflow running: an author, then one adversarial reviewer, then a revision. |
| 2026-10-26 00:45 | Design done | `designs/lane-b-superseded-rerun.md` (wf_9cfe4f6c-448: an author, one adversarial review `designs/lane-b-superseded-rerun/review.md` with 1 blocking, 6 should-fix and 5 nits, all dispositioned in its §12). **No migration** (§5.1): every input and the lock already exist. The rule: acceptance under the practice's `pricing_current` lock at READ COMMITTED, refused as `superseded`, `newer_run_pending` or `changed_meanwhile`; only a run in effect is re-run (`not_in_effect`). ADR 0037 amended (0069 not used). Test-matrix PRC-25 to PRC-28 in this PR, with their synth matrix and registry entries (the orchestrator's correction, 2026-10-26 ~00:24 UTC). No fixtures. Visible changes on the run, compare and release pages, so the UX and brand review and screenshots apply. Q1 (a stuck `running` run blocks acceptance) is decided as recommended: keep the refusal, under the co-founder's ruling of 2026-10-26 ~00:20 UTC. |
| 2026-10-26 00:55 | Build | Build workflow wf_dfe5dba3-fd5: the worker builder, the documents builder and the BEFORE screenshots (base 6ddd587) run in parallel; then the web builder, then an integration check. |
| 2026-10-26 02:35 | Build done | wf_dfe5dba3-fd5. 25 files, +2,947/-114, committed as 961783a. Checks run in the build: typecheck (22 projects), lint (1,489 files), lint:copy, lint:logs, synth 158/158, unit for apps/worker and apps/web 1,271/1,271, the changed DB files with the catalog and cross-tenant tests 1,185/1,185, a 142/142 DB regression, e2e `pricing.spec.ts` 1/1, and the engine freeze diff empty. 40 BEFORE screenshots on 6ddd587; they show the bug, a stale tab accepting a superseded re-run. |
| 2026-10-26 02:40 | Draft PR | **#50** (https://github.com/PureTideWater/PhysicalTherapy/pull/50), head 961783a. The description comes from the template, was written with update_pull_request and read back identical. Subscribed. |
| 2026-10-26 02:45 | Reviews | wf_724a71c1-069: the payment-engine and security reviews in parallel, the AFTER screenshots on 961783a, then the UX and brand review of the before/after pairs. |
| 2026-10-26 03:20 | Reviews done | wf_724a71c1-069 (`approval-summaries/lane-b-superseded-rerun-review-findings.md`):
- **Payment-engine:** F1 to F4 should-fix, F5 and F6 nits. F1: `completed_at` is stamped before the execution lock. F2: the place-of-service split and the triage date are fixed at creation, but not in "newer". F3: two SQL clauses are not killed by any test. F4: under overlapping periods, the diff is not the change accepting makes.
- **Security:** F1 should-fix, acceptance is not bound to the diff reviewed. No tenant-isolation or PHI finding; lint:logs passes.
- **UX and brand:** UX-1 to UX-7 should-fix, UX-8 and UX-9 nits.
- **Screenshots:** 42 AFTER shots on 961783a, 40 paired with the before shots and 2 of the refusal moment.
- **CI on 961783a:** green so far, the rest still running. |
| 2026-10-26 03:25 | Fix round | wf_11fa7137-42b: a worker fixer, then a web fixer, then the full local suite (one commit, then one push). Dispositions are recorded in the fix round's summary. |
| 2026-10-26 03:52 | Fix round resumed | The account's 5-hour session limit stopped wf_11fa7137-42b, and the #32 design wf_98ca48d8-64c, at about 03:15 UTC, before any change was made. Resumed at 03:52 after the 03:40 reset. **CI on 961783a: all green**, every required check passing (all green, mutation, screening-capacity gate, approval-of-record). The #32 design resumes after #50 (the orchestrator's priority). |
| 2026-10-26 ~06:10 | Fix round done | 81b7b0c: every finding fixed (`approval-summaries/lane-b-superseded-rerun-fix-round.md`; the triage date in F2 is not taken, with evidence). Full local suite: typecheck 22; lint 1,490 files; unit 5,029 passed, 3 skipped; golden 188; oracle 637 fixtures; db 9,087 passed, 1 skipped, 118 files in 6 shards; e2e 51 passed (E2E_PREBUILT on the stamped commit); engine freeze clean; no mutation shard affected. |
| 2026-10-26 ~06:20 | Base merged | a3c583d: claude/build-platform 4d99df8 (#46 db-function diffs, #47 bank account first) merged in with a merge commit; clean, the shared documents keeping both lanes' rows; no lockfile change. Typecheck, synth 158/158 and check:fixtures pass. Pushed; CI running. |

**Proposal for Lane A:** the trigger mirror in `pricing_run_rules()` (design §5.2). Recommended, not urgent; it needs the founder's exception for a pricing table.

**Proposals outside this PR (from the build):**
- **A new Lane B item:** two first runs of the same period can be priced out of creation order. `price.db.test.ts` "serial" runs two at once. The one with the older cut-off then takes effect last, and the lines loaded in between drop out of the pricing in effect. Fix: execution waits for, or refuses while, an earlier-created first run of the same period is open; or it fails the older-cut-off run as superseded.
- **Lane A** (above): the trigger mirror.
- **Lane B later:** an operator console count of runs stuck queued or running, with an audited action to fail one; a read-only detection of lines with no pricing in effect; `runAction`'s generic "Check the fields marked below." when every issue names a hidden field.

**Next step:** the fresh-clone verification reads CI on a3c583d, with an adversarial re-review of the fix-round delta; then ready and merge.
