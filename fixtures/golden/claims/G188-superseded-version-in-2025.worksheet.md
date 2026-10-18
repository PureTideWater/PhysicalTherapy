# Worksheet G188: A 2025 line under a superseded version

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900002: invented for tests, never a CMS value.

## Inputs

- Release 900002 at fixtures/synthetic/rules/release-synth-900002; its MANIFEST.json has SHA-256 ac9b17c76f65ffe83be6bb543fb91349efa7470231d888e34e75fbfc3000ac52 and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G188: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-E/PLAN-EPO.
- Remittance date: 2025-11-24; dispute windows are judged on the triage date 2026-10-15.
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
| 1 | 97110 | GP | 1 | 2025-11-03 | 11 | 6000 | 2300 (amt_b6) | none |
| 2 | 97140 | GP | 1 | 2025-11-03 | 11 | 6000 | 2600 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2025-11-03

Step 1, the agreement.
- Mapping map-e-epo (contract, 2025-07-01 to 2026-08-31) is in force on 2025-11-03.
- The mapping names contract version cv-e-1 of contract contract-synth-e; the version that prices the line is the signed-off one of that contract in force on 2025-11-03:
  - cv-e-0 (version 1, superseded, 2025-07-01 to 2025-12-31): not signed off.
  - cv-e-1 (version 2, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-e-2 (version 3, signed_off, 2026-05-01 to open): outside its window.
- **Unpriced: `DATE_OUTSIDE_VERSIONS`.** No signed-off version of contract contract-synth-e covers 2025-11-03.

### Line 2: 97140 x 1 on 2025-11-03

Step 1, the agreement.
- Mapping map-e-epo (contract, 2025-07-01 to 2026-08-31) is in force on 2025-11-03.
- The mapping names contract version cv-e-1 of contract contract-synth-e; the version that prices the line is the signed-off one of that contract in force on 2025-11-03:
  - cv-e-0 (version 1, superseded, 2025-07-01 to 2025-12-31): not signed off.
  - cv-e-1 (version 2, signed_off, 2026-01-01 to 2026-03-31): outside its window.
  - cv-e-2 (version 3, signed_off, 2026-05-01 to open): outside its window.
- **Unpriced: `DATE_OUTSIDE_VERSIONS`.** No signed-off version of contract contract-synth-e covers 2025-11-03.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `DATE_OUTSIDE_VERSIONS` | | | | | | | |
| 2 | unpriced `DATE_OUTSIDE_VERSIONS` | | | | | | | |
