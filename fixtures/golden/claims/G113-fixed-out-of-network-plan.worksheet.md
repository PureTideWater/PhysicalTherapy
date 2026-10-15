# Worksheet G113: The payer's out-of-network plan has no agreement

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G113: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-A/PLAN-OON.
- Remittance date: 2026-04-07; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-a-oon: no_agreement, 2026-01-01 to open.
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
| 1 | 97110 | GP | 2 | 2026-03-17 | 11 | 15000 | 4000 (amt_b6) | none |
| 2 | 97140 | GP | 1 | 2026-03-17 | 11 | 6000 | 2000 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 2 on 2026-03-17

Step 1, the agreement.
- Mapping map-a-oon (no_agreement, 2026-01-01 to open) is in force on 2026-03-17.
- **Unpriced: `NO_AGREEMENT`.** The plan is mapped as no_agreement: no agreement governs the line.

### Line 2: 97140 x 1 on 2026-03-17

Step 1, the agreement.
- Mapping map-a-oon (no_agreement, 2026-01-01 to open) is in force on 2026-03-17.
- **Unpriced: `NO_AGREEMENT`.** The plan is mapped as no_agreement: no agreement governs the line.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | unpriced `NO_AGREEMENT` | | | | | | | |
| 2 | unpriced `NO_AGREEMENT` | | | | | | | |
