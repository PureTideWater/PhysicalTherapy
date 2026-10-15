# Worksheet G64: The multiple procedure reduction falls back to the general rate for a code listed without a share

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900003: invented for tests, never a CMS value.

## Inputs

- Release 900003 at fixtures/synthetic/rules/release-synth-900003; its MANIFEST.json has SHA-256 e4d7228d5344d9fc824b223ae7d1af7608c81a2c9ec9fc31db1e66f1e555f5c8 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G64: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-G64/PLAN-1.
- Remittance date: not known; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-g64: ma_noncontracted, 2026-01-01 to open.
- Contract versions: none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 1 | 2026-03-10 | 11 | 6000 | 2200 (amt_b6) | none |
| 2 | 97112 | GP | 2 | 2026-03-10 | 11 | 11000 | 3600 (amt_b6) | PR-2 400 |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-g64 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

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

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 1 is within it.
- Base: 2112 cents ($21.12) x 1 = 2112 cents ($21.12).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97110 in column 2 and another line's code of the date in column 1.

### Line 2: 97112 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-g64 (ma_noncontracted, 2026-01-01 to open) is in force on 2026-03-10.
- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on (apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED); no contract rounding, so the practice default applies; no contract-specific adjustment.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-03-10 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97112 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.32, PE non-facility 0.62, PE facility 0.22, MP 0.12, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-03-10, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.32 x 1.000 = 0.32; PE 0.62 x 0.950 = 0.589; MP 0.12 x 0.650 = 0.078; total 0.987.
- Fee schedule amount per unit: 0.987 x $20.0000 = $19.74.
- At 100%, per unit: work 640 cents ($6.40), practice expense 1178 cents ($11.78), malpractice 156 cents ($1.56); total 1974 cents ($19.74).

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97112 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 6 unit(s); 2 are within it.
- Base: 1974 cents ($19.74) x 2 = 3948 cents ($39.48).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97112 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1, line 2. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97112): always therapy, general mppr_rate practice_expense: 45%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97110 | 1 | 1349 | kept whole | 0 |
| 2 | 2 | 97112 | 1 | 1178 | PE reduced by 45% | 1178 x 45% = 530.1 |
| 3 | 2 | 97112 | 2 | 1178 | PE reduced by 45% | 1178 x 45% = 530.1 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 2112, after 2112; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2112, after 2112; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2112, after 2048.64; the amount 2112 cents ($21.12) less the patient share 0 leaves the payer's share 2112 cents ($21.12); 3% of the payer's share is 63.36; 2112 - 63.36 = 2048.64 cents ($20.4864).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2048.64 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2049 cents ($20.49)**; the unrounded 2048.64 is kept beside it.

Step 7, variance: expected allowed 2049 - observed allowed 2200 cents (amt_b6) = -151 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 3948, after 2887.8; 3948 cents ($39.48) - the reductions of its units 1060.2 = 2887.8 cents ($28.878).
- assistant_reduction: before 2887.8, after 2887.8; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2887.8, after 2813.166; the amount 2887.8 cents ($28.878) less the patient share 400 leaves the payer's share 2487.8 cents ($24.878); 3% of the payer's share is 74.634; 2887.8 - 74.634 = 2813.166 cents ($28.13166).
- contract_adjustment: the Medicare Advantage non-contracted terms define none; not applied.

Step 5, patient share: 400 cents ($4.00) from the line's PR adjustments (PR-2 400); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 2813.166 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **2813 cents ($28.13)**; the unrounded 2813.166 is kept beside it.

Step 7, variance: expected allowed 2813 - observed allowed 3600 cents (amt_b6) = -787 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the remittance date is not known, so no deadline can be worked out: NO_WINDOW on 2026-10-15.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 2049 | 2048.64 | HALF_UP_CENT | 0 | -151 | NO_WINDOW | none |
| 2 | priced | 2813 | 2813.166 | HALF_UP_CENT | 400 | -787 | NO_WINDOW | none |
