export const meta = {
  name: 'lane-b-ci-mutation-trigger-fix-build',
  description: '#96 P4 fix build: every confirmed review finding fixed as its skeptics refined it, failing first, on the WIP ref; adversarial check per group plus whole diff; repair loop; no PR push',
  phases: [
    { title: 'Build', detail: 'one builder in /home/user/ci-mutation-trigger, one commit per finding, WIP ref pushed as it goes' },
    { title: 'Check', detail: 'three group verifiers plus a whole-diff adversary; repair loop up to 2' },
  ],
}
const PROG = '/home/user/ops/approval-summaries/lane-b-ci-mutation-trigger-wip/progress'
const SUM = '/home/user/ops/approval-summaries'
const LOGS = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/logs/fix'
const WT = '/home/user/ci-mutation-trigger'
const WIP = 'co-001/wip-ci-mutation-trigger'
const FINDINGS = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/tasks/wu05ju7w5.output'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (file, what) => `Save as you go: keep ${PROG}/${file} up to date (${what}). If it exists when you start, an earlier run was interrupted: read it, check git status and log, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the acting Lane B session S3 that owns PR #96, CI follow-up P4, ci-mutation-trigger (branch co-001/ci-mutation-trigger at 50029e64, draft; narrows when the required mutation check runs Stryker; ADR 0066 Part 7, N43–N50; CI-27–CI-29). Its two adversarial reviews and completeness critic are done; every finding was checked by three skeptics. The full results (JSON: result.reviews[].findings[] with verdicts[].refinedFix, and result.critic.findings[]) are in ${FINDINGS}; the review files are ${SUM}/lane-b-ci-mutation-trigger-review-{ci-tooling-security,payment-engine}.md and the critic's notes ${PROG}/critic.md. Status: ${SUM}/lane-b-ci-deps-status.md. Design: /home/user/ops/designs/lane-b-ci/follow-up-p4-mutation-trigger.md.
Confirmed findings to fix (the recommended option; for security the safer): B1 = PE-B1 (blocking: typescript judged inert though Stryker core imports the root's typescript; add it to TEST_TOOLING with the reason, plus the guard over tooling packages' undeclared imports that resolve from the root, as the skeptics refined it, and the ADR 0066 Part 7 note); S1 (control characters in changed paths: printed raw and missed by ** globs; fail closed on such a path and escape what is printed, as refined); S2 and critic C-G2 (fail-closed rules that survive mutation: add a test that kills each named mutant); N1, N2, N3 (as refined; N3's severity split, take the safer); PE-N1 (package Stryker configs' comments); C-G1 (.gitattributes as a global input); C-G3 (description claim: record the corrected wording in your result; the session edits the description); C-G4 (ci.md wording). PE-S1 (#84's new shards in ci.md and runner-minute figures) is NOT done now: it belongs to the base merge after #84 merges; record it as pending.
State: #86 (co-001/ci-images-digest) merges first; this branch's base merge happens later, right before its one push, so do NOT merge the base and do NOT push co-001/ci-mutation-trigger. Work only on the WIP ref ${WIP}.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, stryker, synth) only under flock /tmp/laneb-heavy.lock. Synthetic data only; no PHI; no model name or identifier in any file or commit. Shorten hashes in approval-summaries files to 8 hex and an ellipsis. Never force, never --no-verify, never amend or rebase a pushed commit, never a .gitleaksignore entry; never write through the GitHub connector; never comment, review, approve, edit a PR body, mark ready or merge. Generated files only by their generators (pnpm install --frozen-lockfile; pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm synth --all). No migration. Logs under ${LOGS}/ (mkdir -p). Long commands with run_in_background.`
const COMMIT_TAIL = `Commit messages in the repository's style, one concern per commit, each ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`

phase('Build')
const build = await agent(`${COMMON}

YOUR TASK: build the fixes in ${WT} (on co-001/ci-mutation-trigger at 50029e64; create the WIP ref from it). ${SAVE('fix-build.md', 'each finding done, commit sha, red and green evidence')}
For each finding: write the failing test first and show it red at 50029e64 on its assertion (log ${LOGS}/<id>-red.log), then the fix, green (<id>-green.log). One commit per finding (B1 with its guard may be two). Never loosen an existing rule. Update ADR 0066 Part 7 (a notice or amendment where a rule changes), docs/runbooks/ci.md and, if a test-matrix case's statement changes, docs/product/test-matrix.md and packages/synth (then pnpm synth --all and commit what it writes). After each commit: flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/stryker tools/test (record totals), then git push origin HEAD:refs/heads/${WIP} (fast-forward; the hook runs). At the end, under the lock: pnpm typecheck, pnpm lint, pnpm lint:logs, pnpm exec tsx tools/stryker/affected.ts --event pull_request --base $(git merge-base HEAD origin/claude/build-platform) (record), pnpm actions:check --offline, actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml.
${COMMIT_TAIL}
Return: the WIP head (equal to origin/${WIP}), per finding its commits, a two-line summary and red/green logs, check totals, the corrected description wording for C-G3 and any description changes needed, PE-S1 pending, and proposals outside P4's files.`, { label: 'build', phase: 'Build' })
if (!build || !String(build).trim()) throw new Error('builder returned nothing')

phase('Check')
const VCHK = { type: 'object', properties: { resolved: { type: 'boolean' }, loosened: { type: 'boolean' },
  issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['what', 'where', 'evidence', 'fix', 'severity'] } },
  checked: { type: 'string' } }, required: ['resolved', 'loosened', 'issues', 'checked'] }
const GROUPS = [
  { id: 'G1', what: 'B1/PE-B1 (typescript in TEST_TOOLING and the undeclared-import guard: does the guard actually catch a planted undeclared import, and does it run in CI\'s unit job?), N1, N2, N3 (the runtime and resolution pins).' },
  { id: 'G2', what: 'S1 (control-character paths: fail closed and escaped output; try newline, CR, U+2028/2029, NUL-adjacent and workflow-command payloads), C-G1 (.gitattributes), S2 and C-G2 (re-run each named mutant: every one must now be killed).' },
  { id: 'G3', what: 'documents and wording: ADR 0066 Part 7 changes, ci.md (C-G4), PE-N1 comments, test matrix and synth if changed, and that every document says what the code does.' },
]
let report = String(build)
let checks = []
let pending = GROUPS.map(g => g.id).concat(['whole'])
for (let round = 1; round <= 3; round++) {
  const thunks = GROUPS.filter(g => pending.includes(g.id)).map(g => () => agent(`${COMMON}

ADVERSARIAL VERIFIER, round ${round}, group ${g.id}: ${g.what} Assume the fixes are wrong until shown right. Build report:
${report}
Fresh clone, read only: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/fx-p4-${g.id}-${round}; fetch refs/heads/${WIP}; check out its head; flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile. Prove with commands: each finding's own scenario now fails closed; harmless variants stay as they were; nothing loosened (50029e64's tests all still pass at the head); docs match code. Classify issues blocking / should / nit. Remove the clone. ${SAVE('fix-check-' + g.id + '-' + round + '.md', 'each check and result')}`, { label: `check:${g.id}:${round}`, phase: 'Check', schema: VCHK }))
  if (pending.includes('whole')) thunks.push(() => agent(`${COMMON}

WHOLE-DIFF ADVERSARY, round ${round}. Build report:
${report}
Fresh clone /home/user/fx-p4-whole-${round} (read only; fetch ${WIP}; its head). Read git diff 50029e64..<head> whole. Hunt for regressions, a rule now passing what it refused, over-reach (a harmless change now running every shard for no reason, which costs runner time on every PR: re-run the replay of a few merged PRs through affected() at 50029e64 and at the head, and report any that widened and why), flakiness, and docs disagreeing with code. Also trial-merge the head with origin/co-001/wip-ci-images-digest (git merge-tree) and run tools/test/workflows.test.ts on the merged tree via CI_TREE. Run vitest --project unit tools/stryker tools/test and pnpm typecheck under the lock. Classify issues. Remove the clone. ${SAVE('fix-check-whole-' + round + '.md', 'what was checked and found')}`, { label: `check:whole:${round}`, phase: 'Check', schema: VCHK }))
  const ran = GROUPS.filter(g => pending.includes(g.id)).map(g => g.id).concat(pending.includes('whole') ? ['whole'] : [])
  const raw = await parallel(thunks)
  if (raw.some(r => !r)) throw new Error(`check round ${round}: a verifier returned nothing; resume this run`)
  checks = raw.map((r, i) => ({ id: ran[i], ...r }))
  const bad = checks.filter(c => !c.resolved || c.loosened || c.issues.some(x => x.severity !== 'nit'))
  const nits = checks.flatMap(c => c.issues.filter(x => x.severity === 'nit').map(x => ({ id: c.id, ...x })))
  pending = bad.map(c => c.id)
  if (!bad.length && !nits.length) { log(`check round ${round}: every fix verified`); break }
  if (round === 3) { log(`check round 3: ${bad.length} still open`); break }
  const fix = await agent(`${COMMON}

Verifiers found (round ${round}): ${JSON.stringify({ real: bad, nits }, null, 2)}
In ${WT} at the WIP head (confirm equal to origin/${WIP}), fix each real issue and each correct nit, one commit per concern with red/green evidence; say why for any you judge not real. Re-run the scoped tests and typecheck under the lock; push the WIP ref (fast-forward). Do not merge the base or push the PR branch.
${COMMIT_TAIL}
${SAVE('fix-repair-' + round + '.md', 'each issue and what was done')}
Return the new head and per issue what changed or why not.`, { label: `repair:${round}`, phase: 'Check' })
  if (!fix || !String(fix).trim()) throw new Error(`repair ${round} returned nothing; resume this run`)
  report += `\n\n=== REPAIR ${round} ===\n${fix}`
  if (!bad.length) break
}
return { report, checks }
