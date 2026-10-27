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
## Probe P1 (run 1, tp_design_interest_2, main checkout code e908c214; script probes/author/interest-author-probe.mts; DB DROPPED)
- A (AMT I 5.40 + L6 -5.40 naming correction, BPR 59.40): interest 240+300 (PLB) + 240+300 (claim) = 1080 vs L6 cash 540. 6 matches, 1 matched_at. REPRODUCED.
- R (NEW): R1 = correction raises L1 pay, L2 allowed up but pay same (approved match, no entry, weight 0), L6 -5.40 naming it, no AMT I -> L1 interest 540 allocated=TRUE (N1: one line took it all). R3 a month later: C1 reversed, C2 pays L2 80 (allowed 110) -> L2 approved 3000 -> reconcile re-splits the SAME L6: L2 gets 300 -> 840 from 540 of cash. Third reconcile: 840 (stable). => third double-count path: per-evidence re-split with everMatched per line, no "taken before" for interest.
## Decisions so far (draft)
- L6 authoritative cash; AMT I allocation key + display; AMT I alone (no L6) credits nothing, shown "reported, not paid in this check" (TR3 RFI 2202/1324/2184). Referenced L6 -> its claim (by hash of any practice claim); reference naming no claim -> pooled per remittance, allocated by uncovered AMT I, capped at it; excess unattributed shown.
- Per-evidence "left" = cash - already credited (as recoupment's takenBefore) + DB cap trigger.
- Take-back (positive L6): weighing H1 (surface, person adjusts) vs H2 (negative interest entries; sign CHECK change) -> decide
