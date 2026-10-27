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
- A PLB L6 that names no claim (most payers send it that way) is split over that remittance's claims by their AMT I,
  never past what each claim reported. Today such an L6 is never credited.
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
   (`rem:806-808`), and the interest branch has no such step.
3. **AMT I with no money behind it (probe D, the database scout's).** LED-16's fixture as it stands: AMT I 5.40, no
   L6, BPR02 54.00. 540 cents are credited as interest the payer paid, though the check excludes it.

### 1.4 What else today's interest handling drops or misreads

- **An L6 with no reference** is never credited (`rem:791`), even when the remittance's AMT I says which claim it pays.
  The database scout's probe B (AMT I plus an L6 with no reference) credits 540 through AMT I and never matches the L6.
- **An L6 that takes interest back** (positive amount) is dropped: `negateCents` makes it zero or less and
  `recordInterest` returns (`rem:838`, `:874`). A negative interest entry would be refused anyway
  (`ledger_entry_sign`, `ledger_mig:206-213`, interest `> 0`). The database scout's probe H: 540 stays credited after
  the payer took it back.
- **A reversal's negative AMT I** is ignored (`interest_cents > 0`, `rem:853` and `ledger_mig:370`), so a reversal and
  correction whose AMT I net to zero credit the correction's AMT I again as new money.
- **N1** (payment-engine review of #51, `review-payment-engine.md:57-58`): `allocated = named.length > 1` is true when
  only one line had a weight above zero and took the whole amount. Probe R's first entry: one line, 540 of 540,
  flagged allocated, shown as "(allocated pro rata)" (`page:115`).

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
as needing a column (payment-engine review S1).

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
