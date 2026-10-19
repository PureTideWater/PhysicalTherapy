#!/usr/bin/env python3
"""The independent worksheet behind the synthetic end-to-end audit (milestone 6; PRD sections 4 and 12).

From a synthetic audit's declarative inputs (fixtures/synthetic/audit/<id>/inputs.json,
tp-audit-inputs/1) this program works out, by the rules of PRD section 12 as written, what the audit
report must say: every line's expected allowed amount under its plan's fixed schedule, its variance
and dispute window; the anomaly cohorts of the lines that cannot be priced (same payer and plan, code
and modifier set, place of service and quarter, at least the minimum cohort; the mode per unit; the
lines short of the mode by more than the threshold; an investigatory range); the judgement from
validated to actionable on the triage date (per-line materiality, the window open on that date, and its
deadline verified: a contract line's only when its contract states where its dispute window is written,
the page and its words, which the specialist cites and verifies, reconciliation-001 D17 a, and only when
the rule those words state is the one the product computes, calendar days after the remittance date: a
window counted another way stays unverified until the engine computes it, best-option audit #5);
cases by payer pattern at or above the case materiality; the pursuit-cost estimate from the
practice's settings; and the headline of three numbers with flagged and validated below.

It shares no code with the application: it is Python, standard library only, run with `python3 -I`,
and it reads the inputs file only (never the 835 that packages/synth builds from it, nor anything the
application wrote). Amounts are integer cents; the one rounding (a mode per unit times the units) is
half up.

    python3 -I tools/audit-worksheet/audit_worksheet.py write [DIR...]
    python3 -I tools/audit-worksheet/audit_worksheet.py check [DIR...]

`write` writes expected-report.json and expected-lines.csv beside each inputs.json (default: every
directory under fixtures/synthetic/audit); `check` recomputes them and exits 1 on any difference,
writing nothing. The line CSV has the application's columns; the opaque references a person cannot
predict are written as markers (case_ref "case" for a line in a case, anomaly_ref "anomaly" for a
flagged line, line_ref empty), and the test compares the application's CSV with them replaced alike.
"""

import argparse
import datetime
import json
import sys
from collections import Counter, OrderedDict
from pathlib import Path

INPUTS_FORMAT = "tp-audit-inputs/1"
REPORT_FORMAT = "tp-audit-expected/1"
REPOSITORY = Path(__file__).resolve().parents[2]
AUDIT_ROOT = REPOSITORY / "fixtures" / "synthetic" / "audit"

COLUMNS = [
    "payer", "plan", "payer_claim_control_number", "line_no", "service_date", "procedure_code", "modifiers", "units",
    "billed", "observed_allowed", "expected_allowed", "variance", "validated", "visit_variance", "unpriced_reason",
    "window_ends_on", "stage", "counted_as", "reasons", "review_flags", "behavior", "case_ref", "anomaly_ref", "line_ref",
]
# Figures (counts and dollars from cents) are written as they are; every other column is text.
NUMBER_COLUMNS = {"line_no", "units", "billed", "observed_allowed", "expected_allowed", "variance", "validated", "visit_variance"}

# The rules this worksheet applies, from PRD section 12 and the plan's contracts as the inputs state them.
MODIFIERS = ["GP"]
PLACE_OF_SERVICE = "11"
BEHAVIOR = "BELOW_CONTRACT_RATE"  # a fixed schedule paid below its amount: no other behavior applies
NOT_ACTIONABLE_ORDER = [
    "BELOW_LINE_MATERIALITY", "WINDOW_PASSED", "NO_WINDOW", "DEADLINE_UNVERIFIED", "CLAIM_REVERSED", "CLAIM_SUPERSEDED", "VERSION_NOT_SIGNED_OFF",
    "VERSION_NOT_IN_FORCE", "RELEASE_WITHDRAWN", "BELOW_CASE_MATERIALITY",
]
# A contract window's evidence names its unit and what it counts from, from these lists (best-option audit #5);
# the product computes one rule, its days as calendar days after the remittance date (BPR16).
WINDOW_UNITS = ["calendar_days", "business_days", "months"]
WINDOW_STARTS = ["date_of_service", "remittance_date", "payment_date", "receipt_date"]
COMPUTED_WINDOW_RULE = ("calendar_days", "remittance_date")


class InputsError(Exception):
    pass


def day(text):
    return datetime.date.fromisoformat(text)


def dollars(cents):
    sign = "-" if cents < 0 else ""
    whole, part = divmod(abs(cents), 100)
    return f"{sign}{whole}.{part:02d}"


def half_up(numerator, denominator):
    """numerator / denominator rounded to an integer, halves away from zero (both positive here)."""
    if numerator < 0 or denominator <= 0:
        raise InputsError("only positive amounts are divided")
    whole, rest = divmod(numerator, denominator)
    return whole + (1 if 2 * rest >= denominator else 0)


def quarter(date):
    return f"{date.year}-Q{(date.month - 1) // 3 + 1}"


def csv_field(value):
    """A text field: a leading formula character (= + - @ tab CR) is defused with an apostrophe, then quoted as CSV needs."""
    safe = "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value
    if any(ch in safe for ch in '",\r\n'):
        return '"' + safe.replace('"', '""') + '"'
    return safe


def csv_row(row):
    return ",".join(value if column in NUMBER_COLUMNS else csv_field(value) for column, value in zip(COLUMNS, row))


def read_inputs(directory):
    inputs = json.loads((directory / "inputs.json").read_text(encoding="utf-8"))
    if inputs.get("format") != INPUTS_FORMAT or inputs.get("synthetic") is not True:
        raise InputsError(f"{directory}: not synthetic {INPUTS_FORMAT}")
    return inputs


def window_verified(plan):
    """Whether a contract plan's dispute window is verified: cited, with the rule the product computes."""
    evidence = plan["contract"].get("dispute_window_evidence")
    if evidence is None:
        return False
    unit, start = evidence.get("unit"), evidence.get("measured_from")
    if unit not in WINDOW_UNITS or start not in WINDOW_STARTS:
        raise InputsError(f"plan {plan['key']}: the window's evidence names its unit ({', '.join(WINDOW_UNITS)}) and what it counts from ({', '.join(WINDOW_STARTS)})")
    return (unit, start) == COMPUTED_WINDOW_RULE


def expand_lines(inputs):
    """One line per claim, numbered in the groups' order; dates from each group's first, modulo 20 days."""
    key = inputs["id"].replace("-", "").replace("AUDIT", "AUD")
    lines = []
    for group in inputs["groups"]:
        first = day(group["first_service_date"])
        for index in range(group["count"]):
            lines.append({
                "claim": f"SYNCCN{key}{len(lines) + 1:04d}",
                "plan": group["plan"],
                "code": group["code"],
                "units": group["units"],
                "charge": int(group["unit_charge_cents"]) * group["units"],
                "allowed": int(group["allowed_cents"]),
                "date": first + datetime.timedelta(days=index % 20),
            })
    return lines


def compute(inputs):
    settings = inputs["practice"]["settings"]
    line_materiality = int(settings["line_materiality_cents"])
    case_materiality = int(settings["case_materiality_cents"])
    minimum = int(settings["anomaly_minimum_cohort"])
    threshold = int(settings["anomaly_threshold_cents"])
    judged_on = day(inputs["judged_on"])
    paid_on = day(inputs["remittance"]["payment_date"])
    payer = inputs["payer"]["name"]
    plans = {plan["key"]: plan for plan in inputs["plans"]}
    stable_from, stable_to = day(inputs["stable"]["from"]), day(inputs["stable"]["to"])

    lines = expand_lines(inputs)
    for line in lines:
        plan = plans[line["plan"]]
        line["plan_name"] = "CE:" + line["plan"]
        line["expected"] = None
        line["variance"] = None
        line["unpriced"] = None
        line["window"] = None
        if plan["mapping"] == "no_agreement":
            line["unpriced"] = "NO_AGREEMENT"
            continue
        rates = {rate["code"]: int(rate["amount_cents"]) for rate in plan["contract"]["schedule"]}
        if line["code"] not in rates:
            raise InputsError(f"{line['claim']}: the scenario prices every contract line")
        line["expected"] = rates[line["code"]] * line["units"]
        line["variance"] = line["expected"] - line["allowed"]
        line["window"] = paid_on + datetime.timedelta(days=plan["contract"]["dispute_window_days"])
        # A contract window is a verified deadline only when the contract says where it is written (D17 a), and
        # its words state the rule the product computes (best-option audit #5).
        line["deadline_verified"] = window_verified(plan)
        # The report must not depend on the triage date within the stable range.
        if stable_from <= line["window"] < stable_to:
            raise InputsError(f"{line['claim']}: its window ends inside the stable range")

    # Anomaly cohorts of the lines that cannot be priced.
    cohorts = OrderedDict()
    for line in lines:
        if line["unpriced"] is None:
            continue
        cohort = (payer, line["plan_name"], line["code"], tuple(sorted(MODIFIERS)), PLACE_OF_SERVICE, quarter(line["date"]))
        cohorts.setdefault(cohort, []).append(line)
    anomalies = []
    for cohort, members in cohorts.items():
        if len(members) < minimum:
            continue
        per_unit = Counter(half_up(member["allowed"], member["units"]) for member in members)
        top = max(per_unit.values())
        mode = min(amount for amount, count in per_unit.items() if count == top)
        flagged = []
        for member in members:
            gap = half_up(mode * member["units"], 1) - member["allowed"]
            if gap > threshold:
                flagged.append((member, gap))
        if not flagged:
            continue
        for member, _ in flagged:
            member["flagged"] = True
        anomalies.append(OrderedDict([
            ("label", "investigatory"),
            ("payer", cohort[0]),
            ("plan", cohort[1]),
            ("procedure_code", cohort[2]),
            ("modifiers", list(cohort[3])),
            ("place_of_service", cohort[4]),
            ("quarter", cohort[5]),
            ("cohort_size", len(members)),
            ("modal_allowed_cents", str(mode)),
            ("flagged_lines", len(flagged)),
            ("range_low_cents", str(sum(gap - threshold for _, gap in flagged))),
            ("range_high_cents", str(sum(gap for _, gap in flagged))),
        ]))

    # Validated to actionable on the triage date, then cases by payer pattern.
    patterns = OrderedDict()
    for line in lines:
        line["reasons"] = []
        if line["variance"] is None or line["variance"] <= 0:
            continue
        if line["variance"] < line_materiality:
            line["reasons"].append("BELOW_LINE_MATERIALITY")
        if line["window"] < judged_on:
            line["reasons"].append("WINDOW_PASSED")
        if not line["deadline_verified"]:
            line["reasons"].append("DEADLINE_UNVERIFIED")
        # One rate record per code under a fixed schedule: the pattern is the plan and the code.
        patterns.setdefault((line["plan_name"], line["code"]), []).append(line)
    cases = []
    for (plan_name, code), members in patterns.items():
        actionable = [member for member in members if not member["reasons"]]
        total = sum(member["variance"] for member in actionable)
        in_case = total >= case_materiality and len(actionable) > 0
        for member in actionable:
            member["in_case"] = in_case
            if not in_case:
                member["reasons"] = ["BELOW_CASE_MATERIALITY"]
        if in_case:
            cases.append({"plan": plan_name, "code": code, "lines": actionable})

    pursuit_rate = settings.get("staff_rate_cents_per_hour")
    pursuit = None
    if pursuit_rate is not None:
        minutes = int(settings["minutes_per_packet"]) + int(settings["minutes_per_follow_up"])
        pursuit = half_up(int(pursuit_rate) * minutes, 60)

    rows = []
    for line in sorted(lines, key=lambda item: (payer, item["plan_name"], item["claim"])):
        if line["unpriced"] is not None:
            counted, stage = "unpriced", "flagged" if line.get("flagged") else ""
        elif line["variance"] < 0:
            counted, stage = "overpaid", ""
        elif line["variance"] == 0:
            counted, stage = "paid_as_expected", ""
        elif line.get("in_case"):
            counted, stage = "actionable", "actionable"
        elif line["reasons"] == ["BELOW_CASE_MATERIALITY"]:
            counted, stage = "held", "validated"
        else:
            counted, stage = "not_actionable", "validated"
        rows.append([
            payer,
            line["plan_name"],
            line["claim"],
            "1",
            line["date"].isoformat(),
            line["code"],
            " ".join(MODIFIERS),
            str(line["units"]),
            dollars(line["charge"]),
            dollars(line["allowed"]),
            "" if line["expected"] is None else dollars(line["expected"]),
            "" if line["variance"] is None else dollars(line["variance"]),
            # A fixed schedule's line validates its own shortfall; no line here is per visit.
            dollars(line["variance"]) if line["variance"] is not None and line["variance"] > 0 else "",
            "",
            line["unpriced"] or "",
            "" if line["window"] is None else line["window"].isoformat(),
            stage,
            counted,
            " ".join(line["reasons"]) if counted in ("not_actionable", "held") else "",
            # The scenario's contracts leave NCCI off: no line carries a review flag.
            "",
            BEHAVIOR if line["variance"] is not None and line["variance"] > 0 else "",
            "case" if line.get("in_case") else "",
            "anomaly" if line.get("flagged") else "",
            "",
        ])
    csv = "\r\n".join([",".join(COLUMNS)] + [csv_row(row) for row in rows]) + "\r\n"

    validated = [line for line in lines if line["variance"] is not None and line["variance"] > 0]
    unpriced = [line for line in lines if line["unpriced"] is not None]
    reasons = OrderedDict()
    for line in unpriced:
        entry = reasons.setdefault(line["unpriced"], {"reason": line["unpriced"], "lines": 0, "charge_cents": 0})
        entry["lines"] += 1
        entry["charge_cents"] += line["charge"]
    not_actionable = []
    for reason in NOT_ACTIONABLE_ORDER:
        matching = [line for line in validated if reason in line["reasons"]]
        if matching:
            not_actionable.append({"reason": reason, "lines": len(matching), "variance_cents": str(sum(line["variance"] for line in matching))})
    report_cases = []
    for item in cases:
        actionable_cents = sum(line["variance"] for line in item["lines"])
        report_cases.append(OrderedDict([
            ("payer", payer),
            ("plan", item["plan"]),
            ("procedure_code", item["code"]),
            ("behavior", BEHAVIOR),
            ("state", "open"),
            ("deadline_on", min(line["window"] for line in item["lines"]).isoformat()),
            ("lines", len(item["lines"])),
            ("actionable_cents", str(actionable_cents)),
            ("pursuit_cost_cents", None if pursuit is None else str(pursuit)),
            ("net_expected_cents", None if pursuit is None else str(actionable_cents - pursuit)),
        ]))
    actionable_total = sum(int(item["actionable_cents"]) for item in report_cases)
    pattern_rows = [
        OrderedDict([("plan", plan_name), ("procedure_code", code), ("behavior", BEHAVIOR), ("lines", len(members)), ("variance_cents", str(sum(m["variance"] for m in members)))])
        for (plan_name, code), members in patterns.items()
    ]
    overpaid = [line for line in lines if line["variance"] is not None and line["variance"] < 0]
    gaps = [{"kind": "unpriced", "reason": entry["reason"], "lines": entry["lines"], "charge_cents": str(entry["charge_cents"])} for entry in reasons.values()]
    unverified = [line for line in validated if "DEADLINE_UNVERIFIED" in line["reasons"]]
    if unverified:
        gaps.append({"kind": "deadline_unverified", "reason": "DEADLINE_UNVERIFIED", "lines": len(unverified), "charge_cents": str(sum(line["charge"] for line in unverified))})
    if pursuit is None:
        gaps.append({"kind": "pursuit_settings", "reason": None, "lines": 0, "charge_cents": None})
    report = OrderedDict([
        ("format", REPORT_FORMAT),
        ("computed_by", "independent worksheet tools/audit-worksheet"),
        ("id", inputs["id"]),
        ("judged_on", inputs["judged_on"]),
        ("stable", {"from": inputs["stable"]["from"], "to": inputs["stable"]["to"]}),
        ("headline", OrderedDict([
            ("actionable_cents", str(actionable_total)),
            ("actionable_lines", sum(item["lines"] for item in report_cases)),
            ("payer_approved_cents", "0"),
            ("recovered_cents", "0"),
            ("flagged_lines", sum(item["flagged_lines"] for item in anomalies)),
            ("flagged_range_low_cents", str(sum(int(item["range_low_cents"]) for item in anomalies))),
            ("flagged_range_high_cents", str(sum(int(item["range_high_cents"]) for item in anomalies))),
            ("validated_lines", len(validated)),
            ("validated_cents", str(sum(line["variance"] for line in validated))),
        ])),
        ("coverage", OrderedDict([
            ("lines", len(lines)),
            ("charge_cents", str(sum(line["charge"] for line in lines))),
            ("priced_lines", len(lines) - len(unpriced)),
            ("priced_charge_cents", str(sum(line["charge"] for line in lines if line["unpriced"] is None))),
            ("reasons", [{"reason": entry["reason"], "lines": entry["lines"], "charge_cents": str(entry["charge_cents"])} for entry in reasons.values()]),
        ])),
        ("anomalies", anomalies),
        ("validated", OrderedDict([
            ("lines", len(validated)),
            ("variance_cents", str(sum(line["variance"] for line in validated))),
            ("patterns", pattern_rows),
            ("not_actionable", not_actionable),
        ])),
        ("overpaid", {"lines": len(overpaid), "variance_cents": str(sum(line["variance"] for line in overpaid))}),
        ("cases", report_cases),
        ("pursuit", OrderedDict([
            ("estimated", pursuit is not None and len(report_cases) > 0),
            ("cost_cents", None if pursuit is None or not report_cases else str(pursuit * len(report_cases))),
            ("net_expected_cents", None if pursuit is None or not report_cases else str(actionable_total - pursuit * len(report_cases))),
        ])),
        ("evidence_gaps", gaps),
    ])
    return json.dumps(report, indent=2) + "\n", csv


def directories(names):
    if names:
        return [Path(name).resolve() for name in names]
    return sorted(path.parent for path in AUDIT_ROOT.glob("*/inputs.json"))


def main(argv):
    parser = argparse.ArgumentParser(description="The independent worksheet of the synthetic audits.")
    parser.add_argument("command", choices=["write", "check"])
    parser.add_argument("dirs", nargs="*")
    args = parser.parse_args(argv)
    differs = 0
    for directory in directories(args.dirs):
        report, csv = compute(read_inputs(directory))
        for name, content in (("expected-report.json", report), ("expected-lines.csv", csv)):
            target = directory / name
            if args.command == "write":
                with open(target, "w", encoding="utf-8", newline="") as handle:
                    handle.write(content)
                print(f"wrote {shown(target)}")
            elif not target.exists() or read_exact(target) != content:
                differs += 1
                print(f"differs: {shown(target)}")
    return 1 if differs else 0


def shown(path: Path) -> str:
    """A path as the repository names it, or as it is when it lies outside (a scratch copy of the inputs)."""
    return str(path.relative_to(REPOSITORY)) if path.is_relative_to(REPOSITORY) else str(path)


def read_exact(path: Path) -> str:
    """The file's text with its line endings as written. Path.read_text takes newline= only from Python
    3.13, and CI runs 3.12."""
    with open(path, encoding="utf-8", newline="") as handle:
        return handle.read()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
