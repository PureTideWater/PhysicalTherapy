# 0034. Price every contract method, hold the NCCI edits for review, and keep the golden lines first

- **Status:** accepted; amended by [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md) (2026-10-21: `ENGINE_VERSION` `phase-two/2` for the ZIP+4 lookup, with two optional trace keys)
- **Date:** 2026-10-18
- **Deciders:** founder (engineering); the reimbursement specialist answers fixtures/golden/QUESTIONS.md Q39 to Q45
- **PRD sections:** 2 (points 2, 6 and 8), 9 (contract rate records), 11 (the engine, every step), 18 (the pricing
  oracle: "Two hundred lines across five fixture payers"), 20 (timed units; per-visit and case rates); test matrix
  PRC-05 to PRC-07, PRC-10, PRC-11, PRC-16 to PRC-18, PRC-20; ADRs 0020, 0029, 0033

## Context

Milestone 7 opens with "Extend packages/pricing with fixed-schedule, lesser-of and per-visit methods, NCCI flags and
MUE handling", done when "200 golden lines across five fixture payers match to the cent". Phase one (ADR 0029) priced
Medicare Advantage non-contracted and percent-of-Medicare terms and refused the other methods as `ENGINE_ERROR
method_not_in_phase_one`; `apply_ncci` changed nothing, `MUE_EXCEEDED` was never produced, and PRD 11 step 4's
"contract-specific adjustments (a percentage or a cap the record defines)" had no rate-record field. The house rules
ask for a golden line, written before the code, for every pricing branch, and no specialist is available, so the
lines again come from the independent worksheet (ADR 0020). The plan leaves several readings open: how a lesser-of
term meets the adjustments, what "the first included line" of a visit is when that line is stopped, which line a
procedure-to-procedure edit flags and which modifiers bypass it, how the MUE meets the timed-units rule, and what the
multiple procedure reduction means for an amount that has no practice-expense part.

## Decision

- **Golden lines first, in two commits.** The worksheet (`tools/golden-worksheet/golden_worksheet.py`) prices the new
  branches and the golden format became `tp-golden-claim/3` (README): the three methods with their parameters, each
  record's `parameters.contract_adjustment`, the `contract_adjustment` adjustment entry, and each priced line's
  `review_flags`. The 64 claims of format 2 took `contract_adjustment: null` and were rewritten by `write`; a script
  compared all 119 lines field by field and every value they held is unchanged, and eight of their lines gained an
  `NCCI_PTP` flag (Q41). Five fixture payers, each one SYNTHETIC contract (`tools/golden-worksheet/fixture_payers.py`,
  which writes inputs only; `check` and a golden test keep every claim of a payer carrying the identical contract),
  hold 86 new claims and 207 lines: 326 lines in all, every reason but `ENGINE_ERROR`, every method, every flag on and
  off, half cents under each rounding rule, a reversal per payer. All say `specialist_verified: false`. That commit
  came before any engine change; the engine then matched every line to the cent on its first run.
- **The methods (PRD 11 steps 2 and 3).** `FIXED_SCHEDULE`: the amount per unit times the units. `LESSER_OF`: the
  schedule's amount for the units billed (fixed, or the fee schedule at the record's percentage) against the line
  charge, the lesser the base, at step 3; the adjustments then apply to it whichever won (Q43). `PER_VISIT`: per claim,
  service date and rate record, the visit amount on the lowest line number among the lines priced so far, zero on the
  others; units do not multiply it (Q44). `UNSUPPORTED` stays `UNSUPPORTED_METHOD`.
- **The reduction needs a fee schedule.** `apply_mppr` on a fixed, per-visit or lesser-of term stops the line with
  `ENGINE_ERROR mppr_needs_fee_schedule`, a review detail that pages no one (Q39). `method_not_in_phase_one` is gone.
- **NCCI (PRD 2 point 6; PRD 11 step 3).** With `apply_ncci` on, a line's units above its code's `ncci_mue` value in
  force on the service date stop it with `MUE_EXCEEDED`, before the timed-units rule; at the value, or with no record,
  it prices (Q42). Each `ncci_ptp` edit in force with the line's code in column 2 and the code of another line of the
  claim and date in column 1 (whatever that line's outcome) raises an `NCCI_PTP` review flag on the column-2 line,
  unless the modifier indicator is `1` and a 59 or X modifier is on either line; only the column-2 line's own
  `apply_ncci` decides (Q41). A flag never changes the amount: `PricedLine.reviewFlags` and the trace carry it for the
  pricing runs and triage.
- **Timed units.** `MEDICARE_POOLED` and `PER_CODE` are recorded and the units taken as billed until minute logs
  exist; `UNKNOWN` stops every method, per-visit included (Q32, Q40).
- **Contract-specific adjustments.** `@tp/contracts` gains an optional `contract_adjustment` on the parameters of every
  method but `UNSUPPORTED` (`contractAdjustmentSchema`: `{kind: 'PERCENT', percent}` or `{kind: 'CAP', cap_cents}`), so
  every record stored before stays valid and is written back unchanged; the database checks only that `parameters` is
  an object, so no migration. It applies after sequestration: a percentage of the amount, or the line held to the cap
  (Q45).
- **The trace is `tp-pricing-trace/2`** and `ENGINE_VERSION` is `phase-two/1` (`phase-two/2` since PR 6b's ZIP+4
  lookup, ADR 0064, whose two keys are optional, so the format stays 2): the terms' fixed amount, lesser-of
  schedule and contract adjustment; the units step's medically unlikely edit, unit amount, schedule amount, charge and
  base; the per-visit step (the visit's lines and its carrier); the procedure-to-procedure edits with their records,
  indicators and bypasses; the contract adjustment entry; and the review flags in the outcome. `recompute` stays
  written apart from `price` and works each branch out again its own way (the visit's carrier as the lowest recorded
  line number, each edit's bypass from the recorded modifiers and indicator, the lesser of the recorded charge held to
  the line's). It reads format 2 only: no format-1 trace was ever stored outside a test, since the pricing runs that
  store traces arrive in this milestone. From here on a trace format change must keep reading the formats before it.
- **Properties.** PRC-17 over fixed and percent terms (doubling can only add an `MUE_EXCEEDED`); PRC-18 line by line
  for the three Medicare adjustments and claim-wide for every flag and method; a per-visit claim's total does not depend
  on the order or the numbers of its lines; a lesser-of base never exceeds the schedule or the charge. `apply_ncci`
  changes no amount but can stop a line that then holds neither the day's whole unit nor the visit, so it is compared
  claim-wide only: line by line it cannot hold under these readings (G167, Q42: another line of the day then holds the
  whole unit; G146, Q44: the next line carries the visit). A property test found the one case where PRC-18 fails
  claim-wide (Q44): turning NCCI on can move a visit to a line whose patient share leaves less to sequester, or which
  lacks the first line's CQ or CO. The property leaves out exactly the claims whose visit carrier moved (every other
  per-visit claim under NCCI is compared), and an example test states the departure. The reading stays, as the golden
  line G146 states it, and goes to the specialist with its alternative: changing it changes G146 line 2's expected
  amount, a golden line only the specialist changes.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Keep format 2 and leave the review flags out of the golden lines | The flags PRC-11 asks for would have no independent oracle; ADR 0033 rejected optional fields for the same reason |
| Compare a lesser-of term after the adjustments | PRD 11 lists lesser-of under step 2; Q43 asks the specialist |
| Reduce a fixed or per-visit amount by the MPPR share | Such an amount has no practice-expense part; any share would be a guess (Q39) |
| The first included line carries the visit whatever its outcome | Keeps PRC-18 claim-wide, but the visit's amount would wait on the review of one line; the specialist chooses (Q44) |
| Sum a code's units across the day for date-of-service MUE indicators | The plan says "units above the MUE value"; summing is a question (Q42) |
| Flag both lines of a procedure-to-procedure pair | The edit is about the column-2 code; flagging both would double the reviews |
| Read format-1 traces in `recompute` | None was stored; carrying an upgrade path for traces that never existed is dead code |
| Enter the contract adjustment in the abstraction form now | Not asked of this part; the engine and the records carry it, the form follows with the specialist's answer to Q45 |

## Consequences

- 326 golden lines match the engine to the cent and every trace recomputes; branch coverage of `packages/pricing`
  stays 100%; 100,000 lines across the four kinds of terms still price well inside PRC-20's two minutes.
- The pricing runs read `PricedLine.method` (now any method that prices), `reviewFlags` and the format-2 trace; a
  priced per-visit line can expect zero. The abstraction form and the rate-record display do not show or take a
  contract adjustment yet.
- Milestone 7 stays open until the specialist has answered Q39 to Q45 and verified the worksheets, and until its
  second part (pricing runs, re-runs under a new release, the monitoring jobs and digests) is done.

## Revisit when

The specialist answers Q39 to Q45, a contract needs a contract-named locality or the reduction on a fixed schedule,
minute logs are imported (the timed-units rules start to count), or the NCCI tables of release 1 replace the SYNTHETIC
ones.
