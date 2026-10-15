# Worksheet G172: A reversal under the contracted MA plan

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G172: status 22 (reversal of a prior payment); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-D/HMO.
- Remittance date: 2026-05-05; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-d-hmo: contract, contract version cv-d-1, 2026-01-01 to open.
- Contract version cv-d-1 (contract contract-synth-d, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute 60 days, appeal levels level 1 60 days, level 2 180 days):
  - Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated; contract-specific adjustment none.
  - Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment caps the line at 5800 cents ($58.00).
  - Rate record rr-d-97750: UNSUPPORTED; scope codes 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-03-10 | 11 | -12000 | -4200 (amt_b6) | PR-2 -840 |
| 2 | 97530 | GP | 1 | 2026-03-10 | 11 | -7000 | -2650 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-03-10

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97110, modifier set [GP], place of service 11, 2026-03-10:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

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
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 2 are within it.
- Base: 2112 cents ($21.12) x 2 = 4224 cents ($42.24).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97110 in column 2 and another line's code of the date in column 1.

### Line 2: 97530 x 1 on 2026-03-10

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-03-10.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-03-10:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97530, modifier set [GP], place of service 11, 2026-03-10:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97530 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

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

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97530 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 1 is within it.
- Base: 2700 cents ($27.00) x 1 = 2700 cents ($27.00).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-10 has 97530 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-03-10

Lines with apply_mppr on and a price so far: line 1, line 2. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97110): always therapy, mppr_rate 97110 (2026-01-01 to 2026-12-31): 40%.
- Line 2 (97530): always therapy, mppr_rate 97530 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | 97530 | 1 | 1805 | kept whole | 0 |
| 2 | 1 | 97110 | 1 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |
| 3 | 1 | 97110 | 2 | 1349 | PE reduced by 40% | 1349 x 40% = 539.6 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 4224, after 3144.8; 4224 cents ($42.24) - the reductions of its units 1079.2 = 3144.8 cents ($31.448).
- assistant_reduction: before 3144.8, after 3144.8; no CQ or CO modifier on the line; unchanged.
- sequestration: before 3144.8, after 3025.256; the amount 3144.8 cents ($31.448) less the patient share -840 leaves the payer's share 3984.8 cents ($39.848); 3% of the payer's share is 119.544; 3144.8 - 119.544 = 3025.256 cents ($30.25256).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: -840 cents ($-8.40) from the line's PR adjustments (PR-2 -840); reported beside the expected amount, never subtracted from it.
- **Unpriced: `REVERSED_CLAIM`.** Claim status 22 (reversal of a prior payment).

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 2700, after 2700; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 2700, after 2700; no CQ or CO modifier on the line; unchanged.
- sequestration: before 2700, after 2619; the amount 2700 cents ($27.00) less the patient share 0 leaves the payer's share 2700 cents ($27.00); 3% of the payer's share is 81; 2700 - 81 = 2619 cents ($26.19).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- **Unpriced: `REVERSED_CLAIM`.** Claim status 22 (reversal of a prior payment).

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `REVERSED_CLAIM` | | | | | | | |
| 2 | unpriced `REVERSED_CLAIM` | | | | | | | |
