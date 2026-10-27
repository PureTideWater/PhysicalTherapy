# design-interest-review progress
Started 2026-10-27. Reviewing /home/user/ops/designs/ledger-interest-once.md (87007 bytes, mtime 15:44).
## Leads opened
## Leads closed (sound)
## Findings
- Read design fully (1068 lines) at 16:15.
- Clone at scratchpad/designs/interest-review (base e908c21). #42 head moved 098636e3 -> d14f0ac5 (49 commits over base); since 098636e3 changed mail_streams.sql, test-matrix.md, schema/operations.ts, watched-paths.txt; no ledger function touched (ledger_match_rules unchanged on #42).
## Leads (open)
- L1 named L6 'left' keyed per (L6,claim) vs per L6: lines approved by different claims w/ same CLP07 hash, or pooled->named switch after out-of-order load -> double credit or Postgres refusal => reconcile stuck
- L2 take-back requires standing approved claim match to X (ledger_match_rules); person-reversed claim match or superseded -> take-back skipped/refused
- L3 adjustment of negative interest entry vs frozen ledger_entry_within_line
- L4 deploy window: pg-boss retry exhaustion; whole-practice reconcile blocked on rollback
- L5 seq numbering of existing rows = heap order not insertion order (after UPDATE reversals)
- L6 ledger_entry_rules with both IDs; entryProblems location (rules.ts vs stages.ts) vs exception file list
- L7 N1 for negative parts
- L8 founder rulings / LANES / 15b status
- L3 CLOSED sound: ledger_entry_within_line adjusted branch uses least(0,bound)/greatest(0,bound), so a take-back (negative) entry can be adjusted toward 0; reversal of take-back positive -> no floor.
- L6 CLOSED sound: entryProblems/STAGE_SIGN in stages.ts (listed); not used outside packages/ledger.
- L4 note: daily schedule reconcile:<practice>:<day> exists (job.ts) so a deploy-window failure is picked up next day; BUT on rollback old code re-attempts AMT I credit for every approved AMT I claim (everMatched keyed by claim id, new matches' evidence = L6) -> every practice with any AMT I claim on a case line fails ALL reconciles (recovered/posted/deposited, quarterly ROI statement in the day job) until roll-forward. Design understates as 'interest due'. Candidate finding (should_fix).
- NEW lead L9: take-back keyed to X=reversal_of_claim_id + DB rule requires standing APPROVED claim match to X. Net-zero restatement C->C2 (RFI 1324) then reversal V2 of C2 w/ take-back L6: lines hold interest from C not C2; line2's C2 match is no_change -> nothing taken back / DB refuses. Also person-reversed claim match (manual.ts reverseMatch doesn't cascade to interest). Candidate finding.
- L1 strengthened: loader links out-of-order (adoptOrphanReversals); an L6 reference can start unnamed (pooled) and become named later; same-CLP07 later claim approving another line; per-(L6,claim) 'left' (6.2 wording) -> re-credit -> per-L6 trigger refuses -> deterministic rollback of whole practice reconcile every attempt/day (permanent). Candidate finding.
- L10: within-R order WO-then-interest differs from today's position order (interest weights after same-R WO). Not in exception list. nit.
- probe dirs: /tmp/claude-0/-home-user-PhysicalTherapy/e99dbc78-96e5-5013-a491-2b14e5309bfe/scratchpad/probes/review/migs1 (base e908c21 + #42 d14f0ac5 mail_streams), migs2 (+ author's draft 20261108090000)
- Probe running (bg b9fb2oawn): scratchpad/probes/review/review-probe.mts on tp_design_interest_21 (drops itself; if interrupted, DROP it). Output probes/review/probe1.out. S1 trigger order, S2 take-back after net-zero restatement (X=C2 vs C), S3 previous image reconcile after new-style credit, S4 seq vs matched_at.
- #42 at d14f0ac5: ledger_match_rules, practice_in_scope, app_actor_*, ledger_entry_rules/_within_line/_within_evidence byte-identical to base; only set_updated_at differs (header). Design's #42 claims hold.
- SUITE-CAP-1 Q1 recreates ledger_entry_within_evidence/_within_line ('ledger:' key) under its own freeze exception; interest exception's 'Stays frozen' list names those two -> wording conflict (nit).
