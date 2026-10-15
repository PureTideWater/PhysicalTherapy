# Worksheet G137: The percent lesser-of at a facility, CQ at a facility, and modalities at their MUE

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900003: invented for tests, never a CMS value.

## Inputs

- Release 900003 at fixtures/synthetic/rules/release-synth-900003; its MANIFEST.json has SHA-256 e4d7228d5344d9fc824b223ae7d1af7608c81a2c9ec9fc31db1e66f1e555f5c8 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G137: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-B/PLAN-HMO.
- Remittance date: 2026-07-02; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-b-hmo: contract, contract version cv-b-1, 2026-01-01 to open.
- Contract version cv-b-1 (contract contract-synth-b, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute not stated, appeal levels none stated):
  - Rate record rr-b-fixed: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 3400 cents ($34.00) per unit); scope codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration on, apply_ncci off; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment pays 98% of the amount.
  - Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); scope codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97161 | GP | 1 | 2026-06-11 | 22 | 9000 | 4700 (amt_b6) | none |
| 2 | 97530 | GP CQ | 1 | 2026-06-11 | 22 | 5000 | 1300 (amt_b6) | none |
| 3 | 97035 | GP | 3 | 2026-06-11 | 11 | 6000 | 3800 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97161 x 1 on 2026-06-11

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-11.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-11:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97161, modifier set [GP], place of service 22, 2026-06-11:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97161 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-06-11 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97161 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 1.61, PE non-facility 1.31, PE facility 0.61, MP 0.16, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-06-11, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 1.61 x 1.000 = 1.61; PE 0.61 x 0.950 = 0.5795; MP 0.16 x 0.650 = 0.104; total 2.2935.
- Fee schedule amount per unit: 2.2935 x $20.0000 = $45.87.
- At 125%, per unit: work 4025 cents ($40.25), practice expense 1448.75 cents ($14.4875), malpractice 260 cents ($2.60); total 5733.75 cents ($57.3375).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97161 (2026-01-01 to 2026-12-31, adjudication indicator 2) allows 1 unit(s); 1 is within it.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 5733.75 cents ($57.3375) x 1 = 5733.75 cents ($57.3375); the line charge is 9000 cents ($90.00); the lesser is the schedule, 5733.75 cents ($57.3375).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-11 has 97161 in column 2 and another line's code of the date in column 1.

### Line 2: 97530 x 1 on 2026-06-11

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-11.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-11:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97530, modifier set [CQ GP], place of service 22, 2026-06-11:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-06-11 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-06-11, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.25 x 0.950 = 0.2375; MP 0.15 x 0.650 = 0.0975; total 0.685.
- Fee schedule amount per unit: 0.685 x $20.0000 = $13.70.
- At 125%, per unit: work 875 cents ($8.75), practice expense 593.75 cents ($5.9375), malpractice 243.75 cents ($2.4375); total 1712.5 cents ($17.125).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97530 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 1 is within it.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 1712.5 cents ($17.125) x 1 = 1712.5 cents ($17.125); the line charge is 5000 cents ($50.00); the lesser is the schedule, 1712.5 cents ($17.125).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-11 has 97530 in column 2 and another line's code of the date in column 1.

### Line 3: 97035 x 3 on 2026-06-11

Step 1, the agreement.
- Mapping map-b-hmo (contract, 2026-01-01 to open) is in force on 2026-06-11.
- The mapping names contract version cv-b-1 of contract contract-synth-b; the version that prices the line is the signed-off one of that contract in force on 2026-06-11:
  - cv-b-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-b-1 against code 97035, modifier set [GP], place of service 11, 2026-06-11:
  - rr-b-fixed (codes 97110, 97112, 97116, 97140; any modifiers; any place of service; 2026-01-01 to open): no match, code 97035 is not in its codes.
  - rr-b-medicare (codes 97530, 97161, 97162, 97163, 97164, 97026, 97035, G0283, 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-b-medicare: LESSER_OF the line charge and the schedule (PERCENT_OF_MEDICARE at 125%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm); flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-06-11 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97035 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.15, PE non-facility 0.35, PE facility 0.05, MP 0.05, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-06-11, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.15 x 1.000 = 0.15; PE 0.35 x 0.950 = 0.3325; MP 0.05 x 0.650 = 0.0325; total 0.515.
- Fee schedule amount per unit: 0.515 x $20.0000 = $10.30.
- At 125%, per unit: work 375 cents ($3.75), practice expense 831.25 cents ($8.3125), malpractice 81.25 cents ($0.8125); total 1287.5 cents ($12.875).

Step 3, units and edits.
- Units: 3 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97035 (2026-01-01 to 2026-12-31, adjudication indicator 1) allows 3 unit(s); 3 are within it.
- Base, the lesser of the schedule and the line charge: the schedule for 3 unit(s) is 1287.5 cents ($12.875) x 3 = 3862.5 cents ($38.625); the line charge is 6000 cents ($60.00); the lesser is the schedule, 3862.5 cents ($38.625).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-11 has 97035 in column 2 and another line's code of the date in column 1.

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 5733.75, after 5733.75; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 5733.75 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **5733 cents ($57.33)**; the unrounded 5733.75 is kept beside it.

Step 7, variance: expected allowed 5733 - observed allowed 4700 cents (amt_b6) = 1033 cents: an underpayment.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-07-02): 4 months from the date of service 2026-06-11, ends on 2026-10-11; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 1712.5, after 1318.625; CQ present; assistant_modifier pays 77%: 1712.5 cents ($17.125) x 77% = 1318.625 cents ($13.18625).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1318.625 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **1318 cents ($13.18)**; the unrounded 1318.625 is kept beside it.

Step 7, variance: expected allowed 1318 - observed allowed 1300 cents (amt_b6) = 18 cents: an underpayment.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-07-02): 4 months from the date of service 2026-06-11, ends on 2026-10-11; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 3862.5, after 3862.5; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3862.5 cents under TRUNCATE (the rate record's rule; fractions of a cent are dropped toward zero) = **3862 cents ($38.62)**; the unrounded 3862.5 is kept beside it.

Step 7, variance: expected allowed 3862 - observed allowed 3800 cents (amt_b6) = 62 cents: an underpayment.

Step 8, dispute window: the contract states no dispute window, so the release's commercial default first-level window applies (dispute_window commercial_default redetermination, 2026-01-01 to open, in force on the remittance date 2026-07-02): 4 months from the date of service 2026-06-11, ends on 2026-10-11; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 5733 | 5733.75 | TRUNCATE | 0 | 1033 | WINDOW_PASSED (ends 2026-10-11) | none |
| 2 | priced | 1318 | 1318.625 | TRUNCATE | 0 | 18 | WINDOW_PASSED (ends 2026-10-11) | none |
| 3 | priced | 3862 | 3862.5 | TRUNCATE | 0 | 62 | WINDOW_PASSED (ends 2026-10-11) | none |
