# Rules reference

Imported verbatim from the "Rules reference" tab of the planning document (as of 2026-10-14).

The reimbursement parameters the engine uses, with the source each comes from and the record type that carries it. Values marked 2026 were read from CMS pages on October 14, 2026 and are re-verified against the published files at milestone 0; anything else is loaded by parser from the file named. This tab is the specialist's checklist as much as the engineer's.

## Medicare physician fee schedule

| Parameter | 2026 value or source | Record | Notes |
| --- | --- | --- | --- |
| Relative value units (work, practice expense facility and non-facility, malpractice) by HCPCS and modifier | CMS PFS relative value file for the year and quarter | `pfs_rvu` | Loaded by parser; quarterly updates supersede by effective date |
| Geographic practice cost indices | CMS GPCI file | `pfs_gpci` | By locality; North Carolina is a single locality |
| Conversion factors | Two for 2026: one for qualifying alternative payment model participants and one for all others; values from the CY 2026 final rule | `conversion_factor` | The rule record names which applies; contracts that reference "the Medicare rate" default to the non-qualifying factor unless the specialist marks otherwise |
| Locality by ZIP | CMS ZIP-to-locality file | `locality_map` | Practice locality set from its billing ZIP; overridable per site |
| Formula | (work RVU times work GPCI plus PE RVU times PE GPCI plus MP RVU times MP GPCI) times the conversion factor | engine | PE value chosen by place of service (facility or non-facility) |

## Therapy-specific Medicare rules

| Rule | Value | Source | Record | Engine flag |
| --- | --- | --- | --- | --- |
| Multiple procedure payment reduction | 50% reduction of the practice-expense component for the second and later "always therapy" units in a day; the MPPR rate file lists the codes and the PE share; last updated February 24, 2026 to add 97026 | [CMS therapy services](https://www.cms.gov/medicare/coding-billing/therapy-services) | `mppr_rate` | `apply_mppr` |
| Assistant modifiers CQ and CO | Paid at 85% of the otherwise applicable amount, effective January 1, 2022 | CMS therapy services | `assistant_modifier` | `apply_assistant_reduction` |
| Sequestration | 2% of the Medicare payment after the beneficiary share | Federal law; CMS notices | `sequestration` | `apply_sequestration` |
| KX modifier threshold | $2,480 for PT and SLP combined; $2,480 for OT (2026) | CMS therapy services | `therapy_threshold` | Review flag only; no price effect |
| Targeted medical review threshold | $3,000 for PT and SLP; $3,000 for OT (2026); indexed by the MEI from 2028 | CMS therapy services | `therapy_threshold` | Review flag only |
| NCCI procedure-to-procedure edits | Quarterly CMS tables; 97140 with 97530 requires a 59 or X modifier | CMS NCCI | `ncci_ptp` | `apply_ncci` |
| Medically unlikely edits | Quarterly CMS tables | CMS NCCI | `ncci_mue` | `apply_ncci`; units above MUE are `MUE_EXCEEDED` |
| Timed units (8-minute rule) | Medicare pools timed minutes across codes; many commercial payers count per code | CMS; contracts | `timed_units_rule` per rate record | `MEDICARE_POOLED`, `PER_CODE`, `UNKNOWN` (review until minutes are imported) |
| Timely filing | 12 months from the date of service for Medicare | CMS | `dispute_window` | Window check |
| Redetermination and reconsideration | 120 days and 180 days respectively | CMS | `dispute_window` | Window check |

## Medicare Advantage

| Case | Rule | Source | Engine |
| --- | --- | --- | --- |
| Contracted provider | The MA contract governs | Contract | Priced as a commercial contract; Medicare flags off unless the contract incorporates them |
| Non-contracting provider | Must accept as payment in full the amount it could collect under Original Medicare; a provider that submits the same information it would submit to Medicare is deemed to request that amount unless it notifies the plan in writing that it bills less | [42 CFR 422.214](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422/subpart-E/section-422.214) | Mapping kind `ma_noncontracted`: 100% of the current-year fee schedule with every Medicare adjustment on; a specialist confirms the regulation's application per case before a packet |

## Commercial contract methods

| Method | Parameters | Typical wording the specialist looks for |
| --- | --- | --- |
| `FIXED_SCHEDULE` | Amount per code and modifier set, in cents | "Exhibit A fee schedule", "per unit" |
| `PERCENT_OF_MEDICARE` | Percentage; year basis (`LOCKED:<year>` or `CURRENT`); locality basis; which conversion factor | "110% of the Medicare Physician Fee Schedule in effect on the date of service", "based on the 2025 fee schedule" |
| `LESSER_OF` | Schedule reference; charge basis | "the lesser of billed charges or the fee schedule" |
| `PER_VISIT` | Amount; included codes; one per claim per date | "per visit", "case rate per encounter" |
| `UNSUPPORTED` | None | Capitation, bundled episodes, undefined case rates: unpriced with `UNSUPPORTED_METHOD` |

Every rate record also carries: the adjustment flags (default off for commercial contracts), the rounding rule (`HALF_UP_CENT` default), the timely filing and dispute windows, and the evidence (document, page, quote, hash).

## State prompt-pay rules

| State | Rule | Source | Record |
| --- | --- | --- | --- |
| North Carolina | An insurer must pay or respond within 30 calendar days of receiving a claim (30 days after any requested information); interest accrues automatically on late payment from 30 days after adequate proof of loss; applies to North Carolina-licensed insurers regardless of provider location; self-funded ERISA plans excluded; TPAs not directly subject but the insurer remains liable | [NC Department of Insurance](https://www.ncdoi.gov/insurance-industry/form-and-rate-filings/life-and-health/prompt-pay-requirement), G.S. 58-3-225 | `state_prompt_pay` |
| Other states | Loaded as customers arrive, each with its statute, days, interest rule and exclusions | State insurance departments | `state_prompt_pay` |

Interest is computed by code from the record and shown as its own packet line; it is never included in expected allowed.

## Observed allowed and variance

| Term | Definition |
| --- | --- |
| Observed allowed | AMT B6 at the line when present; otherwise line paid plus the sum of PR adjustments at the line (or allocated from the claim when lines carry none); basis stored per line |
| Expected allowed | The engine's result under the signed-off rate record, after flagged adjustments, rounded once |
| Variance | Expected allowed minus observed allowed; positive is underpayment; negative is recorded and never pursued |
| Patient responsibility | From CAS PR; reported beside the variance, not subtracted from expected |

## Unpriced reasons and their remedies

| Reason | Meaning | Remedy shown on the Coverage screen |
| --- | --- | --- |
| `NO_MAPPING` | The payer and plan have no mapping on the service date | Map the plan |
| `NO_AGREEMENT` | Mapped as out of network or no agreement | None; anomaly screening only |
| `AMBIGUOUS_RATE` | More than one rate record matches | Specialist resolves scope |
| `NO_RATE_FOR_CODE` | The agreement has no term for the code | Obtain the exhibit page or confirm exclusion |
| `NO_PFS_VALUE` | No RVU for the code in the basis year | Check the code and year; some codes are carrier-priced |
| `UNSUPPORTED_METHOD` | Capitation or undefined case rate | None; reported |
| `SECONDARY_PAYER` | Claim status 2 or 3 | Deferred release |
| `MUE_EXCEEDED` | Units above the MUE with NCCI on | Review the claim |
| `UNITS_RULE_UNKNOWN` | Timed-units rule unknown for the payer | Confirm with the contract or import minutes |
| `DATE_OUTSIDE_VERSIONS` | No signed-off version covers the service date | Obtain the amendment or confirm the window |
| `REVERSED_CLAIM` | The claim was reversed and not corrected | None |
| `ENGINE_ERROR` | Unexpected input | Operator alert |

## Code lists

Claim adjustment reason codes (CARC), remittance advice remark codes (RARC) and claim status codes are loaded from the X12 external code lists three times a year as `carc`, `rarc` and `claim_status_code` records with effective and deactivation dates; the parser flags unknown codes rather than rejecting the file. Classification of denials into categories (authorization, visit limit, modifier, medical necessity, timely filing, bundling, other) is a versioned lookup over group code, CARC and RARC, maintained as a rule record, never a model.
