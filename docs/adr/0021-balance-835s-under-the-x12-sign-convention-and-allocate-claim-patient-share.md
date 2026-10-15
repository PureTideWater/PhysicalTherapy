# 0021. Balance 835s under the X12 sign convention, and allocate claim-level patient share pro rata

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 2 (the 835, as the parser must read it), 10 (balance, load, errors), 13 (recoupments), 18 (the 835 oracle); test matrix PAR-10, PAR-16 to PAR-20, PAR-25, PAR-26

## Context

Milestone 2 part A writes the synthetic 835s and the exact outcome the parser and loader must produce
(`fixtures/synthetic/<case>/expected.json`); part B writes the parser against them, and pyx12 checks the
fixtures independently (ADR 0022). Four things the plan states in prose need one precise reading that the
writer, the expected outcomes, the Python oracle and the parser all share:

1. **The PLB sign.** The plan says a check balances when "claim totals plus PLB adjustments equal BPR02"
   and speaks of "negative PLB that makes the check smaller than the sum of claims". In the transaction
   itself a provider adjustment amount is positive when it reduces the payment (a WO recoupment) and
   negative when it increases it (L6 interest), so BPR02 equals the claims paid minus the PLB amounts.
2. **What "line amounts reconcile to the claim" means.** Payers send adjustments at line level, at claim
   level, or both (PAR-10 is claim level only), and the rule must hold for every shape without holding a
   legitimate file.
3. **Observed allowed when the lines carry no PR** (rules reference: "or allocated from the claim when
   lines carry none"): how to allocate, in cents, deterministically.
4. **Positions.** Errors carry "segment index, segment ID and element position" with no stated origin.

## Decision

- **Sign.** Amounts are stored and compared exactly as the segment carries them. The transaction balances
  when `sum(CLP04) - sum(PLB amounts) - payment = 0`, where payment is BPR02, negative when BPR03 is D.
  The plan's "PLB adjustment" is read as its effect on the payment, which is minus the amount the segment
  carries; its "negative PLB" is a recoupment. `provider_adjustment.amount_cents` keeps the segment's sign;
  the ledger's `recouped` entry is negative (PRD section 13). A recoupment larger than the claims is carried
  forward with an FB of the opposite sign and a zero check (BPR01 H, BPR04 NON), the PAR-19 zero-check file;
  a negative net the payer takes from the provider instead is written with BPR03 D and BPR02 its magnitude
  (variant V31, the "negative check"). BPR02 itself is never written negative.
- **Claim and line balance**, checked identically by `packages/synth/src/x12/summary.ts`, by
  `tools/test-oracle/oracle.py` (with Decimal) and, in part B, by the parser:
  - claim: `CLP03 - every CAS amount in the claim (claim and line level) - CLP04 = 0`;
  - lines, where present: the SVC02 charges sum to CLP03;
  - a line balances on its own (`SVC02 - its CAS - SVC03 = 0`) when it carries CAS, or when its claim carries
    no claim-level CAS; a line without CAS under claim-level CAS (PAR-10) is reconciled by the claim alone.
  Any failure holds the transaction (`EDI_UNBALANCED`) with the exact difference: at BPR02 (segment BPR,
  element 2) for the transaction, CLP04 for a claim, CLP03 for the line charges, SVC03 for a line.
- **Observed allowed** per line: AMT B6 when sent (`amt_b6`); otherwise SVC03 plus the line's PR
  adjustments (`paid_plus_pr`). When the claim carries PR adjustments and no line does, the claim's PR total
  is allocated to the lines without B6 in proportion to their charges, each share truncated toward zero and
  the remaining cents given one at a time to those lines in line order (so a reversal allocates exactly the
  negation); those lines are flagged `allocatedFromClaim` (the data dictionary's basis stays `paid_plus_pr`,
  the flag rides beside it). `allocateProRata` in `packages/synth/src/expected/parse.ts` is the reference.
- **Positions.** A segment index counts every segment of the file from 1 (ISA is 1), across interchanges, as
  pyx12 counts them; element positions count from 1. A truncated file reports the segment input ended in and
  the element being read (PAR-25); a wrong SE01 reports SE element 1 with the count expected and found.
- **Service dates.** DTM 472 is a single date; a period is DTM 150 and 151, the 5010 form. PAR-23's literal
  "DTM 472 with a date range" (RD8 in DTM05 and DTM06, elements the 5010 structure does not use) is a second
  fixture the parser reads as the period and pyx12 rejects; its expected.json says so (`toleratedByParser`).
- **Unknown codes** are relative to the SYNTHETIC release 900001's code lists (CARC 1, 2, 3, 23, 45; RARC N901,
  N902, MA901), the only release a test can load; `codeListRelease` in every expected.json names it.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Read "claims plus PLB equals BPR02" literally (recoupments negative in PLB04) | Real files carry the opposite sign; a parser built that way would hold every real file with a PLB |
| Require every line to balance on its own | Holds PAR-10, which the matrix says loads |
| Require the line payments to sum to CLP04 | Fails a claim with both claim-level and line-level CAS, which balances under the claim rule |
| Allocate by paid amount, or largest remainder | Paid can be zero on a line with patient share; largest remainder is harder to state and to replay |

## Consequences

- The writer derives BPR02 and every paid amount from these rules, so a fixture balances by construction
  unless a case writes an amount on purpose (PAR-20).
- Part B implements exactly these rules; the oracle compares the balance results field by field.
- The ledger (milestone 9) reads PLB amounts with this sign: WO positive in the segment, `recouped` negative
  in the ledger.

## Revisit when

A real-file twin (ADR 0024) shows a payer shape these rules hold wrongly; the change is made here first, then
in the writer, the oracle and the parser together.
