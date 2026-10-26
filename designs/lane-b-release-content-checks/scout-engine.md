# Scout: how releases are read for pricing, and #31 (memory)

Read-only scout of /home/user/PhysicalTherapy at claude/build-platform 6ddd587. Every claim cites file:line at that commit.
Conclusion first: #31 can be built entirely outside packages/pricing/src with the engine's interface unchanged, needs
no DDL, and about half of it already exists (PR 6b's keyed view, built generic for this item). The heap-limit part
touches infra/lib/constructs/compute.ts, a PR #42 file, so it moves to a later PR. A second constraint, also from #42:
tools/screening-capacity/watched-paths.txt (a #42 file) lists every file in the worker image's import closure, so this
PR must add no new non-test source file that the images import (see section 7).

## 1. The engine's rules interface (frozen; nothing here changes)

- The engine reads a release only through `IndexedRelease` (packages/pricing/src/release.ts:27-37): `releaseNo`,
  `manifestSha256`, `inForce(type, key, date)`, `latestInYear(type, key, year)`, `ref(record)`. `PricingInput.release`
  is that interface (packages/pricing/src/types.ts:94-100). `indexRelease()` (release.ts:45-90) is one way to build it.
  The engine never builds it, so any caller can hand it a different implementation. PR 6b's keyed view already does
  (apps/worker/src/price/keyed-release.ts:116-149).
- Every lookup the engine makes, with its key and how null ("not found") is treated:

| Type | Key | Where | Null means |
|---|---|---|---|
| ncci_mue | {hcpcs: line code} | engine.ts:354 (only with apply_ncci, :350-353) | no unit limit (`record: null`, :355): **silent** |
| ncci_ptp | {column1: other line's code, column2: this line's code}, for every other line of the same claim with the same service date (lineNo differs) | engine.ts:371-373 (only with apply_ncci, :330) | no edit (:374-376): **silent** |
| pfs_rvu | {hcpcs, modifier: ''} via inForce (CURRENT) or latestInYear (LOCKED:yyyy) | engine.ts:569, :585 | NO_PFS_VALUE no_rvu_in_basis_year (:586-588): fails safe |
| locality_map | {zip: settings.zip} | engine.ts:609 | throws no_locality (:610-612) |
| locality_map_plus_four | {zip: settings.zip} (five-digit ZIP) | engine.ts:625 | throws no_locality_plus_four (:626-629) |
| pfs_gpci | {carrier, locality} taken from the locality record (not from the line) | engine.ts:639 | throws no_gpci (:640-642) |
| conversion_factor | {applicability} | engine.ts:644 | throws no_conversion_factor (:645-647) |
| mppr_rate (code) | {hcpcs, modifier: ''} | engine.ts:762 (only for lines with apply_mppr, :697) | not in the pool, not reduced (:763-765): **silent** |
| mppr_rate (general) | {component: 'practice_expense'} | engine.ts:770 | percent null, then ENGINE_ERROR no_mppr_rate (:730-733) |
| assistant_modifier | {modifier: CQ/CO} | engine.ts:781 | throws no_assistant_record (:782-784) |
| sequestration | {program: 'medicare'} | engine.ts:831 | throws no_sequestration_record (:832-834) |
| dispute_window | {program, window: 'redetermination'} on the remittance date | windows.ts:48 | NO_WINDOW (:49-51) |

- **The loud-reader trap.** Every throw inside the engine becomes a line priced ENGINE_ERROR: `attempt()`
  (engine.ts:250-256) turns a non-EngineInputError throw into detail 'unexpected' (:246-248), and the MPPR day's
  try/catch (engine.ts:706-715) stops the whole day. So a reader that only throws is quiet: the lines would be stored
  as ENGINE_ERROR. The keyed view's contract handles this. It keeps a sticky `violation` (keyed-release.ts:121-128,
  :130-132), and the caller checks it after every `price()` call and before storing anything (keyed-release.ts:24-26;
  the screening does this at apps/worker/src/screening/adapter.ts:434-447). Any #31 caller must keep the same contract.
- `recompute()` (packages/pricing/src/recompute.ts:122) reads only a trace, never a release. Triage and reports read
  the release outside the engine (section 3), so a throw there is loud as it stands.

## 2. Every place rule records are read into memory today

| Caller | Read | Size read | #42 file? |
|---|---|---|---|
| Price job | `executePricingRun` calls `loadRuleRelease(scope.client, run.release_no)` (apps/worker/src/price/execute.ts:271) | whole release: `SELECT ... FROM rule_record WHERE release_no = $1` with no type filter (apps/worker/src/price/release.ts:111-122), then indexStoredRelease (:86-108) | no |
| Release impact (web release note "what would change") | `releasesPage` handler: `runReleaseImpact(scope, run, await loadRuleRelease(...))` (apps/web/src/lib/routes/releases.ts:58-66) prices the run twice in the request; runReleaseImpact loads the run's own release whole too (apps/worker/src/price/impact.ts:92) and calls priceClaims twice per batch (:106-107) | two whole releases in the web process | releases.ts no; apps/web/src/lib/releases/releases.test.ts yes |
| Release dry run (CLI) | tools/release/database-runs.ts:46-47 indexes the candidate (from files, tools/release/impact.ts:113-119) whole and calls runReleaseImpact for every complete run | candidate whole plus each run's own release whole | no |
| Triage | `referencesByRelease` loads every release a candidate was priced under, whole, once per job (apps/worker/src/triage/execute.ts:252-261, used at :270, :277) | whole release; then `releaseReferences` (packages/triage/src/behavior.ts:48-66) reads only mppr_rate (:51, :59) and conversion_factor (:63) | no |
| Audit report | `gatherReport`: `releaseReferences(await loadRuleRelease(client, run.release_no))` (apps/worker/src/report/content.ts:464) | whole release for the same two types | no |
| Screening consumer | shared types once per release and manifest, cache `RELEASES`, at most `RELEASES_KEPT = 2` (apps/worker/src/screening/job.ts:118-145, :188-221); keyed records per run in one snapshot (:225-237); `keyedRelease` view (:240) | shared ~2,184 records (ADR 0062 line 1253) plus the run's keys | **job.ts yes**; adapter.ts, operator.ts no |
| Screening oracle (test tool) | tools/screening-capacity/oracle.ts:66, :91 | whole release, test only | oracle.ts no (run.ts, report.ts yes) |
| Golden worksheet (test tool) | tools/golden-worksheet/engine.ts:164-202 | committed fixtures, test only | no |
| Web screening | reads no records into memory: only `rule_release_content_span()` (apps/web/src/lib/screening/content-span.ts:26-36) | spans | content-span.ts no; routes.ts, validation.ts, messages.ts, retention.ts yes |

Other rule_record reads, all SQL-side, none holding a release in memory:
- apps/worker/src/price/diff.ts:313-316 and :364-367 join `rule_record` on `(release_no, sha256)`. **No index covers
  sha256**, so at real size each probe walks the whole release under `rule_record_by_type`'s release_no prefix, or the
  plan scans it. The trace ref carries record_type, key and effective_from (packages/pricing/src/release.ts:19-25),
  so these joins can use `rule_record_identity` in full with no DDL. diff.ts:369-373 already joins on (release_no,
  record_type, key). This is an improvement inside #31's scope. It overlaps co-001/superseded-rerun (re-run diff).
- apps/worker/src/triage/deadline.ts:81-83: dispute_window by sha256 within (release_no, record_type), a small type
  under rule_record_by_type. :127-131: one key, current_rule_release(). Fine.
- apps/worker/src/packets/records.ts:339-345: state_prompt_pay by `key ->> 'state'` (small type). Fine.
- apps/worker/src/parse/code-lists.ts:40-46: carc and rarc of the release in force (small). Fine.
- apps/web/src/lib/packets/queries.ts:185: distinct states of state_prompt_pay (small). Fine.
- apps/web/src/lib/releases/queries.ts:40 runs `count(*)` of every published release on each listing.
  queries.ts:99-107 FULL JOINs two whole releases for each release-note view. Node memory is unaffected, but at
  2.2M records each request scans both releases in Postgres. Proposal, outside this PR: stored counts (Lane A, with
  #8's table).

Indexes (packages/db/migrations/20261015120000_rule_content.sql): `rule_record_identity` UNIQUE (release_no,
record_type, key, effective_from) at :36, and `rule_record_by_type` (release_no, record_type) at :37. Drizzle mirror:
packages/db/src/schema/rules.ts:36-39. tp_app holds SELECT on rule_record (:88). The loader runs
`VACUUM (FREEZE, ANALYZE) rule_record` after a load (packages/rules/src/loader.ts:169-175).

## 3. What PR 6b already built (ADR 0062), and whether it took #31's screening part

It did. ADR 0062 "The release read" (docs/adr/0062-...md:264-285, :1253-1262):
- One copy of the shared (non-keyed) types per release and manifest, at most two releases (job.ts:125-145). Each
  thread holds one copy, three in all; ADR 0062:1253-1254 records that as "measured and accepted, not a founder
  question".
- The keyed types are read per run by the run's own codes and ZIP: `operator_screening_run_keys()`
  (20261104090000_free_screening.sql:1678-1691) and `operator_screening_run_records()` (20261105090000:989-1009; the
  ZIP+4 file added there). They probe `rule_record_identity` per key (ADR 0062:1258-1262; the key function has ROWS 1).
- The shared read is a loose index scan per type, the keyed types left out (20261106090000_screening_consumer.sql:615-650).
- The ZIP's locality is looked up separately: locality_map and locality_map_plus_four are keyed types
  (keyed-release.ts:34).
- Lookups outside the fetch fail the run as RELEASE_READ_OUTSIDE_FETCH before its batch is stored (job.ts:255,
  :276; adapter.ts:434-447). Test matrix SCR-09 (docs/product/test-matrix.md:175).
- An explicit heap for the consumer: `--max-old-space-size=896` (infra/lib/screening.ts:12-21;
  infra/lib/constructs/compute.ts:35; apps/worker/src/screening/threads.ts:22-43).
- A weekly capacity test at production limits with the generated scale release, including the full PTP table
  (.github/workflows/screening-capacity.yml:22-26 weekly cron, S1 to S5 50,000-row uploads; packages/synth/src/cases/matrix.ts:196).
- What 6b did **not** build: the keyed-record cache (ADR 0062:788-790, :1257). It is not needed.

So the screening needs nothing more for #31. The price job, triage, reports, the impact check, the worker and web
heap limits, and a real-size test of those paths remain.

## 4. The reusable piece: apps/worker/src/price/keyed-release.ts

- `KEYED_RECORD_TYPES` = pfs_rvu, ncci_mue, mppr_rate, ncci_ptp, locality_map, locality_map_plus_four (:34). Every
  other type is "shared" and read whole.
- `requestedKeys()` (:78-88). `screeningRequestedKeys(codes, zip)` (:97-107) assumes same-code pairs only, so it is
  wrong for a practice claim with different codes. The price job needs its own key function.
- `keyedRelease({shared, records, requested})` (:116-149) serves shared types from the shared index and keyed types
  only for requested keys. A requested key with no record answers null legitimately. An unrequested key sets the
  violation and throws `ReleaseReadOutsideFetch` (:51-60).
- `ref` is routed by type to the index that holds the record (:146-148). Both indexes use indexStoredRelease, which
  names records by the loader's stored sha256 (release.ts:86-108), so traces stay byte-equal to today's.

## 5. #31's best option for the remaining callers: exactly what changes

All outside packages/pricing/src, with `IndexedRelease` unchanged.

**5a. The key set from a run's lines.** Compute it in TypeScript from the very `StoredClaim[]` the batch prices
(apps/worker/src/price/lines.ts:110-173), not from a second SQL definition of the run's lines. The claim the engine
sees is exactly `claimInput(claim, ...)` (execute.ts:150-178), and its lines are only the claim's lines in the period
up to the cut-off (lines.ts:136-137). For each batch:
- for each line's `procedureCode`: pfs_rvu {hcpcs, modifier: ''}, ncci_mue {hcpcs}, mppr_rate {hcpcs, modifier: ''};
- mppr_rate {component: 'practice_expense'} once;
- ncci_ptp: for each claim, every ordered pair of lines with different lineNo and equal `serviceDate`, as
  {column1: other.procedureCode, column2: line.procedureCode} (mirrors engine.ts:371-373; a code billed twice gives
  (c, c));
- locality_map {zip: settings.zip} and locality_map_plus_four {zip: settings.zip}. The ZIP comes from `runSettings`
  (apps/worker/src/price/settings.ts:29-37; '' when no site, which fetches nothing, and the engine's no_locality then
  stops the run as location_not_ready, execute.ts:279-287). ZIP+4 does not change the key (engine.ts:625).

The set is a superset of what the engine asks: the flags gate the reads (engine.ts:310, :330, :697), but asking for
more is harmless. Implement it as a pure `claimsRequestedKeys(claims, zip)` beside `screeningRequestedKeys` in
keyed-release.ts (an existing file, see section 7), with a property test: for random claims, every lookup the engine
makes lies inside the set.

**5b. Fetch per batch, or per run.** Recommended: per batch (500 claims, execute.ts CLAIMS_PER_BATCH), fetched inside
the same pricing transaction as the batch (execute.ts:244-301). Memory is then bounded by a batch, not by the run or
the release, and the keys come from the objects priced, so "a row outside the key set" cannot arise. Releases are
immutable, so READ COMMITTED (no isolation is set; the job's transaction is the default) reads the same records in
every batch. Query, run as the job's login (tp_app grant, migration :88): one statement per batch,
`unnest($2::text[], $3::jsonb[]) w (record_type, key) CROSS JOIN LATERAL (SELECT ... FROM rule_record rr WHERE
rr.release_no = $1 AND rr.record_type = w.record_type AND rr.key = w.key OFFSET 0) x`. The `OFFSET 0` fence keeps it a
per-key probe of `rule_record_identity` whatever the statistics say: the planner chose hash joins over the whole
release before (ADR 0062:1258-1262; loader.ts:169-173). A db plan test should hold it: Index Scan using
rule_record_identity, never Seq Scan or Hash Join on rule_record, as SCR-09 does for the screening.

**5c. Shared types once per process.** Read them as the job's login with a plain `WITH RECURSIVE` loose index scan over
`rule_record_by_type` to list the release's types, then one indexed read per non-keyed type. This is the same shape as
operator_screening_release (20261106090000:622-650), but as a query, not a function, so no DDL. It does not name the
shared types, so a record type added later is never silently left out. Cache it in-process by `release:manifest`, at
most two, like job.ts:125-145. That code stays untouched (#42); the price-side cache is a new one in
apps/worker/src/price/release.ts.

**5d. Fail loudly.** After each `priceClaims` (execute.ts:198-220), before `insertPricedLines` (:293), check
`view.violation`. If it is set, roll back and fail the run in its own transaction with a new
`FailureCode 'release_read_outside_fetch'` (execute.ts:43). It fits the free-text CHECK `^[a-z][a-z0-9_]{0,63}$`
(20261018090000_pricing_runs.sql:44), so no DDL. It needs words in `FAILURE_TEXT`
(apps/web/src/components/pricing/display.tsx:31-38, `satisfies Record<FailureCode, string>`; not a #42 file;
brand.md and CO-11). It also needs an operator alarm log line with fixed text and an `error_code`, using only fields
already allowlisted (`job_id`, `pricing_run_id`, `error_code`, `record_count`, `elapsed_ms`; packages/observability/src/fields.ts is
a #42 file and cannot gain fields).

**5e. Triage and reports: two types only.** Replace `loadRuleRelease` in triage/execute.ts:257 and
report/content.ts:464 with a typed read, `SELECT ... WHERE release_no = $1 AND record_type = ANY ('{mppr_rate,
conversion_factor}')` (rule_record_by_type). Index it with indexStoredRelease, wrapped so that `inForce` or
`latestInYear` of any other type throws. That throw is outside the engine, so it is loud with no extra check. Both
types are small whole: the scale shape has 150 pooled codes a year (packages/synth/src/release/scale.ts:76-77) and a
handful of factors. `releaseReferences` (packages/triage/src/behavior.ts:48-66) is unchanged. Name the two types once,
next to it, with a test that `releaseReferences` asks for nothing else.

**5f. The impact check.** Make `runReleaseImpact` (impact.ts:90-114) read both releases per batch by the batch's keys:
two keyed views over the same key set, both checked for violations. The web route then holds two batches' keyed
records, not two releases. The dry-run CLI's candidate comes from files (tools/release/database-runs.ts:46-47); build
its keyed view from the in-memory candidate, filtered per batch, or keep the candidate whole. That is an ops process,
release.yml NODE_OPTIONS 6144 at .github/workflows/release.yml:168. Pricing twice inside a web request, with its
180-s load balancer limit, stays until #8 (Lane A, its practice-scoped impact-count table) moves the check to the
worker. Lane B should not build that move.

**5g. diff.ts.** Switch :313-316 and :364-367 to join on (release_no, record_type, key, effective_from) taken from the
trace refs (section 2). No DDL.

**5h. Heap limit (later PR, after #42).** The worker and the platform both run `COMMANDS.worker = ['node',
'--enable-source-maps', 'dist/main.js']` with no heap flag (infra/lib/constructs/compute.ts:31-38, used at :263 and
:292). The web runs `['node', 'apps/web/server.js']` (:32). infra/test/compute.test.ts:159-160 asserts the web has no
heap flag and no NODE_OPTIONS. Task sizes (infra/lib/environments.ts:110-114, not a #42 file): web 512 CPU / 1,024
MiB, worker 512 / 1,024 with Chromium for PDFs, platform 256 / 512. Node 24 sizes the heap from the container (560 MiB
at 1,024, 259 at 512; environments.ts:105-107). The Dockerfile CMD (apps/worker/Dockerfile:45) is overridden by the
task command (compute.ts:419). NODE_OPTIONS in the Dockerfile would hide the limit from compute.test.ts. The best
place is therefore explicit flags in COMMANDS: a separate platform command, constants in a small infra/lib file like
infra/lib/screening.ts:12-21, held by infra/test/compute.test.ts. compute.ts and compute.test.ts are both #42 files,
so this part splits out after #42 merges. The weekly test (5i) can read the same constant before then.

**5i. The weekly real-size test.**
- Generator: `SCALE_RELEASE_SHAPE` (packages/synth/src/release/scale.ts:56-91): 19,000 RVU codes, 42,000 ZIPs with
  ZIP+4, 15,000 MUE, 2,000,000 PTP pairs. The release is 900100, reserved (:20-21), about 2.2M records
  (matrix.ts:196). It is built outside the repo by tools/release/scale.ts (:12-23) and loaded by
  tools/screening-capacity/load.ts:26.
- Containers and limits: tools/screening-capacity/containers.ts and limits.ts (not #42) already run the images at
  production sizes. tools/screening-capacity/run.ts and report.ts are #42 files. Write a new harness (for example
  tools/release-capacity/, outside the image import closure) that reuses containers.ts, limits.ts and load.ts.
- It needs a practice-shaped synthetic run with realistic code variety, so pairs are exercised.
  apps/worker/src/price/price.large.db.test.ts:22-24 uses 6 codes, 4 lines a claim, 100,000 lines. Generate the run
  through packages/synth, with cases RCC-01..08 reserved.
- Flow: price job, triage, report under the worker's 1,024 MiB and the explicit heap flag, then five 50,000-row
  screenings at once. The five screenings can reuse the screening-capacity scenarios (S1 to S5), or the new workflow
  can depend on that job rather than repeat it.
- Workflow: a new weekly workflow file. Its action pins must match co-001/ci-deps's pins (overlap).

## 6. Measured: in-memory size per record today (Node 24, under the lock)

Script: /tmp/claude-0/-home-user-PhysicalTherapy/6dcacc47-f55b-5ed0-ab9e-d8b495c8bdd9/scratchpad/measure/size-parsed.ts.
It builds 200,000 rows in StoredRecordRow shape with JSON-parsed, per-row distinct key and value objects (as pg
returns them), then runs `indexStoredRelease` from apps/worker/src/price/release.ts:86, then GC.

| Type | Rows alone | Rows + index (retained) |
|---|---|---|
| ncci_ptp | 419 B | 671 B |
| pfs_rvu | 427 B | 676 B |
| locality_map (shared constants) | 344 B | 745 B |

At about 670 B a record, the 2.2M-record scale release holds about 1.4 GiB live. That is a lower bound: it leaves out
the pg driver's transient buffers and the `rows` array that `loadRuleRelease` keeps alive until indexing returns
(release.ts:116-121). It is 2.5 times the worker's 560 MiB heap and above #31's 661 MB estimate. A run's keyed set is a
few hundred codes and a few thousand pairs, under 5 MB.

## 7. Constraints found that bind the design

- **Engine freeze:** nothing under packages/pricing/src changes (tools/engine-freeze/check.ts:13-19, :47-51). The
  frozen-release regex covers release-synth-900001 to 900005 (check.ts:58). A new fixture release must take a free
  number other than 900001 to 900005 and 900100.
- **#42's watched list:** tools/screening-capacity/watched-paths.txt (a #42 file) lists every file of the images'
  import closure, among them apps/worker/src/price/*.ts (:173-188), report/*.ts (:200-211), triage/*.ts (:235-237) and
  packages/triage/src/*.ts (:483-492). A unit test holds it equal to the derived list (its header, lines 1-3). A new
  non-test source file imported by the worker or the web would change that list, so put the new code in existing
  files: keyed-release.ts, release.ts, execute.ts, impact.ts, triage/execute.ts, report/content.ts. New test files and
  new files under tools/ outside the closure are free. `tools/screening-capacity/*` is a glob (:22), so new files there
  are covered without an edit.
- Any change to these paths makes the screening-capacity gate measure the pull request (screening-capacity.yml
  pull_request plus the changes job). Expect the advisory S4 time warning.
- Log fields are frozen with fields.ts (#42), so use only existing fields.

## 8. DDL

None. The keyed probes use `rule_record_identity`, type reads use `rule_record_by_type`, the new failure code fits
the existing CHECK, and diff.ts's fix uses the identity index. An index on rule_record(release_no, sha256) would be
DDL on rule_record (barred) and is unnecessary. Stored release-diff counts and #8's impact table are Lane A.

## 9. Overlaps with parallel sessions

- co-001/superseded-rerun: likely touches apps/worker/src/price/{rerun,create,execute}.ts and diff.ts. Overlaps 5d
  (FailureCode, execute.ts), 5g (diff.ts) and display.tsx's text maps.
- co-001/ci-deps: the new weekly workflow's pins. publish-content.yml is not touched by #31.
- co-001/db-function-diffs: none, unless its tooling reads plan tests.
- co-001/pr-15b-ledger-payment-terms and co-001/model-eval-gate: none.
