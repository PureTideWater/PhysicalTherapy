#!/usr/bin/env python3
"""The five fixture payers of the golden lines and the claims written against them (PRD 18: "Two hundred lines
across five fixture payers ... covering every method, every adjustment flag on and off, every unpriced reason,
rounding at boundaries and reversals").

This program writes inputs only. Each fixture payer is one SYNTHETIC contract with its own versions, methods and
flags, defined once here and carried identically by every claim of the payer; each claim is a set of line facts
against it. Nothing here computes an amount: `golden_worksheet.py write` works out every expected result and
worksheet from these inputs, and a person reviews the result with the specialist like any golden change.

    python3 -I tools/golden-worksheet/fixture_payers.py check     # the committed claims' inputs equal these (no writes)
    python3 -I tools/golden-worksheet/fixture_payers.py inputs    # write the inputs of new or changed claims

`inputs` clears the computed sections (expected, worksheet, provenance) of a claim whose inputs it changes, so
`golden_worksheet.py write` must fill them again before `check` passes; it never touches a claim whose inputs
are unchanged, and it refuses to change one the specialist has verified.

Every payer, plan, claim and identifier is invented. Amounts are cents as text; the reference values come from
the SYNTHETIC releases each claim names.
"""

import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import golden_worksheet as gw  # noqa: E402

AS_OF = "2026-10-15"
PRACTICE = {"zip": "00011", "default_rounding": "HALF_UP_CENT"}
PLACES = {"11": "non_facility", "22": "facility"}


def release(number):
    directory = f"fixtures/synthetic/rules/release-synth-{number}"
    return {"number": number, "dir": directory, "manifest_sha256": gw.sha256_of(gw.REPOSITORY / directory / "MANIFEST.json")}


# ---------------------------------------------------------------------------------------------
# Building blocks of a contract


def flags(mppr=False, assistant=False, sequestration=False, ncci=False, timed="PER_CODE", rounding=None):
    return {
        "apply_mppr": mppr, "apply_assistant_reduction": assistant, "apply_sequestration": sequestration, "apply_ncci": ncci,
        "timed_units_rule": timed, "rounding": rounding,
    }


def scope(codes, start, end=None, modifier_sets=None, places=None):
    return {"codes": codes, "modifier_sets": modifier_sets, "places_of_service": places, "effective_from": start, "effective_to": end}


def percent_of(percentage, year_basis="CURRENT", factor="non_qualifying_apm"):
    return {"percentage": percentage, "year_basis": year_basis, "locality_basis": "practice", "conversion_factor": factor}


def cap(cents):
    return {"kind": "CAP", "cap_cents": cents}


def pays(percent):
    return {"kind": "PERCENT", "percent": percent}


def fixed(record_id, where, cents, record_flags, adjustment=None):
    return {"rate_record_id": record_id, "scope": where, "method": "FIXED_SCHEDULE", "parameters": {"amount_cents": cents, "contract_adjustment": adjustment}, "flags": record_flags}


def percent(record_id, where, schedule, record_flags, adjustment=None):
    return {"rate_record_id": record_id, "scope": where, "method": "PERCENT_OF_MEDICARE", "parameters": {**schedule, "contract_adjustment": adjustment}, "flags": record_flags}


def lesser_of_fixed(record_id, where, cents, record_flags, adjustment=None):
    parameters = {"schedule": {"method": "FIXED_SCHEDULE", "amount_cents": cents}, "charge_basis": "LINE_CHARGE", "contract_adjustment": adjustment}
    return {"rate_record_id": record_id, "scope": where, "method": "LESSER_OF", "parameters": parameters, "flags": record_flags}


def lesser_of_percent(record_id, where, schedule, record_flags, adjustment=None):
    parameters = {"schedule": {"method": "PERCENT_OF_MEDICARE", **schedule}, "charge_basis": "LINE_CHARGE", "contract_adjustment": adjustment}
    return {"rate_record_id": record_id, "scope": where, "method": "LESSER_OF", "parameters": parameters, "flags": record_flags}


def per_visit(record_id, where, cents, record_flags, adjustment=None):
    return {"rate_record_id": record_id, "scope": where, "method": "PER_VISIT", "parameters": {"amount_cents": cents, "contract_adjustment": adjustment}, "flags": record_flags}


def unsupported(record_id, where, record_flags):
    return {"rate_record_id": record_id, "scope": where, "method": "UNSUPPORTED", "parameters": {}, "flags": record_flags}


def windows(timely=None, dispute=None, appeals=()):
    return {"timely_filing_days": timely, "dispute_window_days": dispute, "appeal_levels": [{"level": index + 1, "days": days} for index, days in enumerate(appeals)]}


def version(version_id, contract_id, number, status, start, end, version_windows, records):
    return {
        "contract_version_id": version_id, "contract_id": contract_id, "version_no": number, "status": status,
        "effective_from": start, "effective_to": end, "windows": version_windows, "rate_records": records,
    }


def mapping(mapping_id, kind, version_id, start, end=None):
    return {"mapping_id": mapping_id, "kind": kind, "contract_version_id": version_id, "effective_from": start, "effective_to": end}


THERAPY = ["97110", "97112", "97116", "97140", "97530"]
EVALUATIONS = ["97161", "97162", "97163"]

# ---------------------------------------------------------------------------------------------
# The five fixture payers


class Payer:
    def __init__(self, letter, name, release_number, contract_versions, plans):
        self.letter = letter
        self.name = name
        self.release = release_number
        self.contract_versions = contract_versions
        self.plans = plans


A1, A2 = "2026-01-01", "2026-07-01"
A1_END = "2026-06-30"
A_FLAGS = flags(assistant=True, ncci=True, rounding="HALF_UP_CENT")
A_EVALUATION = flags(ncci=True, rounding="HALF_UP_CENT")
A2_FLAGS = flags(assistant=True, ncci=True, rounding="HALF_EVEN_CENT")
A2_EVALUATION = flags(ncci=True, rounding="HALF_EVEN_CENT")
PLAIN_97140 = [["GP"], ["GP", "CQ"], ["GP", "CO"]]
DISTINCT_97140 = [["GP", "59"], ["GP", "XS"], ["GP", "XU"]]

PAYER_A = Payer("A", "fixed fee schedule (Exhibit A) amended in July", 900001, [
    version("cv-a-1", "contract-synth-a", 1, "signed_off", A1, A1_END, windows(180, 90, (60, 60)), [
        fixed("rr-a1-97110", scope(["97110"], A1, A1_END), "3250", A_FLAGS),
        fixed("rr-a1-97112", scope(["97112"], A1, A1_END), "3175", A_FLAGS),
        fixed("rr-a1-97116", scope(["97116"], A1, A1_END), "2875", A_FLAGS),
        fixed("rr-a1-97140", scope(["97140"], A1, A1_END, PLAIN_97140), "3010", A_FLAGS),
        fixed("rr-a1-97140-distinct", scope(["97140"], A1, A1_END, DISTINCT_97140), "2800", A_FLAGS),
        fixed("rr-a1-97530", scope(["97530"], A1, A1_END), "3333", A_FLAGS),
        fixed("rr-a1-evaluation", scope(EVALUATIONS, A1, A1_END), "9500", A_EVALUATION),
        fixed("rr-a1-97164", scope(["97164"], A1, A1_END), "6250", A_EVALUATION),
        fixed("rr-a1-97035-page-4", scope(["97035"], A1, A1_END), "1500", A_FLAGS),
        fixed("rr-a1-97035-page-7", scope(["97035"], A1, A1_END), "1450", A_FLAGS),
        fixed("rr-a1-97750", scope(["97750"], A1, A1_END), "4100", flags(assistant=True, ncci=True, timed="UNKNOWN", rounding="HALF_UP_CENT")),
        unsupported("rr-a1-g0283", scope(["G0283"], A1, A1_END), flags(ncci=True)),
    ]),
    version("cv-a-2", "contract-synth-a", 2, "signed_off", A2, None, windows(180, 120, (60,)), [
        fixed("rr-a2-97110", scope(["97110"], A2), "3350", A2_FLAGS),
        fixed("rr-a2-97112", scope(["97112"], A2), "3250", A2_FLAGS),
        fixed("rr-a2-97116", scope(["97116"], A2), "2975", A2_FLAGS),
        fixed("rr-a2-97140", scope(["97140"], A2, None, PLAIN_97140), "3110", A2_FLAGS),
        fixed("rr-a2-97140-distinct", scope(["97140"], A2, None, DISTINCT_97140), "2900", A2_FLAGS),
        fixed("rr-a2-97530", scope(["97530"], A2), "3433", A2_FLAGS, cap("6000")),
        fixed("rr-a2-evaluation", scope(EVALUATIONS, A2), "9800", A2_EVALUATION),
        fixed("rr-a2-97164", scope(["97164"], A2), "6450", A2_EVALUATION),
        fixed("rr-a2-97750", scope(["97750"], A2), "4250", flags(assistant=True, ncci=True, timed="MEDICARE_POOLED", rounding="HALF_EVEN_CENT")),
    ]),
], {
    "SYNTH-PAYER-A/PLAN-PPO": [mapping("map-a-ppo", "contract", "cv-a-1", A1)],
    "SYNTH-PAYER-A/PLAN-OON": [mapping("map-a-oon", "no_agreement", None, A1)],
    "SYNTH-PAYER-A/PLAN-NEW": [mapping("map-a-new", "contract", "cv-a-2", "2026-09-01")],
})

B1 = "2026-01-01"
PAYER_B = Payer("B", "lesser of billed charges or the fee schedule, silent on disputes", 900003, [
    version("cv-b-1", "contract-synth-b", 1, "signed_off", B1, None, windows(365, None, ()), [
        lesser_of_fixed("rr-b-fixed", scope(["97110", "97112", "97116", "97140"], B1), "3400",
                        flags(sequestration=True, timed="MEDICARE_POOLED", rounding="HALF_EVEN_CENT"), pays("98")),
        lesser_of_percent("rr-b-medicare", scope(["97530", "97161", "97162", "97163", "97164", "97026", "97035", "G0283", "97750"], B1), percent_of("125"),
                          flags(assistant=True, ncci=True, rounding="TRUNCATE")),
    ]),
], {
    "SYNTH-PAYER-B/PLAN-HMO": [mapping("map-b-hmo", "contract", "cv-b-1", B1)],
    "SYNTH-PAYER-B/PLAN-GOV": [mapping("map-b-gov", "government", None, B1)],
})

C1 = "2026-01-01"
PAYER_C = Payer("C", "per-visit rate, evaluations on a fixed amount", 900001, [
    version("cv-c-1", "contract-synth-c", 1, "signed_off", C1, None, windows(90, 45, (30,)), [
        per_visit("rr-c-visit", scope(THERAPY, C1), "8800", flags(assistant=True, sequestration=True, ncci=True, timed="MEDICARE_POOLED", rounding="HALF_UP_CENT")),
        per_visit("rr-c-group", scope(["97150"], C1), "3000", flags(ncci=True, timed="MEDICARE_POOLED", rounding="HALF_UP_CENT"), cap("2500")),
        per_visit("rr-c-reevaluation", scope(["97164"], C1), "5150", flags(ncci=True, timed="UNKNOWN", rounding="HALF_UP_CENT")),
        fixed("rr-c-evaluation", scope(EVALUATIONS, C1), "12500", flags(ncci=True), pays("92.5")),
    ]),
], {
    "SYNTH-PAYER-C/PLAN-1": [mapping("map-c-1", "contract", "cv-c-1", C1)],
})

D1 = "2026-01-01"
EVERY_FLAG = dict(mppr=True, assistant=True, sequestration=True, ncci=True, timed="MEDICARE_POOLED")
PAYER_D = Payer("D", "Medicare Advantage contracted plan at 100% of Medicare with Medicare's adjustments", 900001, [
    version("cv-d-1", "contract-synth-d", 1, "signed_off", D1, None, windows(365, 60, (60, 180)), [
        percent("rr-d-therapy", scope(THERAPY + ["97026", "97035", "G0283"], D1), percent_of("100"), flags(**EVERY_FLAG)),
        percent("rr-d-evaluation", scope(EVALUATIONS + ["97164"], D1), percent_of("100", factor="qualifying_apm"), flags(**EVERY_FLAG, rounding="HALF_EVEN_CENT"), cap("5800")),
        unsupported("rr-d-97750", scope(["97750"], D1), flags(ncci=True)),
    ]),
], {
    "SYNTH-MA-PLAN-D/HMO": [mapping("map-d-hmo", "contract", "cv-d-1", D1)],
    "SYNTH-MA-PLAN-D/NONPAR": [mapping("map-d-nonpar", "ma_noncontracted", None, D1)],
})

E0, E0_END, E1, E1_END, E2 = "2025-07-01", "2025-12-31", "2026-01-01", "2026-03-31", "2026-05-01"
E1_FLAGS = flags(mppr=True, rounding="HALF_EVEN_CENT")
E2_FLAGS = flags(mppr=True, assistant=True, sequestration=True, ncci=True, rounding="TRUNCATE")
PAYER_E = Payer("E", "commercial contract locked to 2025, then current-year percent, with a gap between versions", 900002, [
    version("cv-e-0", "contract-synth-e", 1, "superseded", E0, E0_END, windows(120, 30, ()), [
        percent("rr-e0-therapy", scope(THERAPY, E0, E0_END), percent_of("110"), flags(rounding="HALF_EVEN_CENT")),
    ]),
    version("cv-e-1", "contract-synth-e", 2, "signed_off", E1, E1_END, windows(120, 30, ()), [
        percent("rr-e1-therapy", scope(THERAPY, E1, E1_END), percent_of("115", "LOCKED:2025"), E1_FLAGS, pays("97.5")),
        percent("rr-e1-modalities", scope(["97026", "97035"], E1, E1_END), percent_of("115", "LOCKED:2025"), E1_FLAGS, pays("97.5")),
        fixed("rr-e1-evaluation", scope(EVALUATIONS, E1, E1_END), "7400", flags()),
    ]),
    version("cv-e-2", "contract-synth-e", 3, "signed_off", E2, None, windows(120, 180, (90,)), [
        percent("rr-e2-therapy", scope(["97110", "97112", "97140", "97530"], E2), percent_of("120", factor="qualifying_apm"), E2_FLAGS),
        fixed("rr-e2-97116", scope(["97116"], E2), "2500", flags(assistant=True, ncci=True), cap("6000")),
        lesser_of_fixed("rr-e2-evaluation", scope(EVALUATIONS + ["97164"], E2), "7600", flags(ncci=True, rounding="HALF_UP_CENT")),
        percent("rr-e2-97750", scope(["97750"], E2), percent_of("120", factor="qualifying_apm"), flags(ncci=True, rounding="TRUNCATE")),
    ]),
], {
    "SYNTH-PAYER-E/PLAN-EPO": [mapping("map-e-epo", "contract", "cv-e-1", E0, "2026-08-31"), mapping("map-e-left", "no_agreement", None, "2026-09-01")],
})

PAYERS = {payer.letter: payer for payer in (PAYER_A, PAYER_B, PAYER_C, PAYER_D, PAYER_E)}

# ---------------------------------------------------------------------------------------------
# Claims


def line(number, code, modifiers, units, date, charge, observed, shares=(), place="11", basis="amt_b6"):
    return {
        "line_no": number, "procedure_code": code, "modifiers": list(modifiers), "units": str(units), "service_date": date,
        "place_of_service": place, "charge_cents": str(charge), "observed_allowed_cents": str(observed), "observed_allowed_basis": basis,
        "patient_share_adjustments": [{"group_code": "PR", "reason_code": reason, "amount_cents": str(amount_)} for reason, amount_ in shares],
    }


CLAIMS = []


def claim(identifier, slug, payer, plan, title, covers, notes, lines, status="1", reversed_=False, remittance=None, default_rounding="HALF_UP_CENT"):
    CLAIMS.append({
        "id": identifier, "slug": slug, "payer": payer, "plan": plan, "title": title, "covers": [f"fixture payer {payer}", *covers],
        "notes": notes, "lines": lines, "status": status, "reversed": reversed_, "remittance": remittance, "default_rounding": default_rounding,
    })


PPO, OON, NEW = "SYNTH-PAYER-A/PLAN-PPO", "SYNTH-PAYER-A/PLAN-OON", "SYNTH-PAYER-A/PLAN-NEW"

claim("G101", "fixed-schedule-two-units", "A", PPO, "Fixed schedule: the amount per unit times the units",
      ["PRC-05", "FIXED_SCHEDULE", "apply_assistant_reduction", "apply_ncci"],
      "Payer A's Exhibit A pays a fixed amount per unit. Two units of 97110 are twice its amount; no assistant modifier, so the assistant flag "
      "on the records changes nothing; the units are within the SYNTHETIC MUEs.",
      [line(1, "97110", ["GP"], 2, "2026-03-03", 15000, 6500), line(2, "97112", ["GP"], 1, "2026-03-03", 7500, 3175), line(3, "97116", ["GP"], 3, "2026-03-03", 18000, 8000)],
      remittance="2026-03-24")
claim("G102", "fixed-97140-with-97530-no-modifier", "A", PPO, "97140 with 97530 on the same day, no 59 or X modifier, NCCI on: a review flag",
      ["PRC-11", "NCCI_PTP", "FIXED_SCHEDULE"],
      "The SYNTHETIC procedure-to-procedure edit has 97140 in column 1 and 97530 in column 2 with modifier indicator 1. Neither line carries 59 "
      "or an X modifier, so the 97530 line carries the review flag; its price is unchanged.",
      [line(1, "97140", ["GP"], 1, "2026-04-07", 6000, 3010), line(2, "97530", ["GP"], 2, "2026-04-07", 14000, 6666), line(3, "97110", ["GP"], 1, "2026-04-07", 7500, 3000)],
      remittance="2026-04-28")
claim("G103", "fixed-97140-59-bypasses-the-edits", "A", PPO, "97140 with 59: its own edits and its edit with 97530 are bypassed",
      ["PRC-11", "NCCI_PTP", "FIXED_SCHEDULE", "modifier sets"],
      "97140 with 59 matches Exhibit A's distinct-procedure rate. The 97140/97530 edit and the 97161/97140 edit both allow a modifier; 59 is on "
      "one line of each pair, so neither raises a flag.",
      [line(1, "97140", ["GP", "59"], 1, "2026-04-14", 6000, 2800), line(2, "97530", ["GP"], 1, "2026-04-14", 7000, 3333), line(3, "97161", ["GP"], 1, "2026-04-14", 19000, 9500)],
      remittance="2026-05-05")
claim("G104", "fixed-xs-on-the-column-two-line", "A", PPO, "An X modifier on the column-2 line bypasses the edit; a plain pair on another day does not",
      ["PRC-11", "NCCI_PTP", "X modifier"],
      "On April 21 the 97530 line carries XS, so the 97140/97530 edit is bypassed. On April 23 the same pair without a modifier is flagged.",
      [line(1, "97140", ["GP"], 1, "2026-04-21", 6000, 3010), line(2, "97530", ["GP", "XS"], 1, "2026-04-21", 7000, 3333),
       line(3, "97140", ["GP"], 1, "2026-04-23", 6000, 3010), line(4, "97530", ["GP"], 1, "2026-04-23", 7000, 3333)],
      remittance="2026-05-12")
claim("G105", "fixed-mue-exceeded", "A", PPO, "Units above the MUE with NCCI on are MUE_EXCEEDED, not priced down; at the MUE they price",
      ["PRC-10", "MUE_EXCEEDED", "FIXED_SCHEDULE"],
      "SYNTHETIC MUEs: 97110 allows 7 units, 97112 6 and 97161 1. Eight units of 97110 and two of 97161 stop for review; six of 97112, exactly "
      "the MUE, price.",
      [line(1, "97110", ["GP"], 8, "2026-05-05", 60000, 22750), line(2, "97112", ["GP"], 6, "2026-05-05", 45000, 19050), line(3, "97161", ["GP"], 2, "2026-05-05", 38000, 9500)],
      remittance="2026-05-26")
claim("G106", "fixed-assistant-at-half-cents", "A", PPO, "Assistant modifiers on fixed amounts land on half cents, rounded half up",
      ["apply_assistant_reduction", "PRC-13", "rounding at a half cent", "FIXED_SCHEDULE"],
      "77% of 3250 is 2502.5 and 77% of 5750 is 4427.5: exact half cents, which HALF_UP_CENT rounds away from zero. 77% of 3175 is 2444.75.",
      [line(1, "97110", ["GP", "CQ"], 1, "2026-05-12", 7500, 2502), line(2, "97112", ["GP", "CO"], 1, "2026-05-12", 7500, 2445), line(3, "97116", ["GP", "CQ"], 2, "2026-05-12", 12000, 4400)],
      remittance="2026-06-02")
claim("G107", "fixed-evaluation-assistant-flag-off", "A", PPO, "An evaluation record with the assistant flag off ignores CQ; the therapy record beside it applies it",
      ["apply_assistant_reduction off", "apply_assistant_reduction", "FIXED_SCHEDULE"],
      "The evaluation term has apply_assistant_reduction off, so 97162 with CQ is paid in full; 97110 with CQ under the therapy term is reduced.",
      [line(1, "97162", ["GP", "CQ"], 1, "2026-05-19", 19000, 9500), line(2, "97110", ["GP", "CQ"], 2, "2026-05-19", 15000, 5005)],
      remittance="2026-06-09")
claim("G108", "fixed-ambiguous-and-missing-terms", "A", PPO, "Two exhibit pages for 97035 are ambiguous; 97026 has no term",
      ["AMBIGUOUS_RATE", "NO_RATE_FOR_CODE"],
      "Exhibit A lists 97035 on two pages with different amounts, so the line is AMBIGUOUS_RATE until the specialist resolves it; 97026 appears "
      "nowhere, NO_RATE_FOR_CODE; 97110 prices.",
      [line(1, "97035", ["GP"], 1, "2026-05-26", 4000, 1450), line(2, "97026", ["GP"], 1, "2026-05-26", 3000, 900), line(3, "97110", ["GP"], 1, "2026-05-26", 7500, 3250)],
      remittance="2026-06-16")
claim("G109", "fixed-capitated-code-and-unknown-timed-units", "A", PPO, "A capitated code is UNSUPPORTED_METHOD; a term silent on timed units is UNITS_RULE_UNKNOWN",
      ["UNSUPPORTED_METHOD", "UNITS_RULE_UNKNOWN", "FIXED_SCHEDULE"],
      "G0283 is capitated under the contract (UNSUPPORTED). 97750's term does not say how timed units are counted (UNKNOWN), so the line is "
      "reviewed, not priced. 97112 prices.",
      [line(1, "G0283", ["GP"], 1, "2026-06-02", 2500, 0), line(2, "97750", ["GP"], 2, "2026-06-02", 16000, 8200), line(3, "97112", ["GP"], 1, "2026-06-02", 7500, 3175)],
      remittance="2026-06-23")
claim("G110", "fixed-amendment-changes-amount-and-rounding", "A", PPO, "The July amendment: new amounts and half-even rounding from its first day",
      ["CON-02", "versions", "PRC-13", "rounding at a half cent", "HALF_EVEN_CENT"],
      "June 30 prices under version 1 (3250 x 77% = 2502.5, half up 2503). July 1 prices under version 2: 3350 x 77% = 2579.5 rounds half even "
      "to 2580, and 3250 x 77% = 2502.5 to 2502.",
      [line(1, "97110", ["GP", "CQ"], 1, "2026-06-30", 7500, 2503), line(2, "97110", ["GP", "CQ"], 1, "2026-07-01", 7500, 2503), line(3, "97112", ["GP", "CQ"], 1, "2026-07-01", 7500, 2502)],
      remittance="2026-07-21")
claim("G111", "fixed-cap-on-the-line", "A", PPO, "Version 2 caps 97530 at $60.00 a line, after the assistant reduction",
      ["contract_adjustment", "cap", "NCCI_PTP", "FIXED_SCHEDULE"],
      "Two units of 97530 at 3433 are 6866, capped at 6000. With CQ one unit is 2643.41, under the cap. Both 97530 lines sit beside 97140 on the "
      "day without a modifier, so each carries the procedure-to-procedure review flag.",
      [line(1, "97530", ["GP"], 2, "2026-08-04", 14000, 6000), line(2, "97530", ["GP", "CQ"], 1, "2026-08-04", 7000, 2643), line(3, "97140", ["GP"], 1, "2026-08-04", 6000, 3110)],
      remittance="2026-08-25")
claim("G112", "fixed-amendment-states-the-timed-units-rule", "A", PPO, "Version 2 states the timed-units rule for 97750, which then prices; no MUE record for it",
      ["MEDICARE_POOLED", "timed units", "FIXED_SCHEDULE"],
      "Under version 2 97750's term says timed units are pooled as Medicare pools them; units are still taken as billed until minute logs "
      "exist. The release has no MUE for 97750, so nothing limits the units.",
      [line(1, "97750", ["GP"], 2, "2026-09-10", 16000, 8000), line(2, "97750", ["GP", "CQ"], 1, "2026-09-10", 8000, 3272)],
      remittance="2026-09-29")
claim("G113", "fixed-out-of-network-plan", "A", OON, "The payer's out-of-network plan has no agreement",
      ["NO_AGREEMENT"],
      "The same payer's out-of-network plan is mapped no_agreement: no line is priced from a guess.",
      [line(1, "97110", ["GP"], 2, "2026-03-17", 15000, 4000), line(2, "97140", ["GP"], 1, "2026-03-17", 6000, 2000)],
      remittance="2026-04-07")
claim("G114", "fixed-plan-mapped-in-september", "A", NEW, "A plan mapped from September: NO_MAPPING before, version 2 after",
      ["NO_MAPPING", "MAP-02"],
      "The new plan's mapping starts on September 1, so the August line has no mapping; the September line prices under version 2, the signed-off "
      "version of the contract in force on its date.",
      [line(1, "97110", ["GP"], 1, "2026-08-20", 7500, 3350), line(2, "97110", ["GP"], 1, "2026-09-02", 7500, 3300)],
      remittance="2026-09-22")
claim("G115", "fixed-reversal", "A", PPO, "A reversal of a fixed-schedule claim", ["REVERSED_CLAIM", "PAR-08", "reversals"],
      "Claim status 22 carries negative charges and amounts; the amount is worked through and the line stops REVERSED_CLAIM.",
      [line(1, "97110", ["GP"], 2, "2026-03-03", -15000, -6500), line(2, "97112", ["GP"], 1, "2026-03-03", -7500, -3175)],
      status="22", remittance="2026-04-14")
claim("G116", "fixed-reversed-not-corrected", "A", PPO, "A claim a later reversal reverses, with no correction", ["REVERSED_CLAIM", "reversals"],
      "The claim was paid, then reversed, and no corrected claim followed: REVERSED_CLAIM.",
      [line(1, "97116", ["GP"], 2, "2026-03-10", 12000, 5750)], reversed_=True, remittance="2026-03-31")
claim("G117", "fixed-secondary-claim", "A", PPO, "A secondary claim under the fixed schedule", ["SECONDARY_PAYER"],
      "Claim status 2: secondary claims are unpriced in v0 and v1.",
      [line(1, "97110", ["GP"], 1, "2026-03-24", 7500, 1000), line(2, "97530", ["GP"], 1, "2026-03-24", 7000, 900)], status="2", remittance="2026-04-21")
claim("G118", "fixed-denied-claim", "A", PPO, "A denied claim prices against an observed allowed of zero", ["claim status 4", "variance"],
      "Claim status 4 prices normally; the whole expected amount is the variance.",
      [line(1, "97110", ["GP"], 1, "2026-04-28", 7500, 0, basis="paid_plus_pr")], status="4", remittance="2026-05-19")
claim("G119", "fixed-window-passed-and-overpaid", "A", PPO, "Version 1's 90-day window has passed; one line is overpaid",
      ["PRC-14", "PRC-15", "WINDOW_PASSED", "variance"],
      "Remitted on February 20, the 90-day dispute window ended on May 21, before the triage date: validated, not actionable, the amount "
      "unchanged. The 97112 line was paid more than the schedule: a negative variance, recorded and never pursued.",
      [line(1, "97110", ["GP"], 1, "2026-02-03", 7500, 3000), line(2, "97112", ["GP"], 1, "2026-02-03", 7500, 3400)],
      remittance="2026-02-20")
claim("G120", "fixed-patient-share-and-paid-plus-pr", "A", PPO, "Patient share is reported beside the fixed amount, never subtracted",
      ["patient share", "paid_plus_pr", "FIXED_SCHEDULE"],
      "Coinsurance and a deductible on the lines are reported beside the expected amount; the fixed schedule has no sequestration, so the share "
      "changes nothing. In June the SYNTHETIC 97164/97110 edit (indicator 0) is still in force, so 97110 carries a review flag.",
      [line(1, "97110", ["GP"], 2, "2026-06-09", 15000, 6500, shares=(("1", 3000), ("2", 1300)), basis="paid_plus_pr"),
       line(2, "97164", ["GP"], 1, "2026-06-09", 12000, 6250, shares=(("2", 1250),))],
      remittance="2026-06-30")

HMO, GOV = "SYNTH-PAYER-B/PLAN-HMO", "SYNTH-PAYER-B/PLAN-GOV"
claim("G121", "lesser-of-charge-lower", "B", HMO, "Lesser of: where the charge is lower, the charge wins",
      ["PRC-06", "LESSER_OF", "apply_sequestration", "contract_adjustment", "percent"],
      "Two units of 97110 on a $34.00 schedule are 6800 against a charge of 6000: the charge is the base. Sequestration (on in this contract) "
      "takes 3% of the payer's share, then the contract pays 98%. For 97112 the schedule is the lesser.",
      [line(1, "97110", ["GP"], 2, "2026-03-05", 6000, 5700, shares=(("2", 1200),)), line(2, "97112", ["GP"], 1, "2026-03-05", 4000, 3200)],
      remittance="2026-03-26")
claim("G122", "lesser-of-charge-equal", "B", HMO, "Lesser of: a charge equal to the schedule", ["LESSER_OF", "lesser of at the boundary"],
      "The charges equal the schedule for one and three units; either is the base.",
      [line(1, "97140", ["GP"], 1, "2026-03-12", 3400, 3200), line(2, "97116", ["GP"], 3, "2026-03-12", 10200, 9600)], remittance="2026-04-02")
claim("G123", "lesser-of-percent-schedule", "B", HMO, "Lesser of the charge and 125% of Medicare, truncated",
      ["LESSER_OF", "PRC-06", "TRUNCATE", "apply_ncci"],
      "97530 at 125% of the SYNTHETIC fee schedule is 3375, above its 3000 charge, so the charge wins; 97161's schedule amount, 7396.25, is "
      "below its charge and truncates to 7396.",
      [line(1, "97530", ["GP"], 1, "2026-03-19", 3000, 2900), line(2, "97161", ["GP"], 1, "2026-03-19", 9000, 7000)], remittance="2026-04-09")
claim("G124", "lesser-of-assistant-truncated", "B", HMO, "Assistant modifiers on the percent schedule, truncated at the cent",
      ["apply_assistant_reduction", "LESSER_OF", "TRUNCATE", "PRC-13", "NCCI_PTP"],
      "77% of 3375 is 2598.75, which truncates to 2598. 97035 with CO, two units, is 2575 by the schedule; 77% of it is 1982.75. 97026 beside "
      "97035 meets the SYNTHETIC edit whose modifier indicator is 9, so it carries the review flag.",
      [line(1, "97530", ["GP", "CQ"], 1, "2026-04-02", 5000, 2598), line(2, "97035", ["GP", "CO"], 2, "2026-04-02", 4000, 1900), line(3, "97026", ["GP"], 1, "2026-04-02", 2000, 865)],
      remittance="2026-04-23")
claim("G125", "lesser-of-indicator-9-not-bypassed", "B", HMO, "A modifier indicator of 9 lets no modifier bypass the edit",
      ["NCCI_PTP", "LESSER_OF"],
      "97026 carries XU beside 97035; the edit's indicator is 9, so XU does not bypass it and the line carries the review flag.",
      [line(1, "97035", ["GP"], 1, "2026-04-09", 2000, 1287), line(2, "97026", ["GP", "XU"], 1, "2026-04-09", 2000, 865)], remittance="2026-04-30")
claim("G126", "lesser-of-no-fee-schedule-value", "B", HMO, "No fee-schedule value under a percent lesser-of: NO_PFS_VALUE",
      ["NO_PFS_VALUE", "LESSER_OF", "facility"],
      "97750 has no SYNTHETIC relative value; G0283's facility practice-expense value is NA. 97530 at a facility prices from its facility value.",
      [line(1, "97750", ["GP"], 1, "2026-04-16", 8000, 4000), line(2, "G0283", ["GP"], 1, "2026-04-16", 2000, 800, place="22"),
       line(3, "97530", ["GP"], 1, "2026-04-16", 7000, 1700, place="22")],
      remittance="2026-05-07")
claim("G127", "lesser-of-sequestration-suspended", "B", HMO, "Release 900003 suspends sequestration from July 1",
      ["apply_sequestration", "suspended sequestration", "LESSER_OF"],
      "June 30 takes 3% of the payer's share; July 15 takes nothing, the sequestration record being suspended from July 1. Both then take the "
      "contract's 98%.",
      [line(1, "97112", ["GP"], 1, "2026-06-30", 5000, 3232), line(2, "97110", ["GP"], 1, "2026-07-15", 5000, 3332, shares=(("2", 500),))], remittance="2026-07-28")
claim("G128", "lesser-of-patient-share-exceeds", "B", HMO, "A patient share larger than the lesser-of amount leaves no payer's share to sequester",
      ["apply_sequestration", "patient share", "LESSER_OF"],
      "The charge, 2500, is the base; the patient share of 3000 exceeds it, so sequestration takes nothing; 98% of 2500 is 2450.",
      [line(1, "97140", ["GP"], 1, "2026-05-07", 2500, 2450, shares=(("1", 3000),), basis="paid_plus_pr")], remittance="2026-05-28")
claim("G129", "lesser-of-release-default-window", "B", HMO, "A contract silent on disputes takes the release's 4 months from the date of service",
      ["windows", "dispute window measured from the date of service", "WINDOW_PASSED"],
      "May 31 plus 4 months is September 30 (the month's last day), passed on the triage date; July 20 plus 4 months is November 20, open.",
      [line(1, "97110", ["GP"], 1, "2026-05-31", 5000, 3200), line(2, "97110", ["GP"], 1, "2026-07-20", 5000, 3200)], remittance="2026-08-04")
claim("G130", "lesser-of-government-plan", "B", GOV, "The payer's government plan has no agreement", ["NO_AGREEMENT", "MAP-04"],
      "Mapped government: anomaly screening only.",
      [line(1, "97110", ["GP"], 1, "2026-03-05", 5000, 2500)], remittance="2026-03-26")
claim("G131", "lesser-of-tertiary-claim", "B", HMO, "A tertiary claim under the lesser-of contract", ["SECONDARY_PAYER"],
      "Claim status 3 is unpriced in v0 and v1.",
      [line(1, "97110", ["GP"], 1, "2026-05-14", 5000, 500), line(2, "97530", ["GP"], 1, "2026-05-14", 3000, 300)], status="3", remittance="2026-06-11")
claim("G132", "lesser-of-reversed-not-corrected", "B", HMO, "A reversed lesser-of claim with no correction", ["REVERSED_CLAIM", "reversals"],
      "Reversed and not corrected: REVERSED_CLAIM.",
      [line(1, "97112", ["GP"], 1, "2026-05-21", 4000, 3232)], reversed_=True, remittance="2026-06-11")
claim("G133", "lesser-of-half-even-at-half-cents", "B", HMO, "98% of a charge lands on half cents, rounded half even",
      ["PRC-13", "rounding at a half cent", "HALF_EVEN_CENT", "contract_adjustment"],
      "After July sequestration is suspended, so each line is 98% of its charge: 2474.5 rounds to the even 2474, 2425.5 to 2426, and 2475.48 "
      "to 2475.",
      [line(1, "97110", ["GP"], 1, "2026-08-11", 2525, 2474), line(2, "97112", ["GP"], 1, "2026-08-11", 2475, 2426), line(3, "97116", ["GP"], 1, "2026-08-11", 2526, 2475)],
      remittance="2026-09-01")
claim("G134", "lesser-of-forwarded-claim", "B", HMO, "Claim status 19 (processed as primary and forwarded) prices", ["claim status 19", "LESSER_OF"],
      "Forwarded to another payer after primary adjudication: priced as primary.",
      [line(1, "97110", ["GP"], 1, "2026-08-18", 5000, 3332), line(2, "97530", ["GP"], 1, "2026-08-18", 4000, 3300)], status="19", remittance="2026-09-08")
claim("G135", "lesser-of-modalities-two-units", "B", HMO, "Two units under a lesser-of: the schedule for both units against the charge",
      ["LESSER_OF", "units"],
      "Two units of 97116 make a schedule amount of 6800 against a charge of 7000 (the schedule wins); two units of 97035 make 2575 at 125% "
      "against a charge of 2400 (the charge wins).",
      [line(1, "97116", ["GP"], 2, "2026-08-25", 7000, 6600), line(2, "97035", ["GP"], 2, "2026-08-25", 2400, 2400)], remittance="2026-09-15")

claim("G136", "lesser-of-ncci-follows-the-column-two-term", "B", HMO, "Whether an edit is checked follows the term of the column-2 line",
      ["apply_ncci off", "apply_ncci", "NCCI_PTP", "MUE_EXCEEDED"],
      "97110 and 97116 price under the fixed lesser-of term, whose apply_ncci is off: neither is checked, though 97164 and 97530 (column 1 of "
      "their SYNTHETIC edits) are billed on the date. Six units of 97530, under the percent term with NCCI on, exceed its MUE of 5.",
      [line(1, "97164", ["GP"], 1, "2026-06-04", 9000, 5535), line(2, "97110", ["GP"], 1, "2026-06-04", 5000, 3232),
       line(3, "97530", ["GP"], 6, "2026-06-04", 21000, 15000), line(4, "97116", ["GP"], 1, "2026-06-04", 5000, 3232)],
      remittance="2026-06-25")
claim("G137", "lesser-of-facility-and-mue-limit", "B", HMO, "The percent lesser-of at a facility, CQ at a facility, and modalities at their MUE",
      ["LESSER_OF", "facility", "apply_assistant_reduction", "MUE"],
      "97161 and 97530 at a facility price from their facility values at 125%; the CQ line takes 77% of that. Three units of 97035 equal its MUE.",
      [line(1, "97161", ["GP"], 1, "2026-06-11", 9000, 4700, place="22"), line(2, "97530", ["GP", "CQ"], 1, "2026-06-11", 5000, 1300, place="22"),
       line(3, "97035", ["GP"], 3, "2026-06-11", 6000, 3800)],
      remittance="2026-07-02")

C = "SYNTH-PAYER-C/PLAN-1"
claim("G141", "per-visit-three-included-lines", "C", C, "Per visit with three included lines: the first carries it, the others expect zero",
      ["PRC-07", "PER_VISIT", "apply_sequestration"],
      "One visit on March 12 with three included lines. Line 1 carries the 8800 visit amount, less sequestration of 3% of its payer's share; "
      "lines 2 and 3 expect zero. The payer spread its payment over the lines, so the variances offset.",
      [line(1, "97110", ["GP"], 2, "2026-03-12", 15000, 4000, shares=(("2", 1000),)), line(2, "97112", ["GP"], 1, "2026-03-12", 7500, 2500), line(3, "97116", ["GP"], 1, "2026-03-12", 7500, 2300)],
      remittance="2026-04-01")
claim("G142", "per-visit-lines-listed-out-of-order", "C", C, "Per visit: the lowest line number carries the visit whatever the order the lines are listed in",
      ["PER_VISIT", "line order", "NCCI_PTP"],
      "The remittance lists line 3 first. Line 1 (97530) carries the visit. It also meets 97140 in column 1 of the SYNTHETIC edit with no "
      "modifier, so it carries the review flag.",
      [line(3, "97140", ["GP"], 1, "2026-03-19", 6000, 0), line(1, "97530", ["GP"], 1, "2026-03-19", 7000, 8536), line(2, "97110", ["GP"], 1, "2026-03-19", 7500, 0)],
      remittance="2026-04-08")
claim("G143", "per-visit-assistant-on-the-carrying-line", "C", C, "Per visit with CQ on the line that carries the visit",
      ["PER_VISIT", "apply_assistant_reduction"],
      "The carrying line has CQ, so the visit amount is reduced to 77% before sequestration; the zero line stays zero.",
      [line(1, "97110", ["GP", "CQ"], 1, "2026-03-26", 7500, 6573), line(2, "97140", ["GP"], 1, "2026-03-26", 6000, 0)], remittance="2026-04-15")
claim("G144", "per-visit-assistant-on-a-zero-line", "C", C, "Per visit with CQ on a line that expects zero",
      ["PER_VISIT", "apply_assistant_reduction"],
      "The CQ is on line 2, which expects zero; 77% of zero is zero, and the visit on line 1 is unreduced.",
      [line(1, "97110", ["GP"], 1, "2026-04-02", 7500, 8536), line(2, "97112", ["GP", "CQ"], 1, "2026-04-02", 7500, 0)], remittance="2026-04-22")
claim("G145", "per-visit-two-dates", "C", C, "Two visits on one claim: one amount per date", ["PER_VISIT", "PRC-07"],
      "March 2 and March 4 are two visits; each date's first included line carries its amount.",
      [line(1, "97110", ["GP"], 1, "2026-03-02", 7500, 4300), line(2, "97112", ["GP"], 1, "2026-03-02", 7500, 4236),
       line(3, "97110", ["GP"], 1, "2026-03-04", 7500, 8536), line(4, "97140", ["GP"], 1, "2026-03-04", 6000, 0)],
      remittance="2026-03-25")
claim("G146", "per-visit-mue-on-the-first-line", "C", C, "MUE_EXCEEDED on the first included line: the next line carries the visit",
      ["PER_VISIT", "MUE_EXCEEDED", "PRC-10", "NCCI_PTP"],
      "Six units of 97530 exceed its SYNTHETIC MUE of 5, so line 1 stops for review and the visit falls to line 2. Line 3 (97116) meets 97530 in "
      "column 1 of an edit with no modifier: a review flag on a line that expects zero.",
      [line(1, "97530", ["GP"], 6, "2026-04-09", 42000, 0), line(2, "97110", ["GP"], 1, "2026-04-09", 7500, 8536), line(3, "97116", ["GP"], 1, "2026-04-09", 7500, 0)],
      remittance="2026-04-29")
claim("G147", "per-visit-two-records-one-date", "C", C, "Two per-visit terms on one date: each pays once, and the group rate is capped",
      ["PER_VISIT", "contract_adjustment", "cap"],
      "The therapy visit and the group session are separate terms, each paid once on the date. The group term's 3000 is capped at 2500. "
      "The release has no MUE for 97150, so nothing limits its units.",
      [line(1, "97110", ["GP"], 1, "2026-04-16", 7500, 8536), line(2, "97150", ["GP"], 1, "2026-04-16", 4000, 2500), line(3, "97112", ["GP"], 1, "2026-04-16", 7500, 0)],
      remittance="2026-05-06")
claim("G148", "per-visit-with-a-fixed-evaluation", "C", C, "An evaluation on a fixed amount beside the visit, at the contract's 92.5%",
      ["FIXED_SCHEDULE", "contract_adjustment", "percent", "PRC-13", "rounding at a half cent", "NCCI_PTP"],
      "92.5% of 12500 is 11562.5, which the practice's default (the record is silent) rounds half up to 11563. 97140 meets 97161 in column 1 "
      "with no modifier, so the zero line carries a review flag.",
      [line(1, "97161", ["GP"], 1, "2026-04-23", 19000, 11563), line(2, "97110", ["GP"], 1, "2026-04-23", 7500, 8536), line(3, "97140", ["GP"], 1, "2026-04-23", 6000, 0)],
      remittance="2026-05-13")
claim("G149", "per-visit-reevaluation-timed-units-unknown", "C", C, "A per-visit re-evaluation term silent on timed units is UNITS_RULE_UNKNOWN",
      ["PER_VISIT", "UNITS_RULE_UNKNOWN"],
      "The re-evaluation term's timed-units rule is UNKNOWN; the worksheet stops the line for review even though units do not multiply a "
      "per-visit amount (fixtures/golden/QUESTIONS.md Q40). The therapy visit beside it prices, and carries the review flag of the 97164/97110 "
      "edit (97164 is billed on the date, whatever its own outcome).",
      [line(1, "97164", ["GP"], 1, "2026-04-30", 12000, 5150), line(2, "97110", ["GP"], 1, "2026-04-30", 7500, 8536)], remittance="2026-05-20")
claim("G150", "per-visit-patient-share-on-a-zero-line", "C", C, "A patient share on a zero line leaves no payer's share to sequester",
      ["PER_VISIT", "apply_sequestration", "patient share"],
      "Line 1 carries the visit with a 2000 deductible; line 2 expects zero and its 1500 coinsurance makes a negative payer's share, floored at zero.",
      [line(1, "97110", ["GP"], 1, "2026-05-07", 7500, 6600, shares=(("1", 2000),), basis="paid_plus_pr"), line(2, "97112", ["GP"], 1, "2026-05-07", 7500, 1500, shares=(("2", 1500),), basis="paid_plus_pr")],
      remittance="2026-05-27")
claim("G151", "per-visit-modalities-without-terms", "C", C, "Modalities with no term in a per-visit contract", ["NO_RATE_FOR_CODE", "PER_VISIT"],
      "The contract names no rate for 97035 or 97026: NO_RATE_FOR_CODE, a question for the specialist (included in the visit, or excluded). "
      "The visit line prices.",
      [line(1, "97035", ["GP"], 1, "2026-05-14", 2000, 0), line(2, "97026", ["GP"], 1, "2026-05-14", 2000, 0), line(3, "97110", ["GP"], 1, "2026-05-14", 7500, 8536)],
      remittance="2026-06-03")
claim("G152", "per-visit-reversal", "C", C, "A reversal of a per-visit claim", ["REVERSED_CLAIM", "reversals", "PER_VISIT"],
      "Claim status 22: the visit amount is worked through on line 1 and both lines stop REVERSED_CLAIM.",
      [line(1, "97110", ["GP"], 1, "2026-03-12", -7500, -8536), line(2, "97112", ["GP"], 1, "2026-03-12", -7500, 0)], status="22", remittance="2026-05-20")
claim("G153", "per-visit-secondary-forwarded", "C", C, "A per-visit claim processed as secondary and forwarded (status 20)", ["SECONDARY_PAYER", "claim status 20"],
      "Status 20 is SECONDARY_PAYER.",
      [line(1, "97110", ["GP"], 1, "2026-05-21", 7500, 1000), line(2, "97140", ["GP"], 1, "2026-05-21", 6000, 0)], status="20", remittance="2026-06-10")
claim("G154", "per-visit-practice-half-even", "C", C, "The practice's half-even default on the evaluation's half cent; the visit keeps the record's half up",
      ["PRC-13", "rounding at a half cent", "HALF_EVEN_CENT", "practice default rounding"],
      "The evaluation record names no rounding, so the practice default (here HALF_EVEN_CENT) rounds 11562.5 to 11562; the visit record names "
      "HALF_UP_CENT.",
      [line(1, "97162", ["GP"], 1, "2026-05-28", 19000, 11562), line(2, "97110", ["GP", "CQ"], 1, "2026-05-28", 7500, 6573)],
      remittance="2026-06-17", default_rounding="HALF_EVEN_CENT")
claim("G155", "per-visit-window-open-on-its-last-day", "C", C, "The 45-day window is open on its last day", ["windows", "OPEN"],
      "Remitted on August 31, the window ends on October 15, the triage date itself: open.",
      [line(1, "97110", ["GP"], 1, "2026-08-11", 7500, 8000), line(2, "97116", ["GP"], 1, "2026-08-11", 7500, 0)], remittance="2026-08-31")
claim("G156", "per-visit-window-passed-the-day-after", "C", C, "Remitted a day earlier, the 45-day window has passed", ["windows", "PRC-14", "WINDOW_PASSED"],
      "Remitted on August 30, the window ended on October 14: validated, not actionable.",
      [line(1, "97110", ["GP"], 1, "2026-08-11", 7500, 8000), line(2, "97116", ["GP"], 1, "2026-08-11", 7500, 0)], remittance="2026-08-30")
claim("G157", "per-visit-mue-at-the-limit-and-a-ptp-pair", "C", C, "Units at the MUE and 97140 with 97530 bypassed by 59 inside a visit",
      ["PER_VISIT", "NCCI_PTP", "MUE"],
      "Five units of 97530 equal its SYNTHETIC MUE: no stop. 97530 meets 97140, which carries 59: bypassed.",
      [line(1, "97530", ["GP"], 5, "2026-06-04", 35000, 8536), line(2, "97140", ["GP", "59"], 1, "2026-06-04", 6000, 0)], remittance="2026-06-24")

claim("G158", "per-visit-mue-on-a-later-line", "C", C, "MUE_EXCEEDED on a later line leaves the first line carrying the visit",
      ["PER_VISIT", "MUE_EXCEEDED"],
      "Seven units of 97112 exceed its SYNTHETIC MUE of 6, so line 2 stops for review; line 1 still carries the visit and line 3 expects zero.",
      [line(1, "97110", ["GP"], 1, "2026-06-11", 7500, 8536), line(2, "97112", ["GP"], 7, "2026-06-11", 52500, 0), line(3, "97140", ["GP"], 1, "2026-06-11", 6000, 0)],
      remittance="2026-07-01")
claim("G159", "per-visit-patient-share-above-the-visit", "C", C, "A patient share above the visit amount: nothing to sequester",
      ["PER_VISIT", "apply_sequestration", "patient share"],
      "A 9000 deductible on the carrying line exceeds the 8800 visit: the payer's share is floored at zero and sequestration takes nothing.",
      [line(1, "97110", ["GP"], 1, "2026-06-18", 7500, 8800, shares=(("1", 9000),), basis="paid_plus_pr"), line(2, "97112", ["GP"], 1, "2026-06-18", 7500, 0)],
      remittance="2026-07-08")

DHMO, DNONPAR = "SYNTH-MA-PLAN-D/HMO", "SYNTH-MA-PLAN-D/NONPAR"
claim("G161", "ma-contracted-worked-example", "D", DHMO, "The PRD 11 worked example under a contracted MA plan that incorporates Medicare's rules",
      ["PRD 11 worked example", "PERCENT_OF_MEDICARE", "apply_mppr", "apply_sequestration", "apply_ncci", "NCCI_PTP", "PRC-11"],
      "A contracted MA plan at 100% of the current fee schedule with every Medicare adjustment written in: the same amounts as G01. The 97530 "
      "line meets 97140 without a modifier and carries the review flag.",
      [line(1, "97110", ["GP"], 2, "2026-03-10", 12000, 4200, shares=(("2", 840),)), line(2, "97140", ["GP"], 1, "2026-03-10", 5500, 2400, shares=(("2", 480),)),
       line(3, "97530", ["GP"], 1, "2026-03-10", 7000, 2650)],
      remittance="2026-03-31")
claim("G162", "ma-contracted-59-on-97530", "D", DHMO, "The same claim with 59 on 97530: no flag, the same amounts", ["NCCI_PTP", "apply_ncci"],
      "59 on the column-2 line bypasses the indicator-1 edit; the amounts are those of G161.",
      [line(1, "97110", ["GP"], 2, "2026-03-17", 12000, 4200, shares=(("2", 840),)), line(2, "97140", ["GP"], 1, "2026-03-17", 5500, 2400, shares=(("2", 480),)),
       line(3, "97530", ["GP", "59"], 1, "2026-03-17", 7000, 2650)],
      remittance="2026-04-07")
claim("G163", "ma-contracted-evaluation-cap", "D", DHMO, "Evaluations at the qualifying factor, capped at $58.00 after sequestration",
      ["contract_adjustment", "cap", "PRC-08", "apply_mppr", "NCCI_PTP"],
      "The evaluation term names the qualifying conversion factor and caps the line at 5800. 97161 with a 2000 patient share stays above the "
      "cap after sequestration, so the cap binds; 97164 stays below it. Evaluations are not on the MPPR file, so only 97110 is ranked. The "
      "SYNTHETIC 97164/97110 edit (indicator 0) is in force in May, so 97110 carries a review flag.",
      [line(1, "97161", ["GP"], 1, "2026-05-14", 19000, 5600, shares=(("2", 2000),)), line(2, "97110", ["GP"], 1, "2026-05-14", 6000, 2100), line(3, "97164", ["GP"], 1, "2026-05-14", 12000, 4300)],
      remittance="2026-06-04")
claim("G164", "ma-contracted-indicator-0-59-does-not-bypass", "D", DHMO, "An indicator-0 edit is not bypassed by 59", ["NCCI_PTP", "apply_ncci"],
      "On June 30, the edit's last day, 97110 with 59 beside 97164 still carries the flag: indicator 0 allows no modifier.",
      [line(1, "97164", ["GP"], 1, "2026-06-30", 12000, 4300), line(2, "97110", ["GP", "59"], 1, "2026-06-30", 6000, 2100)], remittance="2026-07-21")
claim("G165", "ma-contracted-edit-after-its-end", "D", DHMO, "The day after the edit ends, the same pair raises nothing", ["NCCI_PTP", "rule windows"],
      "The SYNTHETIC 97164/97110 edit ends on June 30; on July 1 no edit is in force.",
      [line(1, "97164", ["GP"], 1, "2026-07-01", 12000, 4300), line(2, "97110", ["GP", "59"], 1, "2026-07-01", 6000, 2100)], remittance="2026-07-21")
claim("G166", "ma-contracted-facility-cq-co", "D", DHMO, "MPPR, CQ and CO at a facility under the contracted plan",
      ["apply_mppr", "apply_assistant_reduction", "facility", "PRC-02"],
      "At a facility, the units are ranked by their facility practice-expense parts; CQ and CO lines take 77% after the reduction.",
      [line(1, "97110", ["GP", "CQ"], 2, "2026-07-14", 12000, 1700, place="22"), line(2, "97112", ["GP"], 1, "2026-07-14", 6000, 1100, place="22"),
       line(3, "97530", ["GP", "CO"], 1, "2026-07-14", 7000, 1000, place="22")],
      remittance="2026-08-04")
claim("G167", "ma-contracted-mue-exceeded-not-ranked", "D", DHMO, "A line stopped for its MUE is not ranked, yet still flags its pair",
      ["MUE_EXCEEDED", "PRC-10", "apply_mppr", "NCCI_PTP"],
      "Seven units of 97140 exceed its MUE of 6: MUE_EXCEEDED, neither ranked nor reduced, so 97110's first unit is the day's highest. The 97530 "
      "line still meets the billed 97140 in column 1 of the edit and carries the review flag.",
      [line(1, "97140", ["GP"], 7, "2026-07-21", 38500, 9000), line(2, "97110", ["GP"], 2, "2026-07-21", 12000, 3700), line(3, "97530", ["GP"], 1, "2026-07-21", 7000, 2200)],
      remittance="2026-08-11")
claim("G168", "ma-contracted-undefined-case-rate", "D", DHMO, "An undefined case rate is UNSUPPORTED_METHOD; modalities at the MUE",
      ["UNSUPPORTED_METHOD", "NCCI_PTP", "apply_mppr"],
      "97750 is under an undefined case rate. Two units of 97026 equal its MUE; beside 97035 the indicator-9 edit flags it.",
      [line(1, "97750", ["GP"], 1, "2026-07-28", 8000, 3000), line(2, "97026", ["GP"], 2, "2026-07-28", 4000, 1100), line(3, "97035", ["GP"], 1, "2026-07-28", 2500, 1000)],
      remittance="2026-08-18")
claim("G169", "ma-noncontracted-plan-of-the-same-payer", "D", DNONPAR, "The payer's plan where the practice is not contracted prices as Original Medicare",
      ["MAP-05", "ma_noncontracted", "NCCI_PTP"],
      "The non-contracted plan of the same payer takes Original Medicare's terms (QUESTIONS Q05): the amounts of G161, with the 97530 flag.",
      [line(1, "97110", ["GP"], 2, "2026-03-10", 12000, 4200, shares=(("2", 840),)), line(2, "97140", ["GP"], 1, "2026-03-10", 5500, 2400, shares=(("2", 480),)),
       line(3, "97530", ["GP"], 1, "2026-03-10", 7000, 2650)],
      remittance="2026-03-31")
claim("G170", "ma-contracted-window-passed", "D", DHMO, "The contracted plan's 60-day window has passed", ["windows", "PRC-14", "WINDOW_PASSED"],
      "Remitted on August 1, the 60-day window ended on September 30.",
      [line(1, "97112", ["GP"], 1, "2026-07-07", 6000, 1900), line(2, "97116", ["GP"], 1, "2026-07-07", 6000, 1700)], remittance="2026-08-01")
claim("G171", "ma-contracted-patient-share-exceeds", "D", DHMO, "A patient share above a modality's amount", ["apply_sequestration", "patient share"],
      "97026's amount, 692, is below its 900 patient share: the payer's share is floored at zero and sequestration takes nothing.",
      [line(1, "97026", ["GP"], 1, "2026-08-04", 2000, 692, shares=(("1", 900),), basis="paid_plus_pr")], remittance="2026-08-25")
claim("G172", "ma-contracted-reversal", "D", DHMO, "A reversal under the contracted MA plan", ["REVERSED_CLAIM", "reversals"],
      "Status 22: REVERSED_CLAIM.",
      [line(1, "97110", ["GP"], 2, "2026-03-10", -12000, -4200, shares=(("2", -840),)), line(2, "97530", ["GP"], 1, "2026-03-10", -7000, -2650)], status="22", remittance="2026-05-05")
claim("G173", "ma-contracted-two-days-of-mppr", "D", DHMO, "Two service dates rank separately", ["apply_mppr", "MPPR"],
      "Each date's highest practice-expense unit is kept whole.",
      [line(1, "97140", ["GP"], 1, "2026-08-11", 5500, 2400), line(2, "97110", ["GP"], 1, "2026-08-11", 6000, 1600),
       line(3, "97110", ["GP"], 1, "2026-08-13", 6000, 2100), line(4, "97116", ["GP"], 1, "2026-08-13", 6000, 1400)],
      remittance="2026-09-01")

claim("G174", "ma-contracted-cap-binds-and-half-even", "D", DHMO, "The evaluation cap binds without a patient share; CQ on an evaluation lands near a cent",
      ["contract_adjustment", "cap", "apply_assistant_reduction", "HALF_EVEN_CENT", "apply_mppr"],
      "97162 at the qualifying factor is 5985.78, 5806.2066 after sequestration, capped at 5800. 97163 with CQ is 4500.0538275 after the assistant "
      "reduction and sequestration, under the cap, rounding half even to 4500. Two units of 97116 rank against each other.",
      [line(1, "97162", ["GP"], 1, "2026-08-18", 19000, 5800), line(2, "97163", ["GP", "CQ"], 1, "2026-08-18", 19000, 4400), line(3, "97116", ["GP"], 2, "2026-08-18", 12000, 3100)],
      remittance="2026-09-08")
claim("G175", "ma-contracted-secondary-claim", "D", DHMO, "A secondary claim under the contracted MA plan", ["SECONDARY_PAYER"],
      "Claim status 2: the amounts are worked through, then SECONDARY_PAYER.",
      [line(1, "97110", ["GP"], 2, "2026-08-25", 12000, 800), line(2, "97140", ["GP"], 1, "2026-08-25", 5500, 400)], status="2", remittance="2026-09-15")

EPO = "SYNTH-PAYER-E/PLAN-EPO"
claim("G181", "locked-2025-mppr-and-contract-percent", "E", EPO, "Locked to the 2025 fee schedule at 115%, the reduction on, then the contract's 97.5%",
      ["PRC-04", "PERCENT_OF_MEDICARE", "LOCKED:2025", "apply_mppr", "contract_adjustment", "percent"],
      "Version 2 of the contract prices January to March from the SYNTHETIC 2025 values at 115%, ranks the day's units, and pays 97.5% of the "
      "result. Its other flags are off.",
      [line(1, "97110", ["GP"], 2, "2026-02-10", 12000, 4100), line(2, "97112", ["GP"], 1, "2026-02-10", 6000, 2150), line(3, "97140", ["GP"], 1, "2026-02-10", 6000, 2600)],
      remittance="2026-02-27")
claim("G182", "fixed-evaluation-flags-off", "E", EPO, "A fixed evaluation amount with every flag off", ["FIXED_SCHEDULE", "flags off", "apply_ncci off"],
      "The evaluation term has every flag off: CQ is ignored, NCCI is not checked (two units of 97162 would exceed its MUE), and the rounding "
      "falls to the practice default.",
      [line(1, "97161", ["GP", "CQ"], 1, "2026-02-17", 15000, 7400), line(2, "97162", ["GP"], 2, "2026-02-17", 30000, 7400)], remittance="2026-03-06")
claim("G183", "version-gap-in-april", "E", EPO, "The April gap between versions", ["DATE_OUTSIDE_VERSIONS", "PRC-12", "versions"],
      "Version 2 ends on March 31 and version 3 starts on May 1: the April line is outside every signed-off version.",
      [line(1, "97110", ["GP"], 1, "2026-03-31", 6000, 2400), line(2, "97110", ["GP"], 1, "2026-04-15", 6000, 2400), line(3, "97110", ["GP"], 1, "2026-05-01", 6000, 2400)],
      remittance="2026-05-22")
claim("G184", "current-qualifying-every-flag", "E", EPO, "Version 3: 120% of the current year at the qualifying factor with every flag on, truncated",
      ["PERCENT_OF_MEDICARE", "PRC-08", "apply_mppr", "apply_assistant_reduction", "apply_sequestration", "apply_ncci", "NCCI_PTP", "TRUNCATE"],
      "A commercial contract that writes in Medicare's adjustments: the reduction, CQ at 77%, sequestration on the payer's share, and the NCCI "
      "edits (97530 beside 97140 carries the flag).",
      [line(1, "97110", ["GP", "CQ"], 1, "2026-06-09", 6000, 1800), line(2, "97530", ["GP"], 2, "2026-06-09", 14000, 5000, shares=(("2", 1000),)), line(3, "97140", ["GP"], 1, "2026-06-09", 6000, 2400)],
      remittance="2026-06-30")
claim("G185", "fixed-97116-capped-beside-reduced-lines", "E", EPO, "A fixed 97116 capped at $60.00 a line beside lines the reduction ranks",
      ["FIXED_SCHEDULE", "contract_adjustment", "cap", "apply_mppr"],
      "Three units of 97116 at 2500 are 7500, capped at 6000; two units with CQ are 3850, under the cap. The fixed term has apply_mppr off, so "
      "its units are not ranked; 97110 is ranked alone and kept whole.",
      [line(1, "97116", ["GP"], 3, "2026-06-16", 9000, 6000), line(2, "97116", ["GP", "CQ"], 2, "2026-06-16", 6000, 3850), line(3, "97110", ["GP"], 1, "2026-06-16", 6000, 2500)],
      remittance="2026-07-07")
claim("G186", "lesser-of-fixed-evaluations", "E", EPO, "Evaluations under the lesser of the charge and a fixed amount", ["LESSER_OF", "PRC-06"],
      "97162's 7000 charge is below the 7600 schedule, so the charge wins; 97164's charge is above it.",
      [line(1, "97162", ["GP"], 1, "2026-06-23", 7000, 7000), line(2, "97164", ["GP"], 1, "2026-06-23", 9000, 7600)], remittance="2026-07-14")
claim("G187", "no-fee-schedule-values", "E", EPO, "No fee-schedule value: 97750 in version 3, 97026 locked to 2025 in version 2",
      ["NO_PFS_VALUE", "LOCKED:2025"],
      "97750 has no SYNTHETIC value in any year; 97026 has a 2026 value but none in 2025, the year version 2 locks.",
      [line(1, "97026", ["GP"], 1, "2026-03-03", 3000, 600), line(2, "97035", ["GP"], 1, "2026-03-03", 3000, 900), line(3, "97750", ["GP"], 1, "2026-07-07", 8000, 4000)],
      remittance="2026-07-28")
claim("G188", "superseded-version-in-2025", "E", EPO, "A 2025 line under a superseded version", ["DATE_OUTSIDE_VERSIONS", "CON-07", "superseded"],
      "The mapping covers 2025, but the contract's only version for 2025 is superseded: never priced (QUESTIONS Q03).",
      [line(1, "97110", ["GP"], 1, "2025-11-03", 6000, 2300), line(2, "97140", ["GP"], 1, "2025-11-03", 6000, 2600)], remittance="2025-11-24")
claim("G189", "plan-leaves-the-network", "E", EPO, "The plan leaves the network on September 1", ["NO_AGREEMENT", "MAP-03", "mappings"],
      "August 31 prices under version 3; from September 1 the plan is mapped no_agreement.",
      [line(1, "97112", ["GP"], 1, "2026-08-31", 6000, 2300), line(2, "97112", ["GP"], 1, "2026-09-01", 6000, 2300)], remittance="2026-09-22")
claim("G190", "secondary-forwarded-tertiary", "E", EPO, "Processed as tertiary and forwarded (status 21)", ["SECONDARY_PAYER", "claim status 21"],
      "Status 21 is SECONDARY_PAYER.",
      [line(1, "97110", ["GP"], 1, "2026-06-02", 6000, 300)], status="21", remittance="2026-06-23")
claim("G191", "reversal-of-a-locked-year-claim", "E", EPO, "A reversal of a claim locked to 2025", ["REVERSED_CLAIM", "reversals", "LOCKED:2025"],
      "Status 22 under version 2: the amount is worked through, then REVERSED_CLAIM.",
      [line(1, "97110", ["GP"], 2, "2026-02-10", -12000, -4100), line(2, "97140", ["GP"], 1, "2026-02-10", -6000, -2600)], status="22", remittance="2026-03-17")
claim("G192", "locked-2025-modality-and-half-even", "E", EPO, "A modality locked to 2025, reduced and paid at 97.5%, rounded half even",
      ["LOCKED:2025", "apply_mppr", "HALF_EVEN_CENT", "contract_adjustment"],
      "97035 and 97110 on one day under version 2: the units ranked across the two terms that have the reduction on, then 97.5%.",
      [line(1, "97035", ["GP"], 2, "2026-03-24", 5000, 1900), line(2, "97110", ["GP"], 1, "2026-03-24", 6000, 2400)], remittance="2026-04-14")
claim("G193", "current-qualifying-overpaid-and-ncci-mue", "E", EPO, "Version 3: an overpaid line and an MUE stop under a commercial contract",
      ["PRC-15", "MUE_EXCEEDED", "apply_ncci"],
      "Six units of 97530 exceed its MUE of 5 and stop for review; the 97112 line is paid above its expected amount, a negative variance.",
      [line(1, "97530", ["GP"], 6, "2026-08-25", 42000, 15000), line(2, "97112", ["GP"], 1, "2026-08-25", 6000, 3000)], remittance="2026-09-15")
claim("G194", "lesser-of-evaluation-mue", "E", EPO, "An evaluation above its MUE under the lesser-of term, beside one priced by its charge",
      ["MUE_EXCEEDED", "LESSER_OF", "PRC-10"],
      "Two units of 97163 exceed its SYNTHETIC MUE of 1 under a term with NCCI on: MUE_EXCEEDED. 97161's 6900 charge is below the 7600 schedule.",
      [line(1, "97163", ["GP"], 2, "2026-08-27", 19000, 7600), line(2, "97161", ["GP"], 1, "2026-08-27", 6900, 6900), line(3, "97110", ["GP"], 1, "2026-08-27", 6000, 2470)],
      remittance="2026-09-15")
claim("G195", "current-qualifying-co-truncated", "E", EPO, "CO under version 3, truncated", ["apply_assistant_reduction", "TRUNCATE", "PRC-02"],
      "97112 with CO is reduced by the assistant percentage after the reduction ranks it below 97140's whole unit; truncation drops the fraction.",
      [line(1, "97140", ["GP"], 1, "2026-07-14", 6000, 2875), line(2, "97112", ["GP", "CO"], 1, "2026-07-14", 6000, 1300)], remittance="2026-08-04")


# ---------------------------------------------------------------------------------------------
# Files


def case_inputs(spec):
    payer = PAYERS[spec["payer"]]
    return {
        "release": release(payer.release),
        "as_of": AS_OF,
        "practice_settings": {**PRACTICE, "default_rounding": spec["default_rounding"]},
        "place_of_service_settings": dict(PLACES),
        "claim": {
            "claim_id": f"SYNTH-CLAIM-{spec['id']}",
            "claim_status_code": spec["status"],
            "reversed": spec["reversed"],
            "corrected": False,
            "remittance_date": spec["remittance"],
            "payer_plan_key": spec["plan"],
            "lines": spec["lines"],
        },
        "mappings": payer.plans[spec["plan"]],
        "contract_versions": payer.contract_versions,
    }


def case_path(spec):
    return gw.GOLDEN_DIR / f"{spec['id']}-{spec['slug']}.json"


def built(spec, previous=None):
    case = {
        "format": gw.FORMAT, "id": spec["id"], "title": spec["title"], "covers": spec["covers"], "notes": spec["notes"],
        "inputs": json.loads(json.dumps(case_inputs(spec))), "expected": None, "worksheet": None, "provenance": None,
    }
    if previous is not None and all(previous.get(key) == case[key] for key in ("title", "covers", "notes", "inputs")):
        return previous
    return case


def command_check():
    problems = []
    for spec in CLAIMS:
        path = case_path(spec)
        if not path.is_file():
            problems.append(f"{gw.relative(path)}: missing")
            continue
        committed = json.loads(path.read_text(encoding="utf-8"))
        for key in ("format", "id", "title", "covers", "notes", "inputs"):
            if committed.get(key) != built(spec)[key]:
                problems.append(f"{gw.relative(path)}: {key} differs from tools/golden-worksheet/fixture_payers.py")
    for problem in problems:
        sys.stdout.write(problem + "\n")
    sys.stdout.write(f"fixture payers: {len(PAYERS)} payer(s), {len(CLAIMS)} claim(s), {sum(len(spec['lines']) for spec in CLAIMS)} line(s), {len(problems)} problem(s).\n")
    return 1 if problems else 0


def command_inputs():
    status = 0
    for spec in CLAIMS:
        path = case_path(spec)
        previous = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
        case = built(spec, previous)
        if case is previous:
            continue
        if previous is not None and (previous.get("provenance") or {}).get("specialist_verified"):
            sys.stderr.write(f"{gw.relative(path)}: verified by the specialist; its inputs change only by hand, with the specialist\n")
            status = 1
            continue
        path.write_text(gw.serialize(case), encoding="utf-8")
        sys.stdout.write(f"{gw.relative(path)}: inputs written; run golden_worksheet.py write\n")
    return status


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    if arguments == ["check"]:
        return command_check()
    if arguments == ["inputs"]:
        return command_inputs()
    sys.stderr.write("usage: fixture_payers.py check | inputs\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
