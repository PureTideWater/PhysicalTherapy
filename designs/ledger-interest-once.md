# Interest credited once: the PLB L6 is the interest, AMT I says whose it is (Lane A; handed over by PR 15b)

Design contract, 2026-10-27, against `claude/build-platform` at e908c21, with PR 6b-4 (#42, `co-001/pr-06b-mail-streams`,
head 098636e3) read for every function and generated file this item shares with it.

- **Lane:** A (a schema pull request; LANES.md rule 2). **Branch:** `co-001/ledger-interest-once`, cut from the latest
  `claude/build-platform` after #42 merges and after the founder grants the freeze exception of section 10.
- **Reserved (LANES.md claim row):** ADR 0084; test-matrix LED-23 to LED-25; `packages/synth` cases LED-23 to LED-25
  (module 6, LED). Fixture release 900008 is not needed and stays free.
- **Handed over by:** PR 15b (#51, merged as c355633). LANES.md "Handed to Lane A", 2026-10-26, four ledger items:
  interest credited twice, N1 (the interest "allocated" flag), a sequence for `ledger_match`'s order within one
  reconcile, and an index on `claim.superseded_by_claim_id`. Status: `approval-summaries/lane-b-pr15b-status.md`.
- **Scouts' notes:** `scratchpad/progress/design-interest-database.md` and `design-interest-application.md`. **The
  author's probes:** `scratchpad/probes/author/` (each command and its output is quoted where it is used below).
- **Short names:** `rem` = `apps/worker/src/reconcile/remittances.ts`; `rled` = `apps/worker/src/reconcile/ledger.ts`;
  `wq` = `apps/web/src/lib/reconciliation/queries.ts`; `page` = `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`;
  `ledger_mig` = `packages/db/migrations/20261023120000_recovery_ledger.sql`.

---

## 0. Summary

**The defect.** A payer that pays interest on a claim sends it twice in the 835, as the implementation guide asks: the
claim's AMT I (the amount of interest that claim earned, which is information only) and a PLB L6 at the end of the
check (the money). The reconcile credits both, so the practice's interest figure, the totals tile and the ROI
statement's "Interest, net" show twice what the payer paid. The author's probe reproduces it on the guide's own shape:
1080 cents credited for 540 cents of cash. Two more paths over-credit the same way: one PLB L6 split again over its
lines at a later reconcile (840 cents credited for 540 of cash, probe R), and an AMT I with no money behind it at all
(credited although the check excludes it). Recovered is never touched, because interest is never in recovered.

**What this PR does.**
- The PLB L6 is the interest. An interest entry's evidence is always the PLB L6 that paid it; the claim's AMT I only
  says which claim (and so which case lines) the money is for. Interest that appears only once as money (an L6 with no
  AMT I) is credited. An AMT I with no L6 behind it is shown beside the line as reported, and counted nowhere.
- A PLB L6 that names no claim (payers' guides list L6 among the codes whose reference need not name one) is split
  over that remittance's claims by their AMT I, never past what each claim reported. Today such an L6 is never
  credited.
- One PLB L6 is never credited past what it paid, however many reconciles run, in code and in Postgres.
- A PLB L6 that takes interest back (a positive amount) becomes a negative interest entry against the lines that hold
  that claim's interest, never below zero on a line. Today it is dropped.
- N1: an entry is flagged allocated only when its amount was split between two or more positive parts.
- `ledger_match.seq`: the order the ledger made its matches in. Every reader orders by it instead of by
  `matched_at`, which every match of one reconcile shares, and the match's random ID.
- An index on `claim.superseded_by_claim_id` for the correction chain's lookups.

**Migration: yes, one** (section 5). It changes a CHECK on `ledger_match` and one on `ledger_entry`, adds
`ledger_match.seq`, recreates `ledger_match_rules()`, adds one trigger function on `ledger_entry`, and adds two
indexes. It regenerates `docs/product/domain-model.md` and `packages/db/functions`.

**One pull request** for all four handed-over items (section 3.5). The PR 15b case close ("payer corrected; balance is
the patient's") is not a ledger item and stays with PR 8's case schema, as LANES.md already places it.

**The founder decides two things** (section 10): the ledger freeze exception, whose exact scope section 10 lists, and
the domain model's approval by its SHA-256 on the pull request's latest commit. Nothing else here is the founder's.

---

## 1. What the code does today (cited)

### 1.1 Where interest comes from

- **AMT I.** The parser keeps the first `AMT*I` of a claim (`apps/worker/src/parse/plan.ts:351`), and the loader writes
  it to `claim.interest_cents` (`apps/worker/src/parse/loader.ts:401-412`; column added at `ledger_mig:58`, insert
  grant `:59`). It is signed as the segment carries it, so a reversal's AMT I is negative.
- **PLB L6.** `plbCategory('L6')` is `'interest'` (`packages/edi835/src/transaction.ts:97-98`). The loader writes one
  `provider_adjustment` row per PLB pair with the segment's sign: a negative amount pays the provider, a positive one
  takes money back (`loader.ts:496-507`; `20261016120000_remittances.sql:205-223`). `reference` is PLB03-2 and may be
  null.
- **Balancing (ADR 0021).** A claim balances as `CLP03 − every CAS − CLP04 = 0`, with no AMT I term, and the
  transaction as `ΣCLP04 − ΣPLB = BPR02` (`packages/edi835/src/balance.ts:5,9`). So the L6 is inside the check amount
  and AMT I is outside it. LED-16's `two-lines-adjusted.835` carries AMT I 5.40 with no L6, and its BPR02 is 54.00:
  the 5.40 is not in the check.
- **ERA exports** carry no interest: `interestCents` is null and no PLB is read (`apps/worker/src/parse/era/normalize.ts:527,599-606`).

### 1.2 How the reconcile credits it

`reconcileRemittances` (`rem:932-947`) runs, in one transaction under the practice's ledger lock (`pass.ts:39-41`):
`matchClaims`, `recoupReversals`, `providerAdjustments` (`rem:778-842`) and `claimInterest` (`rem:845-860`).

- **The L6 branch** (`rem:836-841`): the L6 is credited only when its reference is not null (`rem:791`). The reference
  is hashed with the practice's key and compared with the claim control number hash of every claim a case line has a
  standing approved match to (`namedLines(..., approvedOnly = true)`, `rem:769-775`). The interest is the L6 negated
  (`rem:838`).
- **The AMT I branch** (`rem:845-860`): every claim with a standing approved match and `interest_cents > 0` is
  credited for the lines it approved.
- **Both call `recordInterest`** (`rem:863-910`). It splits the amount over the named lines by `approvedRemaining`
  (`allocateByWeight`, `rem:877`), sets `allocated = named.length > 1` (`rem:878`), and skips a line when
  `everMatched('interest', evidence.id, line)` (`rem:881`, `:912-914`). The only guard against a second credit is that
  check, keyed by the evidence's ID, and the database's `ledger_match_standing` index, keyed the same way
  (`kind, evidence_id, service_line_id`, `ledger_mig:171`).
- **The matches it writes.** An AMT I credit is an interest match carrying `claim_id`, an L6 credit one carrying
  `provider_adjustment_id` (`rem:886`). The database requires exactly one of the two for interest
  (`ledger_match_evidence`'s ELSE branch, `ledger_mig:160`), and accepts either when the claim's `interest_cents > 0`
  or the L6 is of the match's remittance (`ledger_match_rules`, `ledger_mig:367-371`).

### 1.3 The three ways one payment of interest is credited more than once

The author's probe `scratchpad/probes/author/interest-author-probe.mts`, run on its own database migrated from empty
(`tp_design_interest_2`, the main checkout's code at e908c21; dropped afterwards), on LED-16's two-line case (case
lines 97110 and 97110-59, approved 24.00 and 30.00 by the correction):

```
A AMT I + L6 naming claim: interest [240 provider_adjustment allocated, 300 provider_adjustment allocated,
  240 claim allocated, 300 claim allocated] SUM=1080 | L6 cash 540 | 6 matches, 1 matched_at
R after R1 (L6 -5.40 alone; line 2 weight 0): interest [540 provider_adjustment allocated, line 1] SUM=540
R after R3 (line 2 approved later): interest [540 line 1, 300 line 2] SUM=840 | L6 cash 540
R after a third reconcile: SUM=840
```

1. **AMT I and the L6 for the same money (probe A).** The implementation guide's own shape, AMT I 5.40 on the
   correction and `PLB*…*L6:SYNCCNLED160004*-5.40` naming it, BPR02 59.40: 1080 cents credited against 540 of cash.
   The two credits have different evidence IDs (the claim's and the adjustment's), so neither `everMatched` nor
   `ledger_match_standing` sees the second. The database scout's probes add the same result for an L6 of -6.00 beside
   AMT I 5.40 (1140 against 600) and for an AMT I followed by an L6 in a later remittance (1080).
2. **One L6 split again at a later reconcile (probe R; new in this design).** R1 raises line 1's payment and line 2's
   allowed amount but not its payment, so line 2's match is approved with no entry and its weight is 0; the whole 5.40
   goes to line 1. A month later R3 pays line 2 more, so line 2 has a weight. The next reconcile splits the same L6
   again (240 and 300), skips line 1 (already matched) and credits line 2 its 300: 840 cents from 540 of cash. Nothing
   bounds an L6's interest entries by the L6's amount: the recoupment branch subtracts what its WO already took
   (`rem:804-805`), and the interest branch has no such step.
3. **AMT I with no money behind it (probe D, the database scout's).** LED-16's fixture as it stands: AMT I 5.40, no
   L6, BPR02 54.00. 540 cents are credited as interest the payer paid, though the check excludes it.

### 1.4 What else today's interest handling drops or misreads

- **An L6 with no reference** is never credited (`rem:791`), even when the remittance's AMT I says which claim it pays.
  The database scout's probe B (AMT I plus an L6 with no reference) credits 540 through AMT I and never matches the L6.
- **An L6 that takes interest back** (positive amount) is dropped: `negateCents` makes it zero or less and
  `recordInterest` returns (`rem:838`, `:874`). A negative interest entry would be refused anyway
  (`ledger_entry_sign`, `ledger_mig:207-214`, interest `> 0`). The database scout's probe H: 540 stays credited after
  the payer took it back.
- **A reversal's negative AMT I** is ignored (`interest_cents > 0`, `rem:853` and `ledger_mig:370`), so a reversal and
  correction whose AMT I net to zero credit the correction's AMT I again as new money.
- **N1** (payment-engine review of #51, `approval-summaries/lane-b-pr15b-review-payment-engine.md:57-58`):
  `allocated = named.length > 1` is true when only one line had a weight above zero and took the whole amount.
  Probe R's first entry: one line, 540 of 540, flagged allocated, shown as "(allocated pro rata)" (`page:115`).

### 1.5 What the database checks today

- `ledger_entry_rules` (latest body `20261027090000:50`; `packages/db/functions/ledger_entry_rules.sql`) requires an
  interest entry to come from a standing interest match and carry its evidence and its `allocated` flag. Nothing bounds
  an interest entry by its evidence: `ledger_entry_within_evidence` covers posted and deposited only, and
  `ledger_entry_within_line` approved, posted, deposited and adjustments (`20261027090000:147-271`). The database
  scout's probe2: an interest entry of 9,999,999 cents on a 540-cent L6, written as the job, was accepted.
- An adjustment of an interest entry is already held between zero and the entry's own amount
  (`ledger_entry_within_line.sql`, the `adjusted` branch), so a person can only lower interest, never raise it.

### 1.6 Order within one reconcile

`ledger_match_rules` sets `matched_at := now()` (`ledger_mig:339`), the transaction's start, so every match of one
reconcile has the same `matched_at` (probe A: 6 matches, 1 `matched_at`). Readers break the tie by the match's random
UUID: `ledgerMatches` (`rled:99-104`, `ORDER BY m.matched_at, m.id`) and the web's line and cash lists (`wq:482`,
`:485`). `CHAIN_ORDER` (`rem:366-375`) reconstructs the reconcile's order with five tie-breaks, and its order feeds the
money: `reversalRule` reads the chain (`rem:488`). 15b's builders fixed the in-pass order and recorded the stored order
as needing a column (the same review, `:24` and `:64-68`).

### 1.7 The correction chain's lookups

`claim.superseded_by_claim_id` (`20261016120000_remittances.sql:123`) has no index; the claim indexes are at `:134-136`.
Three lookups go from a correction to the claims it supersedes, each a sequential scan of `claim` (the database scout's
EXPLAIN): the recursive `named` CTE and the `corrects_claim_id` subquery in `claimLines` (`rem:250-260`), and the
adjusted-payments query (`apps/worker/src/reconcile/unmatched.ts:187`). The web's joins at
`apps/web/src/lib/remittances/queries.ts:327,521` go the other way, through `claim`'s primary key, and need nothing.

### 1.8 The freeze

reconciliation-001.md, "Ledger semantics" (`:464-469`): no migration alters, or adds a trigger or policy to,
`ledger_entry`, `ledger_match`, `posting_row`, `eft_row` or `roi_statement`; the stage CHECK keeps its seven values;
recovered counts only posted or deposited; LED-01 to LED-11 and the ledger oracle pass unchanged (15b appended
LED-14 to LED-17); `packages/ledger/src` takes additions only, and the matching rules are untouched. The guard test it
names (planned with PR 8 at `:172`) was never built, so the exception in section 10, read by the reviewers, is the
only gate. PR 8 still builds the guard; it lists this migration as granted (section 14).

---

## 2. What the 835 implementation guide says

x12.org does not resolve from this machine, so the guide's interpretations were read through search summaries, not
verbatim. They agree with each other, with ADR 0021's balancing and with synth variant V07, which the parser team
built to the guide (`packages/synth/src/cases/variants.ts:169-178`: AMT I 4.11 on the claim and `L6:<its CLP07>*-4.11`,
BPR02 709.96 = 611.35 + 94.50 + 4.11).

- **RFI 1705** (5010 835 interest payment): net interest under a contract is reported at the PLB with code L6; the
  claim-specific amount goes in the claim's AMT with qualifier I; AMT segments do not take part in balancing. Interest
  the patient bears goes in CAS instead, with no AMT and no PLB.
- **RFI 2202** (PLB L6 interest): an AMT I needs its supporting PLB L6 in the same remittance, and an L6 its AMT I; a
  remittance carrying one without the other is not compliant.
- **RFI 1324** (interest PLB in a 5010 835): when a reversal and a correction carry AMT I that nets to zero, no
  payment moves and no L6 is sent.
- **RFI 2184** (quoting RFI 2123): the L6 is the sum of the remittance's AMT I amounts, except when that sum is zero.
- **What PLB03-2 carries for L6** is not fixed: payers' companion guides say the reference usually names the claim,
  with L6 among the stated exceptions (UnitedHealthcare's PLB guide, as summarised). So an L6 may name a claim, name
  something else, or carry nothing.

**What follows.**
1. The PLB L6 is the money: it is in BPR02, and the bank deposit proves BPR02. AMT I is the payer's statement of how
   much of that money each claim earned.
2. A remittance's interest is the net of its L6s. When the payer names a claim in the L6, that is the claim; when it
   does not, the remittance's AMT I amounts say whose it is.
3. An AMT I with no L6 in its check is not money in that check. Under the guide it should not happen; when it does,
   it is either paid later (RFI 2202's case, a later remittance's L6) or not paid at all.
4. A reversal's negative AMT I and a positive L6 are interest taken back; netting reversal and correction to zero
   moves nothing.

---

## 3. Options, and the one recommended

Each choice below is judged on the founder's standing rule (accuracy first, then quality, user experience, security and
privacy, compliance, reliability, cost to serve, dispute success, time to value, resilience to change, AI safety,
maintainability and business readiness), never on build effort.

### 3.1 Which record is the interest

| Option | What it gives | Why not |
|---|---|---|
| (a) AMT I is the interest; an L6 naming a claim with AMT I is skipped | Stops probe A | Counts money that is not in the check (probe D, 540 credited against a BPR02 that excludes it). Still needs L6 alone (PAR-18's shape) and still misses the L6 that names no claim. Takes the payer's statement over the payer's payment |
| (b) Keep crediting both, and refuse a second interest match per claim and line (the database scout's `ledger_match_interest_once` unique index on `claim_id, service_line_id[, remittance_id]`) | Stops probe A in Postgres | Does not stop probe R (one L6 split twice) or probe D. Keyed per remittance it allows E's second credit; keyed without the remittance it refuses a real second payment of interest. The application must still decide which record wins, and an `ON CONFLICT` on a second unique index raises instead of being absorbed (`rled:139-150`) |
| **(c) The L6 is the interest; AMT I says whose it is (recommended)** | Every interest figure is money in a check. One rule covers the L6 that names a claim, the L6 that names none, the L6 with no AMT I, the AMT I with no L6, a reversal and correction that net to zero, and interest taken back. Each entry's evidence is the payment row itself, so the trace runs from the figure to the L6, the check and the deposit | Changes the matching rule, so it needs the freeze exception (section 10) |
| (d) Credit the smaller of AMT I and the L6, per claim | Never above either record | Needs the same attribution as (c) and then drops money the payer paid and named (probe F: the L6 pays 6.00 for the claim, AMT I says 5.40) |

### 3.2 An AMT I with no L6 in its check

| Option | Why |
|---|---|
| (a) Credit it, as today | It is not in the check (ADR 0021's balancing; RFI 2202). When the payer pays it later by L6 (RFI 2202's case), it is credited twice unless the two are linked by hand |
| **(b) Count it nowhere and show it beside the line as interest the claim reports (recommended)** | Interest counts as money arrives. The later L6 that pays it is credited then, once. Nothing is hidden: the line shows the reported amount and what was paid |
| (c) Hold it for a person to decide | A person cannot make money appear in a check; the check already decides. It adds a queue for a payer's formatting fault |

### 3.3 A PLB L6 that takes interest back

| Option | Why |
|---|---|
| (a) Drop it, as today | "Interest, net" on the ROI statement (`statement-html.ts:114`; PRD 13 and 20, "recovered principal and interest, net") stays above what the practice kept |
| (b) List it for a person, who lowers the interest entry with the ledger adjustment | The figure is wrong until someone acts. The adjustment's evidence is the entry, not the L6, so the trace to the money is lost. Needs a new list and a new task |
| **(c) A negative interest entry whose evidence is the L6, against the lines holding that claim's interest (recommended)** | Right at once, traced to the money, bounded in Postgres (never past the L6, never below zero on a line). It changes `ledger_entry_sign` for interest and PRD 13's word "positive", so the exception names both |

### 3.4 The order of matches within one reconcile

| Option | Why |
|---|---|
| **(a) `ledger_match.seq bigint GENERATED ALWAYS AS IDENTITY`, existing rows numbered in their stored order (recommended)** | Matches are inserted under the practice's ledger lock (`lockLedger`, `rled:16-18`; taken by `pass.ts:39` and `manual.ts:48`), so `seq` is the order the ledger made them, within a reconcile and across reconciles, with no ties. It mirrors `ledger_entry.seq` (`ledger_mig:177`). Every stored row is synthetic (ADR 0067:253-254), so numbering existing rows in their stored order changes nothing a customer holds |
| (b) The same column, existing rows renumbered in today's reading order | The migration would set `app.practice_ids` to every practice (as `20261101090000:49-51` did for `practice`) and switch `ledger_match_rules` off for one UPDATE (as `20261106090000:101` did for `screening_run`): two exceptions to the ledger's own protections, for development rows that are regenerated |
| (c) `matched_at := clock_timestamp()` | Ties become unlikely, not impossible, and `matched_at` stops meaning the reconcile's time |
| (d) Keep `CHAIN_ORDER`'s five tie-breaks | The defect: two readers order one reconcile differently (`rled:103` by UUID) |

### 3.5 One pull request or several

**One pull request (recommended)** holds the interest rule, N1, `seq` and the index:
- N1 is a line of `recordInterest`, which this PR rewrites.
- `seq` must be added to `ledger_match_rules`' immutability tuple, and this PR recreates that function anyway.
- All three ledger items need the same freeze exception, and each schema PR takes one place in Lane A's serial chain
  and one founder approval of the domain model's SHA-256 (LANES.md rule 2). Two PRs would recreate
  `ledger_match_rules` twice and ask the founder twice.
- The index is on `claim`, which is not a frozen table, and is the safest part of the bundle.

**PR 15b's stored case close** ("payer corrected; balance is the patient's") is not a ledger item: it is DDL on `case`
and `case_line`, `case_rules()` and `@tp/triage deriveCaseState`, needs none of this exception, and LANES.md already
places it with PR 8's case schema beside #11. It stays there.

---

## 4. Decisions

**D1. The PLB L6 is the interest; AMT I attributes it.** An interest entry is written only from a PLB L6 of category
`interest` in a loaded remittance (never from an AMT I alone), positive for interest the L6 paid (its `amount_cents`
negative) and negative for interest it took back (positive). The claim's AMT I decides which claim, and so which case
lines, an L6 that names no claim is for, and caps how much of it each claim takes.

**D2. Attribution, per remittance.** The reconcile reads the practice's loaded remittances in
`bpr16_date, created_at` order and, within each, its L6s in `position` order. For remittance R:

1. **An L6 that names a claim.** Its PLB03-2, hashed with the practice's key as `claim.payer_claim_control_number`
   (as `rem:799` does today), equals the hash of one or more claims of the practice. Its whole amount is for those
   claims, in R or in any other remittance (RFI 2202's later payment). A paid L6 goes to the case lines that have a
   standing approved claim match to one of those claims (`namedLines(..., approvedOnly = true)`, as today); a
   take-back goes to the case lines that hold interest from matches naming one of those claims (D3).
2. **The L6s that name no claim** (no reference, or a reference whose hash is no claim's) are netted into R's pool, P.
   - P > 0 (paid): each claim C of R with AMT I > 0 can take `e(C) = max(0, AMT_I(C) − the paid L6s of R that name
     C)`. The pool's attributable part is `T = min(P, Σ e)`, split over the claims by `allocateByWeight(T, e)`; with
     T at most Σe, largest remainder keeps every part at most its claim's e (each part is the floor of an exact share
     below e, plus at most one cent where that floor is below e). `P − T` is attributed to no claim and counted
     nowhere.
   - P < 0 (taken back): each reversal V of R with AMT I < 0 and `reversal_of_claim_id` X can give back
     `e(V) = max(0, −AMT_I(V) − the take-back L6s of R that name V)`, from the lines that hold interest from matches
     naming X. T and the split as above.
   - Each claim's part is drawn from the pool's L6s of P's sign, in position order, so every entry names the one L6
     whose money it is.
3. **Lines.** A claim's (or a named L6's) part is split over its lines by `allocateByWeight`:
   - paid interest by each line's `approvedRemaining` (`rled:253`), unchanged from ADR 0067;
   - interest taken back by what each line holds from the claim (its interest entries of matches naming it, net of
     their corrections), so no line gives back more than it holds.
   A line whose weight is 0 takes nothing; when every weight is 0 the part is not credited now (ADR 0067:234), and a
   later reconcile credits it once a line has a weight.
4. **Once.** What is left of an L6 for a claim is its part less the interest entries already written from matches
   carrying both (gross, reversed ones included, as the WO branch counts `takenBefore`, `rem:804-805`). A line already
   matched to the L6, standing or reversed, is never matched to it again (`everMatched`, now keyed by the L6). So a
   second reconcile writes nothing, and a later reconcile never splits an L6 again past what it paid (probe R: 540,
   not 840). When two claim parts of one L6 reach the same line, the first in R's claim order takes the line and the
   second's split leaves it out (an understatement of at most that share, for an edge no fixture shows).

**D3. Interest taken back.** A take-back is written as a negative interest entry whose evidence is the positive L6 and
whose match names the claim X whose interest it takes back (the reversal's original, or the named claim). It is
capped by what each line holds from X, so a line's interest never goes below zero. It does not reopen the case or
notify anyone: interest is never in recovered, and the line's stage does not move (`ledger_line_stage` reads no
interest). The principal the reversal takes back is still recouped as today.

**D4. What an interest match and entry carry.** Every new interest match carries both `provider_adjustment_id` (the L6)
and `claim_id` (the claim the money is for: the line's approved claim with the L6's hash, R's AMT I claim, or X), with
`remittance_id` the L6's remittance. Its `evidence_id` is then the L6 (`coalesce(posting_row_id, eft_row_id,
provider_adjustment_id, claim_id)`, `ledger_mig:153`), so `ledger_match_standing` keeps one standing match per L6 and
line, and `ledger_entry_rules` needs no change: the entry carries the match's evidence, the L6. The worker's
`insertMatch` passes both IDs.

**D5. Postgres holds the bounds** (section 5): a new interest match must carry an L6 of its remittance and a claim the
line has a standing approved match to; an L6's interest entries never sum past what it paid or took back; an interest
entry has the sign of its L6; a line's interest, net of corrections and take-backs, never goes below zero. The hash
link from PLB03-2 to the claim cannot be checked in SQL (the key is the practice's, in the application), so the
attribution is the worker's and Postgres bounds its amounts. The worker checks every one of these bounds before it
writes (a take-back's lines are those that hold the claim's interest and still have a standing approved match to it;
what it takes is at most what each holds), because one refusal rolls the whole reconcile of the practice back: a
refusal is a defect caught loudly, never a path the job relies on.

**D6. N1.** `allocated` is true when the entry's amount is one of two or more positive parts of a split: two or more
claims took parts of a pooled L6, or two or more lines took parts of one claim's part. One line taking the whole is not
allocated. `ledger_match_allocated` and `ledger_entry_allocated` are unchanged.

**D7. `ledger_match.seq`.** As 3.4 (a). `ledgerMatches` (`rled:103`), `CHAIN_ORDER` (`rem:371-375`) and the web's
lists (`wq:482`, `:485`) order by `seq`. `matched_at` stays the transaction's time and is still shown.

**D8. `claim_by_superseded`.** `CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE
superseded_by_claim_id IS NOT NULL`, the twin of `claim_by_reversed` (`20261016120000_remittances.sql:136`).

**D9. What does not change.** Interest is never in recovered. The weights of paid interest (`approvedRemaining`). The
dropped interest of a line with nothing remaining (ADR 0067:234). WO recoupments, reversal take-backs and every
principal amount. `LEDGER_STAGES`, the seven entry types and the stage CHECK. The proof cap. `roi_statement` and its
rules. A person-reversed match is never made again by the job. ERA exports carry no interest. The parser and loader.

**D10. Rows written before this change** are development rows (ADR 0067:253-254: no customer data exists, and
development data is regenerated). They are not converted: their AMT I interest matches (claim only) and L6 matches
(L6 only) stay valid under the relaxed CHECK, and the new rules apply to new rows only.

**D11. The deploy window and a rollback.** Migrations run before traffic moves (ADR 0049). Until the new worker takes
over, the previous worker's reconcile of a practice with interest to credit is refused by the new
`ledger_match_rules` (its L6-only or claim-only match), so that reconcile's transaction rolls back whole and writes
nothing twice; pg-boss retries it, and the new worker credits the interest once. A reconcile with no interest to
credit is unaffected (`seq` fills itself). On a rollback to the previous image the same holds: its reconciles with
interest due fail closed and raise the job's third-attempt alert until the image rolls forward. Refusing loudly is
chosen over skipping silently (a trigger returning NULL), because a silent skip would also hide a defect in new code.


### 4.1 Worked cases (cents; LED-16's two lines, weights 2400 and 3000 unless stated)

| Case | Stored | Today | After |
|---|---|---|---|
| A, the guide's pair | AMT I 540 on the correction C; L6 -540 naming C | 1080 (two matches per line) | 240 + 300 from the L6, allocated |
| B, an L6 naming nothing | AMT I 540 on C; L6 -540, no reference | 540 from AMT I; the L6 never matched | 240 + 300 from the L6 (pool 540, e(C) 540), allocated |
| C, an L6 alone | L6 -540 naming C | 540 | 540, the same split |
| D, AMT I alone | AMT I 540; no L6; BPR02 excludes it | 540 | 0; the line shows "reports 5.40 of interest (AMT I)" |
| E, AMT I, then a later L6 | D, then a later remittance's L6 -540 naming C | 1080 | 540, dated by the later remittance |
| F, the L6 above AMT I | AMT I 540; L6 -600 naming C | 1140 | 267 + 333 (the L6's money; the payer named the claim) |
| F', the same naming nothing | AMT I 540; L6 -600, no reference | 540 from AMT I | 540 (T = min(600, 540)); 60 attributed to no claim |
| Two claims, one pool | AMT I 540 on C and 200 on another patient's claim K; L6 -740, no reference | 540 from AMT I | 240 + 300 (C's 540), allocated; K's 200 on no case line |
| A short pool | as above with L6 -500 | 540 from AMT I | C 365 (largest remainder of 500 by 540:200), split 162 + 203; K 135 |
| R, approvals at different times | L6 -540 naming C1 when only line 1 has a weight; later line 2 gains one | 540, then 840 | 540 on line 1, not allocated; nothing more, ever |
| Net zero (RFI 1324) | after A: C reversed (AMT I -540) and corrected again paying more (AMT I 540); no L6 | the new correction's 540 again | nothing new |
| Taken back | after A: C reversed alone (AMT I -540); L6 +540, no reference | 1080 stays (A's) | -240 and -300 from the take-back L6; net 0 |
| A take-back past what a line holds | after A: L6 +600 naming C | 1080 stays | -240 and -300 (what the lines hold from C); the other 60 taken from no case line |

---

## 5. Schema: one migration, `<ts>_ledger_interest_once.sql`

**Its place in the chain.** `<ts>` is later than every migration on `claude/build-platform` when the branch is cut:
after #42's `20261107090000_mail_streams.sql`, and after SS-01's and SUITE-CAP-1's migrations if they merge first.
It recreates one shared function, `ledger_match_rules()`, on the body `ledger_mig:314-374` left: no later migration
redefines it, and #42 leaves it byte for byte the same (`packages/db/functions/ledger_match_rules.sql` hashes alike on
e908c21 and on #42's 098636e3, as do the functions it calls: `app_actor_id`, `app_actor_is_person`,
`app_actor_permitted`, `practice_in_scope`). #42 changes only the header of `set_updated_at.sql` among the files this
item regenerates. Before writing the migration, the builder diffs `ledger_match_rules` on the then-latest base; if
SUITE-CAP-1 has changed it (it is not expected to), this body is rebuilt on that one.

### 5.1 Objects

| # | Object | Change | On which predecessor | Notes |
|---|---|---|---|---|
| 1 | `ledger_match_evidence` (CHECK) | DROP and ADD: the interest branch takes one or both of `claim_id` and `provider_adjustment_id`; recoupment keeps exactly one | `ledger_mig:156-162` | Validates against every stored row (old interest rows carry one) |
| 2 | `ledger_match.seq` | `ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY` | new | Existing rows are numbered in their stored order (section 3.4) |
| 3 | `ledger_match_by_seq` | `CREATE UNIQUE INDEX ON ledger_match (practice_id, seq)` | new | The readers' `WHERE practice_id = $1 ORDER BY seq` |
| 4 | `ledger_entry_sign` (CHECK) | DROP and ADD: `interest` is `<> 0` (was `> 0`) | `ledger_mig:207-214` | Every stored interest entry is positive, so it validates |
| 5 | `claim_by_superseded` | `CREATE INDEX ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL` | new | The twin of `claim_by_reversed` |
| 6 | `ledger_match_rules()` | `CREATE OR REPLACE`: `seq` in the immutability tuple; the interest branch of D4 and D5 | `ledger_mig:314-374` (unchanged on #42) | The trigger `ledger_match_rules` (`ledger_mig:375`) is unchanged |
| 7 | `ledger_entry_within_interest()` and its trigger | `CREATE FUNCTION`; `CREATE TRIGGER ledger_entry_within_interest BEFORE INSERT ON ledger_entry FOR EACH ROW` | new | A new function rather than a branch in `ledger_entry_within_evidence` or `_within_line`, which SUITE-CAP-1 may recreate. Row triggers fire in name order, so it runs after `ledger_entry_rules` has checked the match and `ledger_entry_within_evidence`, and before `ledger_entry_within_line` |

**No new table and no policy change.** `ledger_match`, `ledger_entry` and `claim` keep ENABLE and FORCE ROW LEVEL
SECURITY and their tenant policies (`ledger_mig:725-733`; `20261016120000_remittances.sql:430-434` for `claim`); the catalog
and cross-tenant tests read the same shape. The PHI registry is unchanged.

**Grants exactly as before.** `tp_app` keeps SELECT on `ledger_match` (table-wide, so it reads `seq`), its INSERT
column list (`ledger_mig:755`, which leaves `seq` out; the identity fills it, and `GENERATED ALWAYS` refuses a value
anyway) and UPDATE on `reversed_by` and `reversal_reason` only. No role is granted anything on the new function: a
trigger function is called by the trigger, not by a role. Both functions are `REVOKE ALL ... FROM PUBLIC` (a
`CREATE OR REPLACE` keeps the old ACL; the migration revokes again so the file states it).

**Both functions** are `LANGUAGE plpgsql`, `SECURITY INVOKER` like every ledger trigger, `SET search_path =
pg_catalog, public, pg_temp`, owned by `tp_owner` (the migration runs as `SET LOCAL ROLE tp_owner`, and the runner
checks ownership after it, `packages/db/src/migrate.ts:116-126`). Neither sets `app.practice_ids`, so
`REVIEWED_SCOPE_FUNCTIONS` and every catalog list are unchanged. Each returns early when `practice_in_scope()` is false,
as `ledger_entry_rules` does; the tenant policy's WITH CHECK refuses such a row anyway.

**Locks.** Object 2 rewrites `ledger_match` and objects 1 and 4 validate under ACCESS EXCLUSIVE on `ledger_match` and
`ledger_entry`; object 5 holds SHARE on `claim` while it builds, so a remittance load waits for it. At today's sizes
(development rows only) each is well under a second. The migration's transaction holds them together, so a reconcile
or a load during the deploy waits and then proceeds.

**Lock taken by the new trigger.** `pg_advisory_xact_lock(hashtextextended('ledger:' || practice_id, 0))`, the key
`lockLedger` already holds in every writer of the ledger (`pass.ts:39`; `manual.ts:48` for every person's ledger
action). Taking it again in the same transaction adds no lock slot, and a writer that skipped `lockLedger` is
serialised behind the others, so two inserts can never both pass the per-L6 bound. It adds no per-row advisory lock,
the shape SUITE-CAP-1 is removing from `line_status_rules()`.

### 5.2 With the previous image running, and on rollback

D11: the previous worker's reconcile that would write an interest match is refused by object 6, so it rolls back whole
and is retried; everything else it does is unchanged (its INSERTs leave `seq` to the identity; its reads order by
`matched_at, id` as before). The previous web reads the new rows (a match with both IDs reads as "PLB L6 interest"; a
negative interest entry shows its amount). A rollback of the image keeps the schema, and the previous worker fails
closed in the same way until the image rolls forward. Nothing is ever written twice.

### 5.3 The SQL

Prototyped on a database migrated from empty through #42's migration, after the current code had written interest the
old way (section 8.0 quotes the run). The builder writes the file header in the house style (what, why, the shared
function and its body, the deploy window, "Runs as tp_owner").

```sql
-- 1. An interest match carries the PLB L6 that pays or takes back the interest and the claim it is for; rows written
--    before docs/adr/0084 carry one of the two.
ALTER TABLE ledger_match DROP CONSTRAINT ledger_match_evidence;
ALTER TABLE ledger_match ADD CONSTRAINT ledger_match_evidence CHECK (
  CASE kind
    WHEN 'claim' THEN claim_id IS NOT NULL AND num_nonnulls(posting_row_id, eft_row_id, provider_adjustment_id, level) = 0 AND service_line_id IS NOT NULL AND outcome IS NOT NULL
    WHEN 'posting' THEN posting_row_id IS NOT NULL AND num_nonnulls(eft_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND level IN ('claim', 'check')
      AND (claim_id IS NOT NULL) = (level = 'claim')
    WHEN 'deposit' THEN eft_row_id IS NOT NULL AND num_nonnulls(claim_id, posting_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND level IN ('check', 'batch')
    WHEN 'interest' THEN num_nonnulls(claim_id, provider_adjustment_id) >= 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL
    ELSE num_nonnulls(claim_id, provider_adjustment_id) = 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL
  END
);

-- 2. The order the ledger made its matches in: under the practice's ledger lock, the order of insertion. Rows written
--    before this migration are numbered in their stored order (all synthetic; docs/adr/0067).
ALTER TABLE ledger_match ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX ledger_match_by_seq ON ledger_match (practice_id, seq);

-- 3. Interest a PLB L6 takes back is a negative interest entry.
ALTER TABLE ledger_entry DROP CONSTRAINT ledger_entry_sign;
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_sign CHECK (
  CASE stage
    WHEN 'recouped' THEN amount_cents < 0
    WHEN 'reversed' THEN amount_cents <> 0
    WHEN 'adjusted' THEN amount_cents <> 0
    WHEN 'interest' THEN amount_cents <> 0
    ELSE amount_cents > 0
  END
);

-- 4. The claims a correction supersedes, found from the correction (claimLines, the adjusted payments).
CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;

-- 5. ledger_match_rules on the body of 20261023120000 (unchanged since): seq never changes either, and interest is
--    matched from a PLB L6 of its remittance, for a claim the line's standing approval names.
CREATE OR REPLACE FUNCTION ledger_match_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a match is never deleted; it is reversed' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.seq, NEW.kind, NEW.claim_id, NEW.posting_row_id, NEW.eft_row_id, NEW.provider_adjustment_id, NEW.remittance_id, NEW.service_line_id, NEW.outcome, NEW.level,
        NEW.allocated, NEW.matched_by, NEW.matched_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.seq, OLD.kind, OLD.claim_id, OLD.posting_row_id, OLD.eft_row_id, OLD.provider_adjustment_id, OLD.remittance_id, OLD.service_line_id, OLD.outcome, OLD.level,
        OLD.allocated, OLD.matched_by, OLD.matched_at, OLD.created_at) THEN
      RAISE EXCEPTION 'a match never changes; it is reversed' USING ERRCODE = 'check_violation';
    END IF;
    -- (unchanged to the end of the UPDATE branch, the standing check, the actor checks, the remittance and service
    -- line checks, and the claim, posting, deposit and recoupment branches: ledger_mig:324-366, copied verbatim)
  ELSIF NEW.kind = 'interest' AND (NEW.provider_adjustment_id IS NULL OR NEW.claim_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'interest')) THEN
    RAISE EXCEPTION 'interest is matched from a PLB L6 of its remittance, for a claim' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND NOT EXISTS (
          SELECT 1 FROM ledger_match c WHERE c.practice_id = NEW.practice_id AND c.kind = 'claim' AND c.claim_id = NEW.claim_id AND c.service_line_id = NEW.service_line_id
             AND c.outcome = 'approved' AND c.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'interest reaches a line only through a claim the line''s standing approval names' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ledger_match_rules() FROM PUBLIC;

-- 6. A PLB L6's interest entries never sum past what it paid or took back, each has the L6's sign, and a line's
--    interest, net of corrections and take-backs, never goes below zero.
CREATE FUNCTION ledger_entry_within_interest() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  root ledger_entry;
  moved bigint;
  so_far bigint;
  line_net bigint;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  root := NEW;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO root FROM ledger_entry t WHERE t.id = NEW.evidence_id;
    IF FOUND AND root.stage = 'adjusted' THEN
      SELECT * INTO root FROM ledger_entry t WHERE t.id = root.evidence_id;
    END IF;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
  END IF;
  IF root.stage <> 'interest' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));
  IF NEW.stage = 'interest' THEN
    IF NEW.evidence_kind <> 'provider_adjustment' THEN
      RAISE EXCEPTION 'interest is credited from the PLB L6 that paid it' USING ERRCODE = 'check_violation';
    END IF;
    SELECT -a.amount_cents INTO moved FROM provider_adjustment a WHERE a.id = NEW.evidence_id AND a.practice_id = NEW.practice_id AND a.category = 'interest';
    IF moved IS NULL OR sign(NEW.amount_cents) <> sign(moved) THEN
      RAISE EXCEPTION 'an interest entry is positive for interest a PLB L6 paid and negative for interest it took back' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(sum(e.amount_cents), 0) INTO so_far FROM ledger_entry e
     WHERE e.practice_id = NEW.practice_id AND e.evidence_id = NEW.evidence_id AND e.stage = 'interest';
    IF abs(so_far + NEW.amount_cents) > abs(moved) THEN
      RAISE EXCEPTION 'the interest entries of a PLB L6 never sum past what it paid or took back' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.amount_cents < 0 AND NEW.service_line_id IS NOT NULL THEN
    SELECT coalesce(sum(x.amount_cents), 0) + NEW.amount_cents INTO line_net FROM (
      SELECT e.amount_cents FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.service_line_id = NEW.service_line_id AND e.stage = 'interest'
      UNION ALL
      SELECT c.amount_cents FROM ledger_entry e JOIN ledger_entry c ON c.practice_id = e.practice_id AND c.evidence_id = e.id AND c.stage IN ('reversed', 'adjusted')
       WHERE e.practice_id = NEW.practice_id AND e.service_line_id = NEW.service_line_id AND e.stage = 'interest'
      UNION ALL
      SELECT u.amount_cents FROM ledger_entry e JOIN ledger_entry a ON a.practice_id = e.practice_id AND a.evidence_id = e.id AND a.stage = 'adjusted'
        JOIN ledger_entry u ON u.practice_id = a.practice_id AND u.evidence_id = a.id AND u.stage = 'reversed'
       WHERE e.practice_id = NEW.practice_id AND e.service_line_id = NEW.service_line_id AND e.stage = 'interest'
    ) x;
    IF line_net < 0 THEN
      RAISE EXCEPTION 'a line''s interest, net of what the payer took back, never goes below zero'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_interest_line_floor';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entry_within_interest BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_interest();
REVOKE ALL ON FUNCTION ledger_entry_within_interest() FROM PUBLIC;
```

The per-L6 sum reads `ledger_entry_by_evidence (evidence_id)`, which exists (`20261026090000:61`); the line sum reads
`ledger_entry_by_line (practice_id, service_line_id, seq)`. The function is complete as written; in object 5 only the
unchanged middle is elided here, and the builder copies it from `ledger_mig:319-366` (the prototype ran the whole
body: `scratchpad/probes/author/20261108090000_ledger_interest_once.sql`).

---

## 6. Application changes

### 6.1 `packages/ledger` (pure, mutation-tested)

- **New `packages/ledger/src/interest.ts`.** The arithmetic of D2, D3 and D6, so it is mutation-tested
  (`apps/worker/src/reconcile` is not; 15b design section 6). Every amount is `Cents` (bigint); nothing divides but
  `allocateByWeight`; every function throws `LedgerError` on a zero L6, a zero AMT I, a negative weight or a credited
  amount past its part.
  - `remittanceInterest({ adjustments, reported })` for one remittance. `adjustments`: each L6's `id`, `position`,
    `cashCents` (its `amount_cents` negated: positive paid, negative taken back) and `namedClaimIds` (the practice's
    claims its PLB03-2 hashes to; empty when none). `reported`: each claim of the remittance with AMT I, its
    `claimId`, `amtICents` (signed) and `reversesClaimId`. Returns the named parts (`adjustmentId`, `cents`,
    `claimIds`), the pooled parts (`adjustmentId`, `claimId` (the claim C, or X for a take-back), `cents`,
    `split`: two or more claims took positive parts of the pool) and what is attributed to no claim
    (`adjustmentId`, `cents`).
  - `interestToLines({ partCents, creditedCents, split, lines })`, `lines` each `serviceLineId`, `weight`, `matched`:
    splits `partCents − creditedCents` (same sign; zero gives nothing) over the lines not yet matched to the L6 whose
    weight is above zero, by `allocateByWeight`, and flags each part `allocated` when `split` or when two or more lines
    took positive parts (D6).
  - `interestHeld(entries, claimOfMatch)`: what each line holds from each claim, its interest entries of matches naming
    the claim net of their corrections (`correctedEntry`), the weights of a take-back.
- **`stages.ts`.** `STAGE_SIGN.interest` becomes `'signed'`. In `entryProblems`, a zero signed amount reads "an
  adjustment changes an amount" for an adjustment, as today, and "an interest entry moves an amount" for interest.
  `STAGE_EVIDENCE.interest`'s comment: "A PLB L6, paid or taken back; a claim (AMT I) only on entries written before
  docs/adr/0084." The arrays themselves are unchanged.
- **`index.ts`** exports the three functions and their types. **`stryker/shards.json`** adds
  `packages/ledger/src/interest.ts` to the `money-ledger` shard's ledger list (`tools/stryker/shards.test.ts` holds
  every mutated file to exactly one shard). Target: 100% mutation score on `interest.ts`, as `payment.ts` holds.
- `totals.ts`, `roi.ts` and `statement.ts` need no change: they sum signed amounts, so "interest" becomes net of
  take-backs by itself.

### 6.2 The reconcile (`apps/worker/src/reconcile`)

- **`rem`**:
  - `providerAdjustments` keeps the WO branch only (`a.category = 'recoupment' AND a.reference IS NOT NULL`).
  - A new `reconcileInterest` replaces the L6 branch (`rem:836-841`), `claimInterest` (`rem:845-860`) and
    `recordInterest` (`rem:863-910`). It reads, in three queries scoped by `practice_id`: the practice's L6s of loaded
    remittances (`id, remittance_id, reference, amount_cents, position`, and the remittance's `bpr16_date` and
    `created_at`), every claim of those remittances with `interest_cents <> 0` (`id, remittance_id, interest_cents,
    reversal_of_claim_id`), and the claims whose hash equals an L6 reference's hash (`claim_by_payer_claim_control_number`
    serves it). For each remittance in date order it calls `remittanceInterest`, finds each part's lines (paid: the
    case lines with a standing approved claim match to the claim, the match's claim being the `claim_id`; taken back:
    `interestHeld`), reads what is already credited for that L6 and claim from the pass's entries and matches, calls
    `interestToLines`, and writes each part with `insertMatch({ kind: 'interest', claimId, providerAdjustmentId,
    remittanceId: <the L6's>, serviceLineId, allocated, matchedBy: null })` and `insertEntry({ stage: 'interest',
    amountCents, evidenceKind: 'provider_adjustment', evidenceId: <the L6>, matchId, allocated, createdBy: null })`.
  - Order: `matchClaims`, `recoupReversals`, then remittance by remittance in date order, its WOs and then its
    interest. An earlier remittance's interest is still split before a later remittance's WO, as today.
  - `Counts` gains `interestTakenBack` (entries below zero); `interest` counts the positive ones. The job logs no new
    field (`job.ts:61-65` logs no counts), so `packages/observability/src/fields.ts`, a #42 file, is untouched.
  - `CHAIN_ORDER` orders by `m.seq` alone and still returns `matched_at`, which `reversalRule` compares with a
    reversal's load time (`rem:400`, `:488`). Its comment says the order is the ledger's own.
  - `everMatched` is unchanged; the interest path calls it with the L6's ID.
- **`rled`**: `ledgerMatches` orders by `m.seq` (`:103`). `insertMatch` is unchanged: a match with both IDs has the L6
  as its `evidence_id`, so `ON CONFLICT (kind, evidence_id, service_line_id)` is still the arbiter.
- **`statement-html.ts:114`**: the printed statement's interest sentence (section 7).
- **`pass.ts`**: the summary type carries `interestTakenBack`.

### 6.3 The web

- **`wq`**: the line's matches and the remittance's cash matches order by `m.seq` (`:482`, `:485`). `MATCH_SELECT`
  joins the match's `provider_adjustment` to read whether it takes interest back (`amount_cents > 0`), and
  `MatchView` gains `takesBack: boolean`. The line view gains `reportedInterest`: each standing approved claim match of
  the line whose claim has `interest_cents > 0`, with the remittance's trace, payer and paid date and the amount,
  read from stored rows.
- **`page`**: the interest words of `MatchItem` (`:76`), the reported interest under the Interest list, and the
  section shown when the line has recoupments, interest or reported interest (`:191`). Words in section 7.
- **`apps/web/src/components/reconciliation/display.tsx:88`**: the totals tile's note.
- **`apps/web/src/lib/routes/specialist.ts:128-129`**: `ADJUSTMENT_CONSEQUENCE`.
- **`apps/web/src/lib/routes/reconciliation.ts`, `reverseMatchAction`** maps Postgres's refusal named
  `ledger_interest_line_floor` (the line-floor RAISE carries that constraint name, as `submit_screening`'s coded
  refusals do) to an input error on `matchId` (section 7), as `adjustEntryAction` maps its check violations to the
  amount (`specialist.ts:154-158`); any other error is left as it is. The page never offers a reversal of an interest
  match (`page:84`), so only a hand-made request meets it.
- **`apps/web/src/lib/routes/test-support/ledger-world.ts:94-143`** seeds its 0.50 of interest as a PLB L6 of the
  adjusted remittance naming the adjusted claim, matched with both IDs; a claim-only interest match is refused now.

### 6.4 Mutations

No route, server action or permission is added. Interest is written only by the reconcile job, in its practice-scoped
transaction under `lockLedger`, in no one's name, and the ledger rows are its record (the job writes no audit event
today and gains none). Two person actions reach interest entries and keep their Zod schema, role check, practice-scoped
transaction and audit event as they are:
- **Reverse a match** (`reverseMatchAction`, `posting.reconcile`, audit `reconciliation_reversal`): checked in the
  handler (`manual.ts:46-50`, permission and the ledger lock) and in Postgres (`ledger_match_rules`' UPDATE branch,
  then the reversal entries through `ledger_entry_rules`, `_within_line` and now `_within_interest`).
- **Adjust an entry** (`adjustEntryAction`, `ledger.adjust`, audit `reconciliation_adjustment`): the same, and
  `ledger_entry_within_line` already holds an interest adjustment between zero and the entry's own amount.
New in Postgres for both: neither may leave a line's interest below zero once the payer has taken some back.

---

## 7. Every sentence a person reads, word for word

Plain words first and the code after in brackets, as the reconciliation screens already write "PLB WO take-back". No
string says recovered, owed or underpaid, or names a model; `pnpm lint:copy` runs over every one. `{…}` is a value,
each money value through `<Money>` (Plex Mono).

**Reconciliation, a line's match** (`page:76`; the rest of the sentence, "Remittance {trace}, {payer}, paid {date}" and
"; matched by the reconcile job, {time}.", is unchanged):

| The match | Today | After |
|---|---|---|
| Interest from a PLB L6 that paid it | ": PLB L6 interest" | ": interest paid in this check (PLB L6)" |
| Interest a PLB L6 took back | (never written) | ": interest taken back in this check (PLB L6)" |
| An AMT I interest match written before this change (development data only) | ": the claim’s interest" | unchanged |

**Reconciliation, under a line's Interest list**, one sentence for each claim the line's standing approval names that
reports interest (new):

> Remittance {trace}, {payer}, paid {date}: the claim reports {amount} of interest (AMT I). Interest is counted only as
> a check pays it (PLB L6), in the list above.

The Interest list's empty text stays "No interest paid." The Recoupments and Interest pair now shows when the line has
recoupments, interest or reported interest.

**Reconciliation, the totals tile** (`display.tsx:88`): label "Interest" unchanged; note "paid by the payer, apart from
principal" becomes:

> paid by the payer, net of any it took back, apart from principal

**The printed ROI statement** (`statement-html.ts:114`): "Interest, net" and "No interest was paid in the period."
unchanged; the explanation "Interest the payer paid in the period, shown apart from principal." becomes:

> Interest the payer paid in the period, less any it took back, shown apart from principal.

**The ledger adjustment's consequence** (`specialist.ts:128-129`, shown before a person confirms):

> Adjusting writes a new entry in your name with your reason that changes this entry’s amount by what you enter; the
> entry itself never changes, and an adjustment is undone only by reversing its match. The ledger keeps it between
> zero and what the entry’s evidence shows (the row’s amount for a posting or a deposit, the entry’s own amount for an
> approval, a recoupment or interest), a line’s posted and deposited never above what was approved for it, and a
> line’s interest, net of what the payer took back, never below zero. The totals and the line’s stage follow the
> ledger.

**A reversal refused by Postgres** (`reverseMatchAction`, on the `matchId` field; new):

> The payer has taken back some of this line’s interest, so this match can be reversed only after the match of that
> take-back is reversed.

**Postgres's refusals** (`check_violation`; printed in the domain model's Appendix C, and the last one shown on the
adjustment form's amount field as its existing refusals are, `specialist.ts:154-158`):

- interest is matched from a PLB L6 of its remittance, for a claim
- interest reaches a line only through a claim the line's standing approval names
- interest is credited from the PLB L6 that paid it
- an interest entry is positive for interest a PLB L6 paid and negative for interest it took back
- the interest entries of a PLB L6 never sum past what it paid or took back
- a line's interest, net of what the payer took back, never goes below zero

`allocated` keeps its words, " (allocated pro rata)" (`page:115`, `abstraction/ledger/page.tsx:68`,
`components/reports/roi.tsx:64`); after N1 they appear only on a real split. The remittance page's "Interest (L6)"
category name is unchanged.

**These screens change, so the PR takes the UX and brand review** (`.claude/agents/ux-brand-reviewer.md`) as one of
its two adversarial reviews, with before and after shots at 1280 and 390 px (LANES.md rule 1): Reconciliation with a
line holding interest paid, interest taken back and reported interest; the Reconciliation totals; the ledger review's
adjustment form; the printed ROI statement. The tour's synthetic world adds LED-23's and LED-24's files.

---

## 8. Tests

Every test below is written first and fails on e908c21 where marked "fails today"; the build makes it pass. IDs are
the reserved LED-23 to LED-25.

### 8.0 The prototype (author, 2026-10-27)

`scratchpad/probes/author/interest-author-proto.mts` on its own database `tp_design_interest_3`: migrated from empty
through e908c21's 44 migrations and #42's `20261107090000_mail_streams.sql`; two practices given interest by the
current code (Z: LED-16's AMT I alone; H: AMT I with an L6 of +5.40); then the draft migration of 5.3 applied by the
real runner; then the checks below as the job (`withJobScope`), each in a rolled-back transaction; then dropped.
PROTOTYPE_RESULTS_PLACEHOLDER

### 8.1 Test matrix rows (exact; `docs/product/test-matrix.md` after LED-18, and word for word in `packages/synth/src/cases/matrix.ts`)

| ID | Case | Expected |
|---|---|---|
| LED-23 | A remittance's interest reported on its claims (AMT I) and paid at the provider level (PLB L6) | Credited once per line, from the PLB L6, whether it names the claim or not: an L6 naming no claim is split by the remittance's AMT I, never past what each claim reported. AMT I with no PLB L6 in its check counts nowhere and is shown as reported. A reversal and correction whose AMT I nets to zero add no interest, and a PLB L6 in a later remittance naming the claim is credited once |
| LED-24 | One PLB L6 over lines approved at different times, then a PLB L6 taking interest back | Its entries never sum past what it paid, however many reconciles run, and an entry is flagged allocated only when the amount was split between two or more positive parts. Interest taken back is a negative interest entry against the lines holding that claim's interest, never below zero on a line, and the interest total is net of it. Postgres refuses an interest match without its PLB L6 and claim, an entry past its PLB L6, and a line's interest below zero |
| LED-25 | A line's chain read back | Its matches in the order the ledger made them, within one reconcile and across reconciles, never by their IDs; the claims a correction supersedes found by index at 50,000 claims |

### 8.2 `packages/synth` cases (module 6, LED; `registry.ts` and the generated `fixtures/synthetic`)

- **LED-23** (`workflow.led23`), on LED-16's two-line case (allowed 70.00 to 100.00 on 97110 and 97110-59; the
  correction pays 24.00 and 30.00 more), one practice per variant:
  - `paired.835`: the correction with AMT I 5.40 and `PLB L6:<its CLP07>*-5.40`, BPR02 59.40 (V07's shape). Expected:
    interest 2.40 and 3.00 from the L6, allocated; total 5.40.
  - `unnamed.835`: the same with another patient's claim reporting AMT I 2.00 and one `PLB L6*-7.40` naming nothing.
    Expected: 2.40 and 3.00 from the L6; the other 2.00 on no case line.
  - `reported-only.835`: AMT I 5.40 and no L6, BPR02 54.00. Expected: no interest entry; the reported sentence.
  - `net-zero.835` after `paired.835`: the correction reversed (AMT I -5.40) and corrected again, paying line 1 2.00
    more (AMT I 5.40), with no L6 (RFI 1324's shape). Expected: line 1 approved 2.00 more; no new interest entry
    (today the new correction's AMT I is credited again).
  - `later-l6.835` after `reported-only.835`: a later remittance whose `PLB L6:<the correction's CLP07>*-5.40` pays it.
    Expected: 2.40 and 3.00, dated by the later remittance.
- **LED-24** (`workflow.led24`):
  - `first.835` then `second.835`, probe R's shape: the first raises line 1's payment and line 2's allowed amount but
    not its payment, with `PLB L6:<CLP07>*-5.40`; a month later the second pays line 2 more. Expected: 5.40 on line 1,
    not allocated; nothing on line 2, after any number of reconciles.
  - `paired.835` then `taken-back.835`: the correction reversed alone (AMT I -5.40, paid -160.00) with
    `PLB L6*5.40` naming nothing, beside another patient's claim so the check stays positive. Expected: interest
    -2.40 and -3.00, total 0.00; the principal recouped as LED-12.
  - `short.835`: AMT I 5.40 on the correction and 2.00 on another claim, `PLB L6*-5.00` naming nothing. Expected:
    3.65 for the correction (162 and 203 cents by payment), 1.35 for the other claim; allocated.
- **LED-25**: a registry entry with no file (`none(9, ...)`): database tests.
- **LED-16's fixture** takes its own design's shape (lane-b-pr15b.md section 3.5): `two-lines-adjusted.835` gains
  `PLB L6:<the corrected claim's CLP07>*-5.40` and BPR02 59.40. Its expected interest (2.40 and 3.00, allocated) is
  unchanged; the evidence becomes the L6. Without it, LED-16 would assert 5.40 of interest the check never paid.

### 8.3 What each test proves

| Test | ID | Proves | Today |
|---|---|---|---|
| `packages/ledger/src/interest.test.ts`, unit | LED-23, LED-24 | Each worked case of section 4 by hand: named, pooled, short pool, take-back, AMT I alone, net zero, the first claim to reach a line | new file |
| `interest.test.ts`, fast-check properties | LED-23, LED-24 | For any remittance of one to four L6s (either sign, named or not) and one to five AMT I claims (either sign, reversals linked): every part has its L6's sign; named parts sum to their L6s; pooled parts plus the unattributed equal the pool; no pooled part passes its claim's reported amount; a remittance with AMT I and no L6 gives nothing. Over any sequence of reconciles with weights changing between them, an L6 is never credited past its part, a second call with the first call's credits gives nothing, no line goes below zero on a take-back, and `allocated` holds exactly when two or more positive parts were split | new file |
| Mutation, `money-ledger` shard | LED-23, LED-24 | `interest.ts` at 100% (every surviving mutant killed or recorded as equivalent) | new file |
| `packages/ledger/src/stages.test.ts`, `rules.test.ts` | LED-24 | `STAGE_SIGN.interest` is `'signed'`; a negative interest entry has no problem, a zero one has "an interest entry moves an amount" | fails today (positive) |
| `apps/worker/src/reconcile/interest.db.test.ts` (new) | LED-23 | The five LED-23 variants as their expected outcomes, each match carrying the L6 and the claim, each entry's evidence the L6 | fails today: 1080, 540 credited from AMT I alone, +540 on net zero, 1080 for the later L6 |
| `interest.db.test.ts` | LED-24 | The three LED-24 variants; a second and third reconcile write nothing; then, as the job by hand: a claim-only and an L6-only interest match refused, an L6 of another remittance refused, a claim the line has no standing approval for refused, an entry of 541 on a 540 L6 refused, a negative entry on a paid L6 refused, and, as a specialist through `adjustEntry`, an adjustment taking a line below zero after a take-back refused with its sentence | fails today: 840, allocated on one line, the take-back dropped, every refusal accepted |
| `apps/worker/src/reconcile/ledger-oracle.db.test.ts` | LED-23, LED-24 | Two appended cases from the synth `expected.json`; the original six and LED-14 to LED-17 unchanged (LED-16 against its corrected fixture) | appended |
| `payment-terms.db.test.ts:537-552`, `ledger.db.test.ts:279-294` | LED-16, PAR-18 | Same amounts; the evidence and the match's claim asserted | updated |
| `apps/worker/src/reconcile/chain.db.test.ts` | LED-25 | Two matches inserted in one transaction whose UUIDs sort against their order read back in insertion order from `ledgerMatches`, `CHAIN_ORDER` and the web's line query; an update of `seq` is refused; an INSERT that names no `seq` (the previous image's) is numbered next | fails today: UUID order |
| `apps/worker/src/reconcile/chain.large.db.test.ts` (new) | LED-25 | 50,000 synthetic claims bulk-inserted as the owner (one in twenty superseded), analysed: `claimLines`' recursive lookup and `unmatched.ts:187`'s EXISTS use `claim_by_superseded` (EXPLAIN) | fails today: sequential scan |
| `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` | LED-23, LED-24 | The line view's interest words, `takesBack`, the reported-interest rows and the reverse route's refusal on `matchId`; the route world's interest reseeded as an L6 | fails today |
| `apps/web/e2e/ledger-interest.spec.ts` (new) | LED-23 | A billing manager opens Reconciliation for `paired.835`: the line's "interest paid in this check (PLB L6)", entries 2.40 and 3.00, the totals tile's Interest 5.40 (10.80 today); for `reported-only.835` the reported sentence and "No interest paid."; axe passes | fails today |
| Catalog, cross-tenant, `pnpm db:domain-model --check --require-approval` | (CI) | No list changes; the regenerated model and function files are current and approved | must pass |

---

## 9. The domain model and the records

### 9.1 Regeneration

- `pnpm db:domain-model --out` on a database migrated from empty writes `docs/product/domain-model.md` and
  `packages/db/functions/*.sql`. This PR changes `ledger_match_rules.sql` (its body) and adds
  `ledger_entry_within_interest.sql`; the trigger lists in the headers of other function files do not change.
- The model gains: `ledger_match.seq` (identity) and `ledger_match_by_seq`; the new text of `ledger_match_evidence`
  and `ledger_entry_sign`; the trigger `ledger_entry_within_interest` and its six refusals; `ledger_match_rules`' two
  interest refusals in place of "interest is a PLB L6 or a claim's interest of its remittance" (`domain-model.md:3721`);
  `claim_by_superseded`. No table, area (`packages/db/domain-model/areas.json`) or registry row changes, and the data
  dictionary lists neither `ledger_match` nor these columns.
- If no earlier regeneration has added it, the sentence #111 proposed for Appendix C's introduction (pointing to
  `packages/db/functions`) goes in here (LANES.md, "Handed to Lane A", 2026-10-26).
- `pnpm db:domain-model --check --require-approval` must pass. The PR opens with `pnpm db:domain-model --summary-since
  origin/claude/build-platform --function-diffs list` in its description; the approval line is posted as a suggested
  change in one pull-request comment through `gh api repos/PureTideWater/PhysicalTherapy/pulls/<n>/comments`
  (`.claude/skills/new-migration`), never written into the file or into `approvers.json` by the build, and the
  founder's APPROVED review of the latest commit is the approval of record (ADR 0063).

### 9.2 Records

- **ADR 0084** (new): "Credit interest from the PLB L6 that pays it, attribute it by the claims' AMT I, take back what
  the payer takes back, and read matches in the order the ledger made them". Context (section 1's probes and section
  2), Decision (D1 to D11), Consequences (section 12), What does not change (D9), and the founder's exception quoted
  with its date.
- **ADR 0042**, "Recoupments and interest" (`:96-97`): "A PLB L6, or a claim's AMT I (now loaded into
  `claim.interest_cents`), writes an interest entry beside principal." becomes "A PLB L6 writes an interest entry
  beside principal, positive when it pays interest and negative when it takes interest back, for the case lines of the
  claims it is for: those it names, or, when it names none, those whose AMT I reports interest in its remittance
  (docs/adr/0084)." Its status line gains "amended by 0084".
- **ADR 0067**: the interest bullet (`:163`) and consequence (`:234`) gain "(the interest itself is the PLB L6's since
  docs/adr/0084)".
- **PRD 13** (`docs/product/PRD.md:548`), the founder's text under the exception (section 10): "Interest paid by the
  payer (PLB L6, or a line-level interest amount) is recorded as its own positive entry category `interest` and shown
  separately from recovered principal." becomes:

  > Interest the payer pays (PLB L6) is recorded as its own entry category `interest`, against the case lines of the
  > claims it is for (the claims the PLB L6 names, or, when it names none, those its remittance reports interest on in
  > AMT I), positive when paid and negative when the payer takes it back, and shown separately from recovered
  > principal. Interest a claim reports (AMT I) that no PLB L6 pays is shown as reported and counted nowhere.

- **reconciliation-001.md**, "Ledger semantics", after PR 15b's amendments:

  > *Amended (Lane A, `co-001/ledger-interest-once`; the founder's freeze exception of {date}; docs/adr/0084):* one
  > migration alters `ledger_match` (the interest branch of `ledger_match_evidence`, the column `seq` and its index,
  > `ledger_match_rules()`) and `ledger_entry` (`ledger_entry_sign` for interest, the trigger
  > `ledger_entry_within_interest`). Interest is credited from the PLB L6 and attributed by AMT I; interest the payer
  > takes back is a negative interest entry. `packages/ledger` adds `interest.ts`, and `STAGE_SIGN.interest` becomes
  > signed. The stage CHECK's seven values, recovered, the proof cap, `roi_statement` and LED-01 to LED-18's amounts
  > are unchanged; the oracle appends LED-23 and LED-24, and LED-16's fixture carries the PLB L6 its design gave it.

  and a row for this pull request in its list of Lane A's pull requests.
- **Test matrix** rows of 8.1, and `packages/synth` `matrix.ts` and `registry.ts` of 8.2.

---

## 10. What the founder must approve or rule

Only two things, both kept for the founder by CLAUDE.md and LANES.md (the domain model's approval, and a freeze
exception, which here also changes PRD 13's ruled wording). Everything else in this design is an engineering or
wording choice inside them, taken as recommended under the standing rule.

### 10.1 The ledger freeze exception (needed before the build starts)

Proposed text, ready to grant as it stands:

> **Ledger freeze exception, interest credited once (Lane A, `co-001/ledger-interest-once`, docs/adr/0084).** Granted
> for one pull request into `claude/build-platform`, an exception to reconciliation-001's "Ledger semantics" covering
> exactly:
>
> **DDL** (one migration): the interest branch of `ledger_match_evidence` takes one or both of `claim_id` and
> `provider_adjustment_id`; `ledger_match.seq` (an identity) and the unique index `ledger_match_by_seq`;
> `ledger_match_rules()` recreated with `seq` among the columns that never change and with the new interest rules;
> `ledger_entry_sign` allows a negative interest entry; the trigger `ledger_entry_within_interest` on `ledger_entry`;
> and the index `claim_by_superseded` on `claim`.
>
> **Behaviour:**
> 1. Interest is credited only from a PLB L6, once per PLB L6 and case line, never past what the PLB L6 paid; a
>    claim's AMT I never credits interest by itself.
> 2. A PLB L6 that names no claim is attributed by its remittance's AMT I, never past what each claim reported.
> 3. AMT I with no PLB L6 paying it counts nowhere and is shown as reported.
> 4. A PLB L6 that takes interest back writes a negative interest entry against the lines holding that claim's
>    interest, never below zero on a line; PRD 13's sentence on interest is replaced by the text in this design's
>    section 9.2.
> 5. An entry is flagged allocated only when its amount is one of two or more positive parts (N1).
> 6. Matches are read in `ledger_match.seq` order, which is the order reversal take-backs walk a line's chain in.
> 7. Postgres refuses an interest match without its PLB L6 and its claim, an interest entry past its PLB L6 or of the
>    other sign, and a line's interest below zero.
>
> **Files:** that migration; `packages/ledger/src/interest.ts` (new), `stages.ts` (`STAGE_SIGN.interest` and the
> zero-amount problem's words) and `index.ts`; in `apps/worker/src/reconcile`, `remittances.ts` (the interest path and
> `CHAIN_ORDER`), `ledger.ts` (`ledgerMatches`' order), `pass.ts` and `statement-html.ts`; the web's reconciliation
> queries, page, totals note, adjustment consequence and reverse route; the Drizzle mirror; LED-16's fixture (its PLB
> L6) and the tests of LED-16 and PAR-18 (their evidence); the ledger oracle (LED-23 and LED-24 appended); ADR 0042,
> ADR 0067, ADR 0084, PRD 13 and reconciliation-001.
>
> **Stays frozen:** `LEDGER_STAGES`, the seven entry types and the stage CHECK; the definition of recovered and the
> proof cap; `roi_statement` and its rules; `ledger_entry_rules`, `ledger_entry_within_evidence` and
> `ledger_entry_within_line`; `posting_row` and `eft_row`; every principal amount (approved, posted, deposited,
> recouped), the WO and reversal rules and the matching of claims, postings and deposits; LED-01 to LED-18's amounts;
> the ledger oracle's harness.

Without behaviour 4, the build drops the take-back (option 3.3 (a), as today) and the rest stands; without behaviour 6,
`seq` and its readers come out; the other behaviours are the defect's fix and stand or fall together.

### 10.2 The domain model (when the pull request is ready)

The founder's approval of the regenerated `docs/product/domain-model.md` by its SHA-256, through an APPROVED review of
the pull request's latest commit (CO-02; ADR 0063). The PR's description carries the summary since the base and the
function diffs (`ledger_match_rules`, `ledger_entry_within_interest`).

---

## 11. Files

**New:** `packages/db/migrations/<ts>_ledger_interest_once.sql`; `packages/ledger/src/interest.ts` and
`interest.test.ts`; `apps/worker/src/reconcile/interest.db.test.ts` and `chain.large.db.test.ts`;
`apps/web/e2e/ledger-interest.spec.ts`; `docs/adr/0084-….md`; `fixtures/synthetic/LED-23/*` and `LED-24/*` (generated
by `pnpm synth`); `packages/db/functions/ledger_entry_within_interest.sql` (generated).

**Changed:** `packages/ledger/src/stages.ts`, `index.ts`, `stages.test.ts`, `rules.test.ts`; `stryker/shards.json`;
`apps/worker/src/reconcile/remittances.ts`, `ledger.ts`, `pass.ts`, `statement-html.ts`, `chain.db.test.ts`,
`ledger-oracle.db.test.ts`, `payment-terms.db.test.ts`, `ledger.db.test.ts`; `apps/web/src/lib/reconciliation/queries.ts`,
`apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`,
`apps/web/src/lib/routes/specialist.ts`, `apps/web/src/lib/routes/reconciliation.ts`,
`apps/web/src/lib/routes/test-support/ledger-world.ts`, `apps/web/src/lib/routes/reconciliation-routes.db.test.ts`;
`packages/db/src/schema/ledger.ts` (`seq`, `ledger_match_by_seq`) and `remittances.ts` (`claim_by_superseded`);
`packages/synth/src/cases/workflow.ts` (LED-16's PLB L6; LED-23 and LED-24), `registry.ts`, `matrix.ts`;
`fixtures/synthetic/LED-16/two-lines-adjusted.835` and its `expected.json` (generated);
`docs/product/domain-model.md` and `packages/db/functions/ledger_match_rules.sql` (generated);
`docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`, `docs/product/PRD.md`, `docs/adr/0042-….md`,
`docs/adr/0067-….md`; `tools/screening-capacity/watched-paths.txt` (regenerated by `watched.ts --write`, since
`packages/ledger/src/*` and `apps/worker/src/reconcile/*` are watched).

**#42's files among them** (`scratchpad/progress/interest-author-42files.txt`, 188 files): `docs/product/domain-model.md`,
`docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`, `packages/synth/src/cases/matrix.ts`,
`registry.ts`, `tools/screening-capacity/watched-paths.txt`, and the generated `packages/db/functions` directory (#42
changes only `set_updated_at.sql`'s header, which this PR does not touch). #42 merges first, so each is then a base file:
the generated ones are regenerated on the merged tree and the shared documents keep both PRs' text (LANES.md rule 6).
No other file of this PR is #42's: not `packages/db/src/schema/ledger.ts` or `remittances.ts`, not `fields.ts`, not
`settings.ts`. Among Lane B's open work, the UX table-scroll PR may touch the reconciliation page's tables, and #46
(the Verified seal) owns the ROI pages and `apps/worker/src/report`, which this PR does not change.

---

## 12. Risks

1. **PLB03-2 conventions vary.** An L6 whose reference names the claim by something other than CLP07 (its patient
   control number, which has no stored hash) is read as naming no claim and attributed by its remittance's AMT I:
   right when the remittance carries AMT I, which the guide requires. With neither, nothing is credited (an
   understatement); the remittance page still lists the L6.
2. **A payer that reports AMT I and never sends the L6** (against RFI 2202) loses that interest from the figure, by
   design: the check does not hold it. The line shows the reported amount. A payer that folds interest into CLP04 and
   balances it with a negative claim CAS has it counted as principal by `claimLinePayments` (`packages/ledger/src/payment.ts:188-195`);
   that is a separate question (section 14).
3. **The deploy window and a rollback** (D11): the previous worker's reconciles with interest due fail and retry. On a
   long window the job's third-attempt alert fires; the runbook's note for this deploy says so.
4. **Rows written before the change** keep their double counts; only synthetic development data holds them (ADR 0067),
   and it is regenerated.
5. **Negative interest in readers that assumed positive.** Checked: `entryProblems` (changed), the totals and the ROI
   statement (signed sums), `<Money>` (prints a minus), `roi_statement`'s `interest_cents` (no sign CHECK,
   `ledger_mig:251`). The Verified seal reads recovered only. The packets' prompt-pay interest
   (`packages/packets/src/interest.ts`) is another concept and is untouched.
6. **The take-back needs the reversal linked** (`claim.reversal_of_claim_id`, set by the loader). An unlinked reversal
   takes nothing back through AMT I; a take-back L6 that names the claim still works.
7. **Lock alignment with SUITE-CAP-1.** The new trigger takes `'ledger:' || practice_id`, the key every ledger writer
   already holds. If SUITE-CAP-1 moves the ledger triggers to another key, the builder aligns this one in the same
   chain order.
8. **Two claim parts of one L6 reaching one line** (D2, step 4) leave the second share uncredited; no fixture or payer
   example shows the shape.

---

## 13. The builders' slices, in order

1. **Ledger core** (`packages/ledger`): `interest.ts` with its unit and property tests, `stages.ts`, `index.ts`, the
   stryker shard; mutation at 100% on `interest.ts`. Independent of the rest.
2. **Schema** (beside slice 1): the migration on the then-latest base (diff `ledger_match_rules` first), the Drizzle
   mirror, `pnpm db:domain-model --out`, and the database tests that need no worker change: LED-24's refusals by hand
   and LED-25's order and plan tests.
3. **Reconcile** (after 1 and 2): `reconcileInterest`, the order by `seq`, `pass.ts`, `statement-html.ts`; the synth
   cases LED-23 and LED-24 and LED-16's PLB L6 (`pnpm synth`), `interest.db.test.ts`, the oracle's appended cases, and
   the updated LED-16 and PAR-18 assertions.
4. **Screens** (after 3): the queries, the page, the totals note, the adjustment consequence, the reverse route, the
   route world; `reconciliation-routes.db.test.ts` and `ledger-interest.spec.ts`.
5. **Records** (beside 3 and 4): ADR 0084, ADR 0042 and 0067, PRD 13 in the founder's granted words,
   reconciliation-001, the test matrix, `matrix.ts` and `registry.ts`, `watched-paths.txt`.
6. **Integration**: the full local suite (unit, db, golden, e2e, mutation, lint, lint:copy, lint:logs, typecheck,
   verify-content, synth), the before and after shots, the PR description from the template with the domain-model
   summary, then the two adversarial reviews (the payment-engine reviewer and the UX and brand reviewer).

---

## 14. Out of scope, and handed on

- **PR 15b's stored case close** ("payer corrected; balance is the patient's"): PR 8's case schema, as LANES.md has it.
- **The ledger freeze guard test** (reconciliation-001.md:172): PR 8 builds it; it lists this migration as granted by
  the exception of section 10.
- **Interest inside CLP04** (a negative claim-level CAS such as CARC 225 balancing interest the payer folded into the
  claim's payment): no handling exists, and `claimLinePayments` would count it as principal. A question for the
  payment-engine reviewer and a later ledger item.
- **`provider_adjustment.reference` is stored in plain text** although ADR 0027:95 calls a claim reference PHI (it is
  not in `ENCRYPTED_COLUMNS`, `cipher.ts:39-60`). It needs a migration (an encrypted column and its hash), which is
  Lane A's; recorded for the next security review.
- **An L6 or WO no case line takes is invisible on Reconciliation** (`unmatched.ts` lists no provider adjustments).
  Most interest is for claims no case covers, so a plain list would be noise; a "for no case" view is a product
  proposal.
- **Interest on a line with nothing remaining** stays dropped (ADR 0067:234).
