export const meta = {
  name: 'lane-b-ci-findings-transport-fix-round',
  description: 'ci-findings-transport fix round: every confirmed finding fixed failing first, one check round with a repair, then the base merge, the full suite once, the §7 proof regenerated, the description drafted, the branch pushed',
  phases: [
    { title: 'Build', detail: 'one builder, one commit per finding, WIP pushed as it goes' },
    { title: 'Check', detail: 'two verifiers (workflow and tests; security and docs) plus a whole-diff adversary; repair loop up to 2' },
    { title: 'Integrate', detail: 'base merge, full suite once, §7 proof, records, description draft, up-to-date check, push co-001/ci-findings-transport' },
  ],
}
const SUM = '/home/user/ops/approval-summaries'
const PROG = `${SUM}/lane-b-ci-findings-transport-wip/progress`
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/cft'
const WT = '/home/user/ci-findings-transport'
const WIP = 'co-001/wip-ci-findings-transport'
const BR = 'co-001/ci-findings-transport'
const REV = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/tasks/w9cnj79ym.output'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (f, w) => `Save as you go: keep ${PROG}/${f} up to date (${w}). If it exists when you start, an earlier run was interrupted: read it, check git status and log, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the acting Lane B session S3 that owns ci-findings-transport (WIP ${WIP} at 1322c7cf, merged with base 30871f72; no PR branch ${BR} yet, no PR). The item moves the content calendar's findings from a job output and env string to the run's own artifact (check uploads findings.json; notify and the pull-request-only handoff job download it with gh run download: three tries with a timeout and a pause, the size refused past MAX_FILE_BYTES 2,000,000; notify's permissions exactly actions: read and issues: write, no uses:, no checkout). Records: ${SUM}/lane-b-ci-findings-transport-status.md, the design /home/user/ops/designs/lane-b-ci/ci-findings-transport.md (§7 the local proof at designs/lane-b-ci/ci-findings-transport/proof/, §16), the build summary ${SUM}/lane-b-ci-findings-transport-build-summary.md, the merge record ${PROG}/merge.md, the reviews ${SUM}/lane-b-ci-findings-transport-review-{ci-infra,security-supply}.md and ${PROG}/critic.md. The full review results with every skeptic's refinedFix are in ${REV} (JSON: result.reviews[].findings[] with verdicts, result.critic.findings[]).
Confirmed findings to fix (the recommended option, security the safer, as the skeptics refined them): ci-infra S1 (should: a test must hold the per-try rm -rf; make the fake gh refuse an existing file as gh 2.89/2.103 does with O_EXCL), ci-infra S2 (should: a test holds the pause between tries), ci-infra N1 (nit: a case at exactly MAX_FILE_BYTES in notify and handoff, and one byte over), security S1 (should: a test fails if the size refusal is removed; the head -c mutant too), security N1 (nit: a failed download must not write the artifact's signed URL into the public run log: keep gh's stderr out of the log or reduce it to a fixed message, safer option, with a test), critic G1 (should: handoff's read check must sit inside the block T-H holds equal to notify's, or T-H must hold it too, so handoff cannot pass a file notify would refuse), critic G3 (should: regenerate the §7 local proof against the download block as it is now, timeout included, with a stall case), critic G2 (nit: a test for the head line's 2>/dev/null || : > findings.json when the artifact holds no findings.json), critic G4 (nit: records name the live base). ci-infra N2 was refuted: leave it.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, builds, test:db, e2e, stryker, synth) only under flock /tmp/laneb-heavy.lock (shared: batch under one hold; long ones with run_in_background). PostgreSQL 18 on 5433 (if down: bash /tmp/setup-container.sh co-001/wip-ci-findings-transport:${WT}). Synthetic data only; no PHI; no model name or identifier in any file or commit. Shorten hashes in approval-summaries and design files to 8 hex and an ellipsis. Never force, never --no-verify, never amend/rebase a pushed commit, never a .gitleaksignore entry; never write through the GitHub connector; never comment, review, approve, open or edit a PR, mark ready or merge. Generated files only by their generators. No migration. Logs under ${SP}/logs/fix/ (mkdir -p).`
const COMMIT_TAIL = `Commit messages in the repository's style, one concern per commit, each ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const VCHK = { type: 'object', properties: { resolved: { type: 'boolean' }, loosened: { type: 'boolean' },
  issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['what', 'where', 'evidence', 'fix', 'severity'] } },
  checked: { type: 'string' } }, required: ['resolved', 'loosened', 'issues', 'checked'] }

phase('Build')
const build = await agent(`${COMMON}

YOUR TASK: the fix round's build in ${WT} (on ${WIP} at 1322c7cf; confirm HEAD = origin/${WIP}). ${SAVE('fix-build.md', 'each finding, commit, red and green evidence')}
For each finding: the failing test or mutant first (red at 1322c7cf, logged ${SP}/logs/fix/<id>-red.log), then the fix (green, <id>-green.log). One commit per finding. Never loosen a rule or #86's value rule; keep T-H holding notify's and handoff's blocks equal. Update ADR 0071's amendment, ci.md and content-updates.md where behaviour changes; regenerate the §7 proof (G3) by its own scripts. After each commit: flock ... pnpm exec vitest run --project unit tools/test tools/content-calendar, then git push origin HEAD:refs/heads/${WIP} (fast-forward; the hook). At the end, under one lock hold: typecheck, lint, lint:logs, the whole workflows.test.ts, actionlint, actions:check --offline. Do not merge the base; do not push ${BR}.
${COMMIT_TAIL}
Return: the WIP head, per finding its commit, a two-line summary and red/green logs, check totals.`, { label: 'build', phase: 'Build' })
if (!build || !String(build).trim()) throw new Error('builder returned nothing')

phase('Check')
const GROUPS = [
  { id: 'K1', what: 'the workflow and its tests: ci-infra S1, S2, N1, security S1, critic G1 and G2. Re-run the reviews\' mutants (rm -rf removed, pause removed, -le to -lt, head -c removed, the size check removed, handoff\'s read check outside the held block): each must now turn a test red. Run the download block against the real gh behaviour where you can.' },
  { id: 'K2', what: 'security N1 (no signed URL or other token-bearing text from gh in the log, on every failure path, with a test), critic G3 (the §7 proof regenerated against the current block, with a stall case, and its outputs match), G4, and that ADR 0071, ADR 0066 N32, ci.md, content-updates.md and reconciliation-001 say what the code does.' },
]
let report = String(build)
let checks = []
let pending = GROUPS.map(g => g.id).concat(['whole'])
for (let round = 1; round <= 3; round++) {
  const thunks = GROUPS.filter(g => pending.includes(g.id)).map(g => () => agent(`${COMMON}

ADVERSARIAL VERIFIER, round ${round}, group ${g.id}: ${g.what} Assume the fixes are wrong until shown right. Build report:
${report}
Fresh clone, read only: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/fx-cft-${g.id}-${round}; fetch ${WIP}; check out its head; install under the lock. Prove each with commands. Classify issues blocking / should / nit. Remove the clone. ${SAVE('fix-check-' + g.id + '-' + round + '.md', 'each check and result')}`, { label: `check:${g.id}:${round}`, phase: 'Check', schema: VCHK }))
  if (pending.includes('whole')) thunks.push(() => agent(`${COMMON}

WHOLE-DIFF ADVERSARY, round ${round}. Build report:
${report}
Fresh clone /home/user/fx-cft-whole-${round} (read only; fetch ${WIP}; its head). Read git diff 1322c7cf..<head> whole and the item's full diff against origin/claude/build-platform. Hunt for regressions, anything of #86's value rule loosened, a fix that breaks the push-run path or the schedule path, flakiness (the stall and pause tests' timing), runtime of the workflow tests, and docs disagreeing with code. Trial-merge with origin/claude/build-platform (git merge-tree) and run workflows.test.ts on the merged tree via CI_TREE. Run vitest --project unit tools/test tools/content-calendar and typecheck under the lock. Classify issues. Remove the clone. ${SAVE('fix-check-whole-' + round + '.md', 'what was checked and found')}`, { label: `check:whole:${round}`, phase: 'Check', schema: VCHK }))
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

YOUR TASK: integrate ci-findings-transport and push ${BR} ONCE. Build and repairs: ${report}
Final checks: ${JSON.stringify(checks)}
${SAVE('fix-integrate.md', 'each step, every check with its numbers, the pushed sha and the time')}
1. In ${WT}: git fetch origin ${WIP} claude/build-platform; confirm HEAD = origin/${WIP}. Merge the base (now c7bed0f7 or later: #117 and anything since) with a merge commit, keeping both sides (rule 6); generators; commit what they write; re-run the whole workflows.test.ts.
2. The full local suite once, on that tree, under the lock, logs in ${SP}/logs/suite/: typecheck; lint; lint:copy; lint:logs; check:fixtures; verify-content; pnpm test (unit with coverage: files, passed, failed, skipped; name each local skip); test:golden; test:oracle; test:db in its four shards one after another on fresh PG18 databases on port 5433; build, stamp, then E2E_PREBUILT=1 pnpm test:e2e --workers=2; tools/stryker/affected.ts against the merged base, then each selected shard and the gate (or record none affected); synth --all leaves status clean; actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; actionlint. Fix anything red this branch causes with a small commit and its test; red on the base too is recorded with the base's evidence (S4 reported a rare route-tests.8 db flake, PricingRunInputError in seedMappedNotPriced, as the base's own bug).
3. Records in /home/user/ops (write, do not commit): append a "## Fix round (2026-11-04)" section to the design (findings, resolutions, commits, the §16.4 sites departure and why), and write ${SUM}/lane-b-ci-findings-transport-fix-round.md (findings table with skeptics' verdicts and resolutions, check rounds and repairs, the full suite with every number, failing-first table, the base merges).
4. Draft the PR description from .github/pull_request_template.md (at the base) to ${SP}/pr-body.md: what changes and why (the defect: FINDINGS_B64 up to 933,336 characters through a job output and an env string, over GitHub's 1 MB and Linux's 131,072; #86's T6 row named it over the limit), the design's choice and its alternatives, what it does not change, the checks (the full suite, failing first, the §7 proof), the reviews and every finding's resolution, what CI must prove on the head (the handoff job's run on this pull request is the first run of record; the merge's push run the second), the founder's approval section, proposals. Under 60,000 characters; no model identifier or PHI; end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Also write the title to ${SP}/pr-title.txt in the repository's PR title style.
5. Right before the push: git fetch origin claude/build-platform; if it is no longer an ancestor of HEAD, merge it again (same form, both sides), run the generators, the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth clean) and the whole workflows.test.ts plus vitest --project unit tools/test tools/content-calendar; record it. Then git push -u origin HEAD:refs/heads/${BR} (a new branch; the hook; never force) and push the WIP ref to the same sha. Record the sha and the time.
${COMMIT_TAIL}
Return: the pushed sha and time, the base merge(s), every suite number, the description and title paths and the description's length, anything open.`, { label: 'integrate', phase: 'Integrate' })
if (!integ || !String(integ).trim()) throw new Error('integrator returned nothing')
return { report, checks, integ }
