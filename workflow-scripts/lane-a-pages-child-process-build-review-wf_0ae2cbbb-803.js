export const meta = {
  name: 'lane-a-pages-child-process-build-review',
  description: 'pages-child-process: design (measure first), build failing first on the WIP ref, then two adversarial reviews (security; correctness and capacity) with three skeptics per finding and a critic',
  phases: [
    { title: 'Design', detail: 'one agent: measure the defect on Node 24, read the code, write the design' },
    { title: 'Build', detail: 'one builder, failing first, WIP pushed as it goes' },
    { title: 'Review', detail: 'security-reviewer; correctness and capacity' },
    { title: 'Verify', detail: 'three skeptics per finding' },
    { title: 'Critic', detail: 'what the reviews missed' },
  ],
}
const SUM = '/home/user/ops/approval-summaries'
const PROG = `${SUM}/lane-a-pages-child-process-wip/progress`
const DESIGN = '/home/user/ops/designs/lane-a-pages-child-process.md'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp'
const WT = '/home/user/pages-child-process'
const WIP = 'co-001/wip-pages-child-process'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (f, w) => `Save as you go: keep ${PROG}/${f} up to date (${w}); mkdir -p it. If it exists when you start, an earlier run was interrupted: read it, check git status and log, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy (CLAUDE.md is in your context: synthetic data only, money rules, tenancy, logging rules). You work for the acting session S3 that owns the item pages-child-process (WIP ref ${WIP}, cut at claude/build-platform 7fb3e102; worktree ${WT}; no PR yet). Status: ${SUM}/lane-a-pages-child-process-status.md.
The defect (latent today): packages/contracts/src/evidence/pages.ts reads an untrusted document (PDF, workbook, CSV) in a worker thread (page-thread.ts) under resourceLimits (PAGE_READ_LIMITS: maxHeapMb 192, young 32, maxMemoryBytes 256 MiB polled, timeout 60 s, page/text/inflate caps). infra/lib/heap.ts (ADR 0071) plans --max-old-space-size=560 on the worker task's command (heapFlag('worker')); a process-wide flag overrides a worker thread's resourceLimits on Node 24 (S2's measurement), so the page thread would get 560 MiB and with the main thread could pass the task's 1,024 MiB. The fix the orchestrator decided: run page extraction in a CHILD PROCESS with its own --max-old-space-size (192 plus headroom, as now), killed and refused on overrun or timeout (process isolation for untrusted input); a test measuring the extractor's heap_size_limit under the task's real command with the planned flag set; a synth-time infra guard (a CDK/infra test) refusing the worker task's heap flag unless untrusted parsers run in child processes; the order recorded in the ADR that owns heap.ts (heap.ts's flag must not ship before this). Every result keeps its current meaning: unsupported_document past any limit (never read in part), document_unreadable when unparseable, PageReadError for the reader's own failure; the scan reader path unchanged; no PHI or document text in logs, errors, argv, env or file names (CLAUDE.md "Never"); the child gets the bytes over stdin or an IPC channel, not a temp file named after anything, and an environment with nothing it does not need (no AWS credentials, no database URL).
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, builds, test:db, e2e, stryker, synth) only under flock /tmp/laneb-heavy.lock (shared with other sessions; batch under one hold; long ones with run_in_background). PostgreSQL 18 on 5433. No model name or identifier in any file or commit. Shorten hashes in approval-summaries and design files to 8 hex and an ellipsis. Never force, never --no-verify, never amend/rebase a pushed commit, never a .gitleaksignore entry; never write through the GitHub connector; never comment, review, approve, open or edit a PR, mark ready or merge. Generated files only by their generators (pnpm install --frozen-lockfile; pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm synth --all). No migration. Any new ADR, test-matrix or synth number: read LANES.md rule 4's counters on claude/build-ops (/home/user/ops/LANES.md) and if a number is needed, write "COUNTER REQUEST: <what>" at the top of the status file and use a placeholder; do not edit LANES.md. Logs under ${SP}/logs/ (mkdir -p).`
const COMMIT_TAIL = `Commit messages in the repository's style (git log), one concern per commit, each ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`

phase('Design')
const design = await agent(`${COMMON}

YOUR TASK: the design, measured first. ${SAVE('design.md', 'each measurement and decision')}
1. In ${WT}, install under the lock (pnpm install --frozen-lockfile). Measure on this machine's Node 24 (/opt/node24): a worker thread's heap_size_limit (v8.getHeapStatistics) with resourceLimits maxOldGenerationSizeMb 192 / maxYoungGenerationSizeMb 32, with and without --max-old-space-size=560 on the parent; then a child process's under --max-old-space-size=<n>. Record exact numbers and the Node version.
2. Read pages.ts, page-thread.ts, resolve.ts, scan.ts and their tests; every caller (apps/worker intake); infra/lib/heap.ts, its tests and the worker task's command in infra (find where heapFlag('worker') is or will be used); ADR 0071's heap part and ADR 0033; the worker's container (Dockerfile: how a child would start: node binary path, the bundled entry, tsx or compiled JS).
3. Write ${DESIGN}: the measured defect; the design (spawn with process.execPath and the right flags, how the child entry is found in the built worker image and in tests, bytes in over stdin or IPC, results back as structured messages, a bounded reply size, the heap flag 192 + young and a stated headroom, RSS polling or a hard kill on maxMemoryBytes, the deadline with SIGKILL, refusing on any overrun as unsupported_document, the env allowlist, no argv or file name carrying document data, cleanup on every path, concurrency: how many children at once); the test plan (failing first): heap_size_limit measured in the child under the task's real command with the planned flag; an overrun document (synthetic, built in the test) refused and the child killed; a timeout; a crashing child as PageReadError; each existing pages test still passing; the infra guard test; the ADR change (which ADR owns heap.ts; record the order: heap.ts's flag must not ship before this); alternatives and why they lose (keep the thread and drop the flag; NODE_OPTIONS per thread; vm isolates); the risks (startup cost per document, measured; the image's entry path).
Return a summary of the measurements and the design's decisions.`, { label: 'design', phase: 'Design' })
if (!design || !String(design).trim()) throw new Error('design returned nothing')

phase('Build')
const build = await agent(`${COMMON}

The design (read ${DESIGN} in full): ${design}
YOUR TASK: build it in ${WT} on ${WIP}. ${SAVE('build.md', 'each commit, red and green evidence')}
1. Red first: commit the tests that show the defect (the heap_size_limit under the planned flag; the overrun, timeout and crash cases; the infra guard) and run them red on the current code with the failure on an assertion, logged ${SP}/logs/red.log.
2. Then the implementation in small commits, each green: the child entry, the parent's spawn and limits, the result mapping, cleanup, the infra guard, documents (the ADR that owns heap.ts with the order; ADR 0033 if its "worker thread" wording changes; docs/runbooks if one describes intake memory; the test matrix and packages/synth if a row is needed, as a COUNTER REQUEST).
3. After each commit: under the lock, vitest for packages/contracts and the affected apps/worker and infra tests; push git push origin HEAD:refs/heads/${WIP} (fast-forward; the hook).
4. At the end, under one lock hold: typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all clean, the whole packages/contracts and infra test projects, and the worker's build if it bundles the entry. Measure the per-document startup cost (child spawn to first reply) and record it.
${COMMIT_TAIL}
Return: the WIP head (= origin/${WIP}), each commit with a two-line summary, red and green evidence, the measured numbers, check totals, any COUNTER REQUEST.`, { label: 'build', phase: 'Build' })
if (!build || !String(build).trim()) throw new Error('builder returned nothing')

const FIND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] }, title: { type: 'string' }, where: { type: 'string' }, scenario: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } },
  required: ['id', 'severity', 'title', 'where', 'scenario', 'evidence', 'fix'] } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit', 'none'] }, reason: { type: 'string' }, refinedFix: { type: 'string' } }, required: ['refuted', 'severity', 'reason', 'refinedFix'] }
const REVIEWERS = [
  { key: 'security', agentType: 'security-reviewer', file: `${SUM}/lane-a-pages-child-process-review-security.md`, lens: `security: untrusted-input process isolation (what the child can reach: env, credentials, network, file system, the parent's IPC; can a hostile document make the child write to the parent's log as workflow or log-injection text, or exceed the reply bound; is every overrun and timeout a kill and a refusal, never a partial read; can a child that ignores SIGTERM linger; zombie or orphan children on the parent's crash; PHI or document text in argv, env, errors, logs or file names; tenancy unaffected)` },
  { key: 'correctness-capacity', agentType: undefined, file: `${SUM}/lane-a-pages-child-process-review-correctness-capacity.md`, lens: `correctness and capacity: every result keeps its meaning (unsupported_document, document_unreadable, PageReadError, the scan path); the heap and memory bounds are real under the task's real command (re-measure heap_size_limit in the child with --max-old-space-size=560 on the parent, and RSS for a worst-case synthetic document); the task's 1,024 MiB holds with the main heap and the child together at the planned concurrency; the per-document startup cost and the intake throughput it costs; the built worker image finds the child entry; the infra guard really refuses the flag without the child (mutate it); the tests prove behaviour (mutate the code: remove the kill, the heap flag, the reply bound, the env allowlist, and see a test go red); flakiness and timing` },
]
phase('Review')
const reviews = await pipeline(REVIEWERS,
  r => agent(`${COMMON}

The build's report: ${build}
You are an ADVERSARIAL REVIEWER of pages-child-process through the lens of ${r.lens}
Fresh clone: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/rv-pcp-${r.key}; fetch ${WIP} and claude/build-platform; check out origin/${WIP}; install under the lock. The change is git diff $(git merge-base HEAD origin/claude/build-platform) HEAD; the design is ${DESIGN}. Prove every finding with a command, a mutated fixture or a scenario you ran; no evidence, no finding. Classify blocking / should / nit. Write your review to ${r.file}. Remove your clone. ${SAVE('review-' + r.key + '.md', 'what you checked, each finding')}`, { label: `review:${r.key}`, phase: 'Review', schema: FIND, ...(r.agentType ? { agentType: r.agentType } : {}) }),
  (rev, r) => {
    if (!rev) throw new Error(`review ${r.key} returned nothing`)
    return parallel(rev.findings.map(f => () => parallel([0, 1, 2].map(k => () => agent(`${COMMON}

You are SKEPTIC ${k + 1} of 3 for one finding of pages-child-process's ${r.key} review. Try to REFUTE it: reproduce it in a fresh clone /home/user/sk-pcp-${r.key}-${f.id}-${k} at origin/${WIP} (read only; remove it after), or show it is not real, not reachable or already handled. Default to refuted=true if you cannot reproduce it. If real, give your severity and the safest correct fix.
Finding: ${JSON.stringify(f)}
${SAVE('skeptic-' + r.key + '-' + f.id + '-' + k + '.md', 'your reproduction and verdict')}`, { label: `skeptic:${r.key}:${f.id}:${k}`, phase: 'Verify', schema: VERDICT })))
      .then(vs => { const ok = vs.filter(Boolean); return { ...f, reviewer: r.key, verdicts: ok, confirmed: ok.filter(v => !v.refuted).length >= 2 } })))
      .then(fs => ({ reviewer: r.key, summary: rev.summary, findings: fs }))
  })
if (reviews.some(r => !r)) throw new Error('a review leg failed; resume this run')
phase('Critic')
const critic = await agent(`${COMMON}

You are the COMPLETENESS CRITIC over pages-child-process's two reviews: ${JSON.stringify(reviews)}
Fresh clone /home/user/rv-pcp-critic at origin/${WIP} (read only; removed after). What was missed: a failure path no one tried (the child's stdout closing early, an IPC message after exit, two documents at once, the parent's own heap with many children), a claim in the design or build report no one checked, a test that stays green under a mutation (try a few), a doc that disagrees with code, the infra guard's reach (does it hold the real task definition), merge hazards with live co-001 heads touching packages/contracts or infra/lib/heap.ts. Prove each gap; classify. ${SAVE('critic.md', 'what you checked, each gap')}`, { label: 'critic', phase: 'Critic', schema: FIND })
return { design, build, reviews, critic }
