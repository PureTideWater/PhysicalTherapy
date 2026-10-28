export const meta = {
  name: 'lane-b-ux-payer-response-build',
  description: 'Build co-001/ux-payer-response (UX PR 10): five builders on the design slices A to E, an integration check, a design-conformance critic and a fixer',
  phases: [{ title: 'Build' }, { title: 'Check' }, { title: 'Critic' }, { title: 'Fix' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const WT = '/home/user/ux-payer-response'
const DESIGN = '/home/user/ops/designs/lane-b-ux-payer-response.md'
const COMMON = `Context: PaidWhole monorepo (CLAUDE.md applies, the four rules that never bend included). You are a builder for a Lane B session building ONE pull request, co-001/ux-payer-response (UX PR 10: the payer's answer and the write-off reason start unchosen; the payer's letter is uploaded inside "Log a payer response"; the route refuses a contradicted reason and checks the letter a response names). The design is ${DESIGN}: read it IN FULL (sections 1 to 9; section 9 "Review and dispositions" overrides earlier text where they differ). Worktree: ${WT} (branch co-001/ux-payer-response at 165c599, which includes #74's ActionForm and shared fields, ADR 0077). Edit only your slice's files; other builders work in the same worktree at the same time; never run git add, commit, stash, checkout or reset; never revert a change you did not make. The orchestrator commits.
Machine rules: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH in every command. One heavy command at a time on this 4-CPU machine: wrap install, build, typecheck, lint, tests, e2e and any browser run in "flock /tmp/laneb-heavy.lock <cmd>", never holding the lock longer than one command. Never a foreground sleep. Chromium 1248 in /opt/pw-browsers (the browser harness from #74: apps/web/src/components/test-support/). PostgreSQL 18 on 5433 (if down: bash /tmp/setup-container.sh co-001/ux-payer-response:${WT}). Synthetic data only; no PHI; no model name or identifier in any file. gitleaks reads a literal key or password in a test as a secret: build such values at run time. No migration; no file of open PR #42 except the three shared documents (test-matrix.md, matrix.ts, registry.ts); no change under packages/pricing, packages/ledger or apps/worker/src/reconcile. Wording exactly as the design's section 6.1 gives it (within .claude/rules/brand.md and CO-11). Match the surrounding code's style and comment density. Improve as you go inside your files; outside them, a proposal.`

const SLICES = [
  { key: 'A', prompt: `Your slice: A, the write-off (design 3.1, with 2.1 to 2.3, 4.3 and the triage e2e of 4.6).` },
  { key: 'B', prompt: `Your slice: B, the uploader and the letter's field (design 3.2, with 2.5.1 to 2.5.8 and 4.4). Slices C and D code against the APIs you build (ResponseLetterFieldProps, the uploader's props, uploadGate): build them exactly as the design fixes them, early, so the others compile.` },
  { key: 'C', prompt: `Your slice: C, the response and the submission, server and page (design 3.3, with 2.1, 2.4, 2.5, 2.6 and the packets and unattested e2e of 4.6). You use slice B's ResponseLetterField and uploadGate as the design fixes them; if B's file is not there yet when you need it, code against the design's API and check again before you finish.` },
  { key: 'D', prompt: `Your slice: D, the contract side (design 3.4, with 2.5.7). NOT_A_RESPONSE_LETTER and refuseResponseLetter behind the document's lock, used by the queries, tagging and the abstraction routes; the contracts page's words.` },
  { key: 'E', prompt: `Your slice: E, the route database tests and the documents (design 3.5, with 4.1, 4.2, 4.5 and 5.1): the workbench-routes.db.test.ts cases (the write-off refusal, the response's letter checks including the lock test with pg_locks, the empty choices refused), ADR 0085 written whole, and CAS-45 to CAS-48 word for word in docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts with their registry entries (then pnpm synth --all under the lock, and the synth unit tests). The route code is slices A, C and D: write your tests against the design, and run them once those files are in (check their progress files ${SP}/progress/pay-build-{A,C,D}.md).` },
]

phase('Build')
const built = await parallel(SLICES.map((s) => () => agent(`${COMMON}\n\n${s.prompt}\nRun under the lock, for your files: pnpm typecheck (other slices may still be in progress: list each remaining error and whose file it is), eslint on your files, and the unit, browser, db and e2e tests your slice owns. ${SAVE('pay-build-' + s.key + '.md', 'each file done, each test run and result, what waits on another slice')}\nReturn: the files changed, the tests and checks with results, anything left undone with the reason, and proposals.`, { label: 'build-' + s.key, phase: 'Build' })))

phase('Check')
const check = await agent(`${COMMON}

You are the integration checker. The builders' results:
${built.map((b, i) => `--- ${SLICES[i].key} ---\n${b || '(missing: read ' + SP + '/progress/pay-build-' + SLICES[i].key + '.md)'}`).join('\n')}
1. git -C ${WT} status and diff: every change belongs to a slice of the design's section 3; no #42 file but the three shared documents; nothing under packages/pricing, packages/ledger, apps/worker/src/reconcile; no migration.
2. The APIs as used match the APIs as built; fix mismatches on the side that departs from the design.
3. Under the lock, one at a time: pnpm install --frozen-lockfile; pnpm exec tsx tools/screening-capacity/watched.ts --write (report any change); pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm synth --all (only the CAS-45 to CAS-48 expected files may be written); the unit tests of apps/web, packages/ui and packages/synth (the browser tests included); the db tests of every route file changed (workbench-routes, submissions, contracts, abstraction, uploads, reconciliation, and the generated route-tests shards that cover the changed routes); then the affected e2e with --workers=2 (triage, packets, unattested, contracts, uploads, reconciliation; your own database name and port; clean up). Fix every failure that is the branch's in the smallest way in the owning file; prove any that also fails on 165c599.
${SAVE('pay-build-check.md', 'each check and result')}
Return: each check with its counts, each failure and its fix, and what is left.`, { label: 'check', phase: 'Check' })

phase('Critic')
const GAPS = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, designRef: { type: 'string' }, gap: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] } }, required: ['where', 'designRef', 'gap', 'severity'] } }, summary: { type: 'string' } }, required: ['gaps', 'summary'] }
const critic = await agent(`${COMMON}

You are a READ-ONLY design-conformance critic (edit nothing). Compare the whole change (git -C ${WT} diff 165c599, plus untracked files) with the design ${DESIGN} sections 1 to 9: every file in a slice table changed as it says; every decision of section 2 built (the unchosen choices and their words, the reasons listed, the route refusals and their field keys so ActionForm names the field, the letter's upload inside the form with its states, the letter check behind the lock, the exclusion from the contract lists, the hint's words); every string of 6.1 exact; every test of section 4 present and asserting what its matrix row says; ADR 0085 matching the decisions. Also trace correctness bugs: a path from a real person or input to a wrong record, a wrong stage, a leaked document across practices, or a lost typed value. The checker's result:\n${check}\n${SAVE('pay-critic.md', 'each gap found')}`, { label: 'critic', phase: 'Critic', schema: GAPS })

let fixed = null
const real = ((critic && critic.gaps) || []).filter((g) => g.severity !== 'nit')
if (real.length) {
  phase('Fix')
  fixed = await agent(`${COMMON}

You are the fixer. The design-conformance critic found these gaps (verify each against the code first; fix the real ones, the nits too where plainly correct; for one you judge not real, say why):
${JSON.stringify(critic.gaps, null, 1)}
Then re-run under the lock: pnpm typecheck, pnpm lint, pnpm lint:copy, the unit and browser tests touched, the db tests of any route touched, and the e2e specs touched (your own database name and port; clean up). ${SAVE('pay-fix.md', 'each gap and what you did')}
Return: each gap fixed or not real (why), and the checks' results.`, { label: 'fix', phase: 'Fix' })
}
return { built, check, critic, fixed }
