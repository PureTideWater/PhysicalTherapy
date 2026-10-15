# Worksheet G143: Per visit with CQ on the line that carries the visit

Computed by the independent worksheet tools/golden-worksheet (Python, exact decimal arithmetic; no code shared with packages/pricing).
Specialist verified: no. A reimbursement specialist checks every figure here before milestones 5 and 7 close.
Every reference value comes from SYNTHETIC release 900001: invented for tests, never a CMS value.

## Inputs

- Release 900001 at fixtures/synthetic/rules/release-synth-900001; its MANIFEST.json has SHA-256 6d346c8fa596c0f720ff3176be10044e86c9b4fe843d37b04c59192cdbdce45a and every file matched it.
- Practice settings: ZIP 00011; default rounding HALF_UP_CENT.
- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): 11 non-facility; 22 facility.
- Claim SYNTH-CLAIM-G143: status 1 (processed as primary); reversed by a later claim: no; superseded by a correction: no; payer and plan SYNTH-PAYER-C/PLAN-1.
- Remittance date: 2026-04-15; dispute windows are judged on the triage date 2026-10-15.
- Mapping map-c-1: contract, contract version cv-c-1, 2026-01-01 to open.
- Contract version cv-c-1 (contract contract-synth-c, version 1, signed_off, 2026-01-01 to open; windows: timely filing 90 days, dispute 45 days, appeal levels level 1 30 days):
  - Rate record rr-c-visit: PER_VISIT, 8800 cents ($88.00) once per claim and date across the included codes; scope codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-c-group: PER_VISIT, 3000 cents ($30.00) once per claim and date across the included codes; scope codes 97150; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_UP_CENT; contract-specific adjustment caps the line at 2500 cents ($25.00).
  - Rate record rr-c-reevaluation: PER_VISIT, 5150 cents ($51.50) once per claim and date across the included codes; scope codes 97164; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule UNKNOWN; rounding HALF_UP_CENT; contract-specific adjustment none.
  - Rate record rr-c-evaluation: FIXED_SCHEDULE, 12500 cents ($125.00) per unit; scope codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to open; flags apply_mppr off, apply_assistant_reduction off, apply_sequestration off, apply_ncci on; timed_units_rule PER_CODE; rounding not stated; contract-specific adjustment pays 92.5% of the amount.

| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 97110 | GP CQ | 1 | 2026-03-26 | 11 | 7500 | 6573 (amt_b6) | none |
| 2 | 97140 | GP | 1 | 2026-03-26 | 11 | 6000 | 0 (amt_b6) | none |

## Steps 1 to 3, per line

### Line 1: 97110 x 1 on 2026-03-26

Step 1, the agreement.
- Mapping map-c-1 (contract, 2026-01-01 to open) is in force on 2026-03-26.
- The mapping names contract version cv-c-1 of contract contract-synth-c; the version that prices the line is the signed-off one of that contract in force on 2026-03-26:
  - cv-c-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-c-1 against code 97110, modifier set [CQ GP], place of service 11, 2026-03-26:
  - rr-c-visit (codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-c-group (codes 97150; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
  - rr-c-reevaluation (codes 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
  - rr-c-evaluation (codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to open): no match, code 97110 is not in its codes.
- Rate record rr-c-visit: PER_VISIT, 8800 cents ($88.00) once per claim and date across the included codes; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- PER_VISIT: 8800 cents ($88.00) once per claim and date across the record's included codes (97110, 97112, 97116, 97140, 97530); units do not multiply it, and the first included line of the date carries it while the others expect zero (step 3).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97110 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 7 unit(s); 1 is within it.
- Base: the per-visit amount is placed once per claim and date, below (the per-visit step).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-26 has 97110 in column 2 and another line's code of the date in column 1.

### Line 2: 97140 x 1 on 2026-03-26

Step 1, the agreement.
- Mapping map-c-1 (contract, 2026-01-01 to open) is in force on 2026-03-26.
- The mapping names contract version cv-c-1 of contract contract-synth-c; the version that prices the line is the signed-off one of that contract in force on 2026-03-26:
  - cv-c-1 (version 1, signed_off, 2026-01-01 to open): signed off and in force.
- Rate records of cv-c-1 against code 97140, modifier set [GP], place of service 11, 2026-03-26:
  - rr-c-visit (codes 97110, 97112, 97116, 97140, 97530; any modifiers; any place of service; 2026-01-01 to open): matches.
  - rr-c-group (codes 97150; any modifiers; any place of service; 2026-01-01 to open): no match, code 97140 is not in its codes.
  - rr-c-reevaluation (codes 97164; any modifiers; any place of service; 2026-01-01 to open): no match, code 97140 is not in its codes.
  - rr-c-evaluation (codes 97161, 97162, 97163; any modifiers; any place of service; 2026-01-01 to open): no match, code 97140 is not in its codes.
- Rate record rr-c-visit: PER_VISIT, 8800 cents ($88.00) once per claim and date across the included codes; flags apply_mppr off, apply_assistant_reduction on, apply_sequestration on, apply_ncci on; timed_units_rule MEDICARE_POOLED; rounding HALF_UP_CENT; contract-specific adjustment: none.

Step 2, the base amount by method.
- PER_VISIT: 8800 cents ($88.00) once per claim and date across the record's included codes (97110, 97112, 97116, 97140, 97530); units do not multiply it, and the first included line of the date carries it while the others expect zero (step 3).

Step 3, units and edits.
- Units: 1 as billed, under the timed-units rule MEDICARE_POOLED, recorded: until minute logs are imported the units are taken as billed (PRD 2 point 6).
- Medically unlikely edit: apply_ncci is on; ncci_mue 97140 (2026-01-01 to 2026-12-31, adjudication indicator 3) allows 6 unit(s); 1 is within it.
- Base: the per-visit amount is placed once per claim and date, below (the per-visit step).
- Procedure-to-procedure edits: apply_ncci is on; no ncci_ptp record in force on 2026-03-26 has 97140 in column 2 and another line's code of the date in column 1.

## Step 3, the per-visit amount, per claim and date

### Per-visit amount on 2026-03-26, rate record rr-c-visit

Lines priced so far under rr-c-visit on 2026-03-26: line 1 (97110), line 2 (97140). The visit pays 8800 cents ($88.00) once per claim and date; the first included line (the lowest line number) carries it and the others expect zero.
- Line 1: carries the visit amount; base 8800 cents ($88.00).
- Line 2: expects zero (line 1 carries the visit); base 0 cents ($0.00).

## Steps 4 to 8, per line

### Line 1

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: before 8800, after 6776; CQ present; assistant_modifier pays 77%: 8800 cents ($88.00) x 77% = 6776 cents ($67.76).
- sequestration: before 6776, after 6572.72; the amount 6776 cents ($67.76) less the patient share 0 leaves the payer's share 6776 cents ($67.76); 3% of the payer's share is 203.28; 6776 - 203.28 = 6572.72 cents ($65.7272).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 6572.72 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **6573 cents ($65.73)**; the unrounded 6572.72 is kept beside it.

Step 7, variance: expected allowed 6573 - observed allowed 6573 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 45 days from the remittance date 2026-04-15, ends on 2026-05-30; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

### Line 2

Step 4, adjustments in order: the multiple procedure reduction, the assistant reduction and sequestration where their flags are on, then the rate record's own.
- mppr: flag apply_mppr is off; not applied.
- assistant_reduction: before 0, after 0; no CQ or CO modifier on the line; unchanged.
- sequestration: before 0, after 0; the amount 0 cents ($0.00) less the patient share 0 leaves the payer's share 0 cents ($0.00); 3% of the payer's share is 0; 0 - 0 = 0 cents ($0.00).
- contract_adjustment: the rate record defines none; not applied.

Step 5, patient share: 0 cents ($0.00) from the line's PR adjustments (none); reported beside the expected amount, never subtracted from it.
- Claim status 1 (processed as primary); the claim is not reversed.

Step 6, rounding once: 0 cents under HALF_UP_CENT (the rate record's rule; halves move away from zero) = **0 cents ($0.00)**; the unrounded 0 is kept beside it.

Step 7, variance: expected allowed 0 - observed allowed 0 cents (amt_b6) = 0 cents: none.

Step 8, dispute window: the contract's dispute window, 45 days from the remittance date 2026-04-15, ends on 2026-05-30; on the triage date 2026-10-15 it is passed: WINDOW_PASSED, validated and not actionable; the amount is unchanged.

## Results

| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) | Variance (cents) | Dispute window | Review flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | priced | 6573 | 6572.72 | HALF_UP_CENT | 0 | 0 | WINDOW_PASSED (ends 2026-05-30) | none |
| 2 | priced | 0 | 0 | HALF_UP_CENT | 0 | 0 | WINDOW_PASSED (ends 2026-05-30) | none |
