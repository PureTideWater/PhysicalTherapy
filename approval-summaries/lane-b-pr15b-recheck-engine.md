# Recheck engine fixes (B1,S1,S2,S3) on PR 15b
Branch head at start: 35137603 (UX commit on top of 83ed5743)
Status: started; reading diff, probes
- worktree created at scratchpad/pr15b-review/recheck-wt (detached 35137603); probes copied into apps/worker/src/reconcile; output -> progress/recheck-probe-out.txt
## Probe rerun on 35137603 (all 10 probes run; F1 needed a bigint replacer in the probe's own log line, harness only)
- E8 (B1): approved 2400, billable 600 (coins), otherReduction 0, allocatedFromClaim true; after 24.00 EFT deposited 2400, payerApproved 2400. FIXED as engine.md expected.
- F1 (S1): pass approved +2400 then decreased -1000; chain view approved 2400, taken_back -1000 (agrees). Q resend 100/80 -> approved 1000 (coherent: A is chain-latest at 87.5). FIXED.
- E1 reissue approves 1800; M4P 2400/-1000/+1000 (approves 1000). E2 -1000, E3 1379+1021, E4 300 to L2, E6 -2400 no shortfall, E7 no_change: unchanged from review.
## Adversarial probes (added E9, E10, E11 to probe-engine.db.test.ts in the recheck worktree only)
- E9 (mixed: case line carries CO, second line bare at charge, claim-level PR 14 -> 20): approved 2400 (= BPR 24.00, fine), but display billable 300 AND otherReductionCents 300: cash takes D over CAS lines only, share display splits PR over all lines. ADR "never as other reductions" fails for mixed claims. Low severity (display).
- E10 (3 CAS lines equal charge, claim PR-1 1+PR-2 1 -> 2+2, only line1 raised 70->100): approved 2933 on line1; lines 2,3 no_change with cash -66 each; correction BPR 28.00 < approved 29.33. Display other reductions 1 cent (per-reason vs total rounding).
- NEXT: E11 realistic 20% coinsurance at claim level on a 3-line claim + EFT, to see approved vs deposited.
- E11 RESULT (FINDING R1, blocking): 3 lines charge 150, allowed 70 each, claim-level PR-2 42 -> correction raises line1 to 100, claim PR-2 48 (20% exactly). BPR 24.00. Ledger approved 2800 on line1 (lines 2,3 no_change, cash -200 each, no entry). After 24.00 EFT: deposited 2400, payerApproved 2800 -> 4.00 approved never provable. B1 symptom persists on multi-line claims: D split by CHARGE, not by what the PR is a share of. Weighting by pre-claim-level allowed (SVC02 - line non-PR CAS = SVC03 + line PR) gives exact 24/0/0.
- mutant rerun script: progress/recheck-mutants/run.sh (running)
- S3 diff read: one casePatientBalance in patient-share.ts, public.ts export, queries.ts re-export, content.ts calls it; logic identical to both former copies. OK.
- Invariants re-checked vs 6ddd587 at 35137603: ledger.db.test.ts, pricing, migrations, domain-model, golden, releases, LED-01..13 all empty diff; packages/ledger/src only index/payment/payment.test; oracle 0 removed lines, fix round didn't touch it.
- Own property (200k random claims incl. reversals, zero charges, mixed CAS): claimLinePayments sums to CLP04, equals allocateProRata over takers, fraction kept, each part within a cent, non-takers unchanged. 0 bad.
