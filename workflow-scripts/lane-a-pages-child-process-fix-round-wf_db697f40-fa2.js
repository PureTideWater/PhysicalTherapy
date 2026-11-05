export const meta = {
  name: 'lane-a-pages-child-process-fix-round',
  description: 'pages-child-process fix round: every confirmed finding fixed failing first (the post-done bound, core files, reply bounds, mutants, the infra measurement, the bundle test, ADR hazard), SEC-24; check rounds with repairs; then the base merge, the full suite once, the description, the up-to-date check, the push',
  phases: [
    { title: 'Build', detail: 'one builder, one commit per finding, WIP pushed as it goes' },
    { title: 'Check', detail: 'security verifier, correctness verifier, whole-diff adversary; repair loop up to 2' },
    { title: 'Integrate', detail: 'base merge, full suite once, records, description, up-to-date check, push co-001/pages-child-process' },
  ],
}
const SUM = '/home/user/ops/approval-summaries'
const PROG = `${SUM}/lane-a-pages-child-process-wip/progress`
const DESIGN = '/home/user/ops/designs/lane-a-pages-child-process.md'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/pcp'
const WT = '/home/user/pages-child-process'
const WIP = 'co-001/wip-pages-child-process'
const BR = 'co-001/pages-child-process'
const REV = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/tasks/wig39i3bn.output'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (f, w) => `Save as you go: keep ${PROG}/${f} up to date (${w}). If it exists when you start, an earlier run was interrupted: read it, check git status and log, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy (CLAUDE.md is in your context: synthetic data only; never put PHI or document text in a log, error, file name, argv, env or file on disk). You work for the acting session S3 that owns pages-child-process (WIP ${WIP} at c369bc77, cut at base 7fb3e102; worktree ${WT}; no PR branch ${BR} yet, no PR). The change: packages/contracts/src/evidence/pages.ts reads an untrusted document in a child process (page-reader.ts, dist/page-reader.js) with --max-old-space-size=192 --max-semi-space-size=16, --permission, an empty env, stdin/stdout framing, an RSS poll and a 60 s deadline with SIGKILL, one reader at a time; infra/test/heap.test.ts guards the worker task's heap flag; ADR 0071 and ADR 0033 amended. Read: the status ${SUM}/lane-a-pages-child-process-status.md, the design ${DESIGN}, the build record ${PROG}/build.md, the reviews ${SUM}/lane-a-pages-child-process-review-{security,correctness-capacity}.md and ${PROG}/critic.md. The full review results with every skeptic's refinedFix are in ${REV} (JSON: result.reviews[].findings[] with verdicts, result.critic.findings[]).
Confirmed findings to fix (the recommended option; security and PHI the safer; as the skeptics refined them):
- BLOCKING security S1 = correctness B1: after the child's done or refused frame it is neither timed nor memory-bounded and holds the only reader slot while the parent waits for close: keep the deadline and the memory kill in force until close, and kill the child promptly after its final frame if it does not exit, with tests.
- BLOCKING critic G1 (verify, then fix): a reader killed by V8 OOM or a signal can write a core file holding the document's text into a writable cwd: make the child unable to dump core (e.g. setrlimit RLIMIT_CORE 0 for the child, a cwd it cannot write, and/or the permission model's denial), proved by a test that kills the child with SIGSEGV/SIGABRT and finds no core file. Check the container's core_pattern too.
- correctness S1 (should): tests for both reply bounds; an oversized frame must not crash the worker process.
- correctness S3 and critic G5 (should): kill each surviving mutant the reviews and critic named (including settling on exit instead of close) with a test.
- critic G2 (should): the infra measurement must measure the worker command with heapFlag('worker') as it will ship, not refuse it.
- critic G3 (should): a test that runs the bundled dist/page-reader.js (after the worker build) and fix the wording that claims the weekly real-size test does.
- critic G4 (should): ADR 0071's Status line conflicts with the base and three live co-001 heads: resolve so the base merge stays clean (keep both sides' facts).
- nits: security S2 (orphan backstop during synchronous work), S3 (the module comment says the child can still use the network), S4 and correctness N2 (comments still say thread), N3 (the design's T3 peak-growth assertion).
- correctness S2 and N1 were refuted: leave them.
- SEC-24 (allocated by the orchestrator): replace the placeholder SEC-<n> with SEC-24 in docs/product/test-matrix.md and wherever it appears, and register SEC-24 in packages/synth (cases matrix and registry) with the test that asserts it, as the repository's other SEC rows are registered; run pnpm synth --all and commit what it writes.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, builds, test:db, e2e, stryker, synth) only under flock /tmp/laneb-heavy.lock (shared: batch under one hold; long ones with run_in_background). PostgreSQL 18 on 5433 (if down: bash /tmp/setup-container.sh after fetching it from claude/build-ops, with no branch argument). No model name or identifier in any file or commit. Shorten hashes in approval-summaries and design files to 8 hex and an ellipsis. Never force, never --no-verify, never amend/rebase a pushed commit, never a .gitleaksignore entry; never write through the GitHub connector; never comment, review, approve, open or edit a PR, mark ready or merge. Generated files only by their generators. No migration. Logs under ${SP}/logs/fix/ (mkdir -p).`
const COMMIT_TAIL = `Commit messages in the repository's style, one concern per commit, each ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const VCHK = { type: 'object', properties: { resolved: { type: 'boolean' }, loosened: { type: 'boolean' },
  issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['what', 'where', 'evidence', 'fix', 'severity'] } },
  checked: { type: 'string' } }, required: ['resolved', 'loosened', 'issues', 'checked'] }

phase('Build')
const build = await agent(`${COMMON}

YOUR TASK: the fix round's build in ${WT} (on ${WIP} at c369bc77; confirm HEAD = origin/${WIP}; install under the lock if node_modules is missing). ${SAVE('fix-build.md', 'each finding, commit, red and green evidence')}
For each finding: the failing test or mutant first (red at c369bc77, logged ${SP}/logs/fix/<id>-red.log), then the fix (green, <id>-green.log). One commit per finding. Never loosen a bound. Update the design (append "## Fix round" with each finding, resolution and commit), ADR 0071's and ADR 0033's amendments and comments where behaviour changes. After each commit: under the lock, vitest for packages/contracts, infra and apps/worker intake; push git push origin HEAD:refs/heads/${WIP} (fast-forward; the hook). At the end, under one lock hold: typecheck, lint, lint:copy, lint:logs, check:fixtures, synth --all clean, the worker build and the bundle test. Do not merge the base; do not push ${BR}.
${COMMIT_TAIL}
Return: the WIP head, per finding its commit, a two-line summary and red/green logs, check totals.`, { label: 'build', phase: 'Build' })
if (!build || !String(build).trim()) throw new Error('builder returned nothing')

phase('Check')
const GROUPS = [
  { id: 'K1', what: 'security and PHI: security S1/B1 (the child after its final frame: deadline, memory kill and a prompt kill until close; try a reader that hangs or allocates after done), critic G1 (no core file on SIGSEGV, SIGABRT or V8 OOM, in this container and as the worker image would run it; no document text on disk anywhere), security S2 to S4, the env, argv and permission model unchanged, nothing logged from the child.' },
  { id: 'K2', what: 'correctness and capacity: correctness S1 (both reply bounds, an oversized frame refused without crashing the worker), S3 and G5 (re-run every named mutant: each now killed), G2 (the infra measurement measures the shipped command with heapFlag(worker) and reports 240 MiB), G3 (the bundle test runs dist/page-reader.js), G4 (ADR 0071 merges cleanly with the base and the live co-001 heads: git merge-tree), N2, N3, SEC-24 registered in packages/synth with its test and the test matrix, and every existing pages and intake test still passing.' },
]
let report = String(build)
let checks = []
let pending = GROUPS.map(g => g.id).concat(['whole'])
for (let round = 1; round <= 3; round++) {
  const thunks = GROUPS.filter(g => pending.includes(g.id)).map(g => () => agent(`${COMMON}

ADVERSARIAL VERIFIER, round ${round}, group ${g.id}: ${g.what} Assume the fixes are wrong until shown right. Build report:
${report}
Fresh clone, read only: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/fx-pcp-${g.id}-${round}; fetch ${WIP}; check out its head; install under the lock. Prove each with commands. Classify issues blocking / should / nit. Remove the clone. ${SAVE('fix-check-' + g.id + '-' + round + '.md', 'each check and result')}`, { label: `check:${g.id}:${round}`, phase: 'Check', schema: VCHK }))
  if (pending.includes('whole')) thunks.push(() => agent(`${COMMON}

WHOLE-DIFF ADVERSARY, round ${round}. Build report:
${report}
Fresh clone /home/user/fx-pcp-whole-${round} (read only; fetch ${WIP}; its head). Read git diff c369bc77..<head> whole and the item's full diff against origin/claude/build-platform. Hunt for regressions, a bound loosened, a new way for document text to reach disk or a log, flakiness (timing tests, kill races), runtime of the new tests, and docs disagreeing with code. Trial-merge with origin/claude/build-platform (git merge-tree). Run vitest for packages/contracts, infra and apps/worker intake, and typecheck, under the lock. Classify issues. Remove the clone. ${SAVE('fix-check-whole-' + round + '.md', 'what was checked and found')}`, { label: `check:whole:${round}`, phase: 'Check', schema: VCHK }))
  const ran = GROUPS.filter(g => pending.includes(g.id)).map(g => g.id).concat(pending.includes('whole') ? ['whole'] : [])
  const raw = await parallel(thunks)
  if (raw.some(r => !r)) throw new Error(`check round ${round}: a verifier returned nothing; resume this run`)
  checks = raw.map((r, i) => ({ id: ran[i], ...r }))
  const bad = checks.filter(c => !c.resolved || c.loosened || c.issues.some(x => x.severity !== 'nit'))
  const nits = checks.flatMap(c => c.issues.filter(x => x.severity === 'nit').map(x => ({ id: c.id, ...x })))
  pending = bad.map(c => c.id)
  if (!bad.length && !nits.length) { log(`check round ${round}: every fix verified`); break }
  if (round === 3) { log(`check round 3: ${bad.length} still open; they go to the integrator`); break }
  const fix = await agent(`${COMMON}

Verifiers found (round ${round}): ${JSON.stringify({ real: bad, nits }, null, 2)}
In ${WT} at the WIP head (confirm equal to origin/${WIP}), fix each real issue and each correct nit, one commit per concern with red/green evidence; say why for any you judge not real. Re-run the scoped tests and typecheck under the lock; push the WIP ref (fast-forward). Do not merge the base or push ${BR}.
${COMMIT_TAIL}
${SAVE('fix-repair-' + round + '.md', 'each issue and what was done')}
Return the new head and per issue what changed or why not.`, { label: `repair:${round}`, phase: 'Check' })
  if (!fix || !String(fix).trim()) throw new Error(`repair ${round} returned nothing; resume this run`)
  report += `\n\n=== REPAIR ${round} ===\n${fix}`
  if (!bad.length) break
}

phase('Integrate')
const integ = await agent(`${COMMON}

YOUR TASK: integrate pages-child-process and push ${BR} ONCE. Build and repairs: ${report}
Final checks: ${JSON.stringify(checks)}
${SAVE('fix-integrate.md', 'each step, every check with its numbers, the pushed sha and the time')}
1. In ${WT}: git fetch origin ${WIP} claude/build-platform; confirm HEAD = origin/${WIP}. Merge the base (af3e79f3 or later) with a merge commit, keeping both sides (rule 6); generators; commit what they write.
2. The full local suite once, on that tree, under the lock, logs in ${SP}/logs/suite/: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test (unit with coverage: files, passed, failed, skipped; name each local skip); test:golden; test:oracle; test:db in its four shards one after another on fresh PG18 databases on port 5433; build, stamp, then E2E_PREBUILT=1 pnpm test:e2e --workers=2; tools/stryker/affected.ts against the merged base, then each selected shard and the gate (or record none affected: packages/contracts is not a mutation package unless affected.ts says so); synth --all leaves status clean; actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml; the worker build and its bundle test; infra's tests. Fix anything red this branch causes with a small commit and its test; red on the base too is recorded with the base's evidence.
3. Records in /home/user/ops (write, do not commit): the design's "## Fix round" section completed; ${SUM}/lane-a-pages-child-process-fix-round.md (findings table with skeptics' verdicts and resolutions, check rounds and repairs, the full suite with every number, failing-first table, the base merge).
4. Draft the PR description from .github/pull_request_template.md (at the base) to ${SP}/pr-body.md: what changes and why (the measured defect: the page thread's heap 240 → 608 MiB under the planned flag; a 1,500-page PDF read that today's reader refuses), the design and its alternatives (thread with execArgv refused by Node; NODE_OPTIONS ignored; vm isolates), what it does not change, the checks (the full suite, failing first, the measurements), the reviews and every finding's resolution, the open risk (the child can still reach the network: Node 24 has no network permission; revisit with Node 26 LTS or a parsing task without outbound access), SEC-24, what CI must prove, the founder's approval section, proposals. Under 60,000 characters; no model identifier or PHI; end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Write the title to ${SP}/pr-title.txt in the repository's PR title style.
5. Right before the push: git fetch origin claude/build-platform; if it is no longer an ancestor of HEAD, merge it again (same form, both sides), run the generators and the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth clean) and the vitest projects this branch touches; record it. Then git push -u origin HEAD:refs/heads/${BR} (a new branch; the hook; never force) and push the WIP ref to the same sha. Record the sha and the time.
${COMMIT_TAIL}
Return: the pushed sha and time, the base merge(s), every suite number, the description and title paths and the description's length, anything open.`, { label: 'integrate', phase: 'Integrate' })
if (!integ || !String(integ).trim()) throw new Error('integrator returned nothing')
return { report, checks, integ }
