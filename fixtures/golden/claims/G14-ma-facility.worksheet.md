# Worksheet G14: Medicare Advantage non-contracted, facility place of service

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G14: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-1: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-03-10 | 22 | 6000 | 1400 (amt_b6) | none |
| 2 | 97140 | GP | 1 | 2026-03-10 | 22 | 5500 | 1500 (amt_b6) | none |
| 3 | 97530 | GP | 2 | 2026-03-10 | 22 | 14000 | 3200 (amt_b6) | PR-2 640 |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.21 x 0.950 = 0.1995; MP 0.11 x 0.650 = 0.0715; total 0.581.
- Fee schedule amount per unit: 0.581 x $20.0000 = $11.62.
- At 100%, per unit: work 620 cents ($6.20), practice expense 399 cents ($3.99), malpractice 143 cents ($1.43); total 1162 cents ($11.62).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 1 is within it.
- Base: 1162 cents ($11.62) x 1 = 1162 cents ($11.62).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97110 in column 2 and another line's code of the date in column 1.

### Line 2: 97140 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97140 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.34, PE non-facility 0.84, PE facility 0.24, MP 0.14, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.24 x 0.950 = 0.228; MP 0.14 x 0.650 = 0.091; total 0.659.
- Fee schedule amount per unit: 0.659 x $20.0000 = $13.18.
- At 100%, per unit: work 680 cents ($6.80), practice expense 456 cents ($4.56), malpractice 182 cents ($1.82); total 1318 cents ($13.18).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97140 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 6 unit(s); 1 is within it.
- Base: 1318 cents ($13.18) x 1 = 1318 cents ($13.18).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97140 in column 2 and another line's code of the date in column 1.

### Line 3: 97530 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 22 is facility, so the facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.25 x 0.950 = 0.2375; MP 0.15 x 0.650 = 0.0975; total 0.685.
- Fee schedule amount per unit: 0.685 x $20.0000 = $13.70.
- At 100%, per unit: work 700 cents ($7.00), practice expense 475 cents ($4.75), malpractice 195 cents ($1.95); total 1370 cents ($13.70).

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97530 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 2 are within it.
- Base: 1370 cents ($13.70) x 2 = 2740 cents ($27.40).
- Procedure-to-procedure edits: apply_ncci is on; 97530 is in column 2 of these edits with the claim's other lines on 2026-03-10:
  - Line 2 (97140): ncci_ptp column 1 97140, column 2 97530 (2026-01-01 to open, modifier indicator 1). The indicator allows a 59 or X modifier and neither line carries one: review flag NCCI_PTP with line 2. The price is not changed.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1, line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97140): always therapy, mppr_rate 97140 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97530): always therapy, mppr_rate 97530 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | 97530 | 1 | 475 | kept whole | 0 |
| 2 | 3 | 97530 | 2 | 475 | PE reduced by 40% | 475 x 40% = 190 |
| 3 | 2 | 97140 | 1 | 456 | PE reduced by 40% | 456 x 40% = 182.4 |
| 4 | 1 | 97110 | 1 | 399 | PE reduced by 40% | 399 x 40% = 159.6 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1162, after 1002.4; 1162 cents ($11.62) - the reductions of its units 159.6 = 1002.4 cents ($10.024).
- assistant_reduction: before 1002.4, after 1002.4; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1002.4, after 972.328; the amount 1002.4 cents ($10.024) less the patient share 0 leaves the payer's share 1002.4 cents ($10.024); 3% of the payer's share is 30.072; 1002.4 - 30.072 = 972.328 cents ($9.72328).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 972.328 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **972 cents ($9.72)**; the unrounded 972.328 is kept beside it.

Step 7, variance: expected allowed 972 - observed allowed 1400 cents (amt_b6) = -428 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1318, after 1135.6; 1318 cents ($13.18) - the reductions of its units 182.4 = 1135.6 cents ($11.356).
- assistant_reduction: before 1135.6, after 1135.6; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1135.6, after 1101.532; the amount 1135.6 cents ($11.356) less the patient share 0 leaves the payer's share 1135.6 cents ($11.356); 3% of the payer's share is 34.068; 1135.6 - 34.068 = 1101.532 cents ($11.01532).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1101.532 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1102 cents ($11.02)**; the unrounded 1101.532 is kept beside it.

Step 7, variance: expected allowed 1102 - observed allowed 1500 cents (amt_b6) = -398 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 2740, after 2550; 2740 cents ($27.40) - the reductions of its units 190 = 2550 cents ($25.50).
- assistant_reduction: before 2550, after 2550; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2550, after 2492.7; the amount 2550 cents ($25.50) less the patient share 640 leaves the payer's share 1910 cents ($19.10); 3% of the payer's share is 57.3; 2550 - 57.3 = 2492.7 cents ($24.927).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: 640 cents ($6.40) from the line's PR adjustments (PR-2 640); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2492.7 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2493 cents ($24.93)**; the unrounded 2492.7 is kept beside it.

Step 7, variance: expected allowed 2493 - observed allowed 3200 cents (amt_b6) = -707 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 972 | 972.328 | HALF_UP_CENT | 0 | -428 | NO_WINDOW | none |
| 2 | priced | 1102 | 1101.532 | HALF_UP_CENT | 0 | -398 | NO_WINDOW | none |
| 3 | priced | 2493 | 2492.7 | HALF_UP_CENT | 640 | -707 | NO_WINDOW | NCCI_PTP with line 2 |
