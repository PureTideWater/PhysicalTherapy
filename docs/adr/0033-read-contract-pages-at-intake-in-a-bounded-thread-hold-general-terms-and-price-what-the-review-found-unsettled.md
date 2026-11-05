# 0033. Read contract pages at intake in a bounded thread, hold general terms, and price what the review found unsettled

- **Status:** accepted; amended by [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md) (2026-10-21: a ZIP whose locality needs its ZIP+4 is priced from the ZIP+4 file's range when the settings give one); amended 2026-11-05 (`co-001/pages-child-process`): the reader runs in a child process of its own, not a worker thread ("Amendment (2026-11-05)", below; marked in the Decision, the alternatives and the consequences)
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

- **Contract pages are read once, at intake, in a bounded reader; the web app reads only stored text.** The worker's
  intake reads every clean contract, exhibit and payer letter (a top-level upload or a zip entry) before it marks it
  stored: `@tp/contracts/pages` (`readDocumentPages`) runs the reader (`page-reader.ts`, which imports nothing of the
  repository so Node runs it as written and esbuild bundles it as `dist/page-reader.js`) in a child process of its own
  *(amended 2026-11-05; it was a worker thread)* with a 192 MiB old-generation heap and 16 MiB semi-spaces (240 MiB, its
  own flags), a cap of 256 MiB on the process's memory growth over its idle footprint (polled every 25 ms from
  `/proc`, since typed-array buffers escape the heap limit), a 60-second deadline, at most 2,000
  pages, 16 Mi characters of text and 64 MiB inflated from a workbook's parts, and drains the reader's output (pdf.js
  warnings can carry document text). A document past any limit is `unsupported_document`, never read in part; one that
  cannot be parsed is `document_unreadable`. The page texts are sealed with the practice's key at
  `documentPagesKey` (the original's key and `.pages`), then `source_document.page_text_status` and `page_count` are
  set (migration `20261017120000`). The web app's `storedPages` reads that row under the practice's policies with an
  audit event and opens the stored text; a document not read yet is `not_read_yet`. Neither pdf.js nor the reader is
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
  needs its ZIP+4 is `ENGINE_ERROR locality_needs_zip_plus_four`, with the flag in the trace; since PR 6b (ADR 0064),
  only when the settings give no ZIP+4; a ZIP whose plus-four record is not in force on the service date is
  `ENGINE_ERROR no_locality_plus_four` (a gap in PaidWhole's content, never the practice's), and a ZIP+4 the
  plus-four record does not list is `ENGINE_ERROR zip_plus_four_not_in_locality_map`. The reduction of a day
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
| A child process | *Taken 2026-11-05 (Amendment below).* It was rejected as heavier per document, the same bundling question, and no better bound than the thread's polled cap. Measured since: about 60 ms more a document warm, the bundle builds it beside `main.js`, and its bound is the one that survives the task's heap flag; the process adds the empty environment and Node's permission model |
| A worker thread under the task's heap flag (2026-11-05) | A process-wide V8 heap flag overrides a thread's `resourceLimits` on Node 24: under `--max-old-space-size=560` (ADR 0071's worker flag) the thread asking 192 MiB measured 608 MiB and read a 1,500-page document today's reader refuses. A thread can take neither `--max-old-space-size` in its `execArgv` (`ERR_WORKER_INVALID_EXEC_ARGV`) nor `NODE_OPTIONS` in its env (ignored) |
| A spreadsheet library | Adds a parser of untrusted XML with entity handling; the pattern reader needs only shared strings, inline strings and values |
| Accept .xls exhibits and leave them uncitable | The finding's complaint exactly: an exhibit no record can be verified from |
| `UNITS_RULE_UNKNOWN` only for timed codes | No rule record names them, and the plan forbids typing CMS lists from memory (QUESTIONS Q32) |
| Price 23 and 25, or call them `SECONDARY_PAYER` | Their reading is the specialist's (Q31); until then a review stop that pages no one |
| A ZIP+4 or per-site locality setting now | No input carries one and no golden line prices one (Q37); stopping is never a guess. *ZIP+4 taken in PR 6b (ADR 0064); per-site localities in the multi-site PR (audit #16).* |
| Keep format 1 and add optional fields | A strict format with optional window fields would let a claim silently skip steps 7 and 8 |

## Consequences

- No uploaded document is parsed in the web process; a document's pages are read at most once, under limits that do
  not grow with the bomb. The intake concurrency times the reader's process bound must fit the worker task (milestone
  11 sizes it) *(amended 2026-11-05: it was the thread's cap; one reader at a time, about 420 MiB at worst)*. A
  document taken in before this migration has no page text and cites as `not_read_yet`; no deployed environment
  holds one, and a development database is migrated and seeded afresh.
- The golden oracle covers steps 7 and 8 and the branches the review named; 119 lines match the engine to the cent and
  every trace recomputes. None is specialist-verified, so milestone 5 stays open (README).
- Commercial records entered without a timed-units rule now leave their lines unpriced `UNITS_RULE_UNKNOWN`; the
  specialist sets `MEDICARE_POOLED` or `PER_CODE` from the contract.

## Revisit when

The specialist answers Q31 to Q38, milestone 7 adds the pricing runs (the operator alert for `ENGINE_ERROR`, the MA mark,
MUE against the units bound), or a deployed worker's memory shows the reader's cap needs tuning. *(Amended 2026-11-05:)*
Node's network permission reaches an LTS (Node 26), or a parsing task with no outbound access is wanted: the reader's
process can still open a connection (below).

## Amendment (`co-001/pages-child-process`, 2026-11-05): the reader runs in a child process of its own

**Why.** ADR 0071 plans `--max-old-space-size=560` on the worker task's command, and on Node 24 a process-wide heap flag
overrides a worker thread's `resourceLimits`: the page thread, asking old 192 and young 32 (240 MiB), measured 608 MiB
under that flag and read a SYNTHETIC 1,500-page PDF today's reader refuses, beside a 752 MiB main thread in a 1,024 MiB
task. The weekly real-size test already runs the worker under the flag. A child process takes its own flags whatever
its parent runs with.

**What.** `readInChild` replaces `readInThread`; `readDocumentPages`, `documentPages`, `documentFormat`,
`PAGE_READ_LIMITS` and `PageReadError` keep their signatures, and every result keeps its meaning. The child is
`process.execPath` with `readerArgv(limits)` and its entry only: `--max-old-space-size=192 --max-semi-space-size=16`
(240 MiB on any host: the old flag alone leaves the young generation host-sized, 384 MiB here), `--stack-size=3920`
(the thread's 4 MiB), `--permission` reading only its own code (`dist/page-reader.js` in the image, the workspace in the
source tree) and `--disallow-code-generation-from-strings`. Its environment is empty (no credentials, no database or
queue URL, no `NODE_OPTIONS`), its argv names nothing of the document, the bytes go in on stdin (one framed request,
copied once) and the pages come back on stdout one frame at a time; nothing is written to disk, a crash included: a V8
heap out of memory aborts the reader, and a core of its memory holds the document's text (a SYNTHETIC 1,500-page PDF
left an 858 MB core in the reader's directory under `ulimit -c unlimited`, review fix round), so the reader is started
through `/bin/sh` setting `ulimit -c 0` (soft and hard, which it cannot raise) before it execs node in its place, its
working directory is `/` (not writable by the image's user), and every container pins `core` at 0 in its task
definition (`infra/lib/constructs/compute.ts`). Measured: it cannot
write a file, read `/etc` or `/proc/*/environ`, spawn a process, start a thread or load an addon (pdf.js's native canvas
binding no longer loads into the worker).

- **Memory:** the child's resident set (`VmRSS`; `ps` every 100 ms off Linux) every 25 ms; past 256 MiB of growth over
  its baseline, taken when it says ready (139 to 146 MiB measured), it is killed and the document is
  `unsupported_document`. A baseline over 224 MiB is the reader's own failure (`PageReadError`), never a wider bound. A
  1 GiB deflate bomb, which a child with no memory check took to 2,357 MiB, is killed at about 267 MiB of growth.
- **Same results:** with no flag, today's thread reads 1,000 and 1,250 SYNTHETIC pages and refuses 1,500 to 2,000; the
  child at heap 192 does exactly the same, under the planned flag too. A larger heap gains nothing (at 224 the memory
  cap refuses the same documents), so none is added.
- **Results:** a limit passed (memory, deadline, a V8 heap out of memory, a reply past its pages, characters or bytes)
  is `unsupported_document`; a document the reader cannot parse is `document_unreadable`; any other exit, a malformed
  frame or a spawn failure is `PageReadError`, naming only the exit code or signal. The child's stderr is never logged
  (only its last 1 KiB is read, for V8's fixed out-of-memory line); its console is silenced before it reads a byte.
  Results are given on `close`, never on `exit`, which came before the last frames (985 of 1,000 pages, measured).
  The deadline and the memory bound hold until `close`, the reply in or not, and a child that has sent its last frame
  has 1 s to close (`READER_EXIT_GRACE_MS`): past it the child is killed and the read is `PageReadError`, so a reader a
  document compromised can neither hold the one reader slot nor grow after replying (review fix round, 2026-11-05).
- **One at a time:** at most one reader per worker process, one child per document, never reused; its slot is freed
  once it has closed, and every running child is killed when the worker exits normally (or on a thrown error). A
  worker killed by a signal or aborted runs no exit handler: the task's init process (`initProcessEnabled`) then exits
  and the kernel ends the container's processes, the reader's included, so the container's end is the last bound;
  outside a container (development, CI) a reader in synchronous parsing, whose own orphan checks run only when its
  loop is free, runs until that work ends (review fix round, 2026-11-05).
- **Cost:** spawn to the reader's ready frame 226 to 261 ms from the bundle (11 runs, a 2-page PDF), about 60 ms a
  document more than the thread warm and 2.1 s for the first read after a cold start; intake is one document at a time
  and not latency-bound.
- **The order:** ADR 0071's worker heap flag lands only after this; `infra/test/heap.test.ts` refuses a V8 heap flag on
  any container of the worker image unless `PAGE_READER_ISOLATION` is `'process'`, and runs the worker container's real
  command with `heapFlag('worker')` to measure the reader at 240 MiB.
- **Not bounded: the network.** Node 24 has no network permission and the worker's security group allows HTTPS
  anywhere, so a reader a document compromised could send that document out. It holds no credential, key or other
  document (the thread held all three in reach). Revisit when Node's network permission reaches an LTS, or with a
  parsing task that has no outbound access.
