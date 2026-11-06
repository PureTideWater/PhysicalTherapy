export const meta = {
  name: 'lane-b-email-lockup-plate-dry',
  description: 'PR #129: sweep until dry (skeptics per finding, completeness critic), checks on any change, then the description re-checked until clean',
  phases: [{ title: 'Sweep' }, { title: 'Checks' }, { title: 'Describe' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9c25266a-dce9-5778-82ff-f48f559f8682/scratchpad'
const WT = '/home/user/email-plate'
const SESSION = 'https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const ENV = 'export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH'
const COMMIT = `commit with a message describing it, a blank line, then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"; push only \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip/email-lockup-plate-s5\` (fast-forward)`
const COMMON = `Rules: synthetic data only; no model name or identifier in any file or PR text (commit attribution trailers are required and fine); never --no-verify, never force, never touch .gitleaksignore; never write files through the GitHub connector; heavy commands under \`flock /tmp/laneb-heavy.lock\` with \`${ENV}\`; e2e needs Postgres 18 (E2E_ADMIN_URL at localhost:5433). Wording per .claude/rules/brand.md and the file's own style. Do NOT push to co-001/email-lockup-plate. SAVE rule: keep your progress file up to date and continue from it if it exists.`
const FIND = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['id', 'file', 'claim'], properties: { id: { type: 'string' }, file: { type: 'string' }, claim: { type: 'string' } } } } } }
const VERDICT = { type: 'object', required: ['refuted', 'reason'], properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } } }
const HANDLED = 'Already found and fixed in earlier rounds (commits c189c4a1, d7a45752, 8a92286e, 80ce3ec0 — read them with git log -p 31c41a9d..HEAD): ADR 0081 inverting-renders wording; BRAND.md 7 padding; packages/brand README 1380w plates; ux-brand-reviewer.md BRAND.md and ADR 0058 line citations; ADR 0058 pointing to 0081; plateHolds wording; lockup heights pinned to the plated PNGs; mail.test.ts comment.'

phase('Sweep')
const seen = new Set()
const confirmed = []
let dry = 0, rounds = 0, changed = false
while (dry < 1 && rounds < 4) {
  rounds++
  const lenses = [
    `the commits since 31c41a9d themselves (git -C ${WT} diff 31c41a9d HEAD): is every edited sentence, citation (file:line, check each lands on the cited text at HEAD) and test true and exact at HEAD; did a fix introduce a new error`,
    `completeness critic over the whole PR (git -C ${WT} diff origin/claude/build-platform...HEAD): any remaining statement anywhere in the repository about the email lockup, plate, its files, sizes, heights, padding, colours, the inverted-client renders, or the reset email's newest-code words that does not match HEAD; any claim no test holds that should be`,
  ]
  const found = (await parallel(lenses.map((l, i) => () => agent(`Read-only adversarial sweep of ${WT} at its current HEAD (PR #129: the email lockup on a White plate, O-5, and the reset email's newest-code line, O-8). Lens: ${l}. ${HANDLED} Also already reported this run: ${JSON.stringify([...seen])}. Report only real, specific defects in what this PR changes or makes wrong, with file and line; pre-existing drift in files this PR does not touch is out of scope. An empty list is a fine answer. No heavy commands. ${COMMON}`, { label: `sweep-${rounds}-${i}`, phase: 'Sweep', schema: FIND })))).filter(Boolean).flatMap(r => r.findings)
  const fresh = found.filter(f => !seen.has(f.file + '|' + f.claim.slice(0, 80)))
  fresh.forEach(f => seen.add(f.file + '|' + f.claim.slice(0, 80)))
  if (!fresh.length) { dry++; log(`sweep round ${rounds}: dry`); continue }
  const judged = (await parallel(fresh.map(f => () => parallel([0, 1].map(k => () => agent(`Try to REFUTE this finding on ${WT} (current HEAD, PR #129). Read the code yourself; default refuted=true if it does not reproduce, is out of scope (pre-existing in a file this PR neither changes nor makes wrong), or is not a defect. Finding in ${f.file}: ${f.claim}. Read-only.`, { label: `skeptic-${rounds}-${f.id}-${k}`, phase: 'Sweep', schema: VERDICT }))).then(vs => ({ f, ok: vs.filter(Boolean).length > 0 && vs.filter(Boolean).every(v => !v.refuted) }))))).filter(Boolean)
  const real = judged.filter(j => j.ok).map(j => j.f)
  log(`sweep round ${rounds}: ${fresh.length} fresh, ${real.length} confirmed`)
  if (!real.length) { dry++; continue }
  confirmed.push(...real); changed = true
  await agent(`On ${WT} (PR #129), fix these confirmed findings, verifying each first; minimal and exact; tests first where behaviour changes. Run the tests that touch what you change. Then ${COMMIT}. ${COMMON} Progress file: ${SP}/progress/dry-fix-${rounds}.md. Return the commit SHA and what changed.`, { label: `fix-${rounds}`, phase: 'Sweep' })
}
if (!dry) log('NOT DRY after 4 rounds')

let checks = null
if (changed) {
  phase('Checks')
  checks = await agent(`On ${WT}, files changed since 80ce3ec0: git diff --name-only 80ce3ec0 HEAD. Run under flock with \`${ENV}\`: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm synth --all then git status --porcelain (empty); and every test touching the changed files (if markup or apps/web/e2e/brand.spec.ts changed: pnpm build, stamp, E2E_PREBUILT=1 playwright test e2e/brand.spec.ts with E2E_ADMIN_URL on Postgres 18 at 5433). A failure caused by this round: fix, ${COMMIT}, re-run. ${COMMON} Progress file: ${SP}/progress/dry-checks.md. Return exact counts.`, { label: 'fast-checks', phase: 'Checks', schema: { type: 'object', required: ['allPassed', 'head', 'results'], properties: { allPassed: { type: 'boolean' }, head: { type: 'string' }, results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } } } } })
  if (!checks || !checks.allPassed) return { confirmed, checks, note: 'checks failed' }
}

phase('Describe')
const facts = `Full suite on 31c41a9d: ${SP}/suite-result.json. Fast checks on 80ce3ec0: typecheck 23 projects; lint 1,861 files 0/0; lint:copy 595; lint:logs 1,171; check:fixtures 342/4,223; synth 318 cases no diff; 29 test files 600 tests touching the changed files; build + stamp; e2e brand.spec.ts 5 passed. This run's sweep findings: ${JSON.stringify(confirmed)}; this run's checks: ${JSON.stringify(checks)}.`
const CHECK = { type: 'object', required: ['errors'], properties: { errors: { type: 'array', items: { type: 'object', required: ['quote', 'problem', 'fix'], properties: { quote: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } } } } } }
if (changed) await agent(`Update the PR #129 description draft ${SP}/pr-body.md for the new commits since 80ce3ec0 (git -C ${WT} log --oneline 80ce3ec0..HEAD) and these facts: ${facts}. Head is now git -C ${WT} rev-parse HEAD. Add each new finding with its resolution to the second review's rows and any new check result. Keep everything else. Do NOT update the PR. ${COMMON}`, { label: 'body-update', phase: 'Describe' })
let round = 0, last = null
while (round < 4) {
  round++
  const errs = (await parallel(['every factual claim about the code, files, paths, numbers, line citations and tokens against HEAD of ' + WT, 'every test result and count against the facts; every section of .github/pull_request_template.md present; no model identifier or PHI; the exact final lines "🤖 Generated with [Claude Code](https://claude.com/claude-code)", blank, "https://claude.ai/code/session_01FcouKRo5iee5QFtPT8UimZ"; under 65,536 characters', 'completeness critic: every commit in git log 231da9c4..HEAD covered, each review finding with its resolution, nothing overstated'].map((lens, i) => () => agent(`Adversarially check the PR description draft at ${SP}/pr-body.md for PR #129 (worktree ${WT}). Lens: ${lens}. Facts: ${facts}. Report only real errors with the quoted text and the fix. Read-only.`, { label: `body-check-${round}-${i}`, phase: 'Describe', schema: CHECK })))).filter(Boolean).flatMap(c => c.errors)
  last = errs
  if (!errs.length) break
  await agent(`Apply these corrections to ${SP}/pr-body.md (PR #129's draft), verifying each against ${WT} first; reject any that is wrong. Corrections: ${JSON.stringify(errs)}`, { label: `body-fix-${round}`, phase: 'Describe' })
}
return { dryReached: dry > 0, rounds, confirmed, checks, bodyRounds: round, bodyClean: !last || !last.length, lastErrors: last }
