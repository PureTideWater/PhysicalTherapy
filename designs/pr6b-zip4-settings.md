# PR 6b, Track A: ZIP+4 localities, pricing settings at onboarding, the location record, the screening's content refusal

Design contract, 2026-10-21, revision 2 (after one independent review; section 14 lists every finding and what was done). Base: `claude/build-platform` at 8e33cb3 (PR 5, PR 6 and PR 5b merged). Read-only design: nothing was built or committed. One measurement ran in a scratch database (`tp_pr6b_design_rev2_span` on PostgreSQL 18.4, dropped afterwards).

Sources: founder rulings (HANDOFF.md 5-74, 131-139, 144-186, 261-293, 309-313); reconciliation-001.md 425-454 (the change order's checks) and 495-527; ADR 0062 owner rulings (619-668, 710-765, 766-817) and Revisit when (818-827); combined audit items #7 (254-262), #16 (335-343), #31 (472-480), #33 (490-498), #53 (670-678), #76 (877-885). Every claim about code cites `file:line` at 8e33cb3.

Out of this track (other PR 6b tracks): the screening's own consumer and its cost (#53 part 3, decision 14), switching on the 60-second time check (decision 16), mail streams (#76).

---

## 1. Founder questions (one batch, before any builder starts)

Q1 confirms a shape the adopted audit asks to confirm. Q2 to Q4 each break one of the change order's checks, and "a pull request that cannot pass one stops and asks the owner" (reconciliation-001.md:425). Q5 and Q6 touch wording the founder ruled or a promise to users. Everything else in this design follows from a ruling, an adopted audit item, or engineering only. Section 11 lists what goes to the specialist and to counsel. Section 13 gives the exact differences for each non-recommended answer.

### Q1. Where does the ZIP+4 live? (audit #16, confirming the shape against the ruling of 2026-10-18 11:47 UTC)

The ruling says "practice settings ... accept a ZIP+4". Audit #16 (adopted) asks to store it on a site record instead, because the multi-site register lands in the PR right after PR 6b (combined-report.md:337).

**Recommended: (a) a location record (`practice_site`), undated, one per practice, edited in Settings → Pricing settings.** PR 6b creates the table, moves the five-digit ZIP into it and adds the ZIP+4. The person still enters both in practice settings, so the ruling's promise to users holds word for word; only where the database keeps them changes.
- *Gives up:*
  - a bigger PR 6b: a new practice-scoped table with RLS, a PHI-registry row, a backfill, a deferred check, and a location for every practice the tests and seeds insert directly (16 sites in 12 files, §4.7);
  - `practice.zip` stays in the table, deprecated, unread and no longer written, still holding its backfilled value until the multi-site PR drops it. Between the two PRs the database holds the ZIP twice; only `practice_site` is read;
  - the multi-site PR still rewrites what PR 6b builds per practice, per site and per claim: `practice_location_status()`, `runSettings()`, the run guard, Getting started and the Pricing settings page. It also alters `practice_site` (windows, and dropping the one-per-practice index, since two sites can be open at once) under its own domain-model approval, which its new tables need anyway. What it keeps: the table, its RLS and registry row, the setters' checks in Postgres, and the stored values, with no data move.

**(a′) The same record with dated windows now** (`effective_from`, `effective_to`, one open window per practice in PR 6b, as #16's "dated site record").
- *Gives:* the multi-site PR adds no columns to `practice_site`; if PR 6b also offers "the practice moved on <date>", a move becomes a new window instead of re-pricing history.
- *Gives up:* offering moves pulls part of #16's resolution (choosing the location by service date) out of the PR the adopted audit places it in. Without moves, the windows are inert columns until the multi-site PR. Either way the multi-site PR must still drop the one-per-practice rule and needs its own approval. No customer can move between the two PRs (both land before launch), so the accuracy gain is nil in practice.

**(b) Columns on the practice, as the ruling literally reads (`practice.zip` plus a new `practice.zip_plus_four`).**
- *Gives up:* the multi-site PR moves both values into its register (a data migration), and rewrites the same readers as under (a) plus the setters and the Pricing settings form. The migration's ZIP work is done twice.

Neither option changes this today: a ZIP correction still re-prices old service dates on a re-run until the multi-site PR adds dated locations (audit #16: "a move is a new site with a new window").

*Single-site practices under (a)* see no "site" anywhere. Settings → Pricing settings shows "Practice location: ZIP code, ZIP+4", with its Medicare status. Coverage and Getting started say "billing ZIP", as #33 words it.

### Q2. A new rule record type is DDL on `rule_record` (change order, reconciliation-001.md:445: "No DDL touches `rule_release`, `rule_record` or `rule_release_withdrawal`"; audit #31, combined-report.md:478: "no DDL on rule tables")

**Recommended: (a) widen the record-type CHECK by one value, `locality_map_plus_four`.** One `ALTER TABLE ... DROP CONSTRAINT rule_record_record_type_check, ADD CONSTRAINT ...` with the 16 existing values (`rule_content.sql:19-23`) plus the new one. Additive: no row, column, key or verification changes. One record per flagged ZIP and window, ranges compressed (§3.2), looked up by the five-digit ZIP, so the keyed reads stay keyed by ZIP.
- *Gives up:* an exception to a change-order check and to #31's "no DDL" line (recorded in ADR 0064 and in the PR body's "Freeze exception" section), and the precedent of DDL on a content table. The ADD validates every row under an ACCESS EXCLUSIVE lock for the migration's length; production's `rule_record` holds only synthetic releases until release 1, so the lock is short.

**(b) No DDL: per-code `locality_map` records keyed `{zip, plus_four}`.** The `locality_map` key schema in `packages/rules` becomes a union of `{zip}` and `{zip, plus_four}`.
- *Gives up:* one record per listed ZIP+4 code instead of one per ZIP. An exact-key lookup cannot search a range, so the importer expands every range into codes. The count is unknown until the ZIP9 layout is confirmed (O1), and audit #31's memory budget pays for each record in every release. `locality_map` loses its single key shape, which every reader of the type must handle (`keyed-release.ts:32,76`, `operator_screening_run_records()`, `scale.ts`). The screening's keyed read must also fetch by `{zip, plus_four}`.

*Not offered:* putting the ranges inside the ZIP5 record's value avoids DDL and a new type, but makes one record quote two CMS files. `tools/verify-content` checks a record's quotes against its one source file (`tools/verify-content/check.ts:180-191`), and the change order freezes that tool too (reconciliation-001.md:444).

### Q3. Who may set the location: a permission of its own changes the matrix outside PR 14 (reconciliation-001.md:454; PR 5 avoided this for the correspondence contact, ADR 0061:736: "a permission of its own needs the schema")

**Recommended: (a) a dedicated `pricing_settings.set`** (practice scope, writes). It is held by practice_admin, billing_manager and firm_principal (whose `does` includes `BILLING_MANAGER_DOES`, `permissions.ts:131-144,187-191`). The reviewer is denied it by the write rule (`permissions.ts:201`). The rows seeded are exactly what `matrixRows()` (`permissions.ts:233-245`) yields for it, which `identity.db.test.ts:80` holds equal to the table.
- *Why it is best:* least privilege and a precise audit trail. A change of the billing ZIP is its own power, and PR 14 can review or narrow it without touching contract sign-off.
- *Gives up:* the matrix changes before PR 14, so PR 14's review is no longer the only one. PR 6b's matrix change then needs the security-reviewer agent's review, as PR 14's would.

**(b) Gate on `contract.sign_off`**, held by exactly the same three roles (`permissions.ts:72,137,173`), in the route and in `practice_set_location()`. This is the way PR 5 gated the contact on `agreement.sign`.
- *Gives up:* one permission then carries two powers, signing off a contract version and changing the billing ZIP. Narrowing either later moves the other with it. Audit events and persona tests read "contract sign-off" for a location change, and PR 14 would split them later, changing the route and the function again.

### Q4. Golden lines for the ZIP+4 path (reconciliation-001.md:429: "`pnpm test:golden` passes with `fixtures/golden` unchanged")

**Recommended: (a) add G196-G199 under release 900006, with every existing file under `fixtures/golden/claims`, `diffs` and `sources` byte-identical.** Also edit `fixtures/golden/QUESTIONS.md` Q37 (:226-229) and `README.md` (the count at :31-35, and :260, which says a ZIP that needs its ZIP+4 is never a golden line). CI fails on any modified, deleted, renamed or type-changed file there (§3.8).
- *Why it is best:* the independent Python oracle then covers the new path as it covers every other, under the specialist's golden-diff process.
- *Gives up:* the check as literally worded. The set grows from 150 claims and 326 lines to 154 and 330, and the specialist reviews four new lines.

**(b) Prove the ZIP+4 path outside `fixtures/golden`.** The same four claims would live in `tools/golden-worksheet/zip-plus-four/`, priced by the engine and the oracle in their own test, with Q37's amendment in ADR 0064.
- *Gives up:* the ZIP+4 lines sit outside `pnpm test:golden`, its golden diffs and the specialist's single list of questions. QUESTIONS.md Q37 ("the settings carry no ZIP+4") and README.md:260 stay stale until another PR may edit them.

### Q5. Does what the pages say is kept change for the ZIP+4? (decision 7, reconciliation-001.md:516; counsel confirms the wording)

**Recommended: (a) no change to the words.** The ZIP+4 is entered in the same "ZIP code" field. The pages already say the result's "practice name, ZIP code and email address you gave" go at 30 days (`apps/web/src/lib/screening/retention.ts:23`), as does "what you enter here" (:37). The ZIP+4 goes with them. It is never kept with a request or a 12-month summary: `screening_lead` and `prospect_request` keep the five-digit ZIP (§5.1).
- *Gives up:* this relies on "ZIP code" being read as including its four extra digits, which counsel must confirm.

**(b) Name it**: add "and the ZIP+4 when Medicare needs one" wherever the list appears (`retention.ts:23,34,37` and the other places decision 7 names).
- *Gives up:* it changes a ruled wording for a fact the current words already cover, and counsel reviews the changed list in every place.

(The first draft's O3 sent this to counsel alone and cited a `wording.ts` that does not exist.)

### Q6. A Medicare row in a quarter outside the loaded content: leave the row out, or refuse the upload (audit #7, combined-report.md:258: "the screening refuses out-of-span bands with a dated message")

**Recommended: (a) leave such rows out and count them, as the 11-claim-line floor does (D18, reconciliation-001.md:504).**
- The browser leaves out each Medicare row whose quarter is outside the loaded content. Before sending, it says, with the dates, how many rows, claim lines and dollars it left out, and the result says so too.
- A request that bypasses the browser is refused (`screening_band_outside_content`) with the row numbers.
- Three new counts on `screening_upload` record them, separate from the floor's three (whose CHECKs bound a row to 1-10 claim lines, `free_screening.sql:336`). They are deleted with the upload at 30 days and never kept with a request, summary or outcome.
- *Why it is best:* the template the capacity and large tests share spans eight quarters over two years (`packages/synth/src/screening/uploads.ts:53`). If release 1 loads one year of per-code MPPR and MUE, the prospect still gets a result for the quarters PaidWhole can price.
- *Gives up:* a result that screens fewer rows than the file holds; three more counts kept for 30 days; and new upload-page and result-page wording for counsel. The floor's counsel-confirmed sentence is untouched.

**(b) Refuse the whole upload** with the dated message (the first draft's choice).
- *Gives up:* a typical two-year upload is refused outright, and the prospect must edit the file before seeing any result. That is friction at the top of the funnel. Nothing new is stored.

---

## 2. Decisions (under the recommended answers)

1. **The engine resolves a split ZIP's locality from a new rule record type, `locality_map_plus_four`** (Q2 (a)).
   - It is keyed by the five-digit ZIP, like `locality_map`. Its value is the ZIP's sorted, non-overlapping ranges of plus-four codes, each with its carrier and locality.
   - The engine reads it only when the ZIP's `locality_map` record has `plus_four_required = true` **and** the settings give a ZIP+4.
   - Every other input takes exactly today's path. Section 3.4 lists the lines.
2. **No guess on a miss.**
   - A flagged ZIP with no ZIP+4 stays `ENGINE_ERROR locality_needs_zip_plus_four`.
   - A ZIP+4 that no range in force lists is a new ENGINE_ERROR *detail*, `zip_plus_four_not_in_locality_map`.
   - The closed list of unpriced reasons does not change (`packages/pricing/src/reasons.ts:6-19`).
   - Whether Medicare falls back to the five-digit locality for an unlisted ZIP+4 goes to the specialist (Q37, amended). A later answer of "fall back" changes the importer, not the engine (§3.2).
3. **Five-digit ZIPs are unchanged, and the proof is behavioural.** CI runs the base engine (the merge base's `packages/pricing/src`) and the head engine on every golden claim (150 claims, 326 lines) and on 20,000 generated claims with five-digit settings. Outputs must be deep-equal except `trace.engine`. The `git diff --stat` freeze check must list only the five files of §3.4 (§3.8).
4. **Versions.**
   - `ENGINE_VERSION` goes from `phase-two/1` to `phase-two/2` (`packages/pricing/src/trace.ts:18`), because an input that stopped now prices.
   - `TRACE_FORMAT` stays `tp-pricing-trace/2`. The trace gains two optional keys, present only when a ZIP+4 is given or decides the locality. Every stored trace still parses, and every five-digit trace keeps its shape key for key.
5. **The location record (Q1 (a)): `practice_site`, one row per practice in PR 6b.**
   - A ZIP is required at practice creation: in the handler, and in Postgres through a deferred constraint trigger.
   - A ZIP that needs its ZIP+4, or that the release does not map, is accepted and flagged.
6. **Pricing settings.** A new Settings section lets a practice administrator or billing manager set the ZIP and ZIP+4.
   - It is gated by the permission `pricing_settings.set` (Q3 (a)).
   - Zod validates in the route. A SECURITY DEFINER function then checks the role, the scope and the values again in Postgres. Every save is audited.
   - "Confirm your billing ZIP" joins Getting started.
7. **Months wait by name, and only when a line needs the missing location. There is no new unpriced reason.**
   - **ZIP missing.** No run is created, because every line would fail `invalid_settings` (`engine.ts:254`). The handler and Postgres both refuse the run.
   - **A ZIP the release does not know, a ZIP+4 needed, or a ZIP+4 not listed.** The run is created and priced, because only the engine knows which lines read the locality (only the percent-of-Medicare path does, `engine.ts:538-546,599-611`). If a line stops on the location, the run fails `location_not_ready` and none of its lines are kept. The month then waits without a new run each day. A fixed-fee month prices as today. This is audit #7's own rule: refuse a month only when one of its lines needs what is missing.
   - **A content gap** (`locality_not_loaded`) is not the customer's to fix and never asks them to change the ZIP. Its lines stop as today until the Release-operations PR adds "waiting on content" (#7).
   - Saving the location queues the monitor with its own key, so the waiting months price with no hand re-run.
8. **The place-of-service split is generalised, and readable by the roles that use it.**
   - `screening_place_of_service_split` becomes `place_of_service_split`.
   - At pricing time, every place the practice has not set takes the split in force. The run pins the split (`pricing_run.place_of_service_split_id`), so a correction reaches every practice's next run.
   - The pin and the read run as `tp_app`, through SECURITY DEFINER functions: `place_of_service_split_in_force()`, and `pricing_run_split(uuid)`, which returns the split only for a run in the caller's practice scope.
   - The trace already records the merged map as the engine's input (`engine.ts:192`).
9. **The screening takes a ZIP+4.**
   - It is asked for only when Medicare needs it, and kept only then (`screening_prospect.zip_plus_four`, deleted with the prospect at 30 days).
   - The keyed release read fetches the ZIP's plus-four record, so no lookup falls outside the fetch.
10. **The screening leaves out Medicare rows outside the loaded content (Q6 (a), #7's PR 6b part).**
    - A Medicare row whose quarter is not wholly inside the loaded span of each silently read content (per-code MPPR, general MPPR, MUE) is left out in the browser and counted, with a dated message. The server and `submit_screening()` refuse a request that still holds one.
    - The span function is built once in SQL, so the Release-operations PR reuses it.
11. **A re-run's diff names the setting.**
    - The `settings` cause carries which settings fields changed, so it can say "the billing ZIP+4", not just "the practice's settings".
    - A record read in only one of the two runs follows from a ZIP or ZIP+4 change only for the types the location decides (`locality_map`, `locality_map_plus_four`, `pfs_gpci`). A release change to any other record is still listed beside a settings change.

---

## 3. ZIP+4 in the engine

### 3.1 What exists (cited)

- **The ZIP check:** `const ZIP = /^\d{5}$/` (`packages/pricing/src/engine.ts:96`). `validSettings()` requires it (`engine.ts:251-258`; the ZIP test is at 254). Invalid settings stop every line with `ENGINE_ERROR invalid_settings` (`engine.ts:155-167`).
- **Where the locality is read:** only `feeSchedule()` (`engine.ts:551`), reached from `PERCENT_OF_MEDICARE` and from `LESSER_OF` with a Medicare schedule (`engine.ts:538-546`), and so from MA non-contracted terms (`engine.ts:453-454`). Fixed-schedule and per-visit terms never read it.
- **The locality read:** `release.inForce('locality_map', { zip: settings.zip }, date)` on the service date, whatever the basis year (Q07) (`engine.ts:599-600`).
  - No record means `no_locality` (`engine.ts:601-603`).
  - `plus_four_required === true` records the flag and throws `locality_needs_zip_plus_four` (`engine.ts:604-610`).
  - The GPCI is looked up by the record's carrier and locality (`engine.ts:611`).
- **Details:** `no_locality` (`reasons.ts:41-42`) and `locality_needs_zip_plus_four` (`reasons.ts:51-52`). `EngineInputError` carries a detail (`reasons.ts:107-116`).
- **Settings type:** `PracticeSettings.zip` (`packages/pricing/src/types.ts:75-86`).
- **Trace:**
  - Settings are kept verbatim (`trace.ts:57-62`; written at `engine.ts:192`).
  - `steps.fee_schedule.locality` is `{record, carrier, locality, plus_four_required}` (`trace.ts:124-125`).
  - `TRACE_FORMAT` is at `trace.ts:15`, `ENGINE_VERSION` at `trace.ts:18`, and the schema at `trace.ts:272-290`. The schema is strict, so an image that predates a key refuses a trace carrying it.
- **recompute (PRC-16):**
  - The locality record's key must equal the settings ZIP.
  - The ZIP+4 check expects "not required".
  - The GPCI key must equal the trace's carrier and locality.
  - The locality window must cover the service date (`packages/pricing/src/recompute.ts:454-465`; the doc comment is at 49).
- **Stored traces are parsed** by packets (`apps/worker/src/packets/records.ts:386,497`), reports (`apps/worker/src/report/content.ts:507`), triage (`apps/worker/src/triage/execute.ts:277`, `triage/deadline.ts:25-26`) and the trace view (`apps/web/src/lib/pricing/view.ts:126-127`).
- **The record and its parser:**
  - Schema: `locality_map` key `{zip: /^\d{5}$/}`, value `{state, carrier, locality, rural_indicator, plus_four_required (nullable)}` (`packages/rules/src/schema.ts:310-319`).
  - Parser: `cms_zip5_locality` (`packages/rules/src/parsers/locality.ts:4-70`) reads the ZIP5 file by position: state 1-2, ZIP 3-7, carrier 8-12, locality 13-14, rural 15, plus-four flag 21 (`locality.ts:5-8,33-36`).
  - It is importable (`parsers/types.ts:4-15`, `parsers/index.ts:14`).
  - SYNTHETIC markers are ZIP 000xx, carrier 99999 and state ZZ (`packages/rules/src/guards.ts:14-40`).
- **How a release keys it:**
  - In the database: `rule_record.key` is jsonb `{"zip":"00011"}`, unique on `(release_no, record_type, key, effective_from)` (`packages/db/migrations/20261015120000_rule_content.sql:36`). The record-type CHECK lists the types (`rule_content.sql:19-23`). `effective_to` is null for an open window (:27).
  - In memory: indexed by type plus `canonicalJson(key)` (`packages/pricing/src/release.ts:39-41,43-60`).
- **Versions on a run:**
  - `pricing_run.engine_version` (`packages/db/migrations/20261018090000_pricing_runs.sql:36-37`). The worker fails a run created for another engine as `engine_version_mismatch` (`apps/worker/src/price/execute.ts:170-172`).
  - `pricing_run.release_no` (`pricing_runs.sql:34-35`).
  - Each trace carries `engine`, `release {number, manifest_sha256}` and `settings` (`engine.ts:186-192`).
- **What a re-run diff shows when only the ZIP+4 changes today:**
  - `causes.ts` adds `settings` when the two traces' settings differ (`apps/worker/src/price/causes.ts:169-171`).
  - It also lists every record read in only one run as a `release_record` cause while the terms are unchanged (`causes.ts:139-165`): here, the GPCI of each locality. The diff would therefore blame the release for what the setting did. Section 3.6 fixes this.
- **Synthetic content:**
  - `ZIP5_SYNTHETIC.txt` has 00011 (flag 0) and 00012 (rural R, flag 1, locality 01) (`fixtures/synthetic/cms/ZIP5_SYNTHETIC.txt`, 2 lines).
  - `GPCI_SYNTHETIC.csv` has one locality, 99999-01.
  - Releases 900001-900005 each carry those two `locality_map` records, with windows in 2026 only (`fixtures/synthetic/rules/release-synth-90000{1..5}/locality_map/2026/ZIP5_SYNTHETIC.json`). Their MUE and per-code MPPR windows are 2026-01-01 to 2026-12-31, and the general MPPR rate is open from 2026-01-01.
  - 900001, 900004 and 900005 are rendered by `tools/release/synthetic.ts:30-46`, which a unit test holds equal to the committed files.
- **The independent oracle** refuses a flagged ZIP as "not a golden line" (`tools/golden-worksheet/golden_worksheet.py:840-849`). Its settings check is strict: exactly `zip` and `default_rounding` (`golden_worksheet.py:254-257`).

### 3.2 How CMS publishes ZIP to locality (format only; no real content was loaded)

CMS posts a quarterly "ZIP Code to Carrier Locality File" archive on its fee-schedule pages. The archive holds two fixed-width text files and their record-layout documents.

- **ZIP5:** one 80-character line per five-digit ZIP.
  - State 1-2, ZIP 3-7, carrier 8-12, pricing locality 13-14, rural indicator 15, then a lab locality and its rural indicator.
  - Plus-four flag at 21 ("1": the ZIP spans localities and the ZIP9 file decides).
  - Year and quarter (YYYYQ) at 76-80.
  - The synthetic file follows this exactly: `ZZ000129999901R01   1 ... 20261`.
- **ZIP9:** lines only for the ZIPs flagged in ZIP5 (CMS transmittal R1249CP, CR 5578: "the 9-digit ZIP code file (ZIP9) will only provide 9-digit ZIP codes for the identified problem areas").
  - Positions 1-21 follow ZIP5: state, ZIP, carrier, pricing locality, rural indicator, flag 1.
  - Then the plus-four code at 22-25, and year and quarter at 76-80.
  - A third-party copy of the layout (California DIR, 2020) shows a single plus-four at 22-25. Whether CMS's current layout carries one code per line or a low/high pair (22-25 and 26-29) **is not confirmed**. Open item O1: the builder reads the layout document shipped in the archive before writing the parser, as the ZIP5 parser's review question already demands (`locality.ts:66-69`).
- **Medicare's rule:** a claim for a ZIP that needs its ZIP+4 and lacks it is returned as unprocessable (First Coast, "ZIP codes requiring a nine-digit ZIP code"). What happens to a ZIP+4 the ZIP9 file does not list is unconfirmed (specialist, Q37). The engine stops on it (decision 2).
  - If the specialist says the ZIP5 locality applies, the importer adds the ZIP5 record's locality as ranges covering every unlisted code of that ZIP, quoting the ZIP5 line.
  - That changes content, not the engine, so no second freeze exception is needed.

**Record design (works for either layout):**
- One `locality_map_plus_four` record per flagged ZIP and window.
- Key `{zip}` (five digits).
- Value `{state, ranges: [{from, to, carrier, locality, rural_indicator}]}`, holding contiguous plus-four codes of one carrier, locality and rural indicator compressed into one range.
- Why one record per ZIP rather than one per code:
  - a few thousand records per release, not a line per nine-digit ZIP (audit #31: releases must stay small in memory);
  - an exact-key lookup, so `IndexedRelease` (`release.ts:27-37`) and the keyed read by ZIP are unchanged;
  - a range search of a few entries inside the engine.
- Each record quotes lines of one source file (the ZIP9 file), as `tools/verify-content` requires (`check.ts:180-191`).

### 3.3 Rules package (outside the freeze)

- `packages/rules/src/schema.ts`:
  - `RULE_RECORD_TYPES` (list at ~:20-36, `locality_map` at :32) gains `'locality_map_plus_four'`.
  - Its body schema:
    ```ts
    locality_map_plus_four: z.strictObject({
      key: z.strictObject({ zip: z.string().regex(/^\d{5}$/, 'must be a five-digit ZIP code') }),
      value: z.strictObject({
        state: stateCode,
        ranges: z.array(z.strictObject({
          from: z.string().regex(/^\d{4}$/), to: z.string().regex(/^\d{4}$/),
          carrier, locality, rural_indicator: z.enum(['', 'R', 'B']).nullable(),
        })).min(1).max(10000),
      }),
    }).refine(/* each from <= to; ranges sorted by from; no overlap (to < next.from) */)
    ```
- New parser `packages/rules/src/parsers/locality-plus-four.ts` (`cms_zip9_locality`), registered in `parsers/index.ts` and in `IMPORTABLE_TYPES` (`parsers/types.ts:4-15`).
  - It reads the confirmed layout by position.
  - It requires flag `1`, groups lines by ZIP and compresses adjacent codes of the same carrier, locality and rural indicator into ranges.
  - It refuses:
    - a line that does not fit the layout;
    - a plus-four that is not four digits;
    - the same code mapped twice;
    - a ZIP with lines from two states.
  - Each record quotes the first and last source line of each range. `ParseOutcome.notes` says "N lines folded into M ranges".
  - `ParsedRow` (`parsers/types.ts:43-53`) gains an optional `quotes?: readonly string[]`, used by the record builder in place of `[quote]` when present (stored records already carry `quotes`, `check.ts:191`).
  - Review questions:
    - "Does the ZIP9 record layout shipped with the file put the plus-four at 22-25, and is it one code per line or a low and high pair?"
    - "Is every ZIP the ZIP5 file flags present here for the same quarter?"
- `packages/rules/src/testing.ts:74-77` gains a SYNTHETIC `locality_map_plus_four` sample, so engine tests need no change to `packages/pricing/src/testing.ts`, which is a non-test file under the freeze.
- **Real-release assembly** (`tools/release/assemble.ts`) refuses a release whose ZIP5 file flags ZIPs without the same quarter's ZIP9 file.
  - The check lives only on the real-release path.
  - `tools/release/synthetic.ts` and the committed 900001-900005 stay byte-identical: 900001 flags 00012 with no ZIP9 record, and that stays true. Its status is `locality_not_loaded` (§4.3), never blamed on the customer.
- SYNTHETIC guard: the key ZIP 000xx already marks every synthetic plus-four record (`guards.ts:38-39`). No guard change is needed.

### 3.4 The engine change: every non-test line under `packages/pricing/src`

Five files, about 45 lines. `packages/pricing/src/testing.ts` and `index.ts` do not change.

**`types.ts`** (`PracticeSettings`, :75-86). Add after `zip`:
```ts
/** The ZIP+4's four digits, or null or absent. Read only when the ZIP's locality_map record needs its ZIP+4, whose range then names the locality. */
readonly zipPlusFour?: string | null;
```
It is optional, so every existing caller compiles unchanged:
- `testing.ts:65`;
- the worker's `settingsOf` (`apps/worker/src/price/settings.ts:38-51`);
- the screening adapter;
- the golden test.

**`reasons.ts`.**
- At :51 the comment on `locality_needs_zip_plus_four` becomes "...and the settings give no ZIP+4".
- Insert after :52:
```ts
/** The ZIP+4 file in force on the service date has no range of the practice ZIP holding its ZIP+4. */
'zip_plus_four_not_in_locality_map',
```
`UNPRICED_REASONS` is untouched, and so is `REVIEW_DETAILS`, so both new and old location details still page the operator when a line keeps them (§4.5 says when it does not).

**`trace.ts`.**
- :18 `ENGINE_VERSION = 'phase-two/2'`.
- :57-62 `settings` gains `zip_plus_four: z.string().optional()`, verbatim and absent when none is given.
- :124-125 `locality` gains `plus_four: z.strictObject({ record: recordRef, zip_plus_four: z.string(), from: z.string(), to: z.string(), carrier: z.string(), locality: z.string() }).optional()`.
  - It is present only when the ZIP+4 decided the locality.
  - `carrier` and `locality` at the top level keep their meaning (the ZIP5 record's own).
- The comment at :124 becomes "...a ZIP whose record needs its ZIP+4 is decided by the plus-four record's range; without a ZIP+4 the line stops (ENGINE_ERROR)".

**`engine.ts`.**
- :96 add `const PLUS_FOUR = /^\d{4}$/;`.
- :192:
  ```ts
  settings: { zip: settings.zip, ...(settings.zipPlusFour == null ? {} : { zip_plus_four: settings.zipPlusFour }), default_rounding: ..., place_of_service_settings: ... }
  ```
- :254:
  ```ts
  ZIP.test(settings.zip) && (settings.zipPlusFour == null || PLUS_FOUR.test(settings.zipPlusFour)) &&
  ```
- :604-611 become:
  ```ts
  const plusFour = locality.value.plus_four_required;
  const traced = { record: release.ref(locality), carrier: locality.value.carrier, locality: locality.value.locality, plus_four_required: plusFour };
  schedule.locality = traced;
  let { carrier, locality: localityNo } = locality.value;
  if (plusFour === true) {
    // The five-digit ZIP does not name the locality: the plus-four record's range holding the ZIP+4 does, in force on the service date.
    const given = settings.zipPlusFour ?? null;
    if (given === null) {
      throw new EngineInputError('locality_needs_zip_plus_four');
    }
    const split = release.inForce('locality_map_plus_four', { zip: settings.zip }, date);
    const range = split?.value.ranges.find((item) => item.from <= given && given <= item.to);
    if (split === null || range === undefined) {
      throw new EngineInputError('zip_plus_four_not_in_locality_map');
    }
    ({ carrier, locality: localityNo } = range);
    schedule.locality = { ...traced, plus_four: { record: release.ref(split), zip_plus_four: given, from: range.from, to: range.to, carrier, locality: localityNo } };
  }
  const gpci = lookup('pfs_gpci', { carrier, locality: localityNo });
  ```
  The plus-four record is read in force on the service date, as `locality_map` is (Q07), never by the LOCKED basis year.

**`recompute.ts`.**
- The comment at :49 adds "...and, where it needs its ZIP+4, the plus-four record's range holding the settings' ZIP+4".
- :460-462 become:
  ```ts
  check.same('locality record key', trace.settings.zip, String(locality.record.key.zip));
  const split = locality.plus_four;
  check.same('locality ZIP+4', locality.plus_four_required === true ? 'decided by the ZIP+4' : 'not required',
    split !== undefined ? 'decided by the ZIP+4' : locality.plus_four_required === true ? 'required' : 'not required');
  if (split !== undefined) {
    check.same('ZIP+4 record key', trace.settings.zip, String(split.record.key.zip));
    check.same('ZIP+4 against the settings', String(trace.settings.zip_plus_four), split.zip_plus_four);
    check.same('ZIP+4 in its range', 'inside', split.from <= split.zip_plus_four && split.zip_plus_four <= split.to ? 'inside' : 'outside');
    check.same('ZIP+4 record window', 'covers the service date', covers(split.record, line.service_date) ? 'covers the service date' : 'does not');
  }
  const named = split ?? locality;
  check.same('GPCI record key', `${named.carrier} ${named.locality}`, `${String(gpci.record.key.carrier)} ${String(gpci.record.key.locality)}`);
  ```

Five-digit ZIPs and ZIPs that need no ZIP+4 (flagged or not, with no ZIP+4 given) produce today's trace, key for key, apart from `engine`.

An unflagged ZIP given a ZIP+4 prices identically. Its trace differs only by `settings.zip_plus_four`.

### 3.5 Where the ZIP+4 reaches the engine

- **Price job and release impact:** `practiceSettings()` (`apps/worker/src/price/settings.ts:19-23`, called at `execute.ts:204` and `impact.ts:94`) is replaced by `runSettings(client, run)`.
  - It reads `practice_site.zip` and `zip_plus_four` (granted to `tp_app`, under the job's practice scope, `apps/worker/src/jobs/handlers.ts:12`), `practice.settings`, and the run's pinned split through `pricing_run_split(run)` (§4.6).
  - `settingsOf` gains `zipPlusFour` and the merged places.
- **Screening:** `ScreeningPricingContext.zip` (`apps/worker/src/screening/adapter.ts:79`) gains `zipPlusFour: string | null`, from `operator_screening_claim()` (§5.1). The adapter passes it into the settings it prices with.

### 3.6 Re-run diff (`apps/worker/src/price/causes.ts`)

- `LineCause` `{ kind: 'settings' }` (:61) becomes `{ kind: 'settings'; fields: readonly string[] }`: the trace settings keys whose values differ (`zip`, `zip_plus_four`, `default_rounding`, `place_of_service_settings`).
- In `lineCauses` (:139-175), a record read in one run only is skipped (not a `release_record` cause) in two cases:
  - the terms changed (today's rule, :157-159);
  - `zip` or `zip_plus_four` differ between the two traces' settings, **and** the record's type is `locality_map`, `locality_map_plus_four` or `pfs_gpci`, the three types the location decides.
- A rounding or place-of-service change skips no record: neither changes which records are read.
- Records read in both runs under different hashes stay `release_record` causes, as today.
- *What this still gives up:* when the ZIP and the release both change, a GPCI the new release added for the new locality shows under the settings cause, not as a release record.
- The web's cause labels name the fields:
  - "the billing ZIP+4 (1234 → 5678)", from both traces' settings;
  - "places of service set from the approved split (approved <date>)", when the runs' `place_of_service_split_id` differ.
- Result: a re-run after only a ZIP+4 change lists the changed lines with one cause, "the billing ZIP+4", besides the engine version when it differs.

### 3.7 The new synthetic release 900006

900001-900005 do not change. 900006 is built by `tools/release/synthetic.ts`, gaining a 900006 definition beside 900004 and 900005:
- every source of 900001 unchanged, except:
  - **`GPCI_SYNTHETIC_900006.csv`**: 900001's line, plus `99999,ZZ,02,SYNTHETIC LOCALITY TWO,1.000,1.050,0.700`;
  - **new `ZIP9_SYNTHETIC.txt`** for ZIP 00012, in the confirmed layout:
    - codes 0000-4999 map to locality 01;
    - codes 5000-8999 map to locality 02;
    - 9000-9999 are not listed (the gap the not-listed tests use).
- Notes: "every file of release 900001 unchanged but its GPCIs and a ZIP9 file ... The release of the ZIP+4 tests."
- A unit test holds the committed files equal to what the builder renders, as for 900004.

### 3.8 How CI proves the freeze (reconciliation 428 and 429)

New `tools/engine-freeze/`:
- **`exception.json`**:
  ```json
  { "ruling": "2026-10-18T11:47Z, reconciliation-001 line 428; golden additions: founder's answer to PR 6b Q4",
    "engine_files": ["engine.ts", "reasons.ts", "recompute.ts", "trace.ts", "types.ts"],
    "golden_added": ["fixtures/golden/claims/G196-*", "fixtures/golden/claims/G197-*", "fixtures/golden/claims/G198-*", "fixtures/golden/claims/G199-*"],
    "golden_edited": ["fixtures/golden/QUESTIONS.md", "fixtures/golden/README.md"] }
  ```
- **`check.ts`**, run as one ci.yml step (the workflow runs on `pull_request` only and checks out with `fetch-depth: 0`, `.github/workflows/ci.yml:2,26`):
  - It computes `base = git merge-base origin/<base_ref> HEAD`.
  - **The exception applies only in the pull request that adds or edits it**: `git diff --name-only <base> HEAD -- tools/engine-freeze/exception.json` must list the file. Otherwise the file is ignored, as stale.
    - A base merge into PR 6b needs no edit.
    - After PR 6b merges, every later PR runs with no exception, so any diff fails until that PR declares its own. CODEOWNERS (the founder) covers `tools/engine-freeze/`, so declaring one takes the founder's review (ADR 0063).
    - (The reviewer proposed binding the exception to the merge base. That still needed a hand edit after each base merge, so this design binds it to the PR that changes it instead.)
  - **Engine:** `git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts'` goes to the job summary under "Engine freeze". The check fails when the diff is non-empty and no applicable exception lists every changed path under `engine_files`.
  - **Golden and frozen releases:**
    - `git diff --exit-code --diff-filter=MDRT <base> -- fixtures/golden/claims fixtures/golden/diffs fixtures/golden/sources fixtures/synthetic/rules/release-synth-90000[1-5]` must pass, exception or not: no existing golden file or frozen release changes.
    - Added files under `fixtures/golden` must match `golden_added`, and edited files outside those directories must be listed in `golden_edited`.
    - With no applicable exception, `git diff --exit-code <base> -- fixtures/golden` must be empty (the change order's check, verbatim).
  - **`check.test.ts`** feeds it fake diffs: a stale exception ignored; an engine path outside the list; a modified golden claim (always refused); an added claim not in `golden_added`; a later PR's non-empty diff with no exception.
- **`differential.test.ts`** (vitest, the unit job):
  - **Not optional in CI.** It fails when `process.env.CI` is set and `ENGINE_FREEZE_BASE` is not; ci.yml sets `ENGINE_FREEZE_BASE` to the merge base for the unit job. It skips only locally without the variable, and says so.
  - It extracts the base's `packages/pricing/src` with `git archive <base> packages/pricing/src | tar -x` into `packages/pricing/.freeze-base/` (gitignored), so workspace dependencies resolve through `packages/pricing/node_modules`. It then deletes every `*.test.ts` in the extract, so none is collected.
  - `**/.freeze-base/**` joins the `ignored` list in `vitest.config.ts:7` and the `ignores` in `eslint.config.js:97`, so a left-over extract is never collected or linted. The builder confirms that `packages/pricing/tsconfig.json` includes `src` only.
  - It prices with both engines:
    - (1) every golden claim under its pinned release: **150 claims, 326 lines** (`fixtures/golden/README.md:31-35`: G01-G64 and G101-G195);
    - (2) 20,000 fast-check claims over releases 900001-900005 with settings `{zip ∈ {00011, 00012, 00099}, no ZIP+4}`, every method and flag the property tests generate.
  - It asserts deep equality of every `LinePricing` after replacing `trace.engine`.
  - This is the "everything else" proof: every five-digit input, flagged ZIPs included, stops or prices exactly as before.

---

## 4. The location record and pricing settings at onboarding (#16 minimal, #33)

### 4.1 What exists (cited)

- `practice.zip text CHECK (zip ~ '^[0-9]{5}$')` is nullable (`packages/db/migrations/20261015140000_tenancy.sql:49`).
  - `practice.locality_code` (:48) is never used in pricing; it is only displayed.
  - `tp_app` may INSERT and UPDATE `zip` (`tenancy.sql:600-601`).
  - The practice overview reads `zip` and `locality_code` (`apps/web/src/lib/routes/practice.ts:138,156`) and shows the ZIP (`apps/web/src/app/p/[practiceId]/page.tsx:420`).
- **Creation:** console only. The ZIP is optional (`apps/web/src/lib/routes/console.ts:259-289`; `zip` optional at :261; the INSERT at :276; the form field "ZIP (optional)" at `apps/web/src/app/console/organizations/[organizationId]/page.tsx:105`) and written straight into `practice`.
- **Setting it:** console only, platform administrators (`organization.manage`):
  - `console_practice_settings()` and `console_set_practice_settings()` (`20261022090000_review_guards_visit_shortfalls_and_practice_settings.sql:212-249`);
  - routes at `console.ts:300-355`;
  - form at `apps/web/src/lib/console/practice-settings.ts:45-57`, five digits only, at :48; the "Billing ZIP" field on `apps/web/src/app/console/practices/[practiceId]/page.tsx`, driven by `apps/web/e2e/pricing.spec.ts:37,43`.
- **A missing ZIP:** the worker hands `''` to the engine (`settings.ts:44`), so every line, fixed fee included, is `ENGINE_ERROR invalid_settings` and pages the operator.
- **The monitor:** prices each uncovered month once (`apps/worker/src/monitor/plan.ts:68-95,107-135`). A failed run never covers a month (`plan.ts:89`).
  - Months refused for an unmapped plan wait (`plan.ts:118-128`; logged at `monitor/job.ts:48-51`).
  - Triggers: after a parse (`monitor/trigger.ts`) or on the daily schedule. The payload is `{practice_id, document_id}` or `{practice_id, day}` (`apps/worker/src/jobs/registry.ts:38,64`).
- **The run guard:** `pricing_run_rules()` is SECURITY INVOKER (`20261020090000_monitoring_digests_notifications.sql:62`). On INSERT it runs as the caller, a person or a job, both through `tp_app`, under the caller's policies (:78-79).
- **Run failures:** `FailureCode` (`execute.ts:30`); `failure_code` is free text matching `^[a-z][a-z0-9_]{0,63}$` (`pricing_runs.sql:44`), so a new code needs no schema change. Failure texts are at `apps/web/src/components/pricing/display.tsx:32-36`.
- **Settings screen:**
  - Sections are listed in `apps/web/src/components/settings/nav.tsx:4,21-32`.
  - Getting started steps are at `apps/web/src/lib/routes/settings.ts:113-147` (the key union is at :114).
  - The defaults section and its actions are at `settings.ts:252-320`.
  - Proof level queues a reconcile on save (`settings.ts:382-383`).
- **Coverage** shows "Dollars waiting on mappings" (`apps/web/src/app/p/[practiceId]/coverage/page.tsx:158-195`).
- **Permissions:**
  - The matrix is `packages/db/src/authz/permissions.ts:50-90`. `BILLING_MANAGER_DOES` is at :131-144, the practice administrator at :162-178, and the firm principal at :187-191. `matrixRows()` (:233-245) turns it into `role_permission` rows, and `identity.db.test.ts:80` holds the table equal to it.
  - The seeding pattern is in `20261030090000_customer_sign_in_and_readiness.sql:44-53`.
  - A definer setter checks scope and permission as in `practice_set_materiality()` (`20261024110000_case_workbench.sql:151-166`).
- **The split:**
  - Table `screening_place_of_service_split`: append-only, approved by a contract specialist under `rate_record.approve` (`20261104090000_free_screening.sql:361-372`). RLS is forced, and its only policy is the owner's (:909-911). `REVOKE ALL ... FROM PUBLIC` (:1964) and no grant to `tp_app`.
  - Validity is checked by `screening_split_valid()` (:137-144).
  - `screening_split_in_force()` (:1009-1011) is SECURITY INVOKER, revoked from PUBLIC (:1971) and granted to no role (:1986-1993). It is called only inside the definers `screening_status()`, `submit_screening()` and `operator_screening_claim()`.
  - The console functions are at :1581-1603. The console route is `apps/web/src/lib/screening/routes.ts:1053-1090`; it audits `screening_split_approved` on object type `screening_place_of_service_split` (:1070).
  - Practice pricing never reads it today.
- **Functions made with CREATE get EXECUTE for PUBLIC:** no migration sets default privileges (`git grep "ALTER DEFAULT PRIVILEGES" packages/db/migrations` finds nothing), so every function this PR creates states its REVOKE and its grant.

### 4.2 `practice_site` (Q1 (a))

```sql
CREATE TABLE practice_site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  zip text NOT NULL CONSTRAINT practice_site_zip CHECK (zip ~ '^[0-9]{5}$'),
  zip_plus_four text CONSTRAINT practice_site_zip_plus_four CHECK (zip_plus_four ~ '^[0-9]{4}$'),
  updated_by uuid REFERENCES "user" (id),          -- the person who last set it; null when backfilled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- PR 6b: one location per practice. The multi-site PR drops this index (two sites may be open at once) and adds its windows.
CREATE UNIQUE INDEX practice_site_one_per_practice ON practice_site (practice_id);
```

**RLS and registry:**
- `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- `CREATE POLICY practice_site_tenant ON practice_site USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])) WITH CHECK (same)`.
- `CREATE POLICY practice_site_owner ON practice_site FOR ALL TO tp_owner USING (true) WITH CHECK (true)`, for the definer functions; exempt as an owner policy (`packages/db/src/catalog.ts:17-21`).
- `INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES ('practice_site', '20261105090000_pricing_location_and_zip_plus_four', 'practice_site_tenant')`.
  - It holds no PHI (a business address ZIP), but every table with a NOT NULL `practice_id` is registered (`catalog.ts:11-16`).

**Grants:**
- `REVOKE ALL ON practice_site FROM PUBLIC`.
- `GRANT SELECT ON practice_site TO tp_app` (the worker's login is a member, `packages/db/src/roles.ts:42-43`).
- No direct INSERT, UPDATE or DELETE: writes go through the definer functions below.

**Rules:**
- **`practice_site_rules()`**, BEFORE UPDATE OR DELETE:
  - DELETE is refused;
  - UPDATE may change only `zip`, `zip_plus_four`, `updated_by` and `updated_at`.
- **`practice_site_no_truncate`**, BEFORE TRUNCATE: `reject_change()`.

**ZIP required at creation (Postgres):**
- `practice_site_required()`: SECURITY DEFINER, `SET search_path = pg_catalog, public, pg_temp`.
- `CREATE CONSTRAINT TRIGGER practice_has_site AFTER INSERT ON practice DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION practice_site_required()`.
- It raises `check_violation` with `CONSTRAINT = 'practice_has_site'` when no `practice_site` row exists for `NEW.id` at commit.
- It binds every practice insert, the owner's included, so the tests and seeds that insert practices directly change (§4.7).

**Backfill and deprecation:**
- `INSERT INTO practice_site (practice_id, zip) SELECT id, zip FROM practice WHERE zip IS NOT NULL`.
- `COMMENT ON COLUMN practice.zip IS 'Deprecated by practice_site (ADR 0064): never read or written; dropped by the multi-site PR'`.
- `REVOKE INSERT (zip), UPDATE (zip) ON practice FROM tp_app`.
- Practices with no ZIP before this migration (dev and staging only; none in production) get no row. Their months wait on `zip_missing`.

**Deletion:** a deleted practice keeps its location row, as it kept `practice.zip`. Deletion destroys the data key, and the row holds no PHI.

**What the multi-site PR adds:**
- windows, dropping `practice_site_one_per_practice`;
- NPIs and therapists per location;
- site resolution per claim, rewriting the per-practice readers of §3.5, §4.3 and §4.5;
- `priced_line.practice_site_id`;
- the drop of `practice.zip` and `practice.locality_code`.

### 4.3 Status of a location in a release

New SQL functions (all `SET search_path = pg_catalog, public, pg_temp`; each `REVOKE ALL ... FROM PUBLIC`, then the grant named):
- **`locality_status(release integer, zip5 text, plus_four text, period_from date, period_to date) RETURNS TABLE (status text, carrier text, locality text)`**: STABLE INVOKER (`tp_app` reads `rule_record`, `rule_content.sql:88`). `GRANT EXECUTE ... TO tp_app`.
  - A null period means the whole release. "Overlapping" means a record window overlapping `[period_from, period_to]`.
  - Status, from the closed list, first match wins:
    - `zip_unknown`: the release has no `locality_map` record of the ZIP **in any window**. The ZIP is not on Medicare's list, so the customer checks it.
    - `locality_not_loaded`: one of two content gaps. The ZIP has `locality_map` records but none overlaps the period. Or the overlapping record is flagged and the ZIP has no `locality_map_plus_four` record overlapping the period. PaidWhole has not loaded the content; the customer has nothing to change.
    - `zip_plus_four_needed`: an overlapping flagged record and no `plus_four`.
    - `zip_plus_four_unknown`: an overlapping flagged record and an overlapping plus-four record, none of whose ranges holds the code (compared `COLLATE "C"`).
    - otherwise `ready`.
  - `carrier` and `locality` are those of the latest overlapping window, resolved through the range when flagged, for the "Medicare locality 99999-01" line.
- **`practice_location_status(target uuid, release integer, period_from date, period_to date) RETURNS text`**: STABLE INVOKER, under the caller's RLS. `GRANT EXECUTE ... TO tp_app`.
  - `no_release` when `release` is null;
  - `zip_missing` when the practice has no `practice_site` row;
  - otherwise `locality_status(...).status`.
- The closed list `ready | no_release | zip_missing | zip_unknown | locality_not_loaded | zip_plus_four_needed | zip_plus_four_unknown` is mirrored as `LOCATION_STATUSES` in `packages/contracts/src/location.ts` (new), with one customer wording per status. A unit test holds the two lists equal, and `location.db.test.ts` reaches every status.
  - `ready`: "Medicare prices this location in locality {carrier}-{locality} under rule release {n}."
  - `no_release`: "No Medicare rule release is in force yet."
  - `zip_missing`: "Add the practice's billing ZIP code."
  - `zip_unknown`: "Medicare's ZIP code list in force does not include {zip}. Check the ZIP code."
  - `locality_not_loaded`: "PaidWhole has not loaded Medicare's locality list for these dates yet. There is nothing to change here."
  - `zip_plus_four_needed`: "Medicare splits ZIP {zip} between payment localities. Add its ZIP+4."
  - `zip_plus_four_unknown`: "Medicare's ZIP+4 list in force does not include {zip}-{plus4}. Check the four digits."

The engine stays the judge per line: the statuses serve the screens and the waiting months. A ready location whose release has a content gap on some days still stops those lines with `no_locality`, a content problem that #7 and #31 own.

### 4.4 Who sets it, and where

**Permission `pricing_settings.set`** (Q3 (a)):
- In `permissions.ts`: `{ scope: 'practice', writes: true, description: 'set the practice's pricing location (its billing ZIP and ZIP+4)' }`.
- Added to the practice administrator's `does` and to `BILLING_MANAGER_DOES` (so the firm principal holds it too).
- Seeded with exactly `matrixRows()`'s rows for it: `INSERT INTO role_permission (role, action, effect) VALUES ('billing_manager','pricing_settings.set','allow'), ('firm_principal','pricing_settings.set','allow'), ('practice_admin','pricing_settings.set','allow'), ('reviewer','pricing_settings.set','deny')`.
- A firm's billing manager holds it under a grant, as it already holds `contract.sign_off` (`permissions.ts:137`). Firms onboard practices, and each change is audited.

**`practice_set_location(target uuid, zip5 text, plus_four text) RETURNS text`**: VOLATILE SECURITY DEFINER, with the Postgres check of #33. `GRANT EXECUTE ... TO tp_app`.
- It refuses with `insufficient_privilege` unless all of these hold:
  - `app_actor_id()` is not null and `app_actor_is_person()`;
  - `target` is in `app.practice_ids`;
  - `app_actor_permitted(target, 'pricing_settings.set')` (`20261015170000_identity_and_permissions.sql:156`).
- It refuses `zip5 !~ '^[0-9]{5}$'` (`CONSTRAINT = 'practice_site_zip'`) and a non-null `plus_four !~ '^[0-9]{4}$'` (`'practice_site_zip_plus_four'`).
- It upserts the one row (`updated_by = app_actor_id()`, `updated_at = now()`) and returns `practice_location_status(target, current_rule_release(), NULL, NULL)`.
- It does not set the scope, so no catalog review is needed.

**`console_set_practice_location(target uuid, zip5 text, plus_four text) RETURNS text`**: SECURITY DEFINER. `GRANT EXECUTE ... TO tp_app`.
- It requires `organization.manage`, and sets `app.practice_ids` to the target and restores it, as `console_set_practice_settings()` does.
- It is added to `REVIEWED_SCOPE_FUNCTIONS` (`catalog.ts:136-166`) with the reason "the platform administrator sets a practice's location at creation and from the console; one practice, restored".

**`console_practice_settings(uuid)`** (CREATE OR REPLACE, same OUT columns, so its grant stays): `zip` now comes from `practice_site`.

**`console_set_practice_settings(uuid,text,jsonb)`** (CREATE OR REPLACE, same signature, so the previous image still works):
- A non-null `new_zip` sets the location (and clears the ZIP+4 when the ZIP changes).
- A null `new_zip` leaves it as it is.
- It never writes `practice.zip`.
- The new image always passes null and sets the location through `console_set_practice_location()`.

**Web, practice side (`apps/web/src/lib/routes/settings.ts`):**
- **`practice.settings.pricing`** (page, `/p/[practiceId]/settings/pricing`, permission `practice.open`). It shows:
  - the ZIP and ZIP+4 and the status line from `locality_status`, in the `LOCATION_STATUSES` wording;
  - the places of service in effect, each "facility" or "non-facility", and whether it is the practice's own or the approved split's (read-only; the console still sets practice overrides);
  - the months waiting (§4.5);
  - the complete months priced before the location's last change, each linked to its re-run (existing re-run route);
  - the honest note: "This location prices every month, earlier months too when they are re-run. If the practice moved, tell us before changing it." The multi-site PR replaces the note with dated locations.
  - `canEdit = rolesPermit(access.roles, 'pricing_settings.set')`.
- **`practice.settings.pricing_location`** (action, permission `pricing_settings.set`, audit `{ action: 'pricing_location_set', objectType: 'practice' }`):
  - Input: Zod `{ zip: string }`, parsed by `parseZipCode()` in a new `apps/web/src/lib/zip.ts`, which accepts `27601`, `27601-1234` and `276011234`, as `packages/packets/src/correspondence.ts:148` already does for addresses.
  - It runs in the practice's scope (`practiceRoute`), calls `practice_set_location()`, then enqueues `monitor` with `{ practice_id, request_id }` (§4.5).
  - It redirects with the status.
- **`practice.settings.pricing_confirm`** (action, same permission, audit `pricing_location_confirmed`): the "Confirm" button.
- **Getting started:** a new step `billing_zip`, "Confirm your billing ZIP", added to the key union (:114) and the checklist (:138-146).
  - It is done when `practice_location_status(..., current_rule_release(), NULL, NULL)` is `ready` or `locality_not_loaded` (nothing the customer can change), **and** the latest `pricing_location_set` or `pricing_location_confirmed` audit event by a non-internal person is at or after `practice_site.updated_at`.
  - A location the platform administrator entered at creation therefore needs the practice's confirmation.
  - Pricing never waits for that confirmation: a ready location prices from the first upload.
- **Navigation:** `nav.tsx` gains `{ key: 'pricing', href: /p/${practiceId}/settings/pricing, label: 'Pricing settings', admin: false }`.
- **Practice overview:** `practice.ts:138,156` read the ZIP and ZIP+4 from `practice_site` (LEFT JOIN), and `page.tsx:420` shows "00012-5000".

**Web, console side:**
- `console.create_practice` (`console.ts:259-289`): `zip` is required (`parseZipCode`, five digits or ZIP+4). The INSERT at :276 no longer names `zip`. After it, the route calls `console_set_practice_location()` in the same transaction, before the deferred check runs at commit.
- The organization page's field (`[organizationId]/page.tsx:105`) becomes "Billing ZIP (ZIP+4 if Medicare needs one)", required. The page shows the returned status beside the new practice: a ZIP that needs its ZIP+4, or one the release does not map, is accepted and flagged, never refused.
- `practice-settings.ts`: `zip` leaves the settings form (:48). The console practice page (`apps/web/src/app/console/practices/[practiceId]/page.tsx`) gains its own location form, calling `console_set_practice_location()` with audit `console_pricing_location_set`, then enqueuing the monitor the same way.

### 4.5 Months that wait (no new unpriced reason)

Two waits, decided by what the month's lines need. #33 covers the missing ZIP; audit #7's rule is that a month waits only when one of its lines needs what is missing.

**1. ZIP missing (no `practice_site` row): no run is created.** Every line would fail `invalid_settings` (`engine.ts:254`).
- **Handler:** `createPricingRun()` (`apps/worker/src/price/create.ts:53`) checks the location before `recordRun`. If `practice_location_status(...)` is `zip_missing`, it throws `PricingLocationWaiting('zip_missing')`.
- **Postgres:** `pricing_run_rules()` (CREATE OR REPLACE of `20261020090000_monitoring_digests_notifications.sql:62`, still INVOKER) refuses on INSERT, after the release-pin check, when no `practice_site` row of `NEW.practice_id` exists (`RAISE ... USING ERRCODE = 'check_violation', CONSTRAINT = 'pricing_run_location_missing'`).
  - The check reads `practice_site` under the caller's RLS. The caller always has `NEW.practice_id` in scope, because the `pricing_run` tenant policy (`pricing_runs.sql:214`) requires it, and `tp_app` holds SELECT.
  - Re-runs are included.

**2. A location a line cannot be priced at (`zip_unknown`, `zip_plus_four_needed`, `zip_plus_four_unknown`): the run is priced, and fails if a line needs the location.**
- **`execute.ts`**, in the run's first transaction, reads `status = practice_location_status(practice, release, period_from, period_to)` once.
- **Location details** are `locality_needs_zip_plus_four` and `zip_plus_four_not_in_locality_map`, plus `no_locality` only when the status is `zip_unknown`.
- When the status is one of the three above and a priced batch holds a line stopped with a location detail, the pricing transaction throws `LocationNotReady`. That rolls back every line it inserted (`execute.ts:183,209-216` prices and inserts inside one transaction).
- A new transaction then fails the run with `failure_code = 'location_not_ready'`. `FailureCode` (`execute.ts:30`) gains it, and `FAILURE_TEXT` (`display.tsx:33`) gains: "A line of the period needs the practice's billing ZIP or ZIP+4: fix it in Pricing settings. Waiting months price again by themselves."
- The operator is not paged: the screens name the customer's step.
- A month whose lines never read the locality (fixed schedule, per visit) prices as today.
- With status `ready` or `locality_not_loaded`, a stopped line stays `ENGINE_ERROR` as today and pages the operator. That is a content gap, which the Release-operations PR turns into "waiting on content" (#7).

**Monitor** (`apps/worker/src/monitor/plan.ts`):
- `planMonitoring()` catches `PricingLocationWaiting` beside `PricingRefusedError` (:123-130).
- **No daily loop of failing runs.** Before creating a run for an uncovered month, a new `waitingOnLocation(client, practiceId, month, releaseNo)` checks whether the newest run of that exact period:
  - failed `location_not_ready`;
  - under the release in force;
  - with `coalesce(lines_loaded_by, created_at)` at or after the month's newest line;
  - and was created at or after `practice_site.updated_at`.
  - If so, the month waits with no new run. A location save or a new release in force plans it again.
- `MonitorPlan.planned` gains `waitingOnLocation: { periodFrom, periodTo, status }[]`.
- The job logs `LOCATION_NOT_READY` with the count (`monitor/job.ts:48-51`). It does not page the operator.

**Coverage:** a new card, "Months waiting on your billing ZIP", lists both kinds of waiting month with its billed dollars and its status in words, linking to Pricing settings. The dollars come from the uncovered months' lines, through the same totals helper the mapping card uses.

**Saving the location queues the monitor.**
- `JOB_PAYLOADS.monitor` (`registry.ts:38`) gains a third variant, `z.strictObject({ practice_id: id, request_id: id })`: the save's request id, also recorded on its audit event (`audit_event.request_id`, `20261015140500_audit_and_operations.sql:16`).
- `SUBJECTS.monitor` (:64) returns it.
- Its own key means a save is never swallowed by a daily monitor that is active and has already read the old location. The plan is idempotent (JOB-01).

**Why no unpriced reason:** the engine's list is unchanged (`reasons.ts:6-19`), and so is `priced_line.unpriced_reason`'s CHECK (`pricing_runs.sql:73-76`). A month that cannot be priced because of a practice setting keeps no lines at all, as MAP-01 does (`docs/product/test-matrix.md:46`).

**What this gives up:**
- a month with one locality-reading line among many fixed-fee lines waits whole, so no month shows partly priced;
- a person's run of such a month is a failed run with the failure text, not a refusal at creation.

### 4.6 The split, generalised and pinned on the run

**Rename** (one migration):
- `ALTER TABLE screening_place_of_service_split RENAME TO place_of_service_split`, and rename:
  - constraint `..._settings` to `place_of_service_split_settings`;
  - index `..._in_force` to `place_of_service_split_in_force`;
  - triggers `..._append_only` and `..._no_truncate`;
  - policy `..._owner`;
  - function `screening_split_valid` to `place_of_service_split_valid` (`ALTER FUNCTION ... RENAME`; its ACL, revoked from PUBLIC with no grant, is kept).
- `screening_run.place_of_service_split_id` keeps its FK through the rename.
- The audit action `screening_split_approved` and object type `screening_place_of_service_split` keep their names (`routes.ts:1070`), so the approval history reads under one name. ADR 0064 records this.
- The console page heading and nav label "Screening place of service" become "Place-of-service split". The page adds: "Approving changes every place a practice has not set, from each practice's next run, and the free screening's split."

**Functions, each with its REVOKE and exact grant** (no default privileges exist, §4.1):

| Function | How | Security | REVOKE ALL FROM PUBLIC, then GRANT EXECUTE TO |
|---|---|---|---|
| `place_of_service_split_in_force() RETURNS uuid` | new; `DROP FUNCTION screening_split_in_force()` | **DEFINER**, `SET search_path = pg_catalog, public, pg_temp` | `tp_app` (the run guard calls it as the caller) |
| `pricing_run_split(run uuid) RETURNS TABLE (place_of_service_split_id uuid, settings jsonb)` | new | **DEFINER**, STABLE. It returns the pinned split only when the run's `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])`, and no row otherwise | `tp_app` (the worker's `runSettings()`) |
| `console_place_of_service_splits()` | DROP `console_screening_splits()`, CREATE | DEFINER | `tp_app` |
| `console_approve_place_of_service_split(jsonb)` | DROP `console_approve_screening_split(jsonb)`, CREATE | DEFINER | `tp_app` |
| `screening_status()` | CREATE OR REPLACE (OUT columns unchanged, so ACL kept) | DEFINER | `tp_app` (unchanged) |

`submit_screening` and `operator_screening_claim` are in §5.1.

**Run pin:**
- `ALTER TABLE pricing_run ADD COLUMN place_of_service_split_id uuid REFERENCES place_of_service_split (id)`.
- `pricing_run_rules()` on INSERT sets it to `place_of_service_split_in_force()` when null, and refuses any other value (`CONSTRAINT = 'pricing_run_split_pinned'`). This works as `tp_app`, through the definer.
- On UPDATE it joins the fixed tuple (the `IS DISTINCT FROM` tuple at `20261020090000_monitoring_digests_notifications.sql:94-95`).
- No column grant is needed, because the trigger sets it. Existing runs keep null.

**Merge at pricing time:** `runSettings()` calls `pricing_run_split(run)` and sets `placeOfServiceSettings = { ...split.settings, ...practice.settings.place_of_service_settings }`. The practice's own setting wins, and every place it has not set takes the specialist-approved default.
- The trace records the merged map (`engine.ts:192`).
- The run records which split.
- With no split approved (null), the practice's own places apply, as today.
- The launch checklist gains "a place-of-service split approved before the first customer run" (O5).

### 4.7 e2e journey (#33), and every practice the tests insert

**The journey.** Extend `apps/web/e2e/onboarding.spec.ts` with a second test: "a practice created with no seeded settings reaches a priced month".
1. In the console, create a practice with ZIP `00011` and no settings document. The status reads "Medicare prices this location in locality 99999-01 under rule release 900001".
2. The invited practice administrator sees "Confirm your billing ZIP" in Getting started, opens Pricing settings and confirms it.
3. Map the 835's payer plan as Medicare Advantage non-contracted on the mapping page (the step `apps/web/e2e/mapping.spec.ts` drives), so the month's lines read the locality. Upload the SYNTHETIC 835 the monitoring spec uses, and run the worker's chain with `apps/web/e2e/worker.ts`.
4. Coverage shows a priced month, with places of service from the split `prepare.ts` approved and no `place_of_service_unmapped`.
5. A second practice is created and mapped the same way, with `00012` (flagged under 900001). It shows "add its ZIP+4". After an upload, the month's run fails `location_not_ready` with no priced lines, and Coverage lists the month under "Months waiting on your billing ZIP". A second worker pass creates no new run.
6. Entering `00012-0001` under 900001 shows the `locality_not_loaded` wording (900001 has no plus-four records), never "check the four digits".
7. The priced ZIP+4 path is proven at the database level under 900006 (§8). The e2e database keeps 900001 as the release in force (`apps/web/e2e/prepare.ts:30,43`); other specs pin 900001 (`apps/web/e2e/pricing.spec.ts:75,106,129`).

**A split before any spec runs.** An approved split applies to every practice, and the e2e runs `fullyParallel` on one database (`apps/web/playwright.config.ts:60`). Today `screening.spec.ts:125-131` approves one in the middle of the run. After PR 6b, which places a run fills would depend on spec order.
- `apps/web/e2e/prepare.ts` approves one SYNTHETIC split before any spec, as a SYNTHETIC contract specialist through `console_approve_place_of_service_split()` (as `screening-world.ts:154` does). Its settings are exactly the ones the screening spec approves (facility 21, 22 and 23; non-facility 11 and 12).
- The screening spec's own approval therefore changes nothing for other specs. It asserts that its approval is in force with those same settings.
- The builder checks every e2e expectation that reads coverage, totals or a place of service against that split, and lists them in the PR body.

**Every direct practice insert gets a location**, or it fails at COMMIT on `practice_has_site`. One helper, `createPracticeWithLocation(client, { id, organizationId, name, dataKeyRef, zip = '00011', zipPlusFour = null, settings })` in `packages/db/src/tenant-world.ts`, inserts the practice and its `practice_site` row in the caller's transaction. Every site below uses it, or adds the row itself where the test wants a specific shape:
- `packages/db/src/tenant-world.ts:98` (the cross-tenant world);
- `packages/db/src/seed.ts:107` (ZIP 27601, as now);
- `packages/db/src/access.db.test.ts:371,404`;
- `packages/db/src/crypto/practice-keys.db.test.ts:49,99` (:99 inserts without a data key; if it expects a refusal, it needs no row);
- `packages/db/src/documents.db.test.ts:45,102`;
- `packages/db/src/hardening.db.test.ts:323`;
- `apps/worker/src/billing/billing.db.test.ts:445,484`;
- `apps/worker/src/platform/support-notices.db.test.ts:81`;
- `apps/web/src/lib/routes/uploads.db.test.ts:79`;
- `apps/web/e2e/journeys.ts:82` (ZIP 27601, as now);
- `apps/web/e2e/uploads.spec.ts:98`;
- `apps/web/src/lib/routes/console.ts:276` (the product path, above).

**Every test that sets `practice.zip` sets the location instead** (an owner UPDATE of `practice.zip` would no longer reach pricing):
- `apps/web/src/lib/routes/test-support/pricing-world.ts:59`;
- `apps/worker/src/price/test-support/pricing-world.ts:137`;
- `apps/web/src/lib/routes/audit-e2e.db.test.ts:149` (AUDIT-01 must keep matching its worksheet line for line: the same ZIP, now on the location);
- `apps/web/src/lib/routes/pricing-routes.db.test.ts:82`;
- `apps/web/src/lib/routes/reruns-routes.db.test.ts:196`;
- `apps/web/src/lib/routes/console-routes.db.test.ts:137,305` (reads);
- `apps/web/e2e/pricing.spec.ts:37,43` (the console "Billing ZIP" field moves to the location form).

**The cross-tenant row factory** (`packages/db/src/row-factory.ts`): the world's practice already holds its one location, so the factory cannot insert a second row for it (`practice_site_one_per_practice`). The factory gains `practice_site` in an existing-row list: it returns the world's own location row for the probes rather than inserting one. Open item O3 confirms that the generated cross-tenant test reads that row from its own world and is refused from the other.

---

## 5. The screening

### 5.1 ZIP+4 input, refusal and the keyed release read

**Today:**
- The form refuses anything but five digits (`apps/web/src/lib/screening/routes.ts:290-292`).
- `submit_screening()` refuses a flagged ZIP (`screening_zip_plus_four`, `free_screening.sql:1070-1076`, via `screening_zip_status()` at :1021-1028).
- The message says a screening "cannot price one yet" (`routes.ts:514-517`).
- `screening_prospect.zip` is five digits (:272).
- The keyed read fetches `locality_map {zip}`:
  - `KEYED_RECORD_TYPES` (`apps/worker/src/price/keyed-release.ts:32,76`) and `screeningRequestedKeys` (:85-94);
  - `operator_screening_run_records()` (`free_screening.sql:1691-1717`);
  - `operator_screening_release()` excludes the keyed types (:1657-1676).
- A lookup outside the fetch fails the run `RELEASE_READ_OUTSIDE_FETCH` (`keyed-release.ts:53-61,111-118`). The job checks that the ZIP's record was fetched (`apps/worker/src/screening/job.ts:215`).
- The labels are pinned to `SCREENING_LABELS_VERSION = 'screening-labels/2026-10-18'` (`apps/web/src/lib/screening/labels.ts:18`). `labels.test.ts:36` pins their SHA-256 to the version, and `screening_labels_version()` (`free_screening.sql:221-225`) must return the same (`routes.db.test.ts:840`).

**Changes:**
- **Schema:**
  - `ALTER TABLE screening_prospect ADD COLUMN zip_plus_four text CONSTRAINT screening_prospect_zip_plus_four CHECK (zip_plus_four ~ '^[0-9]{4}$')`.
  - It is set only when the ZIP has a flagged record in the release in force; otherwise it is null (minimisation).
  - It is deleted with the prospect at 30 days.
  - `screening_lead` and `prospect_request` keep the five-digit ZIP alone (the 12-month summary's list is unchanged, Q5). The replacement rule ("same practice name and ZIP") stays on the five-digit ZIP.
- **`submit_screening(...)`**: DROP the old signature (`free_screening.sql:1047-1050`) and CREATE with `plus_four text` after `zip5` (and, under Q6 (a), the three out-of-span counts after `allowed_cents_left_out`).
  - It is SECURITY DEFINER. `REVOKE ALL ... FROM PUBLIC`; `GRANT EXECUTE ... TO tp_app` on the new signature.
  - Screening is closed in production until release 1 (`screening_status()`, :1015-1019), so the previous image's calls fail closed during the deploy and no prospect can reach them.
  - Status comes from `locality_status(current_rule_release(), zip5, plus_four, NULL, NULL)`:
    - `zip_unknown` → `screening_zip_unknown` (as today);
    - `zip_plus_four_needed` → `screening_zip_plus_four` (same name, new meaning: "enter the ZIP+4");
    - `zip_plus_four_unknown` → new `screening_zip_plus_four_unknown`;
    - `locality_not_loaded` → new `screening_locality_not_loaded`.
  - It stores `plus_four` only when needed. `DROP FUNCTION screening_zip_status(text)`.
- **`operator_screening_claim(uuid)`**: DROP and CREATE, adding `zip_plus_four text` to its RETURNS TABLE (:1629-1650). It is SECURITY DEFINER. `REVOKE ALL ... FROM PUBLIC`; `GRANT EXECUTE ... TO tp_operator`.
- **`operator_screening_release(uuid)`**: CREATE OR REPLACE, also excluding `'locality_map_plus_four'` (ACL kept).
- **`operator_screening_run_records(uuid)`**: CREATE OR REPLACE, adding `UNION ALL SELECT 'locality_map_plus_four', jsonb_build_object('zip', keyed.zip)` (ACL kept).
  - The record is keyed by the five-digit ZIP, so the fetch holds whatever the lookup reads, whether or not a ZIP+4 was given.
- **Worker:**
  - `KEYED_RECORD_TYPES` gains `'locality_map_plus_four'`;
  - `requestedKeys` (:76) gains the type;
  - `screeningRequestedKeys` (:92) adds `locality_map_plus_four: [{ zip }]`;
  - `adapter.ts` and `job.ts:220-227` pass `claimed.zipPlusFour` into the pricing context.
- **The frozen oracle** (ADR 0062:280). `test-support/legacy-adapter.ts` stays byte-identical; `oracle-imports.test.ts:15,36-39` pins it to 3c1b289.
  - `test-support/legacy-release.ts:108` changes one identifier, the split table's new name, so that `legacyOutcomes()` still finds the run's split. Its header gains: "PR 6b: the split table's name at :108 is the only change since 3c1b289; the read path and the adapter are as they were."
  - The oracle proves five-digit runs only. It cannot price a split ZIP, because the frozen pricer takes a five-digit ZIP (`legacy-release.ts:121`). Split-ZIP runs are proved against a whole-release oracle (§8, capacity).
- **Web:**
  - One field accepts five or nine digits (`parseZipCode`), with the hint: "Five digits, or ZIP+4 if you know it. A few ZIP codes span two Medicare payment areas; for those we ask for the ZIP+4."
  - New messages (`routes.ts:512-517`):
    - `screening_zip_plus_four`: "Medicare splits this ZIP code between two payment areas. Enter the full ZIP+4, such as 27601-1234, so the screening uses the right one."
    - `screening_zip_plus_four_unknown`: "Medicare's ZIP+4 list in force does not include this ZIP+4. Check the four digits after the hyphen."
    - `screening_locality_not_loaded`: "PaidWhole has not loaded Medicare's locality list for this ZIP code yet, so a screening cannot price it. Try again later."
  - The parsed rows stay in the browser on a field refusal, as for any field error.
  - Remove the "cannot be screened yet" copy and comments: `apps/web/src/components/screening/upload-form.tsx:24-27`, `routes.ts:54-56`, `apps/worker/src/screening/adapter.ts:79`, `packages/db/src/schema/screening.ts:62`. The header of `20261104090000_free_screening.sql:26-28` stays; the new migration says what changed.
- **Labels** (`apps/web/src/lib/screening/labels.ts:159-160`), under a new version:
  - `locality_needs_zip_plus_four`: "The ZIP spans two Medicare localities and no ZIP+4 was given";
  - add `zip_plus_four_not_in_locality_map`: "Medicare's ZIP+4 list has no locality for this ZIP+4 on the quarter's first day";
  - `SCREENING_LABELS_VERSION` becomes `'screening-labels/2026-11-05'` (the migration's date; the builder uses the merge date). `labels.test.ts`'s `VERSIONS` keeps the old entry and gains the new hash. The migration does `CREATE OR REPLACE FUNCTION screening_labels_version()` returning the new version (ACL kept).

### 5.2 Leaving out quarters outside the loaded content (#7, the screening only; Q6 (a))

**How rows carry dates today:**
- Each row has a calendar-quarter band, `service_band` matching `^20[0-9]{2}-Q[1-4]$` (`free_screening.sql:471`).
- It is parsed by `bandOf()` and refused as `band_holds_date` or `band_in_future` (`apps/worker/src/screening/format.ts:625-633` in the browser, :876-878 on the server).
- The engine prices it at the band's first day (`adapter.ts:191`).
- A row is withheld as `rates_change_in_band` when a record its trace names does not cover the whole quarter, or a release day inside the quarter changes the price (`adapter.ts:260-290,357-367`).
- MUE and MPPR records read as absent leave no record in the trace, so a quarter outside their loaded span prices silently without the limits (audit #7).
- The floor's left-out rows are counted by the browser and stored as three sums (`free_screening.sql:320-327,336-338`).

**Shared span (SQL, for the Release-operations PR to reuse):**
```sql
-- The dates each silently read content is loaded for in a release (audit #7): the union of its records' windows.
-- A content with no record in the release has an empty span ('{}'), never the infinite one.
CREATE FUNCTION rule_release_content_span(release integer)
RETURNS TABLE (content text, loaded datemultirange)   -- content IN ('mppr_code', 'mppr_general', 'ncci_mue')
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT c.content,
         coalesce(range_agg(daterange(r.effective_from, r.effective_to, '[]')) FILTER (WHERE r.id IS NOT NULL), '{}'::datemultirange)
    FROM (VALUES ('mppr_code'), ('mppr_general'), ('ncci_mue')) c (content)
    LEFT JOIN rule_record r ON r.release_no = $1
     AND ((c.content = 'mppr_code' AND r.record_type = 'mppr_rate' AND r.key ? 'hcpcs')
       OR (c.content = 'mppr_general' AND r.record_type = 'mppr_rate' AND r.key ? 'component')
       OR (c.content = 'ncci_mue' AND r.record_type = 'ncci_mue'))
   GROUP BY c.content
$$;
CREATE FUNCTION screening_band_days(band text) RETURNS daterange  -- '2026-Q2' → [2026-04-01, 2026-07-01); IMMUTABLE
```
- **The FILTER is required.** Without it, the LEFT JOIN's one row of nulls for a content with no records aggregates to `daterange(NULL, NULL, '[]')`, which is `(,)`, so every quarter would count as loaded. This was measured on PostgreSQL 18.4 in a scratch database (dropped afterwards): with no matching rows the unfiltered form gives `{(,)}` and the filtered form gives `{}`.
- A null `effective_to` is an open window and correctly loaded onward.
- MUE stands in for the NCCI quarter (#7). Same-code pairs are sparse, so their absence cannot be dated.
- **Grants:**
  - `rule_release_content_span`: STABLE INVOKER; `REVOKE ALL ... FROM PUBLIC`; `GRANT EXECUTE ... TO tp_app` (the web reads the spans, and `tp_app` reads `rule_record`). It has no `tp_operator` grant: that role cannot read `rule_record`, and nothing it runs needs the span.
  - `screening_band_days`: `REVOKE ALL ... FROM PUBLIC` and no grant. Only `submit_screening()` calls it, as the owner.
- `range_agg` with FILTER works on PostgreSQL 14 and later, so in both of the repo's clusters (16 and 18).

**The rule:** a row whose product the screening prices (`medicare_ffs`, `ma_noncontracted`; `SCREENING_PRICED_PRODUCTS`, `format.ts:32`) is outside the content when `screening_band_days(band)` is not contained in every content's `loaded` span. Other products' rows are untouched (they are never priced).

**Three layers:**
- **Browser** (`format.ts`, the shared code):
  - It takes `contentQuarters: readonly { from: string; to: string }[]`: the quarters wholly inside all three spans, computed once per release in `apps/web/src/lib/screening/content-span.ts` (new) and cached by release number and manifest, since a published release never changes.
  - After the floor's check, it leaves out each Medicare row outside the content quarters and counts its rows, claim lines and allowed cents. A row the floor leaves out is counted there only.
  - The upload page says, before sending: "12 rows (380 claim lines, $41,200.00) in quarters before 2026-Q1 were left out: PaidWhole has the Medicare content for 2026-Q1 to 2026-Q4 loaded." Several loaded runs are listed: "2025-Q1 to 2025-Q4 and 2026-Q2 to 2026-Q4". (Counsel confirms the wording, §11.)
- **Server** (`routes.ts` beside :208, the same `format.ts` code): a request that still holds such a row is refused with the reason `{ code: 'band_outside_content', row, field: 'service_band' }`. This is the bypass refusal, as for the floor.
- **Database:**
  - `submit_screening()` computes the spans once and raises `CONSTRAINT = 'screening_band_outside_content'` for any such row. No value is in the error.
  - It stores the three counts it is given on the upload.
  - `screening_rejection_valid()` (:112) and `screening_refusal_codes_valid()` (:210, "at most the 13" becomes 14) are CREATE OR REPLACE with `band_outside_content` added (ACL kept).
  - The web's refusal list and `SCREENING_REJECTION_CODES` (`format.ts:60-74`, with its keep-order table at `format.ts:375-385`) gain it, after `band_in_future`.
  - A refused upload stores the code, row and field, never the quarter, as for every reason.
- **Schema** (Q6 (a)), on `screening_upload` beside the floor's sums:
  ```sql
  ALTER TABLE screening_upload
    ADD COLUMN outside_content_rows integer NOT NULL DEFAULT 0 CONSTRAINT screening_upload_outside_content_rows CHECK (outside_content_rows BETWEEN 0 AND 50000),
    ADD COLUMN outside_content_claim_lines bigint NOT NULL DEFAULT 0,
    ADD COLUMN outside_content_allowed_cents bigint NOT NULL DEFAULT 0,
    -- Each row left out sums at least 11 claim lines (the floor runs first), at most $25,000.00 a claim line; a rejected upload leaves nothing out.
    ADD CONSTRAINT screening_upload_outside_content_claim_lines CHECK (outside_content_claim_lines >= 11::bigint * outside_content_rows AND (outside_content_rows > 0 OR outside_content_claim_lines = 0)),
    ADD CONSTRAINT screening_upload_outside_content_allowed CHECK (outside_content_allowed_cents BETWEEN 0 AND 2500000::bigint * outside_content_claim_lines),
    ADD CONSTRAINT screening_upload_outside_content_accepted CHECK (status = 'accepted' OR outside_content_rows = 0),
    DROP CONSTRAINT screening_upload_accepted_rows,
    ADD CONSTRAINT screening_upload_accepted_rows CHECK (status <> 'accepted' OR (row_count BETWEEN 1 AND 50000 AND row_count + left_out_rows + outside_content_rows <= 50000));
  ```
  - `screening_upload_fixed` (`free_screening.sql:569`, `reject_change()` on every UPDATE) already covers the new columns.
  - The counts go with the upload at 30 days. They are never copied to `screening_lead` or `screening_outcome`, whose lists are ruled (decisions 7 and 12).
- **Result page:** "12 rows ($41,200.00) in quarters before 2026-Q1 were not screened: PaidWhole has not loaded the Medicare content for them." This wording is a label, so it falls under the new labels version (§5.1).

The Release-operations PR does the rest of #7: runs waiting on content, Coverage wording, triage holds and the README fix.

---

## 6. Schema change: yes (one migration; the founder's SHA-256 approval required)

`packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql`, with this header:

> Safe with the previous image running, except during the deploy window:
> 1. practice creation in the console (the old image writes `practice.zip`, now revoked, and inserts no location);
> 2. the split's console approval (functions renamed);
> 3. the screening's submission (signature changed; closed in production until release 1);
> 4. a run created by one image and priced by the other fails `engine_version_mismatch` (`apps/worker/src/price/execute.ts:170-172`). A person creates a new run; a monitored month is planned again, since a failed run covers nothing (`plan.ts:89`);
> 5. the old image's strict trace schema (`packages/pricing/src/trace.ts:57-62,124-125`) refuses a trace carrying `zip_plus_four` or `plus_four`. Only a practice that saves a ZIP+4 during the window produces one;
> 6. the old image's price jobs read `practice.zip`, which keeps its backfilled value, so a location saved through the new image is not seen by them.

Every function this migration creates (as opposed to replaces) is followed by `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and exactly the grant listed. CREATE OR REPLACE keeps a function's ACL.

| # | Change | Exact |
|---|---|---|
| 1 | `rule_record` type CHECK (Q2 (a)) | drop `rule_record_record_type_check`; re-add with the 16 values of `rule_content.sql:19-23` plus `'locality_map_plus_four'` |
| 2 | `practice_site` | §4.2: table, `practice_site_zip`, `practice_site_zip_plus_four`, unique `practice_site_one_per_practice`, RLS forced, `practice_site_tenant`, `practice_site_owner`, `phi_table_registry` row, `REVOKE ALL ... FROM PUBLIC`, `GRANT SELECT ... TO tp_app`, `practice_site_rules()` with its trigger, `practice_site_no_truncate`, `practice_site_required()` and the constraint trigger `practice_has_site` (both trigger functions revoked from PUBLIC, no grant), backfill |
| 3 | `practice.zip` | comment; `REVOKE INSERT (zip), UPDATE (zip) ON practice FROM tp_app` |
| 4 | `role_permission` (Q3 (a)) | the four rows of §4.4 for `pricing_settings.set` |
| 5 | location functions | new: `locality_status()` (INVOKER), `practice_location_status()` (INVOKER), `practice_set_location()` (DEFINER), `console_set_practice_location()` (DEFINER), each granted to `tp_app` only; CREATE OR REPLACE: `console_practice_settings()`, `console_set_practice_settings()` |
| 6 | split rename and readers | §4.6: table, constraint, index, triggers, policy, `place_of_service_split_valid`; DROP `screening_split_in_force()`, `console_screening_splits()`, `console_approve_screening_split(jsonb)`; new `place_of_service_split_in_force()` (DEFINER) and `pricing_run_split(uuid)` (DEFINER), both granted to `tp_app`; new `console_place_of_service_splits()` and `console_approve_place_of_service_split(jsonb)` (DEFINER, `tp_app`); CREATE OR REPLACE `screening_status()` |
| 7 | `pricing_run` | `place_of_service_split_id uuid REFERENCES place_of_service_split (id)`; `pricing_run_rules()` replaced (still INVOKER): split pin (`pricing_run_split_pinned`), missing-location guard (`pricing_run_location_missing`), the column fixed on UPDATE |
| 8 | screening | `screening_prospect.zip_plus_four` + `screening_prospect_zip_plus_four`; Q6 (a)'s three `screening_upload` columns and four constraints (§5.2); DROP old `submit_screening(...)` and CREATE the new one (DEFINER, `tp_app`; new refusals `screening_zip_plus_four_unknown`, `screening_locality_not_loaded`, `screening_band_outside_content`); DROP and CREATE `operator_screening_claim(uuid)` (DEFINER, `tp_operator`); CREATE OR REPLACE `operator_screening_release`, `operator_screening_run_records`, `screening_rejection_valid`, `screening_refusal_codes_valid`, `screening_labels_version` (returns `'screening-labels/2026-11-05'`); `DROP FUNCTION screening_zip_status(text)` |
| 9 | content span | `rule_release_content_span(integer)` (INVOKER, `tp_app`), `screening_band_days(text)` (no grant) |

**Catalog lists:**
- `REVIEWED_SCOPE_FUNCTIONS` gains `console_set_practice_location(uuid,text,text)` (`packages/db/src/catalog.ts:136`).
- No entry in `REVIEWED_PLATFORM_POLICIES`: there is no new permissive non-owner policy (the split stays owner-only; `tp_app` reaches it only through the two definers).
- `NULLABLE_PRACTICE_ID_TABLES` is unchanged.

**Drizzle:**
- `packages/db/src/schema/tenancy.ts`: `practiceSite`; `practice.zip` marked deprecated.
- `screening.ts`: the table renamed (:122,131), `zipPlusFour`, the three `outsideContent*` columns.
- `pricing.ts`: `placeOfServiceSplitId`.

**Domain model:**
- `pnpm db:domain-model` regenerates `docs/product/domain-model.md`.
- `packages/db/domain-model/areas.json`: `practice_site` joins the tenancy area; `screening_place_of_service_split` becomes `place_of_service_split` at :144.
- `divergence-explanations.json:204`: the split's entry.
- `docs/product/data-dictionary.md:12`: `practice_site`, with `practice.zip` deprecated.
- The founder approves the new SHA-256 once, with Q1-Q6 answered first, so the schema is final. The PR template's "Domain model" section carries `--summary-since <base>`.

---

## 7. Files to change

**Engine (the freeze exception):**
- `packages/pricing/src/{engine,reasons,recompute,trace,types}.ts` (§3.4).

**Rules:**
- `packages/rules/src/{schema,testing}.ts`;
- `parsers/{types,index}.ts`, `parsers/locality-plus-four.ts` (new);
- the record builder that turns `ParsedRow.quote` into `quotes`;
- the CLI importer's type list;
- `tools/release/assemble.ts` (the ZIP9 completeness check);
- `tools/release/synthetic.ts` (900006);
- `fixtures/synthetic/cms/{GPCI_SYNTHETIC_900006.csv, ZIP9_SYNTHETIC.txt}`;
- `fixtures/synthetic/rules/release-synth-900006/**` (generated);
- `fixtures/synthetic/cms/README.md`.

**Golden (Q4 (a)):**
- `fixtures/golden/claims/G196-G199` (+ `.worksheet.md`);
- `fixtures/golden/QUESTIONS.md` (Q37, :226-229);
- `fixtures/golden/README.md` (:31-35 the count, :260);
- `tools/golden-worksheet/golden_worksheet.py`:
  - optional `zip_plus_four` in `practice_settings` (:254-257). The format stays `tp-golden-claim/3`, and the 150 existing claim files stay byte-identical;
  - the ZIP9 range step, written independently, at :840-849;
- `tools/golden-worksheet/test_golden_worksheet.py`;
- `tools/golden-worksheet/engine.golden.test.ts` and `worksheet.golden.test.ts` (read the new key).

**Freeze tooling:**
- `tools/engine-freeze/{exception.json, check.ts, check.test.ts, differential.test.ts}`;
- `.github/workflows/ci.yml` (one step, and `ENGINE_FREEZE_BASE` for the unit job);
- `.gitignore` (`packages/pricing/.freeze-base/`);
- `vitest.config.ts:7` and `eslint.config.js:97` (`**/.freeze-base/**`);
- `.github/CODEOWNERS`.

**Database:**
- the migration;
- `packages/db/src/schema/{tenancy,screening,pricing}.ts`;
- `packages/db/src/authz/permissions.ts`;
- `packages/db/src/catalog.ts`;
- `packages/db/src/row-factory.ts` (the existing-row list, §4.7);
- `packages/db/src/tenant-world.ts` (`createPracticeWithLocation`, and the world's location);
- `packages/db/src/seed.ts`;
- the domain-model files (§6).

**Every caller of a renamed or dropped database object:**
- `apps/web/src/lib/screening/routes.ts:1053` (`console_screening_splits`), :1083 (`console_approve_screening_split`), :1085 (constraint `screening_place_of_service_split_settings` → `place_of_service_split_settings`); :1070 keeps its audit names;
- `apps/web/src/lib/screening/test-support/screening-world.ts:154`;
- `apps/worker/src/screening/release-cache.db.test.ts:247`;
- `apps/worker/src/screening/screening.db.test.ts:220`;
- `apps/worker/src/screening/test-support/legacy-release.ts:108` (the table name; header line, §5.1);
- `tools/screening-capacity/run.ts:208`;
- `packages/db/src/screening.db.test.ts:31,201,301,486,495-496,525,544-546,564,996-1010` (table list, approvals, the privilege lists, the dropped `screening_zip_status` tests replaced by `locality_status` tests, `screening_split_in_force()`);
- `packages/db/src/migrate.db.test.ts:168`;
- `packages/db/src/schema/screening.ts:122,131`;
- `apps/web/e2e/screening.spec.ts:126-127` (the console heading and nav label); :137 keeps its audit names.

**Every direct practice insert and every `practice.zip` writer or reader** (§4.7, 16 insert sites in 12 files and 7 ZIP sites):
- `packages/db/src/{tenant-world,seed}.ts`, `packages/db/src/{access,documents,hardening}.db.test.ts`, `packages/db/src/crypto/practice-keys.db.test.ts`;
- `apps/worker/src/billing/billing.db.test.ts`, `apps/worker/src/platform/support-notices.db.test.ts`, `apps/worker/src/price/test-support/pricing-world.ts`;
- `apps/web/src/lib/routes/{uploads,audit-e2e,pricing-routes,reruns-routes,console-routes}.db.test.ts`, `apps/web/src/lib/routes/test-support/pricing-world.ts`;
- `apps/web/e2e/{journeys.ts, uploads.spec.ts, pricing.spec.ts}`.

**Contracts:**
- `packages/contracts/src/location.ts` (new: `LOCATION_STATUSES`, wording);
- `index.ts` export.

**Worker:**
- `apps/worker/src/price/{settings,create,execute,impact,causes,diff,keyed-release}.ts`;
- `apps/worker/src/monitor/{plan,job}.ts`;
- `apps/worker/src/jobs/registry.ts`;
- `apps/worker/src/screening/{adapter,job,format}.ts`.

**Web:**
- `apps/web/src/lib/zip.ts` (new);
- `apps/web/src/lib/routes/{settings,console,practice}.ts`;
- `apps/web/src/lib/console/practice-settings.ts` (:48);
- `apps/web/src/lib/screening/{routes,labels,messages,content-span (new)}.ts`; `retention.ts` only if Q5 is answered (b);
- `apps/web/src/components/settings/nav.tsx`;
- `apps/web/src/components/screening/upload-form.tsx`;
- `apps/web/src/components/pricing/display.tsx:33` (`location_not_ready` text);
- `apps/web/src/app/p/[practiceId]/settings/pricing/{page,actions}.tsx` (new);
- `apps/web/src/app/p/[practiceId]/settings/page.tsx` (the step label);
- `apps/web/src/app/p/[practiceId]/coverage/page.tsx` (the waiting card);
- `apps/web/src/app/p/[practiceId]/page.tsx:420` (the location's ZIP+4);
- `apps/web/src/app/console/organizations/[organizationId]/page.tsx:105` (the required ZIP field);
- `apps/web/src/app/console/practices/[practiceId]/page.tsx` (the location form);
- the console split page (heading, label and warning, §4.6);
- the re-run diff cause labels;
- the screening result page's out-of-span sentence.

**e2e:**
- `apps/web/e2e/{prepare.ts, onboarding.spec.ts, screening.spec.ts, screening.ts, journeys.ts, uploads.spec.ts, pricing.spec.ts}`.

**Capacity:**
- `packages/synth/src/release/scale.ts` gains a ZIP9 file for its 3% split ZIPs (:35, :61, :180, :406, :436);
- `tools/screening-capacity/{uploads,run,oracle}.ts` (one split-ZIP upload, and the whole-release oracle, §8);
- `apps/web/src/lib/screening/screening.large.db.test.ts:22-45` (Medicare rows inside 900001's span, §8).

**Synth and docs:**
- `packages/synth/src/cases/{registry,pricing}.ts` (`pricing.prc21`);
- ADRs (§10);
- `docs/product/test-matrix.md`.

---

## 8. Tests that prove each rule

**Unit, engine** (`packages/pricing/src/engine.test.ts`, under 900006 records from `@tp/rules` testing):
- (a) 00012 + 5000 prices with GPCI 99999-02. The trace's `locality.plus_four` names the record, 5000 and 5000-8999, and the top-level `carrier` and `locality` stay the ZIP5 record's.
- (b) 00012 + 0001 prices equal to 00011's amount (same locality 01).
- (c) 00012 with no ZIP+4 stays `ENGINE_ERROR locality_needs_zip_plus_four`; the existing test at :261 is unchanged.
- (d) 00012 + 9100 (the gap) is `ENGINE_ERROR zip_plus_four_not_in_locality_map`.
- (e) 00012 + 0001 under 900001 (no plus-four record) is the same detail.
- (f) 00011 + 1234 has the same amount as 00011. The trace differs only by `settings.zip_plus_four` and has no `plus_four`.
- (g) ZIP+4 `'12a4'`, `'123'` and `''` are `invalid_settings`.
- (h) LOCKED:2025 basis: the plus-four record is read in force on the service date.
- (i) A fixed-schedule line with ZIP 00012 and no ZIP+4 prices (the locality is never read).

**Unit, recompute** (`recompute.test.ts`):
- recompute holds for (a), (b) and (f);
- each tampering fails by its check name:
  - ZIP+4 differs from settings;
  - outside the range;
  - record key ZIP differs;
  - GPCI key differs from `plus_four`'s;
  - window does not cover the date;
  - `plus_four` removed from a priced flagged trace;
- PRC-16 over the new golden lines.

**Unit, property** (`properties.test.ts`): for any generated claim and any settings whose ZIP is unflagged, pricing with no ZIP+4 equals pricing with any four digits (amounts, reasons and adjustments). Traces differ only by `settings.zip_plus_four`.

**Freeze** (`tools/engine-freeze/`, §3.8):
- `differential.test.ts`: base equals head on 150 golden claims (326 lines) and 20,000 generated five-digit claims; it fails under `CI` without `ENGINE_FREEZE_BASE`.
- `check.test.ts`: each case of §3.8.

**Trace schema:** `parseTrace` accepts a stored phase-two/1 trace fixture (no new keys) and a new one, and refuses an unknown key.

**Rules:**
- `parsers.test.ts`: the ZIP9 parser's grouping and compression, each refusal, quotes being the first and last line of a range, the notes.
- `schema.test.ts`: sorted, non-overlapping ranges and four-digit bounds.
- `tools/release` assembly refuses ZIP5-without-ZIP9.
- The 900006 render equals the committed files; 900001-900005 render unchanged.
- `tools/verify-content/check.test.ts` passes unchanged, and a SYNTHETIC `locality_map_plus_four` record quoting two lines of one file verifies.

**Golden (Q4 (a)):** G196 (00012-0001, locality 01), G197 (00012-5000, locality 02, different amount), G198 (00011-1234, the ZIP+4 ignored) and G199 (00012-8999, the range's last code) under 900006. Each is priced by the engine and by the Python oracle, which match, and recompute holds.

**Database:**
- **`packages/db/src/location.db.test.ts`** (new):
  - `practice_set_location` is refused for viewer, analyst and reviewer, out of scope, and for an internal actor. It is refused for a malformed ZIP or ZIP+4 with the handler bypassed (constraint names);
  - it succeeds for practice_admin, for billing_manager by ownership, for billing_manager under a firm grant and for firm_principal, and returns each status;
  - every `locality_status` value under 900006 and 900001, including:
    - `zip_unknown` for 00099;
    - `locality_not_loaded` for 00011 with a 2025 period (the ZIP known, no window);
    - `locality_not_loaded` for 00012-0001 under 900001 (no plus-four record);
    - `zip_plus_four_unknown` for 00012-9100 under 900006;
  - a practice inserted without a location fails at COMMIT (`practice_has_site`);
  - the location row refuses DELETE, TRUNCATE and a `practice_id` change;
  - `tp_app` cannot INSERT or UPDATE `practice_site` or write `practice.zip`;
  - **as `tp_app`** (finding 1): a person's `pricing_run` insert and a job's insert both succeed and pin `place_of_service_split_in_force()`; another split id is refused (`pricing_run_split_pinned`); the column is fixed after insert;
  - `pricing_run_split(run)` returns the pinned settings to the run's own practice scope and no row to another practice's scope;
  - a `pricing_run` insert for a practice with no location is refused (`pricing_run_location_missing`), re-runs included; an insert for `zip_plus_four_needed` is allowed;
  - **privileges by exact name**: for `locality_status`, `practice_location_status`, `practice_set_location`, `console_set_practice_location`, `place_of_service_split_in_force`, `pricing_run_split`, `console_place_of_service_splits`, `console_approve_place_of_service_split`, `rule_release_content_span`, `place_of_service_split_valid`, `practice_site_rules`, `practice_site_required` and `screening_band_days`: the definer flag, no PUBLIC EXECUTE, and exactly the grants of §6.
- **`migrate.db.test.ts` / catalog:**
  - `practice_site` registered and forced;
  - `console_set_practice_location` reviewed;
  - the renamed split objects;
  - the record-type CHECK holding all 17 values;
  - `role_permission` equal to `matrixRows()` (`identity.db.test.ts:80`).
- **`screening.db.test.ts`:**
  - `submit_screening` with a needed ZIP+4 stores it; with an unneeded one, it stores null;
  - a flagged ZIP without one gives `screening_zip_plus_four`, an unlisted one `screening_zip_plus_four_unknown`, and 00012-0001 under 900001 `screening_locality_not_loaded`;
  - a Medicare row outside the span gives `screening_band_outside_content`, while a commercial row in the same quarter is accepted;
  - the three out-of-span counts are stored and checked: rows without claim lines are refused, as are counts on a rejected upload, and more than 50,000 rows with the floor's;
  - `operator_screening_run_records` returns the plus-four record;
  - the refusal-code lists accept the new codes;
  - the privilege test (:473-528) loses `screening_zip_status`, `console_screening_splits` and `console_approve_screening_split`. The renamed functions are tested by name in `location.db.test.ts`.
- **`rule_release_content_span`** (in `screening.db.test.ts`), on test-built SYNTHETIC releases loaded into the test database and never committed as fixtures:
  - 900001's spans are 2026 for MUE and per-code MPPR, and 2026 onward for the general rate;
  - a release with **no `ncci_mue` records at all** gives `ncci_mue` an empty span, so a 2026-Q2 Medicare row is refused;
  - a release whose MUE window ends 2026-09-30 refuses 2026-Q4 and accepts 2026-Q3;
  - a release with no per-code MPPR refuses every Medicare quarter.

**Worker:**
- `settings.test.ts`: the merge; the practice wins; null split.
- `price.db.test.ts` / `execute`, **as the worker's `tp_app` login**:
  - the run prices with split defaults read through `pricing_run_split` and records the split;
  - a percent-of-Medicare month with 00012 and no ZIP+4 fails `location_not_ready` with **no priced lines kept**, and does not page;
  - a fixed-schedule month with 00012 and no ZIP+4 prices complete;
  - a ready location with a content gap keeps `ENGINE_ERROR no_locality` as today.
- `monitor.db.test.ts`:
  - a `zip_missing` month gets no run and is listed with its status;
  - a `location_not_ready` month is not re-created by the next daily plan;
  - the `request_id` monitor plans it after a save with no hand re-run, as does a new release in force;
  - an active daily key does not swallow the save.
- `causes.test.ts`:
  - `settings.fields`;
  - after a ZIP+4 change, the one-sided GPCI is not a release cause;
  - **a rounding change together with a release-added MUE record still lists the MUE record**;
  - a ZIP change together with a release-added MPPR record still lists the MPPR record.
- `keyed-release.test.ts`: the new type keyed; a lookup outside sets the violation.
- `adapter.test.ts`: a split ZIP+4 prices at locality 02 and equals whole-release pricing under 900006.
- `format.test.ts`:
  - the browser leaves out-of-span Medicare rows out and counts them, after the floor;
  - the server path refuses `band_outside_content`;
  - other products' rows are untouched;
  - the dated message lists several loaded runs.
- `registry.test.ts`: the new monitor payload and subject.
- `release-cache.db.test.ts`: the frozen oracle's equality still holds on its test-local release after the one-identifier change.

**Web routes:**
- `settings-routes.db.test.ts`:
  - the page and both actions; Zod refusals; 403 for viewer and analyst;
  - the audit events;
  - the monitor enqueued with the request id;
  - the Getting started step's done rule, including `locality_not_loaded`.
- `console-routes.db.test.ts`: create requires a ZIP; a flagged ZIP is accepted with its status; the location form.
- Screening `routes.db.test.ts`:
  - `27601-1234` and `276011234` are accepted;
  - the messages;
  - the out-of-span sentence on the result page;
  - the labels version equals `screening_labels_version()` (:840);
  - :208's floor row (2025-Q3, one claim line) keeps its floor treatment and stores no band.
- `labels.test.ts`: every engine detail labelled; the new version's hash.
- `screening.large.db.test.ts` (:22-45): Medicare rows take the four 2026 quarters with units 1-12; other products keep all eight quarters with units 1-6. That is 9,216 Medicare rows per product, as before (8 × 12 × 8 × 2 × 6 = 4 × 12 × 8 × 2 × 12), so the test still sends 50,000 distinct rows, all inside 900001's span, and asserts nothing left out.

**e2e:**
- `onboarding.spec.ts` (§4.7);
- `screening.spec.ts`:
  - 00012 without a ZIP+4 shows the "enter the ZIP+4" message;
  - 00012-0001 under 900001 shows the not-loaded message;
  - a file with a 2025 Medicare row shows the dated left-out message, and the result says so;
  - the split it approves equals the one `prepare.ts` approved.

**Capacity** (`tools/screening-capacity`):
- The scale release gains its ZIP9 file, counted in the report. The builder confirms that its MUE and per-code MPPR windows cover all eight upload quarters, 2025-2026 (`scale.ts:53,84`), with a `scale.test.ts` assertion, so no capacity row is left out.
- **Five-digit uploads** (S1-1, S2-1, S3-1, as today): stored rows equal the frozen oracle's by SHA-256 (`oracle.ts:30`, `legacyOutcomes`).
- **One split-ZIP upload** (S1-2, given a split ZIP and its ZIP+4 in `uploads.ts:99-103`) is compared with a new `wholeReleaseOutcomes(runId)` in `oracle.ts`. It reads the run's release whole through the frozen read SQL, indexes it, and prices with the current `ScreeningPricer` (no `read`, which the context allows, `adapter.ts:84`) given the stored ZIP and ZIP+4.
  - The run records no `RELEASE_READ_OUTSIDE_FETCH`, and every stored row equals that oracle's.
  - This proves the keyed read is complete for a split ZIP. The engine's ZIP+4 arithmetic is proved by the unit and golden tests.
- Memory stays under the limits.

---

## 9. Test matrix rows (`docs/product/test-matrix.md`; `packages/synth/src/cases/registry.ts`)

| ID | Case | Expected | Registry |
|---|---|---|---|
| PRC-21 | A ZIP whose locality needs its ZIP+4 | With the ZIP+4, priced at the ZIP+4 file's range's locality, with the range in the trace and `recompute(trace)` holding. Without it, `ENGINE_ERROR locality_needs_zip_plus_four`. A ZIP+4 no range lists is `ENGINE_ERROR zip_plus_four_not_in_locality_map`. Never a guessed locality | `{ completesIn: 6, build: pricing.prc21 /* 900006, G196-G199 */, assertedBy: [engine.test.ts, recompute.test.ts, engine.golden.test.ts, location.db.test.ts] }` |
| PRC-22 | The engine freeze outside the ZIP+4 lookup | The base and head engines give equal results on every golden claim and on generated five-digit claims. The diff under `packages/pricing/src` holds only the exception's files, and no existing golden file changes | `none(6, 'A differential test over generated claims and the golden lines; no fixture.', ['tools/engine-freeze/differential.test.ts', 'tools/engine-freeze/check.test.ts'])` |
| PRC-23 | A month whose pricing location is not ready | With no ZIP, no run is created (refused in the worker and in Postgres). When a line needs a ZIP+4 or a ZIP Medicare's list holds, the run fails with no lines kept, and the month is not re-created daily. A fixed-fee month prices. Coverage and Pricing settings name the month as waiting on the billing ZIP, with its dollars. Saving the location prices it with no hand re-run | `none(6, 'Practices and their locations are set by the tests; the 835 is the monitoring fixture.', ['apps/worker/src/monitor/monitor.db.test.ts', 'apps/worker/src/price/price.db.test.ts', 'packages/db/src/location.db.test.ts', 'apps/web/src/lib/routes/settings-routes.db.test.ts', 'apps/web/e2e/onboarding.spec.ts'])` |
| PRC-24 | A place of service the practice has not set | Priced with the approved split's setting, read as `tp_app`. The run records the split, and the practice's own setting wins | `none(6, 'A setting; any Medicare line will do.', ['apps/worker/src/price/settings.test.ts', 'apps/worker/src/price/price.db.test.ts', 'packages/db/src/location.db.test.ts', 'apps/web/e2e/onboarding.spec.ts'])` |
| SCR-15 | A screening of a ZIP split across localities | The ZIP+4 is asked for, and kept only when needed and only for 30 days. Rows are priced at its locality, and the keyed read holds the plus-four record | `none(6, 'The prospect's ZIP+4 is set by the tests under release 900006.', ['packages/db/src/screening.db.test.ts', 'apps/worker/src/screening/adapter.test.ts', 'apps/web/src/lib/screening/routes.db.test.ts', 'apps/web/e2e/screening.spec.ts', 'tools/screening-capacity/oracle.ts'])` |
| SCR-16 | A Medicare screening row in a quarter outside the loaded content | Left out in the browser and counted, with the loaded quarters named, and the result says so. A bypassing request is refused on the server and in the database. Other products' rows are untouched, and a content with no records at all has an empty span | `none(6, 'A row with an earlier quarter; no file.', ['apps/worker/src/screening/format.test.ts', 'packages/db/src/screening.db.test.ts', 'apps/web/src/lib/screening/routes.db.test.ts', 'apps/web/e2e/screening.spec.ts'])` |

(`none(...)` and `completesIn` follow `registry.ts:115-117`. A matrix row's prose follows the rows at `test-matrix.md:87` and `:156-169`.)

---

## 10. ADRs and documents amended

**New ADR 0064**, "Price at the practice's location: resolve ZIP+4 localities from the plus-four file, keep the location on its own record and hold months until it is ready". It records:
- decisions 1-11;
- the founder's answers to Q1-Q6;
- the freeze exception's exact scope and the CI proof (§3.8);
- the split's rename, with its audit names kept;
- the deploy-window effects (§6);
- Revisit when:
  - the specialist answers Q37 or the ZIP9 layout differs from the one recorded;
  - the multi-site PR lands;
  - release 1's ZIP9 content loads;
  - the Release-operations PR adds "waiting on content" (the `locality_not_loaded` lines).

**ADR 0062:**
1. Status: "accepted; amended by 0064 (ZIP+4 localities and quarters outside the loaded content, PR 6b)".
2. Decision, engine paragraph (:26-31):
   - "takes a five-digit ZIP (`PracticeSettings.zip`, `^\d{5}$`), stops with `ENGINE_ERROR locality_needs_zip_plus_four` for a ZIP whose `locality_map` record needs its ZIP+4" becomes "takes a five-digit ZIP and, where that ZIP's `locality_map` record needs it, the ZIP+4 (`PracticeSettings.zipPlusFour`), whose `locality_map_plus_four` range names the locality (ADR 0064)".
   - "Nothing under `packages/pricing/src` may change." becomes "Nothing under `packages/pricing/src` changes but PR 6b's ZIP+4 lookup, by the founder's ruling of 2026-10-18 11:47 UTC (ADR 0064)."
3. `screening_prospect` bullet (:45-51): replace "No ZIP+4: ... (see Owner rulings)." with "The ZIP+4 is asked for only when the ZIP's `locality_map` record needs it, and is kept only then (`zip_plus_four`, deleted with the prospect at 30 days). A ZIP that needs one and lacks it is refused as `screening_zip_plus_four` ('enter the ZIP+4'), one the ZIP+4 file does not list as `screening_zip_plus_four_unknown`, and one whose ZIP+4 list is not loaded as `screening_locality_not_loaded` (PR 6b, ADR 0064)."
4. The split bullet (:62-65): "`place_of_service_split` since PR 6b (ADR 0064): also the default for every place a practice has not set, pinned on each pricing run".
5. The release read (:95, :113) and the keyed types (:262): add `locality_map_plus_four` beside `locality_map`, keyed by the run's ZIP.
6. The oracle (:280): append "*PR 6b changed one identifier in `legacy-release.ts`, the split table's name; the read path and the adapter are otherwise as at 3c1b289. Split-ZIP runs are proved against a whole-release oracle (ADR 0064).*"
7. Alternatives row (:492): append "*Built in PR 6b (ADR 0064).*"
8. Consequences (:533-537): replace the bullet with "A ZIP whose locality needs its ZIP+4 is priced from it; D20's 'ZIP+4 asked only where `locality_map` requires it' is met (PR 6b)". Add "A Medicare row in a quarter outside the release's loaded MPPR and MUE content is left out and counted, with the loaded quarters named (audit #7, PR 6b)".
9. Owner ruling 3 (:638-643): after the supersession sentence, add "*Built in PR 6b (ADR 0064):* the engine resolves the locality from the ZIP+4 file; practice settings and the screening take a ZIP+4; five-digit ZIPs and the golden lines are unchanged, proved by a differential test against the base engine."
10. "What stays open" (:665-667): delete "ZIP+4 localities, in PR 6b before launch;".
11. Revisit when (:820): replace "PR 6b lands (ZIP+4 localities: the refusal here is replaced);" with "the specialist answers Q37 (a ZIP+4 the ZIP+4 file does not list);".
12. New closing section "## Amendment (PR 6b)": three sentences pointing to ADR 0064 for the ZIP+4, the out-of-span rows and the split's rename to `place_of_service_split`.

**ADR 0033** (the engine's locality rule):
- Status: "amended by 0064".
- :58, after "...with the flag in the trace": add "; since PR 6b (ADR 0064), only when the settings give no ZIP+4, and a ZIP+4 the plus-four file does not list is `ENGINE_ERROR zip_plus_four_not_in_locality_map`".
- :95 row "A ZIP+4 or per-site locality setting now": append "*ZIP+4 taken in PR 6b (ADR 0064); per-site localities in the multi-site PR (audit #16).*"

**ADR 0034** (:56): "`ENGINE_VERSION` is `phase-two/1`" gains "(`phase-two/2` since PR 6b's ZIP+4 lookup, ADR 0064)". Status "amended by 0064".

**ADR 0029** (the engine and its trace): status "amended by 0033, 0064". The trace gains the two optional keys, and `ENGINE_VERSION` is `phase-two/2`.

**ADR 0039** (the monitoring chain): status "amended by 0064". Months wait on the location (no run without a ZIP; a failed `location_not_ready` run not re-created), and a location save queues the plan by its request.

**Other documents:**
- `fixtures/golden/QUESTIONS.md` Q37 (:226-229), under Q4 (a). *Choice:* the ZIP+4 file's range decides; no ZIP+4 is `locality_needs_zip_plus_four`; an unlisted ZIP+4 is `zip_plus_four_not_in_locality_map`. *For the specialist:* does Medicare apply the ZIP5 locality to a ZIP+4 the ZIP9 file does not list, or return the claim?
- `fixtures/golden/README.md:31-35,260` (the count, and the ZIP+4 sentence), under Q4 (a).
- `docs/product/data-dictionary.md:12`.
- `docs/product/test-matrix.md` (§9).
- The PR body's "Freeze exception" section: "Yes: the founder's ruling of 2026-10-18 11:47 UTC (reconciliation-001 line 428, ADR 0062 ruling 3), the ZIP+4 locality lookup only; and the founder's answers to Q2 (rule_record CHECK), Q3 (permission) and Q4 (golden additions). Files as `tools/engine-freeze/exception.json`."

---

## 11. Open items (not the founder's)

- **O1, builder, before writing the parser:** confirm the ZIP9 record layout (one plus-four per line at 22-25, or a low and high pair) from the layout document in CMS's archive (transmittal R1249CP, CR 5578). The fixture and the parser follow it, and the record design holds either way.
- **O2, specialist:** Q37 (amended): what Medicare does with a ZIP+4 the ZIP9 file does not list. Until it is answered, the engine stops. An answer of "the ZIP5 locality" is an importer change (complement ranges quoting the ZIP5 line), not an engine change.
- **O3, builder:** the cross-tenant row factory's handling of `practice_site` (§4.7). The generated test must cover the table without a second row per practice: it reads the world's own row and is refused from the other world. If the factory's existing-row path does not fit, extend the factory; never skip the table (`row-factory.ts:28-29`).
- **O4, counsel** (after the founder's Q5 and Q6): the out-of-span wording on the upload page and the result page (Q6 (a)), and Q5's reading of "ZIP code".
- **O5, launch checklist:** a place-of-service split approved before the first customer run. With none, the practice's own places alone apply, as today.
- **O6, multi-site PR (right after PR 6b):**
  - windows, and dropping `practice_site_one_per_practice`;
  - per-site, per-claim readers in place of PR 6b's per-practice ones;
  - drop `practice.zip` and `practice.locality_code`;
  - `priced_line.practice_site_id`;
  - a pricing-check cause when a priced line's location was corrected (PR 5's `packet_version_pricing_check()`). A ZIP+4 corrected after a packet was built is not yet flagged stale; Pricing settings lists the months priced before the change, with their re-runs.
- **O7, Release-operations PR:**
  - reuse `rule_release_content_span()` for runs waiting on content (#7);
  - turn `locality_not_loaded` lines from paged engine errors into "waiting on content";
  - use the keyed read for price jobs (#31), with `locality_map_plus_four` keyed by ZIP.
- **O8, capacity:** the scale release's ZIP9 size and the keyed read's time with it, in the PR 6b capacity report beside the consumer's sizing.

## 12. Out of scope

- The screening's own consumer, its size and monthly cost, and switching on the time check (decisions 14 and 16, Track B).
- Mail streams (#76).
- The rest of #7.
- Multi-site resolution (#16 beyond the minimal record).
- Customer editing of place-of-service overrides or of the default rounding (console only, as today).
- Any change to the closed list of unpriced reasons.
- Any engine change beyond §3.4.

**Monthly cost:** none. No new service, storage class or third-party call. The extra rows (one location per practice, a few thousand plus-four records per release, three counts per upload) sit in the existing database.

## 13. If the founder answers otherwise

- **Q1 (a′), dated windows now:**
  - §4.2 adds `effective_from date` and `effective_to date` (null: open), with `CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)`. The one-per-practice index stays in PR 6b.
  - Without moves offered, nothing else changes. With moves, `runSettings()` picks the window covering each claim's first service date, and Pricing settings gains "The practice moved on <date>" (ADR 0064 records the part of #16 taken early).
- **Q1 (b), columns on the practice:**
  - §4.2 becomes `ALTER TABLE practice ADD COLUMN zip_plus_four text CONSTRAINT practice_zip_plus_four CHECK (zip_plus_four ~ '^[0-9]{4}$')`, plus a deferred constraint trigger requiring `zip` at commit.
  - Dropped: `practice_site`, its registry row, the backfill, the column revoke, the `REVIEWED_SCOPE_FUNCTIONS` entry (the setters write `practice` in the caller's scope) and the row-factory item.
  - Changed: the setters write `practice.zip` and `practice.zip_plus_four`; `practice_location_status`, `runSettings` and the run guard read them; the test inserts of §4.7 add `zip` instead of a location.
  - The multi-site PR moves both columns into its register and rewrites those readers and writers.
- **Q2 (b), per-code `locality_map` records:**
  - No row 1 in §6 and no new record type.
  - The engine's lookup at §3.4 becomes `release.inForce('locality_map', { zip: settings.zip, plus_four: given }, date)`.
  - The trace's `plus_four` loses `from` and `to`.
  - The parser emits one record per code, and the keyed reads add a `{zip, plus_four}` key.
  - O8 measures the record count against audit #31's memory limits.
- **Q3 (b), `contract.sign_off`:**
  - No row 4 in §6 and no `permissions.ts` change.
  - The route and `practice_set_location()` check `contract.sign_off`, and the persona tests assert that its holders can set the location.
- **Q4 (b), outside `fixtures/golden`:**
  - The four claims move to `tools/golden-worksheet/zip-plus-four/` with their own engine and oracle test.
  - Nothing under `fixtures/golden` changes, and `exception.json` loses `golden_added` and `golden_edited`.
  - Q37's amendment lives in ADR 0064.
- **Q5 (b):** `retention.ts:23,34,37` and the other places decision 7 names gain "and the ZIP+4 when Medicare needs one", for counsel.
- **Q6 (b), refuse the whole upload:**
  - No `screening_upload` columns.
  - The browser, the server and `submit_screening()` refuse the upload with `band_outside_content` and the dated message ("Row 12, service band 2024-Q3: PaidWhole has the Medicare content for 2026-Q1 to 2026-Q4 loaded. Screen quarters inside it, or leave this row out.").
  - The large test's change (§8) is still needed.

---

## 14. Review (one independent reviewer; each finding checked against the code and the documents)

| # | Finding (severity) | Verdict | What was done |
|---|---|---|---|
| 1 | The split pin and merge cannot run as `tp_app` (blocking) | **Confirmed.** `pricing_run_rules()` is INVOKER (`20261020090000:62`). `screening_split_in_force()` is INVOKER, revoked from PUBLIC and granted to no role (`free_screening.sql:1009-1011,1971,1986-1993`). The split table is owner-only (:909-911,1964). Every run insert would have failed | `place_of_service_split_in_force()` is now SECURITY DEFINER, granted to `tp_app`. New definer `pricing_run_split(uuid)`, scoped to `app.practice_ids` and granted to `tp_app`, which `runSettings()` uses (§3.5, §4.6). Both are in §6 row 6. New db tests as `tp_app` for a person's insert, a job's insert and the worker's read (§8) |
| 2 | `rule_release_content_span()` reports missing content as loaded for all time (blocking) | **Confirmed** by my own run on PostgreSQL 18.4 (`tp_pr6b_design_rev2_span`, dropped): the unfiltered form gives `{(,)}`, and the filtered form `{}` | The SQL uses `FILTER (WHERE r.id IS NOT NULL)`, with a comment on why (§5.2). Tests: a release with no `ncci_mue` at all, one whose MUE ends a quarter early, and one with no per-code MPPR (§8) |
| 3 | Three change-order checks broken without asking (blocking) | **Confirmed**: reconciliation-001.md:445 (no DDL on `rule_record`), :454 (the matrix only in PR 14), :429 (`fixtures/golden` unchanged), and :425 (stop and ask). The old line 29 was wrong | Q2, Q3 and Q4 added, each with the recommendation first and what each option gives up (§1). Q2 also explains why the third option (ranges inside the ZIP5 record) is not offered: it would break `tools/verify-content`, which is also frozen. Line 29 rewritten. §13 gives the other answers |
| 4 | CI goes red: the frozen oracle, the 50,000-row test, the dropped functions' callers (blocking) | **Confirmed** on all four points: `legacy-release.ts:108`; the frozen pricer is five-digit only (:121); `screening.large.db.test.ts:22` uses 2025 quarters while 900001's MUE and MPPR windows are 2026 only; and the callers listed | (1) `legacy-release.ts:108` gets the new table name and a header line. `legacy-adapter.ts`, whose hash is pinned (`oracle-imports.test.ts:15,36-39`), stays byte-identical. ADR 0062:280 is amended. (2) The split-ZIP capacity upload is compared with a whole-release oracle; the frozen oracle keeps the five-digit uploads; line 829 corrected (§8). (3) The large test's Medicare rows move into 2026 with units 1-12, keeping 9,216 Medicare rows per product and 50,000 in all (§8). (4) Every caller is listed in §7 |
| 5 | The deferred check and the move off `practice.zip` miss many callers (should fix) | **Confirmed**: 16 insert sites in 12 files, and 7 ZIP writers or readers. I also found the practice overview reading `practice.zip` (`practice.ts:138`, `page.tsx:420`) and `pricing.spec.ts:37,43` | Every site is listed (§4.7, §7). One helper, `createPracticeWithLocation()`. The cross-tenant world and the seed get a location. The row factory's unique-index clash became open item O3 |
| 6 | `zip_unknown` blames the customer's ZIP for a content gap (should fix) | **Confirmed** (2026-only locality windows; audit #7 at combined-report.md:257) | `zip_unknown` now means "in no window". New `locality_not_loaded` covers a known ZIP with no window for the period, and a flagged ZIP with no plus-four record for it. It never asks the customer to change anything (§4.3), and it waits on content as today, until the Release-operations PR. The screening gets its own refusal for it. The e2e step under 900001 now expects the not-loaded wording |
| 7 | Months wait whole for ZIP+4 statuses, fixed-fee lines included (should fix) | **Confirmed** (`engine.ts:538-546,599-611`; #33 says "while the ZIP is missing", and #7 says to refuse only when a line needs the content) | Applied as engineering under audit #7's own rule, not as a founder question. No run is created only when the ZIP is missing. Otherwise the run prices, and fails `location_not_ready` with no lines kept only if a line stopped on the location; the month then waits with no daily re-run (§4.5). The reviewer's mechanism (deciding at creation from the plans) cannot work: plans name the payer mapping, not the terms (`create.ts:69-73`), and only the engine resolves the terms, so the decision is made after pricing |
| 8 | The re-run diff would hide release changes whenever any setting changed (should fix) | **Confirmed** (`causes.ts:139-175`) | One-sided records are skipped only for `locality_map`, `locality_map_plus_four` and `pfs_gpci`, and only when the ZIP or ZIP+4 changed (§3.6). Tests added, including rounding plus a release-added MUE record (§8) |
| 9 | Freeze CI check: glob, count, stale exception, test collection, silent skip (should fix) | **Confirmed** on (a)-(e): the glob missed G19 and G20-G64 (46 claims); the set is 150 claims and 326 lines (`README.md:31-35`) | (a) `--diff-filter=MDRT` over the golden directories and 900001-900005. (b) Counts corrected. (c) Departed from the proposed fix: the exception applies only in the PR that adds or edits it, so neither a base merge nor a later PR needs a hand edit (§3.8). (d) The extract drops `*.test.ts`, and `**/.freeze-base/**` is ignored by vitest and eslint. (e) It fails under `CI` without the variable |
| 10 | Recreated functions: REVOKE and GRANT not stated; the privilege test loses them (should fix) | **Confirmed** (no default privileges anywhere; the test filters on `'%screening%'`, `screening.db.test.ts:480`) | Every DROP and CREATE now states its REVOKE and exact grant (§4.6, §5.1, §6). A by-name privilege test in `location.db.test.ts`. `screening_band_days` gets no grant, so the screening filter still holds (§8) |
| 11 | The label changes need a new labels version (should fix) | **Confirmed** (`labels.ts:18`, `labels.test.ts:36`, `free_screening.sql:221-225`, `routes.db.test.ts:840`) | New `SCREENING_LABELS_VERSION`, its hash in `labels.test.ts`, and CREATE OR REPLACE `screening_labels_version()` in §6 row 8. The schema is listed once, final, for one approval |
| 12 | Q1 overstates (a) and understates (b) (should fix) | **Confirmed** | Q1 restated: (a) also leaves the per-practice readers for the multi-site PR to rewrite and keeps a stale `practice.zip`. A dated-windows variant (a′) is added and weighed. Recommendation kept: (a′)'s gain is nil before launch, and its windows still need the multi-site PR's own changes and approval |
| 13 | Adding the ZIP+4 to the 30-day list changes a founder ruling (should fix) | **Confirmed** (decision 7, reconciliation-001.md:516). I also found that the cited `wording.ts` does not exist | Became Q5, recommending no change: the existing words already cover the ZIP+4 entered in the "ZIP code" field (`retention.ts:23,37`), and counsel confirms |
| 14 | The content refusal rejects a whole upload; a growth trade-off decided alone (should fix) | **Confirmed** (`uploads.ts:53`, `format.ts:741-799`) | Became Q6, recommending leaving the rows out and counting them, as the floor does. Separate counts, because the floor's CHECKs bound a row to 1-10 claim lines (`free_screening.sql:336`); never kept beyond 30 days. The floor's counsel-confirmed wording is untouched (§5.2) |
| 15 | e2e results would depend on test order once the split fills places (should fix) | **Confirmed** (`screening.spec.ts:125-131`, `playwright.config.ts:60`) | `prepare.ts` approves the same SYNTHETIC split before any spec. The screening spec's approval changes nothing and asserts equality. The builder checks every coverage expectation against it (§4.7) |
| 16 | ADR edits and the deploy-window list are incomplete (nit) | **Confirmed** (ADR 0062:95,113,262; ADR 0034:56; `execute.ts:170-172`; strict trace schema) | Added to §10. The migration header now lists six effects, including the old image not seeing new locations (§6) |
| 17 | Small omissions in the file list (nit) | **Confirmed** | Added `check.test.ts`, `pricing.prc21` (`packages/synth/src/cases/pricing.ts`), the `display.tsx:33` text, and the console "ZIP (optional)" field. `screening_status()` is CREATE OR REPLACE everywhere (OUT columns unchanged). The ZIP field is at `practice-settings.ts:48` |

## Sources (web, format only)

- [CMS transmittal R1249CP (ZIP5 and ZIP9 files, layouts)](https://www.cms.hhs.gov/Transmittals/Downloads/R1249CP.pdf)
- [California DIR copy of the ZIP9 layout (2020)](https://www.dir.ca.gov/DWC/FeeSchedules/AMBULANCE_FeeSchedule/Ambulance-January-2020/ZIP9lyout.txt)
- [First Coast: ZIP codes requiring a nine-digit ZIP code](https://medicare.fcso.com/fee-schedules/zip-codes-requiring-nine-digit-zip-code-zip-4)
- [CMS transmittal R1480CP (ZIP code changes)](https://cms.gov/regulations-and-guidance/guidance/transmittals/downloads/r1480cp.pdf)
