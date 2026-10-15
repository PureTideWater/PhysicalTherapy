# Worksheet G20: An evaluation code beside always-therapy codes

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G20: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-ma-1: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97161 | GP | 1 | 2026-03-10 | 11 | 15000 | 6900 (amt_b6) | PR-3 2000 |
| 2 | 97110 | GP | 2 | 2026-03-10 | 11 | 12000 | 3500 (amt_b6) | none |
| 3 | 97140 | GP | 1 | 2026-03-10 | 11 | 5500 | 2000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97161 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-ma-1 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97161 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 1.61, PE non-facility 1.31, PE facility 0.61, MP 0.16, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 1.61 x 1.000 = 1.61; PE 1.31 x 0.950 = 1.2445; MP 0.16 x 0.650 = 0.104; total 2.9585.
- Fee schedule amount per unit: 2.9585 x $20.0000 = $59.17.
- At 100%, per unit: work 3220 cents ($32.20), practice expense 2489 cents ($24.89), malpractice 208 cents ($2.08); total 5917 cents ($59.17).

Step 3, units: 1 as billed; 5917 cents ($59.17) x 1 = 5917 cents ($59.17).

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
- Line 1 (97161): no mppr_rate record in force on 2026-03-10, so it is not an always-therapy code; never reduced and not ranked.
- Line 2 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97140): always therapy, mppr_rate 97140 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | 97140 | 1 | 1596 | kept whole | 0 |
| 2 | 2 | 97110 | 1 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |
| 3 | 2 | 97110 | 2 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |

## Steps 4 to 8, per line

### Line 1

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 5917, after 5917; not an always-therapy code; unchanged.
- assistant_reduction: before 5917, after 5917; no CQ or CO modifier on the line; unchanged.
- sequestration: before 5917, after 5799.49; the amount 5917 cents ($59.17) less the patient share 2000 leaves the payer's share 3917 cents ($39.17); 3% of the payer's share is 117.51; 5917 - 117.51 = 5799.49 cents ($57.9949).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 2000 cents ($20.00) from the line's PR adjustments (PR-3 2000); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 5799.49 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **5799 cents ($57.99)**; the unrounded 5799.49 is kept beside it.

Step 7, variance: expected allowed 5799 - observed allowed 6900 cents (amt_b6) = -1101 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 4224, after 3144.8; 4224 cents ($42.24) - the reductions of its units 1079.2 = 3144.8 cents ($31.448).
- assistant_reduction: before 3144.8, after 3144.8; no CQ or CO modifier on the line; unchanged.
- sequestration: before 3144.8, after 3050.456; the amount 3144.8 cents ($31.448) less the patient share 0 leaves the payer's share 3144.8 cents ($31.448); 3% of the payer's share is 94.344; 3144.8 - 94.344 = 3050.456 cents ($30.50456).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3050.456 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3050 cents ($30.50)**; the unrounded 3050.456 is kept beside it.

Step 7, variance: expected allowed 3050 - observed allowed 3500 cents (amt_b6) = -450 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 3

Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).
- mppr: before 2458, after 2458; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2458, after 2458; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2458, after 2384.26; the amount 2458 cents ($24.58) less the patient share 0 leaves the payer's share 2458 cents ($24.58); 3% of the payer's share is 73.74; 2458 - 73.74 = 2384.26 cents ($23.8426).
- Contract-specific adjustments: none (phase one rate records define none).
- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2384.26 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2384 cents ($23.84)**; the unrounded 2384.26 is kept beside it.

Step 7, variance: expected allowed 2384 - observed allowed 2000 cents (amt_b6) = 384 cents: an underpayment.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 5799 | 5799.49 | HALF_UP_CENT | 2000 | -1101 | NO_WINDOW |
| 2 | priced | 3050 | 3050.456 | HALF_UP_CENT | 0 | -450 | NO_WINDOW |
| 3 | priced | 2384 | 2384.26 | HALF_UP_CENT | 0 | 384 | NO_WINDOW |
