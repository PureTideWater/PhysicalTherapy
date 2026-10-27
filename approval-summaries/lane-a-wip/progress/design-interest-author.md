# design-interest-author progress
Started. Clone: scratchpad/designs/interest-author (base origin/claude/build-platform).
Output: /home/user/ops/designs/ledger-interest-once.md
## Outline (to fill)
## Sections written
## Open points
## Read so far (run 1)
- Scout progress files (both), LANES.md (claim row 188: ADR 0084, LED-23..25, synth module 6, fixture 900008 only if needed), status file 15b, 15b design 0-1.2, house style pr6b-email-streams.md (sections: today cited, decisions D1.., schema, where shows, files, tests, founder questions, open items, out of scope, review)
- Verified: remittances.ts 778-947 (L6 :836-841, claimInterest :845-860, recordInterest :863-910, allocated :878, everMatched :912-914, reconcileRemittances :932-947); ledger.ts insertMatch ON CONFLICT (kind,evidence_id,line); ledgerMatches ORDER BY matched_at,id :103
- DDL verified: ledger_match 20261023120000:123-171 (evidence CHECK ELSE branch :160 =1; evidence_id coalesce :152; standing idx :171); ledger_match_rules :316-375 (matched_at := now() :339; interest branch :367-371); ledger_entry_rules latest functions/ledger_entry_rules.sql (evidence_id equality; interest needs kind interest; allocated = match)
- Freeze text reconciliation-001.md:464-469
- TR3 via web search summaries (x12.org fetch blocked): RFI 1705 (net interest at PLB L6; claim-specific AMT*I; AMT not in balancing), RFI 2202 (AMT I needs L6 in same remit and vice versa), RFI 1324 (net zero -> no L6), RFI 2184 (L6 = sum of AMT*I except 0), UHC guide: PLB03-2 identifies claim except for FB, IR, J1, L6, CS (so L6 often has no claim ref)
- NEW finding to probe: L6 split recomputed each reconcile; everMatched per line only -> if a line had weight 0 first run and >0 later, it gets a fresh part while the other line keeps its full part -> over-credit from ONE evidence (no takenBefore for interest as recoupment has)
