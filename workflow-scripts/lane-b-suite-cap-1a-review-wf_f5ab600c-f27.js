export const meta = {
  name: 'lane-b-suite-cap-1a-review',
  description: 'SUITE-CAP-1a (#81): two adversarial reviews in fresh clones: the payment-engine checklist (figures, CSV, report unchanged) and correctness, concurrency and capacity',
  phases: [
    { title: 'Review', detail: 'two independent reviewers, each in its own fresh clone at the PR head' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/b8fe4f4f-26ab-5bdd-9556-0e8c28ea8bc8/scratchpad'
const HEAD = 'd3a9a3d72aef450891c742e0106516f23ab6a767'
const DESIGN = '/home/user/ops/designs/suite-cap-1-triage-locks.md'

const RULES = (name) => `Context: you are an adversarial reviewer of PR #81 (PureTideWater/PhysicalTherapy), SUITE-CAP-1a "bounded reads" of the PaidWhole build: triage and the audit report read a month in batches, the report streams. The design is ${DESIGN} (part 1a only: D12, D13, D14, D16, D17, D18, sections 2.2, 5.2, 5.3, 7 CAS-41, 13; part 1b is out of scope). The PR description: gh api repos/PureTideWater/PhysicalTherapy/pulls/81 --jq .body.
Work in a FRESH clone of your own: git clone -q /home/user/PhysicalTherapy ${SP}/review-${name} && cd ${SP}/review-${name} && git fetch -q origin co-001/suite-cap-1-bounded-reads && git checkout -q ${HEAD}; then pnpm install --frozen-lockfile under the lock. The base is 085299bd (git diff 085299bd..${HEAD}).
Rules:
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. Heavy commands (install, typecheck, lint, any vitest run, probes) only under flock /tmp/laneb-heavy.lock, one at a time. Database: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PostgreSQL 18). Long commands with run_in_background.
- Synthetic data only. Never commit, push or comment on GitHub. Never approve or request changes. Change no file outside your clone.
- Be adversarial: try to find a real defect, and prove each finding with a concrete input or a test you ran (a failing test in your clone is the best proof). Rate each: blocking (a wrong figure, a changed byte, a crash, a capacity regression, a security or tenancy gap) or optional (nit, style). Do not report what you could not substantiate; list it under unverified instead.
- ${'Save as you go'}: keep ${SP}/progress/review-${name}.md up to date (what you read, ran and found), and if it exists when you start, continue from it.`

const FINDINGS = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['merge', 'merge after fixes', 'do not merge'] },
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['blocking', 'optional'] },
      file: { type: 'string' }, line: { type: 'number' },
      title: { type: 'string' }, detail: { type: 'string', description: 'the defect, the input or state that triggers it, the proof (test or command and its output)' },
      fix: { type: 'string' },
    }, required: ['severity', 'file', 'line', 'title', 'detail', 'fix'] } },
    unverified: { type: 'array', items: { type: 'string' } },
    checked: { type: 'array', items: { type: 'string' }, description: 'what you checked and found sound' },
  },
  required: ['verdict', 'findings', 'unverified', 'checked'],
}

phase('Review')
const [money, capacity] = await parallel([
  () => agent(`${RULES('money')}
Your lens: the payment-engine reviewer's checklist. Read .claude/agents/payment-engine-reviewer.md whole and apply every item that bears on this diff. The standard here: the report's figures, its CSV (order and bytes), its PDF's HTML, the patient-balance answer and the audit events must be IDENTICAL to the whole read for every input, and code computes every number in integer cents.
Attack especially: apps/worker/src/report/content.ts (the fold, ReportFigures, every running total against the old filter it replaces, the pattern order and its tie-breaking, notActionable keyed by list place, inRun and actionableNow, the evidence gaps and deadlineRemedy's input, the headline), csv-arena.ts (byte equality with csvDocument across chunk boundaries, multi-byte UTF-8 split across a chunk, the comparator against compareText for every key including interned payer/plan ranks, empty report, a row larger than a chunk), generate.ts (the order of writes, the SHA-256 of the streamed CSV, the arena released on every path), patient-share.ts (lineShares grouping order, lineCorrections with entries passed, the default for the web callers, foldPatientBalance against casePatientBalance), and the claim-ordered patientBalanceCases cursor. Check that the test-support reference copies (whole-read.ts, whole-triage.ts) are truly today's code (diff them against 085299bd's content.ts, execute.ts, patient-share.ts) so CAS-41.1 proves what it claims, and that CAS-41.1's generated month exercises each figure with non-zero values (a figure that is zero on both sides proves nothing). Write extra adversarial inputs as tests in your clone if the existing ones miss a case.`, { label: 'review-money', phase: 'Review', schema: FINDINGS }),
  () => agent(`${RULES('capacity')}
Your lens: correctness, concurrency and capacity of the new reads. Attack especially:
- the cursors (triage_candidates, report_lines, report_case_lines): parameterized DECLARE through node-postgres, a cursor left open on an error or early return, two declares of one name in one transaction (the report job runs triage's cursor then its own; the web's withPracticeScope; openCaseOnPattern), cursor_tuple_fraction and the plan chosen for a cursor against the whole query's (EXPLAIN both), a snapshot or visibility difference between FETCHes, readWithAudit per batch;
- advanceStages' LATERAL plan on empty-statistics tables and inside the triage transaction (EXPLAIN on a database whose tables were just analysed empty, with uncommitted rows), and that it writes exactly the same rows as before;
- memory: what survives per line after a batch (the inRun sets, pattern first-line keys, deadline causes, the arena index), the previous batch held during the next FETCH, Chromium printing after the arena is released, the report's patient-balance batches; and CAS-41.2's measurement itself (does it really fail on the base and pass on the head for the right reason; is it robust on a 2-CPU GitHub runner; timeouts; SLOW_FIRST and db-shards.test.ts);
- time: per-batch costs that grow with the month (lineDeadlines per batch, release facts read once, claimLines per batch with the claim order), the Cases page's planWaiting path in the web, and anything that makes a 100,000-line job slower than the base;
- tenancy and PHI: every new query keeps practice_id scoping and readWithAudit; nothing logs or throws an identifier; the arena holds claim numbers only in memory and releases them.
Where useful, run the real-size probe scripts under ${SP}/repro/ (README.md there; under the lock; they take tens of minutes) or a smaller version.`, { label: 'review-capacity', phase: 'Review', schema: FINDINGS }),
])
return { money, capacity }