# fixtures/golden

**NO REAL PHI, ever.** Golden lines are built on synthetic claims, fixture contracts and SYNTHETIC rule releases
only. Every reference value they use says SYNTHETIC in its source metadata and is never presented as CMS data.

The pricing oracle (PRD sections 17 and 18): service lines whose expected allowed amount is computed outside
the engine, recorded with the worksheet that produced it, before the engine code for that branch exists.

**Status: not yet verified by a reimbursement specialist, so milestones 5 and 7 are not complete.** The lines here (the
one hundred milestone 5 names, those added since for its later branches, and the two hundred and seven of milestone 7's
five fixture payers) were computed by an independent worksheet,
`tools/golden-worksheet/golden_worksheet.py`: Python, standard library only, exact decimal arithmetic, no code shared
with `packages/pricing`. That is the most rigorous check available without the specialist, and it is labelled as
exactly that: every file says `"specialist_verified": false`. The engine and the worksheet agreeing shows only that
the two readings of the plan are consistent, not that either is right. The specialist reviews each worksheet, and
every judgement call in [QUESTIONS.md](QUESTIONS.md), before milestone 5 can close ("one hundred hand-computed golden
lines match to the cent") and before milestone 7 can ("200 golden lines across five fixture payers match to the cent");
a changed answer goes through `/golden-diff`, never a regeneration.

## Layout

| Path | What it is |
| --- | --- |
| `claims/<id>-<slug>.json` | One golden claim: its inputs, the expected result of every line, the worksheet, the provenance |
| `claims/<id>-<slug>.worksheet.md` | The same worksheet as Markdown, for review |
| `sources/` | SYNTHETIC 2025 fee-schedule files that release 900002 parses, and the variant rules release 900003 quotes ([sources/README.md](sources/README.md)) |
| `QUESTIONS.md` | Every pricing judgement the plan leaves to the specialist, the choice the worksheet made, and the cases that depend on it |
| `.report/` | Written by `pnpm test:golden --report`; ignored by git |

Golden lines are claims, not single lines, because the multiple procedure reduction ranks every unit of a day and a
per-visit amount is paid once per claim and date. 150 claims hold 326 lines: G01 to G53 (the first 100), G54 to G64
(claim statuses 19, 20 and 21, a timed-units rule of `UNKNOWN`, the dispute windows and the variance, a suspended
sequestration and the general reduction rate), and G101 to G195, 86 claims and 207 lines against the five fixture
payers below (milestone 7: the fixed-schedule, lesser-of and per-visit methods, NCCI procedure-to-procedure and
medically unlikely edits, the timed-units rules and contract-specific adjustments).

## The five fixture payers

Each is one SYNTHETIC contract, defined once in `tools/golden-worksheet/fixture_payers.py` and carried identically by
every claim against it (a golden test checks that). Its claims say `fixture payer <letter>` in `covers`. Their terms
are invented to exercise the branches, not read from any real contract.

| Payer | Plans | Contract (versions) | Methods and flags | Release | Claims |
| --- | --- | --- | --- | --- | --- |
| A, fixed fee schedule amended in July | `SYNTH-PAYER-A/PLAN-PPO` (contract), `/PLAN-OON` (no agreement), `/PLAN-NEW` (contract from September 1) | `contract-synth-a`: version 1 January to June (90-day disputes), version 2 from July 1 (120 days, new amounts, half-even rounding, a $60.00 cap on 97530) | `FIXED_SCHEDULE` per code and modifier set (97140 plain and with 59 or X), assistant reduction and NCCI on, evaluations without the assistant reduction; two exhibit pages for 97035 (`AMBIGUOUS_RATE`); G0283 capitated (`UNSUPPORTED`); 97750 `UNKNOWN`, then pooled in version 2 | 900001 | G101 to G120 |
| B, lesser of billed charges or the schedule | `SYNTH-PAYER-B/PLAN-HMO` (contract), `/PLAN-GOV` (government) | `contract-synth-b`: one version, silent on disputes (the release default) | `LESSER_OF` a $34.00 fixed schedule with sequestration on and the contract's 98%, half even; `LESSER_OF` 125% of Medicare with the assistant reduction and NCCI on, truncated | 900003 (sequestration suspended from July 1; 4-month default window) | G121 to G137 |
| C, per visit | `SYNTH-PAYER-C/PLAN-1` | `contract-synth-c`: one version, 45-day disputes | `PER_VISIT` $88.00 for the therapy codes with the assistant reduction, sequestration and NCCI on; a group session per visit capped at $25.00; a re-evaluation per visit under `UNKNOWN`; evaluations on a fixed amount at the contract's 92.5% | 900001 | G141 to G159 |
| D, Medicare Advantage contracted plan | `SYNTH-MA-PLAN-D/HMO` (contract), `/NONPAR` (MA non-contracted) | `contract-synth-d`: one version, 60-day disputes | `PERCENT_OF_MEDICARE` 100% current year with every flag on; evaluations at the qualifying factor capped at $58.00, half even; 97750 an undefined case rate (`UNSUPPORTED`) | 900001 | G161 to G175 |
| E, commercial contract with a gap | `SYNTH-PAYER-E/PLAN-EPO` (contract to August 31, no agreement from September 1) | `contract-synth-e`: version 1 (2025, superseded), version 2 January to March 2026 locked to 2025 at 115% with the reduction and the contract's 97.5%, version 3 from May 1 at 120% of the current year at the qualifying factor with every flag on | `PERCENT_OF_MEDICARE` locked and current; `FIXED_SCHEDULE` evaluations with every flag off; a fixed 97116 capped at $60.00; `LESSER_OF` a fixed schedule for evaluations | 900002 (2025 and 2026) | G181 to G195 |

Across them every method prices (or stops, `UNSUPPORTED`), every adjustment flag is on in some term and off in another,
every unpriced reason a golden line can hold appears (all but `ENGINE_ERROR`), half cents fall under each rounding
rule, and each payer has a reversal.

## Commands

```sh
pnpm test:golden            # recomputes every claim with the worksheet; one cent or one worksheet line different fails
pnpm test:golden --report   # the same, and writes fixtures/golden/.report/worksheet.{md,json}; never touches fixtures
python3 -I tools/golden-worksheet/golden_worksheet.py check [--json] [FILE...]   # the comparison itself
python3 -I tools/golden-worksheet/golden_worksheet.py show FILE                  # print one claim's worksheet
python3 -I tools/golden-worksheet/golden_worksheet.py write [FILE...]            # fill in computed sections (a human step)
python3 -I tools/golden-worksheet/fixture_payers.py check      # the fixture payers' claims carry the inputs it defines
python3 -I tools/golden-worksheet/fixture_payers.py inputs     # write the inputs of a new or changed fixture-payer claim
```

`write` is how a case gets its expected results: a person writes the inputs (for a fixture payer, in
`fixture_payers.py`, then `inputs`), runs `write`, and the change (inputs,
results and worksheet together) is reviewed like code, with the specialist. It refuses to change a claim whose
`specialist_verified` is true. `check` and the golden test never write. The `/golden-diff` skill reads `.report`
and explains each changed cent; it never edits a golden line.

## The golden claim format (`tp-golden-claim/3`)

Format 2 added what steps 7 and 8 need: the triage date (`inputs.as_of`), the remittance date
(`inputs.claim.remittance_date`), each version's `windows`, and each priced line's `variance_cents` and `window`. The
first 53 claims took `as_of` 2026-10-15, no remittance date and silent windows, and every expected value they held
in format 1 is unchanged.

Format 3 adds milestone 7: the methods `FIXED_SCHEDULE`, `LESSER_OF` and `PER_VISIT` with their parameters, each
rate record's `parameters.contract_adjustment`, the `contract_adjustment` entry of `adjustments`, and each priced
line's `review_flags`. The 64 claims of format 2 took `contract_adjustment: null` on every record and were rewritten by
`write`; a script compared all 119 lines field by field and every value they held is unchanged. Their worksheets now
describe the NCCI edits, and eight of their lines gained an `NCCI_PTP` review flag (QUESTIONS Q41); no amount moved.

One JSON object per file, keys in this order. Every object is strict: no key may be missing or unknown. Amounts
are integer cents as strings (`"2112"`); rates, percentages, units and unrounded amounts are decimal strings
(`"110"`, `"0.950"`, `"3075.656"`); dates are `YYYY-MM-DD` calendar dates; windows are inclusive and an
`effective_to` of `null` is open-ended.

```jsonc
{
  "format": "tp-golden-claim/3",
  "id": "G01",                         // G and two or three digits; unique
  "title": "...",
  "covers": ["PRC-01", "MAP-05"],      // test-matrix IDs, unpriced reasons or topics the claim exercises
  "notes": "...",                      // why the claim exists and what it shows
  "inputs": { ... },                   // below: everything the engine needs, nothing it computes
  "expected": { "lines": [ ... ] },    // below: computed by the worksheet
  "worksheet": ["# Worksheet G01: ...", "..."],   // the worksheet, one Markdown line per string
  "provenance": { "computed_by": "independent worksheet tools/golden-worksheet", "specialist_verified": false }
}
```

### `inputs`

| Field | Meaning | Engine input (PRD 11) |
| --- | --- | --- |
| `release.number`, `release.dir`, `release.manifest_sha256` | The rule release the line prices under: its number, its directory, and the SHA-256 of its `MANIFEST.json` bytes. The worksheet refuses a release whose manifest hash, number or any file hash differs | Rule release |
| `as_of` | The triage date the dispute window is judged on | The run's triage date |
| `practice_settings.zip` | The practice's billing ZIP; the locality is the `locality_map` record for it in force on the service date | Practice settings: locality |
| `practice_settings.default_rounding` | `HALF_UP_CENT`, `HALF_EVEN_CENT`, `TRUNCATE`, or `null` (then `HALF_UP_CENT`) | Practice settings: default rounding |
| `place_of_service_settings` | `{ "<POS>": "facility" \| "non_facility" }` for every place of service the claim uses. A **SYNTHETIC test assumption** (the plan names no source for the split; QUESTIONS Q08): `11` non-facility, `22` facility | Which practice-expense value applies |
| `claim.claim_id` | A synthetic pseudonymous identifier (`SYNTH-...`) | |
| `claim.claim_status_code` | CLP02: `1` primary, `2` secondary, `3` tertiary, `4` denied, `22` reversal (PRD section 2), and `19`, `20`, `21` (processed as primary, secondary or tertiary and forwarded; QUESTIONS Q31). `23` and `25` are refused: the engine stops them for review | Line facts: claim status |
| `claim.reversed` | A later reversal claim reverses this claim | Claim context |
| `claim.corrected` | A corrected claim supersedes this claim. `reversed` and `corrected` both true is refused (QUESTIONS Q20) | Claim context |
| `claim.remittance_date` | The remittance's date (BPR16), or `null` when unknown (then no window) | Claim context |
| `claim.payer_plan_key` | The payer and plan identifiers (`SYNTH-...`) | Line facts: payer and plan |
| `claim.lines[]` | The service lines, below | Line facts |
| `mappings[]` | `{mapping_id, kind, contract_version_id, effective_from, effective_to}`; `kind` is `contract`, `no_agreement`, `ma_noncontracted`, `government` or `other`; `contract_version_id` is set exactly when the kind is `contract`. Mappings never overlap; an empty list means the plan was never mapped | Agreement: the mapping in force |
| `contract_versions[]` | `{contract_version_id, contract_id, version_no, status, effective_from, effective_to, windows, rate_records}`; `status` is `draft`, `proposed`, `approved`, `signed_off` or `superseded`. Signed-off versions of one contract never overlap. `windows` is `{timely_filing_days, dispute_window_days, appeal_levels}`, `null` (or `[]`) where the contract is silent | Agreement: contract versions |
| `contract_versions[].rate_records[]` | Below | Signed-off rate records |

Each line of `claim.lines[]`:

| Field | Meaning |
| --- | --- |
| `line_no` | Positive whole number, unique in the claim |
| `procedure_code` | Five-character HCPCS or CPT code |
| `modifiers` | Up to four distinct two-character modifiers, in billed order |
| `units` | Decimal string; the engine prices whole units from 1 to 999 and refuses fractions (QUESTIONS Q26, Q38) |
| `service_date` | The line's date of service |
| `place_of_service` | Two digits; must be in `place_of_service_settings` |
| `charge_cents` | The line charge (negative on a reversal) |
| `observed_allowed_cents`, `observed_allowed_basis` | Observed allowed and its basis (`amt_b6` or `paid_plus_pr`); facts only, the expected amount never uses them |
| `patient_share_adjustments[]` | `{group_code: "PR", reason_code, amount_cents}`: the line's patient-responsibility adjustments; their sum is the patient share |

Each rate record:

| Field | Meaning |
| --- | --- |
| `rate_record_id` | Unique in the claim file |
| `scope` | `{codes, modifier_sets, places_of_service, effective_from, effective_to}`. `codes`: `null` (any code: a general term, which the product stores as a scope with no codes) or a list. `modifier_sets`: `null` (any modifiers) or a list of modifier lists, each compared with the line's modifiers as a set (order ignored, exact match). `places_of_service`: `null` (any) or a list. The window is the record's own |
| `method` | `FIXED_SCHEDULE`, `PERCENT_OF_MEDICARE`, `LESSER_OF`, `PER_VISIT` or `UNSUPPORTED` (PRD section 9) |
| `parameters` | `FIXED_SCHEDULE` and `PER_VISIT`: `{amount_cents, contract_adjustment}`, the amount per unit or per visit (zero or more); a per-visit term's included codes are its scope's codes. `PERCENT_OF_MEDICARE`: `{percentage, year_basis, locality_basis, conversion_factor, contract_adjustment}`: `percentage` above 0 (`"110"` is 110%), `year_basis` `CURRENT` or `LOCKED:<year>`, `locality_basis` `practice`, `conversion_factor` `non_qualifying_apm` or `qualifying_apm` (the release's `conversion_factor` keys). `LESSER_OF`: `{schedule, charge_basis, contract_adjustment}`, `schedule` `{method: "FIXED_SCHEDULE", amount_cents}` or `{method: "PERCENT_OF_MEDICARE", percentage, year_basis, locality_basis, conversion_factor}`, `charge_basis` `LINE_CHARGE`. `UNSUPPORTED`: `{}` |
| `parameters.contract_adjustment` | The record's own adjustment (PRD 11 step 4; QUESTIONS Q45): `null`, `{kind: "PERCENT", percent}` (pays that percentage of the amount; above 0, at most 1000) or `{kind: "CAP", cap_cents}` (the line's amount at most the cap) |
| `flags` | `{apply_mppr, apply_assistant_reduction, apply_sequestration, apply_ncci, timed_units_rule, rounding}`: four booleans (`apply_mppr` only on `PERCENT_OF_MEDICARE`, QUESTIONS Q39); `timed_units_rule` `MEDICARE_POOLED`, `PER_CODE` or `UNKNOWN` (`UNITS_RULE_UNKNOWN`, QUESTIONS Q32, Q40); `rounding` a rule or `null` (the practice default) |

### `expected.lines[]`

One entry per input line, in `line_no` order. An unpriced line:

```json
{ "line_no": 2, "outcome": "unpriced", "unpriced_reason": "NO_RATE_FOR_CODE" }
```

A priced line:

```json
{
  "line_no": 1, "outcome": "priced",
  "expected_allowed_cents": "3076",
  "expected_unrounded_cents": "3075.656",
  "rounding": "HALF_UP_CENT",
  "patient_share_cents": "840",
  "method": "PERCENT_OF_MEDICARE",
  "terms": { "mapping_id": "map-ma-1", "mapping_kind": "ma_noncontracted", "contract_version_id": null, "rate_record_id": null },
  "base_cents": "4224",
  "adjustments": [
    { "name": "mppr", "before_cents": "4224", "after_cents": "3144.8" },
    { "name": "assistant_reduction", "before_cents": "3144.8", "after_cents": "3144.8" },
    { "name": "sequestration", "before_cents": "3144.8", "after_cents": "3075.656" }
  ],
  "review_flags": [],
  "variance_cents": "-1124",
  "window": { "ends_on": null, "status": "NO_WINDOW" }
}
```

| Field | Meaning |
| --- | --- |
| `expected_allowed_cents` | Whole cents after the one rounding (a decimal string) |
| `expected_unrounded_cents` | The exact unrounded amount in cents, no trailing zeros |
| `rounding` | The rule applied: the rate record's, else the practice default, else `HALF_UP_CENT` |
| `patient_share_cents` | The sum of the line's PR adjustments, reported beside the expected amount and never subtracted from it |
| `terms` | What priced the line: the mapping, and for a contract the version and the rate record (both `null` for MA non-contracted) |
| `method` | The method of the terms that priced the line |
| `base_cents` | After step 3: the amount per unit times the units (`FIXED_SCHEDULE`, `PERCENT_OF_MEDICARE`), the lesser of that and the line charge (`LESSER_OF`), or the visit amount on the first included line and `0` on the others (`PER_VISIT`) |
| `adjustments` | Every adjustment whose flag is on, in the order applied (`mppr`, `assistant_reduction`, `sequestration`), then `contract_adjustment` when the record defines one, each with its amount before and after; an adjustment that changes nothing still appears. A flag that is off, or a record without its own adjustment, leaves no entry |
| `review_flags` | `[{flag: "NCCI_PTP", column1_line_no}]`: the procedure-to-procedure edits that stand against this line (QUESTIONS Q41); a flag never changes the amount |
| `variance_cents` | Expected allowed less observed allowed, whole cents; negative is an overpayment, recorded and never pursued |
| `window` | `{ends_on, status}`: the dispute deadline and `OPEN`, `WINDOW_PASSED` (validated, not actionable; the amount is unchanged) or `NO_WINDOW` |

## The algorithm the worksheet follows (PRD section 11, in its order)

1. **Agreement.** The mapping in force on the service date; none is `NO_MAPPING`. `no_agreement`, `government`
   and `other` are `NO_AGREEMENT`. `ma_noncontracted` prices as Original Medicare: `PERCENT_OF_MEDICARE` at 100%,
   `CURRENT`, `non_qualifying_apm`, every flag on, the practice's rounding. `contract`: the signed-off version
   of the mapped version's contract in force on the date (none is `DATE_OUTSIDE_VERSIONS`), then its rate
   records whose scope matches code, modifier set, place of service and date: two or more is `AMBIGUOUS_RATE`,
   none `NO_RATE_FOR_CODE`.
2. **Base amount.** `UNSUPPORTED` is `UNSUPPORTED_METHOD`. `PERCENT_OF_MEDICARE`: for the basis year (`CURRENT`:
   the records in force on the date of service; `LOCKED:<year>`: the latest record in force during that year),
   the code's `pfs_rvu` (none is `NO_PFS_VALUE`; a practice-expense value marked NA for the setting is
   `NO_PFS_VALUE` too), the locality's `pfs_gpci` and the named `conversion_factor`; per unit, (work RVU x work
   GPCI + PE RVU x PE GPCI + MP RVU x MP GPCI) x factor x percentage, kept as work, practice-expense and
   malpractice parts in cents.
   `FIXED_SCHEDULE`: the amount per unit. `LESSER_OF`: its schedule's amount per unit (fixed, or the fee schedule as
   above). `PER_VISIT`: the visit amount.
3. **Units and edits.** Units as billed (`MEDICARE_POOLED` and `PER_CODE` are recorded; until minute logs are imported
   the units are taken as billed). With `apply_ncci` on, units above the `ncci_mue` value for the code are
   `MUE_EXCEEDED` (Q42). A `timed_units_rule` of `UNKNOWN` is `UNITS_RULE_UNKNOWN`. Either stop leaves the line
   neither ranked nor reduced. The base: the unit amount times the units; for `LESSER_OF` the lesser of that and the
   line charge (Q43); for `PER_VISIT`, per claim, date and rate record, the visit amount on the lowest-numbered line
   priced so far and zero on the others (Q44). With `apply_ncci` on, each `ncci_ptp` edit in force with the line's code
   in column 2 and another line's code of the date in column 1 raises an `NCCI_PTP` review flag, unless the indicator is
   `1` and a 59 or X modifier is on either line (Q41); the amount is unchanged.
4. **Adjustments, in order.** Multiple procedure reduction, per service date: the units of the lines
   priced so far whose terms have `apply_mppr` on and whose code has an `mppr_rate` record in force are ranked by
   their practice-expense part, highest first (ties: lower line number, then earlier unit); the first stays whole
   and every other unit's practice-expense part is reduced by its code's MPPR percentage (the general
   `practice_expense` record when the code's share is null). Assistant reduction: with CQ or CO on the line, the
   `assistant_modifier` percentage of the amount after the reduction. Sequestration: the `sequestration`
   percentage of the payer's share, the amount less the patient share (floored at zero), taken off the amount. Then the
   record's own adjustment: a percentage of the amount, or a cap on the line (Q45).
5. **Patient share** reported. Claim status `2`, `3`, `20` or `21` is `SECONDARY_PAYER`; status `22`, or `reversed`,
   is `REVERSED_CLAIM`; `1`, `4` and `19` price.
6. **Round once** under the rule, keeping the unrounded value.
7. **Variance**: expected allowed less observed allowed.
8. **Dispute window**, from the remittance date: the contract's `dispute_window_days`; a contract silent on disputes
   takes the release's `commercial_default` redetermination window, an MA non-contracted line the `medicare` one (the
   record in force on the remittance date; measured from the date of service when it says so; months to the same day,
   or the month's last day). No remittance date, or no record, is `NO_WINDOW`; a deadline before `as_of` is
   `WINDOW_PASSED` (QUESTIONS Q33, Q34).

Percentages come from the release. In the SYNTHETIC releases they are deliberately not the real ones (assistant
77%, sequestration 3%, MPPR 40%; `fixtures/synthetic/cms/synthetic-rules.md`), so an engine that hard-codes 85%,
2% or 50% fails the golden lines. Release 900003 (`fixtures/golden/sources/synthetic-rules-900003.md`) suspends
sequestration from 2026-07-01, sets the general reduction at 45% for 97112, which its MPPR file lists without a share,
and adds a commercial default dispute window of 4 months from the date of service.

A release that lacks a record the line needs (a locality, a GPCI or a conversion factor for the basis year, an
assistant or sequestration record on the service date), a ZIP that needs its ZIP+4 to name a locality, more than 999
units, claim status 23 or 25, and `apply_mppr` on a fixed, per-visit or lesser-of term (Q39) are not golden lines: the
worksheet refuses them, as the engine raises `ENGINE_ERROR`.

## Consuming the format

The engine's golden test reads the same files: it loads the release from `inputs.release.dir` (verifying
`manifest_sha256`), builds its line facts, agreement, rate records and practice settings from `inputs`, prices
every line of the claim together (the reduction is per day), and compares with `expected.lines` field by field:
the outcome and reason, `expected_allowed_cents` exactly, `expected_unrounded_cents` as a number, `rounding`,
`patient_share_cents`, `method`, `terms`, `base_cents`, each adjustment's before and after against its trace,
`review_flags`, `variance_cents` and `window`. It adds its differences to `fixtures/golden/.report` beside the
worksheet's.

Two things the engine must handle that this format makes visible:

- **Unrounded values can carry more than six decimal places** (`G09` line 2 is `2054.14327125` cents). The data
  dictionary stores `priced_line.expected_unrounded` as `numeric(18,6)`; storing it there rounds the kept value.
  The cents must come from the exact value, and the column's scale is a question for milestone 5.
- **The place-of-service split is an input here**, because no rule record carries it. The engine either takes the
  same table or must agree with it for the codes the golden lines use.
