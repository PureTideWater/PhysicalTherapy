# content/drafts

Draft global rule records: the public, practice-independent content the engine prices from (PRD section 9).
Contract rate records are never here; they live in the database under each practice's policy.

## Where a draft fits in the release pipeline

1. **Draft** (this directory). A record is drafted under `content/drafts/<type>/<year>/` with the
   `/new-rule-record` skill, from a source file stored under [`content/sources/`](../sources/README.md).
   CMS and X12 tables are loaded by parser (`pnpm rules:import`), never typed; anything typed by hand is
   transcribed twice and diffed.
2. **Check.** `pnpm verify-content` runs the content checker; CI runs it on every pull request. It refuses a
   release when any record lacks a source, any effective window overlaps another for the same key, any
   numeric field fails its range, or any quote does not appear in the stored source text, and it refuses
   hand-typed records whose two transcriptions differ. It also refuses (docs/adr/0071):
   - in real content, a quarterly record (RVU, GPCI, ZIP5, ZIP9, MUE) whose window leaves one CMS quarter, a ZIP
     record whose quoted lines state another quarter, a per-code MPPR window that is open or leaves its calendar
     year, a hand-typed quarterly or per-code MPPR record, records of one stored source file with different
     windows, and an RVU, GPCI or MUE record whose window is not the quarter its stored file states;
   - a content with a gap inside the dates it is loaded for;
   - a prepared or published release with no `COVERAGE.md`, or one that is not exactly what the assembler writes,
     that does not match its records and the release before it (which must match its own manifest), or that
     covers less than that release beyond the allowances ([content/sources/README.md](../sources/README.md),
     "Coverage"); and a release numbered below one already prepared or published;
   - a malformed `COVERAGE-WITHDRAWN.md` here, one that withdraws a range twice, or one that names a release other
     than the newest.
3. **Prepare.** The `/load-release` skill runs `pnpm release:assemble <n>`, which copies the drafts at L2 or
   higher into [`content/outgoing/<n>/`](../outgoing/README.md) with `RELEASE.md`, `COVERAGE.md` and
   `MANIFEST.json`, and lists the drafts it left out (still at L1) in `RELEASE.md`. It refuses a gap inside a
   content, a coverage loss no allowance explains and a number below the newest release, before writing anything.
4. **Publish.** On merge to main, CI (`.github/workflows/publish-content.yml`) runs the checker on the release,
   verifies the manifest, refuses any record below L2 or marked synthetic, moves the release to
   `content/releases/<n>/` and tags it `content-release-<n>`. Nothing else writes `content/releases`.
5. **Load.** `pnpm release:load <n>` (and later the worker) loads the release into the global tables; new
   pricing runs pin it, and a re-run of an older run under it lists the changed lines before anyone accepts it.
   The loader refuses, before writing anything, a manifest that names another number, any record below L2,
   any synthetic record and any directory under `fixtures/`.

## Files

| File | Holds |
| --- | --- |
| `<type>/<year>/<name>.json` | A JSON array of rule records of that type, per `packages/rules/src/schema.ts`. Parsed drafts are named after their source file and written one record per line; hand-typed drafts are `records.json`, pretty-printed |
| `<type>/<year>/<name>.second-pass.json` | The second, independent transcription of the hand-typed records in `<name>.json`: who typed it, when, and each record's `key`, `value`, `effective_from`, `effective_to` and `quotes`. The checker compares the two field by field |
| `<type>/<year>/<name>.review.md` | For a parsed draft: the questions a reviewer must answer to raise it to L2 |
| `COVERAGE-WITHDRAWN.md` | Only when the next release withdraws coverage on purpose: the exact ranges, each with its reason and two named people ([content/sources/README.md](../sources/README.md), "Coverage"). The assembler copies it into the release and removes it here |

Every record carries `record_type`, `key`, `value`, `effective_from`, `effective_to` (inclusive; null when
open), `source` (title, URL, the stored file's path and SHA-256, retrieved date, how it was entered: by parser,
or hand-typed with who typed it, and where in the file), `verification` (L1 script-checked, L2 read against the
source by a person, L3 confirmed by a reimbursement specialist, with who, when and the open questions),
`quotes` (text that must appear verbatim in the stored source; at least eight characters, and for a hand-typed
record every money, percentage and day value must appear in one of them as written, such as `$2,480` or `85%`)
and `notes`. Money is integer cents written as a
string (`"248000"`), rates and relative values are decimal strings, counts are integers.

## Record types

`pfs_rvu`, `pfs_gpci`, `conversion_factor`, `mppr_rate`, `therapy_threshold`, `assistant_modifier`,
`sequestration`, `ncci_ptp`, `ncci_mue`, `carc`, `rarc`, `claim_status_code`, `state_prompt_pay`,
`dispute_window`, `locality_map`, and `denial_category` (the denial-classification lookup over group code,
CARC and RARC that the rules reference keeps as a rule record).

## What is here now

Hand-typed placeholders, at L1, from the plan's rules reference (`content/sources/plan/`), a secondary source:
the 2026 therapy thresholds, the CQ and CO assistant-modifier percentage, sequestration, the MPPR
practice-expense reduction, the Medicare timely filing, redetermination and reconsideration windows, and North
Carolina prompt pay. They are not release 1 content: the checker keeps any record citing the plan at L1, and
both of their transcriptions came from the same build session, so a second person redoes each second pass
after they are re-cited to the primary CMS and state documents. Each lists the questions a reviewer must
answer for L2. The parsed CMS and X12 drafts arrive when someone downloads the files and runs
`pnpm rules:import` ([content/sources/README.md](../sources/README.md)). Milestone 0 stays open until then.

## Rules for this directory

- Public sources only. No PHI, no contract, no remittance, ever.
- No value is typed from memory. Numbers come from the stored source file, by parser where the source is a table.
- Synthetic reference data used for tests is labelled SYNTHETIC in its source metadata, lives under `fixtures/`,
  and is never presented as CMS data; the checker refuses a synthetic record here.
