#!/usr/bin/env python3
"""Splits a tour's shots.json into batch files for the image checkers.

    python3 batches.py "$TOUR_DIR"            # writes $TOUR_DIR/batches/batch-NN.json and index.json

Each batch is a JSON array of shots.json entries from one area (practice workflow, practice set-up, console and
account, public and sign-in), at most 45 shots, kept in route order so a checker sees a route's widths, theme and
states together. index.json lists each batch's area and count. Run it from anywhere; it reads only shots.json.
"""

import json
import math
import os
import sys

LIMIT = 45
AREAS = ["practice workflow", "practice set-up", "console and account", "public and sign-in"]


def area_of(entry: dict) -> str:
    route = entry["routePattern"]
    if entry["id"].startswith("not-found."):
        return "public and sign-in"
    if route.startswith("/p/[practiceId]/settings") or route.startswith("/p/[practiceId]/support-access"):
        return "practice set-up"
    if route.startswith("/p/"):
        return "practice workflow"
    if route == "/" or route.startswith(("/console", "/account", "/settings/", "/support", "/terms")):
        return "console and account"
    return "public and sign-in"


def main() -> None:
    tour_dir = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TOUR_DIR", "")
    if not tour_dir:
        sys.exit("usage: batches.py <TOUR_DIR>")
    with open(os.path.join(tour_dir, "shots.json"), encoding="utf-8") as handle:
        shots = json.load(handle)["shots"]
    out = os.path.join(tour_dir, "batches")
    os.makedirs(out, exist_ok=True)
    for name in os.listdir(out):
        if name.startswith("batch-") and name.endswith(".json"):
            os.remove(os.path.join(out, name))
    index = []
    number = 0
    for area in AREAS:
        entries = sorted((entry for entry in shots if area_of(entry) == area), key=lambda entry: (entry["routePattern"], entry["id"]))
        if not entries:
            continue
        count = math.ceil(len(entries) / LIMIT)
        size = math.ceil(len(entries) / count)
        for start in range(0, len(entries), size):
            number += 1
            chunk = entries[start : start + size]
            path = os.path.join(out, f"batch-{number:02d}.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(chunk, handle, indent=2)
            index.append({"batch": path, "area": area, "count": len(chunk)})
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2)
    for item in index:
        print(f"{os.path.basename(item['batch'])}  {item['count']:3d}  {item['area']}")


if __name__ == "__main__":
    main()
