# intpr-rev-ledger (ledger and money reviewer, PR #126, c49367c5)
Started 2026-11-05. Clone: scratchpad/revint-led.
## Checked
## Findings so far
- Clone at c49367c5 ok; pnpm install --frozen-lockfile exit 0. Outputs in scratchpad/revint-led-out/.
- Read design in full, migration (matches design 5.3 minus object 5, which 1b made), interest.ts, interest-chains.ts, remittances.ts diff, ledger.ts, web diffs.
- Running (bg): unit packages/ledger, Stryker money-ledger shard (ledger+money), gate. -> revint-led-out/unit-summary.txt
- UNIT: vitest --project unit packages/ledger/src: 15 files, 294 passed (28 s).
- STRYKER money-ledger shard, ledger config (--concurrency 2): rc 0, 318 s; ledger All files 98.69% (2320 killed, 11 timeout, 31 survived, 0 no-cov); interest.ts 100% (308 killed, 0 survived); stages.ts 98.91% (2 survivors at :77, :89, lines this PR does not touch). Money run + gate queued.
- Probe written (scratch clone only): apps/worker/src/reconcile/zz-probe-ledrev.db.test.ts (P1: L6 naming the chain's original CLP07 instead of the correction's). Run after the db suite.
- Candidate findings under check: (P1) named draw's claimIds = only the named claims -> an L6 naming the original/reversal CLP07 credits nothing (D5 wording); (P2) one L6 with draws for two chains on one line: `reached` blocks the second (order = claim UUID order).
- DB: vitest --project db --maxWorkers=2 apps/worker/src/reconcile/ (12 files incl. chain.large, reconcile.large, interest, oracle) + reconciliation-routes.db.test.ts + report/streamed.db.test.ts: 14 files, 202 passed, rc 0, 630 s.
- P2 pure probe (packages/ledger/src/zz-probe-ledrev.test.ts, scratch only): CONFIRMED. One L6 with draws B +600 (paid, line1) and A -540 (take-back, line1): interestWrites writes only the first draw's part to line1; attributeInterest orders the paid chain first (it drew from the L6 in drawFrom) in both claim orders -> take-back blocked, line keeps 540 + 600.
- STRYKER money (shard money-ledger, money config): rc 0, 882 s, 96.58%; gate.ts reports/mutation --shard money-ledger: rc 0 (interest.ts 308/308).
- P1 db probe (zz-probe-ledrev.db.test.ts, scratch only; flock; 5 tests: 3 passed, 2 failed as predicted): LED-23 paired.835 with the L6 reference edited from the correction's CLP07 (...0002) to the chain original's (...0001, which the reversal also carries): 0 interest (controls: as generated 540; no reference 540). Same for reported-only.835 then later-l6.835 naming ...0001: 0 (control 540). CONFIRMED finding.
- Probes copied to scratchpad/revint-led-out/ and removed from the clone (git status clean). No tp_intpr_*/tp_test_* databases left on 5433.
## Findings (final)
- LED-R1 should-fix: named paid draw reaches only lines matched to the literally named claims (interest.ts:250/254/289, interest-chains.ts:182, remittances.ts:994, interest.ts:359): an L6 naming the chain's original/reversal CLP07 credits 0 (probe P1, P1b; base credited 540 via AMT I). Contradicts PRD 13 granted text "against the case lines of the claims it is for (the claims the PLB L6 names...)".
- LED-R2 nit: one L6 netting a paid chain and a taken-back chain on one line writes only the first (shared `reached`, interest.ts:342/361/366/382; paid chain ordered first by drawFrom): take-back dropped for good, interest overstated (probe P2).
- LED-R3 nit: ADR 0084 D5 (:116) lacks the line-whole take-back cap the code applies (remittances.ts:985-989, :1004); status record lists it as open for this PR.
## Checked sound
- migration = design 5.3 minus object 5 (1b's index; preflight checks it); skip after actor checks; per-sign bound uses per-claim sums (looser than worker's per-chain nets); floor counts same set as interestHeld; D17 moment (S, walk within S); D6 caps gross; idempotency (replayed tests); seq readers (ledgerMatches, CHAIN_ORDER, web lists) and insertion order = old tie-breaks; previous image: one-record matches skipped, its everMatched/recordInterest return on null; totals/ROI signed sums; roi_statement rules signed; recovered untouched; 10.1 scope (extra files are tests/records/generated only).
DONE
