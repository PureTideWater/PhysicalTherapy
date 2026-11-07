# i126d skeptic RV-DB2-5
- started 2026-11-07; cloning
- clone r4-sk-db-RV-DB2-5 @ 9c68a4be (head moved past 9824f4e9). Wording "snapshot began before the locks were taken" present at migration :53-55, runbook :323-326, ADR 0084 D16 :198-200 (verified).
- wording came from DB-C1 fix (prior finding real=true, nit). finding's own outputs r4db2-work/{mig,page}.out show snap during hold -> m=0, reload 5.
- my probe (PG 18.4, db tp_i126d_sk5_1 dropped; sk5-work/probe.log): A RR snapshot via set_config 1.5s after locks taken, before commit -> e=5 m=0 (again 0), reload 5. B RR first stmt = read of m during hold -> 0. C RC during hold -> 5. D RR snapshot after commit -> 5. Finding's probe REPRODUCED.
- page path at head: scope.ts oneSnapshot -> BEGIN ISOLATION LEVEL REPEATABLE READ; first stmt SET_ACTOR (SELECT set_config, scope.ts:210) takes the snapshot, touches no ledger table, so a page starting during the hold takes its snapshot unblocked, then waits on its ledger read and reads ledger_match empty. Migration :124 still ADD COLUMN seq IDENTITY (rewrite).
- text new in this PR (absent at merge-base 8a722f80); added by 7dcca319 (DB-C1 fix), whose subject says "while the locks are held" yet text says "before the locks were taken".
- no repo test cited (psql probe only), so pnpm install skipped.
VERDICT: real=true (nit, doc wording). Clone removed; tp_i126d_sk5_1 dropped.
