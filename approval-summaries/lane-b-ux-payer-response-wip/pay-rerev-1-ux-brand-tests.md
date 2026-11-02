# Re-review round 1 (UX, brand, tests) of fix commit 2865db68
Started 2026-11-01 ~19:20 UTC. Worktree clean at 2865db68.
## Checked
## Findings
- Read findings JSON, critic nits, full fix diff 90ec40ab..2865db68 (code + tests).
- S2-N1: hint covers all 4 PERSON_RESPONSE_KINDS vs case_rules; quoted (U2-r2-5); e2e + db test (denied no reopen -> resolved). OK.
- S2-N2: Received on empty+required, hint, route refusal (empty/blank/missing/malformed), next window from date: db test + e2e. OK.
- ux85-1: suspendedGate keys match organization_run_refusal.sql exactly; billing/contracts/recon db tests + harness. OK.
- ux85-2: p-4 sm:p-8 present; pre-fix 390 shot shows "lette" cut by ~1 word; +32px should fit. No test pins it (visual only; screens85-after predate fix commit).
- U2-r2-1: closed-card text present but NO test asserts it (data-can-upload-here never read by any test). candidate finding.
- U2-r2-7: progress classes use tokens; no test (visual).
- S2-N3, n6: four groups via uploaded_by = app_actor_id(); db test both viewers + 50-limit; harness groups. OK.
- U2-r2-2/3/6, n1, n4, n3, ux85-5, ux85-7, n7: present and (except ux85-5/7 words) tested. OK.
- Received on kept on refusal: ActionForm submits via onSubmit, no React reset. OK. receivedOn regex same as old isoDate. OK.
## Findings
1. should-fix (tests): U2-r2-1 card text (both branches) asserted by no test; data-can-upload-here never read; CAS-47 row claims it.
2. polish: closed-upload card text says "Choose the payer's letter already on file" even when none is on file (hint says none is) - contradicts; no response can be recorded.
3. polish: duplicate-not-chosen says "the copy on file is in the list" without saying which option; batch row names it by shortId+date, options by time+SHA, so same-day letters can't be matched.
4. polish (tests): ux85-2 (390 px select) and U2-r2-7 (progress tokens) have no assertion; a revert passes.
DONE.
