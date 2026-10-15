# Worksheet G170: The contracted plan's 60-day window has passed

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G170: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-D/HMO.
- Remittance date: 2026-08-01; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-d-hmo: contract, contract version cv-d-1, 2026-01-01 to open.
- Contract version cv-d-1 (contract contract-synth-d, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute 60 days, appeal levels level 1 60 days, level 2 180 days):
  - Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated; contract-specific adjustment none.
  - Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment caps the line at 5800 cents ($58.00).
  - Rate record rr-d-97750: UNSUPPORTED; scope codes 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97112 | GP | 1 | 2026-07-07 | 11 | 6000 | 1900 (amt_b6) | none |
| 2 | 97116 | GP | 1 | 2026-07-07 | 11 | 6000 | 1700 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97112 x 1 on 2026-07-07

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-07.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-07:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97112, modifier set [GP], place of service 11, 2026-07-07:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97112 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-07 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97112 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.32, PE non-facility 0.62, PE facility 0.22, MP 0.12, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-07, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.32 x 1.000 = 0.32; PE 0.62 x 0.950 = 0.589; MP 0.12 x 0.650 = 0.078; total 0.987.
- Fee schedule amount per unit: 0.987 x $20.0000 = $19.74.
- At 100%, per unit: work 640 cents ($6.40), practice expense 1178 cents ($11.78), malpractice 156 cents ($1.56); total 1974 cents ($19.74).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97112 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 6 unit(s); 1 is within it.
- Base: 1974 cents ($19.74) x 1 = 1974 cents ($19.74).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-07-07 has 97112 in column 2 and another line's code of the date in column 1.

### Line 2: 97116 x 1 on 2026-07-07

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-07.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-07:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97116, modifier set [GP], place of service 11, 2026-07-07:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97116 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97116 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-07 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97116 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.33, PE non-facility 0.53, PE facility 0.23, MP 0.13, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-07, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.33 x 1.000 = 0.33; PE 0.53 x 0.950 = 0.5035; MP 0.13 x 0.650 = 0.0845; total 0.918.
- Fee schedule amount per unit: 0.918 x $20.0000 = $18.36.
- At 100%, per unit: work 660 cents ($6.60), practice expense 1007 cents ($10.07), malpractice 169 cents ($1.69); total 1836 cents ($18.36).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97116 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 1 is within it.
- Base: 1836 cents ($18.36) x 1 = 1836 cents ($18.36).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-07-07 has 97116 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-07-07

Lines with apply_mppr on and a price so far: line 1, line 2. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97112): always therapy, mppr_rate 97112 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97116): always therapy, mppr_rate 97116 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 97112 | 1 | 1178 | kept whole | 0 |
| 2 | 2 | 97116 | 1 | 1007 | PE reduced by 40% | 1007 x 40% = 402.8 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1974, after 1974; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 1974, after 1974; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1974, after 1914.78; the amount 1974 cents ($19.74) less the patient share 0 leaves the payer's share 1974 cents ($19.74); 3% of the payer's share is 59.22; 1974 - 59.22 = 1914.78 cents ($19.1478).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1914.78 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1915 cents ($19.15)**; the unrounded 1914.78 is kept beside it.

Step 7, variance: expected allowed 1915 - observed allowed 1900 cents (amt_b6) = 15 cents: an underpayment.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-01, ends on 2026-09-30; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1836, after 1433.2; 1836 cents ($18.36) - the reductions of its units 402.8 = 1433.2 cents ($14.332).
- assistant_reduction: before 1433.2, after 1433.2; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1433.2, after 1390.204; the amount 1433.2 cents ($14.332) less the patient share 0 leaves the payer's share 1433.2 cents ($14.332); 3% of the payer's share is 42.996; 1433.2 - 42.996 = 1390.204 cents ($13.90204).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 1390.204 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **1390 cents ($13.90)**; the unrounded 1390.204 is kept beside it.

Step 7, variance: expected allowed 1390 - observed allowed 1700 cents (amt_b6) = -310 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-01, ends on 2026-09-30; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 1915 | 1914.78 | HALF_UP_CENT | 0 | 15 | WINDOW_PASSED (ends 2026-09-30) | none |
| 2 | priced | 1390 | 1390.204 | HALF_UP_CENT | 0 | -310 | WINDOW_PASSED (ends 2026-09-30) | none |
