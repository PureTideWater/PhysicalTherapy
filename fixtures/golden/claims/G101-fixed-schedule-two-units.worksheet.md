# Worksheet G101: Fixed schedule: the amount per unit times the units

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G101: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-A/PLAN-PPO.
- Remittance date: 2026-03-24; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-a-ppo: contract, contract version cv-a-1, 2026-01-01 to open.
- Contract version cv-a-1 (contract contract-synth-a, version 1, signed_off, 2026-01-01 to 2026-06-30; windows: timely filing 180 days, dispute 90 days, appeal levels level 1 60 days, level 2 60 days):
  - Rate record rr-a1-97110: FIXED_SCHEDULE, 3250 cents ($32.50) per unit; scope codes 97110; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97112: FIXED_SCHEDULE, 3175 cents ($31.75) per unit; scope codes 97112; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97116: FIXED_SCHEDULE, 2875 cents ($28.75) per unit; scope codes 97116; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97140: FIXED_SCHEDULE, 3010 cents ($30.10) per unit; scope codes 97140; modifier sets [GP]; [CQ GP]; [CO GP]; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97140-distinct: FIXED_SCHEDULE, 2800 cents ($28.00) per unit; scope codes 97140; modifier sets [59 GP]; [GP XS]; [GP XU]; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97530: FIXED_SCHEDULE, 3333 cents ($33.33) per unit; scope codes 97530; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-evaluation: FIXED_SCHEDULE, 9500 cents ($95.00) per unit; scope codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97164: FIXED_SCHEDULE, 6250 cents ($62.50) per unit; scope codes 97164; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97035-page-4: FIXED_SCHEDULE, 1500 cents ($15.00) per unit; scope codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97035-page-7: FIXED_SCHEDULE, 1450 cents ($14.50) per unit; scope codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-97750: FIXED_SCHEDULE, 4100 cents ($41.00) per unit; scope codes 97750; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule UNKNOWN; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-a1-g0283: UNSUPPORTED; scope codes G0283; any modifiers; any place of service; 2026-01-01 to 2026-06-30; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated.
- Contract version cv-a-2 (contract contract-synth-a, version 2, signed_off, 2026-07-01 to open; windows: timely filing 180 days, dispute 120 days, appeal levels level 1 60 days):
  - Rate record rr-a2-97110: FIXED_SCHEDULE, 3350 cents ($33.50) per unit; scope codes 97110; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97112: FIXED_SCHEDULE, 3250 cents ($32.50) per unit; scope codes 97112; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97116: FIXED_SCHEDULE, 2975 cents ($29.75) per unit; scope codes 97116; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97140: FIXED_SCHEDULE, 3110 cents ($31.10) per unit; scope codes 97140; modifier sets [GP]; [CQ GP]; [CO GP]; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97140-distinct: FIXED_SCHEDULE, 2900 cents ($29.00) per unit; scope codes 97140; modifier sets [59 GP]; [GP XS]; [GP XU]; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97530: FIXED_SCHEDULE, 3433 cents ($34.33) per unit; scope codes 97530; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment caps the line at 6000 cents ($60.00).
  - Rate record rr-a2-evaluation: FIXED_SCHEDULE, 9800 cents ($98.00) per unit; scope codes 97161, 97162, 97163; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97164: FIXED_SCHEDULE, 6450 cents ($64.50) per unit; scope codes 97164; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
  - Rate record rr-a2-97750: FIXED_SCHEDULE, 4250 cents ($42.50) per unit; scope codes 97750; any modifiers; any place of service; 2026-07-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_EVEN_CENT; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP | 2 | 2026-03-03 | 11 | 15000 | 6500 (amt_b6) | none |
| 2 | 97112 | GP | 1 | 2026-03-03 | 11 | 7500 | 3175 (amt_b6) | none |
| 3 | 97116 | GP | 3 | 2026-03-03 | 11 | 18000 | 8000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-03-03

Step 1, the agreement.
- Mapping map-a-ppo (contract, 2026-01-01 to open) is in force on 2026-03-03.
- The mapping names contract version cv-a-1 of contract contract-synth-a; the version that prices the line is the signed-off one of that contract in force on 2026-03-03:
  - cv-a-1 (version 1, signed_off, 2026-01-01 to 2026-06-30): signed off and in force.
  - cv-a-2 (version 2, signed_off, 2026-07-01 to open): outside its window.
- Rate records of cv-a-1 against code 97110, modifier set [GP], place of service 11, 2026-03-03:
  - rr-a1-97110 (codes 97110; any modifiers; any place of service; 2026-01-01 to 2026-06-30): matches.
  - rr-a1-97112 (codes 97112; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97116 (codes 97116; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97140 (codes 97140; modifier sets [GP]; [CQ GP]; [CO GP]; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97140-distinct (codes 97140; modifier sets [59 GP]; [GP XS]; [GP XU]; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97530 (codes 97530; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-evaluation (codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97164 (codes 97164; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97035-page-4 (codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97035-page-7 (codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
  - rr-a1-g0283 (codes G0283; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97110 is not in its codes.
- Rate record rr-a1-97110: FIXED_SCHEDULE, 3250 cents ($32.50) per unit; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- FIXED_SCHEDULE: 3250 cents ($32.50) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 2 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 2 are within it.
- Base: 3250 cents ($32.50) x 2 = 6500 cents ($65.00).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-03 has 97110 in column 2 and another line's code of the date in column 1.

### Line 2: 97112 x 1 on 2026-03-03

Step 1, the agreement.
- Mapping map-a-ppo (contract, 2026-01-01 to open) is in force on 2026-03-03.
- The mapping names contract version cv-a-1 of contract contract-synth-a; the version that prices the line is the signed-off one of that contract in force on 2026-03-03:
  - cv-a-1 (version 1, signed_off, 2026-01-01 to 2026-06-30): signed off and in force.
  - cv-a-2 (version 2, signed_off, 2026-07-01 to open): outside its window.
- Rate records of cv-a-1 against code 97112, modifier set [GP], place of service 11, 2026-03-03:
  - rr-a1-97110 (codes 97110; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97112 (codes 97112; any modifiers; any place of service; 2026-01-01 to 2026-06-30): matches.
  - rr-a1-97116 (codes 97116; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97140 (codes 97140; modifier sets [GP]; [CQ GP]; [CO GP]; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97140-distinct (codes 97140; modifier sets [59 GP]; [GP XS]; [GP XU]; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97530 (codes 97530; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-evaluation (codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97164 (codes 97164; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97035-page-4 (codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97035-page-7 (codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
  - rr-a1-g0283 (codes G0283; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97112 is not in its codes.
- Rate record rr-a1-97112: FIXED_SCHEDULE, 3175 cents ($31.75) per unit; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- FIXED_SCHEDULE: 3175 cents ($31.75) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97112 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 6 unit(s); 1 is within it.
- Base: 3175 cents ($31.75) x 1 = 3175 cents ($31.75).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-03 has 97112 in column 2 and another line's code of the date in column 1.

### Line 3: 97116 x 3 on 2026-03-03

Step 1, the agreement.
- Mapping map-a-ppo (contract, 2026-01-01 to open) is in force on 2026-03-03.
- The mapping names contract version cv-a-1 of contract contract-synth-a; the version that prices the line is the signed-off one of that contract in force on 2026-03-03:
  - cv-a-1 (version 1, signed_off, 2026-01-01 to 2026-06-30): signed off and in force.
  - cv-a-2 (version 2, signed_off, 2026-07-01 to open): outside its window.
- Rate records of cv-a-1 against code 97116, modifier set [GP], place of service 11, 2026-03-03:
  - rr-a1-97110 (codes 97110; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97112 (codes 97112; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97116 (codes 97116; any modifiers; any place of service; 2026-01-01 to 2026-06-30): matches.
  - rr-a1-97140 (codes 97140; modifier sets [GP]; [CQ GP]; [CO GP]; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97140-distinct (codes 97140; modifier sets [59 GP]; [GP XS]; [GP XU]; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97530 (codes 97530; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-evaluation (codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97164 (codes 97164; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97035-page-4 (codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97035-page-7 (codes 97035; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-97750 (codes 97750; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
  - rr-a1-g0283 (codes G0283; any modifiers; any place of service; 2026-01-01 to 2026-06-30): no match, code 97116 is not in its codes.
- Rate record rr-a1-97116: FIXED_SCHEDULE, 2875 cents ($28.75) per unit; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- FIXED_SCHEDULE: 2875 cents ($28.75) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 3 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97116 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 5 unit(s); 3 are within it.
- Base: 2875 cents ($28.75) x 3 = 8625 cents ($86.25).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-03 has 97116 in column 2 and another line's code of the date in column 1.

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 6500, after 6500; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 6500 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **6500 cents ($65.00)**; the unrounded 6500 is kept beside it.

Step 7, variance: expected allowed 6500 - observed allowed 6500 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 90 days from the remittance date 2026-03-24, ends on 2026-06-22; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 3175, after 3175; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 3175 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **3175 cents ($31.75)**; the unrounded 3175 is kept beside it.

Step 7, variance: expected allowed 3175 - observed allowed 3175 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 90 days from the remittance date 2026-03-24, ends on 2026-06-22; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 3

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- assistant_reduction: before 8625, after 8625; no CQ or CO modifier on the line; unchanged.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 8625 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **8625 cents ($86.25)**; the unrounded 8625 is kept beside it.

Step 7, variance: expected allowed 8625 - observed allowed 8000 cents (amt_b6) = 625 cents: an underpayment.

Step 8, dispute window: the contract's dispute window, 90 days from the remittance date 2026-03-24, ends on 2026-06-22; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 6500 | 6500 | HALF_UP_CENT | 0 | 0 | WINDOW_PASSED (ends 2026-06-22) | none |
| 2 | priced | 3175 | 3175 | HALF_UP_CENT | 0 | 0 | WINDOW_PASSED (ends 2026-06-22) | none |
| 3 | priced | 8625 | 8625 | HALF_UP_CENT | 0 | 625 | WINDOW_PASSED (ends 2026-06-22) | none |
