# content/sources

The source files global rule records are drafted from (PRD section 9): CMS physician fee schedule relative
value, GPCI and locality files, the MPPR rate file, final-rule conversion factors and therapy thresholds,
NCCI tables, the X12 external code lists (CARC, RARC, claim status) and state prompt-pay statutes.

- Each file is stored under `content/sources/<type>/` exactly as downloaded, with its SHA-256 beside it in
  `<file>.sha256` and in every record drafted from it (`source.sha256`), together with its title, URL and
  retrieved date. `pnpm verify-content` refuses a record whose stored file is missing or has another hash.
- A stored file is never replaced: records already published cite its hash. A corrected or newer download
  gets a new file name.
- Tabular files are read by a parser into [`content/drafts/`](../drafts/README.md) with `pnpm rules:import`;
  nobody retypes them. Values a person types (conversion factors from the final rule, thresholds, state rules)
  are transcribed twice and the two passes must agree.
- Quotes in a record must appear verbatim in the stored source text; the content checker verifies it.
- Public documents only. The purchased X12 implementation guide is licensed, not public: its text is never
  committed here or anywhere else in the repository.
- No PHI, no contract, no remittance, ever. Synthetic files never come here (`rules:import` refuses a file
  that says SYNTHETIC on its first line); they live in `fixtures/synthetic/cms/`.

## What is here now

| Path | What | Used by |
| --- | --- | --- |
| `plan/rules-reference.md` | A byte-for-byte copy of `docs/product/rules-reference.md` (the plan's Rules reference tab as of 2026-10-14), with `rules-reference.md.sha256` | The hand-typed release 1 drafts (thresholds, assistant modifiers, sequestration, the MPPR percentage, Medicare windows, North Carolina prompt pay), at L1 |

The plan's rules reference is the only source this environment could reach: cms.gov, x12.org and ncdoi.gov
are blocked here. It is a secondary source. Each hand-typed draft names, in its notes and L2 questions, the
primary page to read and store in its place (the CMS therapy services page, the CY 2026 final rule, the NCDOI
prompt-pay page and G.S. 58-3-225).

## Release 1: the files a person must download

None of the files below is in the repository yet, and nothing in it was typed from memory: every RVU, GPCI,
conversion factor, MPPR code, NCCI pair, MUE and code-list entry must come from the published file through its
parser. The addresses below were written from the plan and could not be opened from this environment; if a
page has moved, search cms.gov or x12.org for the title given. File names inside each download change from
release to release; the commands use example names.

Download each file to your machine (never into the repository by hand), rename it to letters, digits, dots,
dashes and underscores if needed, and run the command from the repository root. `--url` records where it came
from; `--retrieved` defaults to today.

| # | Record type | What to download | From | Command |
| --- | --- | --- | --- | --- |
| 1 | `pfs_rvu` | The January 2026 relative value file zip (RVU26A); inside it, the PPRRVU file in CSV form | CMS, "PFS Relative Value Files" (https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files) | `pnpm rules:import --type pfs_rvu --year 2026 --file PPRRVU26_JAN.csv --url <page>` |
| 2 | `pfs_gpci` | The GPCI file from the same zip (CSV) | Same RVU26A zip | `pnpm rules:import --type pfs_gpci --year 2026 --file GPCI2026.csv --url <page>` |
| 3 | `locality_map` | The ZIP code to carrier locality file for the current quarter; inside it, the fixed-width `ZIP5_<month><year>.txt` | CMS, "Zip Code to Carrier Locality File" (physician fee schedule pages on cms.gov) | `pnpm rules:import --type locality_map --year 2026 --file ZIP5_OCT2026.txt --url <page>` |
| 4 | `conversion_factor` | Nothing to download as a table: read the two CY 2026 conversion factors (qualifying APM participants and everyone else) in the CY 2026 physician fee schedule final rule, and prepare the CSV below **twice**, independently | The final rule in the Federal Register (https://www.federalregister.gov), and the RVU26A zip's documentation | `pnpm rules:import --type conversion_factor --year 2026 --file cf-2026-a.csv --second-pass cf-2026-b.csv --url <Federal Register URL>` |
| 5 | `mppr_rate` | The therapy MPPR rate file (last updated February 24, 2026 to add 97026) | CMS therapy services (https://www.cms.gov/medicare/coding-billing/therapy-services) | `pnpm rules:import --type mppr_rate --year 2026 --file MPPR_THERAPY_2026.csv --url <page>` |
| 6 | `ncci_ptp` | The practitioner PTP edit files for the current quarter (several files per quarter; import each) | CMS, "Medicare NCCI Procedure to Procedure (PTP) Edits" (https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits) | `pnpm rules:import --type ncci_ptp --year 2026 --file NCCI_PTP_PRACTITIONER_2026Q4_F1.txt --url <page>` (then each further file of the quarter) |
| 7 | `ncci_mue` | The practitioner services MUE table for the current quarter (CSV) | CMS, "Medicare NCCI Medically Unlikely Edits (MUEs)" (https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits) | `pnpm rules:import --type ncci_mue --year 2026 --file MUE_PRACTITIONER_2026Q4.csv --effective-from 2026-10-01 --effective-to 2026-12-31 --url <page>` |
| 8 | `carc` | The claim adjustment reason code list, exported as CSV with code, description, start, last modified and stop dates | X12 (https://x12.org/codes/claim-adjustment-reason-codes) | `pnpm rules:import --type carc --year 2026 --file CARC_2026-11.csv --url <page>` |
| 9 | `rarc` | The remittance advice remark code list, as CSV | X12 (https://x12.org/codes/remittance-advice-remark-codes) | `pnpm rules:import --type rarc --year 2026 --file RARC_2026-11.csv --url <page>` |
| 10 | `claim_status_code` | The claim status code list, as CSV | X12 (https://x12.org/codes/claim-status-codes) | `pnpm rules:import --type claim_status_code --year 2026 --file CLAIM_STATUS_2026-11.csv --url <page>` |

The conversion-factor CSV a reviewer prepares (twice) has exactly these headings; the importer checks that
each factor appears, as typed, inside the sentence quoted from the final rule, and that the two preparations
agree:

```csv
applicability,conversion_factor,effective_from,effective_to,citation,quote
non_qualifying_apm,<factor>,2026-01-01,2026-12-31,<FR volume and page>,"<the final rule's sentence stating the factor>"
qualifying_apm,<factor>,2026-01-01,2026-12-31,<FR volume and page>,"<the final rule's sentence stating the factor>"
```

Effective windows: files with no dates of their own (RVU, GPCI, ZIP, MPPR, MUE) take the calendar year unless
`--effective-from` and `--effective-to` (or `open`) say otherwise. A quarterly update is a new file with its own
window; re-import the previous quarter's file with `--effective-to` set to the day before, or the checker
refuses the overlap. NCCI PTP edits and code lists carry their own start and stop dates. Each NCCI quarter and
each code-list export is complete, so remove the previous one's draft before importing the next.

Size: the practitioner PTP tables hold a very large number of code pairs, and one JSON record per pair (with
its source and quoted row) makes a draft far larger than the other types. Check the size of each PTP draft
before committing it; the plan does not yet say whether only therapy code pairs should be kept.

## Release 1, step by step

1. Download the ten files above and run each `pnpm rules:import` command. Each prints the draft it wrote, the
   stored source with its SHA-256, and the questions a reviewer must answer; the same questions are in the
   draft's `<file>.review.md`.
2. Replace the plan-sourced drafts with primary sources: store the CMS therapy services page (or the final rule),
   the sequestration notice, the Medicare appeals guidance, and G.S. 58-3-225 with the NCDOI page under
   `content/sources/<type>/`; re-cite each hand-typed draft in `content/drafts/` to them, with quotes from the
   stored files; fill in what the plan leaves open (the North Carolina interest rate, the windows' starting
   events, sequestration's dates); and have a second person redo each `records.second-pass.json` from the
   stored source.
3. Run `pnpm verify-content` until it passes.
4. Verify to L2: a person reads every draft against its stored source, answers its questions, and sets
   `verification` on each record to level L2 with their name and the date. For a parsed draft, after reading
   it against the file:

   ```sh
   jq --arg by "<reviewer>" --arg on "$(date -u +%F)" \
     'map(.verification = {level: "L2", by: $by, on: $on, questions: []})' \
     content/drafts/pfs_rvu/2026/PPRRVU26_JAN.json > /tmp/draft.json \
     && mv /tmp/draft.json content/drafts/pfs_rvu/2026/PPRRVU26_JAN.json
   ```

5. `pnpm release:assemble 1` (refuses while any draft is still L1), then `pnpm verify-content` and
   `pnpm release:dry-run 1`.
6. Open a pull request titled "content: release 1" with the dry-run output; review and merge it. CI publishes
   `content/outgoing/1` to `content/releases/1` and tags `content-release-1`; `pnpm release:load 1` loads it.
