# 0008. Store rule records as self-contained JSON, check them against stored sources, and release complete snapshots

- **Status:** accepted
- **Date:** 2026-10-15
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
- **`source` points at a stored file.** `path` (the stored copy, required) and `url` (where it came from,
  optional), `retrieved`, `sha256`, `locator`, `synthetic`, and how it was entered: `parser` with the parser's
  name, or `hand_typed` with who typed it and when. Content records cite `content/sources/`; fixture records cite
  `fixtures/` and must be synthetic; the checker refuses a synthetic record in content and a real one in a fixture.
- **Every record quotes its source.** A parsed record quotes its source row verbatim, so the checker ties every
  value to a line of the stored file; a hand-typed record quotes the sentences it was typed from.
- **Transcribe twice and diff.** Hand-typed records in `<name>.json` need `<name>.second-pass.json`: a second,
  independent transcription (who, when, and each record's `key`, `value`, window and `quotes`). The checker pairs
  records by type, key and start date and refuses any difference, naming the field and both values. The
  conversion-factor CSV, which a reviewer types from the final rule, is imported with `--second-pass` and both
  preparations must agree before anything is written.
- **Parsers read documented layouts and check them.** Each parser reads its file by the column positions or
  headings of the published layout and refuses a file whose headings do not match, instead of shifting values
  into the wrong field. Nothing is written unless every row makes a valid record.
- **`denial_category` is a sixteenth record type**, because the rules reference keeps the denial classification
  "as a rule record"; the `record_type` check constraint lists it with the data dictionary's fifteen.
- **A release is a complete snapshot.** Pricing runs pin one release number, so release n holds every record a
  run under it needs. `release:assemble <n>` copies the whole draft set and refuses, writing nothing, while any
  draft is below L2 or the drafts fail the checker; dropping an unverified record silently would change prices.
  `release:dry-run` compares a release with the one before it.
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
| Assemble only the L2 records and skip the rest | A release missing a record type looks complete and prices wrongly |
| A separate table for quotes and notes | The data dictionary fixes the columns; `source` jsonb is where provenance belongs |

## Consequences

- Large CMS tables make large drafts (one object per row, with its quoted row). The NCCI practitioner PTP tables
  are the extreme; whether to keep only therapy pairs is an open question for release 1
  (content/sources/README.md).
- Raising a parsed draft to L2 means editing `verification` on every record after reading the file
  (content/sources/README.md shows a jq command).
- `pnpm verify-content` checks drafts and every prepared and published release on every pull request, and any
  directory named on its command line (the synthetic fixture release); the loader verifies the manifest and the
  schema again before writing.

## Revisit when

Release 1's real files are imported (draft sizes, layout checks against the published layout documents), or a
second state's prompt-pay rule or a contract needs a record shape this schema lacks.
