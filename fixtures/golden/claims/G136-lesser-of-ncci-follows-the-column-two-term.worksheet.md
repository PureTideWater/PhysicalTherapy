# Worksheet G136: Whether an edit is checked follows the term of the column-2 line

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900003: invented for tests, never a CMS value.

## Inputs

- Release 900003 at fixtures/synthetic/rules/release-synth-900003; its MANIFEST.json has SHA-256 e4d7228d5344d9fc824b223ae7d1af7608c81a2c9ec9fc31db1e66f1e555f5c8 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G136: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-B/PLAN-HMO.
- Remittance date: 2026-06-25; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-b-hmo: contract, contract version cv-b-1, 2026-01-01 to open.
- Contract version cv-b-1 (contract contract-synth-b, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute not stated, appeal levels none stated):
  - Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); scope codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment pays 98% of the amount.
  - Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); scope codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97164 | GP | 1 | 2026-06-04 | 11 | 9000 | 5535 (amt_b6) | none |
| 2 | 97110 | GP | 1 | 2026-06-04 | 11 | 5000 | 3232 (amt_b6) | none |
| 3 | 97530 | GP | 6 | 2026-06-04 | 11 | 21000 | 15000 (amt_b6) | none |
| 4 | 97116 | GP | 1 | 2026-06-04 | 11 | 5000 | 3232 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97164 x 1 on 2026-06-04

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-04.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-04:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97164, modifier set [GP], place of service 11, 2026-06-04:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97164 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-06-04 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97164 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 1.04, PE non-facility 1.14, PE facility 0.44, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-06-04, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 1.04 x 1.000 = 1.04; PE 1.14 x 0.950 = 1.083; MP 0.14 x 0.650 = 0.091; total 2.214.
- Fee schedule amount per unit: 2.214 x $20.0000 = $44.28.
- At 125%, per unit: work 2600 cents ($26.00), practice expense 2707.5 cents ($27.075), malpractice 227.5 cents ($2.275); total 5535 cents ($55.35).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97164 (2026-01-01 to 2026-12-31, adjudication indicator 2) allows 1 unit(s); 1 is within it.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 5535 cents ($55.35) x 1 = 5535 cents ($55.35); the line charge is 9000 cents ($90.00); the lesser is the schedule, 5535 cents ($55.35).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-04 has 97164 in column 2 and another line's code of the date in column 1.

### Line 2: 97110 x 1 on 2026-06-04

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-04.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-04:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97110, modifier set [GP], place of service 11, 2026-06-04:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
- Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment: pays 98% of the amount.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- The schedule is FIXED_SCHEDULE: 3400 cents ($34.00) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is off; not checked.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 3400 cents ($34.00) x 1 = 3400 cents ($34.00); the line charge is 5000 cents ($50.00); the lesser is the schedule, 3400 cents ($34.00).
- Procedure-to-procedure edits: apply_ncci is off; not checked.

### Line 3: 97530 x 6 on 2026-06-04

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-04.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-04:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97530, modifier set [GP], place of service 11, 2026-06-04:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-06-04 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-06-04, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.95 x 0.950 = 0.9025; MP 0.15 x 0.650 = 0.0975; total 1.35.
- Fee schedule amount per unit: 1.35 x $20.0000 = $27.00.
- At 125%, per unit: work 875 cents ($8.75), practice expense 2256.25 cents ($22.5625), malpractice 243.75 cents ($2.4375); total 3375 cents ($33.75).

Step 3, units and edits.
- Units: 6 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97530 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s).
- **Unpriced: `MUE_EXCEEDED`.** 6 units exceed the 5 the edit allows: the units are a reason for review, not priced down (PRD 11 step 3). The line's units are compared on their own (fixtures/golden/QUESTIONS.md Q42).

### Line 4: 97116 x 1 on 2026-06-04

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-04.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-04:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97116, modifier set [GP], place of service 11, 2026-06-04:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97116 is not in its codes.
- Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment: pays 98% of the amount.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- The schedule is FIXED_SCHEDULE: 3400 cents ($34.00) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is off; not checked.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 3400 cents ($34.00) x 1 = 3400 cents ($34.00); the line charge is 5000 cents ($50.00); the lesser is the schedule, 3400 cents ($34.00).
- Procedure-to-procedure edits: apply_ncci is off; not checked.

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 5535, after 5535; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 5535 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **5535 cents ($55.35)**; the unrounded 5535 is kept beside it.

Step 7, variance: expected allowed 5535 - observed allowed 5535 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-06-25): 4 months from the date of service 2026-06-04, ends on 2026-10-04; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: before 3400, after 3298; the amount 3400 cents ($34.00) less the patient share 0 leaves the payer's share 3400 cents ($34.00); 3% of the payer's share is 102; 3400 - 102 = 3298 cents ($32.98).
- contract_adjustment: before 3298, after 3232.04; the rate record pays 98% of the amount: 3298 cents ($32.98) x 98% = 3232.04 cents ($32.3204).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3232.04 cents under HALF_EVEN_CENT (the rate record's rule; halves move to the even cent) = **3232 cents ($32.32)**; the unrounded 3232.04 is kept beside it.

Step 7, variance: expected allowed 3232 - observed allowed 3232 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-06-25): 4 months from the date of service 2026-06-04, ends on 2026-10-04; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 4

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: before 3400, after 3298; the amount 3400 cents ($34.00) less the patient share 0 leaves the payer's share 3400 cents ($34.00); 3% of the payer's share is 102; 3400 - 102 = 3298 cents ($32.98).
- contract_adjustment: before 3298, after 3232.04; the rate record pays 98% of the amount: 3298 cents ($32.98) x 98% = 3232.04 cents ($32.3204).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3232.04 cents under HALF_EVEN_CENT (the rate record's rule; halves move to the even cent) = **3232 cents ($32.32)**; the unrounded 3232.04 is kept beside it.

Step 7, variance: expected allowed 3232 - observed allowed 3232 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-06-25): 4 months from the date of service 2026-06-04, ends on 2026-10-04; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 5535 | 5535 | TRUNCATE | 0 | 0 | WINDOW_PASSED (ends 2026-10-04) | none |
| 2 | priced | 3232 | 3232.04 | HALF_EVEN_CENT | 0 | 0 | WINDOW_PASSED (ends 2026-10-04) | none |
| 3 | unpriced `MUE_EXCEEDED` | | | | | | | |
| 4 | priced | 3232 | 3232.04 | HALF_EVEN_CENT | 0 | 0 | WINDOW_PASSED (ends 2026-10-04) | none |
