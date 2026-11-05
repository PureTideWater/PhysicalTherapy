# PR #126 reliability review (c49367c5)
Started 2026-11-05 06:00Z. Clone: scratchpad/revint-rel (install --frozen-lockfile: ok)
Large tests DONE: reconcile.large + chain.large: 2 files, 2 tests passed, 185.44 s; CAS-42.3 2000 lines pass 45.1 s, peak advisory locks 1 over 1709 samples

## Checked so far
- migration 20261110090000 read in full (preflight, CHECKs, seq, ledger_match_rules, within_interest trigger)
- interest-chains.ts, remittances.ts diff, ledger.ts diff, interest.ts (attributeInterest, interestWrites, interestHeld)
- pass.ts: lockLedger first in the pass transaction; trigger re-takes the same 'ledger:' key
- loader link UPDATEs all guarded by IS NULL (D17 claim holds: links set once)
- worker attemptErrorCode: LedgerError name -> LEDGER_ERROR; pg error code+severity -> DB_<SQLSTATE>
- entryProblems not used outside packages/ledger (old image safe on negative interest)
- reconcile.large has no interest at all; capacity step 7b (F) has no PLB L6 -> interest path unmeasured at size

## Findings so far
(none confirmed yet)

## Update 06:30Z
- Checked: D17 torn-read logic (statement 1 + ATTRIBUTION_CLAIMS restricted to S; loader links are IS NULL guarded so post-moment links have one end outside S) -> holds
- Checked: worker never writes what PG refuses on the paths read (paid claim = standing claim match's; take-back claim = standing interest match's; per-sign cap gross like PG; line floor cut by lineHeld)
- Checked: manual.ts begin() takes lockLedger first (reverse/adjust serialized with the reconcile); all ledger_entry writers are in reconcile/ under the lock
- Checked: insertMatch null paths (reached set keyed per L6 and line prevents a second part on a line)
- Checked: ledger_match_rules body diff vs 20261023120000: exactly the three stated changes
- Checked: migrate.ts sets no lock_timeout (pre-existing; header discloses the wait)
- Candidate F1 (should-fix): recordInterest scans lines x matches per draw (remittances.ts ~983-990), every reconcile, for every historical L6 draw incl. draws to chains on no case line; bench (scratchpad/revint-rel-probes/bench.mjs): 109 ms/draw at 2,000 lines x 10,000 matches; 3.58 s/draw at 10,000 x 50,000. No size test runs the interest pass (reconcile.large and capacity 7b carry no PLB L6; chain.large is EXPLAIN only).

## Update 06:25Z
- Probe running: scratchpad/revint-rel/apps/worker/src/reconcile/interest-probe.large.db.test.ts (copy of reconcile.large; PROBE_INTEREST=1 adds AMT*I*0.50 to each correction and one unnamed PLB L6 per check = its AMT I; times approving reconcile, measured pass, second pass). Log: scratchpad/revint-rel-probe-pr.log. Base clone for comparison: scratchpad/revint-rel-base (f7d609cc, probe copied, not yet installed).
- Also noted: interestAttribution re-reads every claim of every historical remittance holding an L6, and does per-remittance and per-L6 rows.filter (interest-chains.ts:164-183) -> O(history^2) in memory each reconcile
- Nit candidate: migration lock order ledger_match (76-93) then ledger_entry (99-108) is opposite to the pass's (remittances.ts:1085 entries, 1087 matches) -> deploy-window deadlock (one side aborted 40P01), contrary to header 44-47 "waits, then proceeds"
- Checked within_evidence/within_line locks: same ledger: key; adjusted-of-negative interest allowed by within_line's least/greatest

## Probe result, PR head c49367c5 (06:17-06:28Z): CAS-42.3 shape + AMT I 0.50 on each of 2,000 corrections + 100 unnamed PLB L6 (one per 20-claim check)
- approving reconcile 237.8 s; measured pass 161.2 s (reconcile.large without interest: 45.1 s) -> over PASS_BUDGET_MS 150 s; second pass (nothing new) 192.9 s
- interest entries 2000, sum 100000 cents (= L6 cash: credited once, correct); matches 6000; peak advisory locks 1 over 1653 samples
- next: same probe on base f7d609cc (scratchpad/revint-rel-base) for comparison

## Probe result, base f7d609cc (06:28-06:34Z), same probe file and shape
- approving reconcile 160.9 s; measured pass 87.3 s (within 150 s); second pass 62.8 s; interest entries 2000, 100000 cents; matches 6000; peak advisory locks 1 over 1659
- => PR vs base: approving 237.8 vs 160.9 s; measured pass 161.2 vs 87.3 s (PR over CAS-42.3 budget); steady-state second pass 192.9 vs 62.8 s
- F1 confirmed (should-fix): per-draw lines x matches scan at remittances.ts:993-994 (+ no early exit for an L6 with nothing left); SUITE-CAP-3 design 14.4 item 5 names the loop as a follow-up; PR/ADR do not record it
- queued: control probe on PR head without interest (scratchpad/revint-rel-probe-control.log), then deadlock probe (scratchpad/revint-rel-probes/deadlock.sh, db tp_intpr_rel_1, dropped at end)

## Control (PR head, PROBE_INTEREST=0): approving 108.9 s; pass 48.5 s; second pass 17.9 s; matches 4000
## Deadlock probe (scratchpad/revint-rel-deadlock.log): DB at 20261109090000 via base clone; A reads ledger_entry, B applies 20261110090000 as tp_owner, A then reads ledger_match -> A "deadlock detected" (40P01), B commits. Nit F2 confirmed. tp_intpr_rel_1 dropped.
## interest.db.test.ts on PR head: 1 file, 23 tests passed, 19.55 s
## Remaining: write structured result. All my databases dropped (only tp_loader_dm_1, not mine, remains).

## CI on c49367c5 (gh api): 27 success, 1 skipped, 2 failure: e2e (1/2) [job 127069715493] and all green
- e2e (1/2): 40 passed, 2 flaky (failOnFlakyTests on CI): ledger-patient-share LED-14 (6.0m, 360 s timeout) and LED-15 (5.0m, 300 s timeout), both at helpers.ts:50 signInWithTotp, started 05:36:20/05:36:27 right after ledger-interest.spec's two tests (05:36:00-05:36:27) signed in the same persona 'ledger-manager'; passed on retry
- cause: verifyTotp accepts a step only > totpLastStep (totp.ts:49; dev-store.ts:26-27); helper falls back once to the next step (helpers.ts:54-60) then awaits forever -> third same-persona sign-in in a window hangs. Base f7d609cc e2e (1/2) [job 127061684754]: 41 passed, patient-share's two sign-ins alone.
- F0 (blocking): the new spec's persona reuse turns the required check red.
## Final findings: F0 blocking (e2e persona), F1 should-fix (interest pass at size), F2 nit (migration lock order). Writing structured result.
