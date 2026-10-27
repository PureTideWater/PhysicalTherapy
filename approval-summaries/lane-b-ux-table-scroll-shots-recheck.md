# PR #79 (co-001/ux-table-scroll): the fix round's after shots and the re-check of the review findings

**after2** is the fix round, built from 88a66bd3…: the PR head 35b14cd5, then the merge
e0557d91 and the fix commits 18165dfb, ccc4e1f6, d8169b87 and 88a66bd3. They are local only and not pushed. The shots
are in `<scratchpad>/screens-after2`.

It is compared with two earlier runs:
- **after**, the PR head 35b14cd5 (`<scratchpad>/screens-after`);
- **before**, the base e908c214 (`<scratchpad>/screens-before`).

The UX reviewer's pairs are in `<scratchpad>/review-ux/pairs`.

## How the shots were taken

The run followed the README's "Set-up and a run" steps:
1. `setup.sh` with TOUR_REF set to 88a66bd3.
2. `build.sh` under `flock /tmp/laneb-heavy.lock`.
3. A fresh prepare, then the populate project: 11 passed.
4. `run.sh` with TOUR_ONLY from `<scratchpad>/tour-only-after2.txt`.
5. The capture spec `<scratchpad>/capture/lane-b-ux-table-scroll-capture.spec.ts`, on the same server and database.

Results:
- **The tour:** 64 shots, no skips.
- **The capture spec:** 27 shots and 1 skip. The skip is `tbl.checker-box.1280`, which the tour server cannot reach because it has no CONTENT_ROOT.

The heavy lock was held from about 21:30 to 21:41:12 UTC:
- build.log ends with "server stopped at 21:41:12";
- `fuser 3297/tcp` printed nothing;
- the lock was free afterwards.

Clean-up: `tp_e2e_screens` was dropped (count 0), and `/tmp/tp-e2e-tp_e2e_screens-*` was removed.

Tiles were cut by `tile.py`, 800 px tall at 1280 and 844 px at 390:
- the tour: `screens-after2/tiles`, 64 shots in 220 tiles;
- the capture spec: `screens-after2/extra/tiles`, 27 shots in 49 tiles.

Side-by-side images:
- **Triptychs** (before | after | after2, one per tile, 1280 at 50 %): `<scratchpad>/recheck/tp/<id>-NN.png`, made by `scripts/triptych.py`.
- **Stacked crops:** `<scratchpad>/recheck/crops/`, made by `scripts/stackcrop.py`.

The data is synthetic only. The PNGs and tiles never go on a branch.

### What changed in the sample since the first after run

The 49 ids of the first runs were all retaken. Fifteen ids are new, chosen for F2 and UX-PR79-07, each at 1280, 1280 dark and 390:
- `p.reconciliation.default` and `p.abstraction-ledger.default`;
- `console.terms.default`, `console.organization.default` and `console.compliance.default`.

These ids were outside the first runs' sample, so they have no before or after.

The capture spec has one new pair: `tbl.cases-link-focus.390` and `-detail.390`. It presses Tab once past the table's own stop, onto the first link at the scroller's start edge, to check F1 at 390.

The StackedRows harness (`capture/stacked-rows-harness.mts`) has a third list, "Long values". It holds a long Badge status and a 36-character SYNTHETIC key, for UX-PR79-03. The copies from the first after run are kept beside it as `*.after1`.

### Read before comparing

- **Data differs between runs, not because of the change.** Each run had its own fresh database, so record ids, synthetic suffixes, hashes and times differ.
- **Pixel diff, after against after2:**
  - `screening.default.*`, `status.default.*`, `request-audit.sent.1280`, `p.anomalies.cohort.1280*` and `p.claims.viewer.1280*` are identical.
  - `console.rule-releases.notes-open.*` and `console.screening.default.*` differ only in one 11-px line, a timestamp.
- **Not shown on populated data** (judged from code and the green e2e of `<scratchpad>/fix-suite.md`):
  - a model proposal card (UX-PR79-05);
  - a shortfall on the specialist ledger (F2's "Shortfall N");
  - a compliance evidence record (the console reads "Nothing recorded yet.").

## Verdicts

Each finding comes from `<scratchpad>/reviews.json`. The shot ids are this run's unless marked "before" or "after".

| Finding | Verdict | The shots that show it |
| --- | --- | --- |
| UX-PR79-01 (wrap-anywhere on cells lowers min-content) | Fixed | See below |
| UX-PR79-02 (dates and N of M counts break) | Fixed | See below |
| UX-PR79-03 (StackedRows: Badge and mono key do not wrap) | Fixed | See below |
| UX-PR79-04 (StackedRows pairs evenly spaced) | Fixed | See below |
| UX-PR79-05 (proposal number not on screen) | Fixed in code, not seen | See below |
| UX-PR79-06 (viewer's claims at 54rem) | Fixed as the finding asked | See below |
| UX-PR79-07 (SHA-256 cut to 12 characters plus a hover title) | Fixed | See below |
| F1 (the scroller clips a flush link's focus ring) | Fixed | See below |
| F2 (repeated "Entries of the line" regions) | Fixed | See below |

### UX-PR79-01: fixed

**Claims and lines:**
- `p.claims.default.1280` is 3828 px tall again: before 3828, after 4888. The patient reads "SYNTHLAST2E48HX, / SYNTHFIRSTXD6" on two lines, and the header takes two lines.
- `p.claims.default.390` is 4032 px tall: after 6592, before 4012. The header takes three lines, and SYNPCNCAS02020 and SYNCCNCAS020020 are whole.
- Triptychs: `recheck/tp/p.claims.default.1280-01.png` and `p.claims.default.390-01.png`.

**The rate record fields:** `p.contract-version.default.390` (tile 03) reads every term in whole words: "modifiers", "practice's", "non-qualifying conversion factor". The approval stands under the terms, with its date and time whole. Before, the approval's "UTC" was cut. The page is 2492 px tall: after 3060, before 2768.

**The line schedule:** in `p.packet.default.1280` (tile 02), the Claim placeholder takes 4 lines again, as before; after it took 6.

**The other sites:**
- `console.prospects.default.1280` and `.390`: the names and payers are whole words, and the email breaks only at its own hyphen ("request-tour- / a6eb63e1@synthetic.test"). Crop: `crops/prospects1280.png`.
- `settings.billing-org.default.390`: "SIM-0001" is whole.
- `p.contracts.default.390`: the plan key breaks only at its hyphen ("CE:SYNPLAN- / COMM-C"), not mid-token.
- `p.cases.default.1280` and `.390`: "Unassigned" is whole.
- `p.remittance.default.1280` matches before (1007 px; after 1055). Crop: `crops/remittance1280.png`.

### UX-PR79-02: fixed

- `p.cases.default.1280` and `p.cases.deadline-14.1280` read "2026-11-03" and "2036-04-05" whole, with the status chip under the date, and "3 of 3" whole. Crops: `crops/cases1280-table.png` and `crops/deadline14-1280.png`.
- At 390 the same holds: `tbl.cases-scrolled-middle-detail.390` and `p.cases.deadline-14.390` (tile 03).
- `p.anomalies.cohort.390`: the Flagged lines' service dates are whole.
- `settings.billing-org.default.390`: Issued "2026-10-27" is whole.
- `console.prospects.default.1280`: Received reads "2026-10-27 / 21:34 UTC".
- `p.contracts.default.1280`: Effective reads "2026-01-01 / through / 2026-12-31". Before, it broke "2026-12- / 31".

### UX-PR79-03 and UX-PR79-04: fixed

- `tbl.stacked-rows.390` and `.390-dark`: each value keeps 8 px under it, so a figure sits nearer its own term than the next one. Compare `crops/stacked-pairs-390.png` with after's evenly spaced lines.
- The new "Long values" list (`crops/stacked-long-390.png`): the Badge status wraps inside the card.
  - The 36-character key fits on one line at 358 px, so its `wrap-anywhere` is proved by the markup and the unit test, not by the picture.
- `tbl.stacked-rows.1280` and `.1280-dark`: from 24rem the terms sit beside their values, with no extra space.

### UX-PR79-05: fixed in code, not seen

- No populated practice has a model proposal.
- `models/display.tsx:168` titles the card "Proposal N, proposed <utc>". This is the same N as the table name "Proposed fields of proposal N, candidate M" (`:181`).

### UX-PR79-06: fixed as the finding asked

- The viewer's table takes 48rem.
- `p.claims.viewer.390` now shows Expected allowed at the fade, where after it showed only Code, Units and Charge.

### UX-PR79-07: fixed

The whole SHA-256 shows in:
- `p.home.default.1280` (tile 03) and `p.home.default.390`, where it sits in the scroller past the fade;
- `console.terms.default.1280`;
- `console.organization.default.1280`. Crop: `crops/org1280-agreements.png`.

`console.compliance` shows the same in code, but there are no records on the tour data.

### F1: fixed

- **At 1280:** in `tbl.claims-fits-link-focus-detail.1280`, the first patient link's ring has all four sides, drawn inside the link's box. In after, its left side was cut off.
- **At 390:** in `tbl.cases-link-focus-detail.390` (new), the first link at the scroller's start edge shows its ring whole. Its note reads "outline solid 2px, offset -2px; 8 px from the scroller's start edge".
- The region's own frame outline is unchanged, in light (`tbl.cases-tab-focus-detail.390`) and in forced colours (`tbl.cases-forced-colors-detail.390`).

### F2: fixed

- `p.reconciliation.default.1280` (tile 03) and `.390` name each case line on screen: "Case line 1 of 1, 97110 on 2026-03-09". Its entries table is "Entries of case line 1". LEDGER has one case line, so no repeat can show.
- The specialist ledger (`p.abstraction-ledger.default.*`) has no shortfall on the populated data.
- axe's `landmark-unique` in `atPhoneWidth` passed in the suite's e2e on 88a66bd3 (fix-suite.md).

## New defects the fixes caused

There are three, all nits. None needs a commit: each is a trade-off, and none breaks a word or a token mid-way.

### 1. A dangling "{{" in the line schedule's Patient placeholder

- **Where:** `p.packet.default.1280` (tile 02) and `p.packet.default.390` (tile 02, triptych `recheck/tp/p.packet.default.390-02.png`).
- **What it reads:** "{{ / patient_ / name:1}}", three lines with "{{" alone. Before and after it read "{{patient_ / name:1}}".
- **Cause:** commit ccc4e1f6, `components/packets/display.tsx` Placeholder, which adds a break after "{{".
- **Why it stays:**
  - The break narrows only the Patient column, by about 2 characters. "{{claim_" and "control_" are the same width, so the Claim column does not change.
  - fix-2 needed that width for the twelve columns to fit at 1263 px, 1280 less a classic scrollbar. Its estimate was 882 px of 893 with the break and about 896 without.
- **Proposal:** remove the break after "{{" once the line schedule gains about 4 px of room at 1263, for example if it loses a column or its Deadline badge may wrap. Check it with layout-1280.

### 2. Cases at 390: "Payer and plan" takes three lines

- **Where:** `p.cases.default.390` and `p.cases.deadline-14.390` (tile 03), crop `crops/cases390-table.png`.
- **What it reads:** "SYNTHETIC PAYER / Q, CE:SYNPLAN- / FIX-ONE", and Pattern also takes three lines. After showed both on two lines, with the key whole. Before showed four and five lines.
- **Cause:** the Owner column's 10rem email floor, and the date and count that now stay whole, inside the fixed 54rem table, take width from the first two columns.
- **Why it stays:**
  - Nothing breaks mid-token; the key breaks at its own hyphen.
  - More columns show before the fade.
  - plan_key is unbounded text, so keeping it on one line with `whitespace-nowrap` could widen a fitting table.

### 3. Whole hashes take width

- **Where:** `p.home.default.1280` (tile 03), `console.organization.default.1280` and `console.terms.default.1280`; at 390, `p.home.default.390` (tile 04).
- **What it looks like:** the hash wraps with a 2- to 4-character tail, and its row grows to two or three lines. At 390, "Business associate agreement" wraps to three lines, where after kept one line because its cut hash took little width.
- **Why it stays:** this is the cost of UX-PR79-07, and the value is now readable.
- **Proposal:** give a hash span a width of half the hash, for example `w-[33ch]` with `wrap-anywhere`. It would then read as two even 32-character halves, and its column would stay at about 240 px. This is for the UX reviewer to judge.

## Seen while checking, not caused by this PR

On `p.contract-version.default.390` (tile 01), the Dispute window fact's "received 2026-10-27 21:31 UTC" breaks "2026-10- / 27" in both after runs. That fact is a dd outside any table, so ADR 0078 Decision 1 does not cover it. Proposal: render the time in that fact through `UtcTime`, and in a follow-up, every date-time outside the tables too.
