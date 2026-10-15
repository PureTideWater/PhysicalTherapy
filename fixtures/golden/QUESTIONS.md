# Questions for the reimbursement specialist

The golden lines in `claims/` were computed by the independent worksheet (`tools/golden-worksheet`), not by a
reimbursement specialist, and every claim says `"specialist_verified": false`. Wherever the plan (PRD sections 2,
9 and 11, the rules reference, the test matrix) leaves a pricing judgement open, the worksheet had to choose. Each
choice is listed here with the plan's words that leave it open, what the worksheet does, the alternatives, and the
golden claims whose cents depend on it. Milestones 5 and 7 close only after the specialist has answered each one and
verified each worksheet; a changed answer changes the inputs or the worksheet, then `write`, then a reviewed diff.

All reference values are SYNTHETIC (release 900001; 900002 adds 2025; 900003 varies sequestration, the general
reduction rate and the dispute windows). Their percentages are deliberately not the real ones: assistant 77% (real
85%), sequestration 3% (real 2%), MPPR 40% (real 50%; 45% for the general rate in 900003).

**The three that move the most cents:** Q21 (sequestration against observed allowed from AMT B6), Q13 (ties in
the multiple procedure ranking) and Q18 (the assistant reduction applied after the multiple procedure reduction).

## Resolving the agreement (PRD 11 step 1)

**Q01. Government and other mappings; workers' compensation and auto.** J6 lists "no agreement (out of network,
government, other)"; the data dictionary has mapping kinds `government` and `other`. *Choice:* both are
`NO_AGREEMENT`. Section 2 point 7 says workers' compensation and auto are `SECONDARY_PAYER` in v0 and v1, but no
input marks a claim as either, so the worksheet cannot apply that. *Claims:* G39. *Alternatives:* a mapping kind
for workers' compensation and auto that yields `SECONDARY_PAYER`.

**Q02. Which version prices the line.** The mapping names a `contract_version_id` (data dictionary); section 11
says the mapping resolves "to a `contract_version`", and J7 pins "the contract versions in force on each service
date". *Choice:* the signed-off version of the mapped version's contract whose window covers the service date, so
an amendment takes over on its start date without a new mapping. *Claims:* G47, G50. *Alternative:* price only
under the version the mapping names (the July line of G50 would then be `DATE_OUTSIDE_VERSIONS`).

**Q03. Superseded versions.** "Only `signed_off` versions price lines" (section 9) and an amendment closes the
previous window. *Choice:* a version whose status is `superseded` never prices, even inside its old window.
*Claims:* G49. *Alternative:* a superseded version still prices the dates of its closed window (then G49 line 1
prices at 110%).

**Q04. Matching a rate record's scope.** Section 11: "the rate record whose scope matches code, modifier set,
place of service and date; more than one match is `AMBIGUOUS_RATE`". *Choice:* a `null` code list, modifier list or
place list matches anything; a modifier set matches only when it equals the line's modifiers as a set (so `[GP]`
does not match `GP 59`); a general term and a code-specific exhibit that both match are `AMBIGUOUS_RATE` (no
precedence of the specific over the general). The product now stores a general term as the golden lines state it
(a rate record whose scope names no codes covers every code; ADR 0033), so the engine prices G40 from the same
records. *Claims:* G40, G41, G42 and every claim with a `null` code list. *Alternatives:* subset matching of
modifiers; the most specific term wins.

**Q05. The conversion factor for Medicare Advantage non-contracted lines.** The rules reference: "contracts that
reference 'the Medicare rate' default to the non-qualifying factor unless the specialist marks otherwise"; section
11 allows "unless the practice has marked the plan otherwise". *Choice:* `non_qualifying_apm`, 100%, `CURRENT`, every
flag on; there is no input yet for a practice that is a qualifying APM participant. *Claims:* every MA claim (G01,
G03 to G05, G14 to G23, G27, G28, G34, G35, G37, G43, G44, G51, G52).

**Q06. Sequestration on Medicare Advantage non-contracted lines.** Section 11 turns every Medicare adjustment on
for these lines; 42 CFR 422.214 speaks of the amount the provider "could have collected" under Original Medicare.
*Choice:* sequestration applies, as the plan says. *Claims:* every priced MA line. *Alternative:* the MA amount
before sequestration.

## The base amount (PRD 11 steps 2 and 3)

**Q07. Year basis.** Section 9: "`LOCKED:2025` or `CURRENT`". *Choice:* `CURRENT` is the fee schedule in force on
the date of service (not the run date); `LOCKED:<year>` uses, for the RVU, GPCI and conversion factor, the latest
record in force during that year (the year's final quarterly values). The locality comes from the ZIP map in force
on the service date, and the adjustments (MPPR file, assistant percentage, sequestration) follow the service date,
not the basis year. *Claims:* G09 to G13. *Alternatives:* the January values of the locked year; the locked year's
adjustment percentages.

**Q08. Which places of service are facility settings.** Section 2: "the facility or non-facility practice-expense
value chosen by place of service". No rule record carries the split, and the CMS list cannot be typed from memory.
*Choice:* each golden claim states the split it assumes as an input, a SYNTHETIC test table: `11` non-facility,
`22` facility. *Claims:* G14, G15, G41. *For the specialist:* the real list, and whether outpatient therapy billed by
a hospital outpatient department is paid at the non-facility rate regardless of place of service.

**Q09. A practice-expense value marked NA.** 97026 and G0283 have no facility practice-expense value (NA) in the
SYNTHETIC file. *Choice:* at a facility place of service the line is `NO_PFS_VALUE` ("No RVU for the code in the
basis year"), never priced from the other setting's value. *Claims:* G15. *Alternative:* use the non-facility
value.

**Q10. The fee-schedule status code.** The `pfs_rvu` record carries a status (A in every SYNTHETIC record).
*Choice:* the worksheet does not consult it; any record prices. *For the specialist:* which statuses (carrier
priced, bundled, non-covered and the like) should be `NO_PFS_VALUE`. No golden line depends on it yet.

**Q11. Rounding only once.** Section 11 step 6 and CLAUDE.md rule 2: "Round once per line under the contract's
rule". *Choice:* nothing is rounded before the end of the line: the per-unit fee-schedule amount keeps every
digit through units, the reduction, the percentages and sequestration (G09's per-unit amounts run to eight
decimal places of a cent). *Claims:* every priced line. *For the specialist:* whether a payer's published per-code
amount in whole cents should be the base instead, which would move some lines by a cent.

## The multiple procedure reduction (PRD 11 step 4)

**Q12. What is ranked.** "Rank the day's 'always therapy' units by practice-expense value". *Choice:* the
practice-expense part of each unit in cents: PE RVU x PE GPCI x conversion factor x the record's percentage. With
one percentage for the whole claim this orders units exactly as the GPCI-adjusted PE RVU does. *Claims:* every claim
with `apply_mppr` on; G24 (120%). *Alternative:* the raw PE RVU.

**Q13. Ties.** Two units with the same practice-expense value. *Choice:* the lower line number keeps the whole unit,
then the earlier unit within a line. The tie changes which line carries the reduction, and with an assistant
modifier on one of the tied lines it changes the claim total: G22 (the plain line first) totals 3223 cents, G23 (the
CQ line first) 3102. *Claims:* G13 (two codes tied in the SYNTHETIC 2025 values), G22, G23, and every line with two
or more units of its code. *Alternatives:* the unit with the higher total amount; the line without an assistant
modifier.

**Q14. Which units enter the ranking.** *Choice:* only lines priced so far (agreement and base amount resolved),
whose terms have `apply_mppr` on, and whose code has an `mppr_rate` record in force. A line already unpriced (for
example `NO_RATE_FOR_CODE` or `NO_PFS_VALUE`), a line under a rate record with the flag off, and a code not on the
MPPR file (the evaluations) is neither ranked nor reduced and never holds the whole unit. *Claims:* G15, G20, G25.
*Alternative:* rank every always-therapy unit of the day, priced or not.

**Q15. Per claim or per patient and day.** "The second and later 'always therapy' units in a day". *Choice:* the
worksheet ranks the units of one claim per service date. Medicare applies the reduction across claims (and
providers) for the same patient and day; the engine would need the patient's other claims of that day. *Claims:*
every claim with the flag on.

**Q16. Which codes are "always therapy", and their share.** *Choice:* a code with an `mppr_rate` record (the MPPR rate
file) in force on the service date; its `pe_reduction_percent`, or the general `practice_expense` record when that
share is null. The fee schedule's multiple-procedure indicator is not consulted (in the SYNTHETIC files the two
agree). *Claims:* every claim with the flag on.

**Q17. The reduction at a facility.** *Choice:* applied in every setting. *Claims:* G14.

## The assistant reduction (PRD 11 step 4)

**Q18. The 85% after the multiple procedure reduction.** "85% of the otherwise applicable amount", applied after
the reduction in the plan's order. *Choice:* the assistant percentage applies to the line's amount after the
reduction; the reduction ranks units by their practice-expense value before the assistant percentage. *Claims:*
G03, G04, G05, G07, G22, G23. *Alternatives:* rank by the post-assistant value; apply the assistant percentage to the
unreduced amount.

**Q19. CQ and CO on one line.** *Choice:* applied once; the worksheet refuses a line whose CQ and CO percentages
differ. No golden line has both.

**Q20. A reversed claim that a correction supersedes.** The reason list has `REVERSED_CLAIM` for "the claim was
reversed and not corrected", and nothing for a corrected one. *Choice:* status 22 (the reversal itself) and a claim
reversed without a correction are `REVERSED_CLAIM`; a claim both reversed and superseded by a correction is refused
as input (no golden line), on the reading that only its correction is priced. *Claims:* G51, G52.

## Sequestration and the patient share (PRD 11 steps 4 and 5)

**Q21. Sequestration against observed allowed from AMT B6.** Section 11: sequestration takes "2% of the payer's share
after the patient share" from the expected amount, and expected allowed is compared with observed allowed. When
observed allowed comes from AMT B6 it is the payer's allowed amount, typically before sequestration, which payers
report as a separate adjustment; when it comes from paid plus PR, the sequestration is already inside paid. *Choice:* the
worksheet follows the plan and reduces expected allowed whenever the flag is on, whatever the observed basis. The
effect: against an AMT B6 basis the expected amount is lower than the payer's allowed by the sequestration, which can
hide an underpayment of up to that amount. *Claims:* every priced MA line (for example G01, whose observed basis is
AMT B6) and G26. *Alternatives:* compute expected allowed before sequestration and report the sequestration beside
it, as the patient share is; or reduce only when the observed basis is `paid_plus_pr`.

**Q22. A patient share larger than the amount.** *Choice:* the payer's share is floored at zero, so sequestration
takes nothing. *Claims:* G27.

**Q23. Whose patient share.** *Choice:* the line's own PR adjustments; claim-level PR is not allocated to lines in
these inputs. *Claims:* G26 (two PR reasons on one line).

## Claims, reasons and rounding (PRD 11 steps 5 and 6)

**Q24. The order of reasons when several apply.** *Choice:* the plan's order: the agreement (step 1), the method and
fee-schedule value (step 2), then secondary and reversed claims (step 5). A secondary claim mapped as no agreement is
`NO_AGREEMENT`; a secondary claim's amount is worked through before `SECONDARY_PAYER` stops it. *Claims:* G44, G45,
G46, G51. *Alternative:* claim-level reasons first.

**Q25. Denied claims.** *Choice:* claim status 4 prices normally (expected allowed against an observed allowed of
zero). *Claims:* G28. The other statuses an 835 can carry are Q31.

**Q26. Fractional units.** "Units are taken as billed"; the 835 can carry decimal units. *Choice:* phase one prices
whole units only and refuses a fraction, because the multiple procedure reduction has no rule for part of a unit.
No golden line has one.

**Q27. Which rounding rule.** *Choice:* the rate record's rule; when it is silent, the practice default; when that is
unset, `HALF_UP_CENT` (section 11 step 6). MA non-contracted lines have no record and take the practice default.
`HALF_UP_CENT` moves halves away from zero, `HALF_EVEN_CENT` to the even cent, `TRUNCATE` toward zero. *Claims:* G29
to G35.

**Q28. Where the contract percentage applies.** *Choice:* to the per-unit fee-schedule amount before every
adjustment, so the reduction cuts the practice-expense part at the contract's percentage. *Claims:* G24.

**Q29. Flags without a phase-one effect.** *Choice in phase one:* `apply_ncci` changed no amount, and every golden line
kept its units at or below the SYNTHETIC MUE. *From milestone 7* (Q41, Q42) the MUE stops a line above it and a
procedure-to-procedure edit raises a review flag; no phase-one line exceeds its MUE, so none changed, and eight gained a
flag (Q41). The MA terms' `timed_units_rule` is `MEDICARE_POOLED`, recorded only; a record's `UNKNOWN` is Q32.

**Q30. Contract-specific adjustments.** Section 11 step 4 ends with "contract-specific adjustments (a percentage or a
cap the record defines)". *Choice in phase one:* no rate-record field defined one, so none was applied. Milestone 7
adds the field; Q45.

## Added with the review of milestones 3 to 5

**Q31. Claim statuses beyond the five PRD 2 names.** PRD 2 lists "1 processed as primary, 2 secondary, 3 tertiary,
4 denied, 22 reversal of a prior payment, and others"; an 835 can also carry 19, 20, 21, 23 and 25. The rules
reference gives `SECONDARY_PAYER` for "Claim status 2 or 3". *Choice:* 19 (read as processed as primary and
forwarded to another payer) prices as a primary claim; 20 and 21 (processed as secondary or tertiary and forwarded)
are `SECONDARY_PAYER`; 23 and 25 have no rule yet and stop for review as `ENGINE_ERROR` with the detail
`claim_status_not_priced`, which does not page the operator, so no golden line holds them. *Claims:* G54, G55, G56.
*For the specialist:* confirm each status's reading against the purchased implementation guide, and say what 23 and
25 should be (`SECONDARY_PAYER`, `NO_AGREEMENT`, priced, or a reason the closed list lacks).

**Q32. A timed-units rule of `UNKNOWN`.** PRD 20: "UNKNOWN (review, not price) until minutes are imported"; PRD 1 rule 1:
an unknown term makes a line unpriced, never a guess; the reason `UNITS_RULE_UNKNOWN` ("Confirm with the contract or
import minutes"). Commercial records default to `UNKNOWN`. *Choice:* a line whose rate record's rule is `UNKNOWN` stops
at step 3 with `UNITS_RULE_UNKNOWN`, after its fee-schedule value (so `NO_PFS_VALUE` comes first) and before the
multiple procedure reduction (so it is neither ranked nor reduced, Q14). No rule record says which codes are timed,
and the plan forbids typing that list from memory, so every line under the record stops, untimed codes included.
*Claims:* G57. *For the specialist:* whether untimed codes (the evaluations, for example) should price under `UNKNOWN`,
and the source of the timed-code list if so.

**Q33. Windows in months, and where a window is measured from.** *Choice:* a window in months ends on the same day
that many months later, or on the last day of that month when it has no such day (2026-05-31 plus 4 months is
2026-09-30); a record that names no start is measured from the remittance date; the deadline day itself is still
open, and the day after it is `WINDOW_PASSED`. *Claims:* G58, G59, G60.

**Q34. Which window decides a dispute.** PRD 11 step 8: "From the remittance date and the agreement's windows, compute
the dispute deadline". *Choice:* a contract's `dispute_window_days` from the remittance date; when the contract is
silent, the release's `commercial_default` first-level window (redetermination), else no window; a Medicare
Advantage non-contracted line takes Original Medicare's redetermination window. The record is the one in force on
the remittance date. *Claims:* G58 to G63. *For the specialist:* whether redetermination is the right first-level
window for an MA non-contracted line and for a contract silent on disputes (ADR 0029 asked the same).

**Q35. A reversal with negative units.** *Choice:* phase one refuses units that are not a whole number of at least one,
so a reversal whose units are negative is `ENGINE_ERROR` before step 5 can call it `REVERSED_CLAIM` (the order PRD 11
gives). No golden line has one. *For the specialist:* whether that is acceptable, or a reversal's units should be read
as their absolute value.

**Q36. "Unless the practice has marked the plan otherwise".** PRD 11 step 1 prices a Medicare Advantage
non-contracted line as Original Medicare would "unless the practice has marked the plan otherwise". *Choice:* nothing
can be marked yet; every such line takes Q05's terms. ADR 0033 defers the mark to milestone 7, with the pricing runs.
*For the specialist:* what a practice may mark (the qualifying conversion factor, an adjustment off, a percentage),
and on what evidence.

**Q37. A ZIP that needs its ZIP+4 to name a locality.** The ZIP-to-locality file flags ZIPs that span localities.
*Choice:* the engine stops such a line with `ENGINE_ERROR` (`locality_needs_zip_plus_four`) and records the flag in
the trace; the settings carry no ZIP+4 and no per-site locality override yet. No golden line uses one. *For the
specialist:* the override the practice settings should carry.

**Q38. A bound on units.** *Choice:* more than 999 units on one line is malformed input (`ENGINE_ERROR`
`units_above_limit`); it is never ranked. No golden line comes near it. *For the specialist:* whether a lower bound,
or the MUE where `apply_ncci` is off, should apply instead (milestone 7).

## Added with milestone 7: the remaining methods, NCCI and MUE, contract-specific adjustments

The five fixture payers (`tools/golden-worksheet/fixture_payers.py`; README) are SYNTHETIC contracts written to exercise
these branches. Their terms are test assumptions, not readings of a real contract: payer B incorporating sequestration
and payer E Medicare's adjustments on commercial contracts are there so every flag is on somewhere and off elsewhere.

**Q39. The multiple procedure reduction on a fixed, per-visit or lesser-of term.** PRD 11 step 4 cuts "the
practice-expense component" of the day's later units. A fixed amount, a per-visit amount, or a lesser-of amount that
may be the charge has no practice-expense component. *Choice:* `apply_mppr` is allowed only on `PERCENT_OF_MEDICARE`
terms; on a fixed, per-visit or lesser-of term the engine stops the line for review (`ENGINE_ERROR`
`mppr_needs_fee_schedule`, which pages no one), so no golden line holds it. *For the specialist:* how a contract that
writes Medicare's reduction into a fixed schedule or a "lesser of charges or 100% of Medicare" term should be priced
(reduce the schedule before the comparison with the charge, reduce a fixed amount by a stated share, or not at all).

**Q40. A per-visit term under a timed-units rule of `UNKNOWN`.** Units do not multiply a per-visit amount, so how
timed units are counted cannot change it. *Choice:* Q32's reading applies to every method: a line under `UNKNOWN` stops
with `UNITS_RULE_UNKNOWN`, per-visit included. *Claims:* G149. *Alternative:* price per-visit lines whatever the rule.

**Q41. Procedure-to-procedure edits.** PRD 2 point 6: "97140 with 97530 on the same day needs a 59 or X modifier under
those edits"; PRC-11 expects a review flag; the plan says nothing changes the price. *Choices:* (1) an edit is an
`ncci_ptp` record in force on the service date with this line's code in column 2 and the code of another line of the
same claim and date in column 1, whatever that line's own outcome (a billed column-1 line counts even when it is
unpriced, G167); (2) only the column-2 line carries the flag (`NCCI_PTP`, naming the column-1 line), and only when its
own term has `apply_ncci` on (G136); (3) a modifier of 59, or any modifier beginning with X, on either line of the pair
bypasses the edit when the record's modifier indicator is `1`; indicators `0` and `9` let no modifier bypass it (the
SYNTHETIC file's header reads "0=not allowed 1=allowed 9=not applicable"; G125, G164); (4) the claim's lines only, not
the patient's other claims of the day (as Q15). The flag is reported on the priced line and in its trace; the amount is
never changed. *Claims:* G102 to G104, G111, G120, G124, G125, G136, G142, G146, G148, G149, G157, G161 to G165, G167 to G169, G184.
Eight phase-one lines gained the flag when the edits arrived (their amounts are unchanged): G01 line 3, G03 line 3,
G04 line 1, G14 line 3, G16 line 1, G19 lines 2 and 3, G20 line 3. *For the specialist:* the list of X modifiers, which
line the modifier must be on, what indicator 9 means here, and whether a flag on a priced line should keep it from
becoming actionable.

**Q42. Medically unlikely edits.** PRD 11 step 3: "Units above the MUE value when `apply_ncci` is on are `MUE_EXCEEDED`
for review, not priced down." *Choices:* the line's own units against the `ncci_mue` value for its code in force on the
service date, whatever the record's adjudication indicator (the SYNTHETIC file marks indicators 2 and 3 as date-of-service
edits, which would sum a code's units across the day's lines; the worksheet does not); units equal to the value price;
a code with no record in force has no limit (G112); the MUE is checked after the fee-schedule value (so `NO_PFS_VALUE`
comes first) and before the timed-units rule (so `MUE_EXCEEDED` wins over `UNITS_RULE_UNKNOWN`); it applies to every
method, per-visit included (G146, G158). A line stopped for its MUE is neither ranked nor reduced and never carries a
visit. *Claims:* G105, G136, G146, G158, G167, G193, G194. *For the specialist:* whether date-of-service indicators should
sum the day's units, and whether the MUE should bound units when `apply_ncci` is off (Q38).

**Q43. Lesser of billed charges and the schedule.** PRD 11 step 2: "the lesser of the computed schedule amount and the
line charge". *Choices:* the schedule's amount for the units billed (the fixed amount, or the fee schedule at the
record's percentage, times the units) against the line's charge (`charge_basis` `LINE_CHARGE`), at step 3; the lesser
is the base, and the adjustments that follow (assistant, sequestration, the contract's own) apply to it whichever won;
equal amounts are the same base. *Claims:* G121 to G126, G133, G135, G137, G186, G194. *Alternative:* compare after the
adjustments (the schedule's allowed amount against the charge).

**Q44. Per-visit amounts.** PRD 11 step 2: "applied once per claim per date across the included codes; the first
included line carries it and the rest expect zero". *Choices:* the included codes are the record's scope codes; the
visit is per claim, service date and rate record (two per-visit terms on one date pay twice, G147); "first" is the lowest
line number among the lines priced so far (agreement, method and units resolved), so a line stopped for its MUE passes
the visit to the next (G146), and the listing order of the remittance does not matter (G142); the assistant reduction
follows the line, so CQ on the carrying line reduces the visit and on a zero line changes nothing (G143, G144); each
line's variance is its own, so a payer that spreads the visit over the lines shows an underpaid first line and
overpaid others (G141). *For the specialist:* whether the variance should be judged per visit.

**Q45. Contract-specific adjustments.** PRD 11 step 4: "contract-specific adjustments (a percentage or a cap the
record defines)", after sequestration. *Choices:* a rate record defines at most one, in its parameters
(`contract_adjustment`): `PERCENT` pays that percentage of the amount after the Medicare adjustments (G121, G148, G181),
`CAP` limits the line's amount to the cap (G111, G147, G163, G174, G185), per line, not per unit, visit or day; a record
that defines none leaves no adjustment entry. *For the specialist:* whether a cap is per unit, line or day, and whether a
record may carry a percentage and a cap together (and in which order).
