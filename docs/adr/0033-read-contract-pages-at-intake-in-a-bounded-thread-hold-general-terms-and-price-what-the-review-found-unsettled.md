# 0033. Read contract pages at intake in a bounded thread, hold general terms, and price what the review found unsettled

- **Status:** accepted
- **Date:** 2026-10-17
- **Deciders:** founder (engineering); the reimbursement specialist answers fixtures/golden/QUESTIONS.md Q31 to Q38
- **PRD sections:** 1 (rule 1), 2 (points 6 to 8), 5 (J5), 6 (Intake and documents; Contract repository), 7 (screen
  states), 9 (contract rate records), 11 (the engine, steps 1 to 9), 16 (Upload safety), 18 (the pricing oracle),
  20 (timed-units rule; the specialist); test matrix PAR-14, PAR-15, PRC-14 to PRC-16, PRC-20; ADRs 0020, 0026, 0028,
  0029

## Context

The review of milestones 3 to 5 found, among smaller things:

- **Untrusted PDFs were parsed in the web server.** Every request that showed or cited a page read the whole PDF and
  ran pdf.js in the request's process. The only bound was 64 MiB of compressed bytes; a Flate stream inflates about
  1000 to 1, and pdf.js holds the decoded stream, so one 522 KB upload made the shared web process allocate 520 MiB.
- **Spreadsheet exhibits could be uploaded but never cited**, so no record abstracted from one could be verified.
- **A rate record had to list its codes.** "110% of the Medicare Physician Fee Schedule" could not be stored as one
  term, and the golden adapter rewrote the golden lines' general terms into code lists the product could not hold.
- **The engine priced a timed-units rule of `UNKNOWN`** (the commercial default) although PRD 20 says "review, not
  price" and the worksheet refused it; it raised an operator alert for claim statuses 19, 20, 21, 23 and 25, which an
  835 carries routinely; it expanded any number of units into the day's ranking (a line of 5,000,000,000 units threw
  out of `price`); it ignored a ZIP the locality file marks as needing its ZIP+4; and `recompute` did not hold the
  fee-schedule step to the terms, settings and records it named.
- **The golden format had no remittance date, windows or variance**, so steps 7 and 8, a suspended sequestration and
  the general reduction rate had no independent oracle.

## Decision

- **Contract pages are read once, at intake, in a bounded thread; the web app reads only stored text.** The worker's
  intake reads every clean contract, exhibit and payer letter (a top-level upload or a zip entry) before it marks it
  stored: `@tp/contracts/pages` (`readDocumentPages`) runs the reader (`page-thread.ts`, which imports nothing of the
  repository so Node runs it as written and esbuild bundles it as `dist/page-thread.js`) in its own worker thread with
  a 192 MiB heap limit, a 256 MiB cap on the thread's heap and buffers together (polled every 25 ms through
  `worker.getHeapStatistics()`, since typed-array buffers escape the heap limit), a 60-second deadline, at most 2,000
  pages, 16 Mi characters of text and 64 MiB inflated from a workbook's parts, and drains the thread's output (pdf.js
  warnings can carry document text). A document past any limit is `unsupported_document`, never read in part; one that
  cannot be parsed is `document_unreadable`. The page texts are sealed with the practice's key at
  `documentPagesKey` (the original's key and `.pages`), then `source_document.page_text_status` and `page_count` are
  set (migration `20261017120000`). The web app's `storedPages` reads that row under the practice's policies with an
  audit event and opens the stored text; a document not read yet is `not_read_yet`. Neither pdf.js nor the thread is
  reachable from `@tp/contracts`' main entry, which the web app bundles.
- **Spreadsheets and CSVs are pages.** An .xlsx is read by pattern from its parts (no XML parser, so no entity or
  external reference is resolved): a page per sheet in workbook order, each row a line of its cells' text joined by
  tabs. A CSV is a page per 50 rows. Quotes and hashes then resolve as for a PDF. The legacy binary .xls is not
  accepted for an exhibit at upload and is held `wrong_type` at intake: nothing cites it.
- **A scope without codes is a general term.** `rateScopeSchema.codes` is optional and an absent list covers every
  code, as absent modifier sets and places of service already do. Resolution is unchanged: a general term and a code
  exhibit that both match are `AMBIGUOUS_RATE` until the specialist narrows one (QUESTIONS Q04). The abstraction form
  takes the word `any` for it, never a blank field. The golden adapter passes a null code list through as written.
- **Claim status, timed units, bounds and localities** (golden lines first, then the engine, as the rules ask):
  status 19 prices as primary, 20 and 21 are `SECONDARY_PAYER`, 23 and 25 are `ENGINE_ERROR` with the detail
  `claim_status_not_priced`, which `pagesOperator` says pages no one (`REVIEW_DETAILS`; milestone 7's runs raise the
  alert for every other detail); a line under `UNKNOWN` stops at step 3 with `UNITS_RULE_UNKNOWN`, after its
  fee-schedule value and before the reduction ranks it, whatever the code (no rule record says which codes are timed);
  more than `MAX_UNITS` (999) on a line is `ENGINE_ERROR units_above_limit`; a practice ZIP whose locality record
  needs its ZIP+4 is `ENGINE_ERROR locality_needs_zip_plus_four`, with the flag in the trace. The reduction of a day
  runs inside the per-line guard, and each line's trace records only the day's first unit and its own units.
  `ENGINE_VERSION` is `phase-one/2`.
- **`recompute` holds the fee schedule to what it was computed for**: the percentage, year basis and conversion factor
  against the terms, the setting against the practice's split for the place of service, the basis year and lookup
  against the year basis, every record's key against the line and settings, and every record's window against the
  service date (CURRENT, and always the locality) or the basis year (LOCKED).
- **The golden format is `tp-golden-claim/2`**: `inputs.as_of`, `inputs.claim.remittance_date`, version `windows`, and
  each priced line's `variance_cents` and `window`. The 53 claims of format 1 took `as_of` 2026-10-15, no remittance
  date and silent windows; `write` added their variance and `NO_WINDOW`, and every value they held is unchanged (a
  script compared all 100 lines field by field). Eleven claims (G54 to G64) cover statuses 19, 20 and 21, `UNKNOWN`,
  the contract window open on its last day and passed (PRC-14), a silent contract with and without a release default
  (4 months from the date of service, to the month's end), Medicare Advantage redetermination, a suspended
  sequestration and the general reduction rate, the last two from SYNTHETIC release 900003 (release 900001 with its
  sequestration, general reduction, MPPR file and dispute windows replaced). The golden tests now require at least the
  hundred lines, not exactly a hundred. A window property test asserts that a deadline is never before the date it is
  measured from and that judging later never changes the amount.
- **Deferred to milestone 7: "unless the practice has marked the plan otherwise"** (PRD 11 step 1). What a practice may
  mark is unsettled (QUESTIONS Q36) and the mark belongs with the pricing runs that read practice settings
  (`place_of_service_settings` waits there too). Until then every Medicare Advantage non-contracted line takes
  `MA_NONCONTRACTED_TERMS`.
- **Bookkeeping.** Every test-matrix case and oracle variant that completes in a built milestone
  (`BUILT_THROUGH_MILESTONE`, 5) names the tests that assert it, and the fixtures test fails when one does not; PAR-14
  and PAR-15 are priced from their parsed 835s (`tools/test/remittance-pricing.test.ts`). The README says what
  milestones 2, 3 and 5 still need from a person.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| Run the reader in a worker thread inside the web server | The thread's script cannot be located reliably inside the Next.js bundle, and the web process would still parse untrusted bytes; reading once at intake also stops re-reading a document on every request |
| `resourceLimits` alone | A Node heap limit does not bound typed-array buffers: a probe allocated 1,280 MiB of buffers in a thread limited to 64 MiB. The poll of the thread's heap statistics does; with it, a 512 MiB and a 1.5 GiB bomb both stopped near 300 MiB above the process's start |
| A child process | Heavier per document, the same bundling question, and no better bound than the thread's polled cap |
| A spreadsheet library | Adds a parser of untrusted XML with entity handling; the pattern reader needs only shared strings, inline strings and values |
| Accept .xls exhibits and leave them uncitable | The finding's complaint exactly: an exhibit no record can be verified from |
| `UNITS_RULE_UNKNOWN` only for timed codes | No rule record names them, and the plan forbids typing CMS lists from memory (QUESTIONS Q32) |
| Price 23 and 25, or call them `SECONDARY_PAYER` | Their reading is the specialist's (Q31); until then a review stop that pages no one |
| A ZIP+4 or per-site locality setting now | No input carries one and no golden line prices one (Q37); stopping is never a guess |
| Keep format 1 and add optional fields | A strict format with optional window fields would let a claim silently skip steps 7 and 8 |

## Consequences

- No uploaded document is parsed in the web process; a document's pages are read at most once, under limits that do
  not grow with the bomb. The intake concurrency times the thread's cap must fit the worker task (milestone 11 sizes
  it). A document taken in before this migration has no page text and cites as `not_read_yet`; no deployed environment
  holds one, and a development database is migrated and seeded afresh.
- The golden oracle covers steps 7 and 8 and the branches the review named; 119 lines match the engine to the cent and
  every trace recomputes. None is specialist-verified, so milestone 5 stays open (README).
- Commercial records entered without a timed-units rule now leave their lines unpriced `UNITS_RULE_UNKNOWN`; the
  specialist sets `MEDICARE_POOLED` or `PER_CODE` from the contract.

## Revisit when

The specialist answers Q31 to Q38, milestone 7 adds the pricing runs (the operator alert for `ENGINE_ERROR`, the MA mark,
MUE against the units bound), or a deployed worker's memory shows the thread's cap needs tuning.
