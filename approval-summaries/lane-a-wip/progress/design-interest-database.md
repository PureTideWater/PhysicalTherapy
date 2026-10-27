# design-interest-database progress
Started 2026-10-27. Clone: $SP/designs/interest-database (detached at origin/claude/build-platform e908c214; #42 head 098636e3)
## Read so far
- LANES.md claim row (ADR 0084, LED-23..25, synth module 6, fixture 900008 only if needed); Handed-to-Lane-A entry (four items)
- lane-b-pr15b-status.md; review-payment-engine.md N1 (recordInterest allocated = named.length > 1; probe E4), builders' proposals (AMT I + PLB L6 double count; matched_at order -> S1 fixed in-pass, sequence/clock_timestamp needs migration)
- design lane-b-pr15b.md 0.5, 1.2 interest row (allocateByWeight, rem:513-560; LED-16 BPR 54.00 since AMT I left out of CLP04 per ADR 0021)
## Findings
(next: packages/ledger, apps/worker/src/reconcile, edi835 AMT I / PLB L6, migrations)
## Findings (as of read 1)
- Interest code: apps/worker/src/reconcile/remittances.ts: providerAdjustments L6 branch :836-840 (namedLines approvedOnly=true :767-773, hash of PLB reference vs claim.payer_claim_control_number_hash of a standing approved claim match); claimInterest :844-860 (claim.interest_cents>0 of standing approved claim matches); recordInterest :862-909 (allocated = named.length>1 :878 = N1; weights approvedRemaining; everMatched per (kind, evidence id, line) :912-914). Order in reconcileRemittances :931-946: matchClaims, recoupReversals, providerAdjustments (L6), claimInterest (AMT I). Dedup only per evidence id -> AMT I (claim id) + PLB L6 (adjustment id) both credited.
- Parser: AMT I -> plan.ts:351 (first AMT*I of claim, claim.interestCents); loader.ts:401-412 claim.interest_cents; PLB L6 -> transaction.ts:97 category 'interest', loader.ts:505 provider_adjustment(reference, amount_cents sign as segment: L6 negative). ERA exports: interestCents null, no PLB (era/normalize.ts:527,602,606).
- ADR 0021: claim balance CLP03 - all CAS - CLP04 = 0 (no AMT I term); transaction sum(CLP04) - sum(PLB) - BPR02 = 0. So in this repo AMT I is NOT inside CLP04 (LED-16 BPR 54.00, not 59.40).
- DB: claim.interest_cents bigint nullable (20261023120000:58, grant INSERT :59). ledger_match (:121-165): kind interest, allocated (CHECK ledger_match_allocated :162), matched_at := now() in ledger_match_rules (:345) -> all matches of one reconcile tx share matched_at; unique ledger_match_standing (kind, evidence_id, service_line_id) WHERE reversed_at IS NULL (:168). ledger_entry: seq identity (:173), stage interest evidence provider_adjustment|claim (:199), sign >0, allocated CHECK; ledger_entry_once_per_match (:216). ledger_match_rules interest branch :367-371 (PLB category interest of same remittance, or claim interest_cents>0 of same remittance). ledger_entry_rules latest body 20261027090000:50 (interest entry needs matched.kind interest, allocated = match.allocated). NO DB bound on interest entries vs their evidence amount, nor across AMT I + PLB L6 (ledger_entry_within_evidence only posted/deposited; ledger_entry_within_line only approved/posted/deposited + adjustment bounds).
- #42 (20261107090000_mail_streams.sql) touches no ledger table/function; only generated headers of set_updated_at/reject_change/app_actor_is_platform_admin change.
- claim.superseded_by_claim_id: 20261016120000_remittances.sql:123, no index (indexes :134-136 only control number, patient, reversal_of).
- probe script: scratchpad/probes/interest-probe.mts (DB tp_design_interest_1, main checkout code e908c214, variants A-F,H + E later L6)
## PROBE RESULTS (tp_design_interest_1, base code e908c214, LED-16 two-line case, AMT I 5.40 = lines 240/300)
- A AMT I + L6 naming claim (-5.40, BPR 59.40, TR3 shape): interest 240+300 (claim) + 240+300 (PLB) = 1080 vs cash 540. REPRODUCED double.
- B AMT I + L6 no reference: 540 via claim evidence; L6 never matched (reference IS NULL filter remittances.ts:791).
- C L6 naming claim, no AMT I: 540 (PLB evidence).
- D AMT I only (the fixture; BPR 54.00 excludes it): 540 credited, no cash in check.
- F AMT I 5.40 + L6 -6.00: 240+300+267+333 = 1140 vs cash 600.
- H AMT I 5.40 + L6 +5.40 (taken back, BPR 48.60): 540 credited, take-back dropped (interest<=0 return; sign CHECK interest >0).
- E AMT I fixture then later remittance L6 naming claim: 1080.
- 2nd reconcile idempotent in all. One reconcile's matches share ONE matched_at (6 matches, 1 stamp).
## TR3 semantics (X12 RFIs via search; x12.org blocked by proxy): AMT*I informational, not in balancing; TR3 1.10.2.9: payer conveys net interest in PLB L6 = -(sum AMT*I), same remittance; RFI 2202: AMT*I without supporting L6 (and vice versa) non-compliant; RFI 1324: no L6 when net zero (reversal+correction interest).
## Next: callers list, N1/sequence/index DB specifics, migration shape, #42 overlap, drop DB
- probe2 (rolled back): job inserts interest entry 9,999,999 cents on a 540 L6 already credited via AMT I -> accepted (no DB bound); negative interest -> ledger_entry_sign refuses (interest take-back unrepresentable).
- EXPLAIN: superseded_by lookups (claimLines recursive CTE remittances.ts:250-260, correlated corrects_claim_id per service line, unmatched.ts:187 EXISTS) all Seq Scan on claim; partial index claim_by_superseded (superseded_by_claim_id) WHERE NOT NULL serves them (tested in rolled-back tx).
- No CARC 225 handling anywhere (interest carried inside CLP04 via negative claim CAS would be spread as principal by claimLinePayments) -> open question.
- PLB reference stored plaintext (provider_adjustment.reference, not in ENCRYPTED_COLUMNS cipher.ts:39-60) though ADR 0027:95 calls it PHI -> side finding.
- probe3: ALTER TABLE ledger_match ADD COLUMN ... GENERATED ALWAYS AS IDENTITY fills existing rows (physical order; DDL rewrite ignores RLS and triggers); a live session's ledger_entry_rules (matched ledger_match rowtype, SELECT * INTO) keeps working after ADD/DROP COLUMN.
- prototype (scratchpad/probes/interest-prototype.sql, rolled back, as tp_owner): CHECK ledger_match_evidence interest branch num_nonnulls(claim_id, provider_adjustment_id) >= 1 (history-compatible); UNIQUE ledger_match_interest_once (claim_id, service_line_id) WHERE kind=interest AND reversed_at IS NULL AND claim_id IS NOT NULL builds on double-counted history and REFUSES practice B's L6 attributed to the AMT I claim (duplicate key); seq backfill: tp_owner sees 0 ledger_match rows under FORCE RLS unless migration does set_config('app.practice_ids', all practices, true) at top level (no precedent in migrations; catalog rule only covers DEFINER functions); with it UPDATE 34 under DISABLE TRIGGER ledger_match_rules/updated_at (precedent 20261106090000:101), SET NOT NULL, ADD GENERATED ALWAYS AS IDENTITY, setval; previous image INSERT without seq gets next value.
- reconciliation-001.md:464-469 "Ledger semantics": no migration alters/adds trigger or policy to ledger_entry, ledger_match, posting_row, eft_row, roi_statement (guard test planned with PR 8, reconciliation-001.md:172, NOT built); stage CHECK seven values; recovered posted/deposited only; packages/ledger/src additions only, matching rules untouched.
- #42 head 098636e3: ledger_* function files md5-identical to base; only set_updated_at header differs. This item touches ledger_match_rules (+ maybe new ledger_entry trigger fn). SUITE-CAP-1 may recreate ledger_entry_within_line/_evidence (advisory locks) -> coordinate; prefer new trigger fn.
- lockLedger (reconcile/ledger.ts:16-18) taken by pass.ts:39 and manual.ts:48 -> ledger_match seq order = commit order per practice.
- unmatched.ts lists no provider adjustments: an unmatched L6/WO is invisible.
- Drizzle schema to update: packages/db/src/schema/ledger.ts:90-124, remittances.ts:157,170.
- tp_design_interest_1 DROPPED. Next: final report.
