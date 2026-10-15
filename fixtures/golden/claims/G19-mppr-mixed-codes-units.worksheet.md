# Worksheet G19: Multiple procedure reduction with mixed codes and units

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G19: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-1: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97140 | GP | 2 | 2026-03-10 | 11 | 11000 | 3800 (amt_b6) | none |
| 2 | 97116 | GP | 3 | 2026-03-10 | 11 | 17400 | 4100 (amt_b6) | PR-1 1500 |
| 3 | 97530 | GP | 1 | 2026-03-10 | 11 | 7000 | 2600 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97140 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97140 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.34, PE non-facility 0.84, PE facility 0.24, MP 0.14, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.34 x 1.000 = 0.34; PE 0.84 x 0.950 = 0.798; MP 0.14 x 0.650 = 0.091; total 1.229.
- Fee schedule amount per unit: 1.229 x $20.0000 = $24.58.
- At 100%, per unit: work 680 cents ($6.80), practice expense 1596 cents ($15.96), malpractice 182 cents ($1.82); total 2458 cents ($24.58).

Step 3, units: 2 as billed; 2458 cents ($24.58) x 2 = 4916 cents ($49.16).

### Line 2: 97116 x 3 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97116 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.33, PE non-facility 0.53, PE facility 0.23, MP 0.13, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.33 x 1.000 = 0.33; PE 0.53 x 0.950 = 0.5035; MP 0.13 x 0.650 = 0.0845; total 0.918.
- Fee schedule amount per unit: 0.918 x $20.0000 = $18.36.
- At 100%, per unit: work 660 cents ($6.60), practice expense 1007 cents ($10.07), malpractice 169 cents ($1.69); total 1836 cents ($18.36).

Step 3, units: 3 as billed; 1836 cents ($18.36) x 3 = 5508 cents ($55.08).

### Line 3: 97530 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97530 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.35, PE non-facility 0.95, PE facility 0.25, MP 0.15, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.35 x 1.000 = 0.35; PE 0.95 x 0.950 = 0.9025; MP 0.15 x 0.650 = 0.0975; total 1.35.
- Fee schedule amount per unit: 1.35 x $20.0000 = $27.00.
- At 100%, per unit: work 700 cents ($7.00), practice expense 1805 cents ($18.05), malpractice 195 cents ($1.95); total 2700 cents ($27.00).

Step 3, units: 1 as billed; 2700 cents ($27.00) x 1 = 2700 cents ($27.00).

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1, line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97140): always therapy, mppr_rate 97140 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97116): always therapy, mppr_rate 97116 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97530): always therapy, mppr_rate 97530 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | 97530 | 1 | 1805 | kept whole | 0 |
| 2 | 1 | 97140 | 1 | 1596 | PE reduced by 40% | 1596 x 40% = 638.4 |
| 3 | 1 | 97140 | 2 | 1596 | PE reduced by 40% | 1596 x 40% = 638.4 |
| 4 | 2 | 97116 | 1 | 1007 | PE reduced by 40% | 1007 x 40% = 402.8 |
| 5 | 2 | 97116 | 2 | 1007 | PE reduced by 40% | 1007 x 40% = 402.8 |
| 6 | 2 | 97116 | 3 | 1007 | PE reduced by 40% | 1007 x 40% = 402.8 |

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 4916, after 3639.2; 4916 cents ($49.16) - the reductions of its units 1276.8 = 3639.2 cents ($36.392).
- assistant_reduction: before 3639.2, after 3639.2; no CQ or CO modifier on the line; unchanged.
- sequestration: before 3639.2, after 3530.024; the amount 3639.2 cents ($36.392) less the patient share 0 leaves the payer's share 3639.2 cents ($36.392); 3% of the payer's share is 109.176; 3639.2 - 109.176 = 3530.024 cents ($35.30024).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3530.024 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3530 cents ($35.30)**; the unrounded 3530.024 is kept beside it.

Step 7, variance: expected allowed 3530 - observed allowed 3800 cents (amt_b6) = -270 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 5508, after 4299.6; 5508 cents ($55.08) - the reductions of its units 1208.4 = 4299.6 cents ($42.996).
- assistant_reduction: before 4299.6, after 4299.6; no CQ or CO modifier on the line; unchanged.
- sequestration: before 4299.6, after 4215.612; the amount 4299.6 cents ($42.996) less the patient share 1500 leaves the payer's share 2799.6 cents ($27.996); 3% of the payer's share is 83.988; 4299.6 - 83.988 = 4215.612 cents ($42.15612).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 1500 cents ($15.00) from the line's PR adjustments (PR-1 1500); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 4215.612 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **4216 cents ($42.16)**; the unrounded 4215.612 is kept beside it.

Step 7, variance: expected allowed 4216 - observed allowed 4100 cents (amt_b6) = 116 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 2700, after 2700; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2700, after 2700; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2700, after 2619; the amount 2700 cents ($27.00) less the patient share 0 leaves the payer's share 2700 cents ($27.00); 3% of the payer's share is 81; 2700 - 81 = 2619 cents ($26.19).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2619 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2619 cents ($26.19)**; the unrounded 2619 is kept beside it.

Step 7, variance: expected allowed 2619 - observed allowed 2600 cents (amt_b6) = 19 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 3530 | 3530.024 | HALF_UP_CENT | 0 | -270 | NO_WINDOW |
| 2 | priced | 4216 | 4215.612 | HALF_UP_CENT | 1500 | 116 | NO_WINDOW |
| 3 | priced | 2619 | 2619 | HALF_UP_CENT | 0 | 19 | NO_WINDOW |
