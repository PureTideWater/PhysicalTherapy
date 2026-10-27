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
## Probe 1 DONE (tp_design_interest_21 dropped; output probes/review/probe1.out)
- S1 sound: ledger_entry BEFORE row triggers order rules, within_evidence, within_interest, within_line (as design says).
- S2 CONFIRMED F-takeback: after net-zero restatement C->C2 (allowed same => C2 matches are no_change on BOTH lines), V2 (rev_of C2) take-back: held from C2 = 0/0, from C = 240/300; take-back match naming X=C2 refused on L1 and L2 by new ledger_match_rules; naming C accepted, entry -300 accepted. => D3 takes back nothing; interest stays 5.40 after payer took it back.
- S3 CONFIRMED F-rollback: previous image's reconcile refused even after new-style (L6+C) credits exist; whole pass rolled back (entries unchanged). Old claimInterest everMatched keyed by claim id never sees L6-evidence matches.
- S4: seq order = matched_at order on 6 rows (no person reversals) -> L5 closed, no finding.
- Side: LED-23 net-zero.835 expects 'line 1 approved 2.00 more' but same allowed + higher pay => no_change (probe: C2 no_change on L1). Nit: fixture must raise allowed or expectation is wrong.
- EDI: search summaries: TR3 1.10.2.9 L6 = net for all claims of the remittance; HPHC: AMT informational, PLB carries interest totaled or split; BCBS OK example L6 with no reference; X12 guidance (RFI 2370) recommends PLB03-2 = CLP01, CLP07, TRN02 concatenated; BCBS TX WO ref 'CLP01 CLP07'. => exact-hash naming misses the X12-recommended format (F-ref tokenize). x12.org not reachable (ENOTFOUND).
- Lead L11: named L6 that is the remittance NET (TR3 1.10.2.9) but references one claim => whole net to that claim's lines over AMT I (case F logic). consider finding.
## Findings so far (16:5x)
- F1 BLOCKING once-keying per (L6,claim) vs per L6: named set grows (same-CLP07 later claim approving another line; out-of-order upload makes pooled L6 named) -> worker re-credits -> per-L6 trigger refuses -> whole practice reconcile rolls back every attempt/day, no UI remedy (gross so_far counts reversed). LED-24 first/second uses different CLP07 so passes either way. Fix: left(L6)=|L6|-sum(all entries of L6) in interest.ts signature + properties over changing attribution + db tests.
- F2 BLOCKING pool ignores negative AMT I when P>0 (and positive when P<0): TR3 1.10.2.9 net L6 for all claims + RFI 1324 pair (V -540, C2 +540) + K 200, L6 -200 unnamed -> C2 takes 146 of K's interest. Property test (part <= AMT I) passes. Fix: net AMT I per correction chain within R (V.reversal_of = X, X.superseded_by = C2) before e().
- F3 SHOULD_FIX take-back keyed to X + standing APPROVED match (probe S2): restating correction (no_change) then reversal -> nothing taken back; also person-reversed claim match; also paid interest on a no_change correction can't reach lines. Fix: take-back holds via claim chain; DB rule for take-back = standing interest match naming NEW.claim_id on line; paid via any standing claim match of the chain.
- F4 SHOULD_FIX rollback scope (probe S3): old image refused for every practice w/ approved AMT I claim even after new-style credit; whole pass (approvals, postings, deposits, stages, notices, day job's quarterly ROI) blocked until roll-forward. Fix: RETURN NULL for exact legacy job shapes (matched_by NULL, one ID) + db test that new code writes both IDs; or state scope + runbook.
- F5 SHOULD_FIX statement sentence: statement-html.ts:114 change breaks apps/worker/src/report/brand.test.ts:144 (#46's dir; design says it doesn't touch apps/worker/src/report) and web ROI page reports/roi/[statementId]/page.tsx:108 keeps old sentence -> printed vs screen disagree; UX review list misses web ROI page.
- F6 SHOULD_FIX PLB03-2 exact-hash naming misses X12-recommended 'CLP01 CLP07 TRN02' format (RFI 2370 per search summary; BCBS TX 'CLP01 CLP07' for WO): later-remittance L6 never credited. Fix: tokenize and hash each token.
- F7 SHOULD_FIX named net L6 (TR3 1.10.2.9) referencing one claim takes others' AMT I: C 540, K 200, L6 -740 naming C -> 740 on C's lines. Fix: AMT I first, named claim takes unexplained remainder (F unchanged).
- F8 SHOULD_FIX exception file list misses packages/ledger/src/stages.test.ts, rules.test.ts (src is additions-only), stryker/shards.json, ledger.db.test.ts LED-06 block (PAR-18 assert), apps/worker/src/report/brand.test.ts; behaviour list misses within-R order change (WO before interest vs position order); 'Stays frozen' within_evidence/_within_line conflicts with SUITE-CAP-1 Q1.
- NITS: N1 negative parts allocated undefined; LED-23 net-zero.835 'approved 2.00 more' needs allowed raise (probe: no_change); RFI 2202 described both as same-remittance rule and later payment.
- allocateByWeight checks (probes/review/alloc.mts): (200,[540,200])=[146,54]; (250,[450,100])=[205,45]; (540,[0,300])=[0,540] -> no cap at weight: take-back part must be capped at sum(held) in interestToLines (spec omits; worked case implies) -> fold into F1 (bounds Postgres holds that interest.ts doesn't own).
- CHAIN_ORDER tie-breaks (matched_at, kind class, bpr16_date, created_at, position, id) reproduce in-pass order -> seq equivalent for new rows. Sound.
- Only LED-16 among LED fixtures carries AMT I (also V07 variant); PAR-18 is L6 named. Sound.
## STATUS: analysis complete; writing StructuredOutput. Verdict: build with changes. All probe DBs dropped (tp_design_interest_21).

# ROUND 2 (started 2026-10-27 ~19:5x): design revised (123962 bytes, mtime 19:46) after round-1 findings; header says sect 15 records each finding. Reviewing the revision.
- R2: read whole revised design (1374 lines). #42 now 6f23c42b; ledger fns byte-identical to base (rechecked). Sect 15 maps F1-F8, N1-N3; pending = second look at 3.6-3.9, 4, 5, 8.
## R2 leads (open)
- R2-L1 out-of-order fixture: later-named chain is 'another patient's claim' (no case line) -> DB test passes under per-(L6,chain) keying (F1 regression undetected). Candidate should_fix.
- R2-L2 skip RETURN NULL: verify old rled insertMatch/recordInterest on 0 rows; other job-shaped writers of 1-ID interest matches (seeds, tour, e2e, synth oracle)
- R2-L3 rollback: old code reading negative interest (entryProblems callers, totals/roi/statement validation, roi_statement_rules)
- R2-L4 seq vs matched_at across txns (now() = txn start before lock wait); reversalRule uses matched_at
- R2-L5 catalog test lists of triggers/functions; lockLedger key form == hashtextextended('ledger:'||id,0)?
- R2-L6 job ever writes reversed/adjusted entries on interest (floor refusal path for job)?
- R2-L7 pool remainder / bound proofs (sound so far by hand)
## R2 closed sound (20:xx)
- R2-L2 old rled insertMatch returns null on skip -> recordInterest continue (rem:892-894); only other 1-ID interest writer = ledger-world.ts (design updates it). SOUND.
- R2-L3 entryProblems only in packages/ledger; totals/roi/statement signed sums; figure empty-state by entry count; reportReconciliation for recovered only. SOUND.
- R2-L4 seq vs matched_at: seq is true insert order; reversalRule's at=matched_at unaffected. SOUND (pre-existing lock-wait skew not this design's).
- R2-L5 lockLedger key == hashtextextended('ledger:'||id,0); catalog test has no trigger/function lists hit; new trigger locks only for interest roots (no deadlock with per-row locks). SOUND.
- R2-L6 ledger_entry_rules: job never writes reversed/adjusted (created_by required). SOUND.
- R2-L7 per-L6 per-sign bound vs exact-pool remainder: r <= chain-net negatives <= reported_taken; static inputs; SOUND.
- LED-16 fixture BPR02 54->59.40 doesn't touch its posting/EFT (those are adjusted.835 LED16002). SOUND.
- approvedRemaining = approved+recouped (not minus proved) so later-L6 (E) after posting still has weight. SOUND.
## R2 findings so far
- RF1 should_fix (test gap): LED-24 out-of-order fixture's later-named claim is 'another patient's claim' (no case line) and R' uses same chain -> no DB test fails if worker keys left per (L6,chain) without per-L6-sign gross cap; property tests only cover pure interestLeft. Fix: later-named claim approves a line of a 2nd case; assert nothing written & completes.
- RF2 should_fix: unlinked reversal (payer gives reversal its own CLP07 + REF*F8; parser ignores F8 for status 22, transaction.ts:797-800; loader earlier() by own CLP07) beside linked correction C2 + another claim K with AMT I + net L6: exact pool pays C2 its full +540 again (double count); Postgres bound accepts (200+540). Same as today (not regression) but Risk 8 understates; fix: D3 nets unlinked status-22 claim in R with same-PCN/linked correction (or parser F8 for reversals) + synth case.
- RF3 nit/should_fix: reverse-route refusal sentence tells person to reverse take-back match; page:84 never offers reversal of interest matches; Risk 5 remedy 'reverse through the route' has no screen. Fix: offer ReverseForm on interest matches (take-back first) or reword to specialist adjustment.
- RF4 nit: reported-interest sentences per claim match show C and C2 each 'reports 5.40' after a net-zero restatement (reversal -5.40 not shown).
- RF5 should_fix (race): reconcile txn is READ COMMITTED (pass.ts:38 context.transaction, plain BEGIN); loader takes no ledger lock (only remittance-traces lock, loader.ts:222) -> a load of R can commit between interestAttribution's AMT I claims read and its L6/reference reads. Torn view: named net L6 (740 naming CLP07 X, C2 AMT I 540 + K 200 in R) seen with no R claims -> step 1 'chain with no claim in R' -> whole 740 to chain C via C1's standing approved matches (same CLP07) -> written; next pass correct attribution gives 540 but per-L6-sign left 0 -> first attribution stands permanently; Postgres bound 740<=740 accepts. Fix: read attribution inputs + L6 loop rows from one statement / restrict every query (claims, links, hash lookups, L6 loop) to the remittance IDs one statement saw; ignore links to claims outside that set.
- #42 6f23c42b overlap = only shared docs/synth/generated (as design says). SOUND.
- LANES delegation (co-founder) is Lane B only -> founder decides here. SOUND.
- nit candidate: reference lookup not restricted to the L6's payer (CLP07 unique per payer only); tokens widen collisions. Fix: reach claims of the L6's payer only.
- RF6 BLOCKING (probe review2/zero-l6.out): a PLB L6 of 0.00 parses (outcome loaded, 0 errors), plans and loads as provider_adjustment category interest amount 0 (no CHECK <> 0, remittances.sql:216). Design 6.1: interest.ts throws LedgerError on a zero L6; 6.2 L6 query has no amount filter -> reconcile throws -> whole pass rolls back every retry/day (approvals, postings, deposits, stages, notices, statements), no remedy. Today harmless (negateCents(0)<=0 return). Same for a chain netting to 0 if passed (6.1 'each chain ... with AMT I'). Fix: filter amount_cents <> 0 in the L6 query and the attribution, pass only chains with net a <> 0; throws only for impossible-from-stored-data inputs; add LED-23 variant zero-l6.835 (reconcile completes, nothing written).
- zero-L6 probe ran on main checkout code read-only via tsx; git status clean.
- RF7 nit: oracle harness (ledger-oracle.db.test.ts:236-238) always caseFor(`${fixture}/original.835`) + load `${fixture}/adjusted.835` before steps; LED-23/24 file lists (8.2) have neither -> 'two appended cases' need those names (or a harness change, which the exception freezes). Also the oracle's LED-16 case uses original/adjusted (interest 0n), never two-lines-adjusted -> '(LED-16 against its corrected fixture)' in 8.3 misleads.
- RF1 extended: second.835's same-CLP07 claim must be a linked correction (REF F8 or after a reversal) else it is a separate chain (transaction.ts:797-800) and R' tests nothing.
- nits: takesBack must read the stage-interest entry's sign, not its corrections (adjusted/reversed negative); summary 'an L6 with no AMT I is credited' only when named (unnamed L6 w/o AMT I in R never credited; D then unnamed later L6 goes 540 -> 0); reference lookup not restricted to the L6's payer.
## STATUS R2: analysis complete; no DBs of mine left; writing StructuredOutput. Verdict: build with changes.
