# Worksheet G04: Medicare Advantage non-contracted, CQ on the highest-ranked unit

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G04: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-1: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97530 | GP CQ | 1 | 2026-03-10 | 11 | 7000 | 2000 (amt_b6) | none |
| 2 | 97110 | GP | 2 | 2026-03-10 | 11 | 12000 | 4200 (amt_b6) | PR-2 840 |
| 3 | 97140 | GP | 1 | 2026-03-10 | 11 | 5500 | 2400 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97530 x 1 on 2026-03-10

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

### Line 2: 97110 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97110 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.31, PE non-facility 0.71, PE facility 0.21, MP 0.11, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.31 x 1.000 = 0.31; PE 0.71 x 0.950 = 0.6745; MP 0.11 x 0.650 = 0.0715; total 1.056.
- Fee schedule amount per unit: 1.056 x $20.0000 = $21.12.
- At 100%, per unit: work 620 cents ($6.20), practice expense 1349 cents ($13.49), malpractice 143 cents ($1.43); total 2112 cents ($21.12).

Step 3, units: 2 as billed; 2112 cents ($21.12) x 2 = 4224 cents ($42.24).

### Line 3: 97140 x 1 on 2026-03-10

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

Step 3, units: 1 as billed; 2458 cents ($24.58) x 1 = 2458 cents ($24.58).

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1, line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97530): always therapy, mppr_rate 97530 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97140): always therapy, mppr_rate 97140 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97530 | 1 | 1805 | kept whole | 0 |
| 2 | 3 | 97140 | 1 | 1596 | PE reduced by 40% | 1596 x 40% = 638.4 |
| 3 | 2 | 97110 | 1 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |
| 4 | 2 | 97110 | 2 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 2700, after 2700; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2700, after 2079; CQ present; assistant_modifier pays 77%: 2700 cents ($27.00) x 77% = 2079 cents ($20.79).
- sequestration: before 2079, after 2016.63; the amount 2079 cents ($20.79) less the patient share 0 leaves the payer's share 2079 cents ($20.79); 3% of the payer's share is 62.37; 2079 - 62.37 = 2016.63 cents ($20.1663).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2016.63 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2017 cents ($20.17)**; the unrounded 2016.63 is kept beside it.

Step 7, variance: expected allowed 2017 - observed allowed 2000 cents (amt_b6) = 17 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 4224, after 3144.8; 4224 cents ($42.24) - the reductions of its units 1079.2 = 3144.8 cents ($31.448).
- assistant_reduction: before 3144.8, after 3144.8; no CQ or CO modifier on the line; unchanged.
- sequestration: before 3144.8, after 3075.656; the amount 3144.8 cents ($31.448) less the patient share 840 leaves the payer's share 2304.8 cents ($23.048); 3% of the payer's share is 69.144; 3144.8 - 69.144 = 3075.656 cents ($30.75656).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 840 cents ($8.40) from the line's PR adjustments (PR-2 840); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3075.656 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3076 cents ($30.76)**; the unrounded 3075.656 is kept beside it.

Step 7, variance: expected allowed 3076 - observed allowed 4200 cents (amt_b6) = -1124 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 2458, after 1819.6; 2458 cents ($24.58) - the reductions of its units 638.4 = 1819.6 cents ($18.196).
- assistant_reduction: before 1819.6, after 1819.6; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1819.6, after 1765.012; the amount 1819.6 cents ($18.196) less the patient share 0 leaves the payer's share 1819.6 cents ($18.196); 3% of the payer's share is 54.588; 1819.6 - 54.588 = 1765.012 cents ($17.65012).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1765.012 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1765 cents ($17.65)**; the unrounded 1765.012 is kept beside it.

Step 7, variance: expected allowed 1765 - observed allowed 2400 cents (amt_b6) = -635 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 2017 | 2016.63 | HALF_UP_CENT | 0 | 17 | NO_WINDOW |
| 2 | priced | 3076 | 3075.656 | HALF_UP_CENT | 840 | -1124 | NO_WINDOW |
| 3 | priced | 1765 | 1765.012 | HALF_UP_CENT | 0 | -635 | NO_WINDOW |
