# Worksheet G166: MPPR, CQ and CO at a facility under the contracted plan

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G166: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-D/HMO.
- Remittance date: 2026-08-04; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-d-hmo: contract, contract version cv-d-1, 2026-01-01 to open.
- Contract version cv-d-1 (contract contract-synth-d, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute 60 days, appeal levels level 1 60 days, level 2 180 days):
  - Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated; contract-specific adjustment none.
  - Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment caps the line at 5800 cents ($58.00).
  - Rate record rr-d-97750: UNSUPPORTED; scope codes 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP CQ | 2 | 2026-07-14 | 22 | 12000 | 1700 (amt_b6) | none |
| 2 | 97112 | GP | 1 | 2026-07-14 | 22 | 6000 | 1100 (amt_b6) | none |
| 3 | 97530 | GP CO | 1 | 2026-07-14 | 22 | 7000 | 1000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-07-14

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-14.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-14:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97110, modifier set [CQ GP], place of service 22, 2026-07-14:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-14 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.21 x 0.950 = 0.1995; MP 0.11 x 0.650 = 0.0715; total 0.581.
- Fee schedule amount per unit: 0.581 x $20.0000 = $11.62.
- At 100%, per unit: work 620 cents ($6.20), practice expense 399 cents ($3.99), malpractice 143 cents ($1.43); total 1162 cents ($11.62).

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 2 are within it.
- Base: 1162 cents ($11.62) x 2 = 2324 cents ($23.24).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-07-14 has 97110 in column 2 and another line's code of the date in column 1.

### Line 2: 97112 x 1 on 2026-07-14

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-14.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-14:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97112, modifier set [GP], place of service 22, 2026-07-14:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-14 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97112 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.32, PE non-facility 0.62, PE facility 0.22, MP 0.12, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.32 x 1.000 = 0.32; PE 0.22 x 0.950 = 0.209; MP 0.12 x 0.650 = 0.078; total 0.607.
- Fee schedule amount per unit: 0.607 x $20.0000 = $12.14.
- At 100%, per unit: work 640 cents ($6.40), practice expense 418 cents ($4.18), malpractice 156 cents ($1.56); total 1214 cents ($12.14).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97112 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 6 unit(s); 1 is within it.
- Base: 1214 cents ($12.14) x 1 = 1214 cents ($12.14).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-07-14 has 97112 in column 2 and another line's code of the date in column 1.

### Line 3: 97530 x 1 on 2026-07-14

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-14.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-14:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97530, modifier set [CO GP], place of service 22, 2026-07-14:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-14 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-14, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.25 x 0.950 = 0.2375; MP 0.15 x 0.650 = 0.0975; total 0.685.
- Fee schedule amount per unit: 0.685 x $20.0000 = $13.70.
- At 100%, per unit: work 700 cents ($7.00), practice expense 475 cents ($4.75), malpractice 195 cents ($1.95); total 1370 cents ($13.70).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97530 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 1 is within it.
- Base: 1370 cents ($13.70) x 1 = 1370 cents ($13.70).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-07-14 has 97530 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-07-14

Lines with apply_mppr on and a price so far: line 1, line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97112): always therapy, mppr_rate 97112 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97530): always therapy, mppr_rate 97530 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | 97530 | 1 | 475 | kept whole | 0 |
| 2 | 2 | 97112 | 1 | 418 | PE reduced by 40% | 418 x 40% = 167.2 |
| 3 | 1 | 97110 | 1 | 399 | PE reduced by 40% | 399 x 40% = 159.6 |
| 4 | 1 | 97110 | 2 | 399 | PE reduced by 40% | 399 x 40% = 159.6 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 2324, after 2004.8; 2324 cents ($23.24) - the reductions of its units 319.2 = 2004.8 cents ($20.048).
- assistant_reduction: before 2004.8, after 1543.696; CQ present; assistant_modifier pays 77%: 2004.8 cents ($20.048) x 77% = 1543.696 cents ($15.43696).
- sequestration: before 1543.696, after 1497.38512; the amount 1543.696 cents ($15.43696) less the patient share 0 leaves the payer's share 1543.696 cents ($15.43696); 3% of the payer's share is 46.31088; 1543.696 - 46.31088 = 1497.38512 cents ($14.9738512).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1497.38512 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1497 cents ($14.97)**; the unrounded 1497.38512 is kept beside it.

Step 7, variance: expected allowed 1497 - observed allowed 1700 cents (amt_b6) = -203 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-04, ends on 2026-10-03; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1214, after 1046.8; 1214 cents ($12.14) - the reductions of its units 167.2 = 1046.8 cents ($10.468).
- assistant_reduction: before 1046.8, after 1046.8; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1046.8, after 1015.396; the amount 1046.8 cents ($10.468) less the patient share 0 leaves the payer's share 1046.8 cents ($10.468); 3% of the payer's share is 31.404; 1046.8 - 31.404 = 1015.396 cents ($10.15396).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1015.396 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1015 cents ($10.15)**; the unrounded 1015.396 is kept beside it.

Step 7, variance: expected allowed 1015 - observed allowed 1100 cents (amt_b6) = -85 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-04, ends on 2026-10-03; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1370, after 1370; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 1370, after 1054.9; CO present; assistant_modifier pays 77%: 1370 cents ($13.70) x 77% = 1054.9 cents ($10.549).
- sequestration: before 1054.9, after 1023.253; the amount 1054.9 cents ($10.549) less the patient share 0 leaves the payer's share 1054.9 cents ($10.549); 3% of the payer's share is 31.647; 1054.9 - 31.647 = 1023.253 cents ($10.23253).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1023.253 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1023 cents ($10.23)**; the unrounded 1023.253 is kept beside it.

Step 7, variance: expected allowed 1023 - observed allowed 1000 cents (amt_b6) = 23 cents: an underpayment.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-04, ends on 2026-10-03; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 1497 | 1497.38512 | HALF_UP_CENT | 0 | -203 | WINDOW_PASSED (ends 2026-10-03) | none |
| 2 | priced | 1015 | 1015.396 | HALF_UP_CENT | 0 | -85 | WINDOW_PASSED (ends 2026-10-03) | none |
| 3 | priced | 1023 | 1023.253 | HALF_UP_CENT | 0 | 23 | WINDOW_PASSED (ends 2026-10-03) | none |
