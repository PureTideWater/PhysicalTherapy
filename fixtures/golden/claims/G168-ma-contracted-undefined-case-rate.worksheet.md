# Worksheet G168: An undefined case rate is UNSUPPORTED_METHOD; modalities at the MUE

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G168: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-D/HMO.
- Remittance date: 2026-08-18; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-d-hmo: contract, contract version cv-d-1, 2026-01-01 to open.
- Contract version cv-d-1 (contract contract-synth-d, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute 60 days, appeal levels level 1 60 days, level 2 180 days):
  - Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated; contract-specific adjustment none.
  - Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment caps the line at 5800 cents ($58.00).
  - Rate record rr-d-97750: UNSUPPORTED; scope codes 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97750 | GP | 1 | 2026-07-28 | 11 | 8000 | 3000 (amt_b6) | none |
| 2 | 97026 | GP | 2 | 2026-07-28 | 11 | 4000 | 1100 (amt_b6) | none |
| 3 | 97035 | GP | 1 | 2026-07-28 | 11 | 2500 | 1000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97750 x 1 on 2026-07-28

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-28.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-28:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97750, modifier set [GP], place of service 11, 2026-07-28:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): no match, code 97750 is not in its codes.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97750 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): matches.
- Rate record rr-d-97750: method UNSUPPORTED.

Step 2, the base amount by method.
- **Unpriced: `UNSUPPORTED_METHOD`.** The rate record's method is UNSUPPORTED (capitation or an undefined case rate).

### Line 2: 97026 x 2 on 2026-07-28

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-28.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-28:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97026, modifier set [GP], place of service 11, 2026-07-28:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97026 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97026 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-28 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97026 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.06, PE non-facility 0.26, PE facility 0.00 (NA), MP 0.06, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-28, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.06 x 1.000 = 0.06; PE 0.26 x 0.950 = 0.247; MP 0.06 x 0.650 = 0.039; total 0.346.
- Fee schedule amount per unit: 0.346 x $20.0000 = $6.92.
- At 100%, per unit: work 120 cents ($1.20), practice expense 494 cents ($4.94), malpractice 78 cents ($0.78); total 692 cents ($6.92).

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97026 (2026-01-01 to 2026-12-31, adjudication indicator 1) allows 2 unit(s); 2 are within it.
- Base: 692 cents ($6.92) x 2 = 1384 cents ($13.84).
- Procedure-to-procedure edits: apply_ncci is on; 97026 is in column 2 of these edits with the claim's other lines on 2026-07-28:
  - Line 3 (97035): ncci_ptp column 1 97035, column 2 97026 (1996-01-01 to open, modifier indicator 9). Indicator 9 lets no modifier bypass the edit (fixtures/golden/QUESTIONS.md Q41): review flag NCCI_PTP with line 3. The price is not changed.

### Line 3: 97035 x 1 on 2026-07-28

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-07-28.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-07-28:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97035, modifier set [GP], place of service 11, 2026-07-28:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97035 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97035 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-07-28 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97035 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.15, PE non-facility 0.35, PE facility 0.05, MP 0.05, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-07-28, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.15 x 1.000 = 0.15; PE 0.35 x 0.950 = 0.3325; MP 0.05 x 0.650 = 0.0325; total 0.515.
- Fee schedule amount per unit: 0.515 x $20.0000 = $10.30.
- At 100%, per unit: work 300 cents ($3.00), practice expense 665 cents ($6.65), malpractice 65 cents ($0.65); total 1030 cents ($10.30).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97035 (2026-01-01 to 2026-12-31, adjudication indicator 1) allows 3 unit(s); 1 is within it.
- Base: 1030 cents ($10.30) x 1 = 1030 cents ($10.30).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-07-28 has 97035 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-07-28

Lines with apply_mppr on and a price so far: line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 2 (97026): always therapy, mppr_rate 97026 (2026-01-01 to 2026-12-31): 40%.
- Line 3 (97035): always therapy, mppr_rate 97035 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | 97035 | 1 | 665 | kept whole | 0 |
| 2 | 2 | 97026 | 1 | 494 | PE reduced by 40% | 494 x 40% = 197.6 |
| 3 | 2 | 97026 | 2 | 494 | PE reduced by 40% | 494 x 40% = 197.6 |

## Steps 4 to 8, per line

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1384, after 988.8; 1384 cents ($13.84) - the reductions of its units 395.2 = 988.8 cents ($9.888).
- assistant_reduction: before 988.8, after 988.8; no CQ or CO modifier on the line; unchanged.
- sequestration: before 988.8, after 959.136; the amount 988.8 cents ($9.888) less the patient share 0 leaves the payer's share 988.8 cents ($9.888); 3% of the payer's share is 29.664; 988.8 - 29.664 = 959.136 cents ($9.59136).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 959.136 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **959 cents ($9.59)**; the unrounded 959.136 is kept beside it.

Step 7, variance: expected allowed 959 - observed allowed 1100 cents (amt_b6) = -141 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-18, ends on 2026-10-17; on the triage date 2026-10-15 it is open.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 1030, after 1030; its unit is the day's highest-ranked, kept whole; unchanged.
- assistant_reduction: before 1030, after 1030; no CQ or CO modifier on the line; unchanged.
- sequestration: before 1030, after 999.1; the amount 1030 cents ($10.30) less the patient share 0 leaves the payer's share 1030 cents ($10.30); 3% of the payer's share is 30.9; 1030 - 30.9 = 999.1 cents ($9.991).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 999.1 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **999 cents ($9.99)**; the unrounded 999.1 is kept beside it.

Step 7, variance: expected allowed 999 - observed allowed 1000 cents (amt_b6) = -1 cents: an overpayment, recorded and never pursued.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-08-18, ends on 2026-10-17; on the triage date 2026-10-15 it is open.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `UNSUPPORTED_METHOD` | | | | | | | |
| 2 | priced | 959 | 959.136 | HALF_UP_CENT | 0 | -141 | OPEN (ends 2026-10-17) | NCCI_PTP with line 3 |
| 3 | priced | 999 | 999.1 | HALF_UP_CENT | 0 | -1 | OPEN (ends 2026-10-17) | none |
