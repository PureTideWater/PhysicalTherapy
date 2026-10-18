# Worksheet G128: A patient share larger than the lesser-of amount leaves no payer's share to sequester

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900003: invented for tests, never a CMS value.

## Inputs

- Release 900003 at fixtures/synthetic/rules/release-synth-900003; its MANIFEST.json has SHA-256 e4d7228d5344d9fc824b223ae7d1af7608c81a2c9ec9fc31db1e66f1e555f5c8 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G128: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-B/PLAN-HMO.
- Remittance date: 2026-05-28; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-b-hmo: contract, contract version cv-b-1, 2026-01-01 to open.
- Contract version cv-b-1 (contract contract-synth-b, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute not stated, appeal levels none stated):
  - Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); scope codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment pays 98% of the amount.
  - Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); scope codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97140 | GP | 1 | 2026-05-07 | 11 | 2500 | 2450 (paid_plus_pr) | PR-1 3000 |

## Steps 1 to 3, per line

### Line 1: 97140 x 1 on 2026-05-07

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-05-07.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-05-07:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97140, modifier set [GP], place of service 11, 2026-05-07:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97140 is not in its codes.
- Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment: pays 98% of the amount.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- The schedule is FIXED_SCHEDULE: 3400 cents ($34.00) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is off; not checked.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 3400 cents ($34.00) x 1 = 3400 cents ($34.00); the line charge is 2500 cents ($25.00); the lesser is the line charge, 2500 cents ($25.00).
- Procedure-to-procedure edits: apply_ncci is off; not checked.

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: before 2500, after 2500; the amount 2500 cents ($25.00) less the patient share 3000 leaves the payer's share 0 cents ($0.00) (the patient share exceeds the amount by 500, so the payer's share is taken as 0; fixtures/golden/QUESTIONS.md); 3% of the payer's share is 0; 2500 - 0 = 2500 cents ($25.00).
- contract_adjustment: before 2500, after 2450; the rate record pays 98% of the amount: 2500 cents ($25.00) x 98% = 2450 cents ($24.50).

Step 5, patient share: 3000 cents ($30.00) from the line's PR adjustments (PR-1 3000); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2450 cents under HALF_EVEN_CENT (the rate record's rule; halves move to the even cent) = **2450 cents ($24.50)**; the unrounded 2450 is kept beside it.

Step 7, variance: expected allowed 2450 - observed allowed 2450 cents (paid_plus_pr) = 0 cents: none.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-05-28): 4 months from the date of service 2026-05-07, ends on 2026-09-07; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 2450 | 2450 | HALF_EVEN_CENT | 3000 | 0 | WINDOW_PASSED (ends 2026-09-07) | none |
