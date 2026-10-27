## 4. Decisions

**D1. The PLB L6 is the interest; AMT I attributes it.** An interest entry is written only from a PLB L6 of category
`interest` in a loaded remittance, never from an AMT I alone. It is positive for interest paid and negative for
interest taken back; the sign is the chain's (D4), so one L6 that nets several claims may carry entries of both
signs. Cash below means the L6's `amount_cents` negated: positive when the payer pays, negative when it takes back.

**D2. Whom an L6 names.** PLB03-2 is hashed with the practice's key as `claim.payer_claim_control_number` is (as
`rem:799` does today). If the whole reference reaches no claim, each of its tokens (split on spaces, commas, semicolons,
vertical bars and slashes; not on hyphens or dots) is hashed. The L6 names a claim when the whole reference, or else
its tokens, reach claims of exactly one chain; a reference reaching two chains, or none, names nothing. The hashes are
made in memory; no token is logged or stored. (`provider_adjustment.reference` itself is plain text today, section 14.)

**D3. Chains, and what a chain reports in one remittance.** A claim's chain is the original and every reversal and
correction linked from it, as the loader links them (`reversal_of_claim_id`; the claim a correction supersedes, by
`superseded_by_claim_id`; out-of-order uploads included). Its root is found by walking back: a reversal to the claim
it reverses, a correction to the claim that names it in `superseded_by_claim_id` (`claim_by_reversed` and
`claim_by_superseded` serve both). In remittance R, a chain's reported interest `a` is the sum of the AMT I of its
claims in R, signed. A reversal and its correction in one remittance therefore net (RFI 1324).

**D4. Attribution, one remittance R at a time** (pure: `remittanceInterest`, section 6.1). Inputs: R's L6s (cash,
position, the chain each names) and R's chains with `a <> 0`. Each step below yields draws: (L6, chain, signed cents).
1. **An L6 naming a chain with no claim in R** (a later check paying or taking back an earlier claim's interest): the
   whole L6 is that chain's.
2. **An L6 naming a chain with claims in R** covers that chain first: when its cash and the chain's `a` have the same
   sign, it draws the smaller of the two in size, and the chain's `a` and the L6's cash both shrink by it. What is left
   of the L6 joins the pool.
3. **The pool**: the L6s naming nothing, and what step 2 left of the others. Its cash P is their sum; the chains'
   remaining `a` are the claims on it.
   - **P equals the sum of the chains' remaining `a`** (the guide's case, whichever way each moves): each chain draws
     exactly its `a`.
   - **Otherwise only the net moves.** P above zero: the chains with `a` above zero share the smaller of P and their
     sum, by `allocateByWeight` over their `a`, so none draws more than it reports; the others draw nothing. P below
     zero: the same for the chains with `a` below zero. P zero: nothing.
   - Each chain's draw comes from the pool's L6s of its own sign, in position order, up to what each has left; what the
     same-sign L6s cannot cover (only in the exact case, where the L6s net paid against taken-back interest) comes from
     the pool's first L6 of the other sign. Every draw names one L6.
4. **What the pool did not draw of a named L6 returns to the chain it names** (the L6 above its claim's AMT I, case F:
   the payer named the claim and paid that much).
5. **The rest is attributed to no chain**: counted nowhere; the remittance page still lists the L6.

An AMT I with no L6 in R draws nothing: no L6, no draw (case D). The attribution reads only stored rows that never
change (amounts, references, links), so it is the same at every reconcile until a later upload adds a claim or a link;
D6 makes such a change write nothing twice.

**D5. Lines.** A chain's draw is split over its case lines by `allocateByWeight`:
- **Paid** (a positive draw): the lines with a standing claim match to a non-reversal claim of the chain (in R, or the
  named claims in step 1); those whose match is approved when there are any, otherwise every such line (a restatement
  matched "no change"). Weights: each line's `approvedRemaining` (`rled:253`), unchanged from ADR 0067. The match
  names the claim of the line's standing claim match.
- **Taken back** (a negative draw): the lines that hold interest of the chain, that is their interest entries from
  matches naming any claim of the chain, net of corrections and take-backs, above zero. Weights: what each holds; the
  amount split is at most their sum, so no line gives back more than it holds (largest remainder keeps each part at most
  its weight when the total is at most the weights' sum). The match names the claim of the line's latest standing
  interest match of the chain.
- A line whose weight is 0 takes nothing; when every weight is 0 nothing is credited now (ADR 0067:234), and a later
  reconcile credits it once a line has a weight.

**D6. Once.** For each L6 and each sign, what is left is its draws of that sign under the current attribution less
the interest entries of that sign already written from it, gross (reversed ones included: a person's reversal is
final, as the WO branch counts `takenBefore`, `rem:804-805`). For each L6 and chain, what is left is the draw less
what the L6 has already given that chain. The reconcile writes the smaller of the two, over the chain's lines not yet
matched to the L6 (`everMatched`, keyed by the L6, standing or reversed), counting the entries it wrote earlier in the
same pass. So a second reconcile writes nothing; a later reconcile never splits an L6 again past what it moved (probe
R: 540, not 840); and when a later upload changes whom an L6 names, what it gave stands and nothing more is written.

**D7. What an interest match and entry carry.** Every new interest match carries both `provider_adjustment_id` (the
L6) and `claim_id` (D5's claim), with `remittance_id` the L6's remittance. Its `evidence_id` is then the L6
(`coalesce(posting_row_id, eft_row_id, provider_adjustment_id, claim_id)`, `ledger_mig:153`), so `ledger_match_standing`
keeps one standing match per L6 and line, and `ledger_entry_rules` needs no change: the entry carries the match's
evidence, the L6. The worker's `insertMatch` takes a `NewInterestMatch` type that requires both.

**D8. Postgres holds the bounds** (section 5):
- a new interest match carries an L6 of its remittance and a claim the line has a standing claim match or a standing
  interest match to (the second lets a take-back reach a line whose approval a person reversed);
- the job's interest match carrying only one of the two (the previous image's shape) is skipped, not written (D16); a
  person's is refused;
- an interest entry's evidence is a PLB L6 of category `interest`;
- for each L6, its positive interest entries sum to at most its cash paid plus the interest its remittance's claims
  report taken back, and its negative entries to at most its cash taken back plus the interest its remittance reports
  paid. D4 and D6 imply it (a draw beyond an L6's own sign only nets interest its remittance reports the other way), so
  a valid reconcile never meets it; a double count, a re-split or a re-attribution that a defect let through does;
- a line's interest, net of corrections and take-backs, never goes below zero.

The hash link from PLB03-2 to a claim and the chain cannot be checked in SQL (the key is the practice's, in the
application), so the attribution is the worker's and Postgres bounds its amounts. The worker checks each bound before
it writes, because one refusal rolls the practice's whole reconcile back: a refusal is a defect caught loudly, never a
path the job relies on.

**D9. Interest taken back.** A take-back is a negative interest entry whose evidence is the L6 and whose match names a
claim whose interest the line holds. It does not reopen the case or notify anyone: interest is never in recovered, and
the line's stage does not move (`ledger_line_stage` reads no interest). The principal a reversal takes back is still
recouped as today.

**D10. N1.** `allocated` is true when the entry's amount is one of two or more nonzero parts of a pro-rata split: two
or more chains shared a short pool by weight (D4 step 3, "only the net moves"), or the draw was split over two or more
lines with nonzero parts. A chain's exact AMT I is the payer's own figure, not an allocation; one line taking a whole
draw is not allocated. `ledger_match_allocated` and `ledger_entry_allocated` are unchanged.

**D11. `ledger_match.seq`.** As 3.4 (a). `ledgerMatches` (`rled:103`), `CHAIN_ORDER` (`rem:371-375`) and the web's
lists (`wq:482`, `:485`) order by `seq`. `matched_at` stays the transaction's time and is still shown.

**D12. `claim_by_superseded`.** `CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE
superseded_by_claim_id IS NOT NULL`, the twin of `claim_by_reversed` (`20261016120000_remittances.sql:136`). It serves
the correction chain's three lookups (section 1.7) and D3's walk back. If SUITE-CAP-1 merges first with the same index
(its D15), this migration leaves it out.

**D13. Order within the pass.** Kept as today. The attribution of every loaded remittance is computed first (it reads
no weight); then the provider adjustments are walked in today's order (`bpr16_date, created_at, position`, `rem:791-792`),
WOs and L6s interleaved; at each L6 its draws are split by the lines' weights at that moment, so a WO earlier in the
order lowers an L6's weights exactly as it does today. The only query change is that an L6 with no reference is read
too.

**D14. What does not change.** Interest is never in recovered. The weights of paid interest (`approvedRemaining`). The
dropped interest of a line with nothing remaining (ADR 0067:234). WO recoupments (their exact-hash naming included),
reversal take-backs and every principal amount. `LEDGER_STAGES`, the seven entry types and the stage CHECK. The proof
cap. `roi_statement` and its rules. A person-reversed match is never made again by the job. ERA exports carry no
interest. The parser and loader.

**D15. Rows written before this change** are development rows (ADR 0067:253-254: no customer data exists, and
development data is regenerated). They are not converted: their AMT I interest matches (claim only) and L6 matches
(L6 only) stay valid under the relaxed CHECK, and the new rules apply to new rows only. An old claim-only match counts
as interest the line holds for its claim's chain; an old L6-only match names no claim, so a take-back cannot find it
(development data only).

**D16. The deploy window and a rollback.** Migrations run before traffic moves (ADR 0049). Until the new worker takes
over, and again after any rollback of the image, the previous worker's reconcile runs whole: `ledger_match_rules`
skips its one-record interest matches (3.8 (b)), so it writes no interest entry and everything else it does (claims,
recoupments, postings, deposits, stages, notices, statements) is written as before. Its INSERTs leave `seq` to the
identity and its reads order by `matched_at, id` as before. The current image then credits the interest once.

### 4.1 Worked cases (cents; LED-16's two lines, weights 2400 and 3000 unless stated)

C is the correction on the case lines; K is another patient's claim on no case line; X the claim a reversal V reverses.

| Case | Stored | Today | After |
|---|---|---|---|
| A, the guide's pair | AMT I 540 on C; L6 -540 naming C | 1080 (two matches per line) | 240 + 300 from the L6, allocated |
| B, an L6 naming nothing | AMT I 540 on C; L6 -540, no reference | 540 from AMT I; the L6 never matched | 240 + 300 from the L6 (P 540 equals C's 540), allocated |
| C, an L6 alone | L6 -540 naming C | 540 | 540, the same split |
| D, AMT I alone | AMT I 540; no L6; BPR02 excludes it | 540 | 0; the line shows "reports 5.40 of interest (AMT I)" |
| E, AMT I, then a later L6 | D, then a later remittance's L6 -540 naming C | 1080 | 540, dated by the later remittance |
| F, the L6 above AMT I | AMT I 540; L6 -600 naming C | 1140 | 267 + 333 (540 covers C; the other 60 returns to the claim the payer named) |
| F', the same naming nothing | AMT I 540; L6 -600, no reference | 540 from AMT I | 540 (P 600 is not 540, so only the net moves: min(600, 540)); 60 attributed to no chain |
| Two claims, one pool | AMT I 540 on C and 200 on K; L6 -740, no reference | 540 from AMT I | 240 + 300 (C's exact 540); K's 200 on no case line |
| A short pool | as above with L6 -500 | 540 from AMT I | C 365 (largest remainder of 500 by 540:200), split 162 + 203, allocated; K 135 |
| A named net L6 (review F7) | AMT I 540 on C and 200 on K; L6 -740 naming C | 1280 (740 from the L6, 540 from AMT I) | C 540 (240 + 300); the other 200 is K's |
| A reference with three identifiers (F6) | AMT I 540 on C; L6 -540, reference "{CLP01} {C's CLP07} {TRN02}" | 540 from AMT I | 240 + 300, named by the CLP07 token |
| R, approvals at different times | L6 -540 naming C when only line 1 has a weight; later line 2 gains one | 540, then 840 | 540 on line 1, not allocated; nothing more, ever |
| R', the same with a later correction of the same control number (F1) | as R, line 2's approval by C3 with C's CLP07 | 540, then 840 | 540; nothing more (left 0 for the L6); the reconcile completes |
| Net zero (RFI 1324) | after A: V reverses C (AMT I -540), C2 corrects C paying more (AMT I 540); no L6 | the new correction's 540 again | nothing new |
| Net zero beside another claim (F2) | V -540 and C2 +540 of one chain, K +200; L6 -200 naming nothing | C2's 540 from AMT I | the chain reports 0; K's 200; nothing on C's lines |
| Taken back | after A: V reverses C alone (AMT I -540); L6 +540, no reference | 1080 stays (A's) | -240 and -300; net 0 |
| Restated, then taken back (F3) | after A: C restated as C2 (no change on either line, AMT I net 0); then V2 reverses C2 alone (AMT I -540) with L6 +540 | 1080 stays | -240 and -300 (the chain's interest is held through C) |
| One net L6 both ways | after A: V reverses C alone (AMT I -540), K reports +200; one L6 +340 naming nothing | 1080 stays | -240 and -300 from C's lines; K's +200 on no case line (exact: 340 = 540 - 200) |
| A take-back past what a line holds | after A: L6 +600 naming C | 1080 stays | -240 and -300 (what the lines hold of C's chain); the other 60 taken from no case line |
| Pooled first, named later (F1) | L6 -540 referencing "Z" in R2, where K' (a correction on a case line) reports AMT I 540; later the remittance holding claim Z is uploaded | K' 540 from AMT I | K' 540 from the L6; after the upload the L6 names Z's chain, has nothing left, and writes nothing |
| The previous image, during the deploy | any of the above | | no interest written by it; the current image writes the "After" column once |

