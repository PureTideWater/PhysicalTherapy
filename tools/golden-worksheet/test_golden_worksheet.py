#!/usr/bin/env python3
"""Unit tests for the golden worksheet (standard library only): python3 -I tools/golden-worksheet/test_golden_worksheet.py

`pnpm test` runs this file through tools/golden-worksheet/worksheet.test.ts.
"""

import contextlib
import copy
import decimal
import io
import json
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

# -I keeps the script's own directory off sys.path; the module under test sits beside this file. No bytecode
# is written beside it: tools/ is a source directory, where nothing may be ignored or left untracked.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import golden_worksheet as gw  # noqa: E402

CLAIMS = gw.GOLDEN_DIR
D = Decimal


def golden(name):
    return json.loads(next(CLAIMS.glob(f"{name}-*.json")).read_text(encoding="utf-8"))


def outcome(case, number=1):
    expected, _ = gw.price_case(case)
    return next(line for line in expected["lines"] if line["line_no"] == number)


def fake_release(**records):
    return gw.Release(900099, "fixtures/fake", "0" * 64, records)


def record(record_type, key, value, start="2026-01-01", end=None):
    return {"record_type": record_type, "key": key, "value": value, "effective_from": start, "effective_to": end}


class Arithmetic(unittest.TestCase):
    def test_the_context_refuses_any_inexact_operation(self):
        with self.assertRaises(decimal.Inexact):
            D(1) / D(3)

    def test_percentages_and_products_stay_exact(self):
        self.assertEqual(D("2112") * D("113.28125") / gw.HUNDRED, D("2392.5"))
        self.assertEqual(gw.fmt(D("0.71") * D("0.950") * D("20.0000") * gw.HUNDRED), "1349")

    def test_rounds_once_under_each_rule(self):
        cases = [
            ("HALF_UP_CENT", "2392.5", "2393"), ("HALF_UP_CENT", "2392.4999", "2392"), ("HALF_UP_CENT", "-2392.5", "-2393"),
            ("HALF_EVEN_CENT", "2392.5", "2392"), ("HALF_EVEN_CENT", "2393.5", "2394"), ("HALF_EVEN_CENT", "2392.5001", "2393"),
            ("TRUNCATE", "2392.999", "2392"), ("TRUNCATE", "-2392.999", "-2392"), ("TRUNCATE", "2392", "2392"),
        ]
        for rule, unrounded, rounded in cases:
            with self.subTest(rule=rule, unrounded=unrounded):
                self.assertEqual(gw.fmt(gw.round_once(D(unrounded), rule)), rounded)

    def test_formats_without_exponents_or_trailing_zeros(self):
        self.assertEqual(gw.fmt(D("4224.000")), "4224")
        self.assertEqual(gw.fmt(D("1E+3")), "1000")
        self.assertEqual(gw.fmt(D("-0.00")), "0")
        self.assertEqual(gw.fmt(D("3075.6560")), "3075.656")
        self.assertEqual(gw.dollars(D("620")), "$6.20")
        self.assertEqual(gw.dollars(D("2700")), "$27.00")
        self.assertEqual(gw.dollars(D("3144.8")), "$31.448")


class Validation(unittest.TestCase):
    def setUp(self):
        self.case = golden("G02")

    def refused(self, mutate, message):
        case = copy.deepcopy(self.case)
        mutate(case)
        with self.assertRaisesRegex(gw.InputError, message):
            gw.validate(case)

    def line(self, case):
        return case["inputs"]["claim"]["lines"][0]

    def rate_record(self, case):
        return case["inputs"]["contract_versions"][0]["rate_records"][0]

    def test_accepts_every_committed_golden_file(self):
        for path in sorted(CLAIMS.glob("*.json")):
            with self.subTest(path=path.name):
                gw.validate(json.loads(path.read_text(encoding="utf-8")))

    def test_refuses_unknown_and_missing_keys(self):
        self.refused(lambda case: self.line(case).update(unit="2"), "unknown key unit")
        self.refused(lambda case: self.line(case).pop("units"), "missing units")
        self.refused(lambda case: case.update(format="other"), "format: must be")

    def test_refuses_fractional_or_zero_units(self):
        self.refused(lambda case: self.line(case).update(units="1.5"), "whole units")
        self.refused(lambda case: self.line(case).update(units="0"), "whole units")

    def test_refuses_a_non_calendar_date_and_unknown_place_of_service(self):
        self.refused(lambda case: self.line(case).update(service_date="2026-02-30"), "not a calendar date")
        self.refused(lambda case: self.line(case).update(place_of_service="99"), "not in inputs.place_of_service_settings")

    def test_refuses_float_and_malformed_amounts(self):
        self.refused(lambda case: self.line(case).update(charge_cents=6000), "integer cents written as a string")
        self.refused(lambda case: self.line(case).update(charge_cents="60.00"), "integer cents written as a string")
        self.refused(lambda case: self.rate_record(case)["parameters"].update(percentage="1e2"), "decimal string")

    def test_refuses_malformed_methods_and_parameters(self):
        self.refused(lambda case: self.rate_record(case).update(method="CAPITATION"), "method: must be one of FIXED_SCHEDULE")
        self.refused(lambda case: self.rate_record(case).update(method="FIXED_SCHEDULE"), "missing amount_cents")
        self.refused(lambda case: self.rate_record(case)["parameters"].update(year_basis="LOCKED:25"), "does not match")
        self.refused(lambda case: self.rate_record(case)["flags"].update(timed_units_rule="SOMETIMES"), "must be one of MEDICARE_POOLED")
        self.refused(lambda case: self.rate_record(case)["parameters"].pop("contract_adjustment"), "missing contract_adjustment")

    def test_refuses_malformed_fixed_lesser_of_and_per_visit_parameters(self):
        def as_method(method, parameters, **flag_changes):
            def mutate(case):
                record = self.rate_record(case)
                record.update(method=method, parameters=parameters)
                record["flags"].update(flag_changes)
            return mutate
        fixed = {"amount_cents": "3250", "contract_adjustment": None}
        self.refused(as_method("FIXED_SCHEDULE", {**fixed, "amount_cents": "-1"}), "amount_cents: must be zero or more")
        self.refused(as_method("PER_VISIT", {**fixed, "amount_cents": 3250}), "integer cents written as a string")
        self.refused(as_method("PER_VISIT", {"amount_cents": "3250"}), "missing contract_adjustment")
        lesser = {"schedule": {"method": "FIXED_SCHEDULE", "amount_cents": "3400"}, "charge_basis": "LINE_CHARGE", "contract_adjustment": None}
        self.refused(as_method("LESSER_OF", {**lesser, "schedule": "3400"}), "schedule: must be an object")
        self.refused(as_method("LESSER_OF", {**lesser, "schedule": {"method": "PER_VISIT", "amount_cents": "1"}}), "schedule.method: must be one of FIXED_SCHEDULE, PERCENT_OF_MEDICARE")
        self.refused(as_method("LESSER_OF", {**lesser, "schedule": {"method": "FIXED_SCHEDULE", "amount_cents": "1", "percentage": "1"}}), "unknown key percentage")
        self.refused(as_method("LESSER_OF", {**lesser, "schedule": {"method": "PERCENT_OF_MEDICARE", "percentage": "0", "year_basis": "CURRENT", "locality_basis": "practice", "conversion_factor": "qualifying_apm"}}), "percentage: must be above zero")
        self.refused(as_method("LESSER_OF", {**lesser, "charge_basis": "TOTAL_CHARGE"}), "charge_basis: must be one of LINE_CHARGE")
        for method, parameters in (("FIXED_SCHEDULE", fixed), ("PER_VISIT", fixed), ("LESSER_OF", lesser)):
            with self.subTest(method=method):
                self.refused(as_method(method, parameters, apply_mppr=True), "no fee-schedule practice-expense part")
        case = copy.deepcopy(self.case)
        as_method("FIXED_SCHEDULE", fixed, apply_mppr=False)(case)
        gw.validate(case)

    def test_refuses_a_malformed_contract_adjustment(self):
        def adjustment(value):
            return lambda case: self.rate_record(case)["parameters"].update(contract_adjustment=value)
        self.refused(adjustment("95"), "must be null or an object")
        self.refused(adjustment({"kind": "DISCOUNT", "percent": "5"}), "kind: must be one of PERCENT, CAP")
        self.refused(adjustment({"kind": "PERCENT", "percent": "0"}), "above 0 and at most 1000")
        self.refused(adjustment({"kind": "PERCENT", "percent": "1000.5"}), "above 0 and at most 1000")
        self.refused(adjustment({"kind": "PERCENT", "cap_cents": "100"}), "missing percent")
        self.refused(adjustment({"kind": "CAP", "cap_cents": "-5"}), "cap_cents: must be zero or more")
        for value in ({"kind": "PERCENT", "percent": "1000"}, {"kind": "CAP", "cap_cents": "0"}, None):
            case = copy.deepcopy(self.case)
            adjustment(value)(case)
            gw.validate(case)

    def test_refuses_what_the_engine_stops_as_an_engine_error(self):
        self.refused(lambda case: self.line(case).update(units="1000"), "more than 999 units")
        for status in ("23", "25"):
            self.refused(lambda case, status=status: case["inputs"]["claim"].update(claim_status_code=status), "no pricing rule yet")
        self.refused(lambda case: case["inputs"]["claim"].update(claim_status_code="24"), "must be one of 1, 2, 3, 4, 19, 20, 21, 22")

    def test_refuses_malformed_dates_and_windows(self):
        def version(case):
            return case["inputs"]["contract_versions"][0]
        self.refused(lambda case: case["inputs"].update(as_of="2026-13-01"), "inputs.as_of: 2026-13-01 is not a calendar date")
        self.refused(lambda case: case["inputs"]["claim"].update(remittance_date="soon"), "remittance_date: must be a date")
        self.refused(lambda case: version(case)["windows"].update(dispute_window_days=0), "whole number of days from 1 to 3650")
        self.refused(lambda case: version(case)["windows"].update(timely_filing_days="90"), "whole number of days")
        self.refused(lambda case: version(case)["windows"].update(appeal_levels={}), "appeal_levels: must be a list")
        self.refused(lambda case: version(case)["windows"].update(appeal_levels=[{"level": 2, "days": 30}]), "numbered 1, 2, 3 in order")
        self.refused(lambda case: version(case)["windows"].update(appeal_levels=[{"level": 1, "days": 4000}]), "from 1 to 3650")
        self.refused(lambda case: version(case)["windows"].pop("appeal_levels"), "missing appeal_levels")

    def test_refuses_a_reversed_claim_a_correction_supersedes(self):
        self.refused(lambda case: case["inputs"]["claim"].update(reversed=True, corrected=True), "a correction supersedes is not priced")

    def test_refuses_overlapping_mappings_and_versions(self):
        def two_mappings(case):
            case["inputs"]["mappings"].append({"mapping_id": "m2", "kind": "no_agreement", "contract_version_id": None, "effective_from": "2026-06-01", "effective_to": None})
        self.refused(two_mappings, "overlaps")

        def two_versions(case):
            version = copy.deepcopy(case["inputs"]["contract_versions"][0])
            version.update(contract_version_id="cv-other", version_no=2, effective_from="2026-06-01")
            case["inputs"]["contract_versions"].append(version)
        self.refused(two_versions, "overlap; versions never overlap")

    def test_refuses_a_mapping_to_a_missing_version_and_a_kind_mismatch(self):
        self.refused(lambda case: case["inputs"]["mappings"][0].update(contract_version_id="cv-missing"), "names no contract version")
        self.refused(lambda case: case["inputs"]["mappings"][0].update(kind="no_agreement"), "exactly when the kind is contract")

    def test_refuses_a_release_directory_outside_the_repository(self):
        self.refused(lambda case: case["inputs"]["release"].update(dir="../elsewhere"), "inside the repository")
        case = copy.deepcopy(self.case)
        case["inputs"]["release"]["dir"] = "/etc"
        with self.assertRaisesRegex(gw.InputError, "must be inside the repository"):
            gw.load_release(case["inputs"]["release"])

    def test_refuses_each_malformed_field(self):
        def version(case):
            return case["inputs"]["contract_versions"][0]

        def duplicate_line(case):
            case["inputs"]["claim"]["lines"].append(copy.deepcopy(self.line(case)))

        def duplicate_version(case):
            case["inputs"]["contract_versions"].append(copy.deepcopy(version(case)) | {"contract_id": "other"})

        def duplicate_record(case):
            version(case)["rate_records"].append(copy.deepcopy(self.rate_record(case)))

        def duplicate_mapping(case):
            case["inputs"]["mappings"][0]["effective_to"] = "2026-01-31"
            case["inputs"]["mappings"].append(copy.deepcopy(case["inputs"]["mappings"][0]) | {"effective_from": "2026-02-01", "effective_to": None})

        mutations = [
            (lambda case: case["inputs"].update(claim=[]), "inputs.claim: must be an object"),
            (lambda case: case.update(id=""), "id: must be a non-empty string"),
            (lambda case: case.update(notes=None), "notes: must be a string"),
            (lambda case: case["inputs"]["release"].update(number=True), "positive whole number"),
            (lambda case: case["inputs"].update(place_of_service_settings={}), "must map each place of service"),
            (lambda case: case["inputs"]["claim"].update(lines=[]), "at least one line"),
            (lambda case: case["inputs"]["claim"].update(reversed="no"), "must be true or false"),
            (lambda case: case["inputs"]["mappings"][0].update(kind="bogus"), "must be one of contract"),
            (lambda case: self.line(case).update(service_date=20260310), "must be a date written YYYY-MM-DD"),
            (lambda case: self.line(case).update(modifiers="GP"), "modifiers: must be a list"),
            (lambda case: self.line(case).update(modifiers=["GP", "CQ", "59", "XS", "KX"]), "at most four distinct modifiers"),
            (lambda case: self.line(case).update(patient_share_adjustments={}), "must be a list"),
            (duplicate_line, "distinct positive whole number"),
            (lambda case: case["inputs"]["mappings"][0].update(effective_to="2025-12-31"), "is before effective_from"),
            (lambda case: case["inputs"].update(mappings={}), "inputs.mappings: must be a list"),
            (lambda case: case["inputs"].update(contract_versions={}), "inputs.contract_versions: must be a list"),
            (duplicate_version, "appears twice"),
            (duplicate_record, "rate_record_id rr-g02-1 appears more than once"),
            (duplicate_mapping, "mapping_id map-g02 appears more than once"),
            (lambda case: version(case).update(version_no=0), "version_no: must be a positive whole number"),
            (lambda case: version(case).update(rate_records={}), "rate_records: must be a list"),
            (lambda case: self.rate_record(case)["scope"].update(modifier_sets="GP"), "null or a list of modifier lists"),
            (lambda case: self.rate_record(case)["parameters"].update(percentage="0"), "must be above zero"),
            (lambda case: self.rate_record(case).update(method="UNSUPPORTED"), "unknown key percentage"),
            (lambda case: self.rate_record(case)["flags"].update(rounding="HALF_DOWN"), "must be one of HALF_UP_CENT"),
            (lambda case: case.update(provenance={"computed_by": "x", "specialist_verified": "no"}), "must be true or false"),
        ]
        for mutate, message in mutations:
            with self.subTest(message=message):
                self.refused(mutate, message)


class Releases(unittest.TestCase):
    def test_reads_a_release_only_when_its_manifest_matches(self):
        reference = dict(golden("G01")["inputs"]["release"])
        self.assertIn("pfs_rvu", gw.load_release(reference).records)
        with self.assertRaisesRegex(gw.InputError, "has SHA-256"):
            gw.load_release({**reference, "manifest_sha256": "0" * 64})
        with self.assertRaisesRegex(gw.InputError, "manifest names release 900001"):
            gw.load_release({**reference, "number": 900002})

    def test_refuses_a_release_whose_files_were_changed(self):
        reference = dict(golden("G01")["inputs"]["release"])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            shutil.copytree(gw.REPOSITORY / reference["dir"], root / reference["dir"])
            saved, gw.REPOSITORY = gw.REPOSITORY, root
            try:
                gw.RELEASES.clear()
                (root / reference["dir"] / "pfs_rvu/2026/PPRRVU_SYNTHETIC.json").write_text("[]\n", encoding="utf-8")
                with self.assertRaisesRegex(gw.InputError, "does not match its MANIFEST.json hash"):
                    gw.load_release(reference)
                (root / reference["dir"] / "extra.json").write_text("[]\n", encoding="utf-8")
                with self.assertRaisesRegex(gw.InputError, "do not match MANIFEST.json"):
                    gw.load_release(reference)
                with self.assertRaisesRegex(gw.InputError, "holds no MANIFEST.json"):
                    gw.load_release({**reference, "dir": "fixtures"})
            finally:
                gw.REPOSITORY = saved
                gw.RELEASES.clear()

    def test_looks_up_records_in_force_and_the_latest_of_a_year(self):
        release = fake_release(pfs_gpci=[
            record("pfs_gpci", {"carrier": "1", "locality": "01"}, {"n": "a"}, "2025-01-01", "2025-06-30"),
            record("pfs_gpci", {"carrier": "1", "locality": "01"}, {"n": "b"}, "2025-07-01", "2025-12-31"),
        ])
        key = {"carrier": "1", "locality": "01"}
        self.assertEqual(release.in_force("pfs_gpci", key, "2025-03-01")["value"]["n"], "a")
        self.assertIsNone(release.in_force("pfs_gpci", key, "2026-03-01"))
        self.assertEqual(release.latest_in_year("pfs_gpci", key, 2025)["value"]["n"], "b")
        self.assertIsNone(release.latest_in_year("pfs_gpci", key, 2024))
        overlapping = fake_release(pfs_gpci=[record("pfs_gpci", key, {}, "2025-01-01"), record("pfs_gpci", key, {}, "2025-06-01")])
        with self.assertRaisesRegex(gw.InputError, "two pfs_gpci records"):
            overlapping.in_force("pfs_gpci", key, "2025-07-01")


class Agreement(unittest.TestCase):
    def test_no_mapping_no_agreement_and_ma_noncontracted(self):
        self.assertEqual(outcome(golden("G36"))["unpriced_reason"], "NO_MAPPING")
        self.assertEqual(outcome(golden("G37"), 1)["unpriced_reason"], "NO_MAPPING")
        self.assertEqual(outcome(golden("G37"), 2)["terms"]["mapping_kind"], "ma_noncontracted")
        for kind in gw.NO_AGREEMENT_KINDS:
            case = golden("G38")
            case["inputs"]["mappings"][0]["kind"] = kind
            self.assertEqual(outcome(case)["unpriced_reason"], "NO_AGREEMENT", kind)

    def test_only_a_signed_off_version_in_force_prices(self):
        case = golden("G47")
        self.assertEqual(outcome(case, 1)["terms"]["contract_version_id"], "cv-g47-1")
        self.assertEqual(outcome(case, 2)["unpriced_reason"], "DATE_OUTSIDE_VERSIONS")
        self.assertEqual(outcome(case, 3)["terms"]["contract_version_id"], "cv-g47-2")
        for status in ("draft", "proposed", "approved", "superseded"):
            case = golden("G02")
            case["inputs"]["contract_versions"][0]["status"] = status
            self.assertEqual(outcome(case)["unpriced_reason"], "DATE_OUTSIDE_VERSIONS", status)

    def test_rate_record_scope(self):
        case = golden("G41")
        for number in (1, 2, 3):
            self.assertEqual(outcome(case, number)["unpriced_reason"], "NO_RATE_FOR_CODE")
        case["inputs"]["claim"]["lines"][2]["modifiers"] = ["GP"]
        self.assertEqual(outcome(case, 3)["outcome"], "priced")
        case = golden("G40")
        self.assertEqual(outcome(case, 1)["unpriced_reason"], "AMBIGUOUS_RATE")
        self.assertEqual(outcome(case, 2)["terms"]["rate_record_id"], "rr-g40-any")

    def test_a_rate_record_outside_its_window_does_not_match(self):
        self.assertEqual(outcome(golden("G42"))["unpriced_reason"], "NO_RATE_FOR_CODE")
        _, worksheet = gw.price_case(golden("G42"))
        self.assertIn("  - rr-g42-1 (any code; any modifiers; any place of service; 2026-01-01 to 2026-03-31): no match, 2026-04-15 is outside its window.", worksheet)

    def test_modifier_sets_match_as_sets(self):
        case = golden("G41")
        line = case["inputs"]["claim"]["lines"][2]
        line["modifiers"] = ["59", "GP"]
        case["inputs"]["contract_versions"][0]["rate_records"][0]["scope"]["modifier_sets"] = [["GP", "59"]]
        self.assertEqual(outcome(case, 3)["outcome"], "priced")

    def test_unsupported_method(self):
        self.assertEqual(outcome(golden("G53"), 1)["unpriced_reason"], "UNSUPPORTED_METHOD")


class BaseAmount(unittest.TestCase):
    def test_non_facility_and_facility_values(self):
        self.assertEqual(outcome(golden("G02"), 1)["base_cents"], "4646.4")
        self.assertEqual(outcome(golden("G14"), 1)["base_cents"], "1162")

    def test_both_conversion_factors(self):
        case = golden("G08")
        self.assertEqual(outcome(case, 1)["base_cents"], "2122.56")
        case["inputs"]["contract_versions"][0]["rate_records"][0]["parameters"]["conversion_factor"] = "non_qualifying_apm"
        self.assertEqual(outcome(case, 1)["base_cents"], "2112")

    def test_year_basis(self):
        case = golden("G09")
        self.assertEqual(outcome(case, 1)["base_cents"], "4041.9773562")
        case["inputs"]["contract_versions"][0]["rate_records"][0]["parameters"]["year_basis"] = "CURRENT"
        self.assertEqual(outcome(case, 1)["base_cents"], "4435.2")
        self.assertEqual(outcome(golden("G11"), 1)["unpriced_reason"], "NO_PFS_VALUE")
        self.assertEqual(outcome(golden("G12"))["unpriced_reason"], "NO_PFS_VALUE")

    def test_no_pfs_value_for_a_missing_code_or_an_na_setting(self):
        self.assertEqual(outcome(golden("G43"))["unpriced_reason"], "NO_PFS_VALUE")
        self.assertEqual(outcome(golden("G15"), 1)["unpriced_reason"], "NO_PFS_VALUE")

    def test_a_zip_that_needs_its_plus_four_is_an_engine_error_not_a_golden_line(self):
        case = golden("G02")
        case["inputs"]["practice_settings"]["zip"] = "00012"
        with self.assertRaisesRegex(gw.InputError, "needs its ZIP\\+4"):
            gw.price_case(case)

    def test_missing_locality_gpci_or_factor_is_an_engine_error_not_a_golden_line(self):
        case = golden("G02")
        line = gw.Line(case["inputs"]["claim"]["lines"][0])
        gw.resolve_agreement(case, line)
        rvu = record("pfs_rvu", {"hcpcs": "97110", "modifier": ""}, {
            "work_rvu": "0.31", "pe_rvu_non_facility": "0.71", "pe_rvu_facility": "0.21", "mp_rvu": "0.11", "non_facility_pe_na": False,
            "facility_pe_na": False, "status": "A", "year": 2026, "quarter": "A"})
        locality = record("locality_map", {"zip": "00011"}, {"carrier": "99999", "locality": "01"})
        gpci = record("pfs_gpci", {"carrier": "99999", "locality": "01"}, {"work_gpci": "1", "pe_gpci": "1", "mp_gpci": "1"})
        for records, message in (
            ({"pfs_rvu": [rvu]}, "maps no locality"),
            ({"pfs_rvu": [rvu], "locality_map": [locality]}, "has no GPCI"),
            ({"pfs_rvu": [rvu], "locality_map": [locality], "pfs_gpci": [gpci]}, "conversion factor"),
        ):
            with self.subTest(message=message), self.assertRaisesRegex(gw.InputError, message):
                gw.base_amount(case, line, fake_release(**records))


class Adjustments(unittest.TestCase):
    def adjustments(self, case, number):
        return {item["name"]: (item["before_cents"], item["after_cents"]) for item in outcome(case, number)["adjustments"]}

    def test_the_worked_example(self):
        case = golden("G01")
        self.assertEqual([outcome(case, n)["expected_allowed_cents"] for n in (1, 2, 3)], ["3076", "1779", "2619"])
        self.assertEqual(self.adjustments(case, 1)["mppr"], ("4224", "3144.8"))
        self.assertEqual(self.adjustments(case, 1)["sequestration"], ("3144.8", "3075.656"))

    def test_flags_off_apply_nothing(self):
        case = golden("G02")
        self.assertEqual(outcome(case, 1)["adjustments"], [])
        self.assertEqual(outcome(case, 1)["expected_unrounded_cents"], "4646.4")

    def test_mppr_ties_go_to_the_lower_line_number(self):
        plain_first, cq_first = golden("G22"), golden("G23")
        self.assertEqual(self.adjustments(plain_first, 1)["mppr"], ("2112", "2112"))
        self.assertEqual(self.adjustments(plain_first, 2)["mppr"], ("2112", "1572.4"))
        self.assertEqual(self.adjustments(cq_first, 1)["mppr"], ("2112", "2112"))
        self.assertEqual(self.adjustments(cq_first, 1)["assistant_reduction"], ("2112", "1626.24"))

    def test_mppr_ranks_only_flagged_always_therapy_units_per_day(self):
        case = golden("G25")
        self.assertEqual(outcome(case, 1)["adjustments"], [])
        self.assertEqual(self.adjustments(case, 3)["mppr"], ("1974", "1502.8"))
        self.assertEqual(self.adjustments(golden("G20"), 1)["mppr"], ("5917", "5917"))
        self.assertEqual(self.adjustments(golden("G21"), 2)["mppr"], ("2458", "2458"))

    def test_mppr_falls_back_to_the_general_rate(self):
        listed = record("mppr_rate", {"hcpcs": "97110", "modifier": ""}, {"pe_reduction_percent": None})
        general = record("mppr_rate", {"component": "practice_expense"}, {"reduction_percent": "50", "applies_to": "x"})
        rate, _ = gw.mppr_rate_for(fake_release(mppr_rate=[listed, general]), "97110", "2026-03-10")
        self.assertEqual(rate, D(50))
        self.assertEqual(gw.mppr_rate_for(fake_release(mppr_rate=[general]), "97110", "2026-03-10"), (None, None))
        with self.assertRaisesRegex(gw.InputError, "no general rate"):
            gw.mppr_rate_for(fake_release(mppr_rate=[listed]), "97110", "2026-03-10")

    def test_assistant_reduction(self):
        case = golden("G03")
        self.assertEqual(self.adjustments(case, 1)["assistant_reduction"], ("3144.8", "2421.496"))
        self.assertEqual(self.adjustments(case, 2)["assistant_reduction"], ("1819.6", "1819.6"))

    def test_assistant_reduction_needs_one_percentage(self):
        line = gw.Line(golden("G03")["inputs"]["claim"]["lines"][0])
        line.facts = {**line.facts, "modifiers": ["GP", "CQ", "CO"]}
        line.amount = D(1000)
        same = fake_release(assistant_modifier=[record("assistant_modifier", {"modifier": m}, {"payment_percent": "80"}) for m in ("CQ", "CO")])
        gw.assistant_reduction(line, same)
        self.assertEqual(line.amount, D(800))
        line.amount = D(1000)
        differ = fake_release(assistant_modifier=[
            record("assistant_modifier", {"modifier": "CQ"}, {"payment_percent": "80"}),
            record("assistant_modifier", {"modifier": "CO"}, {"payment_percent": "85"}),
        ])
        with self.assertRaisesRegex(gw.InputError, "different percentages"):
            gw.assistant_reduction(line, differ)
        with self.assertRaisesRegex(gw.InputError, "no assistant_modifier record"):
            gw.assistant_reduction(line, fake_release())

    def test_sequestration(self):
        line = gw.Line(golden("G26")["inputs"]["claim"]["lines"][0])
        line.amount = D(2112)
        gw.sequestration(line, fake_release(sequestration=[record("sequestration", {"program": "medicare"}, {"reduction_percent": "2", "suspended": False})]))
        self.assertEqual(line.amount, D("2112") - (D("2112") - D("422")) * D("0.02"))
        line.amount = D(2112)
        gw.sequestration(line, fake_release(sequestration=[record("sequestration", {"program": "medicare"}, {"reduction_percent": "0", "suspended": True})]))
        self.assertEqual(line.amount, D(2112))
        with self.assertRaisesRegex(gw.InputError, "never a silent 0%"):
            gw.sequestration(line, fake_release())

    def test_sequestration_takes_nothing_when_the_patient_share_exceeds_the_amount(self):
        self.assertEqual(self.adjustments(golden("G27"), 1)["sequestration"], ("1030", "1030"))


class PatientShareAndClaims(unittest.TestCase):
    def test_patient_share_is_reported_not_subtracted(self):
        line = outcome(golden("G26"), 2)
        self.assertEqual(line["patient_share_cents"], "2092")
        self.assertEqual(line["expected_unrounded_cents"], "2447.02")

    def test_secondary_tertiary_and_reversed_claims(self):
        self.assertEqual(outcome(golden("G44"))["unpriced_reason"], "SECONDARY_PAYER")
        self.assertEqual(outcome(golden("G45"))["unpriced_reason"], "SECONDARY_PAYER")
        self.assertEqual(outcome(golden("G46"))["unpriced_reason"], "NO_AGREEMENT")
        self.assertEqual(outcome(golden("G51"))["unpriced_reason"], "REVERSED_CLAIM")
        self.assertEqual(outcome(golden("G52"))["unpriced_reason"], "REVERSED_CLAIM")
        self.assertEqual(outcome(golden("G28"))["outcome"], "priced")

    def test_forwarded_claims(self):
        case = golden("G54")
        self.assertEqual([outcome(case, n)["expected_allowed_cents"] for n in (1, 2)], ["4646", "2704"])
        for status, reason in (("19", None), ("20", "SECONDARY_PAYER"), ("21", "SECONDARY_PAYER"), ("1", None)):
            case["inputs"]["claim"]["claim_status_code"] = status
            self.assertEqual(outcome(case).get("unpriced_reason"), reason, status)
        self.assertEqual(outcome(golden("G55"), 2)["unpriced_reason"], "SECONDARY_PAYER")
        self.assertEqual(outcome(golden("G56"))["unpriced_reason"], "SECONDARY_PAYER")

    def test_a_timed_units_rule_of_unknown_stops_the_line_before_the_reduction(self):
        case = golden("G57")
        self.assertEqual([outcome(case, n).get("unpriced_reason") for n in (1, 2, 3)], ["UNITS_RULE_UNKNOWN", "UNITS_RULE_UNKNOWN", None])
        self.assertEqual(outcome(case, 3)["adjustments"], [{"name": "mppr", "before_cents": "2970", "after_cents": "2970"}])
        case["inputs"]["contract_versions"][0]["rate_records"][0]["flags"]["timed_units_rule"] = "MEDICARE_POOLED"
        reduced = outcome(case, 1)["adjustments"][0]
        self.assertEqual((reduced["name"], reduced["before_cents"]), ("mppr", "4646.4"))
        self.assertLess(D(reduced["after_cents"]), D(reduced["before_cents"]))
        _, worksheet = gw.price_case(golden("G57"))
        self.assertTrue(any("timed-units rule UNKNOWN" in item for item in worksheet))

    def test_variance_is_expected_less_observed(self):
        case = golden("G58")
        self.assertEqual([outcome(case, n)["variance_cents"] for n in (1, 2)], ["646", "-196"])
        self.assertEqual(outcome(golden("G01"))["variance_cents"], "-1124")

    def test_rounding_comes_from_the_record_then_the_practice_then_the_plan(self):
        self.assertEqual(outcome(golden("G29"))["expected_allowed_cents"], "3073")
        self.assertEqual(outcome(golden("G33"))["rounding"], "HALF_EVEN_CENT")
        self.assertEqual(outcome(golden("G34"))["rounding"], "HALF_UP_CENT")
        self.assertEqual(outcome(golden("G35"))["expected_allowed_cents"], "2396")


class Windows(unittest.TestCase):
    def window(self, case, number=1):
        return outcome(case, number)["window"]

    def test_no_remittance_date_is_no_window(self):
        self.assertEqual(self.window(golden("G02")), {"ends_on": None, "status": "NO_WINDOW"})

    def test_a_contract_window_in_days_from_the_remittance_date(self):
        self.assertEqual(self.window(golden("G58")), {"ends_on": "2026-10-15", "status": "OPEN"})
        self.assertEqual(self.window(golden("G59"), 2), {"ends_on": "2026-09-19", "status": "WINDOW_PASSED"})
        case = golden("G58")
        case["inputs"]["as_of"] = "2026-10-16"
        self.assertEqual(self.window(case), {"ends_on": "2026-10-15", "status": "WINDOW_PASSED"})

    def test_passing_the_window_never_changes_the_amount(self):
        for number in (1, 2):
            open_line, passed = outcome(golden("G58"), number), outcome(golden("G59"), number)
            self.assertEqual({k: v for k, v in open_line.items() if k not in ("terms", "window")}, {k: v for k, v in passed.items() if k not in ("terms", "window")})

    def test_a_silent_contract_takes_the_release_default_or_none(self):
        self.assertEqual(self.window(golden("G60")), {"ends_on": "2026-09-30", "status": "WINDOW_PASSED"})
        self.assertEqual(self.window(golden("G61")), {"ends_on": None, "status": "NO_WINDOW"})
        _, worksheet = gw.price_case(golden("G61"))
        self.assertTrue(any("has no dispute_window record for commercial_default redetermination" in item for item in worksheet))

    def test_medicare_advantage_takes_the_first_level_medicare_window(self):
        self.assertEqual(self.window(golden("G62")), {"ends_on": "2026-10-20", "status": "OPEN"})
        self.assertEqual(self.window(golden("G63")), {"ends_on": "2026-12-14", "status": "OPEN"})

    def test_months_keep_the_day_or_take_the_last_of_the_month(self):
        self.assertEqual(gw.add_months("2026-05-31", 4), "2026-09-30")
        self.assertEqual(gw.add_months("2026-01-31", 1), "2026-02-28")
        self.assertEqual(gw.add_months("2028-01-31", 1), "2028-02-29")
        self.assertEqual(gw.add_months("2026-11-15", 3), "2027-02-15")
        self.assertEqual(gw.add_days("2026-12-31", 1), "2027-01-01")

    def test_the_variant_release_suspends_sequestration_and_falls_back_to_the_general_rate(self):
        self.assertEqual(outcome(golden("G63"))["adjustments"][2], {"name": "sequestration", "before_cents": "3684.4", "after_cents": "3684.4"})
        self.assertEqual(outcome(golden("G64"), 2)["adjustments"][0], {"name": "mppr", "before_cents": "3948", "after_cents": "2887.8"})


class Methods(unittest.TestCase):
    def test_a_fixed_schedule_is_its_amount_per_unit_times_the_units(self):
        case = golden("G101")
        self.assertEqual([(outcome(case, n)["base_cents"], outcome(case, n)["method"]) for n in (1, 2, 3)], [("6500", "FIXED_SCHEDULE"), ("3175", "FIXED_SCHEDULE"), ("8625", "FIXED_SCHEDULE")])
        case["inputs"]["claim"]["lines"][0]["units"] = "4"
        self.assertEqual(outcome(case, 1)["base_cents"], "13000")

    def test_lesser_of_takes_the_lesser_of_the_schedule_and_the_charge(self):
        self.assertEqual([outcome(golden("G121"), n)["base_cents"] for n in (1, 2)], ["6000", "3400"])
        self.assertEqual([outcome(golden("G122"), n)["base_cents"] for n in (1, 2)], ["3400", "10200"])
        self.assertEqual([outcome(golden("G123"), n)["base_cents"] for n in (1, 2)], ["3000", "7396.25"])
        self.assertEqual([outcome(golden("G135"), n)["base_cents"] for n in (1, 2)], ["6800", "2400"])
        _, worksheet = gw.price_case(golden("G122"))
        self.assertTrue(any("(they are equal)" in item for item in worksheet))

    def test_a_lesser_of_percent_schedule_without_a_value_is_no_pfs_value(self):
        self.assertEqual([outcome(golden("G126"), n).get("unpriced_reason") for n in (1, 2, 3)], ["NO_PFS_VALUE", "NO_PFS_VALUE", None])

    def test_per_visit_the_first_included_line_carries_it_and_the_others_expect_zero(self):
        self.assertEqual([outcome(golden("G141"), n)["base_cents"] for n in (1, 2, 3)], ["8800", "0", "0"])
        self.assertEqual([outcome(golden("G145"), n)["base_cents"] for n in (1, 2, 3, 4)], ["8800", "0", "8800", "0"])
        self.assertEqual([outcome(golden("G147"), n)["base_cents"] for n in (1, 2, 3)], ["8800", "3000", "0"])

    def test_per_visit_follows_line_numbers_not_listing_order(self):
        case = golden("G142")
        listed = outcome(case, 1)
        case["inputs"]["claim"]["lines"].reverse()
        self.assertEqual(outcome(case, 1), listed)
        self.assertEqual(listed["base_cents"], "8800")

    def test_per_visit_falls_to_the_next_line_when_the_first_stops(self):
        case = golden("G146")
        self.assertEqual([outcome(case, n).get("unpriced_reason") for n in (1, 2, 3)], ["MUE_EXCEEDED", None, None])
        self.assertEqual([outcome(case, n)["base_cents"] for n in (2, 3)], ["8800", "0"])

    def test_per_visit_assistant_reduction_follows_the_line(self):
        self.assertEqual(outcome(golden("G143"), 1)["adjustments"][0], {"name": "assistant_reduction", "before_cents": "8800", "after_cents": "6776"})
        self.assertEqual(outcome(golden("G144"), 2)["adjustments"][0], {"name": "assistant_reduction", "before_cents": "0", "after_cents": "0"})


class Edits(unittest.TestCase):
    def flags(self, name, number):
        return outcome(golden(name), number)["review_flags"]

    def test_units_above_the_mue_with_ncci_on_stop_for_review(self):
        case = golden("G105")
        self.assertEqual([outcome(case, n).get("unpriced_reason") for n in (1, 2, 3)], ["MUE_EXCEEDED", None, "MUE_EXCEEDED"])
        case["inputs"]["contract_versions"][0]["rate_records"][0]["flags"]["apply_ncci"] = False
        self.assertEqual(outcome(case, 1)["base_cents"], "26000")
        self.assertEqual(outcome(golden("G182"), 2)["base_cents"], "14800")

    def test_a_code_without_an_mue_record_has_no_limit(self):
        self.assertEqual(outcome(golden("G112"), 1)["base_cents"], "8500")
        _, worksheet = gw.price_case(golden("G112"))
        self.assertTrue(any("has no ncci_mue record for 97750" in item for item in worksheet))

    def test_the_mue_comes_before_the_timed_units_rule(self):
        case = golden("G109")
        case["inputs"]["claim"]["lines"][1]["procedure_code"] = "97110"
        case["inputs"]["claim"]["lines"][1]["units"] = "8"
        self.assertEqual(outcome(case, 2)["unpriced_reason"], "MUE_EXCEEDED")

    def test_a_procedure_to_procedure_edit_flags_the_column_two_line_and_never_prices(self):
        self.assertEqual(self.flags("G102", 2), [{"flag": "NCCI_PTP", "column1_line_no": 1}])
        self.assertEqual(self.flags("G102", 1), [])
        self.assertEqual(outcome(golden("G102"), 2)["expected_allowed_cents"], "6666")
        self.assertEqual(outcome(golden("G161"), 3)["expected_allowed_cents"], outcome(golden("G162"), 3)["expected_allowed_cents"])

    def test_59_or_an_x_modifier_on_either_line_bypasses_an_indicator_1_edit(self):
        self.assertEqual([self.flags("G103", n) for n in (1, 2)], [[], []])
        self.assertEqual(self.flags("G104", 2), [])
        self.assertEqual(self.flags("G104", 4), [{"flag": "NCCI_PTP", "column1_line_no": 3}])
        self.assertEqual(gw.bypassing(["GP", "59", "XS", "XU", "KX"]), ["59", "XS", "XU"])

    def test_indicators_0_and_9_let_no_modifier_bypass(self):
        self.assertEqual(self.flags("G125", 2), [{"flag": "NCCI_PTP", "column1_line_no": 1}])
        self.assertEqual(self.flags("G164", 2), [{"flag": "NCCI_PTP", "column1_line_no": 1}])
        self.assertEqual(self.flags("G165", 2), [])

    def test_the_column_two_line_terms_decide_and_an_unpriced_column_one_line_still_counts(self):
        self.assertEqual([self.flags("G136", n) for n in (2, 4)], [[], []])
        self.assertEqual(self.flags("G167", 3), [{"flag": "NCCI_PTP", "column1_line_no": 1}])

    def test_timed_units_rules_are_recorded(self):
        _, worksheet = gw.price_case(golden("G112"))
        self.assertTrue(any("under the timed-units rule MEDICARE_POOLED, recorded" in item for item in worksheet))
        _, worksheet = gw.price_case(golden("G101"))
        self.assertTrue(any("under the timed-units rule PER_CODE, recorded" in item for item in worksheet))


class ContractAdjustments(unittest.TestCase):
    def test_a_percentage_of_the_amount_after_the_medicare_adjustments(self):
        line = outcome(golden("G121"), 1)
        self.assertEqual([item["name"] for item in line["adjustments"]], ["sequestration", "contract_adjustment"])
        self.assertEqual(line["adjustments"][1], {"name": "contract_adjustment", "before_cents": "5856", "after_cents": "5738.88"})

    def test_a_cap_on_the_line(self):
        self.assertEqual(outcome(golden("G111"), 1)["adjustments"][1], {"name": "contract_adjustment", "before_cents": "6866", "after_cents": "6000"})
        self.assertEqual(outcome(golden("G111"), 2)["adjustments"][1], {"name": "contract_adjustment", "before_cents": "2643.41", "after_cents": "2643.41"})
        self.assertEqual(outcome(golden("G163"), 1)["expected_allowed_cents"], "5800")

    def test_no_adjustment_leaves_no_entry(self):
        self.assertNotIn("contract_adjustment", [item["name"] for item in outcome(golden("G102"), 1)["adjustments"]])
        self.assertNotIn("contract_adjustment", [item["name"] for item in outcome(golden("G01"), 1)["adjustments"]])


class FixturePayers(unittest.TestCase):
    def test_the_committed_claims_carry_the_fixture_payers_inputs(self):
        import fixture_payers  # noqa: PLC0415
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = fixture_payers.main(["check"])
        self.assertEqual(status, 0, out.getvalue())
        self.assertIn("5 payer(s)", out.getvalue())
        self.assertGreaterEqual(sum(len(spec["lines"]) for spec in fixture_payers.CLAIMS), 200)

    def test_each_payer_is_one_contract(self):
        import fixture_payers  # noqa: PLC0415
        for payer in fixture_payers.PAYERS.values():
            with self.subTest(payer=payer.letter):
                self.assertEqual(len({version["contract_id"] for version in payer.contract_versions}), 1)
                methods = {record["method"] for version in payer.contract_versions for record in version["rate_records"]}
                self.assertTrue(methods)

    def test_usage(self):
        import fixture_payers  # noqa: PLC0415
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(fixture_payers.main([]), 2)
        self.assertIn("usage", err.getvalue())


class Files(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        source = next(CLAIMS.glob("G01-*.json"))
        self.path = self.root / source.name
        case = json.loads(source.read_text(encoding="utf-8"))
        case.update(expected=None, worksheet=None, provenance=None)
        self.path.write_text(json.dumps(case), encoding="utf-8")

    def tearDown(self):
        self.directory.cleanup()

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            status = gw.main(list(argv))
        return status, out.getvalue(), err.getvalue()

    def test_write_then_check_round_trips(self):
        status, _, _ = self.run_main("check", str(self.path))
        self.assertEqual(status, 1)
        self.assertEqual(self.run_main("write", str(self.path))[0], 0)
        written = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(written["provenance"], {"computed_by": gw.COMPUTED_BY, "specialist_verified": False})
        self.assertTrue(gw.worksheet_path(self.path).read_text(encoding="utf-8").startswith("# Worksheet G01"))
        status, out, _ = self.run_main("check", "--json", str(self.path))
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(out), {"files": 1, "cases": 1, "lines": 3, "differences": []})
        status, out, _ = self.run_main("show", str(self.path))
        self.assertEqual((status, out), (0, gw.worksheet_path(self.path).read_text(encoding="utf-8")))

    def test_check_names_every_difference_and_never_writes(self):
        self.run_main("write", str(self.path))
        case = json.loads(self.path.read_text(encoding="utf-8"))
        case["expected"]["lines"][0]["expected_allowed_cents"] = "3077"
        case["worksheet"][0] = "# edited"
        self.path.write_text(gw.serialize(case), encoding="utf-8")
        gw.worksheet_path(self.path).unlink()
        before = self.path.read_text(encoding="utf-8")
        status, out, _ = self.run_main("check", "--json", str(self.path))
        report = json.loads(out)
        self.assertEqual(status, 1)
        fields = [item["field"] for item in report["differences"]]
        self.assertIn("expected_allowed_cents", fields)
        self.assertIn("worksheet (from line 1)", fields)
        self.assertTrue(any(field.endswith(".worksheet.md") for field in fields))
        money = next(item for item in report["differences"] if item["field"] == "expected_allowed_cents")
        self.assertEqual((money["line_no"], money["golden"], money["worksheet"]), (1, "3077", "3076"))
        self.assertEqual(self.path.read_text(encoding="utf-8"), before)
        status, out, _ = self.run_main("check", str(self.path))
        self.assertIn("difference(s)", out)

    def test_check_reports_hand_formatting_and_unreadable_inputs(self):
        self.run_main("write", str(self.path))
        self.path.write_text(json.dumps(json.loads(self.path.read_text(encoding="utf-8"))), encoding="utf-8")
        report = json.loads(self.run_main("check", "--json", str(self.path))[1])
        self.assertEqual([item["field"] for item in report["differences"]], ["(formatting)"])
        self.path.write_text("{", encoding="utf-8")
        report = json.loads(self.run_main("check", "--json", str(self.path))[1])
        self.assertEqual(report["differences"][0]["field"], "(inputs)")
        status, _, err = self.run_main("write", str(self.path))
        self.assertEqual(status, 1)
        self.assertIn("not valid JSON", err)
        self.assertEqual(self.run_main("show", str(self.path))[0], 1)

    def test_write_refuses_to_change_a_case_the_specialist_verified(self):
        self.run_main("write", str(self.path))
        case = json.loads(self.path.read_text(encoding="utf-8"))
        case["provenance"]["specialist_verified"] = True
        case["inputs"]["claim"]["lines"][0]["units"] = "3"
        self.path.write_text(gw.serialize(case), encoding="utf-8")
        status, _, err = self.run_main("write", str(self.path))
        self.assertEqual(status, 1)
        self.assertIn("verified by the specialist", err)
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["expected"], case["expected"])

    def test_check_names_a_golden_line_the_worksheet_no_longer_has(self):
        self.run_main("write", str(self.path))
        case = json.loads(self.path.read_text(encoding="utf-8"))
        case["expected"]["lines"].append({"line_no": 9, "outcome": "unpriced", "unpriced_reason": "NO_MAPPING"})
        del case["expected"]["lines"][0]
        self.path.write_text(gw.serialize(case), encoding="utf-8")
        report = json.loads(self.run_main("check", "--json", str(self.path))[1])
        lines = sorted((item["line_no"], item["golden"] is None) for item in report["differences"] if item["field"] == "(line)")
        self.assertEqual(lines, [(1, True), (9, False)])

    def test_checks_every_committed_file_by_default(self):
        status, out, _ = self.run_main("check", "--json")
        report = json.loads(out)
        self.assertEqual((status, report["lines"], report["differences"]), (0, 326, []))

    def test_trims_blank_lines_at_both_ends(self):
        self.assertEqual(gw.trim(["", "a", "", "b", ""]), ["a", "", "b"])

    def test_compact_layout(self):
        self.assertEqual(gw.dumps({"a": [1, 2], "b": {"c": None}}), '{\n  "a": [1, 2],\n  "b": {"c": null}\n}')
        self.assertEqual(gw.dumps([]), "[]")
        self.assertEqual(gw.dumps({}), "{}")
        self.assertIn("\n", gw.dumps(["x" * 120]))


class Independence(unittest.TestCase):
    def test_imports_only_the_standard_library(self):
        imported = set()
        for line in Path(gw.__file__).read_text(encoding="utf-8").splitlines():
            words = line.split()
            if words[:1] == ["import"] or (words[:1] == ["from"] and "import" in words):
                imported.add(words[1].split(".")[0])
        self.assertTrue(imported)
        self.assertEqual(sorted(name for name in imported if name not in sys.stdlib_module_names), [])


if __name__ == "__main__":
    unittest.main(verbosity=1)
