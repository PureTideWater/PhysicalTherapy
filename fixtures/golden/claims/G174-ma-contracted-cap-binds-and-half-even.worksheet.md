# Worksheet G174: The evaluation cap binds without a patient share; CQ on an evaluation lands near a cent

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G174: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-MA-PLAN-D/HMO.
- Remittance date: 2026-09-08; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-d-hmo: contract, contract version cv-d-1, 2026-01-01 to open.
- Contract version cv-d-1 (contract contract-synth-d, version 1, signed_off, 2026-01-01 to open; windows: timely filing 365 days, dispute 60 days, appeal levels level 1 60 days, level 2 180 days):
  - Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated; contract-specific adjustment none.
  - Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment caps the line at 5800 cents ($58.00).
  - Rate record rr-d-97750: UNSUPPORTED; scope codes 97750; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97162 | GP | 1 | 2026-08-18 | 11 | 19000 | 5800 (amt_b6) | none |
| 2 | 97163 | GP CQ | 1 | 2026-08-18 | 11 | 19000 | 4400 (amt_b6) | none |
| 3 | 97116 | GP | 2 | 2026-08-18 | 11 | 12000 | 3100 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97162 x 1 on 2026-08-18

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-08-18.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-08-18:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97162, modifier set [GP], place of service 11, 2026-08-18:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): no match, code 97162 is not in its codes.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97162 is not in its codes.
- Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment: caps the line at 5800 cents ($58.00).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-08-18 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97162 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 1.62, PE non-facility 1.32, PE facility 0.62, MP 0.16, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-08-18, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor qualifying_apm (2026-01-01 to 2026-12-31): $20.1000 per RVU.
- Geographically adjusted RVUs: work 1.62 x 1.000 = 1.62; PE 1.32 x 0.950 = 1.254; MP 0.16 x 0.650 = 0.104; total 2.978.
- Fee schedule amount per unit: 2.978 x $20.1000 = $59.8578.
- At 100%, per unit: work 3256.2 cents ($32.562), practice expense 2520.54 cents ($25.2054), malpractice 209.04 cents ($2.0904); total 5985.78 cents ($59.8578).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97162 (2026-01-01 to 2026-12-31, adjudication indicator 2) allows 1 unit(s); 1 is within it.
- Base: 5985.78 cents ($59.8578) x 1 = 5985.78 cents ($59.8578).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-08-18 has 97162 in column 2 and another line's code of the date in column 1.

### Line 2: 97163 x 1 on 2026-08-18

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-08-18.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-08-18:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97163, modifier set [CQ GP], place of service 11, 2026-08-18:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): no match, code 97163 is not in its codes.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97163 is not in its codes.
- Rate record rr-d-evaluation: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment: caps the line at 5800 cents ($58.00).

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-08-18 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97163 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 1.63, PE non-facility 1.33, PE facility 0.63, MP 0.16, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-08-18, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor qualifying_apm (2026-01-01 to 2026-12-31): $20.1000 per RVU.
- Geographically adjusted RVUs: work 1.63 x 1.000 = 1.63; PE 1.33 x 0.950 = 1.2635; MP 0.16 x 0.650 = 0.104; total 2.9975.
- Fee schedule amount per unit: 2.9975 x $20.1000 = $60.24975.
- At 100%, per unit: work 3276.3 cents ($32.763), practice expense 2539.635 cents ($25.39635), malpractice 209.04 cents ($2.0904); total 6024.975 cents ($60.24975).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97163 (2026-01-01 to 2026-12-31, adjudication indicator 2) allows 1 unit(s); 1 is within it.
- Base: 6024.975 cents ($60.24975) x 1 = 6024.975 cents ($60.24975).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-08-18 has 97163 in column 2 and another line's code of the date in column 1.

### Line 3: 97116 x 2 on 2026-08-18

Step 1, the agreement.
- Mapping map-d-hmo (contract, 2026-01-01 to open) is in force on 2026-08-18.
- The mapping names contract version cv-d-1 of contract contract-synth-d; the version that prices the line is the signed-off one of that contract in force on 2026-08-18:
  - cv-d-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-d-1 against code 97116, modifier set [GP], place of service 11, 2026-08-18:
  - rr-d-therapy (codes 97110, 97112, 97116, 97140, 97530, 97026, 97035, G0283; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-d-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97116 is not in its codes.
  - rr-d-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to open): no match, code 97116 is not in its codes.
- Rate record rr-d-therapy: PERCENT_OF_MEDICARE at 100%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding not stated (the practice default applies); contract-specific adjustment: none.

Step 2, the base amount by method.
- Year basis CURRENT: the fee schedule in effect on the date of service, 2026-08-18 (basis year 2026); each value is the record in force on that date.
- pfs_rvu 97116 (year 2026, quarter A, 2026-01-01 to 2026-12-31): work 0.33, PE non-facility 0.53, PE facility 0.23, MP 0.13, status A.
- Place of service 11 is non-facility, so the non-facility practice-expense value applies.
- Locality: practice ZIP 00011 maps to carrier 99999 locality 01 (locality_map in force on 2026-08-18, 2026-01-01 to 2026-12-31).
- pfs_gpci 99999-01 (2026-01-01 to 2026-12-31): work 1.000, PE 0.950, MP 0.650.
- conversion_factor non_qualifying_apm (2026-01-01 to 2026-12-31): $20.0000 per RVU.
- Geographically adjusted RVUs: work 0.33 x 1.000 = 0.33; PE 0.53 x 0.950 = 0.5035; MP 0.13 x 0.650 = 0.0845; total 0.918.
- Fee schedule amount per unit: 0.918 x $20.0000 = $18.36.
- At 100%, per unit: work 660 cents ($6.60), practice expense 1007 cents ($10.07), malpractice 169 cents ($1.69); total 1836 cents ($18.36).

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97116 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 2 are within it.
- Base: 1836 cents ($18.36) x 2 = 3672 cents ($36.72).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-08-18 has 97116 in column 2 and another line's code of the date in column 1.

## Step 4a, the multiple procedure reduction, per day

### Multiple procedure reduction on 2026-08-18

Lines with apply_mppr on and a price so far: line 1, line 2, line 3. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).
- Line 1 (97162): no mppr_rate record in force on 2026-08-18, so it is not an always-therapy code; never reduced and not ranked.
- Line 2 (97163): no mppr_rate record in force on 2026-08-18, so it is not an always-therapy code; never reduced and not ranked.
- Line 3 (97116): always therapy, mppr_rate 97116 (2026-01-01 to 2026-12-31): 40%.

| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | 97116 | 1 | 1007 | kept whole | 0 |
| 2 | 3 | 97116 | 2 | 1007 | PE reduced by 40% | 1007 x 40% = 402.8 |

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 5985.78, after 5985.78; not an always-therapy code; unchanged.
- assistant_reduction: before 5985.78, after 5985.78; no CQ or CO modifier on the line; unchanged.
- sequestration: before 5985.78, after 5806.2066; the amount 5985.78 cents ($59.8578) less the patient share 0 leaves the payer's share 5985.78 cents ($59.8578); 3% of the payer's share is 179.5734; 5985.78 - 179.5734 = 5806.2066 cents ($58.062066).
- contract_adjustment: before 5806.2066, after 5800; the rate record caps the line at 5800 cents ($58.00): the lesser of 5806.2066 and 5800 is 5800 cents ($58.00).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 5800 cents under HALF_EVEN_CENT (the rate record's rule; halves move to the even cent) = **5800 cents ($58.00)**; the unrounded 5800 is kept beside it.

Step 7, variance: expected allowed 5800 - observed allowed 5800 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-09-08, ends on 2026-11-07; on the triage date 2026-10-15 it is open.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 6024.975, after 6024.975; not an always-therapy code; unchanged.
- assistant_reduction: before 6024.975, after 4639.23075; CQ present; assistant_modifier pays 77%: 6024.975 cents ($60.24975) x 77% = 4639.23075 cents ($46.3923075).
- sequestration: before 4639.23075, after 4500.0538275; the amount 4639.23075 cents ($46.3923075) less the patient share 0 leaves the payer's share 4639.23075 cents ($46.3923075); 3% of the payer's share is 139.1769225; 4639.23075 - 139.1769225 = 4500.0538275 cents ($45.000538275).
- contract_adjustment: before 4500.0538275, after 4500.0538275; the rate record caps the line at 5800 cents ($58.00): the lesser of 4500.0538275 and 5800 is 4500.0538275 cents ($45.000538275).

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 4500.0538275 cents under HALF_EVEN_CENT (the rate record's rule; halves move to the even cent) = **4500 cents ($45.00)**; the unrounded 4500.0538275 is kept beside it.

Step 7, variance: expected allowed 4500 - observed allowed 4400 cents (amt_b6) = 100 cents: an underpayment.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-09-08, ends on 2026-11-07; on the triage date 2026-10-15 it is open.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: before 3672, after 3269.2; 3672 cents ($36.72) - the reductions of its units 402.8 = 3269.2 cents ($32.692).
- assistant_reduction: before 3269.2, after 3269.2; no CQ or CO modifier on the line; unchanged.
- sequestration: before 3269.2, after 3171.124; the amount 3269.2 cents ($32.692) less the patient share 0 leaves the payer's share 3269.2 cents ($32.692); 3% of the payer's share is 98.076; 3269.2 - 98.076 = 3171.124 cents ($31.71124).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3171.124 cents under HALF_UP_CENT (the practice default; halves move away from zero) = **3171 cents ($31.71)**; the unrounded 3171.124 is kept beside it.

Step 7, variance: expected allowed 3171 - observed allowed 3100 cents (amt_b6) = 71 cents: an underpayment.

Step 8, dispute window: the contract's dispute window, 60 days from the remittance date 2026-09-08, ends on 2026-11-07; on the triage date 2026-10-15 it is open.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 5800 | 5800 | HALF_EVEN_CENT | 0 | 0 | OPEN (ends 2026-11-07) | none |
| 2 | priced | 4500 | 4500.0538275 | HALF_EVEN_CENT | 0 | 100 | OPEN (ends 2026-11-07) | none |
| 3 | priced | 3171 | 3171.124 | HALF_UP_CENT | 0 | 71 | OPEN (ends 2026-11-07) | none |
