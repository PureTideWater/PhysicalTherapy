# Interest credited once: the PLB L6 is the interest, AMT I says whose it is (Lane A; handed over by PR 15b)

Design contract, 2026-10-27, against `claude/build-platform` at e908c21, with PR 6b-4 (#42, `co-001/pr-06b-mail-streams`)
read at its fix round's head 6f23c42b (GitHub still shows 098636e3) for every function and generated file this item
shares with it. GitHub's `claude/build-platform` has since moved to 085299bd (#76: six test files, none of this item's).
Revised the same day after the design review (section 15 records each finding and what changed).

- **Lane:** A (a schema pull request; LANES.md rule 2). **Branch:** `co-001/ledger-interest-once`, cut from the latest
  `claude/build-platform` after #42 merges and after the founder grants the freeze exception of section 10.
- **Reserved (LANES.md claim row):** ADR 0084; test-matrix LED-23 to LED-25; `packages/synth` cases LED-23 to LED-25
  (module 6, LED). Fixture release 900008 is not needed and stays free.
- **Handed over by:** PR 15b (#51, merged as c355633). LANES.md "Handed to Lane A", 2026-10-26, four ledger items:
  interest credited twice, N1 (the interest "allocated" flag), a sequence for `ledger_match`'s order within one
  reconcile, and an index on `claim.superseded_by_claim_id`. Status: `approval-summaries/lane-b-pr15b-status.md`.
- **Scouts' notes:** `scratchpad/progress/design-interest-database.md` and `design-interest-application.md`. **The
  review:** `scratchpad/progress/design-interest-review.md` (its probes in `scratchpad/probes/review/`). **The
  author's probes:** `scratchpad/probes/author/` (run 1) and `scratchpad/probes/author/run2/` (after the review); each
  command and its output is quoted where it is used below.
- **Short names:** `rem` = `apps/worker/src/reconcile/remittances.ts`; `rled` = `apps/worker/src/reconcile/ledger.ts`;
  `wq` = `apps/web/src/lib/reconciliation/queries.ts`; `page` = `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`;
  `ledger_mig` = `packages/db/migrations/20261023120000_recovery_ledger.sql`; a **chain** is a claim with its reversals
  and corrections (D3).

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
- The PLB L6 is the interest. An interest entry's evidence is always the PLB L6 that paid it or took it back; the
  claims' AMT I only say which claim (and so which case lines) the money is for. Interest that appears only once as
  money (an L6 with no AMT I) is credited. An AMT I with no L6 behind it is shown beside the line as reported, and
  counted nowhere until a check pays it.
- A PLB L6 that names no claim (payers' guides list L6 among the codes whose reference need not name one, and the guide
  lets one L6 carry the net interest of a whole remittance) is shared among that remittance's claims by their AMT I,
  netted per chain, so a reversal and its correction cancel and another patient's interest is never taken. When the
  remittance's L6s equal its AMT I, as the guide requires, each claim gets exactly its AMT I. Today such an L6 is never
  credited. A reference that carries several identifiers names the claim whose control number is among them.
- One PLB L6 is never credited past what it moved, however many reconciles run and whatever later uploads change about
  whom it names, in code and in Postgres; a valid reconcile is never refused by that bound.
- A PLB L6 that takes interest back becomes a negative interest entry against the lines that hold that chain's
  interest, never below zero on a line. Today it is dropped.
- N1: an entry is flagged allocated only when its amount is one of two or more parts of a pro-rata split.
- `ledger_match.seq`: the order the ledger made its matches in. Every reader orders by it instead of by
  `matched_at`, which every match of one reconcile shares, and the match's random ID.
- An index on `claim.superseded_by_claim_id` for the correction chain's lookups, unless SUITE-CAP-1 merges it first.
- During the deploy and after a rollback, the previous image's reconcile credits no interest and otherwise runs as
  before; the current image then credits the interest once.

**Migration: yes, one** (section 5). It changes a CHECK on `ledger_match` and one on `ledger_entry`, adds
`ledger_match.seq` and its index, recreates `ledger_match_rules()`, adds one trigger function on `ledger_entry`, and
adds `claim_by_superseded` if SUITE-CAP-1 has not. It regenerates `docs/product/domain-model.md` and
`packages/db/functions`.

**One pull request** for all four handed-over items (section 3.5). The PR 15b case close ("payer corrected; balance is
the patient's") is not a ledger item and stays with PR 8's case schema, as LANES.md already places it.

**The founder decides two things** (section 10): the ledger freeze exception, whose exact scope section 10 lists (it
can be granted together with SUITE-CAP-1's Q1), and the domain model's approval by its SHA-256 on the pull request's
latest commit. Nothing else here is the founder's.

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
- **A reference that carries more than the claim's control number** (X12's recommended "CLP01 CLP07 TRN02", or a
  payer's "CLP01 CLP07") is hashed whole (`rem:799`), matches no claim, and is never credited.
- **Interest folded into CLP04** (balanced by a negative claim-level adjustment, outside the guide) becomes line cash
  in `claimLinePayments` (`packages/ledger/src/payment.ts:188-195`), so it is approved as principal, and the claim's
  AMT I credits it again as interest (the application scout's second double-count path). No synthetic case carries
  the shape.
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
verbatim (the author's and the reviewer's searches agree). They agree with each other, with ADR 0021's balancing and
with synth variant V07, which the parser team built to the guide (`packages/synth/src/cases/variants.ts:169-178`: AMT I
4.11 on the claim and `L6:<its CLP07>*-4.11`, BPR02 709.96 = 611.35 + 94.50 + 4.11).

- **RFI 1705** (5010 835 interest payment): net interest under a contract is reported at the PLB with code L6; the
  claim-specific amount goes in the claim's AMT with qualifier I; AMT segments do not take part in balancing. Interest
  the patient bears goes in CAS instead, with no AMT and no PLB.
- **TR3 1.10.2.9** (as summarised): the L6 carries the net interest of the remittance's claims, totalled in one L6 or
  split over several.
- **RFI 2202** (PLB L6 interest): an AMT I needs its supporting PLB L6 in the same remittance, and an L6 its AMT I; a
  remittance carrying one without the other is not compliant.
- **RFI 1324** (interest PLB in a 5010 835): when a reversal and a correction carry AMT I that nets to zero, no
  payment moves and no L6 is sent.
- **RFI 2184** (quoting RFI 2123): the L6 is the sum of the remittance's AMT I amounts, except when that sum is zero.
- **What PLB03-2 carries for L6** is not fixed: payers' companion guides say the reference usually names the claim,
  with L6 among the stated exceptions (UnitedHealthcare's PLB guide, as summarised), and one payer's example carries no
  reference at all (BCBS Oklahoma). X12's guidance (RFI 2370, as summarised) recommends that PLB03-2 carry CLP01, CLP07
  and TRN02 together, and BCBS Texas writes "CLP01 CLP07" for its WO. So an L6 may name a claim, name it among other
  identifiers, name something else, or carry nothing.

**What follows.**
1. The PLB L6 is the money: it is in BPR02, and the bank deposit proves BPR02. AMT I is the payer's statement of how
   much of that money each claim earned.
2. A remittance's interest is the net of its L6s. When the payer names a claim in the L6, that is the claim; when it
   does not, the remittance's AMT I amounts say whose it is. When the L6s equal the AMT I (the guide's rule), each
   claim's share is exactly its AMT I, whichever way it moves.
3. An AMT I with no L6 in its check is not money in that check. Under the guide it should not happen; when it does,
   the interest is either paid in a later check, whose L6 names the claim, or not paid at all.
4. A reversal's negative AMT I and a positive L6 are interest taken back. A reversal and the correction it makes room
   for report one claim's change in interest between them: their AMT I net, and netting to zero moves nothing.
5. Interest folded into CLP04 is outside the guide. This design counts it once, as principal, as today, and never
   again as interest, because AMT I alone credits nothing (section 14 keeps the rest of that question).

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
| (a) Credit it, as today | It is not in the check (ADR 0021's balancing; RFI 2202). When the payer pays it in a later check by L6, it is credited twice unless the two are linked by hand |
| **(b) Count it nowhere and show it beside the line as interest the claim reports (recommended)** | Interest counts as money arrives. The later L6 that pays it is credited then, once. Nothing is hidden: the line shows the reported amount and what was paid |
| (c) Hold it for a person to decide | A person cannot make money appear in a check; the check already decides. It adds a queue for a payer's formatting fault |

### 3.3 A PLB L6 that takes interest back

| Option | Why |
|---|---|
| (a) Drop it, as today | "Interest, net" on the ROI statement (`statement-html.ts:114`; PRD 13 and 20, "recovered principal and interest, net") stays above what the practice kept |
| (b) List it for a person, who lowers the interest entry with the ledger adjustment | The figure is wrong until someone acts. The adjustment's evidence is the entry, not the L6, so the trace to the money is lost. Needs a new list and a new task |
| **(c) A negative interest entry whose evidence is the L6, against the lines holding that claim's interest (recommended)** | Right at once, traced to the money, bounded in Postgres (per L6, and never below zero on a line). It changes `ledger_entry_sign` for interest and PRD 13's word "positive", so the exception names both |

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
- The index is on `claim`, which is not a frozen table, and is the safest part of the bundle. SUITE-CAP-1 specifies
  the same index under the same name (its D15, for the report's patient-balance step); whichever of the two merges
  first carries it, and the other drops it.
- SUITE-CAP-1's own freeze exception (its Q1) changes only the lock key of `ledger_entry_within_evidence()` and
  `ledger_entry_within_line()`, which this PR does not touch, so the founder can grant the two together.

**PR 15b's stored case close** ("payer corrected; balance is the patient's") is not a ledger item: it is DDL on `case`
and `case_line`, `case_rules()` and `@tp/triage deriveCaseState`, needs none of this exception, and LANES.md already
places it with PR 8's case schema beside #11. It stays there.

### 3.6 One PLB L6 that nets several claims, and a reversal beside its correction

TR3 1.10.2.9 lets one L6 carry the net interest of every claim of the remittance, and RFI 1324 has a reversal and its
correction report one claim's change in interest between them. Two choices follow: what counts as one claim's
reported interest, and how a net L6 is shared when its claims report interest both ways.

| Option | What it gives | Why not |
|---|---|---|
| (a) Each claim's AMT I on its own, paid interest only (run 1 of this design) | Simple | A reversal's -5.40 and its correction's +5.40 net to nothing, yet the correction's +5.40 takes 1.46 of another patient's 2.00 from a net L6 of 2.00 (the review's F2) |
| (b) Net per chain, then one pool per sign of the net cash | Reversal and correction cancel | When a lone reversal (-5.40) and another claim (+2.00) share one net L6 of +3.40, the reversal's lines keep 2.00 of interest the payer took back and the other claim's 2.00 is lost: right in total, wrong on the case lines, which are all the ledger counts |
| **(c) Net per chain; when the pool's L6s equal its chains' net AMT I, each chain gets exactly its AMT I, paid or taken back; otherwise only the net moves, shared by the chains reporting interest its way (recommended)** | Exact in the guide's own case, including a net L6 over interest paid and interest taken back; conservative when the payer's figures do not reconcile (never credits interest the cash cannot show) | One PLB L6 can then carry entries of both signs, so Postgres bounds each L6 per sign, counting the interest its remittance reports the other way (D8) |
| (d) Scale both sides in proportion | None | Invents gross amounts the payer never stated |

### 3.7 Once per PLB L6, whatever changes later

| Option | Why |
|---|---|
| (a) Once per PLB L6 and claim (run 1 of this design) | Whom an L6 names can change after it is credited: a claim with the same control number approves another line later, or the remittance holding the named claim is uploaded after the L6's (the loader links reversals that arrive first, `adoptOrphanReversals`, `apps/worker/src/parse/loader.ts:562-592`). Keyed per claim, the reconcile credits the L6 again; Postgres refuses; the whole reconcile of the practice rolls back on every retry and every day, with nothing a person can do (the review's F1) |
| **(b) Once per PLB L6 and sign, gross, with each chain's part as a second cap (recommended)** | What an L6 has given never exceeds what its current attribution gives it, reversed entries included (a person's reversal is final, as the WO branch counts `takenBefore`, `rem:804-805`). A re-attribution writes nothing more; the first attribution stands, visible on the line. Postgres's bound is implied by it, so a valid reconcile is never refused |

### 3.8 The previous image during the deploy and after a rollback

| Option | Why |
|---|---|
| (a) Refuse its one-record interest match (run 1 of this design) | Its `claimInterest` keys its check by the claim's ID, and the current image's matches carry the L6 as their evidence, so it retries every approved AMT I claim on every reconcile, even after the current image credited it. Every reconcile of every practice with an AMT I claim on a case line then fails (approvals, postings, deposits, stages, notices, and the day job's quarterly statement) until the image rolls forward (the review's F4, probe S3) |
| **(b) Skip exactly that shape: a match by the job carrying one of the claim and the PLB L6 is not written, with no error (recommended)** | The rest of its reconcile stands; interest waits for the current image, which credits it once. The current image never writes that shape (its type requires both, and a database test asserts every interest match it writes carries both), so the skip cannot hide a defect of its own. A person's insert of that shape is still refused |

### 3.9 A PLB03-2 that carries several identifiers

| Option | Why |
|---|---|
| (a) Hash the whole reference, as today | X12's recommended "CLP01 CLP07 TRN02" never names a claim, so a later L6 paying an earlier claim's interest is never credited (the review's F6) |
| **(b) The whole reference first; else each token, split on spaces, commas, semicolons, vertical bars and slashes; it names a claim only when the claims it reaches belong to one chain (recommended)** | Reads the recommended and the common forms; an ambiguous reference names nothing and is shared by AMT I, which caps it. Hyphens and dots are not split, because control numbers carry them |
| (c) Also search every claim's decrypted control number inside the reference | Finds identifiers run together with no separator, at the cost of decrypting every claim of the practice on every reconcile; no payer example shows that form (section 12) |

---

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
   - Each chain's draw comes from the pool's L6s of its own sign, in position order, up to their cash. Only in the
     exact case can the two sides be left short, and then by the same amount (the paid interest the L6s net against
     interest taken back); both remainders are drawn from the pool's first L6 by position, which nets them. Every
     draw names one L6, and the draws of one L6 to one chain (steps 2 and 4 included) add up to one.
4. **What the pool did not draw of a named L6 returns to the chain it names** (the L6 above its claim's AMT I, case F:
   the payer named the claim and paid that much).
5. **The rest is attributed to no chain**: counted nowhere; the remittance page still lists the L6.

An AMT I with no L6 in R draws nothing: no L6, no draw (case D). The attribution reads only stored rows that never
change (amounts, references, links), so it is the same at every reconcile until a later upload adds a claim or a link;
D6 makes such a change write nothing twice.

**D5. Lines.** A chain's draw is split over its case lines by `allocateByWeight`:
- **Paid** (a positive draw): the lines with a standing claim match to a claim the draw is for (the claims the L6
  names, in steps 1, 2 and 4; the chain's non-reversal claims in R, in step 3); those whose match is approved when
  there are any, otherwise every such line (a restatement matched "no change"). Weights: each line's
  `approvedRemaining` (`rled:253`), unchanged from ADR 0067. The match names the claim of the line's standing claim
  match.
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
as interest the line holds for its claim's chain; an old L6-only match names no claim, so a take-back cannot find it;
and an old AMT I credit is not set against a later L6 that pays the same interest (development data only, regenerated
before any customer's).

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

---

## 5. Schema: one migration, `<ts>_ledger_interest_once.sql`

**Its place in the chain.** `<ts>` is the next free timestamp on `claude/build-platform` when the branch is cut: after
#42's `20261107090000_mail_streams.sql`, and after SS-01's `20261108090000_suspension_refusal.sql` and SUITE-CAP-1's
`20261109090000_line_status_heads.sql` (their designs' names) if they merge first; the prototype used
`20261110090000`. It recreates one shared function, `ledger_match_rules()`, on the body `ledger_mig:314-374` left: no
later migration redefines it; #42 leaves it byte for byte the same (`packages/db/functions/ledger_match_rules.sql`
hashes alike on e908c21 and on #42's 6f23c42b, as do the functions it calls, `app_actor_id`, `app_actor_is_person`,
`app_actor_permitted` and `practice_in_scope`, and `ledger_entry_rules`, `_within_evidence` and `_within_line`); and
neither SS-01's nor SUITE-CAP-1's design touches it. Before writing the migration, the builder diffs
`ledger_match_rules` on the then-latest base and rebuilds this body on whatever it finds. If SUITE-CAP-1 has merged
`claim_by_superseded` (its D15), object 5 is left out.

### 5.1 Objects

| # | Object | Change | On which predecessor | Notes |
|---|---|---|---|---|
| 1 | `ledger_match_evidence` (CHECK) | DROP and ADD: the interest branch takes one or both of `claim_id` and `provider_adjustment_id`; recoupment keeps exactly one | `ledger_mig:156-162` | Validates against every stored row (old interest rows carry one) |
| 2 | `ledger_match.seq` | `ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY` | new | Existing rows are numbered in their stored order (section 3.4) |
| 3 | `ledger_match_by_seq` | `CREATE UNIQUE INDEX ON ledger_match (practice_id, seq)` | new | The readers' `WHERE practice_id = $1 ORDER BY seq` |
| 4 | `ledger_entry_sign` (CHECK) | DROP and ADD: `interest` is `<> 0` (was `> 0`) | `ledger_mig:207-214` | Every stored interest entry is positive, so it validates |
| 5 | `claim_by_superseded` | `CREATE INDEX ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL` | new, unless SUITE-CAP-1 made it | The twin of `claim_by_reversed` |
| 6 | `ledger_match_rules()` | `CREATE OR REPLACE`: `seq` in the immutability tuple; the job's one-record interest match skipped (D16); the interest branch of D7 and D8 | `ledger_mig:314-374` (unchanged on #42) | The trigger `ledger_match_rules` (`ledger_mig:375`) is unchanged |
| 7 | `ledger_entry_within_interest()` and its trigger | `CREATE FUNCTION`; `CREATE TRIGGER ledger_entry_within_interest BEFORE INSERT ON ledger_entry FOR EACH ROW` | new | A new function rather than a branch in `ledger_entry_within_evidence` or `_within_line`, which SUITE-CAP-1 recreates for their lock key. Row triggers fire in name order, so it runs after `ledger_entry_rules` (the match and the evidence checked) and `ledger_entry_within_evidence`, and before `ledger_entry_within_line` (the review's probe S1) |

**No new table and no policy change.** `ledger_match`, `ledger_entry` and `claim` keep ENABLE and FORCE ROW LEVEL
SECURITY and their tenant policies (`ledger_mig:725-733`; `20261016120000_remittances.sql:430-434` for `claim`); the
catalog and cross-tenant tests read the same shape. The PHI registry is unchanged.

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

**What the new trigger reads, and by which index.** The L6 (primary key); the reported interest of its remittance's
claims (`claim_once (remittance_id, claim_no)`); the L6's interest entries (`ledger_entry_by_evidence`); for a
negative amount, the line's interest entries and their corrections (`ledger_entry_by_line`, then
`ledger_entry_by_evidence`). `ledger_match_rules`' new lookup reads the line's matches (`ledger_match_by_line`).

**Locks.** Object 2 rewrites `ledger_match` and objects 1 and 4 validate under ACCESS EXCLUSIVE on `ledger_match` and
`ledger_entry`; object 5 holds SHARE on `claim` while it builds, so a remittance load waits for it. At today's sizes
(development rows only) each is well under a second. The migration's transaction holds them together, so a reconcile
or a load during the deploy waits and then proceeds.

**Lock taken by the new trigger.** `pg_advisory_xact_lock(hashtextextended('ledger:' || practice_id, 0))`, the key
`lockLedger` already holds in every writer of the ledger (`pass.ts:39`; `manual.ts:48` for every person's ledger
action), and the key SUITE-CAP-1 moves `_within_evidence` and `_within_line` to. Taking it again in the same
transaction adds no lock slot, and a writer that skipped `lockLedger` is serialised behind the others, so two inserts
can never both pass the per-L6 bound. It adds no per-row advisory lock, the shape SUITE-CAP-1 removes.

### 5.2 With the previous image running, and on rollback

D16: the previous worker's reconcile runs whole. Object 6 skips its one-record interest matches (no row, no error),
its `recordInterest` then finds no match ID and writes no entry (`rem:892-894`), and everything else it writes stands;
its INSERTs leave `seq` to the identity and its reads order by `matched_at, id` as before. The previous web reads the
new rows: a match with both IDs reads as "PLB L6 interest" (`page:76`); a negative interest entry shows its amount with
a minus. A rollback of the image keeps the schema, and the previous worker behaves the same until the image rolls
forward, when the current one credits the interest once. Nothing is ever written twice, and no reconcile fails for
interest.

### 5.3 The SQL

Prototyped twice on a database migrated from empty through #42's migration, after the current code had written
interest the old way: run 1 (`scratchpad/probes/author/20261108090000_ledger_interest_once.sql`) and, after the
review, run 2 below (`scratchpad/probes/author/run2/draft.sql`, applied as `20261110090000`; section 8.0 quotes the
run). The builder writes the file header in the house style (what, why, the shared function and its body, the deploy
window, "Runs as tp_owner"). Every statement is shown in full.

```sql
-- 1. An interest match may carry both the PLB L6 that pays (or takes back) the interest and the claim it is for.
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

-- 2. The order the ledger made its matches in.
ALTER TABLE ledger_match ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX ledger_match_by_seq ON ledger_match (practice_id, seq);

-- 3. Interest taken back by the payer is a negative interest entry.
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

-- 4. The claims a correction supersedes, found from the correction.
CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;

-- 5. ledger_match_rules on the body of 20261023120000 (unchanged since, and on #42): seq never changes; the previous
--    image's one-record interest inserts are skipped; interest is matched from a PLB L6 of its remittance, for a claim
--    the line has a standing claim or interest match to.
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
    IF OLD.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a match is reversed once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reversal_reason IS NULL OR NEW.reversed_by IS DISTINCT FROM app_actor_id() OR NOT app_actor_is_person()
       OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a match is reversed by a person who reconciles postings, in their own name, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reversed_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.reversed_by, NEW.reversed_at, NEW.reversal_reason) IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::text) THEN
    RAISE EXCEPTION 'a match is recorded standing' USING ERRCODE = 'check_violation';
  END IF;
  NEW.matched_at := now();
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.matched_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person who reconciles postings matches by hand, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.matched_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job matches in no one''s name' USING ERRCODE = 'insufficient_privilege';
  ELSIF NEW.kind = 'interest' AND num_nonnulls(NEW.claim_id, NEW.provider_adjustment_id) = 1 THEN
    -- The reconcile job of the image before docs/adr/0084, during a deploy or after a rollback: it credits interest
    -- from AMT I or the PLB L6 alone. Its insert is skipped (no row, no error), so the rest of its reconcile stands and
    -- the current image credits the interest once. The current image writes both records on every interest match.
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id AND r.status = 'loaded') THEN
    RAISE EXCEPTION 'a match is to a loaded remittance of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a match is to a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'claim' AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code <> '22') THEN
    RAISE EXCEPTION 'a claim match is of a claim of its remittance, never a reversal' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'posting' AND (NOT EXISTS (SELECT 1 FROM posting_row p WHERE p.id = NEW.posting_row_id AND p.practice_id = NEW.practice_id)
        OR (NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id))) THEN
    RAISE EXCEPTION 'a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'deposit' AND NOT EXISTS (SELECT 1 FROM eft_row e WHERE e.id = NEW.eft_row_id AND e.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a deposit match is of an EFT row of its practice' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'recoupment' AND NOT (
          EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'recoupment')
          OR EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code = '22')) THEN
    RAISE EXCEPTION 'a recoupment is a PLB WO or a reversing claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND (NEW.provider_adjustment_id IS NULL OR NEW.claim_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'interest')) THEN
    RAISE EXCEPTION 'interest is matched from a PLB L6 of its remittance, for a claim' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND NOT EXISTS (
          SELECT 1 FROM ledger_match c WHERE c.practice_id = NEW.practice_id AND c.service_line_id = NEW.service_line_id AND c.claim_id = NEW.claim_id
             AND c.kind IN ('claim', 'interest') AND c.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'interest reaches a line only through a claim the line has a standing match to' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ledger_match_rules() FROM PUBLIC;

-- 6. Interest a PLB L6 pays or takes back never sums past what it moved, netted only against the interest its
--    remittance's claims report the other way; and a line's interest, net of corrections and take-backs, never goes
--    below zero.
CREATE FUNCTION ledger_entry_within_interest() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  root ledger_entry;
  moved bigint;
  of_remittance uuid;
  reported_paid bigint;
  reported_taken bigint;
  paid_so_far bigint;
  taken_so_far bigint;
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
    SELECT -a.amount_cents, a.remittance_id INTO moved, of_remittance FROM provider_adjustment a
     WHERE a.id = NEW.evidence_id AND a.practice_id = NEW.practice_id AND a.category = 'interest' AND NEW.evidence_kind = 'provider_adjustment';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'interest is credited from the PLB L6 that pays or takes it back' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(sum(c.interest_cents) FILTER (WHERE c.interest_cents > 0), 0), coalesce(-sum(c.interest_cents) FILTER (WHERE c.interest_cents < 0), 0)
      INTO reported_paid, reported_taken FROM claim c WHERE c.remittance_id = of_remittance AND c.practice_id = NEW.practice_id;
    SELECT coalesce(sum(e.amount_cents) FILTER (WHERE e.amount_cents > 0), 0), coalesce(-sum(e.amount_cents) FILTER (WHERE e.amount_cents < 0), 0)
      INTO paid_so_far, taken_so_far FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.evidence_id = NEW.evidence_id AND e.stage = 'interest';
    IF NEW.amount_cents > 0 AND paid_so_far + NEW.amount_cents > greatest(moved, 0) + reported_taken THEN
      RAISE EXCEPTION 'interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.amount_cents < 0 AND taken_so_far - NEW.amount_cents > greatest(-moved, 0) + reported_paid THEN
      RAISE EXCEPTION 'interest a PLB L6 takes back never sums past what it took back, plus the interest its remittance reports paid' USING ERRCODE = 'check_violation';
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
      RAISE EXCEPTION 'a line''s interest, net of what the payer took back, never goes below zero' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_interest_line_floor';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entry_within_interest BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_interest();
REVOKE ALL ON FUNCTION ledger_entry_within_interest() FROM PUBLIC;
```

`ledger_match_rules` differs from its predecessor (`ledger_mig:316-374`) in exactly three places: `seq` in both
tuples of the immutability check; the `ELSIF` that skips the job's one-record interest match, placed after the actor
checks so a person's insert of that shape still reaches the interest branch and is refused; and the interest branch,
which replaces "interest is a PLB L6 or a claim's interest of its remittance" (the author diffed the two bodies).

---

## 6. Application changes

### 6.1 `packages/ledger` (pure, mutation-tested)

- **New `packages/ledger/src/interest.ts`.** The arithmetic of D2 to D6 and D10, so it is mutation-tested
  (`apps/worker/src/reconcile` is not; 15b design section 6). Every amount is `Cents` (bigint); nothing divides but
  `allocateByWeight`, which takes sizes (a negative draw is split by its size and negated back); every function throws
  `LedgerError` on a zero L6, a zero `a`, a negative weight or a write past what is left.
  - `referenceCandidates(reference)`: the whole reference, then its tokens (D2), in order and without repeats. The
    worker hashes each; the function never sees a hash or a claim.
  - `remittanceInterest({ adjustments, chains })` for one remittance (D4). `adjustments`: each L6's `id`, `position`,
    `cashCents` (positive paid, negative taken back), `namedChain` (the chain its reference names, or null) and
    `namedChainInRemittance`. `chains`: each chain of the remittance with AMT I, its `chain` and `reportedCents`
    (signed, netted per D3). Returns `draws` (`adjustmentId`, `chain`, `cents` signed, `shared`: the chain's amount was
    a share of a short pool) and `unattributed` (`adjustmentId`, `cents`).
  - `interestLeft({ draws, written })`: for each L6 and sign, and for each L6 and chain, what is left (D6), from the
    draws and the interest entries already written (`adjustmentId`, `chain`, `cents`), gross.
  - `interestToLines({ leftCents, shared, lines })`, `lines` each `serviceLineId`, `weight`, `matched`: splits
    `leftCents` (signed; zero gives nothing) over the lines not yet matched to the L6 whose weight is above zero, by
    `allocateByWeight`; a negative amount is first cut to the weights' sum (what the lines hold), so no part passes
    its line's weight. Each part is flagged `allocated` when `shared` or when two or more lines took nonzero parts
    (D10).
  - `interestHeld(entries, chainOfMatch)`: what each line holds of each chain, its interest entries from matches naming
    a claim of the chain, net of their corrections (`correctedEntry`) and of take-backs; the weights of a take-back.
- **`stages.ts`.** `STAGE_SIGN.interest` becomes `'signed'`. In `entryProblems`, a zero signed amount reads "an
  adjustment changes an amount" for an adjustment, as today, and "an interest entry moves an amount" for interest.
  `STAGE_EVIDENCE.interest`'s comment: "A PLB L6, paid or taken back; a claim (AMT I) only on entries written before
  docs/adr/0084." The arrays themselves are unchanged.
- **`index.ts`** exports the functions and their types. **`stryker/shards.json`** adds
  `packages/ledger/src/interest.ts` to the `money-ledger` shard's ledger list (`tools/stryker/shards.test.ts` holds
  every mutated file to exactly one shard). Target: 100% mutation score on `interest.ts`, as `payment.ts` holds.
- `totals.ts`, `roi.ts` and `statement.ts` need no change: they sum signed amounts, so "interest" becomes net of
  take-backs by itself.

### 6.2 The reconcile (`apps/worker/src/reconcile`)

- **`rem`**:
  - `providerAdjustments` reads L6s with no reference too: `(a.category = 'recoupment' AND a.reference IS NOT NULL)
    OR a.category = 'interest'` (`rem:788-793`), in the same order (D13). Its WO branch is unchanged.
  - Before the loop, a new `interestAttribution` reads, scoped by `practice_id`: every claim with `interest_cents <> 0`
    of the practice's loaded remittances (`id, remittance_id, interest_cents, claim_status_code`); each such claim's
    chain root and each claim a reference reaches (one recursive query up `reversal_of_claim_id` and back along
    `superseded_by_claim_id`, served by `claim_by_reversed` and `claim_by_superseded`); and the claims each L6's
    reference candidates reach (`referenceCandidates`, hashed with `cipher.lookupHash`, looked up by
    `claim_by_payer_claim_control_number`). It calls `remittanceInterest` for each remittance and keeps the draws by
    L6.
  - In the loop, an L6 calls a new `recordInterest` in place of today's (`rem:836-841`, `rem:863-910`): for each of
    the L6's draws, its lines (D5: the claim matches and their outcomes from `matches`; for a take-back,
    `interestHeld` over the entries read at the start and those this pass wrote), `interestLeft` and
    `interestToLines`; then each part with `insertMatch({ kind: 'interest', claimId, providerAdjustmentId,
    remittanceId: <the L6's>, serviceLineId, allocated, matchedBy: null })` (a `NewInterestMatch`, which requires both
    IDs) and `insertEntry({ stage: 'interest', amountCents, evidenceKind: 'provider_adjustment', evidenceId: <the L6>,
    matchId, allocated, createdBy: null })`. It keeps what it wrote, so a later L6 or draw of the same pass counts it.
  - `claimInterest` (`rem:845-860`) is removed: AMT I credits nothing by itself (D1).
  - `Counts` gains `interestTakenBack` (entries below zero); `interest` counts the positive ones. The job logs no new
    field (`job.ts:61-65` logs no counts), so `packages/observability/src/fields.ts`, a #42 file, is untouched.
  - `CHAIN_ORDER` orders by `m.seq` alone and still returns `matched_at`, which `reversalRule` compares with a
    reversal's load time (`rem:400`, `:488`). Its comment says the order is the ledger's own.
  - `everMatched` is unchanged; the interest path calls it with the L6's ID.
- **`rled`**: `ledgerMatches` orders by `m.seq` (`:103`). `insertMatch` keeps its SQL: a match with both IDs has the L6
  as its `evidence_id`, so `ON CONFLICT (kind, evidence_id, service_line_id)` is still the arbiter.
- **`statement-html.ts:114`**: the printed statement's interest sentence (section 7), with its assertion in
  `apps/worker/src/report/brand.test.ts:144`.
- **`pass.ts`**: the summary type carries `interestTakenBack`.
- No reference, token, claim number or amount is logged; the job's log fields are unchanged (`pnpm lint:logs`).

### 6.3 The web

- **`wq`**: the line's matches and the remittance's cash matches order by `m.seq` (`:482`, `:485`). `MATCH_SELECT`
  reads, for an interest match, whether its entry is below zero, and `MatchView` gains `takesBack: boolean` (by the
  entry's sign, not the L6's: one L6 may carry both, D1). The line view gains `reportedInterest`: each standing claim
  match of the line whose claim has `interest_cents > 0`, with the remittance's trace, payer and paid date and the
  amount, read from stored rows.
- **`page`**: the interest words of `MatchItem` (`:76`), the reported interest under the Interest list, and the
  section shown when the line has recoupments, interest or reported interest (`:191`). Words in section 7.
- **`apps/web/src/components/reconciliation/display.tsx:88`**: the totals tile's note.
- **`apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx:108`**: the ROI statement page's interest
  note, the same sentence as the printed statement's (section 7), so screen and paper agree.
- **`apps/web/src/lib/routes/specialist.ts:128-129`**: `ADJUSTMENT_CONSEQUENCE`.
- **`apps/web/src/lib/routes/reconciliation.ts`, `reverseMatchAction`** maps Postgres's refusal named
  `ledger_interest_line_floor` (the line-floor RAISE carries that constraint name, as `submit_screening`'s coded
  refusals do) to an input error on `matchId` (section 7), as `adjustEntryAction` maps its check violations to the
  amount (`specialist.ts:154-158`); any other error is left as it is. The page never offers a reversal of an interest
  match (`page:84`); the route still accepts one, which is how a person undoes an attribution they judge wrong.
- **`apps/web/src/lib/routes/test-support/ledger-world.ts:94-143`** seeds its 0.50 of interest as a PLB L6 of the
  adjusted remittance naming the adjusted claim, matched with both IDs; a claim-only interest match is not written now.

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
| Interest a PLB L6 paid (the match's entry is above zero) | ": PLB L6 interest" | ": interest paid in this check (PLB L6)" |
| Interest a PLB L6 took back (the match's entry is below zero) | (never written) | ": interest taken back in this check (PLB L6)" |
| An AMT I interest match written before this change (development data only) | ": the claim’s interest" | unchanged |

**Reconciliation, under a line's Interest list**, one sentence for each claim the line has a standing claim match to
that reports interest (new):

> Remittance {trace}, {payer}, paid {date}: the claim reports {amount} of interest (AMT I). Interest is counted only as
> a check pays it (PLB L6), in the list above.

The Interest list's empty text stays "No interest paid." The Recoupments and Interest pair now shows when the line has
recoupments, interest or reported interest.

**Reconciliation, the totals tile** (`display.tsx:88`): label "Interest" unchanged; note "paid by the payer, apart from
principal" becomes:

> paid by the payer, net of any it took back, apart from principal

**The ROI statement, printed and on screen** (`statement-html.ts:114` and `reports/roi/[statementId]/page.tsx:108`, the
same sentence in both today): "Interest, net" and "No interest was paid in the period." unchanged; the explanation
"Interest the payer paid in the period, shown apart from principal." becomes, in both:

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
- interest reaches a line only through a claim the line has a standing match to
- interest is credited from the PLB L6 that pays or takes it back
- interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back
- interest a PLB L6 takes back never sums past what it took back, plus the interest its remittance reports paid
- a line's interest, net of what the payer took back, never goes below zero

The job's one-record interest match (the previous image's) has no sentence: it is skipped, not refused (D16).

`allocated` keeps its words, " (allocated pro rata)" (`page:115`, `abstraction/ledger/page.tsx:68`,
`components/reports/roi.tsx:64`); after N1 they appear only on a real split. The remittance page's "Interest (L6)"
category name is unchanged.

**These screens change, so the PR takes the UX and brand review** (`.claude/agents/ux-brand-reviewer.md`) as one of
its two adversarial reviews, with before and after shots at 1280 and 390 px (LANES.md rule 1): Reconciliation with a
line holding interest paid, interest taken back and reported interest; the Reconciliation totals; the ledger review's
adjustment form; the ROI statement page and the printed ROI statement. The tour's synthetic world adds LED-23's and
LED-24's files.

---

## 8. Tests

Every test below is written first and fails on e908c21 where marked "fails today"; the build makes it pass. IDs are
the reserved LED-23 to LED-25.

### 8.0 The prototypes (author, 2026-10-27)

**Run 1** (`scratchpad/probes/author/interest-author-proto.mts`, database `tp_design_interest_3`, dropped) applied the
first draft after e908c21's 44 migrations and #42's, on rows the current code had written. Still true of run 2: both
CHECKs validate against stored rows, `seq` numbers the 8 stored matches 1 to 8, an INSERT naming no `seq` (the
previous image's) is numbered next, every refusal fires at its boundary and not before, and the plans read
`claim_by_superseded`, `ledger_match_by_seq` and `ledger_entry_by_evidence`
(`scratchpad/probes/author/interest-author-plans.mts`, `tp_design_interest_4`, dropped). What the review changed (the
skip, the claim reach, the per-sign bound) is what run 2 checks.

**Run 2** (`scratchpad/probes/author/run2/proto2.mts` on its own database `tp_design_interest_41`): migrated from
empty through e908c21's 44 migrations and #42's `20261107090000_mail_streams.sql` at 6f23c42b; two practices given
interest by the current code (Z: LED-16's AMT I alone; H: AMT I with an L6 of +5.40); then section 5.3's SQL applied
by the real runner as `20261110090000`; then the previous image's reconcile (this checkout's worker, e908c21) run for
real on Z and on a third practice M staged after the migration; then the checks below as the job (`withJobScope`) or
as the billing manager, each job block in a rolled-back transaction; then dropped. Output
(`scratchpad/probes/author/run2/proto2.out`), without the plan lines (the empty tables' plans say nothing; the next
block has them with rows):

```
phase 1 migrated 45, last 20261107090000_mail_streams.sql
phase 1: Z interest 1:claim:240 2:claim:300; H interest 1:claim:240 2:claim:300
phase 2 migrated 20261110090000_ledger_interest_once.sql
seq: [{"n":8,"distinct_seq":8,"min":1,"max":8,"all_set":true}]
objects: [{"indexes":2,"owner":"tp_owner","acl":"{tp_owner=X/tp_owner}","evidence_valid":true,"sign_valid":true,"before_insert_triggers":"ledger_entry_rules,ledger_entry_within_evidence,ledger_entry_within_interest,ledger_entry_within_line","forced":true}]
previous image reconcile of Z (a new L6 naming its correction): completed {"interest":0}
  Z interest entries after it: 1:claim:240 2:claim:300; interest matches 2 -> 2
previous image reconcile of M (AMT I -2.00 and 5.40, L6 -3.40 naming nothing): completed; claim matches 2, interest matches 0
Z (L6 -540 in a later remittance naming the correction, whose claims report no interest; legacy AMT I credits stand):
  T1 claim-only interest match by the job (the previous image's AMT I shape): ok, 0 row {}
  T1b L6-only interest match by the job (the previous image's L6 shape): ok, 0 row {}
  T8 a claim the line has no standing match to (its own original): refused: interest reaches a line only through a claim the line has a standing match to
  T8b the reversal (no standing match to the line): refused: interest reaches a line only through a claim the line has a standing match to
  T9 an L6 of another remittance than the match: refused: interest is matched from a PLB L6 of its remittance, for a claim
  T2 the L6 and the claim, line 1: ok, 1 row {"id":"ffaf8d60-e1aa-4441-80f7-888a45e658c4","seq":"20","evidence_is_l6":true}
  T2 the L6 and the claim, line 2: ok, 1 row {"id":"e3489bd0-be63-4f9d-8d0b-67d40477c67f","seq":"21","evidence_is_l6":true}
  T-neg -1 on a paying L6 whose remittance reports no paid interest: refused: interest a PLB L6 takes back never sums past what it took back, plus the interest its remittance reports paid
  T-claim an interest entry whose evidence is a claim: refused: an entry carries its match's evidence, for its match's line
  T3 entry 240 line 1: ok, 1 row {"amount_cents":"240"}
  T3 entry 301 line 2 (541 of 540): refused: interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back
  T3 entry 300 line 2 (540 of 540): ok, 1 row {"amount_cents":"300"}
  P1 a person's claim-only interest match: refused: interest is matched from a PLB L6 of its remittance, for a claim
  a person reversed line 1's approval by the correction
  T10 the L6 and the correction on line 1 (no standing claim match; a standing interest match names it): ok, 1 row {"id":"5bac39b1-ac66-4c81-b597-f4852591429a","seq":"23","evidence_is_l6":true}
H (L6 +540 takes interest back in the remittance whose correction reports AMT I 5.40; legacy AMT I credits 240 and 300 stand):
  H dual match line 1: ok, 1 row {"id":"95363b81-58b5-4424-8fd1-cfb1e367f75d","seq":"24","evidence_is_l6":true}
  H dual match line 2: ok, 1 row {"id":"77e3bd8d-491e-4b26-b0b0-6c92a55905a0","seq":"25","evidence_is_l6":true}
  H +1 on a take-back L6 whose remittance reports no take-back: refused: interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back
  H -241 line 1 (line net -1): refused: a line's interest, net of what the payer took back, never goes below zero [ledger_interest_line_floor]
  H -240 line 1 (line net 0): ok, 1 row {"amount_cents":"-240"}
  H -301 line 2 (line net -1): refused: a line's interest, net of what the payer took back, never goes below zero [ledger_interest_line_floor]
  H -300 line 2 (line net 0; 540 taken of 540): ok, 1 row {"amount_cents":"-300"}
M (one L6 -340 naming nothing; its remittance reports AMT I +5.40 and -2.00, so it may pay up to 5.40 against a take-back of 2.00):
  M dual match line 1: ok, 1 row {"id":"571d37e8-416d-4d80-bb61-eb696f088702","seq":"26","evidence_is_l6":true}
  M dual match line 2: ok, 1 row {"id":"e7614fde-2d71-47fa-a420-c34095f74cc6","seq":"27","evidence_is_l6":true}
  M +240 line 1: ok, 1 row {"amount_cents":"240"}
  M +301 line 2 (541 > 340 + 200): refused: interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back
  M +300 line 2 (540 = 340 + 200): ok, 1 row {"amount_cents":"300"}
dropped tp_design_interest_41
```

What it shows:
- The migration applies after #42's on rows the current code wrote: both CHECKs validate against them, `seq` numbers
  the 8 stored matches 1 to 8, both functions are owned by `tp_owner` with no grant beyond the owner's, `ledger_match`
  keeps FORCE ROW LEVEL SECURITY, and `ledger_entry`'s BEFORE INSERT triggers fire in the order section 5.1 relies on.
- **The previous image reconciles whole** (D16): on Z, with a new L6 to credit, it completed and wrote no interest
  match; on M, it wrote both claim matches and no interest. Run 1's first draft refused the same reconcile.
- As the job, the previous image's two shapes return no row and no error (T1, T1b); as a person, the same shape is
  refused (P1).
- Every new rule refuses at its boundary and accepts it: 540 of a 540 L6 (T3); a line at zero after a take-back (H);
  and, on M, 540 paid from an L6 of 340 whose remittance reports a 2.00 take-back (340 + 200), but not 541. A negative
  entry on a paying L6 whose remittance reports no paid interest is refused (T-neg), and so is a positive one on a
  take-back L6 whose remittance reports none taken back (H +1).
- A take-back reaches a line through the claim's standing interest match after a person reversed the line's approval
  (T10); a claim with neither match (the original, the reversal) does not (T8, T8b).
- An interest entry whose evidence is a claim is refused first by the frozen `ledger_entry_rules` (its evidence must be
  the match's, the L6); the new trigger's own refusal stands behind it.

**Plans with rows** (`scratchpad/probes/author/run2/plans2.mts` on `tp_design_interest_42`: migrated from empty
through section 5.3's SQL, then 50,000 claims over 1,000 remittances, 50,000 claim matches over 10,000 lines and
100,000 entries in two practices, bulk-inserted as the superuser with triggers off, analysed; dropped):

```
migrated 46, last 20261110090000_ledger_interest_once.sql
rows {"claims":50000,"matches":50000,"entries":100000}
plan superseded (walk back from a correction): Index Scan using claim_by_superseded on claim | Index Cond: (superseded_by_claim_id = '…')
plan matches in order: Sort | Sort Key: seq | ->  Seq Scan on ledger_match | Filter: (practice_id = '…')
plan an L6 interest sum: Aggregate | ->  Index Scan using ledger_entry_by_evidence on ledger_entry e | Index Cond: (evidence_id = '…') | Filter: ((practice_id = '…') AND (stage = 'interest'::text))
plan a remittance reported interest: Aggregate | ->  Bitmap Heap Scan on claim c | Recheck Cond: (remittance_id = '…') | Filter: (practice_id = '…') | ->  Bitmap Index Scan on claim_once | Index Cond: (remittance_id = '…')
plan a claim reaching a line: Index Scan using ledger_match_by_line on ledger_match c | Index Cond: ((practice_id = '…') AND (service_line_id = '…')) | Filter: ((reversed_at IS NULL) AND (kind = ANY ('{claim,interest}'::text[])) AND (claim_id = '…'))
plan a line interest sum: Aggregate | ->  Index Scan using ledger_entry_by_line on ledger_entry e | Index Cond: ((practice_id = '…') AND (service_line_id = '…')) | Filter: (stage = 'interest'::text)
dropped tp_design_interest_42
```

Every new lookup reads its index: the walk back from a correction (`claim_by_superseded`), the L6's entries
(`ledger_entry_by_evidence`), the remittance's reported interest (`claim_once`), a claim reaching a line
(`ledger_match_by_line`) and a line's interest (`ledger_entry_by_line`). A practice's matches in order were read by a
scan and a sort, the right plan when one practice holds half the table; LED-25's large test spreads its rows over
twenty practices, where `ledger_match_by_seq` serves the order.

### 8.1 Test matrix rows (exact; `docs/product/test-matrix.md` after LED-18, and word for word in `packages/synth/src/cases/matrix.ts`)

| ID | Case | Expected |
|---|---|---|
| LED-23 | A remittance's interest reported on its claims (AMT I) and paid at the provider level (PLB L6) | Credited once per line, from the PLB L6: to the claim its reference names, whole or among other identifiers, or shared by the remittance's AMT I netted per claim and its reversals and corrections, exactly when the PLB L6s equal that AMT I and never past what each reports otherwise; a named PLB L6 above its claim's AMT I first pays the remittance's other reported interest. AMT I with no PLB L6 in its check counts nowhere and is shown as reported. A reversal and correction whose AMT I nets to zero add no interest, beside another claim or not, and a PLB L6 in a later remittance naming the claim is credited once |
| LED-24 | One PLB L6 over lines approved at different times, or attributed again after a later upload; then interest taken back | Its entries never sum past what its attribution gives it, however many reconciles run and whatever a later upload changes about the claim it names, and every reconcile completes; an entry is flagged allocated only when its amount is one of two or more parts of a pro-rata split. Interest taken back, by a reversal alone, after a restatement, or netted in one PLB L6 with interest paid, is a negative interest entry against the lines holding that claim's interest, never below zero on a line, and the interest total is net of it. Postgres refuses an interest match without its PLB L6 and claim, an entry past its PLB L6's bound either way, and a line's interest below zero; it skips the reconcile job's interest match that carries only one of them |
| LED-25 | A line's chain read back | Its matches in the order the ledger made them, within one reconcile and across reconciles, never by their IDs; the claims a correction supersedes found by index at 50,000 claims |

### 8.2 `packages/synth` cases (module 6, LED; `registry.ts` and the generated `fixtures/synthetic`)

On LED-16's two-line case (allowed 70.00 to 100.00 on 97110 and 97110-59; the correction pays 24.00 and 30.00 more),
one practice per variant; "another patient's claim" is a claim on no case line.
- **LED-23** (`workflow.led23`):
  - `paired.835`: the correction with AMT I 5.40 and `PLB L6:<its CLP07>*-5.40`, BPR02 59.40 (V07's shape). Expected:
    interest 2.40 and 3.00 from the L6, allocated; total 5.40.
  - `unnamed.835`: the same with another patient's claim reporting AMT I 2.00 and one `PLB L6*-7.40` naming nothing.
    Expected: 2.40 and 3.00 from the L6; the other 2.00 on no case line.
  - `named-net.835`: as `unnamed.835`, the L6 naming the correction (`L6:<its CLP07>*-7.40`). Expected: 2.40 and 3.00;
    the other 2.00 is the other claim's (today 7.40 reaches the case lines, and 5.40 more from AMT I).
  - `identifiers.835`: as `paired.835`, the L6's reference `"<CLP01> <CLP07> <TRN02>"`. Expected: 2.40 and 3.00.
  - `reported-only.835`: AMT I 5.40 and no L6, BPR02 54.00. Expected: no interest entry; the reported sentence.
  - `net-zero.835` after `paired.835`: the correction reversed (AMT I -5.40) and corrected again, line 1 allowed 2.00
    more and paid 2.00 more (AMT I 5.40), with no L6 (RFI 1324's shape). Expected: line 1 approved 2.00 more; no new
    interest entry (today the new correction's AMT I is credited again). The allowed amount moves too, because the
    same allowed amount paying more is "no change" (`packages/ledger/src/payment.ts:390-392`).
  - `net-zero-beside.835` after `paired.835`: the same pair beside another patient's claim reporting AMT I 2.00, and
    one `PLB L6*-2.00` naming nothing. Expected: no new interest on the case lines.
  - `later-l6.835` after `reported-only.835`: a later remittance whose `PLB L6:<the correction's CLP07>*-5.40` pays it.
    Expected: 2.40 and 3.00, dated by the later remittance.
- **LED-24** (`workflow.led24`):
  - `first.835` then `second.835`, probe R's shape: the first raises line 1's payment and line 2's allowed amount but
    not its payment, with `PLB L6:<CLP07>*-5.40`; a month later the second, a correction with the same CLP07, pays
    line 2 more. Expected: 5.40 on line 1, not allocated; nothing on line 2, after any number of reconciles, each
    completing.
  - `paired.835` then `taken-back.835`: the correction reversed alone (AMT I -5.40, paid -160.00) with
    `PLB L6*5.40` naming nothing, beside another patient's claim so the check stays positive. Expected: interest
    -2.40 and -3.00, total 0.00; the principal recouped as LED-12.
  - `paired.835`, `restated.835` (the correction reversed and corrected again with the same allowed and paid amounts:
    "no change" on both lines; AMT I -5.40 and 5.40; no L6), then `restated-taken-back.835` (the restatement reversed
    alone, AMT I -5.40, `PLB L6*5.40`). Expected: -2.40 and -3.00.
  - `paired.835` then `both-ways.835`: the correction reversed alone (AMT I -5.40) and another patient's claim
    reporting AMT I 2.00, with one `PLB L6*3.40` naming nothing. Expected: -2.40 and -3.00 on the case lines.
  - `short.835`: AMT I 5.40 on the correction and 2.00 on another patient's claim, `PLB L6*-5.00` naming nothing.
    Expected: 3.65 for the correction (1.62 and 2.03 by payment), allocated.
  - `out-of-order-2.835` uploaded before `out-of-order-1.835`: the second carries the correction with AMT I 5.40 and
    `PLB L6:<the CLP07 of another patient's claim in the first>*-5.40`; the first carries that claim. Expected: 2.40
    and 3.00 after the second; after the first is uploaded, nothing more, and the reconcile completes.
- **LED-25**: a registry entry with no file (`none(9, ...)`): database tests.
- **LED-16's fixture** takes its own design's shape (lane-b-pr15b.md section 3.5): `two-lines-adjusted.835` gains
  `PLB L6:<the corrected claim's CLP07>*-5.40` and BPR02 59.40. Its expected interest (2.40 and 3.00, allocated) is
  unchanged; the evidence becomes the L6. Without it, LED-16 would assert 5.40 of interest the check never paid.

### 8.3 What each test proves

| Test | ID | Proves | Today |
|---|---|---|---|
| `packages/ledger/src/interest.test.ts`, unit | LED-23, LED-24 | Each worked case of section 4.1 by hand, and `referenceCandidates` on the whole reference, its tokens, hyphens kept | new file |
| `interest.test.ts`, fast-check properties | LED-23, LED-24 | For any remittance of one to four L6s (either sign; naming nothing, a chain in the remittance or a chain outside it) and one to five chains (either sign, some a reversal and correction that net): every draw names one L6; each L6's draws, its unattributed rest and nothing else add up to its cash; in the exact case each chain draws exactly its reported interest, otherwise every draw has the net's sign and none passes its chain's report; each L6's draws of each sign stay within the Postgres bound, computed separately from the remittance's claims; an AMT I with no L6 gives nothing. Over any sequence of reconciles, with weights, held amounts and the attribution itself changing between them (a named set growing, a pooled L6 becoming named): nothing is written past what is left, a second call with the first call's writes gives nothing, no take-back passes what a line holds, and `allocated` holds exactly when two or more nonzero parts were split | new file |
| Mutation, `money-ledger` shard | LED-23, LED-24 | `interest.ts` at 100% (every surviving mutant killed or recorded as equivalent) | new file |
| `packages/ledger/src/stages.test.ts`, `rules.test.ts` | LED-24 | `STAGE_SIGN.interest` is `'signed'`; a negative interest entry has no problem, a zero one has "an interest entry moves an amount" | fails today (positive) |
| `apps/worker/src/reconcile/interest.db.test.ts` (new) | LED-23 | The eight LED-23 variants as their expected outcomes; every interest match the reconcile wrote carries the L6 and a claim, and every entry's evidence is the L6 (the guard that the skip of D16 can never hide the current image's own match) | fails today: 1080, 540 credited from AMT I alone, +540 on net zero, 1080 for the later L6, the reference with identifiers never credited |
| `interest.db.test.ts` | LED-24 | The six LED-24 variants; a second and third reconcile write nothing and complete; then by hand: as the job, a claim-only and an L6-only interest match return no row and no error; as the billing manager, a claim-only one is refused; an L6 of another remittance, a claim the line has no standing match to, a positive entry past its L6's bound, a negative entry on an L6 whose remittance reports no paid interest and an entry whose evidence is a claim are refused; a claim reached through a standing interest match after a person reversed the line's approval is accepted; and, as a specialist through `adjustEntry`, an adjustment taking a line below zero after a take-back is refused with its sentence | fails today: 840, allocated on one line, every take-back dropped, every refusal accepted |
| `apps/worker/src/reconcile/ledger-oracle.db.test.ts` | LED-23, LED-24 | Two appended cases from the synth `expected.json`; the original six and LED-14 to LED-17 unchanged (LED-16 against its corrected fixture) | appended |
| `payment-terms.db.test.ts:537-552`, `ledger.db.test.ts:279-294` (LED-06's PAR-18 block) | LED-16, PAR-18 | Same amounts; the evidence and the match's claim asserted | updated |
| `apps/worker/src/reconcile/chain.db.test.ts` | LED-25 | Two matches inserted in one transaction whose UUIDs sort against their order read back in insertion order from `ledgerMatches`, `CHAIN_ORDER` and the web's line query; an update of `seq` is refused; an INSERT that names no `seq` (the previous image's) is numbered next | fails today: UUID order |
| `apps/worker/src/reconcile/chain.large.db.test.ts` (new) | LED-25 | 50,000 synthetic claims bulk-inserted as the owner (one in twenty superseded) and 100,000 ledger entries over twenty practices, analysed: `claimLines`' recursive lookup, `unmatched.ts:187`'s EXISTS and the attribution's walk back use `claim_by_superseded`; a practice's matches in order use `ledger_match_by_seq`; the new trigger's reads use `ledger_entry_by_evidence`, `claim_once` and `ledger_entry_by_line`, and `ledger_match_rules`' new lookup `ledger_match_by_line` (EXPLAIN) | fails today: sequential scan of `claim`; no `seq` |
| `apps/worker/src/report/brand.test.ts:144` | LED-24 | The printed statement's new interest sentence | fails today (old sentence) |
| `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` | LED-23, LED-24 | The line view's interest words, `takesBack` by the entry's sign, the reported-interest rows and the reverse route's refusal on `matchId`; the route world's interest reseeded as an L6 | fails today |
| `apps/web/e2e/ledger-interest.spec.ts` (new) | LED-23 | A billing manager opens Reconciliation for `paired.835`: the line's "interest paid in this check (PLB L6)", entries 2.40 and 3.00, the totals tile's Interest 5.40 (10.80 today); for `reported-only.835` the reported sentence and "No interest paid."; the period's ROI statement, generated as J10 does (`reconciliation.spec.ts:235`), shows the new interest note; axe passes | fails today |
| Catalog, cross-tenant, `pnpm db:domain-model --check --require-approval` | (CI) | No list changes; the regenerated model and function files are current and approved | must pass |

The screening-capacity gate runs on this PR (`tools/screening-capacity/watched-paths.txt` lists
`apps/worker/src/reconcile/remittances.ts`, `ledger.ts`, `statement-html.ts` and the files of `packages/ledger/src`;
`interest.ts` joins them when the list is regenerated); its result goes in the PR description.

---

## 9. The domain model and the records

### 9.1 Regeneration

- `pnpm db:domain-model --out` on a database migrated from empty writes `docs/product/domain-model.md` and
  `packages/db/functions/*.sql`. This PR changes `ledger_match_rules.sql` (its body) and adds
  `ledger_entry_within_interest.sql`; the trigger lists in the headers of other function files do not change.
- The model gains: `ledger_match.seq` (identity) and `ledger_match_by_seq`; the new text of `ledger_match_evidence`
  and `ledger_entry_sign`; the trigger `ledger_entry_within_interest` and its four refusals; `ledger_match_rules`' two
  interest refusals in place of "interest is a PLB L6 or a claim's interest of its remittance" (`domain-model.md:3721`),
  and its skip of the job's one-record interest match; `claim_by_superseded` when this PR carries it. No table, area
  (`packages/db/domain-model/areas.json`) or registry row changes, and the data dictionary lists neither
  `ledger_match` nor these columns.
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
  2), the options of section 3, Decision (D1 to D16), Consequences (section 12), What does not change (D14), and the
  founder's exception quoted with its date.
- **ADR 0042**, "Recoupments and interest" (`:96-97`): "A PLB L6, or a claim's AMT I (now loaded into
  `claim.interest_cents`), writes an interest entry beside principal." becomes "A PLB L6 writes an interest entry
  beside principal, positive when it pays interest and negative when it takes interest back, for the case lines of the
  claims it is for: those it names, or, when it names none, those whose AMT I reports interest in its remittance, a
  claim's reversal and correction netted (docs/adr/0084)." Its status line gains "amended by 0084".
- **ADR 0067**: the interest bullet (`:163`) and consequence (`:234`) gain "(the interest itself is the PLB L6's since
  docs/adr/0084)".
- **PRD 13** (`docs/product/PRD.md:548`), the founder's text under the exception (section 10): "Interest paid by the
  payer (PLB L6, or a line-level interest amount) is recorded as its own positive entry category `interest` and shown
  separately from recovered principal." becomes:

  > Interest the payer pays (PLB L6) is recorded as its own entry category `interest`, against the case lines of the
  > claims it is for (the claims the PLB L6 names, or, when it names none, those its remittance reports interest on in
  > AMT I, a claim's reversal and correction netted), positive when paid and negative when the payer takes it back,
  > and shown separately from recovered principal. Interest a claim reports (AMT I) that no PLB L6 pays is shown as
  > reported and counted nowhere.

- **reconciliation-001.md**, "Ledger semantics", after PR 15b's amendments:

  > *Amended (Lane A, `co-001/ledger-interest-once`; the founder's freeze exception of {date}; docs/adr/0084):* one
  > migration alters `ledger_match` (the interest branch of `ledger_match_evidence`, the column `seq` and its index,
  > `ledger_match_rules()`) and `ledger_entry` (`ledger_entry_sign` for interest, the trigger
  > `ledger_entry_within_interest`). Interest is credited from the PLB L6 and attributed by AMT I; interest the payer
  > takes back is a negative interest entry; the reconcile job's interest match carrying only one of the two records
  > (the image before this change) is skipped. `packages/ledger` adds `interest.ts`, and `STAGE_SIGN.interest` becomes
  > signed. The stage CHECK's seven values, recovered, the proof cap, `roi_statement` and LED-01 to LED-18's amounts
  > are unchanged; the oracle appends LED-23 and LED-24, and LED-16's fixture carries the PLB L6 its design gave it.

  and a row for this pull request in its list of Lane A's pull requests.
- **Test matrix** rows of 8.1, and `packages/synth` `matrix.ts` and `registry.ts` of 8.2.

---

## 10. What the founder must approve or rule

Only two things, both kept for the founder by CLAUDE.md and LANES.md (the domain model's approval, and a freeze
exception, which here also changes PRD 13's ruled wording). Everything else in this design is an engineering or
wording choice inside them, taken as recommended under the standing rule. No legal text changes, and no founder
ruling is reversed.

### 10.1 The ledger freeze exception (needed before the build starts)

Proposed text, ready to grant as it stands. SUITE-CAP-1's design asks for its own ledger exception (its Q1, the lock
key of `ledger_entry_within_evidence()` and `ledger_entry_within_line()`); the two touch different functions and can
be granted together, and whichever PR lands second builds on the first's bodies.

> **Ledger freeze exception, interest credited once (Lane A, `co-001/ledger-interest-once`, docs/adr/0084).** Granted
> for one pull request into `claude/build-platform`, an exception to reconciliation-001's "Ledger semantics" covering
> exactly:
>
> **DDL** (one migration): the interest branch of `ledger_match_evidence` takes one or both of `claim_id` and
> `provider_adjustment_id`; `ledger_match.seq` (an identity) and the unique index `ledger_match_by_seq`;
> `ledger_match_rules()` recreated with `seq` among the columns that never change, the reconcile job's interest match
> carrying only one of the two records skipped, and the new interest rules; `ledger_entry_sign` allows a negative
> interest entry; the trigger `ledger_entry_within_interest` on `ledger_entry`; and the index `claim_by_superseded` on
> `claim` unless SUITE-CAP-1 has made it.
>
> **Behaviour:**
> 1. Interest is credited only from a PLB L6, once per PLB L6 and case line, never past what its attribution gives it
>    however many reconciles run or later uploads change; a claim's AMT I never credits interest by itself.
> 2. A PLB L6 names a claim by its whole reference or, failing that, by one of the identifiers in it. One that names
>    none is attributed by its remittance's AMT I, netted per claim and its reversals and corrections: exactly when the
>    PLB L6s equal that AMT I, otherwise never past what each reports and only in the net's direction. A named PLB L6
>    above its claim's AMT I first pays the remittance's other reported interest.
> 3. AMT I with no PLB L6 paying it counts nowhere and is shown as reported.
> 4. A PLB L6 that takes interest back writes a negative interest entry against the lines holding that claim's
>    interest, never below zero on a line; one PLB L6 may carry entries of both signs when it nets interest paid
>    against interest taken back; PRD 13's sentence on interest is replaced by the text in this design's section 9.2.
> 5. An entry is flagged allocated only when its amount is one of two or more parts of a pro-rata split (N1).
> 6. Matches are read in `ledger_match.seq` order, which is the order reversal take-backs walk a line's chain in.
> 7. Postgres refuses an interest match without its PLB L6 and a claim the line has a standing match to, an interest
>    entry whose evidence is not a PLB L6, an entry past its PLB L6's bound either way, and a line's interest below
>    zero; it skips, without error, the reconcile job's interest match that carries only one of the two records, so
>    the image before this change reconciles without interest during the deploy and after a rollback.
>
> **Files:** that migration; `packages/ledger/src/interest.ts` (new) and its tests, `stages.ts` (`STAGE_SIGN.interest`
> and the zero-amount problem's words), `stages.test.ts`, `rules.test.ts` and `index.ts`; `stryker/shards.json`; in
> `apps/worker/src/reconcile`, `remittances.ts` (the interest path, the L6 query and `CHAIN_ORDER`), `ledger.ts`
> (`ledgerMatches`' order and the interest match's type), `pass.ts` and `statement-html.ts`, with
> `apps/worker/src/report/brand.test.ts`'s assertion of that sentence; the web's reconciliation queries, page, totals
> note, adjustment consequence and reverse route, and the ROI statement page's interest note; the Drizzle mirror;
> LED-16's fixture (its PLB L6) and the tests of LED-16 and PAR-18 (`payment-terms.db.test.ts`, `ledger.db.test.ts`;
> their evidence); the ledger oracle (LED-23 and LED-24 appended); ADR 0042, ADR 0067, ADR 0084, PRD 13 and
> reconciliation-001.
>
> **Stays frozen:** `LEDGER_STAGES`, the seven entry types and the stage CHECK; the definition of recovered and the
> proof cap; `roi_statement` and its rules; `ledger_entry_rules`, and the checks of `ledger_entry_within_evidence` and
> `ledger_entry_within_line` (SUITE-CAP-1's own exception changes only their lock key); `posting_row` and `eft_row`;
> every principal amount (approved, posted, deposited, recouped), the WO and reversal rules (the WO's naming
> included) and the matching of claims, postings and deposits; the order the reconcile walks provider adjustments in;
> LED-01 to LED-18's amounts; the ledger oracle's harness.

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
`ledger-oracle.db.test.ts`, `payment-terms.db.test.ts`, `ledger.db.test.ts`; `apps/worker/src/report/brand.test.ts`;
`apps/web/src/lib/reconciliation/queries.ts`, `apps/web/src/app/p/[practiceId]/reconciliation/page.tsx`,
`apps/web/src/app/p/[practiceId]/reports/roi/[statementId]/page.tsx`, `apps/web/src/components/reconciliation/display.tsx`,
`apps/web/src/lib/routes/specialist.ts`, `apps/web/src/lib/routes/reconciliation.ts`,
`apps/web/src/lib/routes/test-support/ledger-world.ts`, `apps/web/src/lib/routes/reconciliation-routes.db.test.ts`;
`packages/db/src/schema/ledger.ts` (`seq`, `ledger_match_by_seq`) and `remittances.ts` (`claim_by_superseded`, when
this PR carries it); `packages/synth/src/cases/workflow.ts` (LED-16's PLB L6; LED-23 and LED-24), `registry.ts`,
`matrix.ts`; `fixtures/synthetic/LED-16/two-lines-adjusted.835` and its `expected.json` (generated);
`docs/product/domain-model.md` and `packages/db/functions/ledger_match_rules.sql` (generated);
`docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`, `docs/product/PRD.md`, `docs/adr/0042-….md`,
`docs/adr/0067-….md`; `tools/screening-capacity/watched-paths.txt` (regenerated by `watched.ts --write`).

**#42's files among them** (`scratchpad/progress/interest-author-42files-run2.txt`, 212 files at 6f23c42b):
`docs/product/domain-model.md`, `docs/product/test-matrix.md`, `docs/product/reconciliation-001.md`,
`packages/synth/src/cases/matrix.ts`, `registry.ts`, `tools/screening-capacity/watched-paths.txt`, and the generated
`packages/db/functions` directory (#42 changes only headers among the function files this PR reads, and
`ledger_match_rules.sql` not at all). #42 merges first, so each is then a base file: the generated ones are
regenerated on the merged tree and the shared documents keep both PRs' text (LANES.md rule 6).
`packages/db/domain-model/areas.json` is also #42's; this PR adds no table, so it does not change it. No other file of
this PR is #42's: not `packages/db/src/schema/ledger.ts` or `remittances.ts`, not `fields.ts`, not `settings.ts`.

**Other open work.** SS-01 and SUITE-CAP-1 come before this PR in Lane A's chain; SUITE-CAP-1 shares
`claim_by_superseded`, `docs/product/domain-model.md`, the function directory and `watched-paths.txt`, and neither
touches `ledger_match_rules`. Among Lane B's work, the UX table-scroll PR may touch the reconciliation page's tables,
and the Verified seal (LANES.md's queue item 6, written there as "#46"; queued, not started; PR #46 itself was the
merged database-function diffs) owns the ROI pages and `apps/worker/src/report`: this PR changes one sentence on the
ROI statement page and its assertion in `brand.test.ts`, so whichever lands second keeps both (LANES.md rule 6).

---

## 12. Risks

1. **PLB03-2 conventions vary.** A reference that names the claim only by something other than CLP07 (its patient
   control number, which has no stored hash), or that runs identifiers together with no separator, names nothing and
   is shared by its remittance's AMT I: right when the remittance carries AMT I, which the guide requires. With
   neither, nothing is credited (an understatement); the remittance page still lists the L6. A token that happens to
   equal another claim's control number names that claim; two chains reached name nothing, so the worst case is one
   wrong chain with exactly one match, bounded by the L6's amount.
2. **A payer whose L6s do not equal its AMT I** gets the conservative reading (D4 step 3): only the net moves, never
   more than the claims report. When such a payer nets interest paid against interest taken back in one L6, the case
   lines show less movement than happened both ways; the total is still the cash.
3. **A payer that reports AMT I and never sends the L6** (against RFI 2202) loses that interest from the figure, by
   design: the check does not hold it. The line shows the reported amount. A payer that folds interest into CLP04 has
   it counted once, as principal (section 14).
4. **The deploy window and a rollback** (D16): the previous worker credits no interest until the current one runs.
   Nothing fails and nothing is written twice; the interest figure lags by at most the window.
5. **The first attribution stands** (D6): when a later upload changes whom an L6 names, what it already gave stays
   where it went, visible on the line, and a person may reverse that match through the route if they judge it wrong;
   the L6 is then spent (a reversal is final), which understates rather than double counts.
6. **Rows written before the change** keep their double counts; only synthetic development data holds them (ADR 0067),
   and it is regenerated. An old L6-only interest match names no claim, so a take-back cannot reach it.
7. **Negative interest in readers that assumed positive.** Checked: `entryProblems` (changed, and used only inside
   `packages/ledger`), the totals and the ROI statement (signed sums), `<Money>` (prints a minus), `roi_statement`'s
   `interest_cents` (no sign CHECK, `ledger_mig:251`). The Verified seal reads recovered only. The packets' prompt-pay
   interest (`packages/packets/src/interest.ts`) is another concept and is untouched.
8. **The take-back needs the chain linked** (`reversal_of_claim_id` and `superseded_by_claim_id`, set by the loader,
   out-of-order uploads included). An unlinked reversal is its own chain and takes nothing back through AMT I; a
   take-back L6 that names the claim still works.
9. **Lock alignment with SUITE-CAP-1.** The new trigger takes `'ledger:' || practice_id`, the key every ledger writer
   already holds and the key SUITE-CAP-1 moves the other two ledger triggers to.

---

## 13. The builders' slices, in order

1. **Ledger core** (`packages/ledger`): `interest.ts` with its unit and property tests, `stages.ts`, `index.ts`, the
   stryker shard; mutation at 100% on `interest.ts`. Independent of the rest.
2. **Schema** (beside slice 1): the migration on the then-latest base (diff `ledger_match_rules` first; leave out
   `claim_by_superseded` if SUITE-CAP-1 made it), the Drizzle mirror, `pnpm db:domain-model --out`, and the database
   tests that need no worker change: LED-24's refusals and the skip by hand, and LED-25's order and plan tests.
3. **Reconcile** (after 1 and 2): the attribution and the new `recordInterest`, the L6 query, the order by `seq`,
   `pass.ts`, `statement-html.ts` with `brand.test.ts`; the synth cases LED-23 and LED-24 and LED-16's PLB L6
   (`pnpm synth`), `interest.db.test.ts`, the oracle's appended cases, and the updated LED-16 and PAR-18 assertions.
4. **Screens** (after 3): the queries, the page, the totals note, the ROI statement page's note, the adjustment
   consequence, the reverse route, the route world; `reconciliation-routes.db.test.ts` and `ledger-interest.spec.ts`.
5. **Records** (beside 3 and 4): ADR 0084, ADR 0042 and 0067, PRD 13 in the founder's granted words,
   reconciliation-001, the test matrix, `matrix.ts` and `registry.ts`, `watched-paths.txt`.
6. **Integration**: the full local suite (unit, db, golden, e2e, mutation, lint, lint:copy, lint:logs, typecheck,
   verify-content, synth, the screening-capacity gate), the before and after shots, the PR description from the
   template with the domain-model summary, then the two adversarial reviews (the payment-engine reviewer and the UX
   and brand reviewer).

---

## 14. Out of scope, and handed on

- **PR 15b's stored case close** ("payer corrected; balance is the patient's"): PR 8's case schema, as LANES.md has it.
- **The ledger freeze guard test** (reconciliation-001.md:172): PR 8 builds it; it lists this migration as granted by
  the exception of section 10.
- **Interest inside CLP04** (a negative claim-level CAS such as CARC 225 balancing interest the payer folded into the
  claim's payment): after this PR it is counted once, as principal, because AMT I alone credits nothing. Moving it to
  interest would change `claimLinePayments`, a principal amount; a question for the payment-engine reviewer and a later
  ledger item.
- **A WO's reference** is still hashed whole (D14). Reading its identifiers as D2 reads an L6's changes the WO rule,
  which the freeze keeps; a follow-up ledger item if a payer's WO carries several.
- **`provider_adjustment.reference` is stored in plain text** although ADR 0027:95 calls a claim reference PHI (it is
  not in `ENCRYPTED_COLUMNS`, `cipher.ts:39-60`). It needs a migration (an encrypted column and its hash), which is
  Lane A's; recorded for the next security review. D2 then decrypts the reference in memory before splitting it.
- **An L6 or WO no case line takes is invisible on Reconciliation** (`unmatched.ts` lists no provider adjustments).
  Most interest is for claims no case covers, so a plain list would be noise; a "for no case" view is a product
  proposal.
- **Interest on a line with nothing remaining** stays dropped (ADR 0067:234).

---

## 15. Review

**Review 1** (2026-10-27; one independent reviewer on the payment-engine reviewer's checklist and the EDI reviewer's
for section 2; notes and probes in `scratchpad/progress/design-interest-review.md` and `scratchpad/probes/review/`):
verdict "build with changes". Each finding was checked against the code before it was taken; every one was taken.

| # | Finding (the reviewer's severity) | Checked | What changed |
|---|---|---|---|
| F1 | Once per L6 and claim lets a re-attribution (a same-numbered later claim, an out-of-order upload) credit an L6 again; Postgres refuses; the practice's whole reconcile fails on every retry (blocking) | `rem` keys; `allocateByWeight(540, [0, 300])` gives `[0, 540]` (`packages/ledger/src/allocation.ts:42-60`, no cap at a weight); `adoptOrphanReversals` | 3.7; D6: once per L6 and sign, gross, with each chain's part as a second cap; a take-back cut to what the lines hold before it is split (D5); worked cases R' and "pooled first, named later"; LED-24's `second.835` now carries the first correction's control number and `out-of-order-*.835` is new; the properties change the attribution between reconciles |
| F2 | The pool counts a correction's positive AMT I and ignores its reversal's negative one, so a net-zero pair takes another claim's interest (blocking) | The run-1 D2 pooled positive AMT I only | 3.6; D3: a chain's AMT I nets within the remittance; worked case "net zero beside another claim"; LED-23 `net-zero-beside.835` |
| F3 | A take-back keyed to the reversed claim and its standing approval misses interest held through an earlier claim of the chain (a restatement), and a person-reversed approval (should fix) | The reviewer's probe S2 (`probes/review/probe1.out`): nothing taken back after a restatement | D5: take-backs from the lines holding the chain's interest; paid interest through approved matches first, else any standing match; D8: a claim reaches a line through a standing claim or interest match; run 2's T10; worked case and LED-24 `restated-taken-back.835` |
| F4 | Refusing the previous image's interest match fails every reconcile of every practice with an AMT I claim on a case line until roll-forward, not only interest (should fix) | The reviewer's probe S3; the previous image's `everMatched` is keyed by the claim's ID and the new matches' evidence is the L6 | 3.8; D16: the job's one-record interest match is skipped, a person's refused; the skip is shown to let the previous image's reconcile complete (run 2); a database test asserts every match the current image writes carries both records |
| F5 | The printed statement's new sentence breaks `brand.test.ts:144`, and the ROI statement page keeps the old one (should fix) | Both carry the same sentence today | Section 7 changes both; files, exception and UX review list updated; the Verified seal coordination named (section 11) |
| F6 | PLB03-2 hashed whole misses X12's recommended "CLP01 CLP07 TRN02" (should fix) | `rem:799`; the parser keeps PLB03-2 whole (`packages/edi835/src/transaction.ts:867`) | 3.9; D2: the whole reference, else its tokens, naming one chain or nothing; LED-23 `identifiers.835`. The WO's naming is unchanged and handed on (section 14) |
| F7 | A named net L6 (TR3 1.10.2.9) gives the whole net to the named claim, other claims' interest included (should fix) | The run-1 D2 step 1 | D4 step 2 and 4: a named L6 covers its claim's AMT I first, its remainder joins the pool, and what the pool leaves returns to the named claim (so case F stands); LED-23 `named-net.835` |
| F8 | The exception's file list misses tests and the stryker shard; the order WO-then-interest differed from today's; "stays frozen" conflicts with SUITE-CAP-1's Q1 (should fix) | The lists; `rem:788-793` | Section 10's files and "stays frozen" reworded; D13 keeps today's order, so no order change needs the exception |
| N1 | `allocated` for negative parts undefined | | D10: two or more nonzero parts of one split |
| N2 | `net-zero.835`'s "approved 2.00 more" needs the allowed amount raised | `payment.ts:390-392` (same allowed paying more is no change) | 8.2: the allowed amount and the payment both rise by 2.00 |
| N3 | RFI 2202 described both as a same-remittance rule and as a later payment | | Section 2: RFI 2202 is the same-remittance rule; a later L6 is a later payment (case E) |

**Pending:** a second look at sections 3.6 to 3.9, 4, 5 and 8 as revised (the exact-or-net pool, the per-sign bound,
the skip), by the same checklists. Its findings and their dispositions are recorded here before the builders start,
and the freeze exception of section 10.1 goes to the founder in its reviewed form.
