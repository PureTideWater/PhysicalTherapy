export const meta = {
  name: 'lane-b-suite-cap-1a-build',
  description: 'SUITE-CAP-1a bounded reads: reproduce the defects at real size on the base, and build the design part 1a slice by slice in the worktree',
  phases: [
    { title: 'Reproduce', detail: 'the design probes at 100,000 lines on the base (085299bd), in a scratch clone, before any change' },
    { title: 'Build', detail: 'section 13 slices 1 to 5 in order, each builder checking what it touches' },
    { title: 'Check', detail: 'typecheck, lint, the changed tests, the reproduction re-run on the head' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/b8fe4f4f-26ab-5bdd-9556-0e8c28ea8bc8/scratchpad'
const WT = '/home/user/suite-cap-1-bounded-reads'
const DESIGN = '/home/user/ops/designs/suite-cap-1-triage-locks.md'

const RULES = `Context: you work on SUITE-CAP-1a ("bounded reads", no migration) of the PaidWhole build, a Lane B item run for the co-founder. The design is ${DESIGN}: build ONLY its part 1a (decisions D12, D13, D14, D16, D17, D18; sections 2.2, 5.2, 5.3, 5.7's ADR line, 7's CAS-41, 11's 1a file list, 13's 1a slices). Never part 1b (no migration, no line_status_head, no claim_by_superseded index, no heap line, no harness change). The worktree is ${WT} on branch co-001/suite-cap-1-bounded-reads, cut from claude/build-platform at 085299bd (none of 1a's files changed since the design's base e908c21, so its line numbers hold).
Rules for you:
- The four rules that never bend (CLAUDE.md): code computes every number, money is integer cents (bigint), never a float on an amount. Every figure, the report's content, its CSV's bytes, its PDF's HTML and the audit events must be identical before and after. If a 1a step would need a migration, a ledger SQL function change or any non-test change under packages/pricing, STOP that step and say so in your result ("for Lane A").
- Synthetic data only (packages/synth twins, the existing test worlds). No PHI. Log IDs only.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH (default node is 22; the repo needs 24).
- Heavy commands (pnpm install, build, typecheck, lint, any vitest run, test:db, probes at size) run only under the shared lock: flock /tmp/laneb-heavy.lock <command>, one at a time. Database tests: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18). Chromium: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers.
- Long commands: run_in_background and wait for the notification (or a Monitor until-loop); a long foreground sleep is refused.
- Never run git add, commit, push, checkout, reset, stash or rebase in ${WT}: the orchestrator commits. Change only the files your task names (and test files beside them).
- No model name or identifier in any file. Match the surrounding code's comment density, naming and idiom (the codebase writes doc comments in full sentences citing ADRs and decisions; keep that style).
- Improve as you go: an improvement inside your files, do it and say so; outside, list it in your notes.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust it unless the code says otherwise, and continue from where it stopped.`

const RESULT = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string', description: 'what was done, files changed, commands run and their results' },
    stoppedForLaneA: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' }, description: 'proposed improvements, open risks, anything the next slice or the reviewers must know' },
  },
  required: ['done', 'summary', 'stoppedForLaneA', 'notes'],
}

const EXACTNESS = `Exactness points found by the orchestrator while reading the code (each must hold; verify, do not assume):
1. Pattern order (content.ts:633-653 and the sort at :847-849): today the patterns Map is filled in the report's sorted line order, and the final sort (payer, plan, behavior, rate_record_id) can tie between patterns that differ only in mapping_kind or contract_version_id, so a tie keeps first-appearance order in the sorted lines. The fold must keep, per pattern, the sort key of its first line under the report comparator (payer, plan, claim number, line_no, service_line_id: the smallest such key among its lines) and break the final sort's ties by it. Same for any other Map or array whose order today follows the sorted lines: find every one.
2. notActionable (:660-672): per reason, lines and sum of validated_cents over validated lines, in the fixed reasons order, filtered to lines > 0.
3. Cases: actionableNow(caseId) is the lines with that case_id and status 'actionable' (count and sum of variance_cents ?? '0'); inRun is a per-case set of service_line_ids (case_in_run rows); keep both exact.
4. evidence gaps: noWindow and unverified are counts and sums of charge_cents; deadlineRemedy(causes) (find it; the design says it reads membership only) must get an equivalent input; prove it.
5. triage judgedCandidates: candidateLines today builds factsByRelease per call; share one loader across all batches so the release facts are read once per release per triage, not per batch (lineDeadlines stays per batch). candidateLines keeps its signature for its other callers (an optional loader parameter is fine).
6. readWithAudit (packages/db/src/authz/audit.ts:59-88) runs the callback on scope.client and inserts the events: call it per batch with a callback that FETCHes, so the events are the same set, one per row read. Check that a parameterized DECLARE ... CURSOR FOR works through node-postgres (extended protocol); if it does not, use the equivalent the repo allows and say which.
7. The CSV: auditCsv (csv.ts) = header row, then one row per line, joined by CRLF, with a trailing CRLF; zero lines gives the header and CRLF. The arena must produce exactly these bytes, comparing strings with the same code-unit order as compareText (content.ts '<'). Interned payer and plan indexes must be ranked by compareText after all rows are in.
8. generate.ts: gatherReport's return changes (content plus the arena instead of lines); update every caller (unattested-report.db.test.ts among them). Write the CSV from the arena, release it, then auditReconciliation and the PDF, then the PDF write, then the same UPDATE, in the same transaction. documents.write accepts the stream; the stored SHA-256 must be the same as for the whole-string CSV.
9. patientBalanceCases batched: prove lineCorrections' answer for a line does not depend on which other lines are in the same call (lineShares groups by claim); if it does, batch by claim instead of by line, and say so.
10. Memory: after a batch nothing per line survives except the folded figures, the arena (its bytes off heap, its small keys), the inRun sets and the deadline causes needed for the gaps. Name every other per-line holder you find.`

phase('Reproduce')
const reproduce = agent(`${RULES}
Your task: REPRODUCE, at real size and before any change, the defects SUITE-CAP-1a fixes, so the PR can show before and after. ${SAVE('reproduce.md', 'the probe database, commands, timings and results so far')}
Read the design ${DESIGN} sections 1.4, 8.3 and 15 (probes C to G2, T and M). The design's probe files are not available; rebuild the probes yourself.
- Work in a scratch clone of the base, not the worktree: git clone -q /home/user/PhysicalTherapy ${SP}/repro-base && cd there && git checkout -q 085299bd, then pnpm install --frozen-lockfile under the lock.
- Today's trigger takes one advisory lock per line, so at 100,000 lines triage fails 53200 (probe B) before reaching the defects 1a fixes. First reproduce B once on the default cluster (port 5433; a database migrated from empty) through the job code (executeTriage), to record it. Then, for the 1a defects, use a private PostgreSQL 18 cluster (/opt/pg18/bin initdb into ${SP}/pg-repro, port 5493, max_locks_per_transaction = 1024, the same shared_buffers as 5433), as the design's probes did; stop it and remove its data directory at the end.
- Shape (8.3, as price.large.db.test.ts and the release-capacity harness seed it; read tools/release-capacity/scenario.ts and the large db tests to reuse their seeding): practice A with 100,000 SYNTHETIC lines, half MA non-contracted, half under a SYNTHETIC 110% contract with a 365-day window, encrypted synthetic claim numbers; priced by the price job; a 20,000-line practice B priced, triaged and analysed first (the harness shape). Use the smallest release that prices that shape (the large tests' release); the weekly harness's release 900110 (tools/release/scale.ts --shape quarterly, about an hour to load) is not needed for these probes, say so.
- Measure through the job code (executeTriage, then generateAuditReport), each in a child process under node --max-old-space-size=560 (the worker's heap, infra/lib/heap.ts), with Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers):
  a) triage: total time, the actionable advanceStages statement's time (expect quadratic: about 200 s), heap sampled peak and live heap after judging (heapUsed after two gc() with --expose-gc);
  b) the audit report: expect "JavaScript heap out of memory" (probe E); record where;
  c) the patient-balance step's time if reachable (without the claim_by_superseded index, which is 1b's).
- Write the probe as a reusable script under ${SP}/repro/ with a README of exact commands, parameterized by the repository directory, so the Check phase re-runs the same probe on the head (${WT}) and compares.
- All under flock /tmp/laneb-heavy.lock (the probe as one locked command per step). Drop the probe databases at the end, keep the scripts.
Return the before figures exactly, with how to re-run.`, { label: 'reproduce-base', phase: 'Reproduce', schema: RESULT })

phase('Build')
const build = (async () => {
  const s1 = await agent(`${RULES}
${EXACTNESS}
Slice 1 of the design's section 13 (1a): CAS-41.1 FIRST, against today's whole reads, to pin the answers before the code changes; then CAS-41.3's arena test. ${SAVE('build-s1.md', 'files written, what passes')}
- Read CAS-41 in section 7 whole. Write apps/worker/src/triage/batched.db.test.ts and apps/worker/src/report/streamed.db.test.ts. Keep the whole reads as the reference inside the test tree: copy today's gatherReport (and what it needs that will change) into a test-support module (e.g. apps/worker/src/report/test-support/whole-read.ts) verbatim, and use candidateLines(candidateRows(...)) for triage. On the existing CAS fixtures through the jobs (executeTriage, generateAuditReport with a recording PDF renderer, the report's ID and date pinned), and on a generated 10,000-line run through the readers (judgedCandidates, gatherReport) with every case the design lists (several payers and plans, patterns above and below materiality, held, window-passed, per-visit, overpaid, unpriced, content gaps, deadline-unverified with several causes, written-off case lines, a case of another run, claim numbers tying on payer and plan, and patterns tying on payer, plan, behavior and rate record). The generated run's stages, cases and case lines written as the owner, committed in batches of 1,000 (today's trigger). Use existing worlds (apps/worker/src/triage/test-support, report tests, packages/synth) rather than new fixture files.
- Assertions: judgedCandidates equals candidateLines(candidateRows()) in order; the streamed content deep-equals the whole read's; the CSV bytes equal auditCsv(whole read lines); the PDF HTML equal; lineShares and patientBalanceCases equal the filtering versions (kept in the test); audit events the same set, one per row read.
- Since judgedCandidates and the streamed gatherReport do not exist yet, write the tests against the new API names the design gives (they will fail to compile until slices 2 and 3); run the reference half now (e.g. a temporary check that the whole-read reference equals today's gatherReport on the fixtures) so the reference is proven equal to today before slice 3 changes content.ts.
- apps/worker/src/report/csv-arena.test.ts (unit, CAS-41.3) as section 7 says, against the API of 5.3 point 3.
Return what you wrote and what you ran.`, { label: 'build-s1-tests-first', phase: 'Build', schema: RESULT })

  const s2 = await agent(`${RULES}
${EXACTNESS}
Slice 2 (1a): triage, D12 and D13, sections 2.2 defect 1 and 2 and 5.2. Previous slice: ${JSON.stringify(s1)}. ${SAVE('build-s2.md', 'what is changed, what passes')}
- advanceStages (apps/worker/src/triage/execute.ts:326-344) as 5.2 point 1 gives it (LEFT JOIN LATERAL ... ORDER BY s.seq DESC LIMIT 1). Check its plan with EXPLAIN on a database whose empty tables were analysed (reltuples 0) and inside a transaction with uncommitted rows: it must use line_status_by_line.
- judgedCandidates(scope, practiceId, pricingRunId, requestId) beside candidateRows, as 5.2 point 2: the query text moved into one constant both use, a NO SCROLL cursor, FETCH CANDIDATE_BATCH_LINES = 2000, readWithAudit per batch, candidateLines per batch with one shared release-facts loader, CLOSE. triageInScope (:447) and planWaiting (patterns.ts:63-66) call it. Export it where the web reaches the worker (@tp/worker/triage) only if needed.
- Run triage.db.test.ts, deadline.db.test.ts, patterns tests, batched.db.test.ts (the triage half), and the web route tests that reach planWaiting (apps/web/src/lib/routes/triage*), under the lock. Typecheck the worker and web.`, { label: 'build-s2-triage', phase: 'Build', schema: RESULT })

  const s3 = await agent(`${RULES}
${EXACTNESS}
Slice 3 (1a): the report, D14, D17 and D18, then D16; sections 2.2 defects 3 and 4 (the 1a parts) and 5.3 points 1 to 6. Previous slices: ${JSON.stringify([s1, s2])}. ${SAVE('build-s3.md', 'what is changed, what passes')}
- content.ts: gatherReport becomes the fold: runLines' query text into one constant, the report_lines NO SCROLL cursor, FETCH 2000, per batch readWithAudit, lineDeadlines for the batch, today's mapping to ReportLine unchanged (move the mapping into a function both the fold and nothing else uses; the test-support copy is the reference), ReportFigures (5.3 point 2) folded, the CSV row appended to the arena; CLOSE; then the rest on the accumulator. Every exactness point above holds.
- csv-arena.ts (new, 5.3 point 3 and D17): 1 MiB Buffer chunks, typed arrays grown by doubling, the comparator over stored keys, rows() an AsyncIterable<Uint8Array> of header and rows in order, release(). csvRow and csvCell from csv.ts reused, auditCsv kept as the reference.
- generate.ts: the order of 5.3 point 4.
- patientBalanceCases (5.3 point 6) in batches of 2,000 case lines with the two booleans folded per case (casePatientBalance's rule, patient-share.ts:176-182; reuse that function on the folded values if it can be made exact, otherwise prove the fold equals it); the ledger entries read once (ledgerEntries) and passed to lineCorrections through an optional parameter whose default keeps the reconcile screens' calls (apps/web/src/lib/reconciliation/queries.ts:490, apps/web/src/lib/routes/triage.ts:341) unchanged.
- lineShares (patient-share.ts:107-130, D16): group once, by claim (claim-level, no line) and by line, in query order. No ledger table, ledger SQL, matching rule or recovered total changes.
- Run report.db.test.ts, report.test.ts, report-ledger.db.test.ts, unattested-report.db.test.ts, documents tests, streamed.db.test.ts, csv-arena.test.ts, the reconcile tests that reach lineCorrections (payment-terms.db.test.ts and the ledger tests LED-01 to LED-17 that touch patient-share), and the web reconciliation tests, under the lock. Typecheck.`, { label: 'build-s3-report', phase: 'Build', schema: RESULT })

  const s4 = await agent(`${RULES}
Slice 4 (1a): CAS-41.2, bounded memory per line (section 7, CAS-41 point 2), seen FAILING on the base first. Previous slices: ${JSON.stringify([s1, s2, s3])}. ${SAVE('build-s4.md', 'what is written, the base and head measurements')}
- In streamed.db.test.ts and batched.db.test.ts: the same generated shape at 2,000 and 10,000 lines, heapUsed after two gc() calls (find how intake.large.db.test.ts gets gc and arrayBuffers, and whether it runs in a child process; follow its pattern so the measure is not polluted by vitest's other work), sampled every 250 ms while gatherReport runs and again before the CSV is written; at most 400 bytes of heap per added line for the report, the arena's buffers equal the CSV's bytes within one chunk; at most 1,000 bytes per added candidate for judgedCandidates.
- Prove it fails on the base: run the same measurement against today's readers (a scratch copy of the test pointed at the test-support whole read and candidateLines(candidateRows())), record the per-line figures for both, and keep the numbers for the PR. Make the test robust on a GitHub runner (no wall-clock assertion; margins from the measured figures, stated in the test's comment). If the file must join SLOW_FIRST or a large-test pattern in vitest.config.ts, do it and say so.`, { label: 'build-s4-memory', phase: 'Build', schema: RESULT })

  const s5 = await agent(`${RULES}
Slice 5 (1a): documents. Previous slices: ${JSON.stringify([s1, s2, s3, s4])}. ${SAVE('build-s5.md', 'what is written')}
- docs/adr/0083-<slug>.md (new; read docs/adr/0071's shape, including its "The split" section, and a recent ADR's header and status line): sections 2 and 3 of the design as they concern 1a; the rule that a statement over a month's lines looks each line up through an index (the planner cannot count a transaction's own rows); the rule that a job's heap does not hold a month's lines beyond a small, measured per-line holder; "The split" (1a now, 1b after #42 and SS-01) and D21's release order. State plainly that this ADR is shared with SUITE-CAP-1b, which completes its status and adds the lock's section; write only 1a's part. Status: accepted for 1a.
- docs/product/test-matrix.md: the CAS-41 row after CAS-39 (1b adds CAS-40 and CAS-42 later), word for word from section 7's table; packages/synth/src/cases/matrix.ts the same text word for word; packages/synth/src/cases/registry.ts the CAS-41 entry as section 7 gives it, with the test files (read how other none(...) entries list tests, and run the synth tests that check matrix and registry agree).
- tools/screening-capacity/watched-paths.txt: regenerate with its generator (find watched.ts and run it with --write), never by hand.
- Run pnpm verify-content if it reads these, the synth tests, and any docs or ADR check the repo runs (find them in package.json scripts and tools/).`, { label: 'build-s5-docs', phase: 'Build', schema: RESULT })
  return [s1, s2, s3, s4, s5]
})()

const [repro, slices] = await Promise.all([reproduce, build])

phase('Check')
const check = await agent(`${RULES}
Check phase: the build is done (slices: ${JSON.stringify(slices)}). The reproduction on the base: ${JSON.stringify(repro)}. ${SAVE('check.md', 'each check and its result, the after figures')}
1. In ${WT}: pnpm typecheck, pnpm lint, pnpm lint:logs, the worker's and web's unit tests for touched files, and every db test file in apps/worker/src/{triage,report,reconcile} plus the web tests that reach planWaiting and lineCorrections, under the lock. Fix what fails within 1a's files; report the rest.
2. Re-read the whole diff (git -C ${WT} diff and git status for new files) adversarially against the design's part 1a and the exactness points: anything missing, anything of 1b, any figure that could change. Fix what you find.
3. Re-run the reproduction probe on the head (the scripts under ${SP}/repro/, pointed at ${WT}) on the same private-cluster setup, and report the before/after table: triage total and actionable statement time, triage live heap after judging, the report's completion, time, sampled peak and live heap, the patient-balance step, under the 560 heap flag with Chromium. Clean up the probe cluster and databases.
Return the checks and the before/after table.`, { label: 'check-head', phase: 'Check', schema: RESULT })

return { repro, slices, check }