# i126d fix round 2

Started 2026-11-07. round2-confirmed.json written and read back (7 findings: R2M2-1, R2M2-2, RV-DB2-1, RV-DB2-2, RV-DB2-5, RV-DB2-6, RV-DB2-7).

Start HEAD 9c68a4be (= origin/co-001/ledger-interest-once, = wip), clean; base origin/claude/build-platform 8a722f80 (= merge-base). Scripts/logs: scratchpad/i126d-fix-r2/.

## Plan (R2M2-1 + RV-DB2-1 one fix; R2M2-2 + RV-DB2-2 tests of (b))
- Skeptic showed all-or-nothing fails (100 vs 600) and dropping the wait overshoots (600 vs 360). Chosen fix:
  1. a take-back's payments-wait counts as whole when its shortfall is covered by interest other PLB L6s still owe
     the chain's payments that can reach no line, less other L6s' take-backs of it still owed (pure interestUnplaced;
     ChainInterestLines.unplacedCents). Partial writes kept (short pool needs them for order independence).
  2. a line kept off a payment (interestOutOfReach) counts like a reached line: it is among the draw's lines when the
     approved ones are chosen and takes nothing (PaidInterestLine.outOfReach), so a payment is never diverted to an
     unapproved line the in-order payment would not reach (RV-DB2-1's twin).
- Traced by hand: R2M2-1 (Z,Y,X / Z,X,Y / Z,X+Y) -> 600 each; twin -> 600 each; short pool both orders 0 (<=360);
  claims-first (RV-DB2-2) both orders 0; existing LED-24 variants unchanged.
## R2M2-1/RV-DB2-1 unit tests (red at head)
- interest.test.ts: new F1-block case (R2M2-1, unplacedCents), split-then-drop case (RV-DB2-1, outOfReach flag), MONEY-R4-1 case rewritten (L3 takes its share 84; 4.56 unplaced), interestUnplaced describe (3 cases), first property gains outOfReach/unplaced, new three-order property (Z,Y,X / Z,X,Y / Z,X+Y; recouped or not), MONEY-R4-1 property mirrors the worker (flags + unplaced).
- RED: 9 failed / 67 passed (logs/red-unit-kept.log): behavioural (e.g. [] vs b L3 600; c L1 440 written on a kept-off line).
- Design note: a payment's split now includes kept-off lines and drops their shares (split-then-drop), so X reaches the same lines in every order.
- IMPL interest.ts: PaidInterestLine.outOfReach, ChainInterestLines.unplacedCents, paidLinesOf (approved pref incl. kept-off lines), split-then-drop (left -= written shares only), waiting uses amount+unplaced<due, new pure interestUnplaced (+InterestOfL6, exported in index.ts). remittances.ts: InterestState.paysOf, paidLinesOf (flags), unplacedOf (only for take-backs of mayYetHold chains). rules.test.ts literals.
- GREEN unit: interest+rules 97/97 (logs/green-unit1.log); properties at 15000 runs green (logs/green-unit-15k.log).
- Synth LED-24: 9 new files (partly-paid, rest-paid, netted-elsewhere, short-paid, reported-only, later-paid, one-line-paid/-rest-paid/-netted), 8 variants + outcomes; regenerated with pnpm synth --case LED-24 (all oracle-valid).
- DB tests (interest.db.test.ts): R2M2-1 x3 orders, R2M2-2 x2, RV-DB2-2 x2, RV-DB2-1 x3.
  - RED at head impl (fixtures+tests only): 3 failed (R2M2-1 between/together: L3 [] vs 600; twin between: L2 440/-440 vs 600) (logs/red-db-kept.log).
  - (b) dropped at head: R2M2-2 x2 + RV-DB2-2 out-of-order fail (logs/red-db-mutb-head.log).
  - GREEN with fix: interest.db 42/42 (logs/green-db1.log + twin together). (b) dropped on the fix: 4 fail (logs/mutb-fix.log).
- Docs: ADR 0084 status/D5/"wait for good" (R2M2-1 etc.), interestWrites docstring with the limit (same weights or no line), LED-24 row (test-matrix.md + matrix.ts), led24 docstring; LED-24 regenerated.
## RV-DB2-5/6/7
- RED migrate.test.ts: 4 failed / 22 passed (logs/red-migrate-kept.log): 55P03 extraction, LOCK without TABLE, header/runbook/ADR wording, runbook reconcile-running advice.
- Fix: regexes widened; runbook section (snapshot before commit; one reconcile running 603.0 s CAS-42.5 > 5 min; "no reconcile queued or running", 05:10 UTC schedule); ADR D16; migration header via marker route (shell-created, trap-removed; marker absent after) -> migration sha256 561e3001...
- GREEN migrate.test.ts 26/26 (logs/green-migrate.log). Domain model regenerated (tp_i126d_fixr2_dm, dropped): check 0, strict 0, require-approval 1 (approval line blank; text SHA bb7662c6...). To regenerate again after committing for clean provenance.
- eslint on touched files rc=0.
## Commits (not pushed)
- 1fadbc11 interest fix (R2M2-1, RV-DB2-1, R2M2-2, RV-DB2-2); 576fb237 RV-DB2-7; f4bd94d3 RV-DB2-5/6 (marker route; header); then domain model regenerated (clean provenance f4bd94d3; check 0, strict 0, approval 1 blank).
- NEXT: touched db tests (interest, ledger-oracle, chain, ledger, payment-terms, ledger-interest, reconciliation-routes), unit ledger/synth/worker, fast checks, stryker money-ledger + gate, base merge, full suite, push.
- e: interestUnplaced one-pass given map (perf; Stryker restarted after it). unit-touched 541/541, db-touched 7 files 164/164 before it; ledger unit 312/312 after.
- Stryker restarted at 47eb9f51 (task bq11h1amm); full-suite script ready (i126d-fix-r2/suite.sh, e2e port 4984). Base unchanged 8a722f80: no merge needed.
- Stryker run1 at 47eb9f51: gate 0, interest.ts 99.51% (2 survived, unexplained) -> fixed in next commit; Stryker rerun.
- Stryker run2 at bdb218f1: canary 0, verdict 0, shard 0, gate 0; interest.ts 100.00% (411/411). Full suite started (suite-summary.log).
- Full suite #1 at bdb218f1 all EXIT 0 (logs/suite1/). Base then moved to ce95546d (#132); merged once (98bb9c00, no conflicts). Full suite #2 on the final tree running.
- Full suite #2 at 98bb9c00 (final tree): typecheck, lint, fast, unit, golden, oracle, dm, db1-4, build, e2e (86 passed) all EXIT 0.
- PUSHED (hook: 7 commits checked, gitleaks no secret): co-001/ledger-interest-once 9c68a4be..98bb9c00; co-001/wip-interest-fix 9c68a4be..98bb9c00 (fast-forward). DONE except report.
- Open: PR body (line 226 and the round-2 summary, domain-model summary with new text SHA bb7662c6...) and the approval-line suggestion comment for the new hash are the orchestrator's; founder approval of the regenerated domain model pending.
