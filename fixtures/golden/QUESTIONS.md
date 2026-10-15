# Questions for the reimbursement specialist

The golden lines in `claims/` were computed by the independent worksheet (`tools/golden-worksheet`), not by a
reimbursement specialist, and every claim says `"specialist_verified": false`. Wherever the plan (PRD sections 2,
9 and 11, the rules reference, the test matrix) leaves a pricing judgement open, the worksheet had to choose. Each
choice is listed here with the plan's words that leave it open, what the worksheet does, the alternatives, and the
golden claims whose cents depend on it. Milestone 5 closes only after the specialist has answered each one and
verified each worksheet; a changed answer changes the inputs or the worksheet, then `write`, then a reviewed diff.

All reference values are SYNTHETIC (release 900001, and 900002 for 2025). Their percentages are deliberately not
the real ones: assistant 77% (real 85%), sequestration 3% (real 2%), MPPR 40% (real 50%).

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
precedence of the specific over the general). *Claims:* G40, G41, G42. *Alternatives:* subset matching of
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
zero). Only the five statuses section 2 names (1, 2, 3, 4, 22) are accepted. *Claims:* G28.

**Q26. Fractional units.** "Units are taken as billed"; the 835 can carry decimal units. *Choice:* phase one prices
whole units only and refuses a fraction, because the multiple procedure reduction has no rule for part of a unit.
No golden line has one.

**Q27. Which rounding rule.** *Choice:* the rate record's rule; when it is silent, the practice default; when that is
unset, `HALF_UP_CENT` (section 11 step 6). MA non-contracted lines have no record and take the practice default.
`HALF_UP_CENT` moves halves away from zero, `HALF_EVEN_CENT` to the even cent, `TRUNCATE` toward zero. *Claims:* G29
to G35.

**Q28. Where the contract percentage applies.** *Choice:* to the per-unit fee-schedule amount before every
adjustment, so the reduction cuts the practice-expense part at the contract's percentage. *Claims:* G24.

**Q29. Flags without a phase-one effect.** *Choice:* `apply_ncci` changes no amount until milestone 7; every golden line
keeps its units at or below the SYNTHETIC MUE so that milestone 7 does not turn it into `MUE_EXCEEDED`. The MA terms'
`timed_units_rule` is `MEDICARE_POOLED`, recorded only.

**Q30. Contract-specific adjustments.** Section 11 step 4 ends with "contract-specific adjustments (a percentage or a
cap the record defines)". *Choice:* no rate-record field defines one yet, so none is applied.
