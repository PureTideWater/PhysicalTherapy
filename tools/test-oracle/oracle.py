"""The 835 oracle (PRD section 18): pyx12 reads and validates each synthetic fixture.

Run with ``python3 -I tools/test-oracle/oracle.py [--root DIR] SPEC...`` where each SPEC is a file path
or ``path!entry`` for one entry of a zip. It prints one JSON document on stdout:

    {"format": "tp-oracle-run/1", "pyx12": "<version>", "results": [RESULT, ...]}

and each RESULT is

    {"file": SPEC relative to --root, "valid": bool, "rejections": [CATEGORY, ...],
     "errors": [{"level", "code", "message", "segment", "line"}], "summary": SUMMARY | null,
     "summarySha256": hex | null}

``valid`` is pyx12's own verdict against the 005010X221A1 map (its external remark-code list is
excluded: the fixtures use the SYNTHETIC code lists; docs/adr/0022). ``rejections`` sorts pyx12's
errors into categories (not_835, map_not_found, control_count, missing_segment, segment, element,
decode, other). ``summary`` is the normalized summary in format "tp-oracle-835/1", built only from
the segments and loops pyx12 read, with every balance computed here with Decimal. It never imports
anything from the repository: standard library and pyx12 only.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import sys
import zipfile
from decimal import Decimal, InvalidOperation
from typing import Any

import pyx12
import pyx12.errors
import pyx12.params
import pyx12.x12n_document

SUMMARY_FORMAT = "tp-oracle-835/1"
RUN_FORMAT = "tp-oracle-run/1"
BOM = b"\xef\xbb\xbf"
HUNDRED = Decimal(100)

logging.getLogger("pyx12").addHandler(logging.NullHandler())
logging.getLogger("pyx12").propagate = False


class SummaryError(Exception):
    pass


def cents(text: str | None) -> int:
    if text is None or text == "":
        raise SummaryError("missing amount")
    try:
        value = Decimal(text) * HUNDRED
    except InvalidOperation as error:
        raise SummaryError(f"not an amount: {text}") from error
    if value != value.to_integral_value():
        raise SummaryError(f"more than two decimal places: {text}")
    return int(value)


def iso(text: str | None) -> str | None:
    if text is None or text == "":
        return None
    if len(text) == 8 and text.isdigit():
        return f"{text[0:4]}-{text[4:6]}-{text[6:8]}"
    return text


def value(seg: Any, position: int, component: int | None = None) -> str | None:
    """Element text (1-based), or None when absent or empty."""
    seg_id = seg.get_seg_id()
    ref = f"{seg_id}{position:02d}" if component is None else f"{seg_id}{position:02d}-{component}"
    found = seg.get_value(ref)
    if found is None or found == "":
        return None
    return found


def composite(seg: Any, position: int) -> str | None:
    element = seg.get(f"{seg.get_seg_id()}{position:02d}")
    if element is None:
        return None
    parts = [element[index].get_value() for index in range(len(element))]
    while parts and parts[-1] == "":
        parts.pop()
    return ":".join(parts) if parts else None


def add_cas(target: dict[str, int], seg: Any) -> tuple[int, int]:
    group = value(seg, 1) or ""
    total = 0
    count = 0
    for position in range(2, 18, 3):
        reason = value(seg, position)
        if reason is None:
            continue
        amount = cents(value(seg, position + 1))
        key = f"{group}-{reason}"
        target[key] = target.get(key, 0) + amount
        total += amount
        count += 1
    return total, count


def cas_record(target: dict[str, int]) -> dict[str, str]:
    return {key: str(target[key]) for key in sorted(target)}


def date_summary(seg: Any) -> dict[str, Any]:
    return {
        "qualifier": value(seg, 1) or "",
        "date": iso(value(seg, 2)),
        "format": value(seg, 5),
        "period": value(seg, 6),
    }


def loop_names(path: str) -> list[str]:
    return [part.split("[")[0] for part in path.split("/") if part]


class Builder:
    """Builds the summary from (map path, segment) pairs in the order pyx12 read them."""

    def __init__(self) -> None:
        self.interchanges: list[dict[str, Any]] = []
        self.interchange: dict[str, Any] | None = None
        self.group: dict[str, Any] | None = None
        self.transaction: dict[str, Any] | None = None
        self.claim: dict[str, Any] | None = None
        self.line: dict[str, Any] | None = None
        self.lx = ""
        self.not_835 = False

    def on_segment(self, path: str, seg: Any, terms: tuple[Any, ...]) -> None:
        seg_id = seg.get_seg_id()
        loops = loop_names(path)
        if self.transaction is not None:
            self.transaction["segmentCount"] += 1
        if seg_id == "ISA":
            seg_term, ele_term, subele_term, _eol, repetition = terms
            self.interchange = {
                "isa06": (value(seg, 6) or "").rstrip(" "),
                "isa08": (value(seg, 8) or "").rstrip(" "),
                "isa09": value(seg, 9) or "",
                "isa12": value(seg, 12) or "",
                "isa13": value(seg, 13) or "",
                "isa15": value(seg, 15) or "",
                "delimiters": {"element": ele_term, "component": subele_term, "repetition": repetition, "segment": seg_term},
                "iea01": None,
                "iea02": None,
                "groups": [],
            }
        elif seg_id == "IEA":
            if self.interchange is not None:
                self.interchange["iea01"] = value(seg, 1) or ""
                self.interchange["iea02"] = value(seg, 2) or ""
                self.interchanges.append(self.interchange)
            self.interchange = None
        elif seg_id == "GS":
            if value(seg, 1) != "HP" or value(seg, 8) != "005010X221A1":
                self.not_835 = True
            self.group = {
                "gs01": value(seg, 1) or "",
                "gs02": value(seg, 2) or "",
                "gs03": value(seg, 3) or "",
                "gs04": iso(value(seg, 4)) or "",
                "gs06": value(seg, 6) or "",
                "gs08": value(seg, 8) or "",
                "ge01": None,
                "ge02": None,
                "transactions": [],
            }
        elif seg_id == "GE":
            if self.group is not None and self.interchange is not None:
                self.group["ge01"] = value(seg, 1) or ""
                self.group["ge02"] = value(seg, 2) or ""
                self.interchange["groups"].append(self.group)
            self.group = None
        elif seg_id == "ST":
            if value(seg, 1) != "835":
                self.not_835 = True
            self.transaction = {
                "st01": value(seg, 1) or "",
                "st02": value(seg, 2) or "",
                "se01": None,
                "se02": None,
                "segmentCount": 1,
                "bpr": None,
                "trn": None,
                "currency": None,
                "refs": [],
                "productionDate": None,
                "payer": None,
                "payee": None,
                "claims": [],
                "plb": [],
                "balance": None,
                "_payerRefs": [],
                "_payeeRefs": [],
            }
            self.claim = None
            self.line = None
        elif seg_id == "SE":
            self.close_claim()
            if self.transaction is not None and self.group is not None:
                self.transaction["se01"] = value(seg, 1) or ""
                self.transaction["se02"] = value(seg, 2) or ""
                self.group["transactions"].append(self.finish_transaction(self.transaction))
            self.transaction = None
        elif self.transaction is not None:
            self.on_transaction_segment(loops, seg_id, seg)

    def on_transaction_segment(self, loops: list[str], seg_id: str, seg: Any) -> None:
        transaction = self.transaction
        assert transaction is not None
        if seg_id == "PLB":
            self.close_claim()
            for position in range(3, 14, 2):
                code = value(seg, position, 1)
                if code is None:
                    continue
                transaction["plb"].append(
                    {
                        "provider": value(seg, 1) or "",
                        "fiscalPeriodDate": iso(value(seg, 2)) or "",
                        "code": code,
                        "reference": value(seg, position, 2),
                        "amountCents": str(cents(value(seg, position + 1))),
                    }
                )
            return
        if "2000" in loops:
            self.on_detail_segment(loops, seg_id, seg)
            return
        if seg_id == "BPR":
            amount = cents(value(seg, 2))
            transaction["bpr"] = {
                "handling": value(seg, 1) or "",
                "amountCents": str(amount),
                "creditDebit": value(seg, 3) or "",
                "method": value(seg, 4) or "",
                "format": value(seg, 5),
                "date": iso(value(seg, 16)) or "",
            }
            transaction["_payment"] = -amount if value(seg, 3) == "D" else amount
        elif seg_id == "TRN":
            transaction["trn"] = {"trace": value(seg, 2) or "", "originator": value(seg, 3) or "", "supplemental": value(seg, 4)}
        elif seg_id == "CUR":
            transaction["currency"] = value(seg, 2)
        elif seg_id == "DTM" and "1000A" not in loops and "1000B" not in loops:
            transaction["productionDate"] = iso(value(seg, 2))
        elif seg_id == "N1":
            party = {"name": value(seg, 2) or "", "idQualifier": value(seg, 3), "id": value(seg, 4), "refs": []}
            if "1000A" in loops:
                transaction["payer"] = party
            else:
                transaction["payee"] = party
        elif seg_id == "REF":
            pair = [value(seg, 1) or "", value(seg, 2) or ""]
            if "1000A" in loops:
                transaction["_payerRefs"].append(pair)
            elif "1000B" in loops:
                transaction["_payeeRefs"].append(pair)
            else:
                transaction["refs"].append(pair)

    def on_detail_segment(self, loops: list[str], seg_id: str, seg: Any) -> None:
        if seg_id == "LX":
            self.close_claim()
            self.lx = value(seg, 1) or ""
            return
        if seg_id == "CLP":
            self.close_claim()
            self.claim = {"lx": self.lx, "seg": seg, "cas": {}, "casTotal": 0, "casCount": 0, "refs": [], "dates": [], "amounts": [], "lines": []}
            return
        claim = self.claim
        if claim is None:
            return
        if seg_id == "SVC":
            if self.line is not None:
                claim["lines"].append(self.line)
            self.line = {"seg": seg, "cas": {}, "casTotal": 0, "casCount": 0, "dates": [], "refs": [], "amounts": [], "remarks": []}
            return
        target = self.line if "2110" in loops and self.line is not None else claim
        if seg_id == "CAS":
            total, _count = add_cas(target["cas"], seg)
            target["casTotal"] += total
            target["casCount"] += 1
        elif seg_id == "DTM":
            target["dates"].append(date_summary(seg))
        elif seg_id == "REF":
            target["refs"].append([value(seg, 1) or "", value(seg, 2) or ""])
        elif seg_id == "AMT":
            target["amounts"].append([value(seg, 1) or "", str(cents(value(seg, 2)))])
        elif seg_id == "LQ" and target is self.line:
            target["remarks"].append([value(seg, 1) or "", value(seg, 2) or ""])

    def close_claim(self) -> None:
        if self.claim is not None and self.transaction is not None:
            if self.line is not None:
                self.claim["lines"].append(self.line)
            self.transaction["claims"].append(self.finish_claim(self.claim))
        self.claim = None
        self.line = None

    @staticmethod
    def finish_claim(draft: dict[str, Any]) -> dict[str, Any]:
        seg = draft["seg"]
        charge = cents(value(seg, 3))
        paid = cents(value(seg, 4))
        line_cas = sum(line["casTotal"] for line in draft["lines"])
        claim_difference = charge - draft["casTotal"] - line_cas - paid
        line_charges = sum(cents(value(line["seg"], 2)) for line in draft["lines"])
        line_charge_difference = None if not draft["lines"] else line_charges - charge
        balanced = claim_difference == 0 and (line_charge_difference or 0) == 0
        lines = []
        for line in draft["lines"]:
            svc = line["seg"]
            line_charge = cents(value(svc, 2))
            line_paid = cents(value(svc, 3))
            checked = line["casCount"] > 0 or draft["casCount"] == 0
            difference = line_charge - line["casTotal"] - line_paid if checked else None
            if difference is not None and difference != 0:
                balanced = False
            lines.append(
                {
                    "procedure": composite(svc, 1) or "",
                    "chargeCents": str(line_charge),
                    "paidCents": str(line_paid),
                    "revenueCode": value(svc, 4),
                    "units": value(svc, 5),
                    "originalProcedure": composite(svc, 6),
                    "originalUnits": value(svc, 7),
                    "dates": line["dates"],
                    "cas": cas_record(line["cas"]),
                    "refs": line["refs"],
                    "amounts": line["amounts"],
                    "remarks": line["remarks"],
                    "differenceCents": None if difference is None else str(difference),
                }
            )
        responsibility = value(seg, 5)
        return {
            "lx": draft["lx"],
            "clp01": value(seg, 1) or "",
            "clp02": value(seg, 2) or "",
            "chargeCents": str(charge),
            "paidCents": str(paid),
            "patientResponsibilityCents": None if responsibility is None else str(cents(responsibility)),
            "clp06": value(seg, 6) or "",
            "clp07": value(seg, 7) or "",
            "clp08": value(seg, 8),
            "clp09": value(seg, 9),
            "cas": cas_record(draft["cas"]),
            "refs": draft["refs"],
            "dates": draft["dates"],
            "amounts": draft["amounts"],
            "lines": lines,
            "balance": {
                "claimDifferenceCents": str(claim_difference),
                "lineChargeDifferenceCents": None if line_charge_difference is None else str(line_charge_difference),
                "balanced": balanced,
            },
        }

    @staticmethod
    def finish_transaction(draft: dict[str, Any]) -> dict[str, Any]:
        if draft["bpr"] is None or draft["trn"] is None or draft["payer"] is None or draft["payee"] is None:
            raise SummaryError("a transaction is missing BPR, TRN or a party")
        draft["payer"]["refs"] = draft.pop("_payerRefs")
        draft["payee"]["refs"] = draft.pop("_payeeRefs")
        payment = draft.pop("_payment")
        claims_paid = sum(int(claim["paidCents"]) for claim in draft["claims"])
        plb_total = sum(int(item["amountCents"]) for item in draft["plb"])
        difference = claims_paid - plb_total - payment
        draft["balance"] = {
            "claimsPaidCents": str(claims_paid),
            "plbTotalCents": str(plb_total),
            "paymentCents": str(payment),
            "differenceCents": str(difference),
            "balanced": difference == 0,
            "claimsBalanced": all(claim["balance"]["balanced"] for claim in draft["claims"]),
        }
        return draft


TRANSACTION_CODES = {"2": "missing_segment", "3": "control_count", "4": "control_count"}
GROUP_CODES = {"3": "missing_segment", "4": "control_count", "5": "control_count"}
INTERCHANGE_CODES = {"023": "missing_segment", "001": "control_count", "021": "control_count"}


def collect_errors(doc: dict[str, Any]) -> tuple[list[dict[str, Any]], set[str]]:
    errors: list[dict[str, Any]] = []
    categories: set[str] = set()

    def add(level: str, code: Any, message: Any, category: str, segment: Any = None, line: Any = None) -> None:
        errors.append({"level": level, "code": str(code), "message": str(message), "segment": segment, "line": line})
        categories.add(category)

    for isa in doc.get("interchanges", []):
        for error in isa.get("errors", []):
            add("interchange", error["err_cde"], error["err_str"], INTERCHANGE_CODES.get(str(error["err_cde"]), "other"))
        for gs in isa.get("groups", []):
            for error in gs.get("errors", []):
                add("group", error["err_cde"], error["err_str"], GROUP_CODES.get(str(error["err_cde"]), "other"))
            for st in gs.get("transactions", []):
                for error in st.get("errors", []):
                    add("transaction", error["err_cde"], error["err_str"], TRANSACTION_CODES.get(str(error["err_cde"]), "other"))
                for seg in st.get("segments", []):
                    for error in seg.get("errors", []):
                        add("segment", error["err_cde"], error["err_str"], "segment", seg.get("seg_id"), seg.get("cur_line"))
                    for element in seg.get("elements", []):
                        for error in element.get("errors", []):
                            add("element", error["err_cde"], error["err_str"], "element", seg.get("seg_id"), seg.get("cur_line"))
    return errors, categories


def canonical(summary: dict[str, Any]) -> str:
    return json.dumps(summary, sort_keys=True, separators=(",", ":"))


def read_spec(spec: str) -> bytes:
    if "!" in spec:
        archive, entry = spec.split("!", 1)
        with zipfile.ZipFile(archive) as handle:
            return handle.read(entry)
    with open(spec, "rb") as handle:
        return handle.read()


def check(data: bytes) -> dict[str, Any]:
    bom = data.startswith(BOM)
    body = data[len(BOM) :] if bom else data
    result: dict[str, Any] = {"valid": False, "rejections": [], "errors": [], "summary": None, "summarySha256": None}
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        result["rejections"] = ["decode"]
        return result
    if not text.startswith("ISA"):
        result["rejections"] = ["decode"]
        return result
    params = pyx12.params.ParamsBase()
    params.set("exclude_external_codes", "remark_code")
    builder = Builder()
    summary_error: str | None = None

    def callback(seg: Any, src: Any, node: Any, _valid: bool) -> None:
        nonlocal summary_error
        if summary_error is not None:
            return
        try:
            path = node.get_path() if node is not None else ""
            builder.on_segment(path, seg, src.get_term())
        except (SummaryError, IndexError, KeyError, TypeError) as error:
            summary_error = f"{type(error).__name__}: {error}"

    errors_json = io.StringIO()
    categories: set[str] = set()
    valid = False
    try:
        valid = bool(pyx12.x12n_document.x12n_document(params, io.StringIO(text), None, None, None, errors_json, callback=callback))
    except pyx12.errors.EngineError as error:
        categories.add("map_not_found" if "Map not found" in str(error) else "other")
        result["errors"].append({"level": "engine", "code": "EngineError", "message": str(error), "segment": None, "line": None})
    except Exception as error:  # noqa: BLE001 - any pyx12 failure is a rejection, reported as such
        categories.add("other")
        result["errors"].append({"level": "engine", "code": type(error).__name__, "message": str(error), "segment": None, "line": None})
    if errors_json.getvalue():
        found, found_categories = collect_errors(json.loads(errors_json.getvalue()))
        result["errors"].extend(found)
        categories |= found_categories
    if builder.not_835:
        categories.add("not_835")
        valid = False
    if not valid and not categories:
        categories.add("other")
    result["valid"] = valid
    result["rejections"] = sorted(categories)
    complete = builder.interchange is None and builder.transaction is None and builder.interchanges
    if not builder.not_835 and summary_error is None and complete:
        summary = {"format": SUMMARY_FORMAT, "bom": bom, "interchanges": builder.interchanges}
        result["summary"] = summary
        result["summarySha256"] = hashlib.sha256(canonical(summary).encode("ascii")).hexdigest()
    elif summary_error is not None:
        result["errors"].append({"level": "summary", "code": "SummaryError", "message": summary_error, "segment": None, "line": None})
    return result


def main(argv: list[str]) -> int:
    root = None
    specs: list[str] = []
    index = 0
    while index < len(argv):
        if argv[index] == "--root":
            root = argv[index + 1]
            index += 2
            continue
        specs.append(argv[index])
        index += 1
    results = []
    for spec in specs:
        path = spec.split("!", 1)[0]
        label = os.path.relpath(path, root) if root else path
        if "!" in spec:
            label = f"{label}!{spec.split('!', 1)[1]}"
        try:
            outcome = check(read_spec(spec))
        except OSError as error:
            outcome = {"valid": False, "rejections": ["other"], "errors": [{"level": "io", "code": "OSError", "message": str(error), "segment": None, "line": None}], "summary": None, "summarySha256": None}
        results.append({"file": label, **outcome})
    json.dump({"format": RUN_FORMAT, "pyx12": getattr(pyx12, "__version__", "unknown"), "results": results}, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
