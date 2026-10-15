# 0008. Store rule records as self-contained JSON, check them against stored sources, and release only verified, real records

- **Status:** accepted
- **Date:** 2026-10-15 (revised 2026-10-15 after the milestone 0 review)
- **Deciders:** founder (engineering)
- **PRD sections:** 9 (global rule records, the release pipeline), 11 (inputs), 18 (CI); Data dictionary (Global content); Rules reference (code lists); the new-rule-record and load-release skills

## Context

Section 9 lists the record types and their fields, the checker's refusals and the pipeline, but leaves open the
file layout, what a parsed record quotes, how "transcribe twice and diff" works as a mechanism, whether a release
is a full snapshot or a delta, and how `release:assemble` treats unverified drafts. The data dictionary's
`rule_record` row has `key`, `value`, `source`, `verification` and `sha256` columns but no place named for quotes
or notes.

## Decision

- **One record, one JSON object, self-contained.** Every record carries `record_type`, `key`, `value`,
  `effective_from`, `effective_to` (inclusive, null when open), `source`, `verification`, `quotes` and `notes`
  (`packages/rules/src/schema.ts`). Record files are JSON arrays at `<type>/<year>/<name>.json`; parsed files are
  written one record per line so a review diff shows one record per line. Money is integer cents as a string,
  rates and relative values decimal strings, counts integers. Ranges are part of the schema.
- **`source` points at a stored file.** `path` (the stored copy, required) and `url` (where it came from),
  `retrieved`, `sha256`, `locator`, `synthetic`, and how it was entered: `parser` with the parser's name, or
  `hand_typed` with who typed it and when. Content records cite `content/sources/`; fixture records cite
  `fixtures/` and must be synthetic; the checker refuses a synthetic record in content and a real one in a fixture.
  `url` (section 9: "title, URL, retrieved date, SHA-256") is required on every real record at L2 or above and
  by `pnpm rules:import`; it may be null only on SYNTHETIC fixtures and on drafts still at L1. The one such draft
  set is the hand-typed placeholders citing the plan's own rules reference (`content/sources/plan/`), a secondary
  source with no URL; the checker keeps any record citing it at L1, so none can enter a release.
- **Every record quotes its source.** A parsed record quotes its source row verbatim, so the checker ties every
  value to a line of the stored file; a hand-typed record quotes the sentences it was typed from. A quote is at
  least eight characters besides surrounding spaces and holds a letter or digit. Each money, percentage and day
  value of a hand-typed record must appear, as a number of its own, in one of its quotes in a written form
  (`$2,480` or `$2,480.00` for `"248000"` cents, `85%` or `85 percent`, `120`), so a mistyped value fails even
  when the quote is genuine; the conversion-factor importer checks factors the same way.
- **Transcribe twice and diff.** Hand-typed records in `<name>.json` need `<name>.second-pass.json`: a second,
  independent transcription (who, when, and each record's `key`, `value`, window and `quotes`). The checker pairs
  records by type, key and start date and refuses any difference, naming the field and both values. At L2 or
  above, the second pass must name a transcriber other than the record's first (`source.transcribed_by`). The
  conversion-factor CSV, which a reviewer types from the final rule, is imported with `--second-pass` and both
  preparations must agree before anything is written.
- **Parsers read documented layouts and check them.** Each parser reads its file by the column positions or
  headings of the published layout and refuses a file whose headings do not match, instead of shifting values
  into the wrong field. A heading pattern that matches more than one column is refused, never resolved by taking
  the first. Where the plan's data legitimately has two candidates, a person chooses: the GPCI work index with or
  without the 1.0 floor (`--gpci-floor`), recorded in each record's notes. The MPPR share column is a percentage or
  share heading that names no money amount. Nothing is written unless every row makes a valid record.
- **No fixture reaches content.** Besides the SYNTHETIC banner, `rules:import` and the checker refuse a file or
  stored source with the bytes of any file under `fixtures/`, and any record carrying a reserved SYNTHETIC
  identifier (carrier 99999, state ZZ, ZIP codes 00000 to 00099).
- **Record shapes the plan leaves to the build.** `pfs_rvu` carries `year` and `quarter` (A January, B April, C
  July, D October), taken from the import window's start and checked against `effective_from` (section 9: "effective
  year and quarter"). `sequestration` carries `suspended`: a suspension is its own record over the suspended
  dates with a reduction of 0, never a gap, so the engine can tell "suspended" from "no record", which it reports.
  `dispute_window` stores `length` with a `unit` of days or months instead of days only: Medicare timely filing is
  12 months (or one calendar year) after the date of service (rules reference), which is 365 or 366 days depending
  on the year, so converting it to days would misstate the rule; contract windows stay in days
  (`contract_version.timely_filing_days`), and the engine computes the deadline date from the unit.
- **`denial_category` is a sixteenth record type**, because the rules reference keeps the denial classification
  "as a rule record"; the `record_type` check constraint lists it with the data dictionary's fifteen. This departs
  from the data dictionary's list of fifteen and is raised with the founder.
- **Release numbers are split.** Real content releases are 1 to 899999; SYNTHETIC fixture releases are 900000 and
  up (the test release is `fixtures/synthetic/rules/release-synth-900001`). The checker, the release commands, the
  publish script and the loader all enforce the split, so a fixture can never take release 1's number.
- **Assembly follows the load-release skill.** `release:assemble <n>` lists the drafts at L2 or higher, refuses
  any record without a source hash, and copies those records (and the matching part of their second passes) into
  `content/outgoing/<n>/`. Drafts still at L1 stay in `content/drafts`, and RELEASE.md lists them, file by file,
  under "Drafts not in this release". It refuses, writing nothing, when the drafts fail the checker or none is at
  L2. `release:dry-run` compares a release with the one before it, so a record type a release drops shows as
  removed before anyone merges it.
- **Only verified, real content loads.** `loadRelease` takes the release number the caller asked for and refuses,
  before opening a transaction, a manifest that names another, any record below L2, any synthetic record and any
  number in the SYNTHETIC range. Its one test-only option (`allowSyntheticFixtureForTests`, passed only by the
  database tests on scratch databases) admits a release that is SYNTHETIC throughout and numbered in that range.
  `pnpm release:load` refuses any directory under `fixtures/`. A release row is permanent once committed (ADR 0009),
  so every check runs before anything is written.
- **The database row is a projection.** `rule_record.source` holds the record's source plus its `quotes` and
  `notes`; `verification` holds the level; `sha256` is the SHA-256 of the record's canonical JSON (keys sorted),
  which identifies the full record in the immutable release files, where the reviewer's name and questions stay.
- **Hand-typed drafts whose source gives no start date** (sequestration, the MPPR percentage, the Medicare
  windows, North Carolina prompt pay) start on 2026-01-01, the first year release 1 prices, and say so in their
  notes and L2 questions.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A file envelope with shared source and verification, records holding only key and value | Smaller files, but the database row, the checker and the loader each need the full record; a self-contained record is what is hashed and reviewed |
| Re-parse the stored file in the checker instead of quoting rows | Stronger, but couples the checker to every parser version; the quote check is the one the plan names |
| Incremental releases (a delta on the previous one) | A run would need a chain of releases to price; rollback by "loading the previous release" (section 18) assumes snapshots |
| Refuse the whole release while any draft is L1 (this ADR's first version) | Departs from the load-release skill ("list drafts at L2 or higher"), and one unverified draft would block every verified record; listing the exclusions in RELEASE.md and the dry-run's removed counts make a missing record type visible instead |
| Mark synthetic releases with a manifest field instead of a number range | A field changes the manifest contract of ADR 0003 and the database still sees an ordinary number; a range is visible everywhere the number is |
| Store every window in days | Misstates the Medicare 12-month rule by a day in leap years |
| A separate table for quotes and notes | The data dictionary fixes the columns; `source` jsonb is where provenance belongs |

## Consequences

- Large CMS tables make large drafts (one object per row, with its quoted row). The NCCI practitioner PTP tables
  are the extreme; whether to keep only therapy pairs is an open question for release 1
  (content/sources/README.md).
- Raising a parsed draft to L2 means editing `verification` on every record after reading the file
  (content/sources/README.md shows a jq command).
- `pnpm verify-content` checks drafts and every prepared and published release on every pull request, and any
  directory named on its command line (the synthetic fixture release); any directory with a MANIFEST.json outside
  `fixtures/` is held to L2. The loader verifies the manifest, the schema, the number and the levels again before
  writing, and the publish workflow runs the checker before it publishes.
- The hand-typed drafts now in `content/drafts` cite the plan and were transcribed twice by the same build
  session; they cannot reach L2 until they cite primary documents and a second person redoes each second pass.

## Revisit when

Release 1's real files are imported (draft sizes, layout checks against the published layout documents), or a
second state's prompt-pay rule or a contract needs a record shape this schema lacks, or the founder rules on
`denial_category` against the data dictionary.
