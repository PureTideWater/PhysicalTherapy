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
## Decisions (run 1, firm unless code says otherwise)
- D1 L6 = cash & authority; AMT I = attribution key (+ shown). AMT I alone credits nothing ("reported, not in this check"); net-zero reversal/correction -> nothing (RFI 1324).
- D2 attribution: referenced L6 whose ref hash matches a practice claim -> namedLines(hash, approvedOnly) as today; else (null ref / ref naming no claim) pooled per remittance -> split over that remittance's claims by uncovered AMT I e(C)=max(0, AMTI(C) - referenced L6 cash for C's hash in R), T=min(U, sum e), allocateByWeight (part<=e proven: largest remainder with T<=S), rest unattributed.
- D3 within a claim: lines split by approvedRemaining (unchanged weights); per L6 "left" = cash - gross interest entries with evidence L6 (mirror recoupment takenBefore) -> fixes probe R re-split.
- D4 new interest matches carry BOTH provider_adjustment_id (L6) and claim_id; evidence_id = L6 (coalesce order). CHECK interest branch >=1 (history), ledger_match_rules requires both for new inserts. NO new unique index needed (DB scout's (c) dropped: per-(claim,line) key would refuse legit second L6 cash).
- D5 DB cap: new trigger fn ledger_entry_within_interest (BEFORE INSERT ledger_entry; name sorts after rules): interest entries of an L6 incl corrections stay between 0 and -amount; lock 'ledger:'||practice (same key as lockLedger, re-entrant; every writer takes it: pass.ts:39, manual.ts:48 begin()).
- D6 N1: allocated = >=2 positive parts in a pro-rata split (claim-level pro rata or line split), not named.length>1.
- D7 seq: ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY (physical-order fill, no backfill UPDATE: only synthetic data per ADR 0067:253; avoids all-practice set_config + disabling ledger_match_rules); readers ORDER BY seq (ledger.ts:103, CHAIN_ORDER rem:371-375, web queries.ts:482,485); add seq to immutability tuple. Precedent for set_config in migration exists (20261101090000:49-51) - mention as the rejected alternative.
- D8 index claim_by_superseded (superseded_by_claim_id) WHERE NOT NULL (mirror claim_by_reversed 20261016120000:136); catalog needs practice_id-leading index on table only (catalog.ts:369) - claim has one.
- D9 take-back (positive L6): leaning H2 negative interest entries (sign CHECK interest <>0 + trigger rules) - decide & write
- D10 one PR (interest + N1 + seq + index); 15b stored case close stays with PR 8 (case/case_line DDL, not ledger).
- #42 overlap: no ledger fn/table; shared generated/docs: domain-model.md, areas.json, functions/*, test-matrix.md, matrix.ts, registry.ts, reconciliation-001.md, watched-paths.txt, catalog.db.test.ts (#42 files list: progress/interest-author-42files.txt)
- D9 DECIDED H2: negative interest entries (ledger_entry_sign interest <> 0), take-back attributed by reference or by the remittance's negative AMT I (reversal V -> V.reversal_of_claim_id lines holding interest), capped per line (net >= 0, DB floor) and per L6 (DB).
- D11 add index ledger_entry_by_evidence (practice_id, evidence_id, stage) for the cap's per-L6 sum (and entriesOfEvidence, within_evidence) - DDL on frozen table, in exception.
- D12 deploy window: previous image's interest inserts refused (RAISE, fail closed, retried); no silent skip.
- Draft migration: probes/author/20261108090000_ledger_interest_once.sql; prototype probe probes/author/interest-author-proto.mts (DB tp_design_interest_3, migs1 = base+#42, migs2 = +draft) -- running in background (bj7y8c7qu) queued on flock
## Next: write design doc sections (1 today cited, 2 TR3, 3 options, 4 decisions, 5 migration, 6 app, 7 words, 8 tests, 9 domain model, 10 founder, 11 files, 12 risks, 13 slices, 14 out of scope)
- D11 DROPPED: ledger_entry_by_evidence (evidence_id) already exists (20261026090000:61; schema/ledger.ts:159). Prototype rerun after fixing draft.
- WRITTEN: header, 0 summary, 1 today (1.1-1.8), 2 TR3 semantics
- WRITTEN: 3 options (3.1-3.5), 4 decisions D1-D11
- WRITTEN: 5 schema (5.1 objects, 5.2 deploy/rollback, 5.3 SQL) - verify vs prototype output
- WRITTEN: 6 application (6.1-6.4)
- WRITTEN: 7 words
- WRITTEN: 8 tests (8.0 placeholder PROTOTYPE_RESULTS_PLACEHOLDER to fill), 8.1 matrix rows, 8.2 synth, 8.3 table
- WRITTEN: 9 domain model+records, 10 founder, 11 files, 12 risks, 13 slices, 14 out of scope. TODO: 8.0 prototype results; final read-through
- Read-through done for 0-4 (fixed citations: review file approval-summaries/lane-b-pr15b-review-payment-engine.md:57-58, :24, :64-68; ledger_mig lines 153/156-162/207-214/314-374/725-733; rem:804-805). Added CONSTRAINT 'ledger_interest_line_floor' to the floor RAISE + reverse route mapping by constraint. net-zero fixture now pays line 1 2.00 more (so today's code credits again).
- Prototype (bh2elpwyj) still queued on flock behind suitecap1 large db test (~13 min). When done: fill 8.0 PROTOTYPE_RESULTS_PLACEHOLDER; check DB tp_design_interest_3 dropped.
