# 0064. Resolve a split ZIP's locality from the ZIP+4 file's ranges, the one engine change the freeze allows

- **Status:** accepted (PR 6b-1, the engine part); amends [0029](0029-price-a-claim-at-a-time-from-resolved-agreements-and-recompute-every-amount-from-its-trace.md) (the trace's two optional keys), [0033](0033-read-contract-pages-at-intake-in-a-bounded-thread-hold-general-terms-and-price-what-the-review-found-unsettled.md) (the locality rule) and [0034](0034-price-every-contract-method-hold-ncci-edits-for-review-and-keep-the-golden-lines-first.md) (`ENGINE_VERSION`). PR 6b-2 amends it with the practice's location record, the pricing settings taken at onboarding, the months that wait for them and the screening's ZIP+4.
- **Date:** 2026-10-21
- **Deciders:** the founder, Tyler Williams: the ruling of 11:47 UTC on 2026-10-18 that supersedes ADR 0062's owner ruling 3 (`docs/product/reconciliation-001.md`, the engine freeze at line 428 and the Approval at line 499), and on 2026-10-21 (about 22:30 UTC) the answers to PR 6b's 13 questions ("Do all the recommended options for these questions as long as it optimizes the app"; every recommended answer of `designs/pr6b-plan.md` section 3 accepted), of which this pull request builds Q3 (a) and Q4 (a); the build (PR 6b-1 of Change Order 001)
- **PRD sections:** 9 (rule records and releases), 11 (the engine: step 2 and the trace), 18 (the pricing oracle); Change Order 001 and reconciliation-001's checks (lines 423-454); test matrix PRC-16, PRC-21 and PRC-22; ADRs 0020, 0029, 0033, 0034, 0037 and 0062

## Context

CMS prices a Medicare line at the payment locality of the place of service. Its quarterly "ZIP Code to Carrier
Locality File" archive holds two fixed-width files: ZIP5, one line per five-digit ZIP, and ZIP9, nine-digit codes
"only ... for the identified problem areas" (CMS transmittal R1249CP, CR 5578): the ZIPs whose ZIP5 line carries the
plus-four flag at position 21, because they span localities. A Medicare contractor returns a claim for such a ZIP
without its ZIP+4 as unprocessable (First Coast, "ZIP codes requiring a nine-digit ZIP code").

What the repository held at `8e33cb3`, and what constrains the design:

- The engine takes a five-digit ZIP (`PracticeSettings.zip`, `/^\d{5}$/`) and reads the `locality_map` record in
  force on the service date, whatever the basis year (QUESTIONS Q07). A record with `plus_four_required` true stops
  every fee-schedule line with `ENGINE_ERROR locality_needs_zip_plus_four` (ADR 0033): no input carried a ZIP+4.
- `cms_zip5_locality` reads the flag; nothing read the ZIP9 file, and no record type could hold it.
- Change Order 001 froze the engine: no non-test file under `packages/pricing/src` changes, `fixtures/golden` stays
  unchanged, and no DDL touches `rule_release`, `rule_record` or `rule_release_withdrawal`. The founder's ruling of
  11:47 UTC on 2026-10-18 loosened the freeze for this lookup alone: ZIP+4 localities are fixed before launch in PR 6b,
  five-digit ZIPs and the golden lines unchanged.
- Releases 900001 to 900005 are frozen (110 golden claims pin 900001's manifest); 900001 flags 00012 and carries no
  ZIP9 file.

## Decision

**The founder's rulings this pull request builds, recorded 2026-10-21.**
- The ruling of 11:47 UTC on 2026-10-18: the engine resolves a ZIP+4's locality, and nothing else under
  `packages/pricing/src` changes. `git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts'` lists exactly
  `engine.ts`, `reasons.ts`, `recompute.ts`, `trace.ts` and `types.ts`; `testing.ts` and `index.ts` are unchanged.
- **Q3 (a), granted as an exception to reconciliation-001's rule-table check:** a new rule record type,
  `locality_map_plus_four`. Widening `rule_record`'s record-type CHECK by it lands in PR 6b-2's migration, the first
  pull request that loads a release holding one; this pull request has no migration and loads 900006 into no
  database. Until then `loadRelease` of such a release fails closed at the CHECK, which is harmless before launch.
- **Q4 (a), granted as an exception to "`pnpm test:golden` passes with `fixtures/golden` unchanged":** golden claims
  G196 to G199 under the SYNTHETIC release 900006, with every existing golden file byte-identical
  (`--diff-filter=MDRT` empty). The golden builder adds them, QUESTIONS Q37 and the README's count; the independent
  worksheet reads the ZIP9 file itself by the CMS layout, never the release's ranges.

**The record.** One `locality_map_plus_four` record per flagged ZIP and window, keyed `{zip}` (five digits), whose
value is `{state, ranges: [{from, to, carrier, locality, rural_indicator}]}`: inclusive four-digit bounds, sorted by
`from`, never overlapping, one to 10,000 of them. Consecutive codes of one carrier, locality and rural indicator fold
into one range; a code the file does not list is in no range. One record per ZIP rather than one per code keeps a
release a few thousand records, not a line per nine-digit code (audit #31), keeps the lookup an exact key, so
`IndexedRelease` and a keyed read by ZIP are unchanged, and leaves a search of a few ranges inside the engine. The
schema refuses a range that ends before it starts, ranges out of order or overlapping, a bound that is not four
digits, an empty list and an extra field. The key's ZIP 000xx already marks a SYNTHETIC record (`guards.ts`).

**The ZIP9 file and its parser (`cms_zip9_locality`).** ZIP5's positions 1-21 (state 1-2, ZIP 3-7, carrier 8-12,
pricing locality 13-14, rural indicator 15, plus-four flag 21, which must be 1), then one plus-four code at 22-25; the
year and quarter at 76-80 are not read, as in ZIP5. *Open item O1, unconfirmed:* the builder could not read CMS's own
record layout: from the build's session www.cms.gov, www.cms.hhs.gov and www.dir.ca.gov could not be reached (the
fetch failed to resolve them and the egress proxy refused the connection). A web search found only the California
DIR copy (2020), a third-party copy, which puts a single plus-four at 22-25 with the flag at 21, and no "low" or
"high" field. The parser follows that layout, as the design
does, and its first review question asks a reader to confirm it against the layout document shipped in the archive
before any record reaches L2. If CMS's layout is a low and high pair (22-25 and 26-29), only the parser changes: a
pair is a range, and the record holds either. The parser refuses a line too short or off the layout, a flag other
than 1, a code that is not four digits, a code mapped twice and a ZIP in two states. Each record quotes the first and
last line of each range (`ParsedRow.quotes`, which the record builder uses in place of the one quote), so
`pnpm verify-content` finds every quote in the stored file. The notes say "N lines folded into M ranges of Z ZIP
codes". No real CMS content was downloaded or committed.

**Completeness at assembly.** `release:assemble` refuses a release in which a `locality_map` record with
`plus_four_required` true is not covered, on every date of its window, by `locality_map_plus_four` records of the
same ZIP (`plusFourGaps`, naming the first date left uncovered): a release without the quarter's ZIP9 file would stop
every such practice's fee-schedule lines though the practice gave its ZIP+4. The check runs on the real-release path
only; the SYNTHETIC releases are rendered, never assembled, so 900001 keeps flagging 00012 without a ZIP9 file.

**The engine (`ENGINE_VERSION` `phase-two/2`).**
- `PracticeSettings.zipPlusFour`, optional: four digits, or null or absent. Every existing caller compiles
  unchanged; nothing in `apps/` passes one until PR 6b-2. A ZIP+4 that is not four digits is `invalid_settings`.
- Only when the ZIP's `locality_map` record says `plus_four_required` true: without a ZIP+4 the line stays
  `ENGINE_ERROR locality_needs_zip_plus_four`; with one, the ZIP's `locality_map_plus_four` record in force on the
  service date (never the latest of a LOCKED basis year: the locality follows the service date, Q07) and its range
  holding the ZIP+4 name the carrier and locality whose GPCI prices the line. No such record, or no range holding the
  code, is the new detail `ENGINE_ERROR zip_plus_four_not_in_locality_map`, never a neighbour's locality.
  `UNPRICED_REASONS` and `REVIEW_DETAILS` are unchanged, so the new detail pages the operator, and
  `docs/product/unpriced-reasons.md` (which lists reasons, not details) is unchanged.
- A ZIP that needs no ZIP+4 never reads one: given one, it prices exactly as without it.
- The trace keeps its format, `tp-pricing-trace/2`, and gains two optional keys: `settings.zip_plus_four`, verbatim
  and present only when a ZIP+4 is given, and `steps.fee_schedule.locality.plus_four` (the plus-four record, the
  ZIP+4, the range's bounds and its carrier and locality), present only when the ZIP+4 decided the locality. The
  locality's own `carrier` and `locality` stay the ZIP5 record's. A trace of a five-digit input has neither key: it is
  phase-two/1's trace key for key but for `engine`. The schema stays strict, so an image that predates the keys
  refuses a trace carrying them.
- `recompute(trace)` holds the step to what it was computed for: the flag (a flagged ZIP's priced line must carry the
  step, an unflagged one must not), the plus-four record's key against the settings' ZIP, its ZIP+4 against the
  settings', the ZIP+4 inside the recorded range, the record's window over the service date, and the GPCI's key
  against the range's carrier and locality.

**What a re-run shows.** A pricing run pins `engine_version`. A run created under phase-two/1 and still queued when
phase-two/2 deploys fails `engine_version_mismatch` (`apps/worker/src/price/execute.ts:170-172`) and is created again.
A re-run of a complete phase-two/1 run lists no changed line for any practice priced from a five-digit ZIP, which is
every practice until PR 6b-2: the amounts, reasons, adjustments and windows are equal, as the differential test proves.
A line that changes for another reason names the engine among its causes ("phase-two/1 to phase-two/2",
`causes.ts:172-173`). PR 6b-2 makes a ZIP+4 change name the setting rather than the release.

**Release 900006** (`tsx tools/release/synthetic.ts`): every file of 900001 unchanged but its GPCIs, parsed from
`GPCI_SYNTHETIC_900006.csv` (900001's locality 01 and 99999-02: work 1.000, PE 1.050, MP 0.700), and
`ZIP9_SYNTHETIC.txt` for 00012: 0000-4999 in locality 01, 5000-8999 in locality 02, 9000-9999 not listed. The
9,000-line ZIP9 file is rendered by the same tool, and unit tests hold it and 900006 equal to the rendering and
900001, 900004 and 900005 unchanged. The new GPCI table is pinned in the fixture guard's `pinned-tables.json`, as
900001's is.

**How the freeze is proved (PRC-22).** `tools/engine-freeze` (the golden builder's): `exception.json` names the five
files and the golden additions and applies only in the pull request that adds or edits it; `check.ts` fails any other
engine path, any modified golden claim or frozen release, an added golden file outside the list, and DDL on the rule
tables that the exception does not list (none here); `differential.test.ts` prices the 150 existing golden claims and
20,000 generated five-digit claims with the base and head engines and requires equal results but for `engine`, and
does not skip in CI. The engine's own property tests add: an unflagged ZIP prices the same with no ZIP+4 and with any
four digits; every code of 00012 prices at the locality its range names, and a code no range holds stops; a
five-digit input's trace carries neither new key.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Keep refusing a split ZIP (ADR 0062's ruling 3) | Superseded by the founder's ruling of 11:47 UTC on 2026-10-18 |
| One record per nine-digit code, keyed `{zip, plus_four}` | A line per code of every split ZIP in every release, held in memory by the screening's cache (audit #31); the engine would look up a key that may not exist rather than read one record |
| Ranges inside the `locality_map` record | Changes a frozen record type's shape and every stored record's hash, and mixes two source files in one record, which `verify-content` cannot quote-check |
| The ZIP5 record's locality for a ZIP+4 the ZIP9 file does not list | A guess until the specialist answers Q37. If the answer is "the ZIP5 locality", the importer adds ranges covering the unlisted codes, quoting the ZIP5 line: a content change, not an engine change |
| The plus-four record by the LOCKED basis year | The locality follows the service date (Q07), as `locality_map` does |
| A new trace format (`tp-pricing-trace/3`) | The keys are optional and every stored trace stays valid; `ENGINE_VERSION` names the engine that wrote it |
| The completeness check on the SYNTHETIC releases too | 900001 flags 00012 without a ZIP9 file on purpose and is frozen; the release tests check 900006 against it instead |

## Consequences

- A practice whose billing ZIP spans localities prices from its ZIP+4 once PR 6b-2 passes the ZIP+4; until then
  nothing in `apps/` passes one, and every pricing path is as before.
- Every five-digit input, the 150 existing golden claims and releases 900001 to 900005 are unchanged; the golden set
  grows to 154 claims and 330 lines with G196 to G199.
- Branch coverage of `packages/pricing` stays 100%; the pull request carries the `money` label, so Stryker runs on
  the change (`.github/workflows/ci.yml`).
- The test matrix gains PRC-21 (with a fixture under 900006) and PRC-22.
- A release that loads 900006 needs PR 6b-2's CHECK; the closed-list test that holds `RULE_RECORD_TYPES` equal to the
  CHECK's 17 values comes with it.

## Revisit when

- CMS's ZIP9 record layout is read and differs from the one recorded here (open item O1), or release 1's ZIP9 content
  loads;
- the specialist answers Q37 (a ZIP+4 the ZIP9 file does not list);
- PR 6b-2 lands (the practice's location, settings at onboarding, the screening's ZIP+4), or the multi-site pull
  request gives each site its own location.
