# Worksheet G186: Evaluations under the lesser of the charge and a fixed amount

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G186: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-E/PLAN-EPO.
- Remittance date: 2026-07-14; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-e-epo: contract, contract version cv-e-1, 2025-07-01 to 2026-08-31.
- Mapping map-e-left: no_agreement, 2026-09-01 to open.
- Contract version cv-e-0 (contract contract-synth-e, version 1, superseded, 2025-07-01 to 2025-12-31; windows: timely filing 120 days, dispute 30 days, appeal levels none stated):
  - Rate record rr-e0-therapy: PERCENT_OF_MEDICARE at 110%, year basis CURRENT, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2025-07-01 to 2025-12-31; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment none.
- Contract version cv-e-1 (contract contract-synth-e, version 2, signed_off, 2026-01-01 to 2026-03-31; windows: timely filing 120 days, dispute 30 days, appeal levels none stated):
  - Rate record rr-e1-therapy: PERCENT_OF_MEDICARE at 115%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; scope codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2026-01-01 to 2026-03-31; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment pays 97.5% of the amount.
  - Rate record rr-e1-modalities: PERCENT_OF_MEDICARE at 115%, year basis LOCKED:2025, locality basis practice, conversion factor non_qualifying_apm; scope codes 97026, 97035; any modifiers; any place of service; 2026-01-01 to 2026-03-31; flags apply_mppr on, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding HALF_EVEN_CENT; contract-specific adjustment pays 97.5% of the amount.
  - Rate record rr-e1-evaluation: FIXED_SCHEDULE, 7400 cents ($74.00) per unit; scope codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to 2026-03-31; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci off; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment none.
- Contract version cv-e-2 (contract contract-synth-e, version 3, signed_off, 2026-05-01 to open; windows: timely filing 120 days, dispute 180 days, appeal levels level 1 90 days):
  - Rate record rr-e2-therapy: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97110, 97112, 97140, 97530; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr on, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.
  - Rate record rr-e2-97116: FIXED_SCHEDULE, 2500 cents ($25.00) per unit; scope codes 97116; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment caps the line at 6000 cents ($60.00).
  - Rate record rr-e2-evaluation: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 7600 cents ($76.00) per unit); scope codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-e2-97750: PERCENT_OF_MEDICARE at 120%, year basis CURRENT, locality basis practice, conversion factor qualifying_apm; scope codes 97750; any modifiers; any place of service; 2026-05-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding TRUNCATE; contract-specific adjustment none.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97162 | GP | 1 | 2026-06-23 | 11 | 7000 | 7000 (amt_b6) | none |
| 2 | 97164 | GP | 1 | 2026-06-23 | 11 | 9000 | 7600 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97162 x 1 on 2026-06-23

Step 1, the agreement.
- Mapping map-e-epo (contract, 2025-07-01 to 2026-08-31) is in force on 2026-06-23.
- The mapping names contract version cv-e-1 of contract contract-synth-e; the version that prices the line is the signed-off one of that contract in force on 2026-06-23:
  - cv-e-0 (version 1, superseded, 2025-07-01 to 2025-12-31): not signed off.
  - cv-e-1 (version 2, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-e-2 (version 3, signed_off, 2026-05-01 to open): signed off and in force.
- Rate records of cv-e-2 against code 97162, modifier set [GP], place of service 11, 2026-06-23:
  - rr-e2-therapy (codes 97110, 97112, 97140, 97530; any modifiers; any place of service; 2026-05-01 to open): no match, code 97162 is not in its codes.
  - rr-e2-97116 (codes 97116; any modifiers; any place of service; 2026-05-01 to open): no match, code 97162 is not in its codes.
  - rr-e2-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-05-01 to open): matches.
  - rr-e2-97750 (codes 97750; any modifiers; any place of service; 2026-05-01 to open): no match, code 97162 is not in its codes.
- Rate record rr-e2-evaluation: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 7600 cents ($76.00) per unit); flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- The schedule is FIXED_SCHEDULE: 7600 cents ($76.00) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97162 (2026-01-01 to 2026-12-31, adjudication indicator 2) allows 1 unit(s); 1 is within it.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 7600 cents ($76.00) x 1 = 7600 cents ($76.00); the line charge is 7000 cents ($70.00); the lesser is the line charge, 7000 cents ($70.00).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-23 has 97162 in column 2 and another line's code of the date in column 1.

### Line 2: 97164 x 1 on 2026-06-23

Step 1, the agreement.
- Mapping map-e-epo (contract, 2025-07-01 to 2026-08-31) is in force on 2026-06-23.
- The mapping names contract version cv-e-1 of contract contract-synth-e; the version that prices the line is the signed-off one of that contract in force on 2026-06-23:
  - cv-e-0 (version 1, superseded, 2025-07-01 to 2025-12-31): not signed off.
  - cv-e-1 (version 2, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-e-2 (version 3, signed_off, 2026-05-01 to open): signed off and in force.
- Rate records of cv-e-2 against code 97164, modifier set [GP], place of service 11, 2026-06-23:
  - rr-e2-therapy (codes 97110, 97112, 97140, 97530; any modifiers; any place of service; 2026-05-01 to open): no match, code 97164 is not in its codes.
  - rr-e2-97116 (codes 97116; any modifiers; any place of service; 2026-05-01 to open): no match, code 97164 is not in its codes.
  - rr-e2-evaluation (codes 97161, 97162, 97163, 97164; any modifiers; any place of service; 2026-05-01 to open): matches.
  - rr-e2-97750 (codes 97750; any modifiers; any place of service; 2026-05-01 to open): no match, code 97164 is not in its codes.
- Rate record rr-e2-evaluation: LESSER_OF the line charge and the schedule (FIXED_SCHEDULE, 7600 cents ($76.00) per unit); flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- LESSER_OF: the schedule's amount for the units billed is compared with the line charge in step 3, and the lesser is the base.
- The schedule is FIXED_SCHEDULE: 7600 cents ($76.00) per unit for the code and modifier set.

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule PER_CODE, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97164 (2026-01-01 to 2026-12-31, adjudication indicator 2) allows 1 unit(s); 1 is within it.
- Base, the lesser of the schedule and the line charge: the schedule for 1 unit(s) is 7600 cents ($76.00) x 1 = 7600 cents ($76.00); the line charge is 9000 cents ($90.00); the lesser is the schedule, 7600 cents ($76.00).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-06-23 has 97164 in column 2 and another line's code of the date in column 1.

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 7000 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **7000 cents ($70.00)**; the unrounded 7000 is kept beside it.

Step 7, variance: expected allowed 7000 - observed allowed 7000 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 180 days from the remittance date 2026-07-14, ends on 2027-01-10; on the triage date 2026-10-15 it is open.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: flag apply_assistant_reduction is off; not applied.
- sequestration: flag apply_sequestration is off; not applied.
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 7600 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **7600 cents ($76.00)**; the unrounded 7600 is kept beside it.

Step 7, variance: expected allowed 7600 - observed allowed 7600 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 180 days from the remittance date 2026-07-14, ends on 2027-01-10; on the triage date 2026-10-15 it is open.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 7000 | 7000 | HALF_UP_CENT | 0 | 0 | OPEN (ends 2027-01-10) | none |
| 2 | priced | 7600 | 7600 | HALF_UP_CENT | 0 | 0 | OPEN (ends 2027-01-10) | none |
