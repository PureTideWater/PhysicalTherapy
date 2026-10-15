#!/usr/bin/env python3
"""The independent pricing worksheet behind the golden lines (PRD sections 11, 17 and 18).

From a golden claim file's inputs and the rule release it names, this program computes every line's
expected allowed amount by the algorithm of PRD section 11, in its order: resolve the agreement,
compute the base amount by method, apply units, apply the flagged adjustments (multiple procedure
reduction, assistant reduction, sequestration), report the patient share and stop secondary and
reversed claims, and round once at the end under the record's rule, keeping the unrounded value.
It writes a human-readable worksheet per claim: every input value, every intermediate amount, each
adjustment's before and after, and the rounding.

It shares no code with packages/pricing: it is Python, standard library only, run with `python3 -I`.
Every operation runs in a decimal context that traps any inexact result or rounding, so a figure is
exact to its last digit and the only rounding anywhere is the final one of each line.

    python3 -I tools/golden-worksheet/golden_worksheet.py check [--json] [FILE...]
    python3 -I tools/golden-worksheet/golden_worksheet.py write [FILE...]
    python3 -I tools/golden-worksheet/golden_worksheet.py show FILE

`check` recomputes every golden file (default: fixtures/golden/claims/*.json) and exits 1 on any
difference; it never writes. `write` is the human step that fills in a case's computed sections (the
expected results, the worksheet, and the .worksheet.md beside it); it refuses to change a case a
specialist has verified. This program is not a reimbursement specialist: every case it writes says
specialist_verified false until the specialist has checked the worksheet.
"""

import argparse
import decimal
import hashlib
import json
import re
import sys
from decimal import ROUND_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal
from pathlib import Path

FORMAT = "tp-golden-claim/1"
COMPUTED_BY = "independent worksheet tools/golden-worksheet"
REPOSITORY = Path(__file__).resolve().parents[2]
GOLDEN_DIR = REPOSITORY / "fixtures" / "golden" / "claims"

# Exact arithmetic: any operation whose result would need rounding raises instead.
EXACT = decimal.Context(
    prec=400,
    rounding=ROUND_HALF_EVEN,
    Emax=999999,
    Emin=-999999,
    traps=[decimal.Inexact, decimal.Rounded, decimal.InvalidOperation, decimal.DivisionByZero, decimal.Overflow],
)
decimal.setcontext(EXACT)

ROUNDING_RULES = {"HALF_UP_CENT": ROUND_HALF_UP, "HALF_EVEN_CENT": ROUND_HALF_EVEN, "TRUNCATE": ROUND_DOWN}
ROUNDING_WORDS = {
    "HALF_UP_CENT": "halves move away from zero",
    "HALF_EVEN_CENT": "halves move to the even cent",
    "TRUNCATE": "fractions of a cent are dropped toward zero",
}
DEFAULT_ROUNDING = "HALF_UP_CENT"
MAPPING_KINDS = ("contract", "no_agreement", "ma_noncontracted", "government", "other")
NO_AGREEMENT_KINDS = ("no_agreement", "government", "other")
VERSION_STATUSES = ("draft", "proposed", "approved", "signed_off", "superseded")
PHASE_ONE_METHODS = ("PERCENT_OF_MEDICARE", "UNSUPPORTED")
LATER_METHODS = ("FIXED_SCHEDULE", "LESSER_OF", "PER_VISIT")
TIMED_UNITS_RULES = ("MEDICARE_POOLED", "PER_CODE")
CONVERSION_FACTORS = ("non_qualifying_apm", "qualifying_apm")
SETTINGS = ("facility", "non_facility")
OBSERVED_BASES = ("amt_b6", "paid_plus_pr")
# Claim statuses as PRD section 2 names them: 1 primary, 2 secondary, 3 tertiary, 4 denied, 22 reversal.
CLAIM_STATUSES = {"1": "processed as primary", "2": "processed as secondary", "3": "processed as tertiary", "4": "denied", "22": "reversal of a prior payment"}
SECONDARY_STATUSES = ("2", "3")
REVERSAL_STATUS = "22"
ASSISTANT_MODIFIERS = ("CQ", "CO")
FLAG_NAMES = ("apply_mppr", "apply_assistant_reduction", "apply_sequestration", "apply_ncci")
ADJUSTMENT_OF_FLAG = {"apply_mppr": "mppr", "apply_assistant_reduction": "assistant_reduction", "apply_sequestration": "sequestration"}
UNPRICED_REASONS = (
    "NO_AGREEMENT", "NO_MAPPING", "AMBIGUOUS_RATE", "NO_RATE_FOR_CODE", "NO_PFS_VALUE", "UNSUPPORTED_METHOD",
    "SECONDARY_PAYER", "MUE_EXCEEDED", "UNITS_RULE_UNKNOWN", "DATE_OUTSIDE_VERSIONS", "REVERSED_CLAIM", "ENGINE_ERROR",
)

HUNDRED = Decimal(100)
ZERO = Decimal(0)


class InputError(Exception):
    """A golden case's inputs, or the release they name, cannot produce a golden line."""


# ---------------------------------------------------------------------------------------------
# Decimal text


DECIMAL_TEXT = re.compile(r"^-?\d+(?:\.\d+)?$")
CENTS_TEXT = re.compile(r"^(?:0|-?[1-9]\d*)$")
DATE_TEXT = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def number(text, where):
    if not isinstance(text, str) or not DECIMAL_TEXT.match(text):
        raise InputError(f"{where}: must be a decimal string such as \"0.45\", not {json.dumps(text)}")
    return Decimal(text)


def fmt(value):
    """A decimal as plain text with no exponent and no trailing zeros after the point."""
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def dollars(cents):
    """Cents as dollars with at least two decimals ($6.20, $31.448)."""
    whole, _, fraction = fmt(cents / HUNDRED).partition(".")
    return f"${whole}.{fraction.ljust(2, '0')}"


def money(cents):
    return f"{fmt(cents)} cents ({dollars(cents)})"


def percent_text(value):
    return f"{fmt(value)}%"


def round_once(unrounded, rule):
    """The one rounding a line takes: to whole cents under the rule, in a context that may round."""
    context = decimal.Context(prec=400, rounding=ROUNDING_RULES[rule], traps=[decimal.InvalidOperation])
    return unrounded.quantize(Decimal(1), context=context)


# ---------------------------------------------------------------------------------------------
# Input validation: every object is strict (no missing and no unknown keys), so a typo is refused.


def strict(value, where, keys):
    if not isinstance(value, dict):
        raise InputError(f"{where}: must be an object")
    missing = [key for key in keys if key not in value]
    unknown = [key for key in value if key not in keys]
    if missing:
        raise InputError(f"{where}: missing {', '.join(missing)}")
    if unknown:
        raise InputError(f"{where}: unknown key {', '.join(unknown)}")
    return value


def text(value, where, pattern=None):
    if not isinstance(value, str) or value == "":
        raise InputError(f"{where}: must be a non-empty string")
    if pattern is not None and not re.match(pattern, value):
        raise InputError(f"{where}: {json.dumps(value)} does not match {pattern}")
    return value


def choice(value, where, options):
    if value not in options:
        raise InputError(f"{where}: must be one of {', '.join(options)}, not {json.dumps(value)}")
    return value


def boolean(value, where):
    if not isinstance(value, bool):
        raise InputError(f"{where}: must be true or false")
    return value


def iso_date(value, where):
    match = DATE_TEXT.match(value) if isinstance(value, str) else None
    if match is None:
        raise InputError(f"{where}: must be a date written YYYY-MM-DD")
    year, month, day = (int(part) for part in match.groups())
    days = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if not (1 <= month <= 12 and 1 <= day <= days[month - 1]):
        raise InputError(f"{where}: {value} is not a calendar date")
    return value


def optional_date(value, where):
    return None if value is None else iso_date(value, where)


def cents(value, where):
    if not isinstance(value, str) or not CENTS_TEXT.match(value):
        raise InputError(f"{where}: must be integer cents written as a string such as \"2480\"")
    return Decimal(value)


def string_list(value, where, pattern):
    if not isinstance(value, list):
        raise InputError(f"{where}: must be a list")
    return [text(item, f"{where}[{index}]", pattern) for index, item in enumerate(value)]


def window(item, where):
    start = iso_date(item["effective_from"], f"{where}.effective_from")
    end = optional_date(item["effective_to"], f"{where}.effective_to")
    if end is not None and end < start:
        raise InputError(f"{where}.effective_to: is before effective_from")
    return start, end


def covers(start, end, date):
    return start <= date and (end is None or date <= end)


def window_text(start, end):
    return f"{start} to {end if end is not None else 'open'}"


def validate(case):
    strict(case, "(file)", ["format", "id", "title", "covers", "notes", "inputs", "expected", "worksheet", "provenance"])
    if case["format"] != FORMAT:
        raise InputError(f"format: must be {FORMAT}")
    text(case["id"], "id", r"^G\d{2,3}$")
    text(case["title"], "title")
    string_list(case["covers"], "covers", r"^\S")
    if not isinstance(case["notes"], str):
        raise InputError("notes: must be a string")
    inputs = strict(case["inputs"], "inputs", ["release", "practice_settings", "place_of_service_settings", "claim", "mappings", "contract_versions"])
    release = strict(inputs["release"], "inputs.release", ["number", "dir", "manifest_sha256"])
    if not isinstance(release["number"], int) or isinstance(release["number"], bool) or release["number"] < 1:
        raise InputError("inputs.release.number: must be a positive whole number")
    text(release["dir"], "inputs.release.dir", r"^[A-Za-z0-9._/-]+$")
    if ".." in release["dir"].split("/"):
        raise InputError("inputs.release.dir: must stay inside the repository")
    text(release["manifest_sha256"], "inputs.release.manifest_sha256", r"^[0-9a-f]{64}$")
    practice = strict(inputs["practice_settings"], "inputs.practice_settings", ["zip", "default_rounding"])
    text(practice["zip"], "inputs.practice_settings.zip", r"^\d{5}$")
    if practice["default_rounding"] is not None:
        choice(practice["default_rounding"], "inputs.practice_settings.default_rounding", tuple(ROUNDING_RULES))
    places = inputs["place_of_service_settings"]
    if not isinstance(places, dict) or not places:
        raise InputError("inputs.place_of_service_settings: must map each place of service to facility or non_facility")
    for code, setting in places.items():
        text(code, "inputs.place_of_service_settings key", r"^\d{2}$")
        choice(setting, f"inputs.place_of_service_settings.{code}", SETTINGS)
    validate_claim(inputs["claim"], places)
    validate_mappings(inputs["mappings"])
    validate_versions(inputs["contract_versions"])
    for kind, identifiers in (
        ("mapping_id", [mapping["mapping_id"] for mapping in inputs["mappings"]]),
        ("rate_record_id", [record["rate_record_id"] for version in inputs["contract_versions"] for record in version["rate_records"]]),
    ):
        repeated = sorted({identifier for identifier in identifiers if identifiers.count(identifier) > 1})
        if repeated:
            raise InputError(f"inputs: {kind} {', '.join(repeated)} appears more than once")
    by_id = {version["contract_version_id"]: version for version in inputs["contract_versions"]}
    for index, mapping in enumerate(inputs["mappings"]):
        if mapping["kind"] == "contract" and mapping["contract_version_id"] not in by_id:
            raise InputError(f"inputs.mappings[{index}].contract_version_id: names no contract version in inputs.contract_versions")
    provenance = case["provenance"]
    if provenance is not None:
        strict(provenance, "provenance", ["computed_by", "specialist_verified"])
        boolean(provenance["specialist_verified"], "provenance.specialist_verified")


def validate_claim(claim, places):
    strict(claim, "inputs.claim", ["claim_id", "claim_status_code", "reversed", "corrected", "payer_plan_key", "lines"])
    text(claim["claim_id"], "inputs.claim.claim_id", r"^SYNTH-")
    choice(claim["claim_status_code"], "inputs.claim.claim_status_code", tuple(CLAIM_STATUSES))
    boolean(claim["reversed"], "inputs.claim.reversed")
    boolean(claim["corrected"], "inputs.claim.corrected")
    if claim["reversed"] and claim["corrected"]:
        raise InputError(
            "inputs.claim: a reversed claim that a correction supersedes is not priced (its correction is); "
            "the plan has no reason for it (fixtures/golden/QUESTIONS.md), so no golden line uses it"
        )
    text(claim["payer_plan_key"], "inputs.claim.payer_plan_key", r"^SYNTH-")
    lines = claim["lines"]
    if not isinstance(lines, list) or not lines:
        raise InputError("inputs.claim.lines: must list at least one line")
    seen = set()
    for index, line in enumerate(lines):
        where = f"inputs.claim.lines[{index}]"
        strict(line, where, [
            "line_no", "procedure_code", "modifiers", "units", "service_date", "place_of_service", "charge_cents",
            "observed_allowed_cents", "observed_allowed_basis", "patient_share_adjustments",
        ])
        if not isinstance(line["line_no"], int) or isinstance(line["line_no"], bool) or line["line_no"] < 1 or line["line_no"] in seen:
            raise InputError(f"{where}.line_no: must be a distinct positive whole number")
        seen.add(line["line_no"])
        text(line["procedure_code"], f"{where}.procedure_code", r"^[0-9A-Z]{5}$")
        modifiers = string_list(line["modifiers"], f"{where}.modifiers", r"^[0-9A-Z]{2}$")
        if len(modifiers) > 4 or len(set(modifiers)) != len(modifiers):
            raise InputError(f"{where}.modifiers: at most four distinct modifiers")
        units = number(line["units"], f"{where}.units")
        if units != units.to_integral_value() or units < 1:
            raise InputError(
                f"{where}.units: phase one prices whole units of at least 1; fractional units have no rule for the "
                "multiple procedure reduction (fixtures/golden/QUESTIONS.md)"
            )
        iso_date(line["service_date"], f"{where}.service_date")
        if line["place_of_service"] not in places:
            raise InputError(f"{where}.place_of_service: {json.dumps(line['place_of_service'])} is not in inputs.place_of_service_settings")
        cents(line["charge_cents"], f"{where}.charge_cents")
        cents(line["observed_allowed_cents"], f"{where}.observed_allowed_cents")
        choice(line["observed_allowed_basis"], f"{where}.observed_allowed_basis", OBSERVED_BASES)
        if not isinstance(line["patient_share_adjustments"], list):
            raise InputError(f"{where}.patient_share_adjustments: must be a list")
        for position, adjustment in enumerate(line["patient_share_adjustments"]):
            at = f"{where}.patient_share_adjustments[{position}]"
            strict(adjustment, at, ["group_code", "reason_code", "amount_cents"])
            choice(adjustment["group_code"], f"{at}.group_code", ("PR",))
            text(adjustment["reason_code"], f"{at}.reason_code", r"^[0-9A-Z]{1,5}$")
            cents(adjustment["amount_cents"], f"{at}.amount_cents")


def validate_mappings(mappings):
    if not isinstance(mappings, list):
        raise InputError("inputs.mappings: must be a list (empty when the plan has no mapping)")
    for index, mapping in enumerate(mappings):
        where = f"inputs.mappings[{index}]"
        strict(mapping, where, ["mapping_id", "kind", "contract_version_id", "effective_from", "effective_to"])
        text(mapping["mapping_id"], f"{where}.mapping_id")
        choice(mapping["kind"], f"{where}.kind", MAPPING_KINDS)
        if (mapping["kind"] == "contract") != (mapping["contract_version_id"] is not None):
            raise InputError(f"{where}.contract_version_id: names a contract version exactly when the kind is contract")
        window(mapping, where)
    for first in range(len(mappings)):
        for second in range(first + 1, len(mappings)):
            a, b = window(mappings[first], ""), window(mappings[second], "")
            if a[0] <= (b[1] or "9999-12-31") and b[0] <= (a[1] or "9999-12-31"):
                raise InputError(f"inputs.mappings[{second}]: overlaps inputs.mappings[{first}]; a correction is a new mapping with its own window")


def validate_versions(versions):
    if not isinstance(versions, list):
        raise InputError("inputs.contract_versions: must be a list")
    seen = set()
    for index, version in enumerate(versions):
        where = f"inputs.contract_versions[{index}]"
        strict(version, where, ["contract_version_id", "contract_id", "version_no", "status", "effective_from", "effective_to", "rate_records"])
        text(version["contract_version_id"], f"{where}.contract_version_id")
        if version["contract_version_id"] in seen:
            raise InputError(f"{where}.contract_version_id: appears twice")
        seen.add(version["contract_version_id"])
        text(version["contract_id"], f"{where}.contract_id")
        if not isinstance(version["version_no"], int) or isinstance(version["version_no"], bool) or version["version_no"] < 1:
            raise InputError(f"{where}.version_no: must be a positive whole number")
        choice(version["status"], f"{where}.status", VERSION_STATUSES)
        window(version, where)
        if not isinstance(version["rate_records"], list):
            raise InputError(f"{where}.rate_records: must be a list")
        for position, record in enumerate(version["rate_records"]):
            validate_rate_record(record, f"{where}.rate_records[{position}]")
    signed = [version for version in versions if version["status"] == "signed_off"]
    for first in range(len(signed)):
        for second in range(first + 1, len(signed)):
            a, b = signed[first], signed[second]
            if a["contract_id"] == b["contract_id"] and a["effective_from"] <= (b["effective_to"] or "9999-12-31") and b["effective_from"] <= (a["effective_to"] or "9999-12-31"):
                raise InputError(f"inputs.contract_versions: signed-off versions {a['contract_version_id']} and {b['contract_version_id']} overlap; versions never overlap")


def validate_rate_record(record, where):
    strict(record, where, ["rate_record_id", "scope", "method", "parameters", "flags"])
    text(record["rate_record_id"], f"{where}.rate_record_id")
    scope = strict(record["scope"], f"{where}.scope", ["codes", "modifier_sets", "places_of_service", "effective_from", "effective_to"])
    if scope["codes"] is not None:
        string_list(scope["codes"], f"{where}.scope.codes", r"^[0-9A-Z]{5}$")
    if scope["modifier_sets"] is not None:
        if not isinstance(scope["modifier_sets"], list):
            raise InputError(f"{where}.scope.modifier_sets: must be null or a list of modifier lists")
        for index, modifiers in enumerate(scope["modifier_sets"]):
            string_list(modifiers, f"{where}.scope.modifier_sets[{index}]", r"^[0-9A-Z]{2}$")
    if scope["places_of_service"] is not None:
        string_list(scope["places_of_service"], f"{where}.scope.places_of_service", r"^\d{2}$")
    window(scope, f"{where}.scope")
    method = record["method"]
    if method in LATER_METHODS:
        raise InputError(f"{where}.method: {method} arrives in milestone 7; phase one has no golden line for it")
    choice(method, f"{where}.method", PHASE_ONE_METHODS)
    if method == "PERCENT_OF_MEDICARE":
        parameters = strict(record["parameters"], f"{where}.parameters", ["percentage", "year_basis", "locality_basis", "conversion_factor"])
        percentage = number(parameters["percentage"], f"{where}.parameters.percentage")
        if percentage <= 0:
            raise InputError(f"{where}.parameters.percentage: must be above zero")
        text(parameters["year_basis"], f"{where}.parameters.year_basis", r"^(?:CURRENT|LOCKED:\d{4})$")
        choice(parameters["locality_basis"], f"{where}.parameters.locality_basis", ("practice",))
        choice(parameters["conversion_factor"], f"{where}.parameters.conversion_factor", CONVERSION_FACTORS)
    else:
        strict(record["parameters"], f"{where}.parameters", [])
    flags = strict(record["flags"], f"{where}.flags", list(FLAG_NAMES) + ["timed_units_rule", "rounding"])
    for name in FLAG_NAMES:
        boolean(flags[name], f"{where}.flags.{name}")
    if flags["timed_units_rule"] == "UNKNOWN":
        raise InputError(f"{where}.flags.timed_units_rule: UNKNOWN belongs to UNITS_RULE_UNKNOWN, a later milestone's reason")
    choice(flags["timed_units_rule"], f"{where}.flags.timed_units_rule", TIMED_UNITS_RULES)
    if flags["rounding"] is not None:
        choice(flags["rounding"], f"{where}.flags.rounding", tuple(ROUNDING_RULES))


# ---------------------------------------------------------------------------------------------
# The rule release: verified against its manifest before a single record is read.


class Release:
    def __init__(self, number_, directory, manifest_sha256, records):
        self.number = number_
        self.directory = directory
        self.manifest_sha256 = manifest_sha256
        self.records = records

    def of(self, record_type, key):
        return [record for record in self.records.get(record_type, []) if record["key"] == key]

    def in_force(self, record_type, key, date):
        found = [record for record in self.of(record_type, key) if covers(record["effective_from"], record["effective_to"], date)]
        if len(found) > 1:
            raise InputError(f"release {self.number}: two {record_type} records for {json.dumps(key)} are in force on {date}")
        return found[0] if found else None

    def latest_in_year(self, record_type, key, year):
        """The record of `key` with the latest start among those in force at some time during `year`."""
        first, last = f"{year:04d}-01-01", f"{year:04d}-12-31"
        found = [record for record in self.of(record_type, key) if record["effective_from"] <= last and (record["effective_to"] is None or record["effective_to"] >= first)]
        return max(found, key=lambda record: record["effective_from"]) if found else None


RELEASES = {}


def sha256_of(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_release(reference):
    directory = (REPOSITORY / reference["dir"]).resolve()
    if REPOSITORY not in directory.parents:
        raise InputError("inputs.release.dir: must be inside the repository")
    cache_key = (str(directory), reference["manifest_sha256"], reference["number"])
    if cache_key in RELEASES:
        return RELEASES[cache_key]
    manifest_path = directory / "MANIFEST.json"
    if not manifest_path.is_file():
        raise InputError(f"inputs.release.dir: {reference['dir']} holds no MANIFEST.json")
    actual = sha256_of(manifest_path)
    if actual != reference["manifest_sha256"]:
        raise InputError(f"inputs.release.manifest_sha256: the MANIFEST.json of {reference['dir']} has SHA-256 {actual}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("release") != reference["number"]:
        raise InputError(f"inputs.release.number: the manifest names release {manifest.get('release')}")
    files = manifest.get("files", {})
    present = sorted(str(path.relative_to(directory).as_posix()) for path in directory.rglob("*") if path.is_file() and path.name != "MANIFEST.json")
    if present != sorted(files):
        raise InputError(f"release {reference['number']}: its files do not match MANIFEST.json")
    records = {}
    for name in sorted(files):
        path = directory / name
        if sha256_of(path) != files[name]:
            raise InputError(f"release {reference['number']}: {name} does not match its MANIFEST.json hash")
        if name.endswith(".json") and not name.endswith(".second-pass.json"):
            for record in json.loads(path.read_text(encoding="utf-8")):
                records.setdefault(record["record_type"], []).append(record)
    release = Release(reference["number"], reference["dir"], reference["manifest_sha256"], records)
    RELEASES[cache_key] = release
    return release


# ---------------------------------------------------------------------------------------------
# Pricing, in the order of PRD section 11


class Terms:
    """What prices a line: a signed-off rate record, or the Original Medicare terms of an MA non-contracted plan."""

    def __init__(self, mapping, version, record, method, percentage, year_basis, conversion_factor, flags, rounding):
        self.mapping = mapping
        self.version = version
        self.record = record
        self.method = method
        self.percentage = percentage
        self.year_basis = year_basis
        self.conversion_factor = conversion_factor
        self.flags = flags
        self.rounding = rounding

    def identity(self):
        return {
            "mapping_id": self.mapping["mapping_id"],
            "mapping_kind": self.mapping["kind"],
            "contract_version_id": None if self.version is None else self.version["contract_version_id"],
            "rate_record_id": None if self.record is None else self.record["rate_record_id"],
        }


def flags_text(flags):
    parts = [f"{name} {'on' if flags[name] else 'off'}" for name in FLAG_NAMES]
    return ", ".join(parts) + f"; timed_units_rule {flags['timed_units_rule']}"


def scope_text(scope):
    codes = "any code" if scope["codes"] is None else "codes " + ", ".join(scope["codes"])
    if scope["modifier_sets"] is None:
        modifiers = "any modifiers"
    else:
        modifiers = "modifier sets " + "; ".join("[" + " ".join(sorted(item)) + "]" for item in scope["modifier_sets"])
    places = "any place of service" if scope["places_of_service"] is None else "places of service " + ", ".join(scope["places_of_service"])
    return f"{codes}; {modifiers}; {places}; {window_text(scope['effective_from'], scope['effective_to'])}"


def why_scope_fails(scope, line):
    if scope["codes"] is not None and line["procedure_code"] not in scope["codes"]:
        return f"code {line['procedure_code']} is not in its codes"
    if scope["modifier_sets"] is not None and sorted(line["modifiers"]) not in [sorted(item) for item in scope["modifier_sets"]]:
        return f"modifier set [{' '.join(sorted(line['modifiers']))}] is not one of its modifier sets"
    if scope["places_of_service"] is not None and line["place_of_service"] not in scope["places_of_service"]:
        return f"place of service {line['place_of_service']} is not in its places of service"
    if not covers(scope["effective_from"], scope["effective_to"], line["service_date"]):
        return f"{line['service_date']} is outside its window"
    return None


class Line:
    def __init__(self, facts):
        self.facts = facts
        self.no = facts["line_no"]
        self.date = facts["service_date"]
        self.units = int(Decimal(facts["units"]))
        self.reason = None
        self.terms = None
        self.setting = None
        self.unit_parts = None
        self.unit_total = None
        self.base = None
        self.amount = None
        self.adjustments = []
        self.patient_share = sum((Decimal(item["amount_cents"]) for item in facts["patient_share_adjustments"]), ZERO)
        self.rounding = None
        self.rounded = None
        self.log = []

    def say(self, line=""):
        self.log.append(line)

    def stop(self, reason, why):
        self.reason = reason
        self.say(f"- **Unpriced: `{reason}`.** {why}")


def resolve_agreement(case, line):
    """Step 1. The mapping in force on the service date, then the agreement it resolves to."""
    inputs = case["inputs"]
    date = line.date
    facts = line.facts
    line.say("Step 1, the agreement.")
    in_force = [mapping for mapping in inputs["mappings"] if covers(mapping["effective_from"], mapping["effective_to"], date)]
    if not in_force:
        listed = "; ".join(f"{mapping['mapping_id']} {window_text(mapping['effective_from'], mapping['effective_to'])}" for mapping in inputs["mappings"]) or "none"
        line.stop("NO_MAPPING", f"No mapping of {inputs['claim']['payer_plan_key']} is in force on {date} (mappings: {listed}).")
        return
    mapping = in_force[0]
    line.say(f"- Mapping {mapping['mapping_id']} ({mapping['kind']}, {window_text(mapping['effective_from'], mapping['effective_to'])}) is in force on {date}.")
    if mapping["kind"] in NO_AGREEMENT_KINDS:
        line.stop("NO_AGREEMENT", f"The plan is mapped as {mapping['kind']}: no agreement governs the line.")
        return
    if mapping["kind"] == "ma_noncontracted":
        flags = {name: True for name in FLAG_NAMES}
        flags["timed_units_rule"] = "MEDICARE_POOLED"
        line.terms = Terms(mapping, None, None, "PERCENT_OF_MEDICARE", HUNDRED, "CURRENT", "non_qualifying_apm", flags, None)
        line.say(
            "- Medicare Advantage, non-contracted: priced as Original Medicare would, method PERCENT_OF_MEDICARE at 100%, "
            "year basis CURRENT, conversion factor non_qualifying_apm (the rules reference's default), every Medicare adjustment on "
            f"({flags_text(flags)}); no contract rounding, so the practice default applies."
        )
        return
    chosen = next(version for version in inputs["contract_versions"] if version["contract_version_id"] == mapping["contract_version_id"])
    contract_id = chosen["contract_id"]
    line.say(f"- The mapping names contract version {chosen['contract_version_id']} of contract {contract_id}; the version that prices the line is the signed-off one of that contract in force on {date}:")
    versions = [version for version in inputs["contract_versions"] if version["contract_id"] == contract_id]
    signed = []
    for version in sorted(versions, key=lambda item: item["version_no"]):
        in_window = covers(version["effective_from"], version["effective_to"], date)
        verdict = "signed off and in force" if version["status"] == "signed_off" and in_window else (
            "not signed off" if version["status"] != "signed_off" else "outside its window")
        line.say(f"  - {version['contract_version_id']} (version {version['version_no']}, {version['status']}, {window_text(version['effective_from'], version['effective_to'])}): {verdict}.")
        if version["status"] == "signed_off" and in_window:
            signed.append(version)
    if not signed:
        line.stop("DATE_OUTSIDE_VERSIONS", f"No signed-off version of contract {contract_id} covers {date}.")
        return
    version = signed[0]
    modifiers = " ".join(sorted(facts["modifiers"])) or "none"
    line.say(f"- Rate records of {version['contract_version_id']} against code {facts['procedure_code']}, modifier set [{modifiers}], place of service {facts['place_of_service']}, {date}:")
    matches = []
    for record in version["rate_records"]:
        failure = why_scope_fails(record["scope"], facts)
        line.say(f"  - {record['rate_record_id']} ({scope_text(record['scope'])}): {'matches' if failure is None else 'no match, ' + failure}.")
        if failure is None:
            matches.append(record)
    if len(matches) > 1:
        line.stop("AMBIGUOUS_RATE", f"{len(matches)} rate records match ({', '.join(record['rate_record_id'] for record in matches)}).")
        return
    if not matches:
        line.stop("NO_RATE_FOR_CODE", "No rate record of the version matches the line.")
        return
    record = matches[0]
    flags = record["flags"]
    rounding = flags["rounding"]
    if record["method"] == "UNSUPPORTED":
        line.terms = Terms(mapping, version, record, "UNSUPPORTED", None, None, None, flags, rounding)
        line.say(f"- Rate record {record['rate_record_id']}: method UNSUPPORTED.")
        return
    parameters = record["parameters"]
    line.terms = Terms(mapping, version, record, "PERCENT_OF_MEDICARE", Decimal(parameters["percentage"]), parameters["year_basis"], parameters["conversion_factor"], flags, rounding)
    line.say(
        f"- Rate record {record['rate_record_id']}: PERCENT_OF_MEDICARE at {percent_text(Decimal(parameters['percentage']))}, year basis {parameters['year_basis']}, "
        f"locality basis {parameters['locality_basis']}, conversion factor {parameters['conversion_factor']}; flags {flags_text(flags)}; "
        f"rounding {rounding if rounding is not None else 'not stated (the practice default applies)'}."
    )


def base_amount(case, line, release):
    """Step 2. The per-unit amount by method, for the basis year."""
    terms = line.terms
    facts = line.facts
    line.say("")
    line.say("Step 2, the base amount by method.")
    if terms.method == "UNSUPPORTED":
        line.stop("UNSUPPORTED_METHOD", "The rate record's method is UNSUPPORTED (capitation or an undefined case rate).")
        return
    service_year = int(line.date[:4])
    if terms.year_basis == "CURRENT":
        basis_year = service_year
        line.say(f"- Year basis CURRENT: the fee schedule in effect on the date of service, {line.date} (basis year {basis_year}); each value is the record in force on that date.")

        def lookup(record_type, key):
            return release.in_force(record_type, key, line.date)
    else:
        basis_year = int(terms.year_basis.split(":")[1])
        line.say(f"- Year basis {terms.year_basis}: the {basis_year} fee schedule; each value is the latest record in force during {basis_year}.")

        def lookup(record_type, key):
            return release.latest_in_year(record_type, key, basis_year)
    code = facts["procedure_code"]
    rvu = lookup("pfs_rvu", {"hcpcs": code, "modifier": ""})
    if rvu is None:
        line.stop("NO_PFS_VALUE", f"Release {release.number} has no relative value (pfs_rvu) for {code} in {basis_year}.")
        return
    value = rvu["value"]
    setting = case["inputs"]["place_of_service_settings"][facts["place_of_service"]]
    line.setting = setting
    pe_field, na_field = ("pe_rvu_facility", "facility_pe_na") if setting == "facility" else ("pe_rvu_non_facility", "non_facility_pe_na")
    line.say(
        f"- pfs_rvu {code} (year {value['year']}, quarter {value['quarter']}, {window_text(rvu['effective_from'], rvu['effective_to'])}): work {value['work_rvu']}, "
        f"PE non-facility {value['pe_rvu_non_facility']}{' (NA)' if value['non_facility_pe_na'] else ''}, PE facility {value['pe_rvu_facility']}{' (NA)' if value['facility_pe_na'] else ''}, "
        f"MP {value['mp_rvu']}, status {value['status']}."
    )
    line.say(f"- Place of service {facts['place_of_service']} is {setting.replace('_', '-')}, so the {setting.replace('_', '-')} practice-expense value applies.")
    if value[na_field]:
        line.stop("NO_PFS_VALUE", f"The {setting.replace('_', '-')} practice-expense value of {code} is NA in {basis_year}: the code has no relative value for this setting (fixtures/golden/QUESTIONS.md).")
        return
    zip_code = case["inputs"]["practice_settings"]["zip"]
    locality = release.in_force("locality_map", {"zip": zip_code}, line.date)
    if locality is None:
        raise InputError(f"release {release.number} maps no locality for ZIP {zip_code} on {line.date}; that is an engine error, not a golden line")
    carrier, locality_no = locality["value"]["carrier"], locality["value"]["locality"]
    line.say(f"- Locality: practice ZIP {zip_code} maps to carrier {carrier} locality {locality_no} (locality_map in force on {line.date}, {window_text(locality['effective_from'], locality['effective_to'])}).")
    gpci = lookup("pfs_gpci", {"carrier": carrier, "locality": locality_no})
    if gpci is None:
        raise InputError(f"release {release.number} has no GPCI for {carrier}-{locality_no} in {basis_year}; that is an engine error, not a golden line")
    indices = gpci["value"]
    line.say(f"- pfs_gpci {carrier}-{locality_no} ({window_text(gpci['effective_from'], gpci['effective_to'])}): work {indices['work_gpci']}, PE {indices['pe_gpci']}, MP {indices['mp_gpci']}.")
    factor_record = lookup("conversion_factor", {"applicability": terms.conversion_factor})
    if factor_record is None:
        raise InputError(f"release {release.number} has no {terms.conversion_factor} conversion factor for {basis_year}; that is an engine error, not a golden line")
    factor = Decimal(factor_record["value"]["conversion_factor"])
    line.say(f"- conversion_factor {terms.conversion_factor} ({window_text(factor_record['effective_from'], factor_record['effective_to'])}): ${factor_record['value']['conversion_factor']} per RVU.")
    work = Decimal(value["work_rvu"]) * Decimal(indices["work_gpci"])
    pe = Decimal(value[pe_field]) * Decimal(indices["pe_gpci"])
    mp = Decimal(value["mp_rvu"]) * Decimal(indices["mp_gpci"])
    line.say(f"- Geographically adjusted RVUs: work {value['work_rvu']} x {indices['work_gpci']} = {fmt(work)}; PE {value[pe_field]} x {indices['pe_gpci']} = {fmt(pe)}; MP {value['mp_rvu']} x {indices['mp_gpci']} = {fmt(mp)}; total {fmt(work + pe + mp)}.")
    share = terms.percentage / HUNDRED
    parts = {name: rvus * factor * HUNDRED * share for name, rvus in (("work", work), ("pe", pe), ("mp", mp))}
    total = parts["work"] + parts["pe"] + parts["mp"]
    line.say(f"- Fee schedule amount per unit: {fmt(work + pe + mp)} x ${factor_record['value']['conversion_factor']} = {dollars((work + pe + mp) * factor * HUNDRED)}.")
    line.say(
        f"- At {percent_text(terms.percentage)}, per unit: work {money(parts['work'])}, practice expense {money(parts['pe'])}, malpractice {money(parts['mp'])}; "
        f"total {money(total)}."
    )
    line.unit_parts = parts
    line.unit_total = total


def apply_units(line):
    """Step 3. Units as billed."""
    line.base = line.unit_total * Decimal(line.units)
    line.amount = line.base
    line.say("")
    line.say(f"Step 3, units: {line.units} as billed; {money(line.unit_total)} x {line.units} = {money(line.base)}.")


def mppr_rate_for(release, code, date):
    """The practice-expense reduction for a code's second and later units, or None when it is not an always-therapy code."""
    listed = release.in_force("mppr_rate", {"hcpcs": code, "modifier": ""}, date)
    if listed is None:
        return None, None
    rate = listed["value"]["pe_reduction_percent"]
    if rate is not None:
        return Decimal(rate), f"mppr_rate {code} ({window_text(listed['effective_from'], listed['effective_to'])}): {rate}%"
    general = release.in_force("mppr_rate", {"component": "practice_expense"}, date)
    if general is None:
        raise InputError(f"release {release.number} lists {code} for the multiple procedure reduction with no share and has no general rate on {date}")
    return Decimal(general["value"]["reduction_percent"]), f"general mppr_rate practice_expense: {general['value']['reduction_percent']}%"


def multiple_procedure_reduction(lines, release, day_log):
    """Step 4a, per service date: rank the day's always-therapy units by practice-expense value and reduce all but the first."""
    eligible = [line for line in lines if line.reason is None and line.terms.flags["apply_mppr"]]
    for date in sorted({line.date for line in eligible}):
        day = [line for line in eligible if line.date == date]
        units = []
        rates = {}
        for line in day:
            rate, source = mppr_rate_for(release, line.facts["procedure_code"], date)
            rates[line.no] = (rate, source)
            if rate is not None:
                for unit in range(1, line.units + 1):
                    units.append((line.unit_parts["pe"], line.no, unit, line))
        units.sort(key=lambda item: (-item[0], item[1], item[2]))
        reductions = {line.no: ZERO for line in day}
        day_log.append(f"### Multiple procedure reduction on {date}")
        day_log.append("")
        considered = ", ".join(f"line {line.no}" for line in day)
        day_log.append(f"Lines with apply_mppr on and a price so far: {considered}. Units are ranked by their practice-expense amount, highest first; ties go to the lower line number, then the earlier unit (fixtures/golden/QUESTIONS.md).")
        for line in day:
            rate, source = rates[line.no]
            if rate is None:
                day_log.append(f"- Line {line.no} ({line.facts['procedure_code']}): no mppr_rate record in force on {date}, so it is not an always-therapy code; never reduced and not ranked.")
            else:
                day_log.append(f"- Line {line.no} ({line.facts['procedure_code']}): always therapy, {source}.")
        day_log.append("")
        if units:
            day_log.append("| Rank | Line | Code | Unit | PE amount per unit (cents) | Treatment | Reduction (cents) |")
            day_log.append("| --- | --- | --- | --- | --- | --- | --- |")
        for rank, (pe, number_, unit, line) in enumerate(units, start=1):
            if rank == 1:
                day_log.append(f"| {rank} | {number_} | {line.facts['procedure_code']} | {unit} | {fmt(pe)} | kept whole | 0 |")
                continue
            rate = rates[number_][0]
            cut = pe * rate / HUNDRED
            reductions[number_] += cut
            day_log.append(f"| {rank} | {number_} | {line.facts['procedure_code']} | {unit} | {fmt(pe)} | PE reduced by {percent_text(rate)} | {fmt(pe)} x {percent_text(rate)} = {fmt(cut)} |")
        day_log.append("")
        for line in day:
            before = line.amount
            line.amount = before - reductions[line.no]
            if rates[line.no][0] is None:
                how = "not an always-therapy code; unchanged"
            elif reductions[line.no] == 0:
                how = "its unit is the day's highest-ranked, kept whole; unchanged"
            else:
                how = f"{money(before)} - the reductions of its units {fmt(reductions[line.no])} = {money(line.amount)}"
            line.adjustments.append(("mppr", before, line.amount, how))


def assistant_reduction(line, release):
    """Step 4b. CQ or CO with the flag on: the assistant percentage of the amount after the multiple procedure reduction."""
    present = [modifier for modifier in ASSISTANT_MODIFIERS if modifier in line.facts["modifiers"]]
    before = line.amount
    if not present:
        line.adjustments.append(("assistant_reduction", before, before, "no CQ or CO modifier on the line; unchanged"))
        return
    rates = {}
    for modifier in present:
        record = release.in_force("assistant_modifier", {"modifier": modifier}, line.date)
        if record is None:
            raise InputError(f"release {release.number} has no assistant_modifier record for {modifier} on {line.date}")
        rates[modifier] = Decimal(record["value"]["payment_percent"])
    if len(set(rates.values())) > 1:
        raise InputError(f"line {line.no}: CQ and CO carry different percentages; the plan does not say which applies")
    rate = next(iter(rates.values()))
    line.amount = before * rate / HUNDRED
    line.adjustments.append(("assistant_reduction", before, line.amount, f"{' and '.join(present)} present; assistant_modifier pays {percent_text(rate)}: {money(before)} x {percent_text(rate)} = {money(line.amount)}"))


def sequestration(line, release):
    """Step 4c. The sequestration percentage of the payer's share: the amount after the patient share."""
    record = release.in_force("sequestration", {"program": "medicare"}, line.date)
    if record is None:
        raise InputError(f"release {release.number} has no sequestration record on {line.date}: a gap the engine reports, never a silent 0%")
    before = line.amount
    if record["value"]["suspended"]:
        line.adjustments.append(("sequestration", before, before, f"sequestration is suspended on {line.date}; unchanged"))
        return
    rate = Decimal(record["value"]["reduction_percent"])
    payer_share = before - line.patient_share
    note = ""
    if payer_share < 0:
        note = f" (the patient share exceeds the amount by {fmt(-payer_share)}, so the payer's share is taken as 0; fixtures/golden/QUESTIONS.md)"
        payer_share = ZERO
    cut = payer_share * rate / HUNDRED
    line.amount = before - cut
    line.adjustments.append((
        "sequestration", before, line.amount,
        f"the amount {money(before)} less the patient share {fmt(line.patient_share)} leaves the payer's share {money(payer_share)}{note}; "
        f"{percent_text(rate)} of the payer's share is {fmt(cut)}; {fmt(before)} - {fmt(cut)} = {money(line.amount)}",
    ))


def price_case(case):
    """Prices one golden claim. Returns (expected, worksheet lines)."""
    inputs = case["inputs"]
    claim = inputs["claim"]
    release = load_release(inputs["release"])
    lines = [Line(facts) for facts in sorted(claim["lines"], key=lambda item: item["line_no"])]
    for line in lines:
        resolve_agreement(case, line)
        if line.reason is None:
            base_amount(case, line, release)
        if line.reason is None:
            apply_units(line)
    day_log = []
    if any(line.reason is None and line.terms.flags["apply_mppr"] for line in lines):
        multiple_procedure_reduction(lines, release, day_log)
    for line in lines:
        if line.reason is None and line.terms.flags["apply_assistant_reduction"]:
            assistant_reduction(line, release)
        if line.reason is None and line.terms.flags["apply_sequestration"]:
            sequestration(line, release)
    default_rounding = inputs["practice_settings"]["default_rounding"]
    for line in lines:
        if line.reason is not None:
            continue
        line.say("")
        line.say("Step 4, flagged adjustments in order (multiple procedure reduction, assistant reduction, sequestration).")
        for name in ("apply_mppr", "apply_assistant_reduction", "apply_sequestration"):
            if not line.terms.flags[name]:
                line.say(f"- {ADJUSTMENT_OF_FLAG[name]}: flag {name} is off; not applied.")
        for name, before, after, how in line.adjustments:
            line.say(f"- {name}: before {fmt(before)}, after {fmt(after)}; {how}.")
        line.say("- Contract-specific adjustments: none (phase one rate records define none).")
        if line.terms.flags["apply_ncci"]:
            line.say("- apply_ncci is on: NCCI edits and MUE arrive in milestone 7 and change no amount here.")
        line.say("")
        shares = ", ".join(f"PR-{item['reason_code']} {item['amount_cents']}" for item in line.facts["patient_share_adjustments"]) or "none"
        line.say(f"Step 5, patient share: {money(line.patient_share)} from the line's PR adjustments ({shares}); reported beside the expected amount, never subtracted from it.")
        status = claim["claim_status_code"]
        if status in SECONDARY_STATUSES:
            line.stop("SECONDARY_PAYER", f"Claim status {status} ({CLAIM_STATUSES[status]}): secondary and tertiary claims are unpriced in v0 and v1.")
            continue
        if status == REVERSAL_STATUS:
            line.stop("REVERSED_CLAIM", f"Claim status {status} ({CLAIM_STATUSES[status]}).")
            continue
        if claim["reversed"]:
            line.stop("REVERSED_CLAIM", "A later reversal reverses this claim and no correction supersedes it.")
            continue
        line.say(f"- Claim status {status} ({CLAIM_STATUSES[status]}); the claim is not reversed.")
        line.say("")
        rule = line.terms.rounding or default_rounding or DEFAULT_ROUNDING
        origin = "the rate record's rule" if line.terms.rounding else ("the practice default" if default_rounding else "the plan's default")
        line.rounding = rule
        line.rounded = round_once(line.amount, rule)
        line.say(f"Step 6, rounding once: {fmt(line.amount)} cents under {rule} ({origin}; {ROUNDING_WORDS[rule]}) = **{fmt(line.rounded)} cents ({dollars(line.rounded)})**; the unrounded {fmt(line.amount)} is kept beside it.")
    expected = {"lines": [expected_line(line) for line in lines]}
    return expected, render_worksheet(case, release, lines, day_log)


def expected_line(line):
    if line.reason is not None:
        return {"line_no": line.no, "outcome": "unpriced", "unpriced_reason": line.reason}
    return {
        "line_no": line.no,
        "outcome": "priced",
        "expected_allowed_cents": fmt(line.rounded),
        "expected_unrounded_cents": fmt(line.amount),
        "rounding": line.rounding,
        "patient_share_cents": fmt(line.patient_share),
        "method": line.terms.method,
        "terms": line.terms.identity(),
        "base_cents": fmt(line.base),
        "adjustments": [{"name": name, "before_cents": fmt(before), "after_cents": fmt(after)} for name, before, after, _ in line.adjustments],
    }


# ---------------------------------------------------------------------------------------------
# The worksheet


def render_worksheet(case, release, lines, day_log):
    inputs = case["inputs"]
    claim = inputs["claim"]
    practice = inputs["practice_settings"]
    out = [
        f"# Worksheet {case['id']}: {case['title']}",
        "",
        f"Computed by the {COMPUTED_BY} (Python, exact decimal arithmetic; no code shared with packages/pricing).",
        "Specialist verified: no. A reimbursement specialist checks every figure here before milestone 5 closes.",
        f"Every reference value comes from SYNTHETIC release {release.number}: invented for tests, never a CMS value.",
        "",
        "## Inputs",
        "",
        f"- Release {release.number} at {release.directory}; its MANIFEST.json has SHA-256 {release.manifest_sha256} and every file matched it.",
        f"- Practice settings: ZIP {practice['zip']}; default rounding {practice['default_rounding'] or 'not set (the plan default HALF_UP_CENT applies)'}.",
        "- Place-of-service settings (SYNTHETIC test assumption; fixtures/golden/QUESTIONS.md): "
        + "; ".join(f"{code} {setting.replace('_', '-')}" for code, setting in sorted(inputs["place_of_service_settings"].items())) + ".",
        f"- Claim {claim['claim_id']}: status {claim['claim_status_code']} ({CLAIM_STATUSES[claim['claim_status_code']]}); "
        f"reversed by a later claim: {'yes' if claim['reversed'] else 'no'}; superseded by a correction: {'yes' if claim['corrected'] else 'no'}; payer and plan {claim['payer_plan_key']}.",
    ]
    if inputs["mappings"]:
        for mapping in inputs["mappings"]:
            target = f", contract version {mapping['contract_version_id']}" if mapping["contract_version_id"] else ""
            out.append(f"- Mapping {mapping['mapping_id']}: {mapping['kind']}{target}, {window_text(mapping['effective_from'], mapping['effective_to'])}.")
    else:
        out.append("- Mappings: none.")
    if not inputs["contract_versions"]:
        out.append("- Contract versions: none.")
    for version in inputs["contract_versions"]:
        out.append(f"- Contract version {version['contract_version_id']} (contract {version['contract_id']}, version {version['version_no']}, {version['status']}, {window_text(version['effective_from'], version['effective_to'])}):")
        for record in version["rate_records"]:
            if record["method"] == "PERCENT_OF_MEDICARE":
                parameters = record["parameters"]
                terms = f"PERCENT_OF_MEDICARE {percent_text(Decimal(parameters['percentage']))}, {parameters['year_basis']}, locality {parameters['locality_basis']}, {parameters['conversion_factor']}"
            else:
                terms = "UNSUPPORTED"
            out.append(f"  - Rate record {record['rate_record_id']}: {terms}; scope {scope_text(record['scope'])}; flags {flags_text(record['flags'])}; rounding {record['flags']['rounding'] or 'not stated'}.")
    out += [
        "",
        "| Line | Code | Modifiers | Units | Service date | POS | Charge (cents) | Observed allowed (cents) | PR adjustments (cents) |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for line in lines:
        facts = line.facts
        shares = ", ".join(f"PR-{item['reason_code']} {item['amount_cents']}" for item in facts["patient_share_adjustments"]) or "none"
        out.append(
            f"| {line.no} | {facts['procedure_code']} | {' '.join(facts['modifiers']) or 'none'} | {facts['units']} | {facts['service_date']} | {facts['place_of_service']} | "
            f"{facts['charge_cents']} | {facts['observed_allowed_cents']} ({facts['observed_allowed_basis']}) | {shares} |"
        )
    out.append("")
    out.append("## Steps 1 to 3, per line")
    for line in lines:
        out += ["", f"### Line {line.no}: {line.facts['procedure_code']} x {line.units} on {line.date}", ""]
        steps = line.log
        cut = next((index for index, item in enumerate(steps) if item.startswith("Step 4")), len(steps))
        out += trim(steps[:cut])
        line.rest = steps[cut:]
    if day_log:
        out += ["", "## Step 4a, the multiple procedure reduction, per day", ""]
        out += trim(day_log)
    later = [(line.no, trim(line.rest)) for line in lines if trim(line.rest)]
    if later:
        out += ["", "## Steps 4 to 6, per line"]
    for number_, rest in later:
        out += ["", f"### Line {number_}", ""]
        out += rest
    out += ["", "## Results", "", "| Line | Outcome | Expected allowed (cents) | Unrounded (cents) | Rounding | Patient share (cents) |", "| --- | --- | --- | --- | --- | --- |"]
    for line in lines:
        if line.reason is not None:
            out.append(f"| {line.no} | unpriced `{line.reason}` | | | | |")
        else:
            out.append(f"| {line.no} | priced | {fmt(line.rounded)} | {fmt(line.amount)} | {line.rounding} | {fmt(line.patient_share)} |")
    return out


def trim(items):
    items = list(items)
    while items and items[0] == "":
        items.pop(0)
    while items and items[-1] == "":
        items.pop()
    return items


# ---------------------------------------------------------------------------------------------
# Files


KEY_ORDER = ["format", "id", "title", "covers", "notes", "inputs", "expected", "worksheet", "provenance"]
INLINE_WIDTH = 110


def scalar(value):
    return value is None or isinstance(value, (str, int, float, bool))


def dumps(value, indent=0):
    """JSON with two-space indentation, keeping short lists and objects of scalars on one line."""
    pad = "  " * indent
    inner = "  " * (indent + 1)
    if isinstance(value, dict):
        if not value:
            return "{}"
        if all(scalar(item) for item in value.values()):
            flat = "{" + ", ".join(f"{json.dumps(key)}: {json.dumps(item, ensure_ascii=False)}" for key, item in value.items()) + "}"
            if len(flat) + len(pad) <= INLINE_WIDTH:
                return flat
        return "{\n" + ",\n".join(f"{inner}{json.dumps(key)}: {dumps(item, indent + 1)}" for key, item in value.items()) + "\n" + pad + "}"
    if isinstance(value, list):
        if not value:
            return "[]"
        if all(scalar(item) for item in value):
            flat = "[" + ", ".join(json.dumps(item, ensure_ascii=False) for item in value) + "]"
            if len(flat) + len(pad) <= INLINE_WIDTH:
                return flat
        return "[\n" + ",\n".join(inner + dumps(item, indent + 1) for item in value) + "\n" + pad + "]"
    return json.dumps(value, ensure_ascii=False)


def serialize(case):
    ordered = {key: case[key] for key in KEY_ORDER}
    return dumps(ordered) + "\n"


def worksheet_path(path):
    return path.with_name(path.name[: -len(".json")] + ".worksheet.md")


def read_case(path):
    try:
        case = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise InputError(f"is not valid JSON: {error}") from None
    validate(case)
    return case


def recompute(path):
    """The case at `path` with its computed sections recomputed, and its .worksheet.md text."""
    case = read_case(path)
    expected, worksheet = price_case(case)
    updated = dict(case)
    updated["expected"] = expected
    updated["worksheet"] = worksheet
    previous = case["provenance"] or {}
    updated["provenance"] = {"computed_by": COMPUTED_BY, "specialist_verified": bool(previous.get("specialist_verified", False))}
    return case, updated, "\n".join(worksheet) + "\n"


def golden_files(arguments):
    if arguments:
        return [Path(argument).resolve() for argument in arguments]
    return sorted(GOLDEN_DIR.glob("*.json"))


def relative(path):
    try:
        return path.relative_to(REPOSITORY).as_posix()
    except ValueError:
        return str(path)


def differences_of(path):
    """Every difference between the committed golden file (and its worksheet) and a recomputation."""
    found = []
    try:
        case, updated, markdown = recompute(path)
    except (InputError, OSError) as error:
        return None, [{"file": relative(path), "case": None, "line_no": None, "field": "(inputs)", "golden": None, "worksheet": str(error)}]
    where = {"file": relative(path), "case": case["id"]}
    committed_lines = {line.get("line_no"): line for line in (case["expected"] or {}).get("lines", [])} if isinstance(case["expected"], dict) else {}
    for line in updated["expected"]["lines"]:
        golden = committed_lines.pop(line["line_no"], None)
        if golden is None:
            found.append({**where, "line_no": line["line_no"], "field": "(line)", "golden": None, "worksheet": line})
            continue
        for field in sorted(set(line) | set(golden)):
            if line.get(field) != golden.get(field):
                found.append({**where, "line_no": line["line_no"], "field": field, "golden": golden.get(field), "worksheet": line.get(field)})
    for number_, golden in committed_lines.items():
        found.append({**where, "line_no": number_, "field": "(line)", "golden": golden, "worksheet": None})
    if case["worksheet"] != updated["worksheet"]:
        committed = case["worksheet"] if isinstance(case["worksheet"], list) else []
        first = next((index for index, (a, b) in enumerate(zip(committed, updated["worksheet"])) if a != b), min(len(committed), len(updated["worksheet"])))
        found.append({**where, "line_no": None, "field": f"worksheet (from line {first + 1})", "golden": committed[first] if first < len(committed) else None,
                      "worksheet": updated["worksheet"][first] if first < len(updated["worksheet"]) else None})
    if case["provenance"] != updated["provenance"]:
        found.append({**where, "line_no": None, "field": "provenance", "golden": case["provenance"], "worksheet": updated["provenance"]})
    sheet = worksheet_path(path)
    if not sheet.is_file() or sheet.read_text(encoding="utf-8") != markdown:
        found.append({**where, "line_no": None, "field": relative(sheet), "golden": "missing" if not sheet.is_file() else "differs", "worksheet": "the rendered worksheet"})
    if not found and path.read_text(encoding="utf-8") != serialize(updated):
        found.append({**where, "line_no": None, "field": "(formatting)", "golden": "hand-formatted", "worksheet": "the canonical layout `write` produces"})
    return updated, found


def command_check(arguments):
    files = golden_files(arguments.files)
    cases, lines, differences = 0, 0, []
    for path in files:
        updated, found = differences_of(path)
        differences += found
        if updated is not None:
            cases += 1
            lines += len(updated["expected"]["lines"])
    report = {"files": len(files), "cases": cases, "lines": lines, "differences": differences}
    if arguments.json:
        sys.stdout.write(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    else:
        for item in differences:
            sys.stdout.write(f"{item['file']} line {item['line_no']}: {item['field']}: golden {json.dumps(item['golden'])}, worksheet {json.dumps(item['worksheet'])}\n")
        sys.stdout.write(f"golden worksheet: {cases} case(s), {lines} line(s), {len(differences)} difference(s).\n")
    return 1 if differences else 0


def command_write(arguments):
    status = 0
    for path in golden_files(arguments.files):
        try:
            case, updated, markdown = recompute(path)
        except (InputError, OSError) as error:
            sys.stderr.write(f"{relative(path)}: {error}\n")
            status = 1
            continue
        changed = (case["expected"], case["worksheet"]) != (updated["expected"], updated["worksheet"])
        if updated["provenance"]["specialist_verified"] and changed:
            sys.stderr.write(f"{relative(path)}: verified by the specialist; changing it is a human step: set provenance.specialist_verified to false first\n")
            status = 1
            continue
        path.write_text(serialize(updated), encoding="utf-8")
        worksheet_path(path).write_text(markdown, encoding="utf-8")
        sys.stdout.write(f"{relative(path)}: {len(updated['expected']['lines'])} line(s) written{' (changed)' if changed else ''}\n")
    return status


def command_show(arguments):
    try:
        _, updated, markdown = recompute(Path(arguments.file).resolve())
    except (InputError, OSError) as error:
        sys.stderr.write(f"{arguments.file}: {error}\n")
        return 1
    sys.stdout.write(markdown)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(prog="golden_worksheet.py", description="The independent pricing worksheet behind fixtures/golden.")
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check", help="recompute every golden file and report differences; never writes")
    check.add_argument("--json", action="store_true", help="print the report as JSON")
    check.add_argument("files", nargs="*")
    write = commands.add_parser("write", help="fill in the computed sections of golden files (a human step, reviewed like code)")
    write.add_argument("files", nargs="*")
    show = commands.add_parser("show", help="print a golden file's worksheet")
    show.add_argument("file")
    arguments = parser.parse_args(argv)
    return {"check": command_check, "write": command_write, "show": command_show}[arguments.command](arguments)


if __name__ == "__main__":
    sys.exit(main())
