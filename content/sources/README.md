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
- No PHI, no contract, no remittance, ever. Synthetic files never come here; they live in
  `fixtures/synthetic/cms/`. `rules:import` refuses a file that says SYNTHETIC on its first line, has the same
  bytes as any file under `fixtures/`, or carries a reserved SYNTHETIC identifier (carrier 99999, state ZZ,
  ZIP codes 00000 to 00099); `pnpm verify-content` refuses the same in any stored source or record here.

## What is here now

| Path | What | Used by |
| --- | --- | --- |
| `plan/rules-reference.md` | A byte-for-byte copy of `docs/product/rules-reference.md` (the plan's Rules reference tab as of 2026-10-14), with `rules-reference.md.sha256` | The hand-typed release 1 drafts (thresholds, assistant modifiers, sequestration, the MPPR percentage, Medicare windows, North Carolina prompt pay), at L1 |

The plan's rules reference is the only source this environment could reach: cms.gov, x12.org and ncdoi.gov
are blocked here. It is a secondary source, so the checker keeps every record citing `content/sources/plan/` at
L1: none of them can enter a release. Each hand-typed draft names, in its notes and L2 questions, the primary
page to read and store in its place (the CMS therapy services page, the CY 2026 final rule, the NCDOI
prompt-pay page and G.S. 58-3-225). Both transcriptions of those drafts were typed by the same build session,
so neither is an independent second pass; the checker refuses L2 while both name the same transcriber.

## Milestone 0 status: open

Milestone 0's done check ("release 1 loads into an empty database") is not met. None of the ten files below
is in the repository, so there is no parsed draft, no record at L2, no `content/outgoing/1` and no
`content/releases/1`. The only release that has ever loaded is the SYNTHETIC test fixture
(`fixtures/synthetic/rules/release-synth-900001`), into scratch test databases. The steps below finish it.

## Release 1: the files a person must download

None of the files below is in the repository yet, and nothing in it was typed from memory: every RVU, GPCI,
conversion factor, MPPR code, NCCI pair, MUE and code-list entry must come from the published file through its
parser. The addresses below were written from the plan and could not be opened from this environment; if a
page has moved, search cms.gov or x12.org for the title given. File names inside each download change from
release to release; the commands use example names.

Download each file to your machine (never into the repository by hand), rename it to letters, digits, dots,
dashes and underscores if needed, and run the command from the repository root. `--url` (required) is the
address the file was downloaded from; `--retrieved` defaults to today. Rows 1, 2, 3 and 7 are quarterly files
and their examples are for 2026 Q4: use the quarter current when you import, and every quarter of 2026 already
published (see "Quarterly files" below). The parsers were written without the published layout
documents, so the first real import of each file checks its layout: a parser refuses a file whose headings it
does not recognize, or where more than one heading could be the column it needs, and names the headings; fix
the parser in a pull request rather than editing the file.

| # | Record type | What to download | From | Command |
| --- | --- | --- | --- | --- |
| 1 | `pfs_rvu` | The relative value file zip of the quarter (RVU26D for 2026 Q4); inside it, the PPRRVU file in CSV form | CMS, "PFS Relative Value Files" (https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files) | `pnpm rules:import --type pfs_rvu --year 2026 --file PPRRVU26_OCT.csv --effective-from 2026-10-01 --effective-to 2026-12-31 --url <the RVU26D zip's download address>` |
| 2 | `pfs_gpci` | The GPCI file from the same zip (CSV). If it carries the work GPCI both with and without the 1.0 floor, say which Medicare applies in 2026 with `--gpci-floor with` or `--gpci-floor without` (from the final rule); every record names the heading it was read from | Same RVU26D zip | Rename the zip's `GPCI2026.csv` to `GPCI2026_Q4.csv` first (every RVU zip of the year ships a `GPCI2026.csv`, often with the same bytes), then `pnpm rules:import --type pfs_gpci --year 2026 --file GPCI2026_Q4.csv --effective-from 2026-10-01 --effective-to 2026-12-31 --url <the RVU26D zip's download address> [--gpci-floor with\|without]` |
| 3 | `locality_map` | The ZIP code to carrier locality file for the current quarter; inside it, the fixed-width `ZIP5_<month><year>.txt` | CMS, "Zip Code to Carrier Locality File" (physician fee schedule pages on cms.gov) | `pnpm rules:import --type locality_map --year 2026 --file ZIP5_OCT2026.txt --effective-from 2026-10-01 --effective-to 2026-12-31 --url <download address>` |
| 4 | `conversion_factor` | Nothing to download as a table: read the two CY 2026 conversion factors (qualifying APM participants and everyone else) in the CY 2026 physician fee schedule final rule, and prepare the CSV below **twice**, independently | The final rule in the Federal Register (https://www.federalregister.gov), and the RVU26A zip's documentation | `pnpm rules:import --type conversion_factor --year 2026 --file cf-2026-a.csv --second-pass cf-2026-b.csv --url <Federal Register URL>` |
| 5 | `mppr_rate` | The therapy MPPR rate file (last updated February 24, 2026 to add 97026) | CMS therapy services (https://www.cms.gov/medicare/coding-billing/therapy-services) | `pnpm rules:import --type mppr_rate --year 2026 --file MPPR_THERAPY_2026.csv --url <download address>` |
| 6 | `ncci_ptp` | The practitioner PTP edit files for the current quarter (several files per quarter; import each) | CMS, "Medicare NCCI Procedure to Procedure (PTP) Edits" (https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-procedure-procedure-ptp-edits) | `pnpm rules:import --type ncci_ptp --year 2026 --file NCCI_PTP_PRACTITIONER_2026Q4_F1.txt --url <download address>` (then each further file of the quarter) |
| 7 | `ncci_mue` | The practitioner services MUE table for the current quarter (CSV) | CMS, "Medicare NCCI Medically Unlikely Edits (MUEs)" (https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-medically-unlikely-edits) | `pnpm rules:import --type ncci_mue --year 2026 --file MUE_PRACTITIONER_2026Q4.csv --effective-from 2026-10-01 --effective-to 2026-12-31 --url <download address>` |
| 8 | `carc` | The claim adjustment reason code list, exported as CSV with code, description, start, last modified and stop dates | X12 (https://x12.org/codes/claim-adjustment-reason-codes) | `pnpm rules:import --type carc --year 2026 --file CARC_2026-11.csv --url <download address>` |
| 9 | `rarc` | The remittance advice remark code list, as CSV | X12 (https://x12.org/codes/remittance-advice-remark-codes) | `pnpm rules:import --type rarc --year 2026 --file RARC_2026-11.csv --url <download address>` |
| 10 | `claim_status_code` | The claim status code list, as CSV | X12 (https://x12.org/codes/claim-status-codes) | `pnpm rules:import --type claim_status_code --year 2026 --file CLAIM_STATUS_2026-11.csv --url <download address>` |

The conversion-factor CSV a reviewer prepares (twice) has exactly these headings; the importer checks that
each factor appears, as typed, inside the sentence quoted from the final rule, and that the two preparations
agree:

```csv
applicability,conversion_factor,effective_from,effective_to,citation,quote
non_qualifying_apm,<factor>,2026-01-01,2026-12-31,<FR volume and page>,"<the final rule's sentence stating the factor>"
qualifying_apm,<factor>,2026-01-01,2026-12-31,<FR volume and page>,"<the final rule's sentence stating the factor>"
```

Effective windows:

- **Quarterly files.** RVU (PPRRVU), GPCI, ZIP5, ZIP9 and MUE carry no dates of their own. Import each for the
  CMS quarter the file states:
  - pass that quarter's `--effective-from <first day> --effective-to <last day>`, for example
    `--effective-from 2026-10-01 --effective-to 2026-12-31` for 2026 Q4;
  - the importer refuses a window that leaves that quarter, an open one, or a file whose stated quarter differs;
  - `--url` is the address the file was downloaded from: for a file taken out of a zip (PPRRVU, GPCI), the zip's
    own address, whose name carries CMS's quarter token (`RVU26D`); keep the token (`RVU26D`, `_OCT`, `2026Q4`)
    in the file name too if you rename it;
  - rename a file whose name carries no quarter token to add one (`GPCI2026.csv` becomes `GPCI2026_Q4.csv`). The
    draft is named after the file, and the importer refuses to replace a draft of the same name that holds another
    window, so each quarter keeps its own stored file and draft even when CMS ships the same bytes again.

  RVU records also carry the fee schedule year and the CMS quarter (A January, B April, C July, D October), taken
  from the window's start. The importer reads the quarter a file states: for ZIP5 and ZIP9, the year and quarter
  at positions 76-80 of its lines; for PPRRVU, GPCI and MUE, the quarter token or effective date in its title lines,
  its name or its download address. A token ends at anything but a letter or a digit, so an underscore, a dash or a
  dot touching it still separates it (`rvu26d_updated.zip`, `MUE_PRACTITIONER_2026Q4_v2.csv`); an RVU token may
  carry CMS's revision letter (`RVU24AR`), and an effective date may follow `Eff` or `Effective` with a space, an
  underscore, a colon, a dot or a dash (`MCR_MUE_PractitionerServices_Eff_10-01-2026.csv`). It refuses a file that
  states none, or two: if a real file states its quarter another way, fix the parser in a pull request, as for a
  layout. The content checker reads the stored file's quarter the same way and refuses a PPRRVU, GPCI or MUE record
  whose window is in another quarter, or does not start on the day the file takes effect.
- **A correction inside a quarter.** When CMS reissues a quarter's file with values that take effect on a day
  inside the quarter, remove that quarter's draft, import the original file for the quarter's first day to the
  day before the correction, and import the corrected file from the correction's day to the quarter's last day.
  Both are verified again. When the correction applies from the quarter's first day, the corrected file replaces
  the original for the whole quarter. Either way the quarter stays covered once, with no gap, and its coverage
  never shrinks.
- **Keep every quarter.** Never re-import or delete a verified quarter. Each quarter's records stay, so the next
  release covers every date the last one did. The checker and the assembler refuse a release that stops covering
  a code and date its previous release covered (section "Coverage" below).
- **The MPPR list** carries no dates either. It takes the calendar year unless `--effective-from` and
  `--effective-to` say otherwise, never leaves that year, and is never open.
- **Imported, never typed.** Quarterly files and the MPPR list are imported, never typed by hand with
  `/new-rule-record`: the checker refuses a hand-typed record of those types. The general practice-expense
  reduction stays hand-typed.
- **Files that carry their own dates** (NCCI PTP, the X12 code lists, the conversion-factor CSV): each quarter's
  or export's file is complete, so remove the previous one's draft before importing the next. Their deletions and
  stop dates close coverage, and the check lists those closings itself.

Size: the practitioner PTP tables hold a very large number of code pairs, and one JSON record per pair (with
its source and quoted row) makes a draft far larger than the other types. Check the size of each PTP draft
before committing it; the plan does not yet say whether only therapy code pairs should be kept.

## Release 1, step by step

1. Download the ten files above and run each `pnpm rules:import` command. Each prints the draft it wrote, the
   stored source with its SHA-256, and the questions a reviewer must answer; the same questions are in the
   draft's `<file>.review.md`.
2. Replace the plan-sourced drafts with primary sources: store the CMS therapy services page (or the final rule),
   the sequestration notice, the Medicare appeals guidance, and G.S. 58-3-225 with the NCDOI page under
   `content/sources/<type>/` with their `.sha256`; re-cite each hand-typed draft in `content/drafts/` to them
   (`source.path`, `source.sha256`, and `source.url`, which a record at L2 must have), with quotes from the
   stored files that state each value; fill in what the plan leaves open (the North Carolina interest rate,
   the windows' starting events, sequestration's dates and any suspension, as its own record with
   `suspended: true`); and have a second person redo each `records.second-pass.json` from the stored source,
   under their own name.
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

5. `pnpm release:assemble 1` (it takes the drafts at L2 or higher and lists any left at L1 in RELEASE.md, under
   "Drafts not in this release"; release 1 should leave none out; it writes the release's `COVERAGE.md`, below), then `pnpm verify-content` and
   `pnpm release:dry-run 1`.
6. Open a pull request titled "content: release 1" with the dry-run output; review and merge it. CI runs the
   checker again, publishes `content/outgoing/1` to `content/releases/1` and tags `content-release-1`.
7. On an empty database: `pnpm db:migrate` then `pnpm release:load 1`. That is milestone 0's done check.

## Coverage

Every prepared release holds a `COVERAGE.md`, written by `pnpm release:assemble` and sealed by its manifest
(docs/adr/0071). Under a short summary it holds one JSON block: the release and the release before it, the day it
was prepared, the look-back's cutoff, and, per content (each record type, with the MPPR list's per-code rates and
its general reduction apart), the record count, the dates it is loaded for, its newest start and its newest
retrieved date. Never edit it: `pnpm verify-content` recomputes all of it from the release's records and the
previous release's.

A release may not cover less than the release before it. For every code and date the previous release covered,
the new one must cover it too, with three allowances, each listed in `COVERAGE.md` by the assembler:

- **Before the look-back.** Dates before January 1 of the prepared year less six (2020-01-01 for a release
  prepared in 2026) may go: six years covers line data's retention (contract term plus six years) and every
  Medicare window.
- **Closed by the source's own dates.** An NCCI PTP pair's deletion date, or a code list's stop date, that closes
  a record the previous release had open. The row the closing record quotes must state that date: an end typed into
  a draft by hand closes nothing.
- **Withdrawn on purpose,** with a signed note. Anything else the assembler refuses, and prints the exact ranges.

To withdraw coverage on purpose, write `content/drafts/COVERAGE-WITHDRAWN.md` before assembling: a heading, any
prose, and one `json` block:

```json
{
  "format": "tp-coverage-withdrawn/1",
  "previous_release": <the newest release>,
  "withdrawn": [
    {
      "record_type": "<type>",
      "key": { <the record's key, as the assembler printed it> },
      "from": "<first day>",
      "to": "<last day, or null>",
      "reason": "<one line: why this coverage is withdrawn>",
      "withdrawn_by": "<a named person>",
      "confirmed_by": "<a different named person>",
      "withdrawn_on": "<the date>"
    }
  ]
}
```

Each entry is one range exactly as the assembler printed it, listed once, with one reason and two different named
people. The
founder's code-owner review of the pull request that adds the note is the second signature of record. The
assembler copies the note's entries into the release's `COVERAGE.md` and `RELEASE.md`, then removes the note from
the drafts once the release verifies; the checker refuses a note that names a release other than the newest.
