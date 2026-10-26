# Scout: the content pipeline, #30 and #7's README part (claude/build-platform at 6ddd587)

Status: COMPLETE (all sections written; copied to /home/user/ops/designs/lane-b-release-content-checks/scout-pipeline.md).
Every claim cites file:line at 6ddd587. "Purely added refusal" means a change that makes something refused that was accepted, and changes nothing that passes today, so it falls inside #30's freeze exception ("Content checker and importer: added refusals only", combined-report.md:469).

## 1. The pipeline as built

### 1.1 Stages and commands
| Stage | Command / file | What it does |
|---|---|---|
| Import (parser types) | `pnpm rules:import` = `packages/rules/src/cli/import.ts` (package.json:25) -> `importRuleFile` (packages/rules/src/import.ts:158-203) | Stores the file under `content/sources/<type>/` with `.sha256` (import.ts:119-134); writes L1 drafts to `content/drafts/<type>/<year>/<stem>.json` plus `<stem>.review.md` (import.ts:193-201). |
| Hand-typed drafts | `/new-rule-record` skill (.claude/skills/new-rule-record/SKILL.md:8-11) | Typed twice; `records.json` + `records.second-pass.json`. |
| Check | `pnpm verify-content` = `tools/verify-content/index.ts` (package.json:24) -> `checkContent` (tools/verify-content/check.ts:339-355) | No arguments: `content/drafts`, then every numbered dir under `content/outgoing` and `content/releases`, in numeric order (check.ts:87-114). With arguments: those dirs (index.ts:12-13; contentSetAt check.ts:73-84). CI runs it with no arguments (.github/workflows/ci.yml:92). |
| Assemble | **There is an assembler**: `pnpm release:assemble <n>` (package.json:30) = `assembleRelease` (tools/release/assemble.ts:254-358) | Refuses an existing number (257-261); runs the checker on the drafts (263-266); takes every draft record at L2+ with a source hash, leaves L1 ones out (276-290); refuses no records (291-297); refuses ZIP+4 gaps on real releases (`plusFourGaps`, 181-232, called 298-301); writes RELEASE.md with the diff against the previous release (`impactLines`, 303; impact.ts:140-146) and MANIFEST.json (`sealRelease`, 242-252); re-checks the assembled dir with the checker (349-352) and deletes it on any failure (354-356). Also reachable from the console: `prepareRuleReleaseAction` (apps/web/src/lib/routes/rule-releases.ts:126-150) -> `prepareRelease` (tools/release/workspace.ts), whose ReleaseToolError message is shown to the person as an InputError (rule-releases.ts:141-145). |
| Dry run | `pnpm release:dry-run <n>` (tools/release/index.ts:265-273; dry-run.ts) | Record diff plus runs that would change. |
| Publish | `.github/workflows/publish-content.yml` on push to main touching `content/outgoing/**` (yml:9-12) | `pnpm verify-content content/outgoing/<n>` for each (yml:32-38), then `tools/publish-content.sh` (yml:46): number range (publish-content.sh:18-25), not already published or tagged (26-33), `verify-release-manifest.sh` (34), jq refusal of any `*.json` that is not an array of L2+ non-synthetic records (37-43), `git mv` to `content/releases/<n>`, commit, tag (44-49). |
| Immutability | `tools/check-releases-immutable.sh` (CI, ci.yml:93-96) | Fails a PR that changes or adds anything under `content/releases/` (check-releases-immutable.sh:15-66). |
| Load | `pnpm release:load <n>` -> `loadRelease` (packages/rules/src/loader.ts:124-177) | `readRelease` + `findOverlaps` + `loadRefusals` (126-135), then inserts. No coverage check anywhere in the loader. |
| Edit guard | `.claude/hooks/protect-content.sh` | Blocks edit tools on `content/releases/*` (71-73) and migrations (74-77), and on the hooks themselves (59-61). |

### 1.2 Record types, keys and how windows are set
- Types: schema.ts:20-38 (17 types). Identity = `record_type` + canonical JSON of `key` (records.ts:47-49). Key shapes: schema.ts:210-375 (pfs_rvu {hcpcs, modifier} 212; pfs_gpci {carrier, locality} 230; conversion_factor {applicability} 240; mppr_rate {hcpcs, modifier} or {component:'practice_expense'} 246-257; therapy_threshold {discipline} 259; assistant_modifier {modifier} 263; sequestration {program} 268; ncci_ptp {column1, column2} 278; ncci_mue {hcpcs} 286; carc/rarc/claim_status_code {code} 199-208; state_prompt_pay {state} 293; dispute_window {program, window} 306-309; locality_map {zip} 321; locality_map_plus_four {zip} 337; denial_category {group_code, carc, rarc} 368-372).
- Window: `effective_from` date, `effective_to` inclusive or null = open (schema.ts:423-425); `effective_to >= effective_from` (447-450).
- Only quarter in the schema: `pfs_rvu.value.year/quarter`, checked against `effective_from` (schema.ts:224-226, 458-467). `cmsQuarterOf` (schema.ts:67-71) maps a date to A-D. Nothing checks a window's **end**.
- `ImportWindow` {year, effectiveFrom, effectiveTo|null} (parsers/types.ts:23-29). The importer defaults it to the calendar year: `effectiveFrom ?? YYYY-01-01`, `effectiveTo === undefined ? YYYY-12-31` (import.ts:56-71; documented import.ts:35-37; CLI options cli/import.ts:213-217, 239-240, 275-277, `open` = null at 277).

| Type | Where the window comes from | Quarter checks today |
|---|---|---|
| pfs_rvu | import window (pprrvu.ts:136-137); quarter from the window's start (pprrvu.ts:94-99, 133-134) | start must be in `--year` (pprrvu.ts:96-98); no end check; the file is never read for its quarter |
| pfs_gpci | import window (gpci.ts:116-117) | none |
| locality_map (ZIP5) | import window (locality.ts:50-51) | none: positions 76-80 (YYYYQ) are never read (locality.ts:4-8, 19-36) |
| locality_map_plus_four (ZIP9) | import window (locality-plus-four.ts:160-161) | every line's YYYYQ (76-80) must equal the quarter of the window's **start** (locality-plus-four.ts:116-128, `zipFileQuarter` 35-38); window end unchecked |
| ncci_mue | import window (ncci.ts:117-118, 157-158) | none (review question only, ncci.ts:174) |
| mppr_rate | import window (mppr.ts:71-72) | none |
| ncci_ptp | the file's own effective and deletion dates (ncci.ts:71-89) | n/a |
| carc, rarc, claim_status_code | file's start date, else the window's start; end = stop date (x12-code-list.ts:55-56) | n/a |
| conversion_factor | CSV's own dates, start must be in `--year` (conversion-factor.ts:37-56) | n/a |
| hand-typed types | typed | n/a |

Quarterly types (#30's list "fee-schedule values, MUE, ZIP-to-locality"): `pfs_rvu`, `ncci_mue`, `locality_map`, `locality_map_plus_four`, and `pfs_gpci` (a fee-schedule value shipped in every quarterly RVU zip, content/sources/README.md:61; ruling needed, see §6 Q1). `mppr_rate` is an annual list with ad hoc updates (README:64) and stays on the calendar-year default.

### 1.3 What the checker refuses today (check.ts:25-43)
Per record (`checkRecord`, 155-197): source home, synthetic/real split, L1 in a release, synthetic markers, plan source above L1, unquoted hand-typed values, missing source or wrong hash, quotes not in the source. Placement `<type>/<year>/<name>.json` (200-207). Manifest (209-237). Second passes (286-327). Overlaps only (`findOverlaps`, records.ts:101-126; reported check.ts:329-331). **No gap check, no comparison with any other release, no window-shape check.** `.md` files anywhere in a set are skipped unread (check.ts:262-263); any other non-record file is refused (281-282).

### 1.4 How a release is read (constraints on any new file in a release)
- `isRecordFile` = any `.json` except `*.second-pass.json` and `MANIFEST.json` (content.ts:109-111). `readRelease` parses every such listed file as a record array (content.ts:224-229); the loader refuses on any problem (loader.ts:126-135).
- publish-content.sh's jq second line of defence reads every `*.json` except MANIFEST and second passes and refuses anything that is not an array of L2+ non-synthetic records (publish-content.sh:37-43).
- So **any new machine-readable file in a release must not end in `.json`**; a `.md` file is ignored by `readRelease`, the loader, publish-content.sh and today's checker (check.ts:262), and is sealed by the manifest because `sealRelease` hashes every file in the dir (assemble.ts:242-251).
- `MANIFEST.json` is a strict `{release, files}` (manifest.ts:26-31); adding a field would break ADR 0003's contract and every reader. Do not.

### 1.5 "Previous release": what it means today
- Real releases: `previousReleaseNumber(root, n)` = the highest number below n among `content/releases/*` and `content/outgoing/*` (tools/release/impact.ts:79-89). `releaseDirectory` prefers published over prepared (impact.ts:92-101). RELEASE.md's diff uses it (impact.ts:122-137) and only counts added/removed/changed by `recordLabel` (type + key + start), information only (impact.ts:52-76). ADR 0008 relies on that count to "make a missing record type visible" instead of refusing (docs/adr/0008-rule-records-and-releases.md:92, and its Decision "Assembly follows the load-release skill").
- Drafts: not a release. Their "previous" is the newest release number in releases ∪ outgoing; the assembler already computes it for n (assemble.ts:303 -> impact.ts:122-124).
- Withdrawals are invisible to files: a withdrawal is only a DB row (loader.ts:204-243, `rule_release_withdrawal`); `previousReleaseNumber` does not skip a withdrawn release.
- Fixture releases: `fixtures/synthetic/rules/release-synth-900001` to `900006` at 6ddd587; they are not numbered dirs (`numbered` false, check.ts:81), are variants of 900001 (tools/release/synthetic.ts:29-31, 78-79, 143-146), not a chain. They have **no previous**. 900001-900005 are frozen by the engine freeze (tools/engine-freeze/check.ts:58) and golden pins; 900006 by this item's constraints. They are checked only when named: check.test.ts:371-373 checks 900001; CI's no-argument run never reads fixtures.
- At 6ddd587 there is no `content/releases` and no `content/outgoing/<n>` (only READMEs); drafts are six hand-typed L1 types (content/drafts/*). Release 1 has no previous, so a release-vs-previous check first bites at release 2.

## 2. The README lines #7 and #30 call wrong (quoted exactly)
content/sources/README.md:81-87:
> Effective windows: files with no dates of their own (RVU, GPCI, ZIP, MPPR, MUE) take the calendar year unless
> `--effective-from` and `--effective-to` (or `open`) say otherwise. RVU records also carry the fee schedule year
> and the CMS quarter (A January, B April, C July, D October), taken from the window's start: import RVU26B with
> `--effective-from 2026-04-01`. A quarterly update is a new file with its own
> window; re-import the previous quarter's file with `--effective-to` set to the day before, or the checker
> refuses the overlap. NCCI PTP edits and code lists carry their own start and stop dates. Each NCCI quarter and
> each code-list export is complete, so remove the previous one's draft before importing the next.

What is wrong:
- "take the calendar year" (81-82): a quarterly file imported without a window covers the year (#30 "a missed April file leaves January's values in force all year").
- "re-import the previous quarter's file with --effective-to set to the day before" (85-86): the re-import writes the whole quarter again at L1 (import.ts:197, `buildParsedRecords` checkedBy 'pnpm rules:import'), and the assembler leaves L1 records out (assemble.ts:280-281), so every record of that quarter drops out of the next release until re-verified (#30 first sentence).
- "Each NCCI quarter ... is complete, so remove the previous one's draft before importing the next" (86-87): MUE is an NCCI table with no dates of its own (ncci.ts:115-118), so removing the previous quarter's MUE draft deletes MUE history (#7 "removes earlier MUE quarters too"; #30 "deletes the MUE history"). It is right only for files that carry their own dates (PTP, code lists).
- The release-1 table repeats the hazard: rows 1 (pfs_rvu), 2 (pfs_gpci) and 3 (locality_map) give no window, so they take the calendar year (README:60-62); row 6 is PTP (README:65); row 7 (MUE) does give an explicit quarter window (README:66).

The same instruction lives in code, as reviewer questions written into every `.review.md`:
- ncci.ts:109: "Is this the practitioner table (not the hospital outpatient one), and is every file of the quarter imported, with the previous quarter's drafts removed?" (PTP's question: right for PTP, but it is the source of the README's NCCI wording.)
- pprrvu.ts:155: "... and is the earlier quarter's window closed the day before?" (wrong under quarter-exact windows: nothing needs closing.)

## 3. #30, refusal by refusal: where each goes, and whether it is purely an added refusal

### R1. A quarterly file is imported with its own quarter, and windowed to exactly that quarter
- **Where:** `window()` in packages/rules/src/import.ts:56-71 (the importer front end only). For a quarterly type, refuse when `effectiveFrom` or `effectiveTo` was not given, when the start is not the first day of a CMS quarter, or when the end is not that same quarter's last day (null refused). The calendar-year default stays for every other type.
- **Not in the parsers:** `tools/release/synthetic.ts:52` calls `parser.parse` directly with the full-year window to build the frozen fixture releases, and a unit test holds the committed files equal to what it renders (synthetic.ts:27-28). parsers.test.ts:124-129 also parses pfs_rvu with an open window. A parser-level refusal would break both.
- **CLI:** no new flag is needed. The person types the quarter as `--effective-from 2026-04-01 --effective-to 2026-06-30`, which the CLI already takes (cli/import.ts:239-240, 275-277). A `--quarter 2026Q2` flag would be friendlier, but it is a new input, not a refusal, so it falls outside the exception's letter. Recommendation: no flag. Make the refusal message name the exact two options to type.
- **Purely added refusal:** yes. It only refuses imports the CLI accepts today.

### R2. The quarter is cross-checked against what the file declares
- **ZIP9:** done already for the start (locality-plus-four.ts:118-128). R1 adds the end.
- **ZIP5:** add the same check to locality.ts: every 80-character line's YYYYQ at 76-80 (`zipFileQuarter`, locality-plus-four.ts:35-38) must equal the quarter of the window's start. Refuse a line that carries none, or carries another quarter. The synthetic ZIP5 lines carry `20261` at 76-80 (probe of fixtures/synthetic/cms/ZIP5_SYNTHETIC.txt, all 80 characters), and synthetic.ts parses with start 2026-01-01, so the frozen fixtures still render. To be safe the check could sit in import.ts. In the parser it is safe because it checks the start only.
- **PPRRVU and MUE:** in the bytes, the code knows of no quarter field. The parsers were written without CMS's layout documents (content/sources/README.md:53-56). The title and copyright lines are skipped (pprrvu.ts:12-14; ncci.ts:117-118), and the synthetic files' banners state no quarter (fixtures/synthetic/cms/PPRRVU_SYNTHETIC.csv:1-2, NCCI_MUE_SYNTHETIC.csv:1). What the file does declare is CMS's name for it (RVU26A..D; PPRRVU26_JAN; MUE_..._2026Q4: README:60, 66; pprrvu.ts:155), which `storeSource` keeps as the stored source name (import.ts:119-121). Recommendation: in import.ts, read the declared quarter from the title lines when the first real file turns out to carry one, otherwise from the file name's CMS token, and refuse when neither yields exactly one quarter or it differs from the window. This fails closed: a real layout that differs gets a parser fix in a PR, as the README already prescribes (README:54-56). Open item (§6 Q2): confirm on the first real download what each file states.
- **Checker side (so a hand-edited draft cannot bypass it):** add to `checkRecord` (check.ts:155-197), for non-synthetic sets only (`set.synthetic` false). A quarterly-type record's window must be exactly one CMS quarter. For locality_map and locality_map_plus_four, every quote's YYYYQ must equal that quarter. For pfs_rvu, schema.ts:458-467 already ties value.quarter to the start. The fixture exemption follows the existing precedent "Only real releases are checked" (assemble.ts:178-179). Without it, 900001-900006 (full-year windows, synthetic.ts:52) fail and check.test.ts:371-373 goes red.
- **Purely added refusal:** yes, in all three places.

### R3. The release must keep covering what the previous release covered (look-back and signed note)
- **Definition (recommended):** coverage of an identity (records.ts:47-49) = the union of its records' windows (a null end is open). Regression = dates covered by the previous release minus dates covered by the new one, per identity. A whole type or identity vanishing is the extreme case. Each regressed range is allowed only when:
  1. it ends before the look-back cutoff; such ranges are **listed automatically**; or
  2. it is matched by a signed coverage-withdrawn entry; or
  3. **(needed, or the check refuses true source changes)** the coverage was **open-ended** in the previous release and a record of the same identity and start date now closes it, for a type whose window comes from the file's own dates: ncci_ptp's deletion date (ncci.ts:81-89), a code list's stop date (x12-code-list.ts:56), conversion_factor's CSV end (conversion-factor.ts:56). For code lists the checker can confirm `value.stop_date === effective_to` (schema.ts:203-205). For PTP it cannot without re-parsing the quote, which ADR 0008 rejected (Alternatives, "Re-parse the stored file"). So the rule is: open -> closed at the same start, for those types only. Every import-windowed and hand-typed type gets no such carve-out; once R1 holds, its windows are closed quarters anyway.
- **Where:**
  - Assembler: in `assembleRelease`, right after `plusFourGaps` (assemble.ts:298-301), against `previousReleaseNumber(root, release)` (impact.ts:79-89). It is refused before anything is written, with the same 20-line message pattern (assemble.ts:300). The console route shows the message (rule-releases.ts:141-145), so wording follows brand.md and CO-11.
  - Checker: in `checkContentSet` (check.ts:240-333), for `set.numbered` release sets (content/outgoing/<n>, content/releases/<n>, check.ts:81). The previous set is found the same way as the assembler finds it. This also covers publish-content.yml's per-dir run (yml:37), because `contentSetAt` marks `content/outgoing/<n>` as numbered (check.ts:81) and the root is the repository, so the previous dir is on disk in that checkout (fetch-depth 0, yml:25-26).
  - Not on drafts: a draft set is not a release, and it holds L1 records the assembler drops. Assembly is where the subset is known.
  - Fixture sets: no previous (not numbered), so the check does not run there. Tests drive the pure function directly, as check.test.ts does with temp roots (check.test.ts:264-363).
- **Look-back:** a stated constant beside the check. The cutoff must be deterministic, or the same published release would pass or fail on different days. Recommendation: cutoff = the release's prepared date minus the look-back, the date recorded in the coverage file below (not "today"). The value of the look-back is a product decision (§6 Q3). Nothing in docs states one: PRD.md:46 names Medicare 12 months, 120 and 180 days; the schema allows dispute windows up to 3650 days or 120 months (schema.ts:311-319).
- **"Listed automatically", and the note: one file per release, written by the assembler.** `content/outgoing/<n>/COVERAGE.md` holds one fenced JSON block (a `.md`, so §1.4's readers ignore it and the manifest seals it):
  `{ release, previous_release, prepared_on, look_back, cutoff, before_cutoff: [ {record_type, key, from, to} ... ], closed_by_source: [ ... ], withdrawn: [ {record_type, key, from, to, reason, withdrawn_by, withdrawn_on, sha256} ... ] }`.
  The assembler fills `before_cutoff` and `closed_by_source` itself (that is "listed automatically"), and RELEASE.md renders the same lists in prose for the reviewer. The checker recomputes the regression from the previous set and refuses, in each case below, a purely added refusal:
  - a numbered release with a previous release and no COVERAGE.md;
  - a malformed block (Zod strictObject);
  - `release` or `previous_release` not this set's number or its computed previous;
  - any regressed range not exactly listed, and any listed entry that matches no regressed range (no stale or blanket entries);
  - a `before_cutoff` entry ending on or after the cutoff;
  - a `withdrawn` entry whose `sha256` is not the SHA-256 of the canonical JSON (records.ts:9-29) of {previous_release, record_type, key, from, to}, which binds a signature to one exact range.
- **The signed note's home before assembly:** `content/drafts/COVERAGE-WITHDRAWN.md` (fenced JSON, the `withdrawn` entries only, each naming `previous_release`). Every check.ts .md rule is skip-only today (check.ts:262), so a check of this one name is an added refusal. The checker refuses a drafts note naming a previous release that is not the newest one, or failing its schema. The assembler copies its entries into COVERAGE.md and removes the drafts note in the same change (this is new assembler behaviour: it writes content/drafts for the first time). Otherwise the note goes stale after publication and turns the next PR red.
- **Who signs:** `withdrawn_by` is a named person and `withdrawn_on` a date, as `verification.by/on` are (schema.ts:409-416). Recommendation, mirroring the second-pass independence rule (check.ts:310-319): require a second field `confirmed_by`, a named person other than `withdrawn_by` (an L3-style confirmation the checker can verify: two non-empty, unequal names). Use the reason format the loader uses for withdrawals: one printable line of 8 to 500 characters, never PHI (loader.ts:182-183, 193, 205-207). The PR review stays the human gate. §6 Q4.
- **Purely added refusal:** yes in the checker: it refuses releases that today pass, and touches nothing else. The assembler's new outputs (COVERAGE.md, an optional RELEASE.md section, removing the drafts note) are not refusals, but `tools/release` is not one of the frozen files (docs/product/reconciliation-001.md:461 names only tools/verify-content, protect-content.sh, publish-content.yml), and #30 itself says "the checker and the assembler refuse".
- **Fixture byte-stability:** `releaseNotes` is also used to build the frozen fixture releases' RELEASE.md (synthetic.ts:83, 131, 196, 273; tools/golden-worksheet/synthetic-release.ts:105, 149). Any new section must be an optional input that renders nothing when absent, as `excluded` does (assemble.ts:64-65, 154).

### R4. No gaps inside a type
- **Definition:** per content, the union of all its records' windows over every key must have no hole between its earliest start and its latest end or open end. Contents are the record types, with `mppr_rate` split into per-code (`key.hcpcs`) and general (`key.component`), as `rule_release_content_span()` splits them (packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql:1020-1032). Exempt `locality_map_plus_four`: it is sparse by design (only split ZIPs), and `plusFourGaps` covers it (assemble.ts:169-232). Per-key holes are legitimate (a code or pair deleted and later re-added; PTP deletions), so they are not refused.
- **Where:** in `checkContentSet` after `findOverlaps` (check.ts:329-331), on every set, fixtures included. A probe of 900001, 900002 and 900006 found no type-level gap: 900002's 2025 and 2026 RVU, GPCI and CF windows are contiguous, and every type is a single run (probe script in this scratchpad, probe/gaps.mjs). Also in the assembler on the selected L2+ subset, before writing. The post-assembly re-check (assemble.ts:349-352) would catch it anyway, but later and with a worse message.
- **Purely added refusal:** yes.

### R5. A coverage summary small enough for real releases (#31 interaction; an improvement inside scope)
`checkContent` already loads every record of every set (check.ts:252-283, 343-347). The regression check needs the previous set's coverage, not its records. Keep a compact map, identity -> merged windows, for the previous numbered set only while walking sets in numeric order (check.ts:108, 343). The assembler can build that map from `readRelease` and discard the records; `releaseRecords` (impact.ts:104-110) keeps them all. This stays inside "added refusals" and does not narrow CI's check, which #31 says would need its own exception (combined-report.md:478).

## 4. publish-content.yml and protect-content.sh: what would need to change
- **publish-content.yml: nothing.** It runs `pnpm verify-content "${dir%/}"` per outgoing dir (yml:32-38). R2, R3 and R4 live in `checkContentSet`, which that call already reaches. The previous release is found from the repository root, which the workflow checks out in full (yml:25-26), and COVERAGE.md is a `.md` that `tools/publish-content.sh` never reads (find `-name '*.json'`, publish-content.sh:37). So no `run:` line changes, and F4 (only `uses:` refs, version comments, and once `runs-on` plus `timeout-minutes`; lanes/lane-b.md:312) holds without argument. tools/test/workflows.test.ts:592-594 and 1525-1527 hold its steps and its one missing timeout. No overlap with ci-deps, which changes only its pins.
- **protect-content.sh: nothing.** It guards `content/releases/*` and migrations (protect-content.sh:71-77). Drafts and outgoing stay writable by design, the manifest seals outgoing, and check-releases-immutable.sh seals published releases. The hook cannot be changed through an edit tool anyway (protect-content.sh:59-61: founder-reviewed PR only).
- **tools/publish-content.sh, verify-release-manifest.sh, check-releases-immutable.sh: nothing.** A `.json` note would have forced a change to publish-content.sh:37-38 (it refuses non-array JSON), and that change would relax a refusal, outside the exception. That is why the note is `.md`.
- **tools/verify-content/index.ts: nothing.** No new CLI flag (a flag is not a refusal).
- **.claude/skills/load-release/SKILL.md: leave it.** Lane A's #8 rewords its step 3 (combined-report.md:267), and the assembler enforces R3 and R4 whatever the skill says.

## 5. Hard constraints found while mapping (design must hold them)
1. **#42 file reached through the import closure.** `tools/screening-capacity/watched-paths.txt` is a #42 file (pr42-files.txt:143), generated from the import closure of the screening images and harness (tools/screening-capacity/watched.ts:5-31), and a unit test holds it equal to the derivation (watched.test.ts). The closure includes `tools/release/scale.ts` -> `synthetic.ts` -> `assemble.ts` -> `tools/verify-content/check.ts`, `impact.ts`, `commands.ts`, and every `packages/rules/src` file but `import.ts` and `cli/import.ts` (watched-paths.txt:414-432 for packages/rules/src and 509-514 for tools/release and tools/verify-content/check.ts; import.ts and cli/import.ts are absent). **A new source file imported from any closure file changes watched-paths.txt, so it cannot land while #42 is open.**
   - New code goes into existing closure files (check.ts, assemble.ts, impact.ts, records.ts, schema.ts, parsers/locality.ts), or into new files imported only from outside the closure (`packages/rules/src/import.ts`, the CLIs, tests).
   - New `*.test.ts` files are fine.
   - Editing closure files is allowed, but each edit makes the screening-capacity gate measure the PR (screening-capacity.yml:30-44; heavy, about one long run).
2. **No new dependency.** pnpm-lock.yaml, apps/web/package.json and apps/worker/package.json are #42 files.
3. **Fixture releases.** 900001-900006 exist, and no open branch holds more (ls-remote at scout time: ci-pin-runner, fix-screen-tour, governance, images-node-start, pr-01..pr-06 and reconciliation hold at most 900005; 900006 is on build-platform). The next free number is **900007**. Re-check before committing, because the parallel sessions' branches (pr-15b, db-function-diffs, superseded-rerun, model-eval-gate) were not on the remote yet. 900100 is the generated scale release (tools/release/scale.ts:12). `fixtures/synthetic/rules/release-synth-900001/*` is in the watched list, and new fixture dirs are not.
4. **Golden and engine.** Nothing here touches packages/pricing. The new checks never alter a record, so recordSha256 and the manifests stay unchanged.
5. **Ledger and DB:** untouched; no DDL. `rule_release_content_span()` exists already, and R4's split mirrors it.

## 6. Open questions for the design (with recommendations)
- Q1. Is pfs_gpci a quarterly type? Recommend yes: it ships in every quarterly RVU zip (README:61), and an unwindowed GPCI has the same hazard. It is the co-founder's ruling.
- Q2. What PPRRVU and MUE files declare about their quarter (§3 R2). Recommend file-name token or title line, failing closed. Confirm on the first real download.
- Q3. The look-back's length, and its anchor (recommended anchor: the prepared date recorded in COVERAGE.md). It is a product decision.
- Q4. Who signs a withdrawal: recommend two named people, with `withdrawn_by` different from `confirmed_by`.
- Q5. Should "previous" skip a release withdrawn in the database? Files cannot see withdrawals. Recommend no for now: a note says why. If wanted, it needs a committed withdrawal file, which is Lane A #8's load and rollback path.

## 7. Overlaps
- Lane A #8 (release operations): tools/release/*, loader, load-release SKILL.md step 3, the content-release runbook.
- ci-deps: publish-content.yml pins only. No overlap, because nothing in the yml changes here.
- superseded-rerun: possibly a fixture release number. Re-check 900007.
- db-function-diffs, pr-15b and model-eval-gate: no file overlap found. model-eval-gate may touch check-releases-immutable.sh's prompt half, which this item leaves alone.
- #42: watched-paths.txt (§5.1). Shared docs (test-matrix.md, reconciliation-001.md, registry.ts, matrix.ts) follow LANES rule 6.
